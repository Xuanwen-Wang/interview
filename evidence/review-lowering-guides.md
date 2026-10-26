# 518 Lowering 与同步长文重写验收

日期：2026-10-26。范围为指南内容、导航与交互；业务源码只读，没有构建编译器或运行模型/仿真。

## 成品与架构主线

- `lowering.html`：一个连续 chapter，32 节、8 个阅读阶段、13 张原创 SVG、8 阶段信息变化交互。
- `sync.html`：一个连续 chapter，26 节、5 个阅读阶段、9 张原创 SVG。
- 硬件约束 → 需要保留的语义 → 设计选择 → 成本和反例 → CUDA/GPU 对应职责。主文使用明确的 BF16 [6,32]、tile [4,32] 教学示例；真实地址案例独立标注。
- 同步由资源和事件讲起，逐步加入物理复用、无标签计数通知、阶梯规划、循环与分支，再讲验证边界和历史演进。
- 原硬件模块保留 `hardware`，旧 `attention.html#module/hardware` 入口仍有效。6 张编译卡片收成完整 Lowering 入口，旧同步内容合成独立长文，PE/VP 配套长文保留。

## 技术正确性

三份独立审稿没有发现未解决的阻断问题。已处理以下实质问题：

1. 设备入口以 ZECC / zeus-compiler 和离线分段路径为准，不把 CPUBackend 完整 llir/obj 流水线误画为设备必经链。
2. 以当前源码确认先展开 CFG、分配执行器，再 InjectSync；RA 在后续 CodeGen。旧设计顺序只作为历史说明。
3. BR、descriptor 身份、物理内存身份及 BR 驻留分开；逻辑宽度、物理 pitch、masked-load padding 与空核分别承担不同合同。
4. 不走 SelectionDAG 仍有合法化、指令选择、RA 与最终取指约束。早期方案仅据本人回忆，不虚构历史决策原因。
5. 地址案例的 PE 下标改为同一队列的命令序号；FileCheck 预期不写成新运行结果，分配偏好不等于免同步证明。
6. 同步明确 PE destination 当前只写、默认 staircase 无自动 fallback，以及 C2/C3 的已知证明范围。
7. crossing 回归的依赖在 admission 已合并，仅支持最终 token 结果；四点 suffix-min 是独立教学推导。历史清单采用 AuthorDate。
8. CUDA 同样存在异步依赖、tensor map 和完成协议。比较明确到责任边界，不作统一硬件优劣判断。

当前源码依据：`triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a`，相关引用文件无本地修改；全仓另有无关 tracked 与 untracked 内容。详细文件、hash 和版本范围见 [中端](lowering-midend.md)、[后端](lowering-backend.md)、[同步](sync-lowering.md)、[地址案例](lowering-architecture.md)。本文不是新编译结果、CycleSim/VCS 或硅上验收。

## 初学者可理解性

补齐 GDG、L2、Weight DRAM、BR 的术语入口；先给整体路线和贯穿例子，再展开 pass。控制流抬升说明其服务于区域结构识别的动机。同步区分硬件 credit 计数与编译器 token/FIFO 证明模型。每阶段都有输入、输出、约束与失败反例，复杂实现来源可在 HTML 内展开，外部源码权限不阻断正文阅读。

## 视觉与交互

- 实际 Chromium 截图逐张审查 22 张图；未发现文字越界、遮挡或不明连线。地址图措辞修正后又核对打印图。图注统一编号，注明非按比例或非性能时序。
- 桌面 1720×1050 与手机 390×844：两篇正文及硬件目录没有页面横向溢出；较宽图表在容器内查看，图示可以放大。
- 8 阶段切换、Home/End 键与边界按钮；全文搜索；独立 HTML 下载；章内来源链接在本页展开；无浏览器脚本错误。
- A4 打印生成 38/25 页，技术 details 展开，8 个交互面板全部保留。检查全部页面文字边界，并抽查首尾与关键图页，未见页面外文字。
- 断网后直接打开两个独立 HTML，正文、交互和内嵌来源可用；外部文档链接仍需网络。初次离线脚本过早读取 visibility，改为等待 hash 路由展开后复核，无需修改应用。

## 链接与学习记录

- 旧 10 个 chapter ID 与 70 个正文/内嵌锚点全部显式映射；浏览器逐项核对路由和目标 DOM。
- readingVersion 1 与 2 均保留原笔记和 legacyRead；旧章节已读不等同于新版整篇已读。
- 从旧笔记深链接实际打开原笔记；新的面试题不冒用不同语义旧题的熟练度。
- 既有迁移模型检查通过，包含 read/practice 与笔记迁移。未修改存储格式或导出协议。

## 执行的检查

```text
python3 scripts/build.py
python3 scripts/check.py
python3 scripts/check_public_artifact.py
node --check web/lowering-explorer.js
node --check web/app.js
node --check web/catalog.js
node scripts/check_moe_model.js
git diff --check
```

构建为 8 个知识域、28 章、378 节、241 个追问、142 张正文 SVG；公开产物检查覆盖 13 个允许文件。浏览器验收只使用独立临时配置中的测试笔记，不接触用户浏览器数据。

## 交付状态

初稿在隔离工作树完成，回写前以任务开始时的文件 hash 核对原目录，保留原有未提交工作。用户随后授权推送 GitHub。发布集成从 origin/main 的 128fcbd 开始，仅移植本任务差异，保留已发布的岗位、性能分析与 LLVM 教程。沿用用户此前选择的公开指南仓库；简历继续独立，未改远端权限。提交时本地检查通过，CI 与线上核验须另行确认。

## 发布集成补充

基于远端最新 main 的成品为 28 章、408 节、253 个追问、146 张正文 SVG，保留 9 个岗位与 jobs.html，共 14 个允许发布文件。岗位记录只迁移关联的旧章节 ID 并去重；不改变岗位资料。原本地未提交的规则和隐私工具不混入本次提交；公开产物扫描使用本机已有工具，以本次发布树的 portableReading 与 jobs 配置确定允许文件。
