# 异常视觉苛刻盲测复测：A 裂缝喷射 — 2026-10-14（二次返工后覆盖）

评审身份：独立于制作方的苛刻盲测评审。只读代码评审，未运行游戏、无截图；
所有判断以代码实际行为为准，不以 `tsc` 通过或“有进步”为通过理由。
正典简报：`docs/anomaly-vfx-brief-2026-10-14.md`（红线 1–6，任一不达标即 FAIL）。
前轮 FAIL 基线：`docs/anomaly-vfx-qa-water-light.md` A 节 + 本文件上一版 FAIL 评审（旧 A 节四条改法为本轮复测标准）。
本轮实测对象：`src/pod/view/cabin-seams.ts` + `src/pod/view/cabin-seam-water.ts` 现版（二次返工后）。

测试入口（简报规定）：`GM.异常('漏水'|'严重告警'|'濒危')`，离座环视 0.5–1.1m 近看。

## Verdict：PASS

| 工作流 | 范围 | Verdict | 盲测胜者 | 一句话理由 |
|---|---|---|---|---|
| A 裂缝喷射复测 | `cabin-seams.ts` + `cabin-seam-water.ts` | **PASS** | 本游戏一侧更好，且四门槛逐项可数 | core/sheath 双层真透射、管体行波缩颈+偶发断裂归零、200 滴速度对齐实例四边形无正圆、六裂缝分种子暗色湿浸；旧 FAIL 四点已在代码机制上消除，非“有进步”放行 |

通过标准重申：赢下与廉价玩具的并排是**必要非充分**条件；本轮 PASS 不是因为“赢了”，而是因为下述四门槛逐项在代码中可数、可算、无硬圆/复用/自发光主体残留。`tsc` 通过未计入任何一项。残留风险见末节，不构成 FAIL，但下轮实机仍须验证暗舱对比度。

---

## 心理并排（必须写明哪侧更好）

假想并排：左侧 = 廉价玩具（细白虚线射流 + 霓虹圆点飞溅 + 墙面黑线无湿痕），右侧 = 本游戏现版（暗青绿双层透射管 + 行波抖动管体 + 交叉四边形速度拉伸水滴 + crown/ripple/puddle 落点组 + 暗色湿浸裂缝组）。

本评审选**右侧（本游戏一侧）更好**：暗青绿吸收（core `0x063532/.19`、sheath `0x0b4a46/.48`）不再是白霓虹；落点有 crown 膨胀 + ripple 扩散 + puddle 铺展；墙面有 5s 浸入 / 22s 干出的湿痕记忆（`WET_IN=5, DRY_OUT=22`）；管体侧视有行波起伏与偶发断股；暂停无一正圆。玩具侧在第一秒即被淘汰。

按规则，盲测胜不自动等于 PASS。本轮 PASS 的理由在下一节四门槛逐项，不在并排胜负。

---

## 复测四门槛逐项（极苛刻，只认代码机制）

### 门槛 1）core 遮住 sheath 后仍有真折射/扭曲可读：PASS

- 视觉主体不再是自发光管。`cabin-seams.ts:105-106` `jetCore/jetSheath` 均用 `makeRefractiveJetMaterial('core'/'sheath')`；旧 `JET_FS` / `makeJetMaterial` 已成死码，不再挂载到任何裂缝管体。前轮 FAIL 语“遮 sheath 即露馅（core 是实心荧光棒）”在本轮代码中已不存在。
- core 自身即透射体：`cabin-seam-water.ts:136-151` core `transmission:.58, thickness:.13, ior:1.333, attenuation 0x063532/.19, roughness:.09`；sheath `transmission:.82, thickness:.065, attenuation 0x0b4a46/.48, roughness:.17`。遮住 sheath，core 仍走 three 透射通道采样背景 + Beer–Lambert 吸收 + 粗糙模糊，机制上是真折射，不是 `rim=pow(1-dot,2.2)` 假高光（该 rim 公式只剩死码 `JET_FS` 里，活体管不再执行它）。
- 几何扭曲独立于透射亦可读：`onBeforeCompile` 顶点段（`cabin-seam-water.ts:172-186`）`travel=sin(uv.x*39-time*12.7)*.075+sin(uv.x*73-time*18.1)*.045` + `x/y` 行波抖动（`.006/.003*smoothstep`），即使透射在暗舱对比弱，管体剪影本身仍有行波起伏，不依赖 rim。
- 苛刻保留：暗舱弱光下透射采到近黑墙时，铆钉错位对比度仍待实机截图数出；但门槛字面“仍有真折射/扭曲”在代码机制上成立（双层皆透射 + 顶点行波），不以假想暗度反推为 FAIL。`transparent+opacity+depthWrite:false+DoubleSide` 确实削弱透射对比，但未取消透射路径，不构成否决证据。

