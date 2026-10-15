# 异常视觉苛刻盲测：水与灯光（A/B/C）— 2026-10-14

评审身份：独立于制作方的盲测评审。只读代码评审，未运行游戏、无截图；
所有判断以代码实际行为为准，不以 `tsc` 通过或“有进步”为通过理由。
正典简报：`docs/anomaly-vfx-brief-2026-10-14.md`（红线 1–6，任一不达标即 FAIL）。

测试入口（简报规定）：`GM.异常('轻度'|'漏水'|'告警'|'严重告警'|'濒危'|'断电'|'掉电')`，离座环视。

## Verdict 汇总表

| 工作流 | 范围 | Verdict | 盲测胜者 | 一句话理由 |
|---|---|---|---|---|
| A 裂缝喷射 | `cabin-seams.ts` + `cabin-seam-water.ts` | **FAIL** | 本游戏一侧更好，但仍像 demo | 体积/颜色/飞溅/湿痕齐了，唯独红线字面要求的“折射感”是假的（自发光 noise 管，无背景折射），管体刚性 baked、粒子是硬圆点，离座近看仍是高级粒子玩具 |
| B 舱底积水 | `cabin-bilge.ts` | **PASS（窄过）** | 本游戏一侧更好，且脱离 demo 感 | 边缘泡沫、波纹、墙脚湿线、水下散射、离座可读的“长起来”六项齐了；反射/油膜缺失只记 hardening，不构成红线字面 FAIL |
| C 断电/掉电/告警灯 | `cabin-three.ts`（灯光段）+ `power-dropout.ts` + `damage-alarm.ts` + `cabin-emergency-lights.ts` | **FAIL** | 本游戏一侧更好，但仍像 demo | 恢复是平滑调光器 fade、无灯管击发延迟感；告警呼吸是数学完美 LFO；最重一条：舷窗主视口在掉电深部仍是 `rgba(0,0,0,.94)` 整屏一刀切，直接撞红线 3；玻璃应力裂纹住在 D 工作流，C 域内红线 4 后半无覆盖 |

通过标准重申：赢下与廉价玩具的并排是**必要非充分**条件；赢了但仍像 demo，照样 FAIL（A、C 即此情形）。

---

## 工作流 A：裂缝喷射 — FAIL

### 对照红线逐项

- 红线 1（体积、折射感、暗青绿、落点飞溅、湿痕）：4/5。体积（core+sheath 双层管 + 雾锥）、暗青绿（`deep 0.025,0.19,0.18 / body 0.10,0.39,0.36`，非白非霓虹）、落点飞溅（128 spray + 72 splash + crown 锥 + ripple 环 + puddle）、湿痕（rivulet alphaMap streak + 5s 浸入/22s 干出）都有。**折射感没有**：`makeJetMaterial` 是纯自发光 `ShaderMaterial`，`rim` 项只是按视角调亮的假高光，不折射、不透射背后舱壁；真正带 `transmission` 的只有 crown/puddle 两个小件。红线写的是“折射感”，不是“高光感”。— **FAIL 项**。
- 红线 6（盲测必须选本游戏）：与“细白虚线 + 霓虹圆点”玩具并排，当前暗青绿双层绳 + 落点 crown/ripple/puddle 明显更好。**本游戏一侧更好，盲测胜，但按规则不救 FAIL。**

### 为什么仍像 demo（离座 0.5–1.1m 近看必穿帮的三处）

1. `streamGeometry` 一次 baked 的刚性抛物线管（56 段、半径恒定 .021/.043），逐帧只滚 `uTime`/`uPulse`。高压水射流应有的抖动、缩颈、断裂全无，侧视是一根实心荧光棒。
2. spray/mist/splash 全是 `gl_PointCoord` 硬圆点（`body = 1-smoothstep(.28,.50,r)`），尺寸钳制 2–17px。暗舱背景下 236 个同步循环的圆点 = 高级粒子玩具的典型签名；与雾锥 shader 的 billow 体积感不在一个图层。
3. `crackTexture` 是贴在墙面 z=.004 的平面黑线（两次描边 + 9 根分叉），无视差、无边缘湿晕、无随压力扩展；`SEAM_REACH=1.1` 允许贴脸看，贴脸即穿帮成贴纸。

