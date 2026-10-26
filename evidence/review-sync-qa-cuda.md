# 同步主问答改写与 CUDA 依赖扩展

日期：2026-10-26。连续阅读入口：`sync.html`，chapter ID：`compiler-sync`。

## 范围与来源

根据读者在模拟面试中提出的三个主问题重写页首：抽象问题与解决方法、建模对象与分析算法、硬件依赖体系和 CUDA 对比。移除原先 20 个零散问题的展示模板，改为三个完整主答案与可展开补充；细节仍在正文中深入，答案提供同页阅读入口。

CUDA 对比单列阅读阶段，包含职责总览、普通指令与 scoreboard、线程通信与内存顺序、异步完成、双缓冲生命周期、stream 边界和诊断。正文以资料核对和原创教学例子为依据，未执行 CUDA 编译、GPU kernel、CycleSim 或 VCS/RTL 实验。

- 编译器建模依据与源码版本见 [建模算法核对](sync-model-algorithms.md)。
- CUDA 官方文档、架构条件与来源边界见 [CUDA 依赖模型](cuda-dependency-model.md)。
- 此前的单调链证明、源码摘录及浏览器验收记录保留于 [上一轮同步扩展](review-sync-expanded.md)，不将历史执行记录称作本轮重跑。

初始发布基线为 `origin/main@1cb583097c76ad983a5885ce796b6f5aacbf0f26`，从已同步的独立工作区编辑。原主工作区的其他未提交改动未动。提交与推送前重新获取远端并 rebase；最终发布与 CI 以关联提交记录为准。

## 兼容性设计

- 保留 `compiler-sync`、`sync.html`、`518-sync.html`、原 50 个 section ID、原有阅读阶段 ID、7 个练习题对象以及 `legacyChapters`。
- 原 20 个 `sync-interview-q*` 锚点移至对应解释：例如 q4 到 snapshot，q10 到 staircase-example，q18/q20 到 debug-interview。
- 新的三个主答案使用 `sync-qa-abstraction`、`sync-qa-modeling`、`sync-qa-hardware-cuda`，支持全文搜索和直接展开。它们不继承旧练习题的熟练度。
- CUDA 章节与新增建模章节仍内嵌同一个 HTML；外链用于继续查来源，正文、图示、目录和原单调链交互可离线使用。

## 验收记录

### 构建与兼容性

- `python3 scripts/build.py`、`python3 scripts/check.py`、`python3 scripts/check_public_artifact.py` 和 `git diff --check` 通过。全站 25 章、465 小节、139 张正文 SVG；仅 16 个允许的 Pages 文件进入发布目录。
- `node scripts/check_sync_model.js` 通过：512 个输入集合 × 20 条枚举链，核对覆盖、最弱关系、排列、重复与合并；这是教学模型检查，不是编译器或 RTL 实验。
- `node scripts/check_interviews.js` 通过：两个面试独立入口、43 个场次/材料组、328 个问题锚点和既有记录迁移。
- 独立对比本次 JSON 与修改前快照：57 小节，三个新主问题；原 50 个 section ID、20 个问答旧锚点、7 个练习对象、原有阅读阶段 ID、`legacyChapters` 与离线文件名均保留。

### 浏览器与人工审阅

- Chromium 桌面 1440×1100：三个主答案默认展开、折叠后深链接重新展开、20 个旧问答锚点分别落到对应说明；旧 `sync-staircase-planning/sp-worked` 链接仍定位阶梯示例。
- 搜索“程序上下文”可进入第二个主答案；第三问可跳到双缓冲小节。笔记写入并刷新后保留。既有阶梯示例仍产生 `(1,1)、(3,2)、(4,4)`。
- 新图的放大对话框与 150% 缩放可用。人工查看桌面问答、新生命周期图和移动端截图，文字、连线、输入输出与阅读顺序一致；示意图明确不按周期比例绘制。
- 390×844 移动端检查主问答、建模算法、CUDA 总览与双缓冲：文档宽度均为 390，无页面水平溢出。宽图可横向查看并使用放大按钮。
- 打印样式展开所有正文问答并隐藏交互控件，导出 65 页 A4 PDF。抽查新增图及其伪代码页，完整显示槽位、ready/free 方向与初始权限。
- 从本地 HTTP 页面实际点击下载 `518-sync.html`，断网后打开文件，七节 CUDA 扩展和原阶梯交互均可用。最初 file URL 下的浏览器自动化未触发下载事件，改走与线上一致的 HTTP 下载完成核验。
- 检查过程中未捕获页面 JavaScript 异常。新增官方来源链接逐一确认 HTTP 200；带片段的链接核对 HTML id/name，修正了 cp.async wait 的旧片段写法。

### 分项结论与边界

- **技术正确性：通过本轮资料与源码审查。** 独立复审确认冻结→验证→物化顺序、候选依赖与 CFG/区域算法的分工，以及双缓冲 free(s,g+1) 的跨轮配对。CUDA 结论限定具体机制和架构，没有把 scoreboard 说成全局地址冲突检测器。
- **可理解性：通过本轮编辑审阅。** 主答案使用连续文字，以 LD→PE 和同槽位复用贯穿问题、建模和硬件分工；首次解释 may-alias、TMA、CTA、proxy 等概念，后续细节有明确阅读入口。尚未进行真实读者访谈。
- **视觉可用性：通过上述桌面、移动、放大、离线和打印抽查。** 本轮只新增一张 SVG，已逐项检查文字和连线；没有宣称逐页人工检查全部 65 页打印输出。
- 未执行 CUDA 编译、GPU、编译器重建、CycleSim、VCS/RTL 或性能对照。CI、部署与线上读取是否完成，以最终提交关联的 GitHub Actions 和本次交付说明为准。

### 本地验收产物指纹

| 文件 | SHA256 |
| --- | --- |

| `content/37-compiler-sync.json` | `d5de5717d478ea8f23ecc62978b63c95fa31c654a700045d83de26ee3d71744f` |
| `dist/sync.html` | `a40b0de090bbc738bc2e763b83ca4e20842f25e27b15563ebefab80efe86c356` |
| `dist/index.html` | `18eee7c4403c40eb66568854cd97ab11c438c4174c8c478ad3c8db56f254f8e7` |
| `dist/manifest.json` | `91adb330954bf2660fbf245c04963365ca42d9888a03bff677df87ffc28592c3` |
