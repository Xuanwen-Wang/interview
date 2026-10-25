# Attention 连续教程：来源、教学账本与验证

> 本记录保留首次合并时的来源与账本。2026-10-25 后续全篇重写、25张正文图与7类动画的最新验收见 [教学重写记录](review-attention-teaching.md)。

核验日期：2026-10-25（Asia/Shanghai）。正文为 `content/13-attention-guide.json`，独立阅读入口 `attention.html`。将 10 个算法/Attention 旧章合为一个 8 阶段、24 节连续教程，含 20 张原创 SVG、8 道问答。算法、固定配置、内部源码与教学容量均注明范围；没有新增模型运行或设备性能测量。

## 叙事与数据约定

基线固定 Qwen3-8B：B=1，当前可见 N=4096 包含本步新 token，旧缓存为4095行；H4096、Q32/KV8、d128、36层、Dense I12288。BF16按2字节，归约示例FP32，一次乘加计2 FLOPs。逻辑张量尺寸不指定物理stride，矩阵以右乘记法展开；PyTorch Linear权重存储方向相反。

从模型整层开始，依次投影、Q/K Norm、RoPE、append、读取历史、QK、online softmax、PV、O投影与残差。随后沿资源轴讨论GQA、Flash、MLA、DSA与KDA；每次切换模型实例都明确标注。B/N对照说明短上下文B1权重流量可能更大；不将整个decode一概写成KV主导。

## 本轮重新读取的一手来源

以下网页在本轮通过浏览工具打开并核对；内部对象通过只读 `git show` 固定SHA读取。旧 `model-evolution-sources.md` 仅用于定位来源，本记录不把旧轮“已核验”当本轮验证。

