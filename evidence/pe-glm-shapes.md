# GLM5Next 300B：真实投影 shape、owner 分工与 PE minitile

本文于 2026-10-25 只读核验固定 Git 对象；没有编译业务、运行设备、CycleSim、VCS 或新的性能测试。范围是内部 GLM5Next 300B TP4×EP4 配置，不能等同所有公开 GLM-5。源码中的 `pe_dot` shape/pin 与最终发射指令分别举证；历史反汇编见 [minitile 选择链](pe-minitile-selection.md)。

<a id="versions"></a>
## 1. 固定版本与引用约定

- TZ：`DarronTam/torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`。
- ZD：`bjxx-algo/zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`。
- Routed 文件简称 R：`sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py`。
- Shared 文件简称 S：`sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py`。
- Caller 文件简称 D：`model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py`。
- 当前 TZ 的 R/S 与 PR #588 head `882bdf9be61303f826cc3eb3338c2c716f898909` 逐字节相同，本轮重新以 Git 对象 diff 和 SHA256 核验。相同源码不能把旧性能改记为当前编译器实测。

下文 shape 统一写 `(M, CI, CO)`；数学为 `A[M,CI] @ B[CI,CO]`。硬件 K 表示输出通道，不能与 GEMM 常写的归约 K 混用；pin 的展示顺序统一为 **w/c/k**，而源码调用的关键字可能是 `mtw/mtk/mtc`。

<a id="topology"></a>
## 2. 从逻辑 expert 到 TP rank，再到芯片 core

[D:116–157 的配置与局部维度](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L116) 定义 `TP_SIZE=4`、`EP_SIZE=4`，`next=(H4096,E288,routed I2048,shared I2048,top_k8,...)`，所以每个 EP 有72个专家，每个 TP rank 持有同一专家的512个中间通道。

| 层次 | Gate / Up | Down | 所有权 |
|---|---|---|---|
| 一个完整逻辑专家 | 分别 `4096 → 2048` | `2048 → 4096` | EP 只分专家集合 |
| 一个 TP rank 的专家分片 | 分别 `4096 → 512` | `512 → 4096` | 4 个 TP rank 的 Down 是同一 H 输出的不同 I 部分和 |
| 当前 Routed owner 的一个 core | 分别仍是 `4096 → 512` | 仍是 `512 → 4096` | 完整 TP-local 专家交给一个 core，另一 core 处理其他专家 |
| 当前 Shared 的一个 core | 分别 `4096 → 256` | `256 → 4096` | 同一个 Shared 的 TP-local I512 再按 I 分给两个 core |

R:1517–1522、1550–1558、1610–1651 明确默认 expert `e` 归 core `e % 2`，core 内 slot 为 `e // 2`，每 core 36 个完整 TP-local expert。这里 e 是减去 expert_start 后的 rank-local expert ID。不能把 Routed 的两个 core 理解成给每个专家再做一次 TP2。

[默认 core ownership 与 pack](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L1517)。[D:272–298](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L272) 定义 EP expert 区间；Routed 输入完整 H，不因 TP4 把 CI4096 再除4。

<a id="owner-shape"></a>
## 3. 当前 owner 合并路径：Gate 和 Up 是两条投影

[R:584–665](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L584) 给出直接证据：

- Gate 权重保留 packed parent `(2I,H)`，但 block shape 为 `(I,H)`、offset `(0,0)`；Up 使用同 parent、offset `(I,0)`。因此 parent 的 GU1024 不是每条 dot 的 CO1024。
- Gate/Up：`ztl.pe_dot(x, trans(weight), ymode="KC", mtw=M, mtk=tile_k, mtc=tile_c)`，每条 shape 为 `(M,4096,512)`。
- Down：`ztl.pe_dot(activation, trans(weight), ymode="KC", mtw=M, mtk=16//M, mtc=2)`，shape 为 `(M,512,4096)`。
- `tile_c=32 if M==1 else (16 if M==2 else 8)`；`tile_k=4 if M<4 else 2`。

