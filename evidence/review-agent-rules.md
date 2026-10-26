# Agent 规范与源码导航落地

核实日期：2026-10-26（Asia/Shanghai）。本轮修改仓库指导、源码查阅入口与公开产物检查；业务库只读，没有构建编译器、运行模型或新增硬件性能结论。

## 组织方式

- 根 AGENTS.md 作为统一入口，链接编写审稿、源码导航、协作验收三份文档；本机绝对路径仅放在被 Git 忽略的 AGENTS.local.md。
- 编译器优先 triton_shared，算子优先 torch_zeus，LLVM/MLIR 查当前本机 llvm-project，按需关联 Triton frontend、SGLang 和 CycleSim。
- 固化此次算法图文返工中的可复用要求：概念先于数字，图先说明比较对象与轴，计算/容量/流量分开，技术正确性与读者理解、视觉效果分别检查。

## 源码导航核实范围

以下只记录导航时的快照，后续使用要重新核实 HEAD、相关文件本地修改与实际依赖。dirty 标记只表示有已跟踪改动，不代表对全部差异完成审计。

| 仓库 | 核实的 HEAD | tracked dirty |
| --- | --- | --- |
| `triton_shared` | `82613bc2eb30feb9ef7f57aef20584df0ef9e28a` | 是 |
| `torch_zeus` | `68f19fa0a159b8ff861dc9cf736d9c0ae64906ba` | 否 |
| `triton` | `7df590e44739a6da641d3402ed9d33892746a53d` | 否 |
| `llvm-project` | revision unknown | 未知 |
| `sglang` | `d07d0a15ceb87046b9d64a3a608c17560413d6d5` | 否 |
| `Zeus3Simulator` | `d7ff3de469f8e4bfe571f4c86e127e6446ed56b0` | 是 |

核实了源码导航中的 63 个入口存在及其层级。其中 LLVM 的 Git 元数据缺失，构建版本字符串不能证明源码 commit；部分引用文件的 SHA256 如下：

| LLVM 相对文件 | SHA256 |
| --- | --- |
| `mlir/include/mlir/IR/Operation.h` | `e6fa8d742b79163d347a5f5c818750ce231c12bbea33f35b70b86d18f5f28162` |
| `mlir/lib/IR/Operation.cpp` | `ab0e0afae4f3dff86a628bbf7284c3d808666a87b68d574e44d24ace65b60005` |
| `mlir/include/mlir/Transforms/DialectConversion.h` | `ff69769af208e6d7eac8b05656553142592b2075bb608c4cb2a4d12d99b4c464` |
| `mlir/lib/Transforms/Utils/DialectConversion.cpp` | `feecba4214846ff11b18490f21147669ec776340a09f7e3ce0f2962ba1eabb6f` |
| `mlir/lib/Transforms/Utils/GreedyPatternRewriteDriver.cpp` | `5b933b5de7aebee141cac7f2ef8a5b09fd63a8ec15bc32fef491b33c2f5b783f` |
| `mlir/include/mlir/Interfaces/SideEffectInterfaces.td` | `b16d73bdb369d14c94066d17d7ee178702c0eb6a5d570ac774245990c37cad73` |

当前目录与旧指导有差异：torch_zeus 旧文档的 Triton 支持说明落后；ZeusLowPipeline.cpp 不存在，应从实际工具入口追 pass 注册。未把旧文档或目录名称当运行时证据。

## 公开产物检查

新增检查覆盖整个 dist 的文件集合、文件类型与文本内容。只接受构建声明的独立 HTML、数值 manifest 和空 .nojekyll；拒绝额外/隐藏文件、目录与软链接。构建写入前也检查已有产物，不静默删除未知文件。

所有 HTML（含内联 JSON、注释与隐藏节点）检查私人简历路径/下载入口、LaTeX 文档源码、编辑说明及常见联系方式。检查失败不回显匹配内容或意外文件名。CI 在上传前执行回归和检查，上传目录仍仅 dist。

这是针对当前发布格式的检查，不是任意编码或个人信息的通用识别器。普通无标记文字是否来源于私人材料仍需人工审稿；词语“简历”、数学公式与阅读恢复样式本身不会一概拒绝。

## 验收

- 构建、内容与站内引用检查、公开产物检查、`git diff --check` 通过。
- 16 项回归通过，含真实构建产物、文件白名单、软链接、隐藏内容、日志不泄露、常见联系方式、内嵌 CHAPTERS JSON 中的 HTML 文本，以及合法教学示例。
- 独立审查复现并修正普通 Resume reading 误报、常见简历文件名漏报、分段联系方式漏报、动态正文只存在于 JSON 的检查遗漏。已知 JSON 用解码器读取，始终不执行 JavaScript。
- 实际构建 CLI 的两项反例通过：旧额外文件与被链接的输出均在写入前拒绝，原有文件保留。
- 10 个生成产物与基线提交 27fa01c 的构建逐字节一致，未改变网站 UI；规范相对链接、63 个源码入口及所引 LLVM 文件 hash 核对通过。
- 本机配置文件被 Git 忽略；业务源码只读，未读取私人简历。
- 共享旧 checkout 尚无岗位入口；检查器按 jobs 配置及当前章节声明匹配产物，存在岗位配置时严格要求 jobs.html 与 manifest.jobs。

用户最新确认指南仓库与 GitHub Pages 均保持公开，简历独立管理；规范据此更新。远端已核实为 public，无需修改可见性。Pages 仍仅上传经过检查的 dist，公开仓库同样排除私人简历及本机配置。

公开发布前将规范提交更新到主分支 128fcbd，保留新增 LLVM/MLIR 教程；再次构建并运行内容和公开产物检查、16 项回归。12 个生成产物与该主分支基线构建逐字节一致。
