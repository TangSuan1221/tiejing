/**
 * 怪物视频提示词词典的条目形状。正文字段（look / move / scale）是送进视频模型的英文，
 * 其余字段只用于抽取、构图和校验，不直接拼进提示词。
 */
export type DangerTier = 1 | 2 | 3;

export interface LexiconEntry {
  /** 稳定键。改名即换物种，已缓存的片子会失效 */
  readonly id: string;
  readonly zh: string;
  /** 英文名。一级为真实俗名，二三级为本作命名 */
  readonly name: string;
  /** 一级必填：真实学名 */
  readonly sci?: string;
  /** 二三级必填：解剖所依据的真实深海类群，保证它看上去是海洋生物 */
  readonly base?: string;
  /** 最长轴体长，米。用于画面占比 */
  readonly length: number;
  /** 侧面体高/体宽，米。用于画面占比 */
  readonly height: number;
  /** 一级：真实栖息深度（米，约数）；二三级不填 */
  readonly depth?: readonly [number, number];
  /** 观感压迫度 1–5。越深越优先抽高值 */
  readonly dread: 1 | 2 | 3 | 4 | 5;
  /** 可见解剖，英文 */
  readonly look: string;
  /** 水中运动方式，英文 */
  readonly move: string;
  /** 三级必填：巨物恐惧的尺度参照，英文 */
  readonly scale?: string;
}

/** 曝光时相机与目标的实测光学关系 */
export interface LensView {
  /** 目标中心到相机的距离，米 */
  readonly distance: number;
  /** 垂直视场角，度 */
  readonly fovDeg: number;
  /** 画幅宽高比 */
  readonly aspect: number;
  /** 探照灯是否开着 */
  readonly lamp: boolean;
  /** 目标中心的 NDC 坐标 [-1,1]；未知时为 null */
  readonly screen?: readonly [number, number] | null;
}
