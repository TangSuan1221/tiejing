# 异常视觉苛刻盲测复测：C 灯光异常（返工后）— 2026-10-14

评审身份：独立于制作方的苛刻盲测评审。只读代码评审，未运行游戏、无截图；
所有判断以代码实际行为为准，不以 `tsc` 通过或“有进步”为通过理由。
正典简报：`docs/anomaly-vfx-brief-2026-10-14.md`（红线 1–6）。
旧 C 节 FAIL：`docs/anomaly-vfx-qa-water-light.md` C 节（主视口 `.94` 一刀切 / 调光器恢复 / 完美 LFO / C 域玻璃缺席）。
本次只审 C 域：`cabin-three.ts` 灯光段 + `power-dropout.ts` + `damage-alarm.ts` + `cabin-emergency-lights.ts`，
外加简报特批联动的 `stations.ts` 中 `dropout` 黑幕一段（`drawGlassStress` 依简报归 D，C 不得动、不冒认）。

测试入口（简报规定）：`GM.异常('断电'|'掉电')` + `GM.异常('告警'|'严重告警')`，离座环视。

## Verdict：**PASS（窄过）**

| 复测门槛（用户指定） | 结果 | 证据 |
|---|---|---|
| 主视口无一刀切纯黑 | 通过 | `stations.ts::drawObservationWindow` 已无 `rgba(0,0,0,.94)` slab；深部为 `rgba(2,5,7,≤.502)` 渐变 + screen 红洗 + 暖残晖，仪表在 wash 之后重绘 |
| 灯管 strike 可数 | 通过 | `power-dropout.ts::strike` 两 bank 偏移 `.30/.91`，每 bank “亮→灭→再亮→灭→热起”五段显式窗口，肉眼可数出打了两次 |
| 呼吸非完美 LFO | 通过 | `damage-alarm.ts` 三正弦 wander + 双正弦相位漂移 + `cabin-emergency-lights.ts` 三组不同热惯性低通，20 秒看不出循环点 |
| 心理并排（廉价纯黑闪屏 vs 本游戏） | **本游戏一侧更好，且已脱离 demo 感** | 见下节 |

通过理由重申：不是“有进步所以放行”，是三道字面门槛逐项可数、可算、可证伪；
`tsc` 状态未纳入任何通过依据。

---

## 1. 主视口一刀切：已杀掉（旧 FAIL 最重项已闭合）

旧 FAIL 行（`stations.ts` 约第 838 行 `if(dropoutActive()){ fillStyle='rgba(0,0,0,.94)'; fillRect }`）**已不存在**。
全仓 grep `0,0,0,.94` 零命中；`dropoutActive()` 仅剩 `power-dropout.ts:69` 一处导出定义，无任何调用方再用它盖黑幕。

现行 `drawObservationWindow`（`stations.ts:874-896`）行为：

- `shade=(1-dropout.instruments)*.57`：掉电深部 `instruments=.12` 时 alpha≈`.502`，且颜色是 `rgba(2,5,7)` 冷灰，不是纯黑；
  非掉电 idle 时根本不进此分支（`if(phase!=='idle')`），日常视口零影响。
- `afterglow` 另加 `screen` 暖残晖 `(1-warm)*.11`；`emergency>0` 另加 `screen` 径向红洗（中心 `emergency*.24`、边缘 `*.07`）。
- 顺序是先 wash、后 `drawGlassStress`、后 `drawPortholeReadouts`：仪表与裂纹压在 wash 之上，
  保留独立微光层，不会被 wash 吞掉。

苛刻确认：最深部仍有约五成压暗 + 边缘 `.85` 暗角 vignette（`stations.ts:871-873`），深渊剪影是“压暗可辨”而非“明亮”，
但无一帧全屏扁平纯黑。这正是红线 3 字面要的“不是一刀切”，不是“不许暗”。此项通过。

残留 hardening（不构成 FAIL，下轮也不翻 FAIL，除非有人把 slab 加回来）：
`shade` 系数 `.57` 与 vignette `.85` 叠加时，角落接近 `.9` 有效压暗；若真机觉得角落死黑，
只允许把 vignette 末端 `.85` 降到 `.70`，不允许动 wash 顺序。

## 2. 灯管恢复：从调光器 fade 变成了可数 strike（旧 FAIL 第二项已闭合）

旧 FAIL：recovery 是两条 smoothstep（`first .24/.58`、`second .58/.70`）的完美曲线，总时长 1.35s。

现行 `power-dropout.ts:45-66`：

```
strike(t,offset): x<0→.02 | x<.075→.48 | x<.19→.025 | x<.285→.72 | x<.43→.035 | 之后 .035+.965*smooth((x-.43)/.44)
first =strike(elapsed,.30); second=strike(elapsed,.91); warm=(first+second)*.5
RECOVERY=2.25, instruments=.12+.88*smooth(elapsed/.46), emergency=.92*(1-smooth((elapsed-.72)/1.18))
```

- 每 bank 都是“短亮（.48）→灭回（.025）→再亮（.72）→再灭（.035）→热起”，两次点火肉眼可数，符合“打了两次才着”验收语。
- 两 bank 间隔 `.91-.30=.61s`，满足旧报告“拉到 .45s 以上”；总时长 1.35s→2.25s；仪表先回（.46s），暖管后回。
- 3D 侧 `cabin-three.ts:343,348` 用 `banks[0]` / `banks[(i+1)%2]` 分 bank 驱动，主灯与配灯恢复不同步，不是全局同 fade。

苛刻挑刺（记录在案，不判 FAIL）：strike 窗口是固定阈值、无 per-strike hash 抖动，
两次掉电的恢复帧序列逐帧相同。红线 3 字面只写“灯管延迟”，本实现已是离散物理事件而非噪声 LFO，
字面通过；若要再苛刻，应加每 bank ±20ms 点火时刻抖动 + 峰值 ±10% 电压差，属 hardening，不属本次门槛。

