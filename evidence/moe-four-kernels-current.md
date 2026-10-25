# GLM5Next 300B 四 kernel：2026-10-25 源码核对

本证据页支持单篇 MoE 部署讲解中的 Router、Shared、Routed、Reduce。业务源码仅只读；本轮没有执行设备、CycleSim、VCS、Graph、多 rank 或完整模型测试。页面的图与手算用于解释源码合同，不是新增性能或模型质量证据。

<a id="versions"></a>
## 1. 本次冻结身份

- `DarronTam/torch_zeus`，远端 `master`：`01046b2bd533fcd3a6754c2f6e03ca612000b176`，commit 时间 `2026-10-25T07:48:12Z`，merge PR #608。通过 `git ls-remote` 读取远端，并通过 GitHub API 按该完整 SHA 读取文件。
- `bjxx-algo/zeus_dev`，`main`：`05ee10f9cc25d19fca0a144ae095c79b3a888976`。本文 `ZD` 指这个冻结版本。
- 以下五个 MoE 文件在新 `torch_zeus` SHA 与原证据 `3656952bfee88b1d5f7b68d0e724e54a7a5353d7` 的下载文件逐字节相同。这说明本文复用的语义仍匹配源码，不说明旧编译器的机器码、误差或时延在本轮重新验证通过。

| 文件（均在 `sgl-kernel-zeus-triton/python/glm53_flash/moe/`） | SHA256 |
|---|---|
| `sgl_moe_router_linear_biased_topk.py` | `5c8a1db2845b1be63222f0fe9523abefebaa233b5347f44e744c8774a0464f8f` |
| `sgl_moe_shared_expert_silu_down_tp4.py` | `dc8e1cd71abb3da0200bf4ef39a9ef1985424efc7127fa0e51f7e4f1339ba819` |
| `sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py` | `143bb23ee6ba78eb8bef81d83e23a204cd5c3a57f8fd6a760483575fb6cbaf6d` |
| `sgl_moe_reduce_sparse_fast.py` | `70ae7ea696788927449a83348cc430006825584b3fad61bde89c719b6fa887b9` |
| `expert_layout.py` | `d08c80ede994c6e0ee72ee76a55f7c2a3b15646ae46f3e5331638014e540703f` |

<a id="router"></a>
## 2. Router：概率、身份和数据形状

[TZ Router 固定源码](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py)：

- 225–230 行：选中 scores 的和使用 `rsqrt(x)²`，保留零分母既有语义。
- 556–639 行：T24 quad 分支的 accurate sigmoid、bias 选择域、native packet/逻辑 indices、从无偏 scores gather、归一化、scale、BF16 输出。
- 1073–1115 行：pack 全专家 Router 权重并在每 core 保存完整副本；可选映射必须在 Graph capture 前处理。
- 1248–1285 行：quad profile 与 remap 支持 shape 的显式守卫。
- E288 是逻辑专家数，E384 是128行对齐 pack，E320是该 profile 的计算前缀；32个无效计算 lane 由负 sentinel bias 排除。

[ZD caller](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L1024)：Router 应用 routed factor，Reduce 传1。883–912行分别分配 `[T,8]` BF16 weights、int32 IDs、`[T,8,H]` BF16 Routed、`[2,T,H]` BF16 Shared、`[T,H]` BF16 output。