| 当前合并桶 | Gate/Up 每条 pin w/c/k | Gate/Up Cᵤ/Kᵤ | N_TC / N_TK | Down pin w/c/k | Down Cᵤ/Kᵤ | N_TC / N_TK |
|---|---|---|---|---|---|---|
| M1 | 1 / 32 / 4 | 32 / 4 | 1 / 1 | 1 / 2 / 16 | 4 / 32 | 2 / 2 |
| M2 | 2 / 16 / 4 | 32 / 4 | 2 / 1 | 2 / 2 / 8 | 4 / 32 | 2 / 4 |
| M4 | 4 / 8 / 2 | 32 / 4 | 4 / 2 | 4 / 2 / 4 | 4 / 32 | 2 / 8 |

此处 FP8×FP8 KC 的 `C_unit=128, K_unit=128`，`Cᵤ=CI/128, Kᵤ=CO/128`；`N_TC=ceil(Cᵤ/c)`、`N_TK=ceil(Kᵤ/k)`，外层W区段数为`N_TW=ceil(M/w)`。这些 shape 都整除，没有 CI/CO 尾块 padding；M3 可借用 M4 的第四行进行计算，但不写出该伪行。

### M 不是全局 T，也不是 route slot 数直接相加

R:748–769、773–814、830–901、905–948 按同一 expert 的 token 位图收集独立行；R:691–744 将结果写回原 token/slot。重复 token 对同一 expert 的多个 slot 可共用一次投影，再分别写回；因此 M 按这一计算组的不同 token 行计数。一个 expert 命中更多行会分成多个 M4/M2/M1 组，不会自动扩大成 M8/M16。

R:1684–1695、1747–1756 的公开 wrapper 默认 `merge_tokens=True`，只有 T16/T24/T32、top8、I512、默认 ownership/满足 ID 范围等条件走 owner merge；host 不读取 ID 内容来规划分组。M4 padding 行仍是定义好的输入行（可借 token0），不是依靠未初始化数据；是否写回由有效 slot 控制。

[分组、padding 与 scatter](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L691)，[dispatch 条件](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L1684)。

<a id="quantization"></a>
## 4. 此处是 FP8 per-tensor，不是运行时 UScale GEMM

R:1499–1514 将原 per-128 scale 权重先反量化并经过 BF16 边界，再按每 expert 的 Gate、Up、Down 三个投影分别重数量化到 E4M3FN；R:1607、1622–1629 保存 FP32 `[E,3]` scale。R:601–665 在 FP32 dot 结果后用 scalar scale 相乘。隐藏态和中间 activation 的两个 FP8 cast 固定 activation scale=1。

Gate/Up FP32 dot×对应 scale → BF16 → FP32；SiLU×Up → BF16 → FP8；Down FP32 dot×Down scale → BF16。这里没有把运行时 G128 UScale 请求加到每个 weight miniblock 的接口中，也不是 INT4。D:97–108、155–157、801–818、1051–1055 专门区分 H4096 per-tensor 路径和其他 profile 的 common G128 实现。

