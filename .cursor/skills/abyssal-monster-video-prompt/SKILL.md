---
name: abyssal-monster-video-prompt
description: 铁鲸/铁肺迷城实时视频生成的怪物提示词系统：按玩家深度、怪物危险等级（1 真实深海生物 / 2 中型深海克系 / 3 利维坦级）从词典抽物种，并按异常信号实测距离与相机 FOV 写画面占比与景别。在编写、修改、审查视频提示词、怪物外观、monster-lexicon 词条、videoContext 或 video-creatures 时使用。
---

# 深海怪物视频提示词

目标：同一只怪物每次曝光外观一致，越深越恐怖，永远是海洋生物，画面大小与实测距离一致，整条提示词不超 7000 字符。

## 管线与文件

| 职责 | 文件 |
|---|---|
| 一级真实物种词典（≥100） | `src/pod/content/monster-lexicon/tier1-fauna.ts` |
| 二级中型深海克系（≥50，2–20 m） | `src/pod/content/monster-lexicon/tier2-abyssal.ts` |
| 三级利维坦（≥32，60 m–2.5 km） | `src/pod/content/monster-lexicon/tier3-leviathan.ts` |
| 深度分档、呈现句、细节（深度异化）原子池 | `src/pod/content/monster-lexicon/depth.ts` |
| 材质 / 颜色 / 痕迹 / 发光原子池、体型分类、`composeAtoms` | `src/pod/content/monster-lexicon/atoms.ts` |
| 动作原子池（15 种体型 × 基线 / 变化 / 细部） | `src/pod/content/monster-lexicon/motion.ts` |
| 距离/FOV → 画面占比、景别、照明 | `src/pod/content/monster-lexicon/framing.ts` |
| 抽取与组装 `composeMonsterSubject` / `canonOptics` | `src/pod/content/monster-lexicon/index.ts` |
| 正典生物档案与接入口 | `src/pod/content/video-creatures.ts` |
| 曝光时实测光学（投影、距离、FOV） | `src/pod/view/deepsea/video-lens.ts` |
| 通用槽位（含 DEPTH 槽） | `src/pod/content/video-policy.ts` |

运行时：站点 `videoContext()` 先 `pose()`，读 `深度 = coordinateDatum − position.y`，对每只可见怪物 `lensView(camera, 怪物中心, 灯)`，再调用：

- 视频怪物与小说剧情、3D模型完全无关，全部从词典抽取，不得写入小说外观、模型外形或剧情身份（用户强制，2026-10-13）。
- 关卡固定怪物（harbor / lumen / shade / blind / swarm）：`videoCreatureSubject(kind, seedKey, label, {depth, view})`，等级取 `VIDEO_CREATURE_TIER`，种子用 `harbor:hunter`、`living:<个体id>`。
- 其他：`lexiconCreatureSubject(tier, seedKey, label, {depth, view})`。`seedKey` 必须是「关卡:怪物id」这类稳定值。
- 刷怪点个体（VR-113）：刷出时 `MonsterSpawner` 已锁定 `MonsterVideoParams`（种子、物种、尺寸、等级、刷出深度、标签、setting），快门时只调 `spawnedMonsterSubject(video, {depth, view})`，不要重新抽物种。多个刷出个体用 `fitSpawnSubjects` 按距离加入，全部怪物槽位合计 ≤ `SHOT_MONSTER_BUDGET`（3300）。新增刷怪点写在 `src/pod/content/spawn-points.ts`，每点必须给 `vantage`，并通过 `tools/monster-spawner-check.ts` 与 `tools/spawn-points-browser-check.mjs`。

## 三条输入怎么生效

1. **深度**：`depthBand()` 按本作关卡深度分 D1<1100、D2<1300、D3<1500、D4<1650、D5。深度档决定三件事：
   - 抽取权重偏向更高的 `dread`；
   - 呈现句（所有等级都用，只改表演，不改解剖）；
   - 二三级的「深度异化」条数，各档依次为 2/2/3/3/3；当前档最多占 条数−1，其余从浅档补足。

   一级永远不加异化。无眼物种不会被追加眼睛。
