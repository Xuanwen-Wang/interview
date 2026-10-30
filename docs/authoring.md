# 如何扩展知识库

导航分成三层：**知识域（module）→ 专题（group）→ 章节（chapter）**。目录关系由 `config/navigation.json` 管理，正文文件不决定菜单结构。新增几十篇文章也不需要在侧边栏平铺几十个链接。

开始任务先读根 [AGENTS.md](../AGENTS.md)。编译器、算子、LLVM 的本机查阅入口见 [源码导航](source-navigation.md)；并行协作、证据与发布完成标准见 [协作与验收](agent-workflow.md)。

## 先按读者的知识顺序讲清楚

算法篇默认读者只懂简单 Attention 与 MoE。每个方法按“已有方法遇到什么问题 → 新增什么概念或状态 → 一次输入到输出的数据流 → 节省与代价 → 实现和优化”展开。编译器篇先给输入 IR、目标变换和合法性条件，再解释分析与 pass，不直接堆类名。

- 名词、符号和数字首次出现时解释其含义、轴和来源。例：先定义 MLA 的压缩 KV 向量，再说明 DeepSeek-V2 把它配置为 512 维；不能先用“512维底稿”代替定义。
- 一个主线例子固定模型、batch、query/history 长度、head 数、head dim 和精度。切换玩具算例、真实配置或反事实对照时重新说明条件。N 是 query 长度还是历史长度必须写明。
- 依据用户 2026-10-28 对 MLA 开头的进一步反馈，标题与主线先讲算法概念及维度角色（如 hidden size、KV 压缩维度），具体数值放到明确标注模型的算例中。保留真实 shape 数据流，但不要把某个配置值写成算法定义，也不要把对话中的临时问答直接写成文章开头。
- 依据用户 2026-10-28 对 MLA 的反馈，面向只懂基础 Attention 的算法段，首次用“通道 / hidden / head_dim”前先画 token 位置轴与单 token 特征轴；解释单个特征是一个数。省略 batch 或长度为 1 的轴时标明省略项；投影（改变数值与宽度）、reshape（只改分组）、沿位置归约必须分清。不要要求读者从一串 shape 自行推断这些概念。
- 依据用户 2026-10-30 对 MLA 的反馈，先把新结构对应到读者熟悉的 Q/K/V，再给一张默认可见的输入到输出完整图；不能用多张局部压缩图替代总图，或把 Q 投影放进后文折叠补充。区分模型的显式计算与融合/吸收后的实现，逐项标出移走的投影在何处继续生效。
- 按计算顺序解释中间量的形状、生成者、消费者和寿命：哪些是权重，哪些跨步缓存，哪些只是临时值。head 数、每 head 维度、共享方式、RoPE 的位置维度分别说明。
- 分开计算量、缓存容量、逻辑读写量和实测流量。说明省掉什么、增加什么，以及 prefill/decode、batch 和上下文增长对结论的影响。全量 GQA/MLA 仍访问全部可见历史，不能把压缩每行说成跳过历史位置。
- 公式服务于数据流。主文保留理解流程所必需的内容，完整推导和实现细节放入可展开补充，打印仍完整显示。优化方法之间的组合、替代和独立关系必须有依据。

依据用户 2026-10-26 对同步篇问答的反馈，面向面试准备的核心 Pass 长文先回答少量能够展开设计的主问题：解决什么抽象问题、怎样建模与判断、硬件和编译器如何分工。模拟面试可按每问三至五分钟组织；网页答案可以更详细，以连贯解释、贯穿案例和必要补充说明前提、机制与取舍，并链接后面的模型推导和源码。不要把一个完整问题拆成大量只考术语的碎问，不套用“考察点／避免这样答”的重复模板。CUDA 等跨架构对比应按依赖层级和责任边界单列扩展阅读阶段，注明目标与版本，不能将单个 Pass 的保证推广到整个系统。问答属于原创训练，不是公司面经；不替读者编造个人贡献或性能结果。重写时保留旧深链接和原学习数据，原细节归入对应正文。同步篇 `sync.html` 是这一结构的示例。

### 硬件适配文章要有可追踪的实际案例

依据用户 2026-10-26 对 Lowering 篇的反馈：仅列 pipeline、概念和通用取舍，不能支撑“整体架构设计”的解释。此类文章以一个可追踪的 GEMM 或业务案例为主线，展示具体硬件限制、输入/输出 IR、当前选择、可替代方案和代价；正文需要解释代码中的关键值，而不是用大量 dump 代替教学。