| 来源 | 冻结版本 | 支持的范围 |
| --- | --- | --- |
| [Qwen3-8B config](https://huggingface.co/Qwen/Qwen3-8B/blob/b968826d9c46dd6066d109eabc6255188de91218/config.json) | b968826d9c46dd6066d109eabc6255188de91218 | H4096、Q32/KV8、d128、36层、I12288、vocab151936、BF16、无滑窗；默认位置字段40960 |
| [Transformers Qwen3](https://github.com/huggingface/transformers/blob/50e35cc0ca18ec19b80653690de553e6decf74f5/src/transformers/models/qwen3/modeling_qwen3.py) | 50e35cc0ca18ec19b80653690de553e6decf74f5 | input/post-attention Norm与残差顺序；投影后Q/K head Norm、RoPE、cache.update；WO与Dense SwiGLU |
| [MQA](https://arxiv.org/abs/1911.02150v1) | v1 | 多Q共用单套K/V、decode历史带宽动机 |
| [GQA](https://arxiv.org/html/2305.13245v3) | v3 | Q分组共享K/V；不减少历史位置数 |
| [RoFormer](https://arxiv.org/abs/2104.09864v5) | v5 | 旋转位置表示及相对位置依赖 |
| [FlashAttention](https://arxiv.org/html/2205.14135v2) | v2 | 分块精确softmax、online归约、减少中间量IO |
| [DeepSeek-V2](https://arxiv.org/html/2405.04434v5) | v5 | MLA联合latent、吸收、解耦位置；H5120、heads128、内容d128、latent512、位置d64 |
| [DeepSeek-V3.2](https://arxiv.org/html/2512.02556v1) | v1 | Indexer与主Attention双路径、TopK2048、主核心和索引成本分开 |
| [Transformers are RNNs](https://arxiv.org/abs/2006.16236v3) | v3 | 特征线性Attention、累计矩阵与归一化状态 |
| [DeltaNet](https://arxiv.org/html/2406.06484v1) | v1 | 残差关联写入、chunkwise并行且不交换时间顺序 |
| [Gated Delta Networks](https://arxiv.org/html/2412.06464v1) | v1 | 遗忘与delta写入职责不同 |
| [Kimi Linear](https://arxiv.org/html/2510.26692v2) | v2 | 通道遗忘门、短卷积、输出处理、KDA/MLA混合与固定状态 |
| [内部config_next](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json) | 05ee10f9cc25d19fca0a144ae095c79b3a888976 | 34KDA/11DSA、3Dense/42MoE、两种head_dim、mHC配置、288/Top8/shared1；不是公开GLM-5 |
| [内部mHC参考](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_mhc_dup4_dp4.py) | 同上 | HostReference._apply_mix、forward_pre、forward_post的流混合/回注关系；未运行设备 |
| [公开GLM-5 config](https://huggingface.co/zai-org/GLM-5/blob/c183ef8c61faee82855eca1ed9bb3a9a7ce3b0b2/config.json) | c183ef8c61faee82855eca1ed9bb3a9a7ce3b0b2 | H6144、78层、256专家，用于明确身份边界 |

## 完整模型结构补充核验

新增完整生成闭环与层内展开：Qwen3-8B 从 Embedding 经 36 层、最终 RMSNorm、独立 LM head 到采样与下一 token；内部 GLM5Next300B 从 Embedding、四流复制、45 层，经过四流平均收缩、最终 RMSNorm、独立 LM head 到生成反馈。采样属于生成策略；额外 nextn 路径没有混入 45 个主干 block。

Qwen 的完整调用顺序由上表固定 Transformers 源码确认，`tie_word_embeddings=false` 来自固定配置。内部 GLM5Next 的字段来自 `05ee10f9`，全模型顺序另据 runner 绑定的 SGLang `acc98d7d924630d43cd4796f462f015b7aef8670`，本轮通过 GitHub API 只读获取并核验：

| 固定源码 | 核验范围 | 文件 SHA256 |
| --- | --- | --- |
| [glm5_next.py](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/models/glm5_next.py) | embedding and layer loop；final RMSNorm after last layer communicator；independent ParallelLMHead if tie_word_embeddings false；LogitsProcessor called after model | `c4b5c0033e76981ffb2bbe061c9f61677f009a3f95e5d6264b3b74880472a247` |
| [communicator_mhc.py](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/layers/communicator_mhc.py) | mHC pre then per-sublayer Norm once; post after attention and FFN；hc_expand only at first layer；hc_contract after last mlp_combine | `b148d6c55c8e5b86272d005e20d964b87836d0dd7efe5843e9d457e7c961a409` |
| [functional.py](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/layers/mhc/functional.py) | replication for input expansion；mean over residual stream dimension for contraction；weighted pre mix and residual plus post injection | `03a946f7980b55e3a3714afa17b3ffc8828cf07272fe5e617ca379c16d7bcdbd` |

两套完整模型图均为逻辑数据流；KDA 矩阵/卷积状态、DSA 历史与各层独立保存关系分别标明。mHC 的流维既不是 batch，也不是 token。源码阅读不代表本轮完成权重、全模型或硬件运行；内部项目名不等同于公开 GLM-5。

## 可复算整数账本

- Qwen GQA单层完整KV：`2×4096×8×128×2 = 16 MiB`；36层576MiB。新行4KiB/层、144KiB/36层。新行留在片上时旧历史读量为16MiB−4KiB。
- 同Q32/d128/N4096对照：MHA32为64MiB，MQA1为2MiB；这两列是结构反事实，不代表Qwen已有这些checkpoint。
- QK与PV：`4×32×4096×128 = 67,108,864 FLOPs`。MHA/GQA/MQA保持Q维度时该主工作量相同；理想KV复用下分别1/4/32 FLOP每byte。
- Q/K/V/O的BF16权重：`2×(4096²+2×4096×1024+4096²) = 80 MiB`，主计算83,886,080 FLOPs；与核心相加150,994,944 FLOPs。Dense三矩阵288MiB、301,989,888 FLOPs。
- N32768时GQA每层128MiB、36层4.5GiB；B16/N4096时每层KV256MiB，而368MiB主干权重理想按请求摊销23MiB。这是逻辑对象与理想复用，不是物理传输计数。
- Flash教学tile：K/V各`128×128`BF16，Q为`4×128`BF16，score与u各`4×128`FP32，m/l各4个FP32，共69.03125KiB；KV双缓冲另加64KiB，其他临时量未计。
- 两分区partial O FP32为`2×32×128×4 = 32 KiB`，LSE为`2×32×4 = 256 B`。
- DeepSeek-V2 N4096/BF16的紧凑内容+位置：`4096×(512+64)×2 = 4.5 MiB`。展开内容K/V+共享位置：`4096×(2×128×128+64)×2 = 256.5 MiB`。这是同一MLA参数化的两种逻辑表示，不是与Qwen质量/速度比较。
- 吸收后的DeepSeek-V2核心：`2×128×4096×((512+64)+512) = 1,140,850,688 FLOPs`，不含两端映射。不能按吸收后的维数自行改模型缩放系数。
- DSA纯latent内容账：512维BF16，2048行2MiB、32768行32MiB；不含位置、索引、scale、页面/行传输粒度。稀疏主精读不消除索引全扫描或长期历史。
- 内部KDA矩阵`64×128×128`在BF16教学假设下2MiB/层；短卷积历史`3×3×64×128×2`为144KiB/层；34层共72.78125MiB。不是实际ABI或全模型总状态量。

## 验证与兼容

本文件作者验证：JSON解析、24节/8阶段按序完整覆盖、20张SVG通过XML解析、章内ID唯一、10个旧章73个section/embedded锚点全部映射到存在的新节。旧章范围为transformer、kv-cache、flash-attention、mla-dsa、kda-linear、glm5next-architecture、qwen3-dense-baseline、model-evolution-map、attention-evolution、attention-dataflow。问题重写，不把旧掌握度误移到新问题。

上述主要整数账本通过Python断言；独立作者再次复算MLA、tile和KDA数字通过。复核指出Q→KV箭头会误导成生产关系，已把GQA共享图、Attention核心图、Flash tile图改成Q/K/V独立输入消费者；KDA三投影图改成“每路合头宽8192”。全站构建、旧链接路由、搜索、交互极值、移动布局、图文边界及打印由根任务集成验证记录负责，不能用本段静态检查替代浏览器验收。