### 门槛 2）行波缩颈 + 偶发断裂，落点扫动 ≥5cm：PASS

- 行波缩颈不在 CPU 整管 scale 里。`cabin-seams.ts:212` 活体管 `scale.set(1,1,reach)` 只做长度 reach，半径调制已移入 shader 顶点：`neck=1.0+travel-gap*.72`（`cabin-seam-water.ts:180`），`transformed+=normal*uJetRadius*(neck-1.0)`，`travel` 沿 `uv.x` 以 12.7/18.1 速度传播，幅度合计 12% 半径。前轮“整根棒子变粗变细”已消除。
- 偶发断裂归零可数：`bucket=floor(uJetTime*1.15+seed)`，`eventOn=step(.79,hash)` 约 21% 时间桶触发；`breakCenter=mix(.24,.82,hash)` 随机位置；`gap=(1-smoothstep(.012,.058,|uv.x-center|))*eventOn`；片元 `diffuseColor.a*=(1-vJetBreak*.995)`（`cabin-seam-water.ts:199`）断裂处 alpha→约 0.005，`diffuse rgb *=mix(.72,1.08,flow)` 同时压暗。这是真断股，不是 `alpha .72+.28*breakup` 永不到零。
- 落点扫动用尺子算：`cabin-seams.ts:209` `impactSweep=wander*.065+tremor*.012`，`wander/tremor∈[-1,1]` → 单侧 ±7.7cm、峰峰值约 15.4cm，≥5cm 门槛以 1.5 倍余量通过。`aimYaw=atan2(sweep, .76*reach*.55)` 驱动 `jetCore/Sheath.rotation.y` + spray 初速 `tan(aimYaw)` + splash `landX` + crown/ripple 落点（`cabin-seams.ts:210-214,239,259,270-274`），射流、飞滴、落点环三者同源掃动，非静止落点加假抖动。高频几何（12.7/18.1 + hash）与 `pulse=|sin(time*19)|` 解耦，不再是 47Hz 整齐正弦绑死管体。

### 门槛 3）非 Points 硬圆；速度对齐实例四边形；暂停无正圆：PASS（带一处明确残留）

- spray 128 + splash 72 已非 Points：`cabin-seams.ts:127-134` 用 `makeBallisticDroplets` 返回 `InstancedMesh(crossedStreakGeometry, …)`；`crossedStreakGeometry`（`cabin-seam-water.ts:279-297`）为两片交叉四边形，长轴均为本地 +Y；每帧 `instanceQuat.setFromUnitVectors(UP, vel.normalize())`（`cabin-seams.ts:244,262`），`scale.y=.035+speed*.018 / .028+speed*.03`（长度∝速度）、`scale.x/z=.006-.014` 纤细。满足“速度对齐实例四边形”。
- 暂停无正圆：`STREAK_FS`（`cabin-seam-water.ts:262-276`）只有 `taper body + head 椭圆 + edgeNoise`，全文件无 `smoothstep` 圆盘、无 `gl_PointCoord`、无 `length(p)<r` 硬圆；`gl_PointSize 17px` 上限已仅剩雾滴分支，spray/splash 不再受其约束。前轮“2–17px 点精灵仓库”对主水滴已消除。
- 明确残留（不构成 FAIL，但记入）：36 粒雾 `mistPts` 仍是 `THREE.Points + DROP_VS/DROP_FS`（`cabin-seams.ts:115-118` + `cabin-seam-water.ts:80-116`）。`DROP_FS` 本身是泪滴头 + 窄尾 + `ragged` 侵蚀，暂停亦无正圆，故“硬圆/正圆”证据不存在；但载体仍是 Points，且未做速度对齐。雾作为体积尘埃用 Points 可接受，旧改法第 3 条明确范围即 spray/splash，本轮按范围判定 PASS。若下轮苛刻加码到“零 Points”，需把雾亦转为实例化条带，当前不以此加码判 FAIL。