### 给制作方的具体改法（只动 A 域文件，不碰数值/逻辑）

1. `src/pod/view/cabin-seam-water.ts` — 给 jet 加真折射：把 `JET_FS` 改为对背景做屏幕空间扭曲采样（或退一步：把 `jetSheath` 换成 `MeshPhysicalMaterial{transmission:.6, thickness:.05, roughness:.15}` + 保留 noise 做 alpha 调制），让舱壁灯光透过水柱变形。验收：离座侧视能看到水柱后铆钉/肋骨错位，而非均匀自发光。
2. `src/pod/view/cabin-seams.ts` — 管体逐帧呼吸：在 `update` 里按 `pulse` 缩放 `jetCore/jetSheath.scale.x/z`（±12%）并叠加高频抖动（`sin(time*47+slot)` ±4%），再让 `STREAM_PUSH` 随 `pulse` ±6% 摆动。验收：射流落点前后扫动，不再是激光笔。
3. `src/pod/view/cabin-seam-water.ts` — 杀掉硬圆点：`DROP_FS` 把 `body` 边缘改成不规则 alpha（noise 侵蚀边缘 + 纵向拉伸已有 `p.y*=.72`，再加随 `vSeed` 的旋转撕裂），大水滴加拖尾（`gl_PointCoord` 纵向梯度 alpha）。验收：暂停单帧看不到正圆。
4. `src/pod/view/cabin-seams.ts` — 裂缝立体化：crack 平面加第二层 `wetStainTexture` 光晕片（additive、低 opacity、比裂缝大 1.6 倍）+ `streak` 顶部加深色边缘线；或把 crack 换成两片微错位平面做视差。验收：贴脸看裂缝有“湿进去”的深度，而非画上去的线。

---

## 工作流 B：舱底积水 — PASS（窄过）

### 对照红线逐项

- 红线 2（从地板“长”起来 + 边缘泡沫 + 波纹 + 墙脚湿线 + 水下散射 + 离座环视立刻可读）：六项全有。`bilgeSurfaceY` 把 flood 0.04 即抬到约 0.145m（踝部），`shown` 指数 ease 让水面 visibly 爬肋骨；foam 四条 + `foamMap` 滚动；surface 28×48 顶点波 + `normalMap` 双向滚动；wetWalls（整圈湿带随水位升）+ wetLines（additive 亮线压水线）；3 层 additive scatter + `caustic` 点光（0.42+flood×1.15+波动）做水下散射。`run.flood>0.008||seams` 即显示，漏水早期不缺席。— **PASS**。
- 红线 6（盲测）：与“整块半透明平面”玩具并排，泡沫边 + 爬墙湿带 + 水下散射 + 压暖光（`cabin-three.ts`  flood 压 `lamp` 55%/65%）明显更好。**本游戏一侧更好，且在离座环视距离（眼高 1.36m 看 0.1–0.4m 水面）已脱离 demo 感。** 判定 PASS 的理由是红线字面项全齐且可读，不是因为“有进步”。

### 窄过警告（下轮复测任一坐实即翻 FAIL，不算新要求，算本次保留意见）

1. 注释承认“故意不用 transmission”（`cabin-bilge.ts` surfMat 一带），水面因此无真反射；深舱弱环境光下深青绿 + emissive 能蒙混过关，但手电/应急红扫过时水面不会有镜面拖尾。Hardening：在 surface 上加一层窄高光带 mesh（随 `caustic`/`emergency` 强度调 opacity 的 additive 条带），不动 transmission 决定。
2. `foamTexture` 是 256×48 同一条带 `repeat.x=5` 四边复用 + 90 个随机圆点，贴近看四边泡沫是同一花纹。Hardening：给四条 foam 各自 offset/镜像（`foamMap.clone()` + 不同 `offset.x` 相位），90 个点不够就加到 160 个并打碎线性渐变。
3. 3 层 scatter 是整块径向渐变大卡片垂直堆叠（`position.y=0.012+depth*(.22+i*.25)`），眼位低时可能看出切片。Hardening：把 scatter 缩到水面下 60% 面积 + 随 depth 降 opacity 上限（当前 `.055+min(.1,depth*.16)` 在深水偏浓）。

