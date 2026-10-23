# 算法与 Attention 章节来源审计

核实日期：2026-10-23（Asia/Shanghai）。对应内容：`content/10-algorithms.json`。

本稿共有 6 章、47 节、32 个带深入答案与追问的面试题；约 13,689 个中文字符（正文、lead 与问答合计，不含来源表）。图形与数学算例为本次原创教学表达。所有曲线都是机制示意，没有作为 518、H200 或其他设备的实测图发布。

## 来源与证据等级

- 一手论文：核实方法定义与公开模型架构；没有将论文的速度倍数外推给 518。
- 当前本地源码：核实内部 GLM5Next 配置、KDA/DSA runner 与 kernel ABI；以固定 Git SHA 记录。
- 教学推导：FLOPs、字节、在线 softmax、delta update 数值例子和容量估计；不代表设备测量。
- 用户经验：低并发与吞吐饱和的观察只作为待验证假设，明确需要 B/L sweep、trace 和资源计数支持。
- 记忆：只用于找到线索、提醒区分截图乘数与模型事实；关键配置已重新读取。

内部来源的原仓库访问权限独立于本教程。公开页面保留必要的源码相对路径和固定 GitHub 链接，不转录凭据、个人目录、内网地址、环境账户或 checkpoint 私有路径。

## 当前本地源码快照

| 仓库 | HEAD | 工作树边界 |
| --- | --- | --- |
| `zeus_dev` | `05ee10f9cc25d19fca0a144ae095c79b3a888976` | 引用的 tracked 文件无本地修改；存在未跟踪旧说明文档，未作为当前 ABI 权威 |
| `torch_zeus` | `68f19fa0a159b8ff861dc9cf736d9c0ae64906ba` | 引用的 tracked 文件无本地修改；未跟踪本地文档不等于 HEAD 内容 |

### GLM5Next next 配置

文件：`zeus_dev/model_state_dev/glm5next_modules/configs/config_next.json`

[固定 SHA 来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json)

- 行 6–25：H=4096、288 routed experts、1 shared expert、top-k=8、前三层 dense、45 主干层、额外 nextn 配置为 1。
- 行 44–56：MLA、Q rank 1536、KV rank 512、nope head dim 256、rope dim 0、V dim 256、index_topk 2048、index heads 32、index dim 128、kpool4 与 tail 策略。
- 行 65–119：KDA 64 heads、D128、conv width4；34 KDA 层，11 full_attn 层，完整数组可验证 0..44 的分割。
- 行 121：`mla_nope=true`。
- `max_position_embeddings=1048576` 是配置值，不等于本轮完成了 1M 长上下文模型质量验证。
- 文件 SHA256：`1d7f3567e84516a4465ae6fa9e0cb0424acfa059c12e75e93beea2ca07da37dc`。

`full_model_test/config/test_300b_fp8_in_h20.py` 将其标记为 full 45-layer GLM-5-Next 300B FP8，并有 checkpoint/runtime 45 层配置。教程沿用 300B 项目标签，没有在本轮逐张量统计参数总数；其环境私有路径未转录。

### 当前 KDA runner 与 state ABI

文件：`zeus_dev/model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py`

[固定 SHA 来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py)

- 行 180–205：CPU 原生状态池定义，rec 为 BF16 `[pool,head,Dv,Dk]`，conv 为 tap-major。
- 行 237–273：独立 CPU 数学参考；Q/K L2 norm，safe gate，先 state decay，再预测、delta 更新、读出；最后 BF16 写回持久 state。
- 行 487–488：当前融合 profile 限定 H4096、16 local heads、D128、conv4、safe gate。
- 行 521–539：设备 pool 分配与 legacy layout 显式转换；当前 rec `[pool,16,128,128]`、conv `[pool,3,6144]`。
- 行 559–582：`forward_partial_zeus` 调用 v3.1、BF16 state、gpswap/safe gate；`forward_zeus` 的 TP all-reduce 在调用层。
- SHA256：`4218bf3c00cd6d12ecf9f8d85daa298f07e64bff2d0f9be0d93123fcee64773e`。

当前唯一融合设备程序：`torch_zeus/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py`。