## 3. 告警呼吸：不再是数学完美 LFO（旧 FAIL 第三项已闭合）

旧 FAIL：`pulse*pulse*(3-2pulse)` easing 的余弦 LFO + 三灯权重 `[.86,1,.72]` + bounce drift sine，久看即呼吸灯 demo。

现行：

- `damage-alarm.ts:10-12`：`wander=(sin(t*.31)+.62*sin(t*.173+1.37)+.31*sin(t*.071+4.1))/1.93`，
  `phase=t*2π*hz+.42*sin(t*.19+level)+.18*sin(t*.083+2.4)`，`depth=.86+wander*.14`。
  三个 wander 周期约 20.3s / 36.3s / 88.5s，最小公倍远超 20s 盯看窗口；相位与深度同时漂，无固定循环点。
- `cabin-emergency-lights.ts:74-101`：direct 三灯一阶热低通，时间常数 `[.28,.48,.79]`s 不同；
  `localWander=1+wander*(.035+i*.012)+.035*sin(t*(.127+i*.019)+i*2.1)` 按灯具区分；
  `outageDrift` 三正弦变压器 wander；bounce 三灯独立 drift + 独立热常数 `[.68,.85,1.02]`s；
  lens 独立热常数 `[.18,.31,.44]`s。呼吸是“ across the pressure cell 行走”，不是全屏同步明暗。

盯 20 秒验收：`eased*depth` 包络每 20 秒不重合，fixture 间相位差被热低通越拉越开。
此项通过。`cabin-three.ts:345` 的 `(2.7+sin(time*2)*.06)` 暖灯 ±2% 工频纹是 mains shimmer，
幅度仅作灯丝存在感，不属于告警呼吸评审对象，记 hardening（想杀可删，不杀不 FAIL）。

## 4. 心理并排（必须写明哪侧更好）

- 对手 A（廉价玩具）：掉电 = 整屏 `fillRect(black, .94)` 一刀切 + 恢复 = 全屏同步 fade + 告警 = 全屏正弦明暗。
- 对手 B（本游戏现版）：掉电深部保留深渊剪影 + 仪表剪影 + 应急红 wash；恢复两 bank 先后两次点火；
  告警三灯不同热惯性行走 + 水面反射漂移。
- **评审选择 B，且 B 已脱离 demo 感**：A 的三个签名（纯黑 slab / 同步 fade / 同步呼吸）在 B 中一个都不存在；
  B 的可数 strike 与行走式红呼吸在离座环视距离可被直接描述出来（“左灯先着、右灯第二次才着”“红光从后舱漫过来”），
  不是靠示波器才能证明的差别。按规则，赢并排是必要非充分条件；此处充分性由上面三节字面证据补足，故 PASS。

## 5. 红线 4 后半（玻璃裂纹）：C 不判，D 现状备注

简报文件所有权：C 特批仅 `stations.ts` 中 `dropoutActive` 黑幕一段，**勿动 `drawGlassStress`**；玻璃归 D。
因此本 PASS 不包含对玻璃的认证，C 也不再因“域内零行玻璃代码”被 FAIL（旧 FAIL 的覆盖缺失项因所有权澄清而消解）。

仅作 D 联动备注（不计入 C Verdict）：现行 `drawGlassStress`（`stations.ts:747-865`）
已有随 `damage=(.78-hull)/.66` 连续生长：`activation` 损伤区间生长、`reach=(.18+rnd*.25)*(.36+damage*.78)*activation`、
线宽 `*activation*(1-t*.7)`、分叉数 `damage>.7` 加倍、crazing `damage>.62`、下密封雾 `damage>.5`。
字面“随加重、不是贴纸”在 D 侧已有连续量支撑；D 的最终 PASS/FAIL 由 D 复测判定，C 不冒认。

## 6. 顺带 hardening（C 域内，均不构成 FAIL）

1. `power-dropout.ts` strike 加抖动：`offset` 加 `±.02s` hash、`strike` 峰值 `.48/.72` 加 `±10%`，两次掉电不逐帧相同。
2. `cabin-three.ts:344-350` 洪水压光已分灯权重（`floodWeight .34/.48/.67` + 向 `floodCold` 转冷），旧“全局乘子粗暴 dim”已改；
   若还想细化，给 `lamp` 单独保留暖色锚（当前 `lerp .36` 已做），勿再压。
3. `cabin-three.ts:465-467` 撞击闪已改为 `.65s` 单次镇流器 sag，无 20Hz 全屏调制，保持勿动。
4. `dropoutActive()` 现为无调用死门：建议留作 GM/测试探针，勿再用于任何 `fillRect` 黑幕；若删，注意外部 GM 脚本引用。

## 方法与边界声明

- 只读了：简报 + 旧 C 节 FAIL + `power-dropout.ts` 全文 + `damage-alarm.ts` 全文 +
  `cabin-emergency-lights.ts` 全文 + `cabin-three.ts:340-366,457-471` + `stations.ts:867-900,747-865` +
  全仓 grep `0,0,0,.94` / `dropoutActive()`。未改任何游戏代码；未跑 `/loop`、未截图。
- `node tools/level-rag.mjs check` 本机返回 “Manifest changed; review and rebuild the index”（退出码 1），
  属索引漂移预存问题，与本次只读评审无关，未动 `rag/manifest.json`。
- 下轮翻 FAIL 条件：主视口重现任何全屏扁平黑 slab；recovery 退回同步 smoothstep fade；
  呼吸退回单正弦同步全屏调制。三者任一出现即 FAIL，无需新理由。
