/**
 * 视频生成客户端。
 * ============================================================================
 * 这是整个仓库里**唯一**一个会发网络请求的文件，也是唯一一个有「延迟」概念的
 * 文件。它被刻意隔在这里，好让 sim/ 那一层继续是一个可以在无头环境里跑完
 * 一整条航线的纯状态机（见 sim/run.ts 的 footageSink）。
 *
 * 三步：提交 videos → 轮询 videos/status → 取片 videos/content。
 * 每次生成计费，所以调用方必须缓存（见 view/footage.ts），而且默认是关着的
 * （见下面的 VIDEO_ENABLED）。
 *
 * ## 两条通道，同一份提交体（H3 与造化端接入指引）
 *
 *   A. 造化桥 —— 游戏跑在造化宿主的 iframe 里（`play-*` 或含 `zaohua` 的域名）。
 *      通过 postMessage `VAG_AI_REQUEST` 请宿主用登录用户的 Cookie 代发。
 *      游戏不持有任何密钥，不写代理地址；桥失败不回退到 B。
 *   B. 本地代理 —— 其他一切环境（vite dev、桌面发行包的 server.mjs）。
 *      浏览器请求 `/api/video/*`，由 node 侧注入密钥后转发。key 不进 js 产物。
 */

import {lockVideoCamera} from '../content/fixed-camera';

/** B 通道的入口。它等价于上游的 /v1 */
const API_BASE = (import.meta.env.VITE_VIDEO_API_BASE as string | undefined) ?? '/api/video';
/** 直连调试用的 key。留空就不发 Authorization 头，由代理去补；造化桥里一律丢弃 */
const API_KEY = (import.meta.env.VITE_VIDEO_KEY as string | undefined) ?? '';
const MODEL = 'minimax-h3-max';

/**
 * 功能总开关，默认**关**。
 *
 * 一次拍摄就计费一次，而这是一个会被反复按的按钮。默认关掉意味着：
 * clone 下来直接 `npm run dev` 的人玩到的仍然是一个零依赖、零素材、
 * 完全离线的游戏（摄像头回落到程序化画面），不会有人因为好奇按了几十下
 * 就把额度烧掉。要开就在 `.env.local` 里写 `VITE_VIDEO_ENABLED=1`。
 */
export const VIDEO_ENABLED = /^(1|true|yes)$/i.test(
  (import.meta.env.VITE_VIDEO_ENABLED as string | undefined) ?? '',
);

/** Web 包、在 iframe 里、域名是造化的，三者同时成立才走桥 */
function useZaohuaVideoBridge(): boolean {
  if (typeof window === 'undefined' || !window.parent || window.parent === window) return false;
  const host = String(window.location?.hostname || '').trim().toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return false;
  if (host.endsWith('.local')) return false;
  return host.startsWith('play-') || host.includes('zaohua');
}

const BRIDGE = useZaohuaVideoBridge();

/** 首次轮询前先等这么久。生成实测约 9 秒，早问纯属浪费；桥上按指引 10 秒一问 */
const FIRST_POLL_DELAY = BRIDGE ? 10000 : 6000;
const POLL_INTERVAL = BRIDGE ? 10000 : 2500;
/** 整个流程的上限。sim 那边给了 100 秒，这里留一点余量先自己超时 */
const TOTAL_TIMEOUT = 88000;
/** 单次桥请求等宿主回话的上限。宿主不回（版本过旧、被拦）时不能永远挂着 */
const BRIDGE_REPLY_TIMEOUT = 60000;
const MAX_PROMPT_CHARS = 7000;
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const SHAPE_MARKERS = ['not supported', 'unsupported', 'only supports', 'invalid_request_error'];
const TASK_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type VideoFailure =
  /** 没开开关，或者压根没配 */
  | { kind: 'disabled' }
  /** 提交就被拒了。401 = 未登录或 key 不对，400 = 请求体不对 */
  | { kind: 'submit'; status: number; detail: string }
  /**
   * 上游的内容审核把片子拦了。
   *
   * 这不是假想的失败：实拍时「七个溺死的人手挽着手、嘴都开着」那一段
   * 直接被驳回（`status: "failed"`，`error.message: "output new_sensitive"`），
   * 而且**失败照样计费**。本作是恐怖游戏，这一类拒绝会长期存在，
   * 所以它值得一个单独的分支 —— 调用方会拿一份不含怪物的提示词重试。
   */
  | { kind: 'filtered'; detail: string }
  /** 上游说生成失败 */
  | { kind: 'generate'; detail: string }
  /** 我们自己等不下去了 */
  | { kind: 'timeout' }
  /** 请求直接炸了：断网、代理没起来、宿主没回话 */
  | { kind: 'network'; detail: string };

