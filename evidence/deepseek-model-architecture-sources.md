# DeepSeek V3 / V4 公开架构来源

采集日期：2026-10-28。两篇文章只分析公开发布的模型与官方参考实现。证据层级为论文、固定配置/代码静态核验及原创教学推导；未新增模型推理、精度、GPU或部署性能实测。

## 版本范围

- V3：原始 DeepSeek-V3 报告 arXiv 2412.19437v2。V3-0324、V3.1、V3.2、R1 不与其混用。
- V4：官方 DeepSeek-V4-Flash / Pro，报告 arXiv 2606.19348v1。以 Flash 的真实 shape 为主线，Pro 单列差异；不混入后续 V4.1。
- V4 效率图的分母是 V3.2，不能写成原始 V3；等效 FP8 FLOPs、缓存大小、推理时延各自独立。

## 固定的官方来源

V3 GitHub revision：`9b4e9788e4a3a731f7567338ed15d3ec549ce03b`；HF revision：`e815299b0bcbac849fa540c768ef21845365c9eb`。

| V3 文件 | 原始地址 | SHA256 |
| --- | --- | --- |
| `report.html` | [固定来源](https://arxiv.org/html/2412.19437v2) | `e1196044c4de66dbe0ce682f40585ae7a13cc212c98ccf344d2855f41a330536` |
| `model.py` | [固定来源](https://raw.githubusercontent.com/deepseek-ai/DeepSeek-V3/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py) | `fdb7995bc234badbf0011b5af8cf391be94343abc51305428cb9a04452116f02` |
| `config_671B.json` | [固定来源](https://raw.githubusercontent.com/deepseek-ai/DeepSeek-V3/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/configs/config_671B.json) | `d21d797509598ffaa7c22686abdf3a94e38f31a6193dc158fffe0a6fb6ef5010` |
| `generate.py` | [固定来源](https://raw.githubusercontent.com/deepseek-ai/DeepSeek-V3/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/generate.py) | `d1a5db4b9bc602ce5b7f875475c07e675c9c3aa58e5539f6cd187d0e1b813dec` |
| `README.md` | [固定来源](https://raw.githubusercontent.com/deepseek-ai/DeepSeek-V3/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/README.md) | `1f766f151bb4d501b18c9d1e229ac25682c68c75893d6d3bc9734e2a60125c0e` |
| `hf_config.json` | [固定来源](https://huggingface.co/deepseek-ai/DeepSeek-V3/resolve/e815299b0bcbac849fa540c768ef21845365c9eb/config.json) | `cbf0b95dc614de208a109bb5fd4e7eed11385e9c68411d2c17db5319443035d9` |
| `tokenizer_config.json` | [固定来源](https://huggingface.co/deepseek-ai/DeepSeek-V3/resolve/e815299b0bcbac849fa540c768ef21845365c9eb/tokenizer_config.json) | `637bcd1a08cf7c772ce6a383196b22930921c79c3c73223c5afc0c7f41545546` |
| `README_WEIGHTS.md` | [固定来源](https://raw.githubusercontent.com/deepseek-ai/DeepSeek-V3/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/README_WEIGHTS.md) | `0d2be8b8c9cb98f3f503f9aa029d1f2907282e68c7cf9429f9f6759ec52c8b23` |

V4 报告：[2606.19348v1](https://arxiv.org/html/2606.19348v1)。

| V4 官方模型 | 固定 revision | 文件入口 |
| --- | --- | --- |
| `deepseek-ai/DeepSeek-V4-Flash` | `60d8d70770c6776ff598c94bb586a859a38244f1` | [config.json](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash/blob/60d8d70770c6776ff598c94bb586a859a38244f1/config.json)、[inference/model.py](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash/blob/60d8d70770c6776ff598c94bb586a859a38244f1/inference/model.py) |
| `deepseek-ai/DeepSeek-V4-Pro` | `b5968e9190ef611bbf34a7229255be88a0e937c1` | [config.json](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/b5968e9190ef611bbf34a7229255be88a0e937c1/config.json)、[inference/model.py](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/b5968e9190ef611bbf34a7229255be88a0e937c1/inference/model.py) |

| V4 相关文件 | SHA256 |
| --- | --- |
| `DeepSeek-V4-Flash-config.json` | `b628e63398a645abc711d92207f8737dd8140f7a4ef1e0a5b3616019e0ddd818` |
| `DeepSeek-V4-Flash-inference-config.json` | `6cc6f816ca73a8d38750194e330398e4f6955b4b45f674f7d29c96da14ccb733` |
| `DeepSeek-V4-Flash-inference-model.py` | `ce962f1face79d4f633d36436576214057a7e11443c9789935e1deb5c6cd1d71` |
| `DeepSeek-V4-Pro-config.json` | `5fe4568daee51c208cb8a79538eaeda090ae011ade1dee2c386aa95f569c810e` |
| `DeepSeek-V4-Pro-inference-config.json` | `a6aded1806a2dbacbbab89bae2380d0422a6d0dcc55c946b421c7f5e06ef6094` |
| `DeepSeek-V4-Pro-inference-model.py` | `ce962f1face79d4f633d36436576214057a7e11443c9789935e1deb5c6cd1d71` |
| `report-2606.19348v1.html` | `08eddfba64ff4833f66d5eb8d40c4dcc6bda37208fc95fa29ce3ef27abe1f494` |

## 关键事实核对

- V3：61主干层；前3层Dense I18432、后58层MoE I2048；MLA每token每层缓存512+64元素。吸收后的实际dot维数变为512+64，但基础scale仍按原Q/K的192维定义。Router组选择按加bias后组内Top2求和；合并weight取原分数、乘2.5。
- V3 MTP：训练中的因果shift、主Embedding/Head各自复用；固定轻量参考forward未实现MTP生成。主Embedding与Head彼此不绑定。
- V4：Flash 43主干层，前2纯SWA、21 CSA、20 HCA；Pro61主干层，前2 HCA、30 CSA、总31 HCA。配置尾部的额外ratio0属于MTP。
- V4：CSA每4token提交一条摘要，前/当前两组的不同投影通道形成8行候选，逐feature沿位置softmax；HCA每128token一条、不执行Indexer选择。所有已选压缩记录和局部窗口共享一次主softmax。
- V4：K=V的512维共享向量，主输出需inverse RoPE，再做分组低秩输出投影。mHC只把残差映射B约束为双随机；pre/post系数不受相同归一约束。
- V4：Hash固定专家身份但保留动态合并weight；FP4 QAT作用范围、shared/routed、主KV与indexer、reference模拟与生产格式分别核对。

## 原创教学与验证口径

- MLA 逻辑缓存账使用 BF16、真实维度；展开/吸收是同参数的不同表示，不是两模型实测。
- CSA 数值图仅画两列、八个候选；权重由教学输入给定，两列独立归一，输出3.25/5.75。没有声称该分布来自真实checkpoint。
- V4 条目交互仅计算对齐前缀的完整摘要、候选与主attention读取数；不将摘要数冒充完整显存或物理HBM读数。
- mHC交互使用合成双随机矩阵，只验证残差混合的局部不变量，不证明整个非线性模型不扩张。
- `scripts/check_deepseek_model.js`：单位与固定数值、边界输入、mHC行列和/凸组合、独立小矩阵的MLA吸收等价与错误softmax反例。