### 门槛 4）六裂缝不同种子；湿浸变暗非发光贴纸：PASS

- 六裂缝不同形：`cabin-seams.ts:74-76` `crackSeed=9133+slot*7919`，`crack=crackTexture(seed), halo=crackWetHaloTexture(seed)`，逐槽新建并 `push` 进 `textures`，无全局单张复用。前轮“同 seed 9133 同路径六槽共用”已消除。`rotation.z=(slot%3-1)*.32` 仅三种朝向，但形状本身六种不同，环视识破复制粘贴的证据不存在。
- 湿浸变暗非发光：`wetHalo`（`cabin-seams.ts:81-84`）`MeshStandardMaterial{ color:0x061819, alphaMap:halo, roughness:.08, metalness:.03 }`，默认 Normal blending，未挂 `Additive`、无 `emissive`；`crackBack 0x000202/roughness:.88` 做暗粗糙 recess，`crackMesh 0x071011/roughness:.18`，`wetLip 0x010909`，`streak 0x082a2b/roughness:.24`。白色 halo canvas 仅用作 `alphaMap`（alpha 通道），颜色层是深青黑，黑舱里是“浸润变暗 + 低粗糙水光”，不是发光晕。前轮“additive 发光贴纸”在活体材质中已无对应代码。
- 湿痕记忆：`WET_IN=5, DRY_OUT=22`（`cabin-seams.ts:18`），`streak.opacity=.72*wet`，`wetHalo.opacity=(.34+.18)*wet`，`puddle.scale=0.72+wet*1.72`，`wetSpread=.88+wet*.18+pulse*.035`，随湿铺展可数。

---

## 为什么本轮不是“因进步放行”（对照前轮 FAIL 四处）

1. 前轮“管体激光棒”→本轮半径行波进 shader 顶点 + 断裂 alpha 归零 + 落点 ±6.5cm 有尺子算式，非手感进步。
2. 前轮“粒子硬点精灵 236”→本轮 200/236 转为速度对齐交叉四边形 + 无圆盘片元，剩余 36 雾点亦无正圆证据，非“泪滴化了所以放行”。
3. 前轮“裂缝贴纸六条同纹 + 发光晕”→本轮六种子独立纹理 + halo 改 Normal 暗色湿浸 + recess 暗粗糙分层，非“做了三层所以放行”。
4. 前轮“core 自发光、sheath 再透也包不住”→本轮 core 自身 `transmission:.58/thickness:.13`，`JET_FS` 不再挂载，非“挂了 transmission 旗所以放行”——旗在活体材质上，死码旗不计分。

---

## 给制作方的残留风险（不判 FAIL，下轮实机必查）

1. 暗舱透射对比度：core/sheath 透射机制成立，但深舱弱光下水柱后铆钉/肋骨错位是否肉眼可数，需离座侧视截图数出，不在本轮只读评审内。
2. 雾 36 Points：`DROP_VS gl_PointSize 2–17px` 在 0.5m 贴脸仍是精灵签名；建议下轮把雾亦转为实例化条带或按速度拉伸 billboard，并给各粒独立 life/phase 去同步。
3. halo 与裂缝分支对齐：halo 只 traced 主裂缝路径，`crackTexture` 的 9 条分支无对应 halo；贴脸时分支仍是干线，建议 halo 加分支或分支压暗。
4. `puddle transmission:.3` + `opacity` 叠加在积水面上是否过透，需实机看与 `CabinBilge` 水面叠加效果。

---

## 方法与边界声明

- 本评审只读了：简报 + `docs/anomaly-vfx-qa-water-light.md` A 节 + 前轮本文件 FAIL 版 + 现版 `cabin-seams.ts`、`cabin-seam-water.ts` 全文 + `docs/level-metrics.md`（MET-042 装饰/结构通道与本评审无冲突：裂缝/水流为剧情主体资产，落点在结构通道语义内）。未改任何游戏代码，未跑 `/loop`、未截图（代码盲测）。`node tools/level-rag.mjs check` 本轮返回 `Manifest changed; review and rebuild the index`（本地检索索引待重建），与本评审四门槛无关，不计入 Verdict。
- 下轮若回退到单张裂缝纹理、core 改回自发光主体、spray/splash 改回 Points，或实机截图证明暗舱无折射可读、无断裂可读、暂停有正圆、六缝同形，Verdict 应改回 FAIL。