同一次编译的阶段可以连成主链；独立回归、历史诊断和手算变体必须单独标明。手写的示意 IR 不能称为真实输出，实际编译到汇编也不能称为功能或性能验收。谈“为什么选择”时区分从当前实现推导的架构分析与有记录的历史决策，不能替作者编造当时的动机。源码 HEAD 与现成工具二进制的构建来源分别记录。

依据用户 2026-10-26 对 CycleSim 篇的反馈，性能建模长文先用场景化主问答建立问题，再梳理真实硬件、模型状态和总时间，最后逐单元拆解。每个核心案例给出真实记录中的 shape、精度、布局、计时边界和台架条件；沿微架构解释每项周期从哪里来，哪些相加、哪些取最大值、哪些因依赖或争用而等待。依据用户2026-10-27的进一步纠正，每个核心单元必须先建立模型：定义输入合同、硬件状态与前进/等待条件，画出贡献项和重叠关系，区分latency、occupancy及完成/通知边界，再代入真实shape与受控反例。日志首尾差分只用于模型之后的验证，不能代替预测；图上的绝对终点不可冒充耗时。审稿要求读者能据此推导换shape或换约束后的变化。动画必须区分原始事件回放、模型计算和教学因果示意；没有中间波形时不得补造逐拍信号。发布前分别检查源码/算术和面试讲解，保留模型残差与尚未归因的时间。

## 图与动画的验收标准

每张图至少要让读者能回答：画的是什么、输入输出是什么、每个轴表示什么、箭头传什么、这张图证明了什么。图题和图注不能依赖另一页才能解释比较对象。

| 图的类型 | 必须明确 |
| --- | --- |
| 容量或计算对照 | 两侧对象、共同条件、单位和归一化口径；模型之间的对比与同模型两种表示分开 |
| shape 数据流 | 轴名与尺寸、分支/合流、数据与控制依赖；多个输入不能漏箭头 |
| 模型结构 | 输入到输出的顺序、重复层范围、残差、缓存、层类型；并列分类不能画成执行先后 |
| 比例与分布 | 相同坐标和比例；若块宽或格数不按真实比例，直接标“结构示意” |
| 动画 | 当前步骤、变化的数据、未变化的状态；能前后步进、暂停、重置，静态末帧与打印仍可理解 |

采用统一颜色区分语义，不能只靠颜色传达含义；避免一张大色块塞满文字。桌面实际截图检查文字、箭头、对齐和留白，手机检查是否能阅读或放大，打印检查是否截断。边界检测无法识别“线穿字”或“比较对象不明”，仍须人工看图。

依据用户 2026-10-29 对分页图示的反馈，内存池等重复单元采用紧凑行列，保留稳定位置并突出当前访问或修改的单元；空闲项不使用与核心计算同等大小的说明卡片。轴标签与实际列对齐，对照方案编号不得与请求编号混用。

依据用户 2026-10-30 对 PagedAttention 的反馈，涉及缓存管理的章节应以同一真实模型shape与上下文规模贯穿正文、图和交互；用局部放大与明确的省略范围展示长序列，不把主流程退回到几token玩具例。页大小、池容量和物理页映射标为教学运行条件；展示有效字节与分配字节在跨页前后的不同变化。

技术审稿之外，另按读者视角从头读一次：新术语是否已定义、能否沿一条真实输入走完整个流程、是否能说出优化的收益和代价。构建通过和算术测试通过不能代替这项审查。

## 添加章节

1. 在 `content/` 的现有 JSON 或一个新 JSON 数组中添加章节。参考相邻章节的 schema：`id/title/part/order/subtitle/minutes/level/tags/lead/sections/questions/sources/takeaways`。
2. `id` 与 section `id` 使用稳定的英文短横线名称。标题和归类可以改变，已有 ID 尽量保留。URL 为 `#chapter/<id>/<section-id>`；笔记和已读状态以 chapter ID 保存。
3. 把 chapter ID 加进 `config/navigation.json` 的一个专题。每章只能有一个主目录位置，其他专题用正文链接交叉引用。`order` 控制构建与索引顺序，专题内阅读顺序以配置数组为准。
4. 为项目事实添加 `evidence/` 记录，至少说明仓库、commit 或非 Git 文件 SHA256、文件位置、采集日期、验证层级。正文区分算法事实、源码实现、历史观测和教学推导。
5. 添加原创 SVG 时使用 `figure.diagram`、`viewBox`、`role="img"`、`aria-label` 和 `figcaption`。图会自动支持放大；较密的机制图不要只依赖缩小后的字号。HTML 内不要写脚本或事件处理器。
6. 构建、检查，并在桌面/手机查看新章、专题目录和打印预览。

