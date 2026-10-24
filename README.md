# AI Compiler Field Notes

从 Transformer 与 GLM5Next，到 518 / Zeus、Triton 后端与真实优化证据的中文面试指南。

**在线阅读：[xuanwen-wang.github.io/interview](https://xuanwen-wang.github.io/interview/)**

围绕“模型语义 → 算子 → 硬件映射 → 编译分析与变换 → 指令与验证”组织。内容面向已有项目经验、希望重建算法基础并准备资深 AI 编译器面试的工程师。

## 内容与导航

第二版使用 **8 个知识域 → 16 个专题 → 55 章** 的目录结构。侧边栏只展开当前专题；全站目录支持主题、标题/标签与阅读状态筛选。已有章节链接、笔记和学习记录保留。

| 知识域 | 内容 |
| --- | --- |
| 开始与路线 | 岗位能力、项目叙述、工程证据 |
| 算法与数据流 | Transformer、GQA/KV、FlashAttention、MLA/DSA、KDA，以及真实算子形状/字节/状态推导 |
| MoE全栈实战 | EP4×TP4部署、Router/Shared/Routed/Reduce、Sigmoid/TopK/GEMM、token merge、通信、overlap、NVIDIA对照范围 |
| Triton · MLIR · LLVM | AST/TTIR/布局、Op/Region/Dialect、PassManager与分析失效、Rewrite/Conversion、LLVM中后端 |
| 518硬件与后端 | 真实pass、PE/MAC、minitile、AL1/WL1、hub/credit、资源事件、InjectSync阶梯/循环/验证边界 |
| 性能与推理系统 | Roofline、并发与容量、服务与运行时 |
| 公司与面经 | 12个公司或公司组、28条来源，区分官方JD、个人面经、官方作业与第三方材料 |
| Coding实作 | 算法、图/数据流、kernel、玩具pass；原创Python/C++参考与测试 |

当前 **385 小节、285 道追问、60 张正文 SVG**。附全文搜索、图示放大、3个交互实验、术语表、阅读进度及本地笔记导入导出。SVG、样式和内容均内嵌；网页不依赖CDN、外部字体或第三方脚本。

- [第二版审查与验收](evidence/review-v2.md)
- [第一版审查与验收](evidence/review-and-validation.md)
- [扩展指南](docs/authoring.md)：未来添加中端Pass、模型部署、新公司或Coding专题的方法。
- [Coding参考实现](practice/README.md)：CPU测试范围及未运行CUDA的明确边界。

## 本地使用

需要 Python 3.9+；构建无第三方依赖。

```bash
python3 scripts/build.py
python3 scripts/check.py
python3 -m http.server 8768 --bind 127.0.0.1 --directory dist
```

也可以直接打开 `dist/index.html`。正文与应用可离线阅读，外部来源链接需要网络。笔记仅存在当前浏览器的 localStorage，不会上传；不同域名、设备之间需要手动导出导入。

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

第一版于2026-10-23建立，第二版于2026-10-24扩展。内部 GLM5Next 与公开 GLM-5 不是同一个模型配置。CycleSim、VCS、局部 kernel、Graph 回放与硅上端到端是不同层级。历史性能仅按原记录范围转述；本仓库构建与网页验收不意味着重新运行了芯片测试。

用户已明确选择公开仓库与公开 GitHub Pages。本仓库只发布指南、必要技术概述和来源定位，不包含业务仓库全量源码、模型权重、原始业务数据、凭据或运行环境文件。

本指南持续扩展，不宣称穷尽 AI compiler 学科。后续深入方向见 [阅读路线](content/00-core.json) 和 [证据说明](evidence/README.md)。