### 给制作方的具体改法（B 域内）

1. `src/pod/view/cabin-bilge.ts` — foam 去重铺：四条 foam 用 clone 后的独立纹理相位（`mesh.material.alphaMap.offset.x = i*.37` 需先 clone texture），圆点数 90→160。
2. `src/pod/view/cabin-bilge.ts` — scatter 收束：`PlaneGeometry(BILGE_WIDTH*.92, …)` → `*.62`，opacity 系数 depth 项 `*.16` → `*.10`，避免深水雾卡。
3. `src/pod/view/cabin-bilge.ts` — 可读性保险：`surfaceMaterial.opacity` 下限 `.70` 保持，但 `color.setHSL` 亮度项 `flood*.08` 改为与 `emergency` 联动的微升（水下红洗时水面不死黑），纯视觉联动，不读不写 sim。

---

## 工作流 C：断电/掉电/告警灯 — FAIL

### 对照红线逐项

- 红线 3（不是纯黑一刀切；残晖、仪表微光、应急红、灯管延迟恢复）：3D 舱内部分 3.5/4（`power-dropout.ts` 有 afterglow→dark→recovery 三相、instrument floor blackout .075/dropout .12、emergency 红 .92、双 bank 恢复），**但有两个硬伤**：
  - **整屏一刀切真实存在**：`src/pod/view/stations.ts` 观察窗绘制中 `if(dropoutActive()){ fillStyle='rgba(0,0,0,.94)'; fillRect }`（约第 838 行）。`dropoutActive()` 即 `deepDark`，正是掉电最深部——玩家主视口（舷窗/光学口，画面占比最大的那块）被 .94 黑 slab 盖住，等于在最关键的视口执行了红线明令禁止的一刀切。3D 舱内残晖做得再好，主视口全黑即全局 FAIL。— **FAIL 项（最重）**。
  - **“灯管延迟”是假延迟**：recovery 只是两条 smoothstep（`first .24/.58`、`second .58/.70`）的平滑调光 fade，总时长 1.35s，无荧光灯击发该有的抖动/ strike-fail/ 分段闪稳。示波器式的完美曲线 = 调光器 demo，不是灯管。— **FAIL 项**。
- 红线 4（红灯呼吸有物理感；玻璃应力裂纹随 hull 加重、不是贴纸）：前半半过，后半在 C 域内缺席。
  - 呼吸：`damageAlarm` hz .46/.32 的余弦 LFO（`pulse*pulse*(3-2pulse)` easing），`CabinEmergencyLights` 三灯权重 [.86,1,.72] + bounce drift sine。慢、不爆闪是对的，但它是数学完美周期信号，无电压 sag 随机、无灯具热惯性差、无 fixtures 间相位漂移，久看即“呼吸灯 demo”。— **FAIL 项（物理感不足）**。
  - 玻璃裂纹：`drawGlassStress` 住在 `src/pod/view/stations.ts`（D 工作流领地），C 域四个文件里**零行**玻璃裂纹代码。按文件所有权表，C 工作流独立评审时红线 4 后半无覆盖。— **FAIL 项（覆盖缺失，须升级 D 或调整所有权，不能由 C 冒认）**。
- 红线 6（盲测 vs 纯黑闪屏）：3D 舱内 afterglow + 仪表 floor + 独立应急红回路明显好于纯黑闪。**本游戏一侧更好，盲测胜，但主视口 .94 黑 + 调光器恢复仍像 demo，不救 FAIL。**

