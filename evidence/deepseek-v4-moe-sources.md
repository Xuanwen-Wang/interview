# DeepSeek V4 MoE 公开资料核验

采集日期：2026-10-28。本文是官方报告与公开参考代码的静态核验；交互数字是教学输入，没有执行模型、训练或硬件性能测试。

- [DeepSeek V4 技术报告](https://arxiv.org/html/2606.19348)：§2.1 的专家体系、分数、负载均衡、节点限制及 Hash；§4.2.1 的模型配置；§4.2.3 的训练稳定性；§5.2.1 的 FP4 QAT。报告为 arXiv 2606.19348，具体版本以链接为准。
- [DeepSeek V3 技术报告](https://arxiv.org/abs/2412.19437)：§2.1.2、§4.2 的 sigmoid、选择偏置、辅助损失、专家数、前三层 Dense 与节点限制。
- Hugging Face 官方 `deepseek-ai/DeepSeek-V4-Flash`，revision `60d8d70770c6776ff598c94bb586a859a38244f1`，`config.json` 和 `inference/model.py` 的 Gate、Expert、MoE 与 Block；读取于该固定远端 revision，未使用本地源码工作树。
- Hugging Face 官方 `deepseek-ai/DeepSeek-V4-Pro`，revision `b5968e9190ef611bbf34a7229255be88a0e937c1`，`config.json`；读取于该固定远端 revision。
- 实例中的 8 个专家、top-3、bias、hash ID 和 logit 是虚构的教学输入；真实模型的 256/384、top-6 与缩放值来自配置。FP4 容量仅统计矩阵数据位，不包括 scale、对齐与其他模块。
- 后续 [V4.1-Flash](https://deepseek.com/en/news/deepseek-v4-1-flash/) 与本篇 V4 Flash / Pro 独立；不可混用模型结构和规模。