`part` 是章节的语义标签，继续用于部分问答和检索显示；它不再驱动侧边栏。学习记录仍使用原 `interview-field-notes-v1` 存储键与 version 1 备份格式；合并章节时由下述兼容元数据迁移记录。

## 连续长文与旧链接

Attention、FFN、PE、VP、MoE 部署与性能分析分别使用一个 chapter、一个完整 HTML。`readingStages` 的每项包含 `id/title/summary/sections`；所有 `sections` 展平后必须与章内 section 顺序完全相同。侧边栏、页首路径和右侧目录都跳到同一篇文章的锚点，页面不拆载、不重新初始化交互。阶段标题用 h2，小节用 h3，小节内部标题从 h3 转为 h4。可用 `readingLabel` 定义页首路径说明、`readingStageLabel` 定义阶段编号前缀；默认的“从外到内”“放大层次”适合硬件篇，MoE 可使用“沿一次 MoE 调用”“数据路径”。

正文的硬件字节映射、credit 等补充推导可放在 `<details class="pe-deep-dive">` 中。直接访问其内部锚点会展开对应内容；打印时所有技术补充自动展开，结束后恢复原状态。

合并已有章节时，使用 `legacyChapters` 保存原 chapter ID、`title`、入口 `section`、全部旧 `anchors` 和可选 `noteKey`。旧 hash 路由映射到长文；旧笔记单独保留，不能用旧章的完成状态代替整篇长文的完成状态。当前 PE 的原总览笔记使用 `legacy-pe-overview`，避免覆盖同 ID 新长文笔记。问答的 `legacyKeys` 只映射语义相同的原题，改题后不要沿用已有熟练度。

旧章节可能都有名为 `shape` 或 `contract` 的小节。合并时在对应旧章节的元数据内增加 `anchorMap`，例如 `{"anchors":["shape"],"anchorMap":{"shape":"router-shape"}}`；保留 `anchors` 原列表作为历史链接清单，每项映射后的目标必须存在。未改名的旧锚点可省略映射。不要把多个旧章节的通用锚点直接注入新正文，避免重复 HTML ID 或跳到错误内容。需要保留旧专题入口时，可使用 `config/navigation.json` 中 module 的 `legacyGroups`。GLM-5.3-Flash 的旧模块路由已按用户要求取消，不以旧模块结构限制新专题。

首次迁移先备份旧存储原文，再写入 `readingVersion: 2`。旧版备份导入、JSON/Markdown 导出、多标签合并和取消已读都须验证。`scripts/check.py` 检查阶段覆盖、旧锚点与重名 ID；浏览器验证实际跳转及历史笔记定位。

之后再次合并章节时，已是 `readingVersion: 2` 的浏览器也必须把消失的旧 chapter 已读状态保留到 `legacyRead`。迁移依靠稳定 ID 和显式 `legacyKeys`，不能靠相同题目标题猜测对应关系；`scripts/check_moe_model.js` 同时检查这类再次迁移与同名锚点分流。

长文章节使用 `portableReading` 指定独立入口，例如 `{"file":"vp.html","download":"518-vp.html","label":"保存完整 VP HTML ↓"}`。`scripts/build.py` 据此生成 `dist/attention.html`、`dist/ffn.html`、`dist/pe.html`、`dist/vp.html`、`dist/moe.html`；它们与 `dist/index.html` 内嵌同一份内容和应用，仅默认路由不同，可保存后独立离线阅读。文件名必须是唯一的英文小写 HTML 文件名，不能占用 `index.html`。下载链接使用当前章的元数据，不能写死为 PE。静态检查验证独立入口内容一致性；浏览器验收验证实际下载目标。它们在同一来源共享浏览器笔记，文件离线副本则需导出/导入来转移笔记。

## 未来专题怎么放