/** 上游的审核拒绝措辞不统一，只能按关键词认 */
function isFilterRejection(detail: string): boolean {
  return /sensitive|content[_ ]?(policy|filter)|moderation|violat|prohibited|risk/i.test(detail);
}

export type VideoResult =
  | { ok: true; blob: Blob; videoId: string }
  | { ok: false; fail: VideoFailure };

/** 上游返回的 job 对象。只列我们真的会读的字段 */
interface VideoJob {
  id?: string;
  status?: string;
  error?: { message?: string } | string | null;
}

type VideoPath = 'videos' | 'videos/status' | 'videos/content';

/** 两条通道统一的回执。status 为 0 表示根本没拿到 HTTP 回应 */
interface Reply {
  ok: boolean;
  status: number;
  json?: unknown;
  bytes?: ArrayBuffer;
  contentType?: string;
  error: string;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });

// ── A. 造化桥 ────────────────────────────────────────────────────────────

const pending = new Map<string, (payload: Record<string, unknown>) => void>();

if (BRIDGE) {
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window.parent || e.data?.type !== 'VAG_AI_RESPONSE') return;
    const p = (e.data.payload ?? {}) as Record<string, unknown>;
    const cb = pending.get(String(p.requestId));
    if (!cb) return;
    pending.delete(String(p.requestId));
    cb(p);
  });
}

function asArrayBuffer(body: unknown): ArrayBuffer | undefined {
  if (body instanceof ArrayBuffer) return body;
  if (ArrayBuffer.isView(body)) return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return undefined;
}

function bridgeRequest(path: VideoPath, extra: { body?: unknown; taskId?: string }, signal?: AbortSignal): Promise<Reply> {
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ ok: false, status: 0, error: '造化宿主没有回应视频请求' });
    }, BRIDGE_REPLY_TIMEOUT);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
    pending.set(requestId, (p) => {
      clearTimeout(timer);
      const error = p.error == null || p.error === '' ? '' : typeof p.error === 'string' ? p.error : JSON.stringify(p.error);
      const bytes = asArrayBuffer(p.body);
      let json: unknown = bytes ? undefined : p.body;
      if (typeof json === 'string') { try { json = JSON.parse(json); } catch { /* 保留原文 */ } }
      resolve({
        ok: p.ok === true,
        status: Number(p.status) || (p.ok === true ? 200 : 0),
        json,
        bytes,
        contentType: typeof p.contentType === 'string' ? p.contentType : undefined,
        error,
      });
    });
    window.parent.postMessage({ type: 'VAG_AI_REQUEST', payload: { requestId, path, ...extra } }, '*');
  });
}

// ── B. 本地代理 ──────────────────────────────────────────────────────────

async function proxyRequest(path: VideoPath, extra: { body?: unknown; taskId?: string }, signal?: AbortSignal): Promise<Reply> {
  const url = path === 'videos'
    ? `${API_BASE}/videos`
    : `${API_BASE}/videos/${encodeURIComponent(extra.taskId ?? '')}${path === 'videos/content' ? '/content' : ''}`;
  const headers: Record<string, string> = { 'custom-llm-provider': 'minimax' };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
  const init: RequestInit = { method: path === 'videos' ? 'POST' : 'GET', headers, signal };
  if (path === 'videos') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(extra.body);
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { ok: false, status: 0, error: String(e) };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let error = text || `HTTP ${res.status}`;
    try { error = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? error; } catch { /* 非 JSON */ }
    return { ok: false, status: res.status, error };
  }
  if (path === 'videos/content') {
    return { ok: true, status: res.status, bytes: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'video/mp4', error: '' };
  }
  return { ok: true, status: res.status, json: await res.json().catch(() => undefined), error: '' };
}

