# 第一轮独立审查：编译器教学与前端状态管理

审查日期：2026-10-23。范围：`content/30-compiler.json`、`web/app.js`，并抽核 `evidence/compiler-sources.md` 所指冻结源码。只做静态审读与无浏览器 Node VM 最小验证；没有共享浏览器 session，没有修改正文或 UI。

结论：发现 3 个 P2 功能问题、1 个 P3 教学完整性缺口；未发现已确认的 P1。编译器核心源码断言的抽样核对通过，以下缺口不应被误写成已经证明的技术错误。

## [P2] 多标签页全量保存会覆盖另一标签页的新笔记

- 位置：`web/app.js:9`、`web/app.js:12`，相关写入口 `web/app.js:57`、`web/app.js:58`、`web/app.js:113`。
- 触发：同一浏览器打开两个页面。两个标签在初始化时各自读取一份 state；A 写笔记后，B 标记另一章已读、标记练习状态或写自己的笔记。
- 当前行为：B 的 `save()` 把其旧 state 整体写回相同 localStorage key，清掉 A 新增且 B 未读到的 notes；没有 storage 事件监听或保存前同步。笔记是用户生成数据，此行为会导致真实数据丢失，页面“自动保存”没有表明这一限制。
- 无浏览器复现：从实际 `app.js` 取初始化与 `save()`，在两个 Node VM context 中使用同一份 localStorage Map。A 执行 `state.notes['chapter-a']='valuable notes'; save()`，B 执行 `state.read.push('chapter-b'); save()`。最终持久化结果 `notes={}`，A 的笔记被覆盖。
- 建议：保存当前操作的变更，而不是无条件写出旧全量快照；跨标签 `storage` 通知应同步内存态。对不同字段/章节可按修改时间合并；对同一笔记的并发编辑至少提供冲突保护，不应以静默 last-writer-wins 丢失其他章节内容。
- 验收：双标签分别编辑不同章节、一个编辑笔记另一个标记已读/练习、导入备份后另一标签再保存，均保留两边已确认内容。

## [P2] “只练待巩固”在标为掌握后仍保留该题

- 位置：`web/app.js:92`、`web/app.js:99`、`web/app.js:101`。
- 触发：只剩一道 weak 题，启用“只练待巩固”，展开答案后点“我能讲清楚”，再抽下一题。
- 当前行为：`mark-good` 只更新 `state.practice`，没有更新 `questionPool`；抽题继续使用旧 pool。即便唯一弱题已是 good，仍会反复抽到，而不是显示已无待巩固题。多题时同样会把已掌握题继续放在弱题队列。
- 无浏览器复现：直接在 Node VM 执行原 `renderPractice()` 和 `draw()`，只供给一题且初值 weak。调用弱题筛选、`mark-good`、`draw-question` 后结果为 `{status:'good', empty:false, stillQuestion:true}`。
- 建议：抽题时按当前筛选和最新 practice state 重新求池，或者在标记状态时失效/刷新题池。标 weak 和导入练习状态也应采用同一规则。
- 验收：最后一题从 weak→good 后显示空池；两题场景中不再抽到已标 good 的题；切换领域时仍正确筛选。

## [P2] 练习持久化键使用数组下标，内容更新会错绑历史记录

- 位置：`web/app.js:14`，导入校验 `web/app.js:118`。
- 触发：网站迭代，在某章问题列表开头/中间增加一道题、删除一道题或重排题目；用户保留旧 localStorage 或导入旧完整备份。
- 当前行为：key 是 `chapterId + '-' + index`。例如旧题 A 对应 `chapter-0` 且已标 good，新增 B 到 A 前面后，`chapter-0` 变成 B；旧 good 会显示为 B 的掌握状态。导入校验只确认 key 在当前题库存在，无法发现这个语义错绑。
- 影响：用户原练习进度静默迁移到错误问题。“只练待巩固”和备份恢复都变得不可信；这是持续迭代教材的常见流程，不能依赖问题数组永不变化。
- 建议：为每个问题提供稳定 `id` 并持久化该身份，或用稳定问题文本摘要且明确定义修改后的迁移；版本迁移时避免将旧下标记录映射到内容不同的题。若无法可靠恢复旧记录，应明确失效，不能伪造对应关系。
- 验收：标记A后在A前插入B、重排和删除其他题，再加载及导入备份；A的状态仍属于A，B无继承状态。

## [P3] 通用数据流与 SSA 构建目前只教“用途”，缺一个能手算的完整例子

- 位置：`content/30-compiler.json` 的 `compiler-correctness-foundations` / `ssa`、`cfg`、`liveness`（约352–371行），以及 `compiler-codegen-debug` / `ra`（约768行）。
- 当前优点：SSA不等于内存SSA、dominance不等于异步完成、物理alias、liveness与硬件最后读、rewrite legality都讲得正确，也很好地连接到518的真实问题。
- 缺口：尚没有一个含分支与回边的小CFG，让读者实际完成 Use/Def、LiveIn/LiveOut 的迭代到不动点；没有展示phi/block argument如何由两条前驱取值、循环carried值如何进入SSA；图着色/linear scan只描述策略，没有一张可手算的干涉图或spill选择实例。
- 与用户目标的关系：用户希望从算子工作经验扩展到通用资深compiler面试能力。目前读者能解释为何需要这些分析，但面对“在白板上算这张CFG的活跃集合/插入phi/分配三个寄存器”仍没有教材中的练习模板。这是教学完整性缺口，不是现有定义错误。
- 建议：增加一个贯穿示例：4–5个block，含if merge、一个循环回边与一条alias write；给出SSA/block arguments、2–3轮活跃性迭代、干涉边、受限寄存器分配结果，再对照Zeus异步completion额外增加的约束。配一道可折叠答案练习即可，无需另建完整前端课程。

## 已抽核而未发现问题的技术断言

使用 `triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a` 相关源码/仓库合同文档；不将源码检查升级为RTL重测。

- `TargetInfo.h`：GPR/FReg/AReg/BReg各32、VReg4、最多VP4/DT4、512KiB L2与末页4KiB、Fmap H/W extent12-bit及size−1语义，与教材一致。
- `PeMinitileModel.h` / `PeHWSpec.h`：硬件字段w/k/c上限与自动搜索w≤4、k≤2分开表达；教材没有把搜索域误写成ISA能力上限。
- `tools/zeus-compiler/zeus-compiler.cpp:948–1013`：CFG/lane与BReg配置优化、scalar-divide调度在InjectSync前，CodeGen在后，与教材描述一致。
- `RegisterAllocationDriver.cpp:180–211`：BReg收益不得提高其他register class spill demand，确有相应检查。
- `docs/vcs_debug/rtl-instruction-dependency-model.md:34–150,616–720`：dispatch→predecode snapshot→queue issue；mail接收约束issue而不能回溯保护snapshot；教材的BR lifetime/data completion区别有原文支持。
- 源码证据链接经 `sourceUrl` 转换到指南GitHub证据索引，索引存在对应显式anchor；本轮未发现当前正文的损坏内部hash链接。JSON正文中当前唯一独立内部链接是合法的 `#lab`。
- roofline与KV教学模型的单位换算抽核无误；两处均明确为建模/标准KV计算，不冒充518/NVIDIA实测或直接套用到KDA/MLA。

## 边界与建议执行顺序

先处理用户笔记丢失，再修弱题池与稳定题目ID；教学贯穿示例可作为同一版本的内容补强。未提出修改生产编译器或扩大kernel验证的要求。本轮没有完整浏览器交互验收，UI布局、移动端与屏幕阅读器行为应由主任务另行验证。