| 新需求 | 建议位置 |
| --- | --- |
| 中端核心 Pass 逐个拆解 | `compiler` 下新增 `middle-end-passes` 专题；按分析前提、合法性、变换、失效、反例组织章节 |
| GLM-5.3-Flash 部署 | `glm53-flash` 下按整网概览、MoE、Attention、mHC、其余组件组织；每专题一篇连续 HTML，模型和 kernel 版本分别固定 |
| 更多公司面经 | 添加来源记录后，在同一份面试题长文中增加场次与题目锚点，不再增加公司或专题 HTML |
| LLVM 后端专题 | 扩展 `llvm-backend` 的对应 readingStage；每个模块保留独立 section、源码入口、例子与验证边界 |
| 新 Coding 题型 | `coding` 下按通用算法、数据流、kernel、pass 分类扩章；代码和题源分开 |
| 新硬件代际 | 新知识域或 `hardware` 下独立专题；不改写旧代际的来源范围 |

## 算法与部署的内容边界

依据用户 2026-10-28 对 MoE kernel 讲解的反馈，部署篇的每个 kernel 先列真实调用的输入与输出 ABI（shape、各轴、dtype、连续 stride、有效范围、生产者和消费者），再沿同一 token 展开实际计算与 rank/core 分工。逻辑权重、pack 后对象和运行时缓冲区分开解释；中间 shape 标明逻辑全量还是实际 tile。统一称第四个 kernel 为“rank 内 Reduce”，明确它消去 Shared core 轴和 Routed slot 轴，TP AllReduce 另合不同 rank；不能把一个 kernel 的 core 分工套用到其他 kernel。图、正文、交互和数值顺序必须一致。

`algorithms`只保留 Attention 与 FFN 两篇连续教程，各有一个独立 HTML。以真实模型数字 shape 贯穿一次 decode，再解释长上下文、参数增长下的状态、计算和逻辑读写变化；少量公式服务于数据流，不再为每个概念拆章。MHA/MQA 的同维教学对照、真实 Qwen 配置、内部 GLM5Next 和实测必须分开。实际 rank、collectives、kernel ABI 与性能证据放入 `glm53-flash` 部署域。按用户 2026-10-28 更新，入口统一为 `#module/glm53-flash`，不再保留旧 `module/moe` 路由。Attention 部署合为 `glm53-attention.html`，mHC 单独为 `glm53-mhc.html`，其余组件合为 `glm53-components.html`。

主题可配置`learningPath`，每步包含`title`、`description`、`chapter`，页面自动生成有顺序的阅读入口。所有chapter引用由静态检查验证；它是推荐路线，不改变章节的唯一主目录位置。

## 公司与面经

- 依据用户 2026-10-26 的位置调整，面试模块首页并列展示岗位介绍、公司面试题与模拟面试。`interview-jobs.html`（岗位）和 `interview-questions.html`（公司与场次题目）的正文在 `content/60-company-interviews.json`；面向具体岗位的原创模拟面试使用独立 chapter 与完整 HTML，例如 `content/61-seed-hardware-mock.json` / `interview-seed-hardware.html`，不嵌入公司场次长文。公司、场次、问题采用稳定 ID，重复问题链接到同页主答案，同时解释本场追问差异。读题方式置顶，公司组按收录场次数降序排列；同数量保留既有顺序，正文与目录顺序一致。
- 抽出仍然存在的章节中的部分内容时，用新章的 `legacySections` 逐项登记原 chapter 与旧锚点；不能用 `legacyChapters` 接管整个原章。旧整章笔记和已读保持原归属，新章独立记录。
- 题目按原场次整理。无法确定公司、轮次或日期时保持未知；多人汇总、原创训练和官方作业明确标注，不能改称一场真实面试。缺失代码或不完整题干保留缺失说明，不补造原题。
- 每个完整答案说明合同、机制、具体例子、工程取舍与验证；编程题说明算法、关键实现、复杂度和边界。五年经验是解读深度，不是对原候选人年限的判断，也不能编造读者的项目经历。
- `evidence/interview-question-coverage.json` 登记概括题干和答案锚点。题目以 `data-interview-question` 标记，全文搜索直接跳到题目并展开；打印展开全部答案。新增或合并题目后运行 `node scripts/check_interviews.js`，并实际验证重复题跳转、返回、旧笔记和离线入口。
- `config/interviews.json`：每条记录有稳定来源 ID、公司、题目、原文 URL、事件/帖子日期、身份与经验、主题、局限、整理核验日期。
- `category` 只能是 `report`、`job`、`takehome`、`reading`。官方 JD、个人面经、官方作业和第三方练习不能互相替代。
- `config/companies.json`：公司卡片、来源 ID 和关联章节 ID。公司组必须明确包含哪些公司，不把一个多家公司帖子里的所有题分配给每家公司。
- 不用搜索摘要生成面试事实；保留原始身份、不确定日期、历史岗位状态。一次面经不表示固定题库，也不能由样本数推出出题概率。

