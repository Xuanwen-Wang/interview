# GLM5Next 300B：卡间 EP4、卡内 TP4 部署核验

核验日期：2026-10-25（Asia/Shanghai）。本文是整合 MoE 长文的部署证据。物理部署按用户本轮明确确认：**四卡之间 EP4，每卡内部 TP4**。源码的 `board` 分组与这一口径对应。逻辑 rank 与 core 不自行解释为额外物理卡、die 或分布式进程。

本轮只读源码、核对版本、推导形状与字节数；没有运行设备、CycleSim、VCS、Graph 或完整模型实验。公开 GLM-5 与内部 GLM5Next `next` 配置分开；本篇不把 dev / 集成代码包装成 300B 生产全模型实测。

<a id="versions"></a>
## 1. 固定版本与核对方式

- `bjxx-algo/zeus_dev`：GitHub API `default_branch=main`；`commits/main` 返回 `05ee10f9cc25d19fca0a144ae095c79b3a888976`，commit UTC 时间 `2026-10-21T05:32:55Z`。本地 checkout HEAD 同 SHA，相关 tracked 文件与 `git show HEAD:path` 逐字节一致；唯一发现的未跟踪流程说明没有作为证据。
- `DarronTam/torch_zeus`：本轮其他核验任务通过 GitHub API 冻结 master 为 `01046b2bd533fcd3a6754c2f6e03ca612000b176`。其 Router / Shared / Routed / Reduce / expert_layout 与旧 `3656952bfee88b1d5f7b68d0e724e54a7a5353d7` 逐字节相同；旧 SHA 仍是有效历史版本，但已不能称作当前 master。
- 下文 ZD 链接固定前一 SHA；TZ 链接固定后一 SHA。未对业务 checkout 执行 fetch、pull、编辑或实验。

<a id="entry"></a>
## 2. 当前入口与实际验证范围