[R:1499–1514 重数量化](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L1499)，[D:801–818 调用合同](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py#L801)。

<a id="m4-gate"></a>
## 5. 主例一：一个 owner 的 M4 Gate，w4c8k2

源码请求 `(M,CI,CO)=(4,4096,512)`，每条 Gate 的纯 FP8 权重为2MiB；Up 另有2MiB。单个 minitile 覆盖4行、8个 C 基本块、2个输出基本块，即 `4×1024` activation 与 `1024×256` weight 的工作范围。整个投影有 `N_TW=1,N_TC=4,N_TK=2`，合计8个 minitile。

每面 AL1 每 PE 占 `w×c=32` 个128-bit word，即512B；唯一 A 为 `4×8×128=4096B`，8个 group 的物理复制另计。一次输出 K 区段需要遍历4份 C minitile，大于双 buffer 可保留的2份，所以**当前真实 GU pin 不满足跨 K 的 flag-only 驻留条件**。不能为了配合教材的 c16 示例把当前源码改述成 w4c16k1。

沿前章已经核验的 normal FP8 KC 坐标解释这个 shape：输出基本块 b，C 基本块 t，group g、PE p、ALU a、PE 内 CI 偏移 u 对应

```text
CO = 128*b + 16*g + a        b=0..3
CI = 128*t + 16*p + u        t=0..31, u=0..15
```

继续追踪本地输出 CO37：b0/group2/ALU5。每个 PE p 在32次 C 基本块中贡献32段、每段16项；其分布式 psum 覆盖512个 CI，最后 group 的8个 PE 合并为完整4096项。PE4 首段 CI64…79，下一段192…207，最后4032…4047；CO37 同一 ALU 的地址与 token 行相匹配，不把不同 token 累加在一起。全局逻辑专家的中间列是 `512*tp_rank+37`。

每块16KiB weight 被4行复用，理想阵列计算发射数为 `4×32×4=512`，工作量 `4×4096×512=8,388,608 MAC`。这是形状计数，不是512个真实 wall cycles；AL1重装、credit、OL1及排空仍可产生等待。Gate 和 Up 各自完成这一套工作，不能把两个2MiB权重当一个可永久缓存的4MiB块。

物理坐标是“已核验 normal FP8 KC 映射应用到此源码 shape”的解释，不是本轮新二进制 trace。R:1631–1651 的 pack 使用 `kind="weight"`，GU `Tr=8,Tc=32`、Down `Tr=32,Tc=4`、`num_cores=1`；没有在本轮逐字段复核新二进制 LDG descriptor/store mode。

<a id="m4-down"></a>
## 6. 主例二：同一批四行的 Down，w4c2k4

SiLU×Up 完成并转 FP8 后，activation 为 `[4,512]`。Down 每个 owner core 保有本专家完整 TP-local512列，对应 `[512,4096]` 的数学 weight；它输出 `[4,4096]`，仍是 TP4 中这一 rank 的贡献。

`Cᵤ=4,Kᵤ=32,w4c2k4`，所以 `N_TW=1,N_TC=2,N_TK=8`，合计16个 minitile。每个 minitile 处理4行、CI256、CO512；每 PE 每面 AL1 只需8个word=128B。两个 C minitile 恰好能分别放 ping/pong，首个外层 K tile 真读两份 A，后续输出 K tile 可按既有 flag-only 协议重用它们。

对本地 CO37 仍是 b0/group2/ALU5，但 C 基本块只有 t0..3。每个 PE 的 OL1 累计4段×16=64个 CI 项，group 合并8个 PE 后是512项完整 TP-local Down 点积。全局完整专家还要合并4个 TP rank 的 I 分片；这个跨 rank 求和不是 PE group 内的8路 CI reduction。

Down 纯权重为2MiB；理想阵列发射数同样 `4×4×32=512`，MAC数也同样8,388,608，却不保证与 Gate 等时：C 短、CO宽，输出量16Ki元素、内部/DFO排空、minitile数和驻留方式不同。Gate+Up+Down合计6MiB纯weight和25,165,824 MAC；四行充分复用时为8 FLOPs/weight-byte，排除scale、A、输出及额外流量。M3借M4时仅3行有效，不应仍报告8 FLOPs/B的有效工作强度。

<a id="fallback-shared"></a>
## 7. 两类容易混写的对照：当前 fallback 与 Shared

### 当前 non-merged Routed 不是 I256 双核切分

R:132–192 的 `_routed_slot` 与538–577的 `_cached_route_batch` 用M1执行 concat GateUp `(1,4096,1024)`，拆为各I512，再做Down `(1,512,4096)`；普通 `tl.dot` 没有上述 owner explicit pin。1322–1325仍按expert parity筛本core的专家。`COUNT=4` 表示四份分别发起的M1工作，不等于同expert的M4矩阵。关闭merge、其他T或显式static map等条件下，它在当前版本仍是有效路线；concat GU1024不能一概称为已删除的历史实现。

[当前 M1 concat 路径](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py#L132)。历史M8/M16实验必须单列版本与实际disasm，不把它们当当前owner桶。

### Shared BF16 才有同一专家 I512→双核 I256

S:28–35 `I512→BLOCK_I256`；435–468/472–507将Gate/Up的行、Down的I列均衡切给两个core。H4096/I512本例无额外CI/CO padding，但通用pack会将不整除的维度补零。

T8/T16/T24/T32 profile 用 Gate M8，Up/Down按M4行链；见S:19–24、356–426、573–648。T16/T24 static pipeline 的 Gate为 `(8,4096,256)`、两条Up各 `(4,4096,256)`，Down各 `(4,256,4096)`；Gate/Up使用普通tl.dot，Down显式 `mtw4,mtk4,mtc4`。BF16×BF16下C_unit64、K_unit128，所以Down也是Cᵤ4/Kᵤ32，但 pin w4c4k4使N_TC1，不是Routed FP8的w4c2k4/N_TC2。每core只产生I256对应的H4096 partial，随后核外Reduce合并两个core。

[Shared profile与dtype](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py#L19)，[双核pack](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py#L435)，[static pipeline与Down pin](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py#L573)。

<a id="why-pin"></a>
## 8. 能解释 tradeoff，不能凭源码证明 pin 最优

R:587–602注释明确说明：按M限制输入/输出tile，使用显式KC tile并降低PE credit开销；663–665说明Down限制output tile以适配FP8 OB。GU三个桶均保持 `w*c=32`，当前M4输入每PE每面只用512B；w4c16k1候选会用1KiB，输出块分组也不同。真实w4c8k2牺牲跨K的A驻留，换取不同工作块/缓冲与调度组织，这个事实应透明展示。

固定版本的 [V122评估报告](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/dev_docs/evaluations/moe_routed_v122_20261022/README.md) 记录整体owner分组、Gate/Up PE/VP重叠、显式小块和编译器调度一起变化；[周优化说明](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/dev_docs/evaluations/moe_weekly_20261019/README.md#L10) 解释M4上限涉及权重复用、padding、片上buffer和流水成本。报告不构成单独“w4c8k2胜过w4c16k1”的控制实验。

本轮未找到将其他因素固定、只切换这两组GU pin的独立实测归因。故教程只能说“源码确认的实际配置 + 可推导的结构取舍”，不能写成由当前代价模型自动选出、普适最优、或已经证明某个pin独立贡献全部收益。现有模型建议与kernel显式pin不同并不自动表示其中一个错误，需对齐shape、compiler、输入与计时边界后比较。

<a id="hashes"></a>
## 9. 文件 SHA256 与核验范围

| 固定对象 | SHA256 |
|---|---|
| TZ:R | `143bb23ee6ba78eb8bef81d83e23a204cd5c3a57f8fd6a760483575fb6cbaf6d` |
| TZ:S | `dc8e1cd71abb3da0200bf4ef39a9ef1985424efc7127fa0e51f7e4f1339ba819` |
| ZD:D | `35c1258b304169fa349061929c91702470712d9f49c9087af06d37a287349b66` |

通过只读Git对象读取、行号定位、逐字节比较与纯整数shape计算核验。正文中阵列发射数、MAC数、容量和字节均为算术推导，不是新测量。源码pin到最终PE字段的合法化、长度减一编码和历史反汇编由独立选择链证据页负责；没有以源码请求替代实际二进制证明。

<a id="coordinate-examples"></a>
## 10. 两个逐元素算例：同一 PE/ALU 处理不同投影坐标

以下仍是normal FP8 KC坐标推导，不是新trace。row=2指本次同expert M4矩阵的第3行，不保证原始token ID也是2。C基本块编号记t，输出基本块编号记q；先分解整体矩阵坐标，再分解minitile，不能直接用模型CI当AL1地址。

| 项目 | Gate 的 `W_g[CO165,CI2199]` | Down 的 `W_d[CO1061,CI279]` |
|---|---|---|
| 整体128元素块 | q=1，t=17 | q=8，t=2 |
| group / PE / ALU | g2 / p1 / a5 | g2 / p1 / a5 |
| PE内CI偏移 | u=7，即MAC3的第2个FP8数（lane1） | u=7，即MAC3 lane1 |
| pin w/c/k | 4 / 8 / 2 | 4 / 2 / 4 |
| 外层 C tile / 内部 c index | 2 / 1 | 1 / 0 |
| 外层 K tile / 内部 k index | 0 / 1 | 2 / 0 |
| 本次row2的AL1 word地址 | 2×8+1=17 | 2×2+0=4 |

Gate：`2199=17×128+1×16+7`，`165=1×128+2×16+5`。Down：`279=2×128+1×16+7`，`1061=8×128+2×16+5`。AL1地址不含k，解释同一份A如何服务不同输出块；同一个物理group/PE/ALU/MAC在不同循环时刻对应不同模型通道。单凭相同物理编号不能判定两条操作可共用weight或psum。