文章只按 kernel API 使用 native packet。若需32个 raw word、值半区与索引半区的具体编译器布局，另见[原冻结编译器证据](moe-deployment-current.md#sigmoid-lowering)，不能把它当本次最新编译器联调证明。

<a id="placement"></a>
## 3. logical / physical 与 owner

[TZ expert layout](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/expert_layout.py) 与 [README](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/README.md)：固定每层映射是可选 load-time 布局；单纯导入配置不会自动启用 SGLang。

- Router 246–248行 remap 保持概率 gather 使用 logical ID；映射只变输出整数 ID。
- Routed 1517–1544行：缺省按 local expert 奇偶分 core；显式 `expert_core_map` 要求两 core 各恰 E/2。E72因此为36/core。
- ZD pack 797–815行未传 `logical_to_physical`，也未传 `expert_core_map`。当前 caller 使用连续 EP-major 专家区间；能力存在不等于已启用。
- cross-EP 专家权重重排不是每 token 的网络 AllToAll。

<a id="shared"></a>
## 4. Shared：I 分片、双 core 与可选跳过

[TZ Shared 固定源码](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py)：

- 190–295行：完整 K 的 Gate、Up BF16投影边界，M8 Gate、分行Up、受守卫前瞻。
- 356–426行：M4激活/Down行链与 BF16 partial store；没有沿 reduction 维额外分割 dot。
- 430行后 pack 把 TP-local I512 平衡切成每 core I256。三个矩阵每 core 纯 BF16 6 MiB；不是把这些权重全放入512 KiB片上激活空间。
- 651–669行：返回 `[2,T,H]` BF16；`compute=False` 是可选 API，会完全跳过且 out保持原值，调用者不能继续消费它。
- 742–749行：两个 plane 由同一 parent 衍生，禁止 output 与 input alias。
- 752–756行：流水 profile 的 shape 守卫。

ZD当前 caller仍调用 Shared，未使用 `compute=False`。EP0开发权重与其他EP零占位的数学贡献及实际launch次数应分开；本轮未核验生产 SGLang 调度器的跳过策略。

<a id="clipping"></a>
## 5. 重要纠正：模型配置的 clip 并未自动进入当前开发调用链

[Shared API 657行](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py#L657) 与 [Routed API 1685行](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L1685) 的 `swiglu_limit` 默认都是 None。[`common/_swiglu.py` 5–7行](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/common/_swiglu.py#L5) 将 None 转为 −1.0。

Shared 385–395行与 Routed 603–625行只在 `SWIGLU_LIMIT >= 0` 时裁剪：Gate仅上限、Up双侧截断。ZD `dev_moe_fused_fp8_tp4_ep4.py` 没有 `swiglu_limit` 参数传递；所以“模型配置limit=10”不能作为“这条开发调用已经执行clip10”的证据。正文分别写清配置、可选API、当前调用状态；本轮未改业务代码补接参数。

<a id="routed"></a>
## 6. Routed：owner、shape 与未加权输出

[TZ Routed 固定源码](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py)：

- 584–672行：Gate、Up、SiLU×Up、Down形状与完整数值顺序。
- 1548–1589行：pack输入CPU tensor shapes与格式；I512默认完整专家归一个core。
- 1684–1696行：返回未加权 `[T,topk,4096]`，非本地行未定义，activation scale固定1，Graph资源准备在外部。
- 1707–1746行：连续BF16 hidden、连续int32 IDs、输出shape/设备/非alias校验。

Routed拥有专家的core计算完整 rank-local I512，不像Shared那样将同一专家再切成两个I256。其输出没有Shared式第一维core plane。

<a id="routed-precision"></a>
## 7. Pack 与运行时精度

- Routed 1499–1514行：原block scales反量化、BF16边界、amax/448、零scale置1、重新E4M3FN量化。
- Routed 1485行：每expert的Gate/Up/Down三份FP32 scales。
- Routed 601–638行：FP32 dot×scale→BF16→FP32，再SiLU LUT×Up→BF16→FP8；664–665行Down dot×scale→BF16。
- 两个activation cast固定scale1；TP-local的per-tensor quantization域不能与全专家/其他TP配置的quantization域混同。
- 当前clip接线状态见上节；本文未把配置10硬塞入开发caller。

<a id="routed-group"></a>
## 8. Grouping、padding 与原 slot

- Routed 691–744行：真实行写回原token/slot；同一token/expert的多个slot复用输出但分别store；M4第四行padding不store。
- 1688–1696、1748–1765行：T16/24/32、I512、top8、default map和ID边界守卫；host不读IDs，动态计划在device，显式static map走独立入口。
- 1769–1772行：当前T24/T32与其他profile有不同L2 headroom/executor配置，不能把所有收益只归因于M变大。
- M4纯三矩阵：`6×4×4096×512=50,331,648 FLOPs`，三份FP8权重6MiB，理想8 FLOPs/B；M3有效工作对应6 FLOPs/B。前提是一次共同遍历，未计scale、metadata、padding执行、VP、控制和物理返回放大。

<a id="reduce"></a>
## 9. Reduce：无效行、次序与舍入

[TZ Reduce 固定源码](https://github.com/DarronTam/torch_zeus/blob/01046b2bd533fcd3a6754c2f6e03ca612000b176/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_reduce_sparse_fast.py)：

- 134–213行：FP32 accumulator以Shared双plane求和初始化；无Shared时为0。
- 233–260、279–299行：slot升序，用owner mask在浮点算术前guard；非本地NaN/Inf行不能用0乘代替guard。
- 270–308、310–335行：结果完成后一次转BF16并store；当前fast合同不保证与所有更老consumer逐位相同。
- 338–358行：每token找lo/hi/mask；空mask允许加载一行但不参与算术。

Router alpha已含factor2.5，Routed output未加权，ZD Reduce传factor1。因此最终local Reduce乘一次路由权重，Shared不随之缩放。

<a id="reduce-budget"></a>
## 10. 数据量与流水的推导范围

T24/H4096/K8/BF16：完整Routed容量1536KiB，均匀EP4期望48有效route读384KiB，Shared双plane读384KiB，output写192KiB，IDs/weights1152B。960KiB是示例有效张量payload，不是硬件流量。当前非EP0 caller仍传Shared零占位输出，不能未经调用变更就删去Shared读取预算。

Reduce 215–219行说明A/B交错tile；140–184行说明T32按half staging的容量约束；连续slot0–7跨度为64KiB，而只有两个有效slot时实际算术行16KiB。以上推导均不宣称518或NVIDIA实测。

<a id="historical"></a>
## 11. 保留的历史反例

- 低复用随机T16/EP3：35 routes、5个M2加25个M1、无M4，Routed `0.0749625→0.0828275 ms`，属于PR #570的固定历史案例。详见[既有MoE证据索引](moe-sources.md)与[深入证据](moe-deep-sources.md#routed)。
- Issue #592首次分歧：[PR #588固定head的定位记录](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/dev_docs/evaluations/moe_issue592_20261022/README.md)。CPU FP32 dot与高精度/设备dot位于BF16中点不同侧；修正参考累加而保留生产kernel和原精度门槛。此案例不是本轮新增测试。

<a id="chain"></a>
## 12. 四 kernel 与外部通信、Graph的边界

[ZD forward_zeus](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L1000) 依次调用四kernel；input已含完整T，函数内部无AllGather/AllToAll。当前同stream顺序提交不证明Shared已与Router/Routed重叠。

Graph分布式测试的TP/RS与A/B/A replay见同文件1338–1400行；输入AllGather的更外层证据来自[backup DecoderLayer](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/backup/dev_glm5next_model_decode_modular_test.py#L412)及[CPU合同测试](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/tests/test_modular_moe_contract.py#L90)。它们是可定位开发/测试合同，不是外部生产入口或checkpoint全模型验收。

卡内TP4先合I分片；跨卡EP4按同lane合专家贡献并归还token。155/620教学例忽略舍入，仅说明TP复制不能被再次无差别world SUM当成新数学贡献。
