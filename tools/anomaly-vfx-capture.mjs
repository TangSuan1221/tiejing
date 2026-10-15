/**
 * Headless-ish capture helper for anomaly VFX QA.
 * Opens the game with ?gm, injects GM presets, asks the live page for canvas frames.
 * Usage (manual in browser console after load): copy the captureAnomalyFrames helper.
 * For agent loops: prefer Playwright if installed; otherwise document expected GM sequence.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = join(import.meta.dirname, '..', 'qa', 'anomaly-vfx');
mkdirSync(out, { recursive: true });

const PRESETS = ['轻度', '漏水', '告警', '严重告警', '濒危', '断电', '掉电', '复位'];
const checklist = `# 异常视觉盲测清单

## 并排对比规则
左侧：本游戏截图（qa/anomaly-vfx/*.png）
右侧：UE5/写实潜艇参考（自行并排）
评审必须回答：哪一侧更好？若选参考侧 → FAIL，继续迭代。

## 预设验收
${PRESETS.map(p => `- [ ] 异常 ${p}`).join('\n')}

## 红线
- 水无细白霓虹线
- 积水可读、有泡沫与波纹
- 断电有残晖非纯黑
- 告警灯慢呼吸
- 镜头水雾不进录像

生成于 ${new Date().toISOString()}
`;
writeFileSync(join(out, 'CHECKLIST.md'), checklist, 'utf8');
console.log(`Wrote ${join(out, 'CHECKLIST.md')}`);
console.log('In-game: F10 → 异常按钮；离座环视后截图保存到 qa/anomaly-vfx/');