## 岗位收藏

`config/jobs.json` 独立维护岗位，`#jobs` 为列表、`#job/<id>` 为详情；`jobs.html` 内嵌同一应用和数据并默认打开列表。添加岗位时使用稳定 ID、官方 URL、来源编号、核验日期、地点、招聘类型、经验、职责、基本要求与加分项；旧官方来源通过 `sourceId` 关联，不把面经当作在招 JD。新增记录自动出现在页面和全站搜索中。

`origin` 为 `user` 或 `research`；`direction` 取“编译器与DSL”“算子与性能优化”“硬件性能与软硬协同”。`status` 为 `listed`（核验时官方可见）、`closed`（有下线证据）、`unverified`（当前状态未确认）。同时填写 `verification`、`sourceType` 与 `evidenceUrls`，来源记入 `evidence/job-sources.md`。发布日期不能用抓取日期代替。

`relevance` 是本站解读，分关联理由、可展示的证据和建议补齐的能力，不代表雇主认可。`chapters` 必须引用存在的准备章节。要求以概述为主；原文中的“优先”“desired”不能改写为必须。没有提供的年限、学历或地域不推测。本地关注存于独立浏览器键，不包含在原笔记导出中，也不会上传。

验收包括列表多词搜索、公司/方向/状态组合筛选、清空筛选、详情直达、关注持久化、官网和章节链接、全站搜索、手机与打印布局，以及 `file://` 打开 `jobs.html`。运行 `node --check web/jobs.js` 并执行现有构建和内容检查。

## Coding 与验证

原创 CPU 参考在 `practice/`。Python 正文示例用 `<pre data-reference="函数名"><code>…</code></pre>`，静态检查会与 `practice/reference.py` 的 AST 源码片段比较，避免正文代码漂移。C++、CUDA 示例另行检查。

测试优先验证不变量、边界、独立 oracle 与变换前后等价，不复制实现。CUDA 示例当前没有 GPU 编译或执行验收，增加实测时须记录设备、版本、数值标准、计时方法和 launch 合同。

```bash
python3 scripts/build.py
python3 scripts/check.py
python3 scripts/check_public_artifact.py
python3 -m unittest discover -s scripts -p 'test_public_artifact.py' -v
node --check web/app.js
node --check web/catalog.js
node --check web/reading.js
node --check web/pe-explorer.js
node --check web/moe-explorer.js
node --check web/decode-explorer.js
node --check web/attention-lab.js
node --check web/sync-explorer.js
node --check web/performance-explorer.js
node --check web/jobs.js
node scripts/check_pe_model.js
node scripts/check_moe_model.js
node scripts/check_decode_model.js
node scripts/check_attention_lab.js
node scripts/check_sync_model.js
node scripts/check_performance_model.js
python3 -m unittest discover -s practice -v
TMPDIR=/data/wangxw/tmp g++ -std=c++17 -Wall -Wextra -Werror \
  -fsanitize=address,undefined practice/coding.cpp \
  -o /data/wangxw/tmp/interview-coding-check
/data/wangxw/tmp/interview-coding-check
```

浏览器验收包括主题/专题、旧深链接、目录筛选、公司来源筛选、全文搜索、图示放大、实验计算、笔记、问答、移动端与打印。构建产物 `dist/` 不提交；push 到 `main` 后由 GitHub Actions 构建并发布，发布完成再核验线上内容。

以上是检查入口索引，按修改范围选择对应模型与界面检查；[CI](../.github/workflows/pages.yml) 执行完整清单。仅文档调整且构建结果逐字节不变时，验证文档链接与命令即可，不必重录所有页面交互。公开产物检查在每次发布前必跑，构建成功并不表示整个 `dist/` 都可以公开。

## CUDA 与 GPU 通信教程