const transport = BRIDGE ? bridgeRequest : proxyRequest;

/** 暂时性失败按 min(3 秒 × 第几次, 30 秒) 退避，最多 3 次；登录、参数、宿主不支持都不重试 */
async function call(path: VideoPath, extra: { body?: unknown; taskId?: string }, signal?: AbortSignal, deadline = Infinity): Promise<Reply> {
  for (let attempt = 0; ; attempt++) {
    const reply = await transport(path, extra, signal);
    if (reply.ok) return reply;
    if (/Unsupported AI path/i.test(reply.error)) return reply;
    if (path === 'videos' && refusesPayloadShape(reply.error)) return reply;
    const transient = RETRY_STATUSES.has(reply.status) || (!BRIDGE && reply.status === 0);
    const wait = Math.min(3000 * (attempt + 1), 30000);
    if (!transient || attempt >= MAX_RETRIES || Date.now() + wait > deadline) return reply;
    await sleep(wait, signal);
  }
}

function refusesPayloadShape(errorText: string): boolean {
  const text = errorText.toLowerCase();
  return SHAPE_MARKERS.some((m) => text.includes(m));
}

function describe(reply: Reply): string {
  if (/Unsupported AI path/i.test(reply.error)) return '当前造化宿主版本不支持视频生成，请在造化主站网页版打开游戏';
  if (BRIDGE && reply.status === 401) return '未登录造化，请先登录后再冲洗录像';
  return reply.error || `HTTP ${reply.status}`;
}

function failFrom(reply: Reply): VideoFailure {
  if (reply.status === 0) return { kind: 'network', detail: describe(reply) };
  return { kind: 'generate', detail: describe(reply) };
}

// ── 提交体 ──────────────────────────────────────────────────────────────

/** 上次成功的提交契约。形状被拒时才换下一种 */
let contractIndex = 0;

/**
 * 参考帧是不含怪物的空场景时不传尾帧：首尾都是空场景会逼模型让怪物入画再出画，
 * 拍成“从镜头前游过”。其余镜头尾帧仍用首帧，帮助锁定机位。
 */
export function usesEndFrame(prompt: string): boolean {
  return !prompt.includes('ENVIRONMENT_ONLY_REFERENCE:');
}

export function buildBody(prompt: string, duration: number, frame: string, contract: number): Record<string, unknown> {
  const body: Record<string, unknown> = { model: MODEL, prompt, duration, seconds: duration, generate_audio: false };
  if (!frame) {
    body.size = '480p';
    return body;
  }
  body.ratio = 'adaptive';
  const end = usesEndFrame(prompt);
  if (contract === 0) {
    body.content = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: frame }, role: 'first_frame' },
      ...(end ? [{ type: 'image_url', image_url: { url: frame }, role: 'last_frame' }] : []),
    ];
  } else if (contract === 1) {
    body.first_frame_image = frame;
    if (end) body.last_frame_image = frame;
  } else {
    body.input_reference = { image_url: frame };
    if (end) body.image_end = frame;
  }
  return body;
}

/**
 * 生成怪物镜头的环境参考帧在提交前压暗、降饱和并叠一层深蓝浑水：模型会沿用参考图的亮度，
 * 只靠提示词压不住偏亮的游戏截图（2026-10-13 用户出片反馈）。剧情镜头要逐帧沿用首帧，不调色。
 */
export const REFERENCE_GRADE = { filter: 'brightness(0.5) contrast(0.85) saturate(0.55)', murk: 'rgba(4, 12, 24, 0.38)' } as const;

