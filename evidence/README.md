# 来源与证据约定

本指南于 2026-10-23（Asia/Shanghai）开始整理。

| 类型 | 可以支持 | 不能自动支持 |
| --- | --- | --- |
| 用户材料 / 本人陈述 | 准备目标、职责叙事、待核实经历 | 独立核验的贡献统计 |
| 一手论文与官方文档 | 方法定义、公开模型、工具契约 | 本芯片的实际性能 |
| 固定版本源码 | 当时的参数、控制流、ABI、pass机制 | 当前生产行为、正确性或性能验收 |
| 历史实验与PR记录 | 原版本、输入与计时边界下的观测 | 本次重跑、其他版本或全模型收益 |
| 教学推导与交互模型 | 假设下可复算的趋势与下界 | 518 / NVIDIA 的测量曲线 |
| 本站验收 | 内容结构、公式抽查、页面功能与发布状态 | 重新完成模拟、RTL或芯片验证 |

## 岗位输入

用户提供了“硬件加速算子实现研发工程师（AI芯片）”与“AI编译器专家（存算与AI）”两份JD截图。本站抽取了算子分析、后端开发、调优、精度、模型接入、IR、资源规划、软硬件协同与测试能力要求，未发布截图原件。

用户自述包括从518指令设计到编译器完善的工作、GLM5Next FFN职责，以及“25%以上MR贡献”。正文明确其属性；本版未执行完整MR比例审计，不把它放在首页作为已证明数字。

## 分领域来源

- [模型与算法演进](model-evolution-sources.md)：Qwen3-8B基线与内部Next配置，算法章节不混入实际部署。
- [整层部署与通信地图](glm-deployment-map.md)：模型、所有权、baseline与FLAT16。
- [Attention当前实现](attention-deployment-current.md)：DSA/KDA kernel与caller/callee兼容边界。
- [MoE当前实现](moe-deployment-current.md)：默认四kernel、可选remap和数值实现。

- [算法与 Attention](algorithms-sources.md)：论文、配置、KDA与DSA当前ABI。
- [MoE 与真实案例](moe-sources.md)：PR作者、状态、固定代码、历史测量边界。
- [硬件与编译器](compiler-sources.md)：资源与真实pass源码索引。
- [算子数据流与上游编译组件](operator-internals-sources.md)：当前实现、版本化上游文档与手算。
- [MoE部署与四kernel深度证据](moe-deep-sources.md)：拓扑、数值合同、通信边界与NV对照。
- [PE硬件与同步深度证据](hardware-sync-sources.md)：RTL指纹、minitile、credit与C1/C2/C3边界。
- [PE minitile字段与选择链](pe-minitile-selection.md)：真实w/c/k、减一编码、完整pin、覆盖表、纯模型复算与历史汇编。
- [GLM5Next专家shape与PE映射](pe-glm-shapes.md)：当前owner Gate/Up/Down、M1/M2/M4配置、Shared区别与逐坐标复算。
- [PE minitile实例审查](review-pe-minitile-glm.md)：图文交叉复核、证据边界及网页验收。
- [VP硬件架构](vp-hardware-rtl.md)：四执行器、wide/pipe、读写口、PRG、归约、格式转换与反压的逐文件RTL证据。
- [VP编译器与kernel](vp-compiler-sources.md)：固定版本的chaining、两种hint、PostCal舍入、参数归属及SiLU配方。
- [VP顶层与控制](vp-top-control-rtl.md)：CTRL/ECC/CDC、四套配置、数据标签与写响应完成。
- [VP完整CAL连线](vp-datapath-rtl.md)：比较/归约双出口、TopK包、S2P与六类专用反馈目标。
- [VP向量引擎逐模块](vp-vector-pipeline-rtl.md)：真实操作数、单写FIFO、跨组SHF和PreCal/PostCal分支。
- [TopK真实路径](vp-topk-operator.md)：Router选择域、原生packet、CT Gather和前缀发布。
- [sigmoid与RMSNorm](vp-rms-sigmoid-operators.md)：真实系数、accurate修正、tile归约次序与共享γ。
- [CUDA固定实现对照](vp-cuda-operators.md)：PyTorch/vLLM源码与NVIDIA版本化文档，区分数学合同和执行组织。
- [VP架构审查与验收](review-vp.md)：正文与图示的交叉核对、独立HTML入口及浏览器验收。
- [公司面经与题源](interview-sources.md)：身份、时间和来源局限。
- [第二版审查与验收](review-v2.md)：目录重构、交叉审阅与新增Coding验证。
- [第一版审查与验收](review-and-validation.md)：交叉审查、修正记录与网页验收。

公开论文中的插图没有直接复制。本站结构图与数学算例为本次独立绘制/推导。原业务仓库仍可能需要原有访问权限，本指南公开并不会改变它们的权限。
