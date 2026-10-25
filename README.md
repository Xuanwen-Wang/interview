# AI Compiler Field Notes

从 Transformer 与 GLM5Next，到 518 / Zeus、Triton 后端与真实优化证据的中文面试指南。

**在线阅读：[xuanwen-wang.github.io/interview](https://xuanwen-wang.github.io/interview/)**

**[岗位收藏](https://xuanwen-wang.github.io/interview/jobs.html)**：集中查看 9 个编译器、算子性能与异构硬件岗位，按公司、方向、状态和要求关键词筛选；直接读职责、要求和加分项，跳转官网或准备章节。2026-10-25 复核，区分官方可见、已下线与待复核。关注标记仅保存在当前浏览器。

围绕“模型语义 → 算子 → 硬件映射 → 编译分析与变换 → 指令与验证”组织。内容面向已有项目经验、希望重建算法基础并准备资深 AI 编译器面试的工程师。

## 内容与导航

当前使用 **8 个知识域 → 18 个专题 → 41 章** 的目录结构。侧边栏只展开当前专题；全站目录支持主题、标题/标签与阅读状态筛选。已有章节链接、笔记和学习记录保留。

| 知识域 | 内容 |
| --- | --- |
| 开始与路线 | 岗位能力、项目叙述、工程证据 |
| 算法与数据流 | 两篇 decode 入门长文：Attention 的历史状态与长上下文；FFN 的参数、路由与权重复用。真实 shape 图贯穿计算和访存 |
| GLM5Next 300B真实部署 | MoE 单篇：卡间 EP4、卡内 TP4 → token 往返 → Router/Shared/Routed/Reduce → 通信与验证；完整模型与 Attention 另有专题 |
| Triton · MLIR · LLVM | AST/TTIR/布局、Op/Region/Dialect、PassManager与分析失效、Rewrite/Conversion、LLVM中后端 |
| 518硬件与后端 | 真实pass、PE/MAC、minitile、AL1/WL1、hub/credit；VP wide/pipe、PRG、PostCal、多执行器；资源事件与InjectSync |
| 性能与推理系统 | Nsight / Profiler、算子画像、Roofline、通信分析、模型负载、并发与容量、服务与运行时 |
| 公司与面经 | 12个公司或公司组、28条来源，区分官方JD、个人面经、官方作业与第三方材料 |
| Coding实作 | 算法、图/数据流、kernel、玩具pass；原创Python/C++参考与测试 |

当前 **399 小节、296 道追问、130 张正文 SVG**。附全文搜索、图示放大、3个通用交互实验、2个PE交互演示、1个MoE拓扑/容量交互、3个性能分析实验和2个decode shape/字节交互、术语表、阅读进度及本地笔记导入导出。SVG、样式和内容均内嵌；网页不依赖CDN、外部字体或第三方脚本。

- [性能分析完整长文](https://xuanwen-wang.github.io/interview/performance.html)：27节、15道追问，串联 Nsight Systems / Compute、PyTorch Profiler、Roofline、算子画像、通信与模型负载；含3个交互教学实验，可独立离线阅读。
- [性能分析审查与验收](evidence/review-performance-analysis.md)：来源、公式口径、教学边界与浏览器验证。
- [Attention 全篇重写与动画](evidence/review-attention-teaching.md)：RoPE逐维计算、Flash/Flash-Decoding逐块与分片合并、MLA/DSA/Linear/Delta/KDA沿问题背景、节省和代价展开；7类可播放数据流，12道追问。
- Attention / FFN decode 教程：原算法域 12 章合并为两篇，各一个 HTML；24 + 18 节、39 张真实 shape 或明确标注的教学图、2 个交互账本。旧 87 个内容锚点与个人笔记保留。详见[重构与验收](evidence/review-decode-guides.md)。
- [MoE 完整长文](https://xuanwen-wang.github.io/interview/moe.html)：34节、9个阅读阶段、18道追问；按卡间EP4、卡内TP4，用T24贯穿部署与四个kernel。并列真实权重验收配置绑定链和当前开发四核链，保留旧15章/107节链接及个人笔记。
- [MoE 单篇重构与验收](evidence/review-moe-continuous.md)：固定版本、纠错、旧链接迁移与浏览器验证。
- [PE 完整长文](https://xuanwen-wang.github.io/interview/pe.html)：一个 HTML，沿整体边界与接口 → 8×8 阵列 → ALU/MAC → 累加与写回 → minitile 连续展开；23节、21张图、2个交互；新增MTW/MTC/MTK本质、GLM5Next Gate/Up/Down真实配置与逐坐标映射。
- [VP 完整长文](https://xuanwen-wang.github.io/interview/vp.html)：开头展开完整 RTL 架构，沿控制/CDC/ECC、X/Y 分流、A/B 向量链、归约/反馈到写回，再讲 TopK、sigmoid、RMSNorm 与 CUDA；30节、21张图、27道追问。
- [VP 架构审查与验收](evidence/review-vp.md)：RTL与编译器固定来源、关键事实修正及网页验收。
- [模型到部署重构审查](evidence/review-model-deployment.md)：算法与部署分层、固定版本、交叉审查和网页验收。
- [PE minitile 与 GLM5Next 实例审查](evidence/review-pe-minitile-glm.md)：源码显式配置、默认模型、历史产物与硬件映射的证据边界。
- [PE 单篇重构审查](evidence/review-pe-continuous.md)：旧链接、笔记迁移、连续阅读与离线验收。
- [此前 PE 微架构审查](evidence/review-pe-v3.md)：原六章的数据路径与 RTL 证据。
- [第二版审查与验收](evidence/review-v2.md)
- [第一版审查与验收](evidence/review-and-validation.md)
- [扩展指南](docs/authoring.md)：未来添加中端Pass、模型部署、新公司或Coding专题的方法。
- [Coding参考实现](practice/README.md)：CPU测试范围及未运行CUDA的明确边界。

## 模型到部署的阅读顺序

先读算法与数据流的两篇连续教程：[Attention](https://xuanwen-wang.github.io/interview/attention.html) 从 Qwen3-8B 和内部 GLM5Next300B 的完整模型图出发，讲 GQA 全历史读取、在线 softmax、MLA、稀疏检索与递归状态；[FFN](https://xuanwen-wang.github.io/interview/ffn.html) 从三矩阵走向专家选择、归组与合并，分清总参数、激活参数和 batch 权重复用。图与交互计算采用显式模型维度和教学字节口径，不是硬件实测。随后进入 [GLM5Next 300B 真实部署](https://xuanwen-wang.github.io/interview/#module/moe)，沿卡、rank、token 到四个 kernel，继续 KDA/DSA 部署专题。

2026-10-25复核发现：真实权重300B验收配置绑定较早SGLang/torch的FP8 UScale链，当前开发四核链则使用BF16 Shared与per-tensor FP8 Routed；卡间EP4、卡内TP4一致，不代表两条执行链已经集成。开发caller未传配置中的clamp=10、KDA v3.1/v4接口断点等均在文中保留，没有将两仓各自最新代码包装成已联调通过的部署。

## 本地使用

需要 Python 3.9+；构建无第三方依赖。

```bash
python3 scripts/build.py
python3 scripts/check.py
python3 -m http.server 8768 --bind 127.0.0.1 --directory dist
```

也可以直接打开 `dist/index.html`，或用 `dist/attention.html`、`dist/ffn.html`、`dist/moe.html`、`dist/pe.html`、`dist/vp.html` 从头到尾阅读对应长文。性能分析长文可直接打开 `dist/performance.html`。正文与应用可离线阅读，外部来源链接需要网络。笔记仅存在当前浏览器的 localStorage，不会上传；不同域名、设备之间需要手动导出导入。

`dist/jobs.html` 可单独保存并离线查看岗位要求；岗位来源和状态边界见 [岗位核验记录](evidence/job-sources.md)。

## 维护

```text
config/              主题/专题结构、公司与面经来源索引
content/             章节与问答 JSON
practice/            原创参考实现及验证
docs/                扩展规范
web/                 页面、样式、交互逻辑
evidence/            固定版本来源、审查与验证记录
scripts/build.py     生成单文件 HTML
scripts/check.py     检查内容与站内引用
.github/workflows/   构建和 GitHub Pages 发布
```

内容变更优先修改 JSON；不要手改生成产物。新增真实项目结论须同时更新证据文件，并区分当前源码、历史实测、建模推导和本人陈述。源码库权限与本指南权限独立；原始链接可能要求登录。

## 证据边界

第一版于2026-10-23建立，第二版于2026-10-24扩展，PE专题于2026-10-25按真实数据路径重构。内部 GLM5Next 与公开 GLM-5 不是同一个模型配置。CycleSim、VCS、局部 kernel、Graph 回放与硅上端到端是不同层级。历史性能仅按原记录范围转述；本仓库构建与网页验收不意味着重新运行了芯片测试。

用户已明确选择公开仓库与公开 GitHub Pages。本仓库只发布指南、必要技术概述和来源定位，不包含业务仓库全量源码、模型权重、原始业务数据、凭据或运行环境文件。

本指南持续扩展，不宣称穷尽 AI compiler 学科。后续深入方向见 [阅读路线](content/00-core.json) 和 [证据说明](evidence/README.md)。
