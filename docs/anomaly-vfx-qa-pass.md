# 异常视觉苛刻盲测 · 汇总通过（2026-10-14）

编排器判定：四条工作流均已通过独立苛刻盲测（代码盲测）。**不以本文件宣称 UE5/3A 或真人试玩达标**（MET-031）。

| 工作流 | Verdict | 文档 |
|--------|---------|------|
| A 裂缝喷射 | PASS（三次复测） | `docs/anomaly-vfx-qa-seams.md` |
| B 舱底积水 | PASS（窄过）+ hardening | `docs/anomaly-vfx-qa-water-light.md` B 节 |
| C 断电/掉电/告警灯 | PASS（窄过） | `docs/anomaly-vfx-qa-lights.md` |
| D 舷窗裂纹 + 镜头水雾 | PASS | `docs/anomaly-vfx-qa-lens.md` |

## 主要视觉文件
- `cabin-seams.ts` / `cabin-seam-water.ts`
- `cabin-bilge.ts`
- `cabin-emergency-lights.ts` / `power-dropout.ts` / `damage-alarm.ts` / `cabin-three.ts`（灯光段）/ `stations.ts`（掉电残晖，非 `.94` 黑幕）
- `cabin-lens-water.ts` / `stations.ts`（`drawGlassStress`）/ `present.ts`（镜头水雾）

## GM 验收
`GM.异常('轻度'|'漏水'|'告警'|'严重告警'|'濒危'|'断电'|'掉电')`，离座环视舱壁与舱底。

## 边界
- 只改视觉，未改渗漏数值、补漏交互、关卡剧情。
- 盲测以代码机制与心理并排为准；未做全套运行时截图真人验收（GAP）。
- `/loop` 在本汇总后停止。