2. **危险等级**：1 真实物种（文本头写 `ordinary catalogued deep-sea fauna`，和通用槽位的豁免句对上）；2 写 `abyssal Lovecraftian ... built on the body plan of <真实类群>`；3 再加 `Megalophobia:` 尺度参照。
3. **距离与 FOV**：先算水平视场 `hfov = 2·atan(aspect·tan(vfov/2))`，再算两个占比：`fillW = 体长 / (2·d·tan(hfov/2))`，`fillH = 体高 / (2·d·tan(vfov/2))`。按两者中较大值分档：≥3 为 fragment，≥1.15 为 partial，≥0.6 为 close，≥0.25 为 medium，≥0.08 为 long，再小为 tiny。照明按距离分三段：≤14 m 在灯内，≤28 m 在光束衰减边缘，更远只剩剪影。主游戏 `vfov = 64/camZoom`；相机锁定不变，构图句只告诉模型主体应有多大、在画面哪里。

## 原子化拼装

一只怪物的槽位由以下标签拼成，每个标签一池短句，按种子抽取：

| 标签 | 提示词行 | 来源 | 一级 | 二三级 |
|---|---|---|---|---|
| 原型 | 头部 + `Anatomy:` | 物种词条（111 / 50 / 32） | 是 | 是 |
| 细节 | `Depth-born wrongness:` | `ABYSSAL_WRONGNESS` / `LEVIATHAN_WRONGNESS` | 否 | 是 |
| 材质 | `Material:` | `MATERIAL_ATOMS[体型]` | 是 | 是 |
| 颜色 | `Colour:` | `COLOUR_ATOMS[体型]`，只写斑纹与局部色调 | 否 | 是 |
| 痕迹 | `Wear:` | `WEAR_ATOMS[体型]`，真实损伤与附着 | 是 | 是 |
| 发光 | `Light:` | `LIGHT_ATOMS`，约四成个体，原型已写发光的不加 | 否 | 是 |
| 动作 | `Motion:` | `MOTION_POOLS[构型]` 三拍 | 是 | 是 |

- **体型过滤**：`bodyClass()` 由动作构型映射到 fish / gel / cephalopod / crustacean / worm / echinoderm / sessile。原子只在本体型池里抽，细节原子用 `cls` 限定体型，缺省为通用。
- **结构过滤**（`fitAtom`）：`^` 要求原型写了鳞，`@` 要求原型有眼，`[bell|dome]` 要求原型 look/move 里出现其一（前缀匹配）。原型写 jawless / finless 的，自动排除含颌 / 鳍的原子。新写的原子凡涉及某物种未必有的结构（钟体、触手、吸盘、触角、疣足、柄、分枝），必须加 `[…]` 前缀。
- **稳定性**：材质 / 颜色 / 痕迹 / 发光种子为 `seedKey|物种id|标签`，不含深度档与机位，是这只个体的身份；细节随深度档变化，动作随机位变化。
- **随距离增减**：灯内（≤14 m）给材质 2 条（利维坦 1 条）和痕迹；光束边缘或远景给材质 1 条（利维坦 0 条）、不给痕迹；光外、关灯或极小目标只留颜色与发光。发光与痕迹二选一；每只原子总长封顶 `ATOM_BUDGET`（190），超出先丢痕迹/发光，再丢第二条材质。
- **打光**（用户对照样片确认，2026-10-13）：全局 `LIGHTING` 句（`footage.ts`）写浑水散射的柔和蓝雾——灯光被浑水散成宽而软的光，不是聚光；主体与结构同光同雾，主体不比周围亮；随距离隐入深蓝黑浑浊而非死黑；低对比、柔和偏蓝的阴影；禁舞台 / 影棚 / 水族箱打光、孤立光池、轮廓光、发光躯体。单束硬光 + 死黑背景会被拍成舞台聚光，已被用户否决，不得再写 hard side light / crushed black / far side black。环境参考前缀写"relight it as LIGHTING describes"，不得写 preserve lighting。逐只照明句只写该距离的差别（近：浑水中柔光；中：蓝雾遮蔽；远：几乎隐没的剪影）。
- **游戏内接入**：关卡快门只能经 `videoContext().monsters` 调 `videoCreatureSubject` / `spawnedMonsterSubject`（`video-creatures.ts`），不得手写外形或走 `footage.ts` 旧 `creatureClause`。新关卡必须实现 `videoContext`，否则快门不提交视频。`video-policy-check` 会验证真实快门派发的提示词带原子行。
- **亮度主要由参考图决定，不由文字决定**（用户反馈“改了文字依然非常亮”，2026-10-13）：生成怪物镜头的环境参考帧在提交前按 `REFERENCE_GRADE`（`video.ts`）压暗、去饱和并叠深蓝浑水；提示词开头先写 "Dark, murky deep-sea ROV footage…"。全局材质句比作“浑水中 ROV 拍到的真实动物”，不得写 macro photograph / specimen photo / high-frequency micro-detail，它们会被画成黑底闪光灯打亮的居中标本照。外部渠道测试前先用 `qa/grade-reference.ps1` 处理截图，否则结果和游戏不一致。
- **新增原子的措辞**：一条只写一个可见特征，约 40–80 字符；颜色限锈、深渊蓝黑、骨白、暗红、血红、苍白、半透明；不写陆地、人形、宗教词，不写 past / across the frame；不写 wrinkled folds、eroded rock、exposed nerves（会画成黏土或贴图）。全局句只保留材质总原则，具体质感一律放进原子。
- 每次扩充原子后跑预算扫描：`monster-lexicon-check` 会扫 6 种距离 × 2 个深度 × 80 组种子的三怪同框，任何组合都必须 ≤ 7000 字符。