依据用户 2026-10-30 对 H200 开篇的反馈，硬件入门按“具体产品整体 → 硬件分组 → 单个 SM 内部 → 存储归属 → 跨块协作”逐层放大。图中标明启用单元数、每级资源数量与来源，完整芯片设计和产品实际启用配置分别展示；不要以“省略实际 SM 数量”的抽象框代替整机认识。物理 GPC/TPC、程序 grid/block/cluster、CTA 的 Shared 对象与 SM 的 SRAM 预算需明确区分。

`cuda` 知识域固定两篇连续入口：`cuda.html`（Hopper 与算子开发）和 `cuda-communication.html`（通信库与多卡部署）。正文分别在 `content/24-cuda-hopper.json`、`content/25-cuda-communication.json`；保留稳定章节与小节 ID。

`web/cuda-guide.js` 提供 `data-cuda-lab="occupancy"`、`"ring"`、`"communication"` 三种交互；构建时与 CSS 内嵌，不依赖外部网络。修改模型运行 `node scripts/check_cuda_model.js`：资源上界用可行 CTA 枚举检查，Ring 用贡献守恒与直接求和检查，softmax 用完整向量 oracle 检查。教学上界不包含分配粒度、动态寄存器和集群调度；通信模型不预测 NCCL 自动算法或实测带宽。

新增图分别注明数据输入、归约轴、参与组、结果归属、字节方向与比较条件。NCCL、DeepEP 的接口和后端绑定版本；H200 标称规格、FA3 论文结果与现场实测分开。检查桌面、移动横向滚动/放大、Ring 前后步与重置、参数变化、打印当前假设/末态、独立 HTML 离线交互。

## PE 交互演示

正文用 `<div data-pe-explorer="mapping"></div>` 或 `<div data-pe-explorer="budget"></div>` 声明挂载点。纯数学模型在 `web/pe-model.js`，展示与事件在 `web/pe-explorer.js`，样式在 `web/pe-explorer.css`，构建时一起内嵌。不要在章节 JSON 中加入脚本。

`mapping` 只适用于 normal KC FP8 权重布局。它按实际 pack/RTL 位切片解释坐标，但小整数归约例子没有模拟舍入或 RTL 时序。`budget` 中 R、频率和发射率是显式条件参数；它计算 weight 供数上界和 AL1 输入容量，不取代编译器代价模型。

修改映射需同时核对 pack 与硬件 slice，并运行 `scripts/check_pe_model.js` 的完整字节空间、独立反向映射与直接点积 oracle。修改界面需检查 C128/C256、最后一个字节、单/双 hub、w 改变造成的驻留翻转、当前状态放大与打印。新增其他格式时独立建立公式与证据，不能只换显示标签。

## MoE 部署交互

正文用 `<div data-moe-explorer></div>` 声明挂载点，模型与展示在 `web/moe-explorer.js`、样式在 `web/moe-explorer.css`，构建时内嵌。固定当前版本的 H=4096、E=288、I=2048、K=8、卡间 EP4、卡内 TP4；`T` 一律表示全局 token 数，均匀输入示例中每卡为 T/4。不要让可调参数悄悄变成另一模型。

交互用连续的每卡 72 专家归属、I/TP=512 的矩阵分片解释 rank；容量仅计算 Routed FP8 与 Shared BF16 的纯矩阵。通信只计算 BF16 张量元素大小，不把 AllGather 结果容量写成物理线上流量，不从理想均匀 Top-8 分配宣称真实路由均衡。Shared 的真实权重归属和开发脚本零占位分配分开说明。

修改公式时运行 `scripts/check_moe_model.js`，核对全部 1,152 个专家分片与总容量守恒。浏览器检查 T8/16/24/32、EP0/EP3、TP0/TP3、专家 0/71/72/287、非法编号处理、手机与打印；打印保留当前选择和计算结果，隐藏不能操作的控制器。

依据用户2026-10-28的反馈，MoE部署正文优先沿torch_zeus已优化的实现讲一条完整数据路径；历史验收版本放证据或折叠补充。每个collective必须说明参与组、传递对象、前后shape/dtype、拼接或求和语义、输出归属和下游消费者；从Attention的输出合并，经两侧mHC，到MoE返回原请求都要闭合。KDA与DSA各按真实接线说明，不能套用同一个SUM。图中shape取正式GLM-5.3-Flash配置，构造batch/route须另外标记。依据同日对Reduce讲解的反馈，总流程入口必须用同一token、同一输出特征的数值，明确本地专家加权、TP分片求和、EP专家求和三个轴；相同shape须标注完成程度，说明I分片的计算范围不等于通信张量宽度。`data-moe-flow`交互追踪T24的token所有权，数值只作实数求和模型；用不均匀路由、重复Shared和重复SUM反例验证，不把交互作为设备运行证据。