[固定 SHA 来源](https://github.com/DarronTam/torch_zeus/blob/68f19fa0a159b8ff861dc9cf736d9c0ae64906ba/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py)

- 相邻 README 与当前 runner 一致：v3.1、BF16 persistent state、safe gate、K-major 卷积权重；历史 v1/v2 不作为当前设备 fallback。
- SHA256：`da044bba882584c51c588f6968e3ebddafa6811df8b516e243494203f7850c1b`。
- 未跟踪的 `linear_attention_flow.md` 描述旧 split 路径与 FP32 `[Dk,Dv]` state，只作为历史冲突示例，不作为当前 ABI。

### 当前 DSA runner、TopK 与 packed KV

文件：`zeus_dev/model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py`

[固定 SHA 来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py)

- 行 209–213：latent cache 512 个 FP8 元素加 4 个 FP32 scale，共 528 bytes/row。此项不是全部 cache 开销。
- 行 319–335：prepare 预热与 forward 三计算阶段、三次 collective。P1 后 CP gather(query/candidates)，P2 后 CP gather(O/LSE)，P3 后 world gather(final hidden)。
- 行 428–470：独立 CPU 检查先全局选择最多 512 个完整 pooled groups，每组 4 tokens，另加不足 4 的 live tail；验证集合、physical slots 和局部 attention。
- 因此配置 index_topk=2048 不是“任意输入都恰好处理 2048 tokens”；长历史时可能另有 1–3 tail tokens，短历史可能少于预算。
- SHA256：`23e10c5ff491d75c87147ffe261518305e01dfd9e77c468711d1a3caaf467e98`。

[当前 DSA kernel 目录](https://github.com/DarronTam/torch_zeus/tree/68f19fa0a159b8ff861dc9cf736d9c0ae64906ba/sgl-kernel-zeus-triton/python/glm53_flash/dsa)

- P1：`sgl_dsa_proj_indexer_topk1.py`，SHA256 `f487fd306df89034e005d20a1e31e5b1386b97e08f059c09b45874cda1a23f0d`。
- P2：`sgl_dsa_topk2_gather_attn.py`，SHA256 `b680d5e8c0467b9aa0d013b06a70aecb31a4183799b4f3044c2180b58637e2e6`。
- P3：`sgl_dsa_absorb_proj.py`，职责由当前导出接口、README、runner 调用共同核对；本轮未做逐指令复盘。
- 旧 split API、backup 与其他模型 CSA/DSv4 路径没有当作当前三阶段 recipe 的额外 kernel。

## 公开一手来源

以下均于 2026-10-23 查询或打开核实。方法名称、年份、模型差异采用一手来源；教学例子与硬件推导由本教程独立构造，不转录论文长段文字或其性能图。

| 来源 | 支持范围 |
| --- | --- |
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | Transformer 与 scaled dot-product attention 基础；本教程另画 decoder-only 简化图 |
| [RMSNorm](https://arxiv.org/abs/1910.07467) | RMS normalization 定义与 LayerNorm 差异 |
| [MQA](https://arxiv.org/abs/1911.02150) | KV sharing 的动机与定义 |
| [GQA](https://arxiv.org/abs/2305.13245) | 分组共享 K/V；不把模型质量视为与 MHA 自动等价 |
| [RoFormer](https://arxiv.org/abs/2104.09864) | RoPE 与相对位置点积关系 |
| [PagedAttention](https://arxiv.org/abs/2309.06180) | 分页 KV 与服务内存管理；没有宣称分页减少 dense attention 数学计算 |
| [Llama 2](https://arxiv.org/abs/2307.09288) | GQA 主流模型背景；没有把所有尺寸都写成相同配置 |
| [FlashAttention](https://arxiv.org/abs/2205.14135) | IO-aware exact attention 方法；未复用论文加速倍数 |
| [FlashAttention-2](https://arxiv.org/abs/2307.08691) | work partition、并行与非矩阵开销 |
| [FlashAttention-3](https://arxiv.org/abs/2407.08608) | 异步执行与低精度优化方向；不外推 518 性能 |
| [Triton 官方 fused attention 教程](https://triton-lang.org/main/getting-started/tutorials/06-fused-attention.html) | 可阅读的官方 kernel 示例，不是 518 验证证据 |
| [DeepSeek-V2](https://arxiv.org/abs/2405.04434) | MLA 联合压缩与位置分支；吸收公式以简化线性算例展开 |
| [DeepSeek-V3.2](https://arxiv.org/html/2512.02556v1) | DSA lightning indexer、选择集合与 MLA 结合；明确 indexer 成本仍要计入 |
| [Transformers are RNNs](https://arxiv.org/abs/2006.16236) | 可分解 linear attention 与递归状态思想 |
| [DeltaNet](https://arxiv.org/abs/2406.06484) | Delta rule 与 sequence parallel/chunkwise 结构 |
| [Gated Delta Networks](https://arxiv.org/abs/2412.06464) | scalar forget gate 的背景 |
| [Kimi Linear](https://arxiv.org/abs/2510.26692) | KDA 的逐通道 gate、混合架构、结构化 chunkwise 算法；没有将论文吞吐倍数用于内部模型 |
| [Kimi Linear 官方代码](https://github.com/MoonshotAI/Kimi-Linear) | 官方方法与实现发布来源交叉核实 |
| [公开 GLM-5 config](https://huggingface.co/zai-org/GLM-5/blob/main/config.json) | H6144、78 层、256 experts、非零 RoPE 维；页面文件提交显示 `22ce68a` |
| [GLM-5 技术报告](https://arxiv.org/abs/2602.15763) | 公开 GLM-5 模型身份与 DSA 背景；不作为内部 GLM5Next 配置依据 |
| [CUDA Programming Guide](https://docs.nvidia.com/cuda/cuda-programming-guide/index.html) | 线程/执行模型概念对照；没有据此宣称某个 GPU 的实测利用率 |

## 教学计算核对

- GQA KV 示例：80 层 × 32768 tokens × 8 KV heads × (128+128) × 2 bytes = 10 GiB；MHA64 heads 为 80 GiB，MQA1 head 为 1.25 GiB。均不含元数据与复制。
- GQA attention 核心算术强度：F≈4Lhd、bytes≈2Lh_kv·d·b，AI≈2h/(h_kv·b)。假定 KV 能被组内 queries 复用；实际流量不由此保证。
- online softmax：两个子集合的分子分母必须在同一 max 基准下缩放；正文同时给出简单平均偶然正确与失败的例子。
- KDA 本地 state：16×128×128×2=512 KiB；conv3×6144×2=36 KiB；34 层共 18.1953125 MiB/rank/request，不含 workspace 等。
- DSA latent：65536×528=33 MiB/层/请求；11 层为 363 MiB；CP4 理想均分为 90.75 MiB/rank/request。只计该 packed latent，不计 index/page/guard。
- Amdahl 示例：主 attention 占总时间 30%，只将它加速 2×，整体为 1/(0.7+0.3/2)=1.17647×。

## 本轮没有确认、没有声称的内容

- 没有重新跑 518 CycleSim、VCS/RTL、真芯片或 H200 性能；没有核验“B≈2 后计算饱和”的具体转折点。
- 没有把 current source 的配方或已有测试入口描述成当前 SHA 已完成硬件 PASS。
- 没有从 300B 标签重新统计 checkpoint 参数总量，也没有证明 1M context 的完整模型质量。
- 没有确认所有生产服务进程实际 import 的 source/digest 与这两个本地 HEAD 相同。
- 没有替用户认领 Attention 同事的实现工作；面试叙事明确区分本人交付与系统理解。
- 没有把当前 BF16 KDA Graph/eager 一致性当成长序列质量证明。

## 记忆线索使用记录（供主任务引用）

- `MEMORY.md:1637-1662`：旧截图中的 34 KDA / 11 DSA、3 Dense / 42 MoE 只能证明统计公式，不能单独证明模型排列。本次已用当前 config 数组核实主干排列。关联 rollout：`01a133de-c030-7522-9290-3f88659ddf73`。
- `MEMORY.md:2945-2967`：GLM5Next H4096、E288、TP4×EP4 的来源线索和统计边界；算法章涉及的 H/heads/layer 配置均重新读取。关联 rollout：`01a08564-0d64-7dd2-8a7d-43f354555d40`。
- 未打开历史 rollout 正文；没有修改记忆文件。