/** 首帧压成最长边 ≤ 1920 的 JPEG（质量 82）。原始 PNG 做成 data URI 体积大到像提交失败 */
async function toJpegFrame(dataUri: string, grade = false): Promise<string> {
  const img = new Image();
  img.src = dataUri;
  await img.decode();
  const scale = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Keyframe canvas unavailable');
  if (grade) ctx.filter = REFERENCE_GRADE.filter;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (grade) {
    // 不支持 ctx.filter 的浏览器只剩这层浑水，仍能压暗
    ctx.filter = 'none';
    ctx.fillStyle = REFERENCE_GRADE.murk;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL('image/jpeg', 0.82);
}

function jobError(job: VideoJob): string {
  if (!job.error) return '';
  return typeof job.error === 'string' ? job.error : job.error.message ?? '';
}

/**
 * 真正提交给接口的提示词正文：固定相机约束 + 参考图用法前缀。
 * GM 无视频模式复制出去的也必须是这一份，否则外部渠道测到的不是游戏会发的内容。
 */
export function finalVideoPrompt(prompt: string, withReference: boolean): string {
  prompt = lockVideoCamera(prompt);
  if (!withReference) return prompt;
  return (prompt.includes('ENVIRONMENT_ONLY_REFERENCE:')
    ? 'Dark, murky deep-sea ROV footage: dim blue-black water, soft scattered light, nothing brightly lit. Use the attached image as an environment and camera reference, not an exact opening frame. Add only the described generated creatures; preserve the architecture and camera, but relight it as LIGHTING describes. '
    : 'Use the attached image as the exact opening frame. Preserve its camera position, framing, architecture and lighting. Animate underwater particles and the described events without changing location. ') + prompt;
}

export const VIDEO_PROMPT_LIMIT = MAX_PROMPT_CHARS;

/**
 * 生成一段视频，拿到 mp4 的 Blob。
 *
 * 这个函数只会 reject 在 AbortError 上；其他一切失败都走返回值，
 * 因为调用方（view/footage.ts）对每一种失败都有一句对应的游戏内台词，
 * 而 try/catch 里区分不出「key 不对」和「断网」。
 */
export async function requestVideo(prompt: string, signal?: AbortSignal, keyframe?: string, progress?: (status: string) => void, duration:5|10=5): Promise<VideoResult> {
  if (!VIDEO_ENABLED) return { ok: false, fail: { kind: 'disabled' } };

  const deadline = Date.now() + TOTAL_TIMEOUT;

  let frame = '';
  if (keyframe) {
    if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(keyframe)) {
      return { ok: false, fail: { kind: 'submit', status: 400, detail: 'Invalid shutter keyframe' } };
    }
    try {
      frame = await toJpegFrame(keyframe, !usesEndFrame(prompt));
    } catch (e) {
      return { ok: false, fail: { kind: 'submit', status: 400, detail: `首帧无法编码：${String(e)}` } };
    }
  }
  prompt = finalVideoPrompt(prompt, !!frame);
  if (prompt.length > MAX_PROMPT_CHARS) {
    return { ok: false, fail: { kind: 'submit', status: 400, detail: `prompt must not exceed 7000 characters (${prompt.length})` } };
  }

  // ── 1. 提交。形状被拒时按 content[] → first_frame_image → input_reference 换契约 ──
  let job: VideoJob | undefined;
  for (let contract = contractIndex; contract <= 2; contract++) {
    const reply = await call('videos', { body: buildBody(prompt, duration, frame, contract) }, signal, deadline);
    if (reply.ok) {
      contractIndex = contract;
      job = (reply.json ?? {}) as VideoJob;
      break;
    }
    if (frame && contract < 2 && refusesPayloadShape(reply.error)) continue;
    if (isFilterRejection(reply.error)) return { ok: false, fail: { kind: 'filtered', detail: reply.error } };
    if (reply.status === 0) return { ok: false, fail: { kind: 'network', detail: describe(reply) } };
    return { ok: false, fail: { kind: 'submit', status: reply.status, detail: describe(reply) } };
  }
  if (!job) return { ok: false, fail: { kind: 'submit', status: 400, detail: '三种提交契约都被上游拒绝' } };

  const taskId = job.id;
  if (!taskId || !TASK_ID.test(taskId)) {
    return { ok: false, fail: { kind: 'generate', detail: `响应里没有有效的任务 id（长度 ${String(taskId ?? '').length}）` } };
  }
  progress?.('任务已受理 · 排队 / 生成中');

  // ── 2. 轮询 ────────────────────────────────────────────────────────────
  await sleep(FIRST_POLL_DELAY, signal);
  for (;;) {
    if (Date.now() > deadline) return { ok: false, fail: { kind: 'timeout' } };
    const reply = await call('videos/status', { taskId }, signal, deadline);
    if (!reply.ok) return { ok: false, fail: failFrom(reply) };
    job = (reply.json ?? {}) as VideoJob;
    const status = String(job.status ?? '').toLowerCase();
    if (status === 'completed' || status === 'succeeded' || status === 'ready') break;
    if (status === 'failed' || status === 'error' || status === 'cancelled' || jobError(job)) {
      const detail = jobError(job) || `status=${status}`;
      return { ok: false, fail: { kind: isFilterRejection(detail) ? 'filtered' : 'generate', detail } };
    }
    progress?.('远端生成中 · 请等待');
    await sleep(POLL_INTERVAL, signal);
  }
  progress?.('生成完成 · 下载视频');

  // ── 3. 取片。只走 videos/content，状态里即使带 url 也不自己下 ─────────────
  return fetchVideoContent(taskId, signal);
}