## Decode 教程的交互账本

正文使用 `<div data-decode-explorer="attention"></div>` 或 `<div data-decode-explorer="ffn"></div>`。`web/decode-explorer.js` 与 CSS 在构建时内嵌，不依赖服务或外部资源。Qwen3-8B 固定 H4096、Q32、KV8、D128、I12288、36 层；BF16 是显式教学口径。MHA32 / MQA1 仅为相同维度的反事实对照，不是另一份 Qwen 配置。

Attention 的 N 包含本步新 token，按等长请求、每步每请求一个 query 计数；完整逻辑 KV 扫描不能写成测得的 HBM 流量。FFN 展示单层 Dense 三矩阵的理想权重复用，N 不改变其矩阵工作量。更新时运行 `node scripts/check_decode_model.js`，并验证两独立入口、旧章节/笔记、搜索、图示放大、B/N 变化、移动与打印。


## Attention 逐步动画

正文使用 `<div data-attention-lab="flash"></div>`；支持 `flash`、`decode`、`rope`、`heads`、`mla`、`sparse`、`state`、`fa3-pipeline`、`paged`。`fa3-pipeline` 解释 FA3 异步完成依赖；时间格只表示教学先后与可重叠关系，不代表 GPU 周期或实测加速。`web/attention-lab.js`/CSS 在构建时内嵌，由 `initAttentionLabs()` 挂载，不依赖外部资源。页面默认静止，提供前后、重置、播放、键盘与步骤直达；页面切换、隐藏、离屏与打印停播。打印输出完整步骤与最终静态图。通用图示放大忽略 `.attention-lab` 内部SVG，避免替换/包裹破坏动画。

新增例子须声明玩具维度与真实模型维度的边界，数据变化由可复算数值驱动。数学函数由 `node scripts/check_attention_lab.js` 的独立oracle校验；动画不代表GPU计时或硬件性能。RoPE示例必须区分当前新K与历史K；固定状态必须明确key/value轴、门控顺序与跨步保存语义。

## LLVM / MLIR 两篇教程

`compiler` 主题只显示两篇连续长文，由 `readingCollection: true` 展示两卷入口和模块目录；两卷分别生成 `compiler-foundations.html` 与 `llvm-backend.html`。基础组件正文在 `content/50-compiler-internals.json`，后端正文在 `content/51-llvm-backend.json`。普通主题保留原来的专题目录。

编译器机制的正文必须能帮助读者做出实现决策：用具体输入说明目标变换与合法性，沿实现展开关键分支、数据结构和维护的不变量，再对照输出解释成功或失败。源码路径、术语表、章节数量与几条合法汇编不能作为深度验收。核心机制至少给出一个边界或错误做法，并说明 verifier、语义 oracle、静态代码观察分别能发现什么；不能把 verifier 通过写成等价性证明。可运行的原创 Pass、IR、MIR 和驱动保存在 `practice/llvm/`，正文中的命令、关键输出与实验脚本同步维护。

后端按“总图 → 目标与 ABI → 指令选择 → Machine IR 与调度 → RA → 栈帧与输出 → 调试”分层。扩充 RA 时，在 `backend-stage-ra` 增加独立 section，说明输入、约束、核心机制、输出不变量、源码和最小 MIR；同步把 section ID 加入该 stage。已有 `ra-liveness`、`ra-greedy`、`ra-spill` 不改名。新增大主题可增加 stage，但仍保留这一篇完整 HTML，不把每个 Pass 再变成首页卡片。

图必须区分顶层 CodeGen Pass 与 SelectionDAG 内部的 combine/legalize/select。目标与版本差异显式标明，不能把某次 x86 pipeline 宣称为全部后端的固定列表。共享源码没有可用 Git 元数据时，记录文件 SHA256，不编造 commit。原创输入保存在 `practice/llvm/`，核对记录见 `evidence/compiler-guides-sources.md`。旧七章的深链接和笔记通过 `legacyChapters` 迁移，不把旧章的已读状态当成新长文完成状态。
