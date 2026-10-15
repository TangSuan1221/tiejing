# 潜水艇异常视觉升级简报（仅艺术/视觉）

目标参照：UE5 深海封闭舱恐怖（Iron Lung / 核潜艇仪表舱 / 工业写实水与体积光）。Three.js 实现。

## 硬约束
- **只改视觉**：材质、粒子、灯光、后处理、网格表现。不改渗漏数值、死亡条件、补漏交互逻辑、关卡剧情、声纳规则。
- 允许新增纯表现模块；`run.flood` / `run.seams` / `run.hull` / `run.power` / `run.blackout` 只读驱动画面。
- 不得宣称已达 3A；以独立苛刻盲测为准，未通过继续改。
- `tsc --noEmit` 必须通过。

## 质量红线（任一不达标即 FAIL）
1. 水不能是细白虚线或霓虹点；要有体积、折射感、暗青绿、落点飞溅与湿痕。
2. 积水必须从地板“长”起来：边缘泡沫、波纹、墙脚湿线、水下散射；驾驶座离座环视立刻可读。
3. 断电/掉电：不是整屏纯黑一刀切；要有残晖、仪表微光、应急红、恢复时灯管延迟。
4. 艇壳告警：红灯呼吸要有物理感，玻璃应力裂纹随艇壳加重，不是贴纸。
5. 镜头水雾/水珠只叠在操作者视线，不进感光录像。
6. 与廉价粒子玩具并排盲测时，评审必须选本游戏一侧，否则 FAIL。

## GM 测试入口
`GM.异常('轻度'|'漏水'|'告警'|'严重告警'|'濒危'|'断电'|'掉电')`，离座环视。

## 文件所有权（禁止越界）
| 工作流 | 可写文件 |
|--------|----------|
| A 裂缝喷射 | `src/pod/view/cabin-seams.ts` 及新建 `src/pod/view/cabin-seam-*.ts` |
| B 舱底积水 | `src/pod/view/cabin-bilge.ts` 及新建 `src/pod/view/cabin-bilge-*.ts` |
| C 灯光异常 | `cabin-three.ts`（灯光/掉电）、`power-dropout.ts`、`damage-alarm.ts`、`cabin-emergency-lights.ts`；**特批**可改 `stations.ts` 中 `dropoutActive` 黑幕一段（替换为一刀切以外的残晖/微光，勿动 `drawGlassStress`） |
| D 舷窗与镜头 | `stations.ts`（`drawGlassStress` 一带）、`present.ts`（镜头水雾/fog）、`cabin-lens-water.ts` |
| QA | 只读截图与代码，写 `docs/anomaly-vfx-qa-*.md` |

编排器可改 `docs/level-metrics.md` 登记状态。

## 开源可借鉴（自写移植，勿整仓拷贝）
- WaterThreeJS / SeedOcean：Fresnel、泡沫能量场、Beer–Lambert 吸收、焦散思路 → 用于舱底浅水简化版。
- submarine-240m.html：铆接舱内、体积雾、舷窗外深渊 → 断电残晖与舱雾。
- Vibe-submarine：程序化 PBR、清漆、透射玻璃 → 湿金属与水洼高光。

## 迭代循环
本地 `/loop` 每 4 分钟唤醒编排器；制作 Agent PASS 后由 muse-spark 苛刻盲测；FAIL 则 resume 对应工作流。