## 新增或修改词条

逐条满足：

- 一级：真实学名、真实体长、真实深度范围，外观只写该物种真有的结构。不收鲨鱼（通用槽位禁画鲨鱼）；俗名含陆地动物词的（sea pig、headless chicken monster、lizardfish、sea toad、batfish）改用学名称呼，或者不收。
- 二三级：`base` 必须是真实深海类群（鱼、鳗、头足、刺胞、栉水母、管水母、被囊、多毛、棘皮、游泳甲壳）。克系感来自重复或错位的感官、过度的颌与鳍、不该相连的膜、可见的内部、不合生理的同步。
- 二三级禁写：四肢、行走、爬行、站立、爪、毛、羽、人形、手、指、脸、颅骨、陆地动物名、鲸、鲨、海豚、神祇、宗教。原著深潜者的蛙鱼人形与跳行不得采用。
- 三级 `scale` 只用设施结构、海雪视差、潜艇自身、表面移动速度作参照。
- 颜色只用锈橙、深渊蓝黑、骨白、血红及其近义（pale / crimson / rust / black / translucent）。正面描述不得出现 green / teal / cyan / emerald / olive / lime。
- 不写人类残留特征：那会暗示 Panacea 受试者身份，属于剧情事实，不是随机外观。
- `look` 控制在约 300 字符以内。改 `id` 等于换物种，已缓存的片子会失效。

## 验证（每次修改后必跑）

```powershell
npx tsx tools/monster-lexicon-check.ts
npx tsx tools/video-policy-check.ts
npx tsc --noEmit
```

预览单条：

```powershell
npx tsx tools/monster-prompt-preview.ts --tier 3 --depth 1600 --distance 20 --zoom 1 --seed living:c1
npx tsx tools/monster-prompt-preview.ts --tier 2 --list
```

检查脚本只能证明结构、措辞与预算合规，不能证明模型实际出片质量。实际生成要另行看片验收，并在规范里保持 GAP 标注。

## 规范来源

`docs/video-prompts/structured-prompt-standard.md` 的 VR-110（深海克系表达）、VR-111（固定摄像头）、VR-112（本词典与构图）、VR-113（刷怪点）。改规范后同步 `rag/video-prompt.manifest.json`，再运行 `node tools/video-prompt-rag.mjs build` 与 `check`。