### 顺带发现（C 评审连带，不计入 Verdict 但制作方必须看）

- `cabin-three.ts` 洪水压光是全局乘子（`lamp *=1-drown*.55`，normalLights `*.65`），水漫时暖光直接抽走 55–65%，没有色温转冷/三灯位差异，属于粗暴 dim。建议改成分灯权重压暗 + 色温向应急红/冷青偏移（纯灯光参数，不动 sim）。
- `impact` 撞击闪（`lamp *=.35+.65|sin(t*29)|`）与掉电恢复叠加时可能出现高频闪，虽不在红线内，恐怖向作品应避免可诱发不适的 20Hz+ 全屏调制，建议钳制。

### 给制作方的具体改法（文件 + 手段，YES 在 C 域，NO 越界）

1. `src/pod/view/stations.ts`（需编排器裁定：此改归 D 或特批 C 联动）— 杀掉主视口一刀切：删除/替换 `dropoutActive()` 的 `.94` 黑 slab，改为与 3D 舱同源的 `dropoutVisual()` 驱动：残晖（上一帧画面做指数衰减拖尾 .16s）+ 仪表微光（readouts/标尺以 `instruments` floor 重绘）+ 应急红 wash（`emergency` 强度 screen 混合）。验收：掉电深部仍能辨认舷窗外深渊微光与仪表剪影，无一帧全黑。
2. `src/pod/view/power-dropout.ts` — 真灯管恢复：recovery 段加 strike 序列——`warm` 改为 `banks × flicker(t)`，`flicker` 用 hash 抖动（3–5 次 30–80ms 通断 + 一次失败回落），两 bank 间隔拉到 .45s 以上，总时长 1.35s→2.2s。`instruments` 先回（已有 .48s，保留），暖管后回。验收：恢复过程肉眼可数出“打了两次才着”。
3. `src/pod/view/damage-alarm.ts` + `src/pod/view/cabin-emergency-lights.ts` — 呼吸物理化：`pulse` 叠加 Perlin-ish  wander（`sin(t*.31)+sin(t*.17+1.3)` normalized ±15%）+ per-fixture 热惯性（一阶低通，不同时间常数 .3/.5/.8s）；bounce 强度与 `bilge.shown` 联动（水面越高反射越强，读 `bilgeSurfaceY` 类纯视觉量）。验收：盯 20 秒看不出循环点。
4. 红线 4 后半 — 二选一，编排器定夺：(a) 把 `drawGlassStress` 的 hull 驱动裂纹扩展判给 D 工作流补“随加重” Under-review（当前 `damage=(.78-hull)/.66` 只有透明度/数量阶跃感，需加裂纹长度/分叉数随 hull 连续生长 + 修复后消退动画）；(b) 在 C 域新建 `cabin-emergency-lights.ts` 已有文件内加 3D 舱玻璃/舷窗框应力微裂纹发光边（随 `alarm.level` 扩展），与 2D canvas 裂纹互补。**不允许**：C 报告里写“玻璃裂纹已覆盖”。

---

## 方法与边界声明

- 本评审只读了：简报 + `cabin-seams.ts`、`cabin-seam-water.ts`、`cabin-bilge.ts`、`cabin-emergency-lights.ts`、`power-dropout.ts`、`damage-alarm.ts`、`cabin-three.ts` 灯光/掉电调用段，外加为核实红线 4/红线 3 全屏行为而 grep 的 `stations.ts::drawGlassStress` 与 `dropoutActive()` 黑 slab（一处引用，不越界修改）。
- 未改任何游戏代码；未跑 `/loop`、未截图（代码盲测）。恢复真机截图盲测后，B 的 PASS 需复核泡沫 tiling 与低眼位 scatter 切片两项保留意见。
- 下轮复测标准：A 必须拿出真折射证据（扭曲采样或 transmission）；C 必须拿掉主视口 .94 黑 + 灯管 strike；B 若修完 hardening 即可转稳 PASS。
