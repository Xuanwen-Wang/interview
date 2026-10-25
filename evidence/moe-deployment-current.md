# GLM5Next300B MoE：2026-10-25 默认分支复核

本页区分“远端默认分支源码”“本地编译器源码”“历史实测”和“集成合同测试”。没有在本轮执行设备、CycleSim、VCS 或完整模型性能测试；两个仓库各自最新不等于已经联调通过。业务仓库只读，GitHub App 对业务库返回 404 后，使用已有授权的 GitHub API 按固定 SHA 读取。公开页面仅保留必要源码定位，原仓库链接仍需要原访问权限。

<a id="heads"></a>
## 1. 默认分支身份与计时边界

| 仓库 | 默认分支 | 冻结 SHA | commit UTC 时间 |
|---|---|---|---|
| DarronTam/torch_zeus | master | `3656952bfee88b1d5f7b68d0e724e54a7a5353d7` | 2026-10-24 05:33:45，合并 PR #600 |
| bjxx-algo/zeus_dev | main | `05ee10f9cc25d19fca0a144ae095c79b3a888976` | 2026-10-21 05:32:55，合并 PR #133 |

核验使用仓库 API 的 default_branch 与 commits/{branch}；不以 pushed_at 当作默认分支更新时间。2026-10-25 从 contents API 指定上述 SHA 下载并核对相关源码。下文 `TZ` 指 torch_zeus 冻结 SHA，`ZD` 指 zeus_dev 冻结 SHA。

本轮逐字节比较：TZ 的 Shared `sgl_moe_shared_expert_silu_down_tp4.py`、Routed `sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py`、Reduce `sgl_moe_reduce_sparse_fast.py` 与历史 PR #588 head `882bdf9be61303f826cc3eb3338c2c716f898909` 对应文件相同；Router 已加入可选 ID 重排。此结论允许沿用这些 kernel 的语义解释，**不允许把 PR #588 或旧编译器的性能改记为本轮实测**。历史表继续保留原输入、core duration、VCS/CycleSim 和通信排除范围。

<a id="caller"></a>
## 2. 四 kernel 的真实调用者

[ZD dev_moe_fused_fp8_tp4_ep4.py](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L1000)：`forward_zeus` 在约 1000–1158 行依次调用 Router、Shared、Routed、Reduce。Router 应用 routed factor；Reduce 传 factor=1。300B 采用 per-tensor Routed，Shared 用 BF16 kernel；旧 G128 分支并不等于这条四核路径。Shared 与路由数据独立，但当前同 stream 先后提交；源码没有证明二者已重叠。

同文件约 797 行 Router pack 未传 `logical_to_physical`；约 805 行 Routed pack 采用默认连续 expert 所有权。约 1338–1360 行分布式 Graph 测试、1795–1811 行 worker：local 输出后做 TP AllReduce，再做跨 EP 的 board-replicated ReduceScatter。输入完整 T 已由 standalone harness 提供；四 kernel 函数内部没有输入 AllGather。

Graph 测试约 1364–1400 行对 A/B/A 显式 replay，poison 可写状态，检查 TP/RS 与 eager bit-exact、有限值、输入输出改变、scratch 地址稳定。源码中有测试逻辑，不代表本轮已运行或最新两库已验证通过。

<a id="communication"></a>
## 3. Gather、TP 求和与 EP 归还的来源范围

