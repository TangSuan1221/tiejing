# 增量保护审查

2026-10-15：本轮范围仅后台收容流程与U舷窗。主入口`/`保留原流程，新模式仅`?campaign=containment`显式启用；主UI/按钮/材质与生成录像流程不得重新设计。

- 16个受保护文件实际SHA256见`protected-baseline.json`，包含main、lab-desk、sonar-desk、cabin-active-controls、cabin-three、CRT/舱内装饰/舷窗、实体键盘和材质、footage。
- `node tools/containment-incremental-check.mjs hashes`：PASS，全部16个文件字节一致；该模式不启动浏览器。
- 新`verify`模式已编写：隔离Edge、禁API和HMR，比较原默认入口与新模式到站后的屏幕几何和全部按钮hit矩形；真实U键联锁，原右CRT鼠标放大，默认lab页仍为tapes，检查无旧存档写入。
- 浏览器首次启动申请被审批服务以`invalid_encrypted_content`拒绝，命令未执行。没有替换通道或重试绕过；本轮不能声称新模式截图、按钮/hit比较或浏览器功能已通过。
- 已实际查看此前恢复阶段的`qa/original-design-restored/cockpit.png`和`lab.png`；其记录显示原默认入口containment=null、active=true、pulse=true、lab=tapes且errors=[]。它们是历史基线，不是本轮重新采集。

源码审查：creature.ts新增代码仅拦截光学feed，独立shutter模块无文字、按钮、控件或命中区域；不重画原仪表。闭窗的底层adapter.draw必须同步遮挡，避免captureSensorFrame绕过可视遮板。原lab发送动作会先写sentTo且返回true，因此后台任务完成必须基于receiveTape独立验证和回执，不得以按钮返回值或sentTo判断成功。后台适配器使用快门冻结的IDs/seed/mission与媒体来源，不用提交时的世界补写。

旧`containment-browser-check.mjs`/`containment-campaign-check.mjs`曾依赖已撤销的本地帧优先流程，其旧PASS不适用于本轮恢复生成录像后的模式。未调用计费生成服务，不能将stub或API中止当作真实生成成功。
