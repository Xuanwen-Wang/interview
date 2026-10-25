# 模型结构与算法演进：本轮来源和验证

核验日期：2026-10-25（Asia/Shanghai）。对应 `content/10-algorithms.json` 的六章重写，以及 `content/11-algorithm-evolution.json` 的三章新增。合计 9 章、66 节、45 道问答、16 张原创 SVG；正文去 HTML 后约 2.5 万字符。图与小数值例子是原创教学材料，不是运行截图或测量结果。

## 叙事范围与兼容

本轮按“Qwen3-8B 完整模型 → 内部 GLM5Next300B 结构全景 → Attention / FFN 两条演进线 → 各算子数学”组织。算法章解释函数、张量 shape、位置、归约和状态；真实设备分片、通信、布局、内核版本、源码执行合同与测量放到独立部署知识域。入口为 `#module/moe`。旧的六个 chapter ID 和全部 47 个 section ID 保留；个别旧节 ID 含 `deployment`、`tp-cp`、`compiler-view` 等历史名字，只用于保留旧链接，不表示该节仍讨论这些实现主题。

新增稳定 ID：`qwen3-dense-baseline`、`model-evolution-map`、`attention-evolution`。FFN 深入入口为其他作者新增的 `ffn-routing-dataflow`；本轮不改该文件。

## 固定版本模型证据

| 来源 | 绑定版本 | 用途与边界 |
| --- | --- | --- |
| Qwen/Qwen3-8B | `b968826d9c46dd6066d109eabc6255188de91218` | 官方 Dense + GQA 基线 |
| Qwen/Qwen3-30B-A3B | `ad44e777bcd18fa416d9da3bd8f70d33ebb85d39` | 同一家族的 GQA + MoE 对照 |
| huggingface/transformers | `50e35cc0ca18ec19b80653690de553e6decf74f5` | Qwen3 模型算子顺序及 Q/K norm |
| bjxx-algo/zeus_dev | `05ee10f9cc25d19fca0a144ae095c79b3a888976` | 内部 next 的结构配置、mHC 数学连接参考 |
| zai-org/GLM-5 | `c183ef8c61faee82855eca1ed9bb3a9a7ce3b0b2` | 公开同名近似模型的身份区分 |

模型仓库 SHA 通过官方 Hugging Face API 解析并读取固定版本配置；Transformers SHA 通过 GitHub API 解析后读取固定源码。内部仓库只读核验固定对象与对应文件，没有运行模型。原业务源码链接是否可访问，由原仓库权限独立决定；指南公开不会改变原来源权限。