| 固定源码 | 核对结论 |
| --- | --- |
| [ZD 模块 README:18–37](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/README.md#L18) | `prepare → forward_zeus` 是设备入口；`forward` 可能是 CPU 参考。dev 权重来自 fixture / 合成权重，尚未实现真实 checkpoint 的全部模型 loader。 |
| [ZD 模块 README:43–58](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/README.md#L43) | FLAT 位于 integration；整层串联脚本已归档。 |
| [ZD tests README:7–14](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/tests/README.md#L7) | test_modular 继续验证 backup 合同，归档脚本不参与默认 dev 批量运行；production 独立要求 SGLang / checkpoint。 |
| [ZD MoE main:1885–1903](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L1885) | 默认 `config=next`、`stage=distributed`，distributed 为完整 world16；local 是显式选择。 |
| [ZD MoE config:135–157](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L135) | next 对应 H4096/E288/I2048/SharedI2048/Top8/factor2.5；H4096 + TP-local I512 选 per-tensor Routed。 |
| [ZD MoE forward:990–1158](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L990) | Router→BF16 Shared→per-tensor Routed→local Reduce；旧 H2048 G128 的 align/compact 分支不是 next 的四-launch 路径。函数仅算本 rank partial，排除 TP / EP collective。 |

[ZD production Graph 测试:3–18](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/tests/production/test_zeus_fused_moe_production_graph.py#L3) 明确默认真实 **16B** 工厂，不能因为路径名含 production 就作为 300B 当前 per-tensor 链的验收。这里不复制它的本地 checkpoint 路径。

[ZD fixture:8–12、134–155、190–206](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/tests/fixtures/moe_graph_factories.py#L8) 的全局 `tp_size=16`、Attention DP4、MoE DP1/EP4 推出 MoE TP4；该字段命名不能理解成专家 TP16。world16 也不能再乘 DP4 或 EP4。

<a id="checkpoint-entry"></a>
## 2A. 全仓另有真实300B checkpoint验收入口，绑定的是旧UScale链

**上一节的fixture / 无全checkpoint loader限制只适用于`model_state_dev/glm5next_modules`，不是对整个仓库或部署系统的判断。**

[ZD full_model_test/config/test_300b_fp8_in_h20.py:1、10–15、26–60](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/full_model_test/config/test_300b_fp8_in_h20.py#L26) 明确设置45层300B FP8真实权重验收，Zeus `tp_size=4 / ep_size=4 / dp_size=4 / world_size=16`，并固定：

| 依赖 | 配置所绑定身份 |
| --- | --- |
| SGLang | `acc98d7d924630d43cd4796f462f015b7aef8670` |
| torch_zeus | `01fcfa8176759b2a5921a31b470e16dbc1380169` |
| zeus_dev | 基线`c035e8b965a2208ad18c83b7c02b9c927be44ff9`，实际runner要求为checkout祖先 |

[ZD runner:440–461、1185–1203](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/full_model_test/test_300b_fp8_in_h20.py#L1185) 对SGLang和torch_zeus执行exact HEAD检查，对zeus_dev检查上述祖先身份。[runner:90–105](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/full_model_test/test_300b_fp8_in_h20.py#L90)要求Shared FP8 UScale、Routed FP8 UScale等符号。[runner:1725–1755](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/full_model_test/test_300b_fp8_in_h20.py#L1725)启用qualified fused ops但排除mHC；不能写成当前fused mHC dev已经用于这条入口。

本轮用GitHub API读取`bjxx-algo/sglang@acc98d7d924630d43cd4796f462f015b7aef8670`，commit时间2026-08-27T09:33:36Z，按此SHA下载核心文件。没有使用本地SGLang不同HEAD或未跟踪说明来替代它。

| 固定SGLang源码 | 真实接线 |
| --- | --- |
| [models/glm5_next.py:125–130、1263–1271](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/models/glm5_next.py#L125) | Glm5NextMoe继承DeepseekV2MoE，稀疏层使用该类。 |
| [models/deepseek_v2.py:615–655](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/models/deepseek_v2.py#L615) | FP8 Shared选择`moe_shared_expert_silu_down_fp8_uscale_tp4`，返回双core partial。 |
| [同文件:1407–1416、1468–1476](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/models/deepseek_v2.py#L1407) | normal路径先Shared再Router；Shared权重跨EP复制，但仅EP0把Shared partial注入expert Reduce。它不同于当前dev将非EP0权重置零。 |
| [layers/quantization/fp8.py:1907–1928、1999–2058](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/layers/quantization/fp8.py#L1999) | 独立align→UScale Routed→Reduce；Routed scratch按`[2,T,K,H]`读取，factor=1。整体加上Shared和Router为旧五kernel局部链。 |
| [models/deepseek_v2.py:1502–1508](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/models/deepseek_v2.py#L1502) | 当未选择reduce_scatter且未启用其它跳过条件时，执行tensor_model_parallel_all_reduce。 |
| [layers/communicator_mhc.py:218–242、298–310](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/layers/communicator_mhc.py#L218) | 输入经复制感知DP gather；允许RS且MAX_LEN时走dp_reduce_scatter，其他情况走dp_scatter，避免重复reduce。 |
| [layers/dp_attention.py:72–80](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/layers/dp_attention.py#L72) | Zeus DP显式采用固定长MAX_LEN，不能把其他runtime的ragged SUM_LEN默认套入。 |
| [同文件:632–657、694–699](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/layers/dp_attention.py#L632) | dp_gather_replicate：is_partial=False时先将同卡非0lane贡献置零，attn_tp_all_reduce恢复一份，再board_replicated_AG，保证不把复制算四次。 |
| [同文件:724–741](https://github.com/bjxx-algo/sglang/blob/acc98d7d924630d43cd4796f462f015b7aef8670/python/sglang/srt/layers/dp_attention.py#L724) | dp_reduce_scatter_tensor的Zeus分支内部是attn_tp_all_reduce→board_replicated_RS；后置通信所有权语义与dev基线一致，但由生产communicator封装与选择。 |

这闭合了旧真实权重链的MoE接线，**不等于本轮执行了它，不等于确认用户当前服务采用它，也不等于当前四kernel已联调进入这条入口**。T24的手工分布仍是所有权教学例，不断言此runner的实际batch/padding。该配置默认Graph bucket是4；若评估T24，应核对同一次运行的token counts、MAX_LEN与Graph容量。

<a id="topology"></a>
## 3. 卡、rank、专家与 core 的所有权

[ZD MoE:116–152](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L116) 固定 TP4、EP4、CORE_NUM2，并定义 local experts=E/EP、local I=I/TP。

[ZD worker:1755–1775](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L1755) 使用 `tp_rank=rank%4`、`ep_rank=rank//4`。

| 卡 / EP | rank 集合 | 默认 expert IDs | 每 rank 的 I |
| --- | --- | --- | --- |
| 0 / EP0 | 0–3 | 0–71 | 每个本地expert I512 |
| 1 / EP1 | 4–7 | 72–143 | 同上 |
| 2 / EP2 | 8–11 | 144–215 | 同上 |
| 3 / EP3 | 12–15 | 216–287 | 同上 |

- [ZD RankWeights:297–312](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L297)：expert_start=ep×72；Router weight / bias 跨所有 ranks 复制，Router pack 还按 token 分工在双 core 复制 padded weight。
- [TZ Routed:1517–1544](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L1517)：默认 local expert 按奇偶分给双 core，每 core36；不是 core0 连续前36、core1 连续后36。显式 map 必须每核 E/2。
- [ZD pack:797–811](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L797)：Router 未传 logical_to_physical，Routed 未传 expert_core_map。不能把 opt-in CrossEPLayout 当作默认。

<a id="model"></a>
## 4. 完整模型图与 MoE 的接口

[ZD config_next.json:6–25、57–119](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json#L6)：H4096，45主层，前3 Dense / 后42 MoE，288 Routed +1 Shared / Top8，34 KDA / 11 DSA，mHC4，nextn预测层另计。DSA层号3、7、…、43；Attention类别与Dense/MoE类别是两条独立路由。

[ZD backup DecoderLayer:294–303、399–410](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/backup/dev_glm5next_model_decode_modular_test.py#L294)：Attention、FFN各自有mHC pre/post。MoE输入是 `[T,H]`，不能把mHC的4-stream residual简单替换为普通AddNorm。

<a id="weights"></a>
## 5. 权重分片、量化与 Shared

[ZD RankWeights:314–407](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L314)：

- Routed每rank：GateUp `[72,1024,4096]` FP8，UScale `[72,1024,32]`；Down `[72,4096,512]` FP8，UScale `[72,4096,4]`。
- Shared每rank：GateUp `[1024,4096]`、Down `[4096,512]`。EP0加载非零权重；EP1–3分配同shape零权重 / scales。
- [ZD:409–422](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L409)：next分支Shared在load时反量化为BF16，不是继续使用FP8 activation量化合同。
- [TZ Routed:1499–1514](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L1499)：Routed pack先反量化block权重，再按三投影各自per-tensor scale重新量化。
- [ZD forward:1039–1055](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L1039)：Shared仍在每rank同stream执行；“只有EP0贡献”不等于只在EP0 launch，不证明Shared / Routed已经重叠。
- [ZD:1024–1035、1138–1148](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L1024)：Router应用factor2.5，Reduce factor=1；Shared沿同一TP / EP求和路径进入输出，不额外广播相加。

### 配置与 caller 的 clamp 缺口

[ZD config:122](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json#L122) 配置 `swiglu_clamp_limit=10.0`，但整个 dev MoE 文件不读取此字段，也不传 `swiglu_limit`。[TZ Shared:657–673](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py#L657)、[TZ Routed:1685–1700](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L1685) 的默认参数均为None。[common/_swiglu.py:5–7](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/common/_swiglu.py#L5) 把None映射为-1，不启用clamp。不能把配置字段存在写成这条 dev 已执行对应数值合同。

<a id="baseline"></a>
## 6. T24 基线合同：输入 gather → local → TP AR → EP RS

- [ZD backup:390–427](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/backup/dev_glm5next_model_decode_modular_test.py#L390)：MoE prepare全局T，Dense仅本卡T；MoE输入gather，两个模块都做TP SUM，仅MoE再做EP RS。
- [ZD test_modular_moe_contract:95–135](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/tests/test_modular_moe_contract.py#L95)：monkeypatch合同明确验证gather→kernel→tp_reduce→ep_scatter，token结果回原卡。此处是测试源码阅读，不是本轮执行结果。
- [ZD current worker:1777–1802](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L1777)：独立MoE回归直接提供完整T行，然后做TP AR和EP RS；没有前置输入gather。
- [ZD _comm:67–147](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/_support/_comm.py#L67)：world必须16、每board4rank；跨卡lane为`[p,p+4,p+8,p+12]`；RS按token维切四份，count为输出元素数。每卡已有四份相同TP-summed tensor，不再次world16无差别SUM。

原创T24例：四卡各6行；T24/H4096/BF16，每行8KiB。每rank初始48KiB → gather192KiB → local partial192KiB → TP AR192KiB → EP RS48KiB。只是逻辑tensor payload，非wire bytes和链路时间。

原创token7例：原owner卡1，选择`[5,20,73,100,151,200,220,287]`。每卡两个专家只为方便讲解，不是均衡路由事实。`Y[e,p,7,:]`经TP求和成`B[e,7,:]`；EP求和后token7回卡1第1行。Shared仅EP0非零，已随该求和链传播。

当前四kernel和该基线没有选择性token AllToAll；Router IDs、rank内索引重排、load-time expert permutation都不等于跨rank token exchange。

<a id="capacity"></a>
## 7. 容量推导与有效行

一个expert纯矩阵元素`3×4096×2048=25,165,824`。Routed FP8为24MiB / 完整expert，6MiB / TP rank；72个分片为432MiB / rank；1728MiB / 卡；全层四卡6912MiB=6.75GiB。Shared BF16为48MiB / 完整expert、12MiB / TP rank；dev其他EP同shape零占位仍耗容量。排除scales、padding、Router、pack和重复副本，不当成最终设备内存占用。

[ZD scratch:873–913](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L873) 对next的T24逻辑分配：

| 对象 | shape | bytes |
| --- | --- | ---: |
| topk_ids | [24,8] int32 | 768 |
| topk_weights | [24,8] BF16 | 384 |
| routed_partial | [24,8,4096] BF16 | 1572864 |
| shared_partial | [2,24,4096] BF16 | 393216 |
| final | [24,4096] BF16 | 196608 |
| 合计 | 仅上述caller显式scratch | 2163840 |

[ZD forward合同:996–1000、1131–1148](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L996)：remote route rows未定义、可包含NaN；Reduce按当前topk_ids和本地expert范围guard。预分配容量不是所有行每步都有效，更不是物理带宽。

<a id="flat16"></a>
## 8. FLAT16 是独立集成方案，T24不能裸用

- [ZD integration/comm_token_shard.py:16–52](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/integration/comm_token_shard.py#L16)：TokenLayout要求T为16倍数，或显式shared_batch8；裸T24会拒绝，不能画成每rank1.5行。
- [同文件:60–175](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/integration/comm_token_shard.py#L60)：RS4→Norm→AG16→外部EP4×TP4 MoE→RS16→Norm→AG4；DSA replicated输出切行，不再SUM；Dense已完整复制结果也走slice。finish已执行下一Attention输入norm，不能再重复norm。
- [同文件:178–237](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/integration/comm_token_shard.py#L178)：MhcTokenWindow执行真实hc_post→hc_pre/mix/RMSNorm，携带side tensors。
- [同文件:240–264](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/integration/comm_token_shard.py#L240)：capture前全16rank控制AG确认容量、hidden、Batch8开关；不可独立fallback。
- [ZD comm_token_padding.py:18–43](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/integration/comm_token_padding.py#L18)：counts=(6,6,6,6)、cp_align1时TP4对齐每卡8行，总capacity32；每rank Norm窗口2行。此为源码规则推导，非实测。
- [同文件:58–93](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/integration/comm_token_padding.py#L58)：窗口内部保留padded residual，最终consumer裁valid rows；上游stateful attention仍负责dummy缓存槽。
- [ZD test_comm_two_layer_device.py:1–5、37–55](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/tests/test_comm_two_layer_device.py#L1)：两层使用tied weights、分离KDA state/residual，明确不是预训练全模型。

RS16可直接加原始rank partial；不能先TP AR4再RS16加复制值。token分片Norm可以避免重复工作，但不能在各TP partial尚未求和时先Norm再相加。

<a id="graph"></a>
## 9. Graph验收与本轮边界

[ZD GraphRegression.distributed:1305–1389](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L1305)：capture local+TP+EP，显式A/B/A replay，poison writable state；TP/RS输出对eager bit-exact、输入输出变化、scratch地址稳定、finite检查。未执行这些测试，不将代码里的验收设计写成本轮PASS。

## 10. 本次重写必须纠正的表述

1. 物理拓扑固定为用户确认的卡间EP4 / 卡内TP4；不能反写，也不能把DP4再乘成64ranks。
2. 旧 `3656952b` 已非最新master；四kernel相同允许复用语义，不允许移动历史性能来源。
3. backup整层只是维护中的合同参考；model_state_dev模块使用fixture，未实现全部checkpoint loader；全仓另有固定旧依赖的300B真实checkpoint验收入口。
4. production Graph默认16B；不能作为300B当前per-tensor或最新组合验收。
5. FLAT16不是默认MoE dev，也不是TP16；T24必须经padding，不能凭T16例图延伸。
6. 当前model_state_dev next四kernel链没有额外align launch；固定旧SGLang真实权重链仍有align和UScale，二者不能混写。load-time remap仍是opt-in。
7. Shared只向EP0注入非零贡献。dev采用非EP0零占位；旧SGLang权重跨EP复制、结果只在EP0注入。均不额外broadcast加一次。
8. local Reduce不是TP/EP通信；Router factor只应用一次。
9. clamp10在模型JSON存在，但未传入当前dev caller，不能默认合同完整。
10. Routed双core默认按expert奇偶分工；Shared双core按I分工。不同轴不能用同一张“每核一半I”的图概括。

## 11. 已核对的ZD文件SHA256

```text
1d7f3567e84516a4465ae6fa9e0cb0424acfa059c12e75e93beea2ca07da37dc  glm5next_modules/configs/config_next.json
17baf08cfac895e9ebfbc052cffe5e923cbe6438d05df72261e778ebaf9ceaf2  glm5next_modules/README.md
3b50177f507ec4beb2a5aa9cb7f2843588a38dbce9696147a25c826814c0ab7d  glm5next_modules/docs/README_moe_dense.md
35c1258b304169fa349061929c91702470712d9f49c9087af06d37a287349b66  glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py
f8673f281fe2d0078eb7a69698d6ccc56f9b9484663062f80cebc1de8ed24dea  glm5next_modules/_support/_comm.py
3bf448960c572c5303a8c7eabcedbd0e0c38829977adeb840817dd92cbc38640  glm5next_modules/integration/comm_token_shard.py
cbecb106c5829c79370a5a660e26d700b2aae048ad004ca986b65ce6d6b27676  glm5next_modules/integration/comm_token_padding.py
94c6e7658a59082cf5e379bcc74852dab9e8fdd1af733a5e87f0739821ab88e5  backup/dev_glm5next_model_decode_modular_test.py
9ab6f894929d3a2ff8be3f0b854b6050035635f62577fcbb7c7d6825d4eb247c  glm5next_modules/tests/fixtures/moe_graph_factories.py
c4fd4ac65f18961b3ec48a655b7733ba99d293ceab65f4369c57b82c3c85517e  glm5next_modules/tests/production/test_zeus_fused_moe_production_graph.py
```

## 12. 固定旧SGLang下载文件SHA256

```text
c4b5c0033e76981ffb2bbe061c9f61677f009a3f95e5d6264b3b74880472a247  glm5_next.py
5eb1eab0327c78d50dfcda5b389cde3e1f541bd2eda4244d617b32b62ba93291  deepseek_v2.py
0754982a0bd0ae20446bc45d82214ef53cd9ea316fa5e3e4211bb143ca8ca41a  fp8.py
b148d6c55c8e5b86272d005e20d964b87836d0dd7efe5843e9d457e7c961a409  communicator_mhc.py
3fd04d8b30cb08951f2f5e5eb2cbb3f01654a775b25e07fe3b9e54b3171a491f  dp_attention.py
```