- [ZD backup DecoderLayer._forward_mlp，412–427 行](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/backup/dev_glm5next_model_decode_modular_test.py#L412)：board token shard → board-replicated AllGather → local MoE → TP AllReduce → board-replicated ReduceScatter。
- [ZD 当前 CPU 合同测试](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/tests/test_modular_moe_contract.py#L90) 导入上面的 backup 模块并验证调用顺序与 shape。这是可定位的集成/测试合同，不据此声称它是外部 SGLang 的生产入口。
- [ZD _support/_comm.py，67–154 行](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/_support/_comm.py#L67)：helper 强制 world16、每 board 四 rank、跨板 lane `[p,p+4,p+8,p+12]`；RS 沿指定维切成四份，count 使用输出元素数。

因此 baseline 在 T24/H4096/BF16 时为每 board 6 行（48 KiB）→全局24行（192 KiB）→本地 partial（192 KiB）→TP 求和后完整本板专家贡献（192 KiB）→EP 求和并归还6行（48 KiB）。这些是 tensor payload，不是物理链路总流量。TP AllReduce 的复制结果不能再沿 world16 无差别 SUM，否则重复计数。

本轮在上述 MoE caller 与 helpers 中未见 selective token AllToAll 调用。device-side expert 归组、local gather/scatter、load-time 跨 EP 权重摆放，都不等于跨 rank AllToAll。另一个同 SHA 的 `integration/comm_token_shard.py` 提供 FLAT16 集成窗口；它与此 baseline 的 token layout、collective 顺序不同，由“整层并行与通信”章单列，不能拼接两条路径。

<a id="router"></a>
## 4. Router：选择域、概率域与 ID 域

[TZ Router](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py)：约 225–250 行倒数和 ID remap；约 540–680 行 T24 三组四行投影与逐行后处理；约 1073 行 pack 接口，1251 行后公开 wrapper 的 mapped-shape 检查。

实际链：BF16 dot-visible logits → FP32 `tl.zeus.sigmoid(..., approx="accurate")` → 加 correction bias 的选择域 → native TopK packet/逻辑 IDs → 从未加 bias 的 scores gather → sum → `rsqrt(sum)^2` → routed factor → BF16 weights。若启用 remap，只对输出 IDs 做整数映射，概率 gather 仍按逻辑 IDs。极端零分母不擅自加 epsilon 改合同。

H4096/E288/K8；物理 pack E384，quad compute E320，invalid 32 lanes 由负 sentinel bias 排除；不是新增专家。Remap 当前限定 T4/8/16/24/32、H4096/E288/K8 的支持路径。Graph 前 pack 并保留映射缓冲。

<a id="sigmoid-lowering"></a>
## 5. accurate sigmoid 与 native packet：本地编译器快照

这些解释取自本地 clean tracked 文件，不宣称已核验远端最新或已与 TZ/ZD 联调。

- `triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a`：`lib/Conversion/ZeusLinalgToZeusHigh/ZeusLinalgToZeusHigh.cpp` 1417–1735 行，accurate sigmoid 的 exp2 分数 LUT、正有限 denominator、reciprocal seed、一步 Newton `r1=r0*(2-d*r0)`、小于 −80 的负尾保护。指数偏移 +23，再乘 2^-23；下界 −104。约 1440–1450 行给出常数与理由。13 个 VP 是这一 lowering 的静态构造注释，不是任意版本的运行时延或最终指令计数保证。
- 同 SHA `lib/Dialect/ZeusLinalg/ZeusLinalgOps.cpp` 290–299 行：accurate 仅支持 sigmoid 且 `seg_num=64`。它不是 fast 模式直接拟合 sigmoid 的那条 LUT；两个路径共享“64”不能当作同一数值实现。
- `triton@7df590e44739a6da641d3402ed9d33892746a53d`：`python/triton/language/zeus/__init__.py` 374–415 行 sigmoid 语义；972–991 行 packet API。
- 同 Triton SHA `include/triton/Dialect/Triton/IR/Dialect.h` 25–32 行：native TopK packet 共32个 raw i32 word，前16槽是值的位模式、后16槽是 raw index；只有各半部前 K 槽有效。K8 时不能把整包理解成32个专家 ID。
- `triton_shared@82613bc2` 同 conversion 文件 625–657 行：native packet 静态 shape、单行、最后一维、i32 packet 与 K 个 indices sibling 的核验；producer identity 保留给后续 Gather。这里不推断 TOPK 的硅上 latency、tie 顺序或所有 VP lane 的执行细节。

<a id="projection"></a>
## 6. Routed、Shared、Reduce 的数值合同

[TZ Routed](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py)：29–109 行 I512 非均匀 SiLU LUT；584–674 行 owner Gate/Up/Down；691–745 行 token/slot scatter 和重复 slot；1499–1514 行 block-weight 反量化并重数量化；1684–1789 行 shape、alias、merge 和 per-launch compiler flags。

每 expert 的三份 per-tensor scales。激活两个转换点 scale=1；Gate/Up FP32 dot×scale→BF16→FP32；SiLU×Up→BF16→FP8；Down FP32 dot×scale→BF16。实际 300B 模型还传 swiglu_limit 时应保留 Gate 上限与 Up 双侧截断的既有位置。默认 merge 只在明确 shape/map 条件下使用 M1/M2/M4，M3 可用 M4 padding；重复 token/同 expert 的多个 slot 只算一次，仍向每个原 slot 写出，Routed 输出未加路由权重。

[TZ Shared](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py#L356)：约356–426行 Gate M8、Up/Down 分 M4 行链。TP rank 持有 I512，双核各 I256；每核产生完整 H 的 partial。只有 EP0 持有非零 Shared 权重的语义贡献；caller 可能在其他 EP 执行零权重占位，不能把“只贡献一次”误写成代码必定只 launch 一次。

[TZ Reduce](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_reduce_sparse_fast.py#L210)：Shared 两核 partial 的 FP32 和作为初值；按本地专家 mask、升序 slot 对 unweighted Routed BF16 行乘 BF16 weight 的 FP32 提升值并累加，最后 BF16 store。无效行可含 NaN/Inf，必须在算术前 guard；`0*NaN` 无法代替 guard。是否 FMA、是否跨 kernel 融合必须由编译产物确定，不能仅从数学式保证逐位等价。

<a id="placement"></a>
## 7. 新的 cross-EP layout 是可选 load-time ownership

[TZ expert_layout.py](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/expert_layout.py#L1) 与 [MoE README](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/README.md#L49)：每层一份288专家双射，物理 EP-major，每 EP72、每 core36，Shared EP0一次。提供层3–44冻结配置，T4/8/16/24/32共享每层 map。

`pack_routed` 回调输入是原逻辑 expert 的 TP 分片：GateUp `[1024,4096]` FP8、scales `[1024,32]` BF16，Down `[4096,512]` FP8、scales `[4096,4]` BF16。权重与 scale 同步迁移，Router weight/bias 保持逻辑顺序。省略冗余 identity expert_core_map，保留默认 merge eligibility。Graph 外 pack；映射在 replay 期间不随 token 重拟合。

README 明说 opt-in、导入配置不会自动激活 SGLang。ZD 当前 pack caller 未采用该 layout。统计选择/调参曾使用原672-case及multi-T数据，所以这些后续 replay 是回归，不是独立 holdout；不将该性能报告迁移成最新完整模型实测。其原冻结报告另见 [47b2b558 联合回归报告](https://github.com/DarronTam/torch_zeus/blob/47b2b558e85924560f3bfcde8372e4e48a1d1cfc/dev_docs/evaluations/moe_cross_ep_joint_20261023/README.md)。

<a id="hashes"></a>
## 8. 下载文件校验

均为 TZ 下 `sgl-kernel-zeus-triton/python/glm53_flash/moe/`：

| 文件 | SHA256 |
|---|---|
| README.md | `86149f91ba8f8fe6389bb6da018b5bdcc5bbf87c2e8cddd960b883a5a0393ffe` |
| expert_layout.py | `d08c80ede994c6e0ee72ee76a55f7c2a3b15646ae46f3e5331638014e540703f` |
| sgl_moe_router_linear_biased_topk.py | `5c8a1db2845b1be63222f0fe9523abefebaa233b5347f44e744c8774a0464f8f` |
| sgl_moe_shared_expert_silu_down_tp4.py | `dc8e1cd71abb3da0200bf4ef39a9ef1985424efc7127fa0e51f7e4f1339ba819` |
| sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py | `143bb23ee6ba78eb8bef81d83e23a204cd5c3a57f8fd6a760483575fb6cbaf6d` |
| sgl_moe_reduce_sparse_fast.py | `70ae7ea696788927449a83348cc430006825584b3fad61bde89c719b6fa887b9` |

复核结论只覆盖上述源码及数学/shape推导。旧章节中的 PR #570/#588、Issue #592、VCS 与 NV对照仍按各自历史证据页解释；本页不更改它们的实验分母。

<a id="validation"></a>
## 9. 本轮内容验证

- 对新增两章全部16节执行 JSON、SVG XML、章节路由与显式证据锚点检查；对三个修改/新增内容文件扫描敏感个人目录、主机地址与凭据前缀，未发现相关内容。
- 独立脚本复算：精确实数 `[5/6,5/3]` 的 BF16 舍入为 `[0.83203125,1.6640625]`；M4 三投影 `50,331,648 FLOPs` / `6 MiB` = `8 FLOPs/B`；M3有效行相同权重账为 `6 FLOPs/B`；有效张量读取与输出的示例预算 `960 KiB`；TP/EP教学求和 `155` 与误把复制再求和的 `620`。
- 再次将当前三个 kernel 文件与 PR #588 head 完整 SHA 的 git 对象逐字节比较，结果一致。
- 算法域的 `ffn-to-moe` 已清除芯片、TP/EP、pack、PR 性能与个人工作归属，保留通用数学与论文出处。当前源码与历史案例通过显式版本说明分开。
- 未执行设备、CycleSim、VCS、Graph或E2E新测量；网页整体构建与浏览器检查由主任务统一进行。
