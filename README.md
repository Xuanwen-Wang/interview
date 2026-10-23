# AI Compiler Field Notes

从 Transformer 与 GLM5Next，到 518 / Zeus、Triton 后端与真实优化证据的中文面试指南。

**在线阅读：[xuanwen-wang.github.io/interview](https://xuanwen-wang.github.io/interview/)**

围绕“模型语义 → 算子 → 硬件映射 → 编译分析与变换 → 指令与验证”组织。内容面向已有项目经验、希望重建算法基础并准备资深 AI 编译器面试的工程师。

## 内容

- 阅读路线、岗位能力矩阵与项目叙述。
- Transformer、MHA/MQA/GQA、KV cache、FlashAttention、MLA/DSA、KDA。
- 内部 GLM5Next 300B 的真实配置、状态 ABI 与 Attention 路径。
- SwiGLU、MoE、TP4×EP4、Router / Shared / Routed / Reduce、token merge、量化与数值诊断。
- 518 资源与描述符、Triton 接入、SSA/alias、调度与地址分配、InjectSync、寄存器分配和代码生成。
- Roofline、并发与容量、CUDA 对比、模型服务、编译工程与面试推导。

第一版共 **24 章、173 小节、127 道追问**。附全文搜索、章节目录、追问卡、3 个交互实验、术语表、阅读进度及本地笔记导入导出。SVG、样式和内容均内嵌；网页不依赖 CDN、外部字体或第三方脚本。

包含经过独立核算的 CFG→SSA→活跃性→寄存器分配白板练习，以及绑定固定源码的真实地址复用案例。审查问题与复验结果见 [第一版审查与验收](evidence/review-and-validation.md)。

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
content/             章节与问答 JSON
web/                 页面、样式、交互逻辑
evidence/            固定版本来源、审查与验证记录
scripts/build.py     生成单文件 HTML
scripts/check.py     检查内容与站内引用
.github/workflows/   构建和 GitHub Pages 发布
```

内容变更优先修改 JSON；不要手改生成产物。新增真实项目结论须同时更新证据文件，并区分当前源码、历史实测、建模推导和本人陈述。源码库权限与本指南权限独立；原始链接可能要求登录。

## 证据边界

本版于 2026-10-23 整理。内部 GLM5Next 与公开 GLM-5 不是同一个模型配置。CycleSim、VCS、局部 kernel、Graph 回放与硅上端到端是不同层级。历史性能仅按原记录范围转述；本仓库构建与网页验收不意味着重新运行了芯片测试。

用户已明确选择公开仓库与公开 GitHub Pages。本仓库只发布指南、必要技术概述和来源定位，不包含业务仓库全量源码、模型权重、原始业务数据、凭据或运行环境文件。

第一版不宣称穷尽 AI compiler 学科。后续深入方向见 [阅读路线](content/00-core.json) 和 [证据说明](evidence/README.md)。
