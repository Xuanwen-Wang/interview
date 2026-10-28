# GLM-5.3-Flash MoE：优化实现与 Attention 通信边界

核对日期：2026-10-28（Asia/Shanghai）。本记录支持 `moe.html` 的完整重构。本文只读源码、核对配置和进行独立张量/所有权建模；没有执行设备 kernel、Graph、多 rank、CycleSim、VCS 或完整模型。构造路由与单通道数值不是真实请求录制。

## 版本与选择

- 用户要求以之前在 torch_zeus 优化的版本为主，不再将旧 checkpoint 验收链与优化四 kernel 并列讲解。
- `DarronTam/torch_zeus` 远端 master 核对为 `58e71d46629677b43e797deaae02d1a50eb72e57`，合入 PR #622 的 Routed scale 按需准备优化。先用 `git ls-remote` 固定 SHA，再通过 `gh api` 按 SHA 读取文件；GitHub 连接器对该仓库返回404，未用其失败结果判断源码内容。
- 本机 torch_zeus checkout 是 `68f19fa0a159b8ff861dc9cf736d9c0ae64906ba`，本次 MoE 主线不将该旧 checkout 冒充远端优化实现。下载文件保存在临时研究目录，没有修改业务 checkout 或其 refs。
- `bjxx-algo/zeus_dev` 固定 `05ee10f9cc25d19fca0a144ae095c79b3a888976`；引用文件逐字节等于 HEAD，未跟踪的说明文件未用作依据。它提供模块调用、通信 helper 与归档整层接线合同；未证明其与上述最新 kernel/compiler 组合已完成一次真实全模型联调。
- [官方 GLM-5.3-Flash config](https://huggingface.co/zai-org/GLM-5.3-Flash/blob/46a050bec13002ad29ee795c16e61cf4fa3c4a9c/config.json) 本次重新下载，SHA256 `bb8f01c42cb92a52ca72e65afb4d5bd8d11aef083cd210e8de25dfb904f23e9f`。语言主干 H4096、45层、3 Dense + 42 MoE、E288、Top8、Shared1、I2048。

下文 TZ 相对路径前缀为 `sgl-kernel-zeus-triton/python/glm53_flash/`，ZD 前缀为 `model_state_dev/`；源码链接均固定以上版本。

## Attention 与 mHC 边界

1. ZD `backup/dev_glm5next_model_decode_modular_test.py:396–441`：Attention mHC pre → Attention → Attention mHC post → MLP mHC pre → `_forward_mlp` → MLP mHC post。仅 `_forward_mlp` 内 MoE 分支做输入AG与输出RS；Dense只做TP SUM。
2. ZD `glm5next_modules/dev_linear_attn_fused_tp4_dp4.py:559–583`：KDA `forward_partial_zeus` 返回O-proj partial，`forward_zeus` 可在传入的TP组SUM。H4096、64×128 heads，TP4每rank16heads。C0是Attention合并，不是MoE的C2。
3. ZD `glm5next_modules/dev_mhc_dup4_dp4.py:445–475`：pre返回layer_input、residual、comb、post；post参数顺序是output、residual、post、comb。逻辑残差[B,4,H]，接口展平[B,4H]；comb[B,4,4]，post[B,4]，混合方向是comb转置乘残差。
4. 基线所有权：mHC side tensors、residual、request/cache索引留在原卡；C1只收集pre+norm后的X。该描述没有把模块测试中的额外payload诊断gather写成decoder必需通信。

## DSA 的三个 collective

ZD `glm5next_modules/dev_dsa_deepfused_cp4_dp4.py:257–336` 定义prepare与forward。固定B6、bucket模式、raw_score_capacity=8192：

| 调用 | 每rank发送 | 收集后 | 解释 |
| --- | --- | --- | --- |
| CP AG1 | Q[6,16,512] BF16 + raw-score[6,8192] FP32 = 288 KiB | 4×288 = 1152 KiB | 同卡CP4；wire包含候选/score区域，容量不等于最终选中数 |
| CP AG2 | O[6,64,512] BF16 + 4096B LSE区 = 388 KiB | 4×388 = 1552 KiB | 有效LSE[6,64] FP32=1536B，剩余为预留/对齐 |
| world AG | P3物理[6,1024] BF16 = 12 KiB | 16×12 = 192 KiB，视图[4,6,4096] | 展平的每卡[6×4096]按四个CP连续分块，不是逐token各取1024列 |

- TZ `dsa/sgl_dsa_proj_indexer_topk1.py:_prepare_large_batch`：Q区每capacity行4096个FP32字的空间（8192个BF16），raw score区每行8192个FP32字；不能沿用旧4096 score容量的192KiB发送大小。
- wire用BF16 view保留字节，不是FP32数值cast。
- TZ `dsa/sgl_dsa_absorb_proj.py:_direct_geometry,dsa_p3_prepare`：输出page-aligned [rows,1024]；writer按flat_output区间写入。P3按LSE合并CP partial并做投影；不是对局部softmax输出直接普通SUM。
- D3得到的是Attention A，调用者取local_output，再经过两次mHC边界得到MoE X。D3不自动替代C1；移除需整体重设计残差与side tensors所有权。

## MoE 的 C1 / C2 / C3

- ZD `glm5next_modules/_support/_comm.py:67–148`：`BoardReplicatedAllgather.n16-b4-PS1-steps3` 与 `BoardReplicatedReduceScatter.n16-b4-PS1-steps4` 均要求world16与lane `[p,p+4,p+8,p+12]`。逻辑语义是跨卡同lane，底层由world16共同参与定制算法，不声称四次独立普通NCCL collective。
- C1：[6,4096]→[24,4096] BF16，拼接不同DP行；没有求和。仅四卡独有行，不把同卡复制算成96个token。
- ZD `glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py:990–1158` 四kernel设备函数本来就接收完整T，排除collective；`1788–1802` 在外执行TP AllReduce(SUM)，然后board-replicated RS。
- C2：[24,4096]→同shape，合I512的四个分片后在卡内复制，得到本EP专家的完整贡献。
- C3：[24,4096]→[6,4096]，各lane合四卡专家贡献，并按token块归还。已TP复制的值再world SUM会多算4倍。
- ZD `glm5next_modules/tests/test_modular_moe_contract.py:90–138` 断言gather→kernel→TP reduce→EP scatter。测试的存在不等于本次重跑。
- `integration/comm_token_shard.py` 的FLAT16保持为折叠补充；与主线不能叠加使用求和步骤。

<a id="router"></a>
## Router

TZ `moe/sgl_moe_router_linear_biased_topk.py` 的pack和公开API：W[288,4096]BF16、bias[288]FP32、ID[T,8]int32、α[T,8]BF16；逻辑288、计算320、pack384。当前quad路径使用M4投影及每行SRAM view，T24每core12行，按三组组织。默认accurate sigmoid，`use_calibrated_sigmoid=False`；实验LUT需显式开启。选择用s+bias，概率用无bias的s；Router乘factor2.5，Reduce传1。

<a id="placement"></a>
## Expert ownership

默认EP区间0–71/72–143/144–215/216–287，每rank I512。Routed默认每core36个本地专家，每个选中专家的I512由owner core完整计算；Shared在rank内把I512再分为两份I256。`expert_layout.py` 支持显式load-time remap，固定ZD caller未传映射。跨EP layout不等于token网络AllToAll。

<a id="shared"></a>
<a id="clipping"></a>
## Shared 与 clamp

TZ `moe/sgl_moe_shared_expert_silu_down_tp4.py` 与2026-10-25快照文件hash相同。BF16 Shared，输出[2,T,4096]；M8 Gate、M4 Up/Down流水；compute=False需要调用者同时禁用消费。ZD dev EP0非零、其他EP零占位仍launch，最终Shared只加一次。

模型要求clamp10；ZD caller没有传`swiglu_limit`，Shared/Routed默认None。若上层传10，Gate只有上界，Up双侧截断。本文保留这一调用差异，未改业务接线或宣称缺口已解决。

<a id="routed"></a>
<a id="routed-precision"></a>
<a id="routed-group"></a>
## Routed

TZ `moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py`：pack源GateUp[72,1024,4096]、Down[72,4096,512]；block scales反量化经BF16后对每expert的Gate/Up/Down分别做per-tensor FP8重数量化。运行时两处activation FP8 cast均scale1；输出未加权BF16[T,8,4096]，只定义当前EP有效slot。

T16/24/32满足守卫时设备按专家归组，最大M4；保留原token/slot写回，重复slot属于ABI鲁棒性例。最新PR622取消merged路径的冗余展开scale表，只用[72,3]FP32=864B；M1/static需要[72,1024]FP32=288KiB，在首次预热时按需分配，capture中禁止临时建立。量化与算术合同不因这个内存优化改变。

README要求包含triton_shared MR !1200的编译器；kernel launch自带的配置不能推广成Shared/Reduce的进程级默认。本文未运行编译器或业务回归。

<a id="reduce"></a>
<a id="reduce-budget"></a>
## local Reduce

TZ `moe/sgl_moe_sum_reduce_core_partial.py:414–441` 在T8/16/24/32、K8/H4096/unit scales等条件下选择 `sgl_moe_reduce_sparse_fast.py`。fast实现hash与2026-10-25相同。Shared-first、slot升序、FP32乘加后BF16；按当前IDs判断本地有效行，NaN/Inf remote行不参加算术。连续DMA加载的跨度可以大于有效payload。

T24完整R容量1536KiB；均衡48条有效route=384KiB，有Shared时S读取384KiB，输出192KiB；960KiB是有效张量payload示例，非网络或HBM测量。

<a id="chain"></a>
<a id="historical"></a>
## 数学与历史证据的边界

本文交互保持真实H4096/E288/I2048/Top8/TP4/EP4，构造单输出特征检查求和：α=0.3125，slot k / TP p 的partial=(k+1)(p+1)(token+1)/8，Shared在EP0为(p+1)(token+1)/8。token7的四卡贡献为19.375/21.875/34.375/46.875，和122.5，回卡1行1；错误world SUM得490。它忽略设备舍入，不能充当数值golden。

`scripts/check_moe_model.js` 另用不均匀Top8分布、完整expert参考与独立Shared项验证T8/16/24/32，检查重复Shared、错误owner顺序与重复SUM反例。旧PR570/592与性能数字仍链接历史文件，未升级为最新源码实测。

## 引用文件 SHA256

以下清单由本次实际读取的内容生成；公开资料仅保存源码定位与hash，不包含业务权重、真实请求或本机路径。

| 仓库 | 相对文件 | SHA256 |
| --- | --- | --- |
| zeus_dev | `model_state_dev/glm5next_modules/_support/_comm.py` | `f8673f281fe2d0078eb7a69698d6ccc56f9b9484663062f80cebc1de8ed24dea` |
| zeus_dev | `model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py` | `35c1258b304169fa349061929c91702470712d9f49c9087af06d37a287349b66` |
| zeus_dev | `model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py` | `4218bf3c00cd6d12ecf9f8d85daa298f07e64bff2d0f9be0d93123fcee64773e` |
| zeus_dev | `model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py` | `23e10c5ff491d75c87147ffe261518305e01dfd9e77c468711d1a3caaf467e98` |
| zeus_dev | `model_state_dev/glm5next_modules/dev_mhc_dup4_dp4.py` | `a77ed6fdaf7eb012933a2147c6d3e207d5c21207da5dbf1606533bced8bc25f0` |
| zeus_dev | `model_state_dev/backup/dev_glm5next_model_decode_modular_test.py` | `94c6e7658a59082cf5e379bcc74852dab9e8fdd1af733a5e87f0739821ab88e5` |
| zeus_dev | `model_state_dev/glm5next_modules/tests/test_modular_moe_contract.py` | `c1bc71487e5d9cf13974726def4f3f8ed7edb4a8f04ef8af85a530be57109cc4` |
| zeus_dev | `model_state_dev/glm5next_modules/integration/comm_token_shard.py` | `3bf448960c572c5303a8c7eabcedbd0e0c38829977adeb840817dd92cbc38640` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/moe/README.md` | `398f25f8321cdcfd3738062e8bd170a811d2721ae8cef4b0fc88c8ad63067849` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py` | `44a1773b5dc20bf2409ac0071eabcd78fd9a0b0acbe678fcf4f4e9770367bad0` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py` | `dc8e1cd71abb3da0200bf4ef39a9ef1985424efc7127fa0e51f7e4f1339ba819` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py` | `18a90f68f50b199ebf4ba8c742620a7cc5f45df4755fa35166a3d32f86f66a64` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_sum_reduce_core_partial.py` | `217e843c05693ed1da2531a62f0cfd5c1ca8b8546534c60dcdc871347a3937bd` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_reduce_sparse_fast.py` | `70ae7ea696788927449a83348cc430006825584b3fad61bde89c719b6fa887b9` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/moe/expert_layout.py` | `d08c80ede994c6e0ee72ee76a55f7c2a3b15646ae46f3e5331638014e540703f` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_absorb_proj.py` | `34ffefbdf146214d85defea1c9c8d7e77a9e951fc6e9d2dbbd03446af2ff244b` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py` | `aa9cf5da8a49c3001994ce9057f533d3b2515710d99f28a31db15412ae5fc186` |
| torch_zeus | `sgl-kernel-zeus-triton/python/glm53_flash/mhc/sgl_mhc_pre_sinkhorn_mix_norm_triton.py` | `9dc293ef83b06596e022c2223d961ff280251497822fe64705f0e2366a9d3683` |