- [Qwen3-8B 固定配置](https://huggingface.co/Qwen/Qwen3-8B/blob/b968826d9c46dd6066d109eabc6255188de91218/config.json)：H=4096，36 层，32 Q heads / 8 KV heads，head_dim=128，Dense I=12288，vocab=151936。配置 `max_position_embeddings=40960`、`rope_scaling=null`；[官方首发页](https://qwenlm.github.io/blog/qwen3/) 的 128K 能力描述另行注明，未将二者混为同一个默认配置字段。首发稠密型号包含 8B、14B，不写成 Qwen3-7B/13B。
- [Qwen3 模型定义](https://github.com/huggingface/transformers/blob/50e35cc0ca18ec19b80653690de553e6decf74f5/src/transformers/models/qwen3/modeling_qwen3.py)：核对 `Qwen3MLP` 的 Gate/Up/Down，Q/K 投影后按 head 做 RMSNorm、再做 RoPE，以及 block 的 input/post-attention norm 与残差顺序。线性矩阵的教学记法采用右乘，与源码存储权重方向通过转置对应。
- [Qwen3-30B-A3B 固定配置](https://huggingface.co/Qwen/Qwen3-30B-A3B/blob/ad44e777bcd18fa416d9da3bd8f70d33ebb85d39/config.json)：H=2048，48 层，32 Q heads / 4 KV heads，128 experts，每 token 选 8。它用于证明 Attention 和 FFN 两个结构轴可以独立改变，不把不同型号的 shape 拼接。
- [内部 config_next.json](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json)：H=4096，45 主干层，`linear_attn_config.kda_layers` 有 34 项，`full_attn_layers` 有 11 项；DSA 层号为 3、7、11、15、19、23、27、31、35、39、43。`first_k_dense_replace=3`，所以前 3 Dense、后 42 MoE。288 routed / Top8 / 1 shared，Dense I=12288、expert I=2048。34+11 和 3+42 是同一 45 层的两个分类轴。
- 同一配置区分顶层内容 head_dim=256 与 KDA 的 `linear_attn_config.head_dim=128`。KDA 64 heads、短卷积长度 4；DSA query rank 1536、KV latent 512、内容 key/value 各 256、index 32 heads×128、`index_topk=2048`、pool 4。TopK 是预算字段，不被写成每一步必定有 2048 个有效 token。主 Attention 的 `qk_rope_head_dim=0` 与 `mla_nope=true` 不泛化为整个模型完全没有位置相关机制。
- 同一配置含 mHC 4 residual streams 和 20 次 Sinkhorn 迭代。另只读取 [dev_mhc_dup4_dp4.py](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_mhc_dup4_dp4.py) 的 `_apply_mix`、`forward_pre`、`forward_post` 数学关系，验证输入流混合、子层计算、输出回注和残差流混合。教材不引用该文件运行过程。总图将 mHC 标在主干框内，不画成 45 层之后才执行的单独阶段。
- [公开 GLM-5 固定配置](https://huggingface.co/zai-org/GLM-5/blob/c183ef8c61faee82855eca1ed9bb3a9a7ce3b0b2/config.json)：H=6144、78 层、256 routed experts，与本内部 next 配置不同。“300B”沿用内部项目名称，本轮没有重新统计所有辅助模块来证明精确总参数数目。

## 论文与官方算法材料

下列一手材料均已通过网页读取核验。论文支持算法定义与公开模型方法；内部模型采用哪些层型、维度和字段仍以上述固定配置为准。

| 主题 | 一手材料 | 本文使用范围 |
| --- | --- | --- |
| Transformer | [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | QK / softmax / PV、多头、逐位置 FFN |
| Qwen3 | [Qwen3 Technical Report v1](https://arxiv.org/html/2505.09388v1) | 公开家族背景，与固定模型配置共同使用 |
| MQA | [Fast Transformer Decoding](https://arxiv.org/abs/1911.02150) | 多个 Q heads 共享一套 K/V |
| GQA | [GQA](https://arxiv.org/abs/2305.13245) | 分组共享 K/V；历史位置数并未缩短 |
| RoPE | [RoFormer](https://arxiv.org/abs/2104.09864) | 旋转位置表示与相对位置关系 |
| RMSNorm | [Root Mean Square Layer Normalization](https://arxiv.org/abs/1910.07467) | 不减均值的 RMS 归一化 |
| FlashAttention | [FlashAttention](https://arxiv.org/abs/2205.14135)、[FlashAttention-2](https://arxiv.org/abs/2307.08691) | 相同 softmax 分布的分块精确求值；不将归约状态混同递归记忆 |
| MLA | [DeepSeek-V2](https://arxiv.org/abs/2405.04434) | 联合 latent、query 侧线性吸收、位置项边界 |
| DSA | [DeepSeek-V3.2 v1](https://arxiv.org/html/2512.02556v1) | Indexer 选择位置和主 Attention 精算两部分；未把内部 pooling 规则归因于该论文 |
| 线性 Attention | [Transformers are RNNs](https://arxiv.org/abs/2006.16236) | 特征内积、累计矩阵 S 与归一化向量 z |
| Delta rule | [Parallelizing Linear Transformers with the Delta Rule](https://arxiv.org/abs/2406.06484) | 写入预测残差、分块/复合思想 |
| Gated Delta | [Gated Delta Networks](https://arxiv.org/abs/2412.06464) | 遗忘与误差修正的不同职责 |
| KDA | [Kimi Linear v2](https://arxiv.org/html/2510.26692v2) | 细粒度门控和 KDA/MLA 混合；首次提交为 2025-10-30，v2 为 2025-11-01 |

正文从标准带分母的特征线性 Attention 转到 Delta/KDA 时明确区分函数定义，并不宣称所有递归式都与 softmax 等价。MLA 吸收后若点积维度由 256 变为 512，仍保留原模型的 `1/√256` 缩放；不能按吸收后的维度自行重设。DSA 图保留独立主 query 输入边，Indexer 只产生选择信息。

## 算例与静态验证

- Qwen3-8B 的单请求 N=4096、BF16 教学 KV：`36×2×4096×8×128×2 = 576 MiB`。N 明确包含当前新增 token；“完整逻辑扫描”限于该层当前 query 可见且未被模型 mask 排除的位置，并非宣称必须重复读取同一物理字节。
- Dense 三矩阵参数 `3×4096×12288 = 150,994,944`；一次乘加记 2 FLOPs，则每 token 主矩阵计算 `301,989,888 FLOPs`。N4096 / 32 query heads / d128 的 QK+PV 为 `67,108,864 FLOPs`，与投影分开计数。
- SwiGLU 两通道小例由 sigmoid 和矩阵右乘手算复核。GQA 两 query 共用 value `[2,8]`，两组 score `[0,ln3]` 与 `[ln3,0]` 分别输出 6.5 和 3.5，说明共享 K/V 不意味着 query 输出相同。
- MLA/DSA TopK 小例从相同的选中集合重新归一化，latent 输出 `[0.5,3]` 经 value 投影 `[1,2]` 得 6.5；未把 Indexer 分数直接当主 Attention 权重。
- Delta 的非对称 2×2 更新、遗忘后预测和 affine compose 的顺序经手算复核；`(2x+3)` 后接 `(4x+5)` 在 x=1 得 25，反序得 21。结合性不意味着可以交换 token 顺序。
- KDA 全局 64×128×128 的矩阵若每元素 2 字节，为每层每请求 2 MiB；34 层 68 MiB。三条 Q/K/V 的 3-tap 历史为 `3×3×64×128×2 = 144 KiB/层`；合计 72.78125 MiB。此处是显式假定元素格式的数学容量，不是实际部署格式或总占用。
- 内部每 expert 三矩阵 `3×4096×2048 = 25,165,824` 参数；8 routed + 1 shared 激活 `226,492,416` 个 expert 矩阵参数。它大于 I12288 Dense 的对应参数量，正文不以“MoE”自动推断比该 Dense 更少计算。
- 脚本校验：两份 JSON 可解析；每章至少 5 实质节、3 问答；章内节 ID 唯一；旧章节/节 ID 与 HEAD 一致；16 个 SVG 均通过 XML parser；未引入脚本或事件属性。上述八项主要整数算术有 Python 断言，均通过。全站构建、导航、浏览器移动端与打印由根任务统一验收。

独立复核闭环：MoE 作者复核 Qwen shape、KV 容量和 SwiGLU 数值，指出 DSA 图缺少主 query 直达边，已补；根任务指出 mHC 总图不应把残差连接画到主干之后，已修。另只读交叉检查其他作者的 FFN 算子章、MoE 首章及两组部署章节中的指定数学、字节和归约边界，未发现新增 P1/P2；这不升级为设备测试或端到端验收。

历史记忆仅用于找到内部模型来源线索；本轮实际采用的模型字段全部重新读取固定配置。没有将旧 runner 版本、旧性能记录或历史拓扑作为这九章的算法事实。