/**
 * 只把已经生成好的片子取回来。
 *
 * 用于 sessionStorage 命中的情况：刷新页面之后 blob 没了，但 job id 还在，
 * 而取片是免费的。这是「同一个站点不要反复生成」的第二道防线 ——
 * 第一道是内存缓存，它挡不住 F5。
 */
export async function fetchVideoContent(videoId: string, signal?: AbortSignal): Promise<VideoResult> {
  if (!VIDEO_ENABLED) return { ok: false, fail: { kind: 'disabled' } };
  if (!TASK_ID.test(videoId)) return { ok: false, fail: { kind: 'generate', detail: '任务 id 格式无效' } };
  const reply = await call('videos/content', { taskId: videoId }, signal);
  if (!reply.ok) return { ok: false, fail: failFrom(reply) };
  if (!reply.bytes || reply.bytes.byteLength < 1024) {
    return { ok: false, fail: { kind: 'generate', detail: `片子只有 ${reply.bytes?.byteLength ?? 0} 字节` } };
  }
  return { ok: true, blob: new Blob([reply.bytes], { type: reply.contentType || 'video/mp4' }), videoId };
}

/**
 * 把技术失败翻译成舱里那个人会说的话。
 *
 * 玩家不该看见 HTTP 状态码。这个映射表存在的唯一理由是：
 * 一个失败的请求必须读起来像一卷废掉的胶片，而不是像一个 bug。
 */
export function failureLine(fail: VideoFailure): string {
  switch (fail.kind) {
    case 'disabled':
      return '冲洗槽是空的。药水在 KYRIE-9 上，而 KYRIE-9 已经不在了。';
    case 'submit':
      return fail.status === 401
        ? '冲洗机认不出这卷片子的编号。它不是这条船上的东西。'
        : '快门和冲洗槽之间那根线接不上。这一卷废了。';
    case 'filtered':
      // 审核驳回在世界观里就是「有一段被人剪掉了」。这比任何报错都合适。
      return '片子中间少了一截。切口很整齐 —— 是被人剪掉的，不是烧掉的。';
    case 'generate':
      return '片子冲坏了。显影一半的时候整卷起了雾。';
    case 'timeout':
      return '冲洗槽转了很久。你把它打开的时候，里面还是一卷黑的。';
    case 'network':
      return '信号中断。冲洗槽那头没人接。';
  }
}
