# GLM-5.3-Flash 整网与专题重组依据

采集日期：2026-10-28（Asia/Shanghai）。只读查源码与公开配置；未运行模型、设备 kernel、Graph、CycleSim、VCS 或硅上实验。

## 模型身份与公开来源

- 用户确认此前项目称作 GLM5Next 300B 的模型正式命名为 GLM-5.3-Flash。
- [官方模型卡](https://huggingface.co/zai-org/GLM-5.3-Flash)：正式名称、320B总参数、18B激活参数、多模态定位。300B保留为历史开发称呼。
- [固定公开config](https://huggingface.co/zai-org/GLM-5.3-Flash/blob/46a050bec13002ad29ee795c16e61cf4fa3c4a9c/config.json)，revision 46a050bec13002ad29ee795c16e61cf4fa3c4a9c，SHA256 bb8f01c42cb92a52ca72e65afb4d5bd8d11aef083cd210e8de25dfb904f23e9f。
- [固定Transformers模型实现](https://github.com/huggingface/transformers/blob/a672eb5f474b8b30173e9f96eab66adf292da635/src/transformers/models/glm5_next/modeling_glm5_next.py)，commit a672eb5f474b8b30173e9f96eab66adf292da635，SHA256 7870e7ce6ca477d26de3ec79b31d41553b75a09a726c661f04c2e26e790bdf36。
- [配置摘录](glm53-config-snapshot.json)保存公开结构字段，不含权重、用户数据或私有输入。

- [mHC 原始论文](https://arxiv.org/abs/2512.24880)：设计动机与残差混合约束；GLM的具体实现仍以固定源码为准。

## 配置与执行主线

| 对象 | 配置 / 源码事实 | 证据边界 |
| --- | --- | --- |
| 语言主干 | H4096、45层；34 KDA、11 DSA；前三层Dense，其余42层MoE | 核心维度与本地旧语言配置一致；不代表checkpoint逐参数相同 |
| KDA | 64 heads、D128、K4、safe gate | 公开配置定义语义；本地pack/state ABI另核 |
| DSA | 64 query heads、KV latent512、indexer32×128、KPool4 | TopK、pool扩展、cache物理格式和wire分别解释 |
| FFN | Dense I12288；expert I2048、288 routed、Top8、shared1 | 每层权重独立；量化与pack另核 |
| mHC | hc_mult4，Sinkhorn20，ε1e-6；24系数；C行输入/列输出 | 近似双随机仅约束残差混合 |
| final head | HyperHead是四流均值，之后final RMSNorm与LM Head | 不套用其他模型的learned head mix |
| 视觉 | depth24、hidden1024、patch14、temporal patch2、spatial merge2、输出4096 | 本次描述公开分支，没有Zeus多模态验收 |
| MTP | num_nextn_predict_layers=1 | 不计入45主层，不证明服务启用 |
| topology | world16；MoE卡间EP4卡内TP4；其他子层复用rank | 固定开发入口与用户确认，不泛化至所有后端 |

## 关键实现与历史纠正

1. Glm5NextTextDecoderLayer每层有attn_hc和ffn_hc。先pre混四流、主层norm与计算，再用post和comb转置更新residual。
2. C[m,n]表示输入流m到输出流n，矩阵形式CᵀX。非对称循环置换可以发现转置错误。
3. Glm5NextTextHyperHead返回streams.mean(dim=2)。本地mhc_contract_norm融合均值与RMSNorm，但BF16舍入/误差仍需实际验收。
4. 原Attention的v3.1/v4接口断点是2026-10-25历史快照。当前torch_zeus唯一活跃KDA为v3.1，与固定zeus_dev caller版本名一致。本次未联跑；历史v4各节折叠标记。当前v3.1的递推为decay-first，衰减state、outer update与新state有BF16舍入；旧v4的decay-last不作为当前主线。
5. 公开Dense MLP对Gate作上界clamp，对Up作双侧clamp，再做SiLU乘积与Down。
6. Embedding开发caller用full-table DP4×duplicate4；masked接口存在不证明caller使用vocab shard。
7. 当前Head/Sampler直接返回token，仍包含跨TP统计/搜索与多个kernel；Graph范围以入口合同为准。

## 本地来源版本

- zeus_dev：05ee10f9cc25d19fca0a144ae095c79b3a888976。
- DarronTam/torch_zeus：68f19fa0a159b8ff861dc9cf736d9c0ae64906ba。
- 两仓有未跟踪文档；下表引用文件相对HEAD无差异，未采用未跟踪说明作为实现依据。
- 本机sglang checkout不含当前公开GLM5Next实现，公开结构采用固定Transformers源码。
- 业务库只读，未fetch/pull或改写源码。

| 仓库 | 相对文件 | SHA256 |
| --- | --- | --- |
| zeus_dev | model_state_dev/glm5next_modules/configs/config_next.json | 1d7f3567e84516a4465ae6fa9e0cb0424acfa059c12e75e93beea2ca07da37dc |
| zeus_dev | model_state_dev/glm5next_modules/dev_mhc_dup4_dp4.py | a77ed6fdaf7eb012933a2147c6d3e207d5c21207da5dbf1606533bced8bc25f0 |
| zeus_dev | model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py | 4218bf3c00cd6d12ecf9f8d85daa298f07e64bff2d0f9be0d93123fcee64773e |
| zeus_dev | model_state_dev/glm5next_modules/dev_embed_dup4_dp4.py | 78b500ecf8c9812d608bb3881918c7887c1d8c4c6ea8c19aa2945a438a42f0be |
| zeus_dev | model_state_dev/glm5next_modules/dev_dense_fused_ffn_tp4_dp4.py | ded4a42f8a7bff9701dcd301966b12547742478b6404b38da34d89c9dae14408 |
| zeus_dev | model_state_dev/glm5next_modules/dev_lmhead_sampler_tp4_dp4.py | 74bc6bbefb53f00ecf3a4f84f6ad1e5c31284d4ffe706138c3fc560234344829 |
| zeus_dev | model_state_dev/glm5next_modules/docs/README_embedding_sampling.md | 8c356dc361506c2a6349c70ccccefded68860afc2fafa1f58b1a65aea12ffe56 |
| zeus_dev | model_state_dev/glm5next_modules/integration/comm_token_shard.py | 3bf448960c572c5303a8c7eabcedbd0e0c38829977adeb840817dd92cbc38640 |
| torch_zeus | sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py | da044bba882584c51c588f6968e3ebddafa6811df8b516e243494203f7850c1b |
| torch_zeus | sgl-kernel-zeus-triton/python/glm53_flash/mhc/sgl_mhc_pre_sinkhorn_mix_norm_triton.py | 9dc293ef83b06596e022c2223d961ff280251497822fe64705f0e2366a9d3683 |
| torch_zeus | sgl-kernel-zeus-triton/python/glm53_flash/mhc/sgl_mhc_post_triton.py | 6a76d9a4ba5751ff66a5120c32c8b43b8e8b08aa50bdb88f84a11b7d7581d484 |
| torch_zeus | sgl-kernel-zeus-triton/python/glm53_flash/mhc/sgl_mhc_contract_norm_triton.py | 053c049423e84070dbe12508cbfc84b2502af5c73c858a9c63bef4ecc080ee15 |
| torch_zeus | sgl-kernel-zeus-triton/python/glm53_flash/embedding/embedding.py | efd9b6557bf944217f846a9585e903bcf56f4532d52712cbe25a4d0da0257b68 |
| torch_zeus | sgl-kernel-zeus-triton/python/glm53_flash/sampling/head_sampling.py | 10502a97f0d085da14a888396e6d74be5bf393942cc1f39810b1e5e6516c52a7 |
| torch_zeus | sgl-kernel-zeus-triton/python/glm53_flash/dense/README.md | f299c624cdc485551086588c82be790699c5cc81a1c246cec35781df7d2f2c80 |

## 内容与导航边界

- 主入口为 #module/glm53-flash。用户明确撤销旧module/moe兼容约束，不新增旧模块重定向。
- 五篇连续HTML：glm53-flash.html、moe.html、glm53-attention.html、glm53-mhc.html、glm53-components.html。
- 整网概览重写，新增整网图、45层图、单层图、状态对照与rank地图。
- 原Attention四章完整并入一篇；旧章锚点/笔记复用已有迁移机制，不影响新导航。
- MoE仅更新命名、身份说明与入口，其余技术正文保留，后续由用户修订。
- 其余组件合并Embedding、Dense、Head/Sampling、Vision、MTP及状态推进，避免再次拆HTML。
- 网页与独立数学检查见[本次审查](review-glm53-flash.md)，不作为模型或硬件运行证据。
