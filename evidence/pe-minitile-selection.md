# PE minitile：真实长度、字段编码、选择路径与历史产物

<a id="pms-scope"></a>

## 1. 证据范围与版本

核对日期：2026-10-25。本页将源码、模型运行与历史产物分开：

| 证据 | 固定身份 | 本次做了什么 | 不能据此声称什么 |
|---|---|---|---|
| 编译器源码 | `triton_shared 82613bc2eb30feb9ef7f57aef20584df0ef9e28a` | 读取真实属性、合法性/搜索/覆盖表、lowering 和字段发射代码 | 没有重新编译 GLM 业务 kernel |
| 业务源码 | `torch_zeus 3656952bfee88b1d5f7b68d0e724e54a7a5353d7` | 从 Git object 读取 owner 的 Gate/Up、Down shape 与显式 pin | 不是该业务版本与上列编译器的配对二进制验证 |
| 纯模型运行 | 上列编译器的原始 `PeMinitileModel.cpp` | 仅编译并调用 C++ 模型函数；使用实际 LLVM SmallVector/Support，未替换评分公式 | 不是 PE 指令编译，不是设备运行，更不是实测最优 |
| 历史反汇编 | `fullowner-20261019/profile-fullowner-v1-smoke-l3-ep0`；下文给文件 hash | 读取原有 `.disasm.S`、zbin 和 provenance，核对 M4/M8/M16 分支 | 不能代表当前 owner 的显式配置，也不能代表本轮新增 VCS 结果 |
| RTL | `design` 只读副本，逐文件 SHA256 见末尾 | 核对字段消费位宽和 dtype 的坐标单位 | README tag 不替代当前文件指纹；未重新运行 RTL |

这里只使用仓库相对路径与历史产物标识。GLM5Next 的内部部署、公开 GLM-5 模型、其他模型的 INT4/DSV4 实验是不同范围；本页主例是 **FP8×FP8、KC、H=4096、专家本地 I=512** 的 Routed 路径。Shared 的 BF16、每核 I=256 不能混进这张表。

<a id="pms-fields"></a>

## 2. MTW/MTC/MTK 的本质：内部遍历长度，不是物理阵列尺寸

先区分三组数：

1. 算子/PE 指令的逻辑 shape：`A[M,CI] × B[CI,CO] → Y[M,CO]`。
2. 编译器属性中的真实 minitile 长度：`(w,c,k)`。
3. ISA 的减一编码：`MTW=w−1、MTC=c−1、MTK=k−1`。汇编通常按 **MTW、MTK、MTC** 的顺序打印，阅读时不能把 k 与 c 交换。

KC 下各维单位：

| 输入组合 | 一单位 w | 一单位 c | 一单位 k | 一个 c×k 基本块的纯 weight |
|---|---:|---:|---:|---:|
| BF16×BF16 | 1 行 | 64 CI | 128 CO | 64×128×2 B = 16 KiB |
| FP8×FP8 / INT8×INT8 | 1 行 | 128 CI | 128 CO | 128×128×1 B = 16 KiB |
| FP8×INT4 | 1 行 | 128 CI | 256 CO | 128×256×0.5 B = 16 KiB |

因此 FP8 KC 的 `w4c8k2` 描述在固定物理阵列上遍历 **4 行×1024 CI×256 CO** 的局部工作；它不会把硬件变成一个 4×1024×256 的物理 MAC 阵列。w 改变同一份 weight 服务的行数，c 改变 AL1 中每行覆盖的 CI 长度及后续部分和累计，k 改变同一份 A 配合的输出方向块数。尾块使用实际覆盖长度，不能无条件按完整 w/c/k 计算工作量。

硬件字段 `W/C/K` 分别对应数学 `M/CI/CO`。常规 Triton GEMM 的 `BLOCK_M/BLOCK_K/BLOCK_N` 决定一条最终 PE 操作的外层逻辑范围，minitile 是该范围内部的遍历与驻留选择。最终 shape 从 `PeOp` 的 memref 维度提取，不是读取 Python 参数名称，也不能假定上游分核/改写前的每个 `tl.dot` 一定对应一条原样 PE 指令。

直接定位：

- `triton_shared/lib/Dialect/ZeusHigh/Transforms/PeMinitileModel.h:23–44`：`PeShape`、真实长度 `Minitile`。
- `triton_shared/lib/Dialect/ZeusHigh/Transforms/SetPeHWParams.cpp:110–137`：从最终输出和 lhs memref 提取 M/N/K。
- `design/rtl/zeus518/pegroup/pe518_al1_mt_coord_cal.v:189–202`：KC/BF16 的 C 单位64、KC/8bit的128、INT4的K单位256，以及KC的W单位1。

KW 的 W 单位为8，C单位为 BF16 8 / 8bit 16；本页 KC 的公式不得原样套给 KW。

### 编码究竟发生在哪一层

```text
ZeusHigh PeOp: mtw=4, mtc=8, mtk=2     # 真实长度
        ↓ 直接传递，不减一
ZeusLow pe_compute: mtw=4, mtc=8, mtk=2
        ↓ InstructionSelector 统一减一
PE_SETM_M ... YMode[1] ... MTW[3] MTK[1] MTC[7]
        ↓ sticky 配置由后续 PE_CONV 使用
PE_CONV ...
```

- `triton_shared/lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp:4465–4469,4556–4565`：读取真实值并直接写入 Low 属性。
- `triton_shared/lib/Target/ZeusV3/CodeGen/InstructionSelector.cpp:2947–2978`：缺省真实长度1；在2960–2962行统一减一，随后按 MTW/MTK/MTC 发射。
- `triton_shared/include/triton-shared/Target/ZeusV3/ISA/InstrInfo.def:238–246`：定义减一字段、YMode 与 PE_CONV。
- `WBS` 是另一项：这里按 `log2(wbs)` 编码（InstructionSelector:2944–2945），不是 `wbs−1`，也不是 minitile 的 k。历史 `WBS[10]` 表示1024的 weight block 参数，不能读成10个输出基本单元。

名义 ISA 字段 MTW/MTK 为5 bit，但 RTL sticky 寄存器实际只消费4 bit：`design/rtl/zeus518/inst_ctrl/inst518_pe_inst_predecode.v:123–125,326–340`。真实长度的限制是 `w≤16、k≤16、c≤64`；不能根据名义字段宽度外推到32。

<a id="pms-selection"></a>

## 3. 当前编译器的选择链：显式 pin → 精确表 → 编译期模型

`ZeusHighPipeline.cpp:215–225` 在执行单元映射后运行 `SetPeHWParams`。它不会对每个候选启动设备测试。

```text
完整显式 mtw/mtc/mtk
  → 字段范围 + SRAM容量检查 → 保留这组值并 return

部分显式属性
  → 已给维度作为约束 → 跳过覆盖表 → 搜索未给维度

完全未给属性
  → 精确 shape/dtype 表命中且合法：直接采用
  → 未命中：枚举候选 → 模型打分 → 近同分决选
```

关键源码：

- `SetPeHWParams.cpp:199–250`：显式属性、范围检查和 **完整 pin 的直接返回**。
- `SetPeHWParams.cpp:256–307`：形状、dtype、部分约束、覆盖表优先及模型调用。
- `SetPeHWParams.cpp:331–339`：无法提取静态 shape 时告警并退回真实 minitile=1。
- `PeMinitileModel.cpp:126–148`：覆盖表按 `(W,C,K,actBytes,weightBytes,weightInt4)` 精确匹配，不做邻近 shape 推测。
- `PeMinitileTable.h:55–67`：当前两项覆盖记录及历史 VCS job 说明；本轮没有重跑这些历史 job。

### 三个集合必须分开

| 层次 | 本次核对的限制 |
|---|---|
| 完整 pin 的字段/容量检查 | `1≤w≤16, 1≤k≤16, 1≤c≤64`；`w×c≤64`；`w×k≤16×weightBytes/actBytes` |
| 默认自动候选域 | w 从1到4逐个枚举；k取1或2且只取2的幂；c在容量和shape覆盖范围内逐个枚举 |
| 模型的经验排除/可信范围 | `N_TC>2 && k>1` 直接返回无穷；k2仅在 `Cᵤ∈{1,2,3,4,8,16,32}` 自动放行；w>4、复杂UScale与指令间overlap未可靠建模 |

`w×c≤64` 来自 AL1 单面64个word；输出容量式是当前编译器沿用的 dtype 缩放约束，不应包装成对所有模式独立证明的普适 SRAM 公式。证据定位：`PeHWSpec.h:37–77,132–154`；`PeMinitileModel.cpp:151–182,229–277,291–313`。

**完整 pin 不经过 `scoreMinitile`。** 所以某配置的 score 为无穷，可能只说明它落在此模型主动排除的区间，不能反推完整 pin 的字段/容量检查会失败，更不能直接称为硬件非法。部分 pin 则仍然经过评分搜索，因此同一组经验排除可能令约束搜索无解。这是代码路径的实际区别。

<a id="pms-owner-pins"></a>

## 4. 业务固定版本的真实 pin：GU 分开算，Down 覆盖完整4096输出

固定业务文件：

`torch_zeus/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py`

固定 commit：`3656952bfee88b1d5f7b68d0e724e54a7a5353d7`。本节从 Git object 读取，不依赖该工作区当前分支。

- `_owner_activation_rows:584–652`：Gate 与 Up 分别载入 `(I,H)` 块，分别执行 `ztl.pe_dot`。在本文 H4096/I512 实例里，每条是 `[M,4096]×[4096,512]`，不是一条 CO1024 的 concat GU。
- `589–590,601–614`：`tile_c=32/16/8` 对应 M1/M2/M4；`tile_k=4/4/2`；`mtw=M`。小批量 owner 路径将 M 作为同一 expert 的独立 token 行。
- `_owner_down_rows:656–665`：`[M,512]×[512,4096]`，显式 `mtw=M, mtc=2, mtk=16//M`。

| 路径 | 逻辑 shape M×CI×CO | 源码真实 pin w/c/k | 对应 MTW/MTK/MTC 编码推导 | w×c / w×k | C块数 N_TC |
|---|---|---|---|---|---:|
| 每条 Gate 或 Up，M1 | 1×4096×512 | 1/32/4 | 0/3/31 | 32 / 4 | 1 |
| 每条 Gate 或 Up，M2 | 2×4096×512 | 2/16/4 | 1/3/15 | 32 / 8 | 2 |
| 每条 Gate 或 Up，M4 | 4×4096×512 | 4/8/2 | 3/1/7 | 32 / 8 | 4 |
| Down，M1 | 1×512×4096 | 1/2/16 | 0/15/1 | 2 / 16 | 2 |
| Down，M2 | 2×512×4096 | 2/2/8 | 1/7/1 | 4 / 16 | 2 |
| Down，M4 | 4×512×4096 | 4/2/4 | 3/3/1 | 8 / 16 | 2 |

编码列是按已核对的发射规则从源码属性推导，**不是本次新生成的业务汇编**。

这张表说明：

- 当前 M4 Gate/Up 的 `w4c8k2` 满足字段/容量条件，但 `N_TC=4,k=2` 被自动评分器排除；完整 pin 路径仍会保留它。
- 当前 M4 Down 的 `k=4` 超过默认自动搜索的 k≤2，却仍满足 `w×k=16`。M1/M2 的更大 k 同样应按完整 pin 处理。
- 不能将自动模型推荐配置写成业务已经使用的配置。源码的设计意图提到 credit 开销、独立 row chain 与阶段 overlap，但本次静态核对不独立证明这些 pin 在所有 shape 上最优；完整 kernel 的关键路径也不在单条 PE 模型里。
- 同一源码的 fallback / `_cached_route_batch` 可以采用 concat GU；那是另一条路径。不能只看整个权重存储是 `(2I,H)`，就把 owner 的两次 I输出投影合并成一条2I输出指令。

<a id="pms-model-probe"></a>

## 5. 纯 C++ 模型运行：如果相同 shape 没有 pin，会选什么

本次只编译原始 `PeMinitileModel.cpp` 与一个独立 driver，链接 LLVM Support。dtype 输入为 `actBytes=1,weightBytes=1,outBytes=4,weightInt4=false`。driver 分别调用 `searchBestMinitile(shape,dtype,{})` 与 `lookupMinitileTable`，按无pin的 pass 顺序选择表/模型；没有经过 Triton 编译器或发射任何 PE 指令。

| shape M×CI×CO | 纯模型搜索 w/c/k | 无 pin 的默认路径 | 对照业务 pin |
|---|---|---|---|
| 1×4096×512 | 1/16/2 | 模型：1/16/2 | 1/32/4 |
| 2×4096×512 | 2/16/2 | 模型：2/16/2 | 2/16/4 |
| 4×4096×512 | 4/16/1 | 模型：4/16/1 | 4/8/2 |
| 1×512×4096 | 1/2/2 | 模型：1/2/2 | 1/2/16 |
| 2×512×4096 | 2/2/2 | 模型：2/2/2 | 2/2/8 |
| 4×512×4096 | 4/4/1 | **精确覆盖表：4/4/2** | 4/2/4 |

当前表的 M4 Down 项记录的是历史单 PE 比较，不能把它理解为当前融合 owner 路径的自动替代方案。上表只回答“相同 shape 若不传 pin，当前选择函数会返回什么”，不回答哪组配置在当前完整 MoE 更快。

为对照下节历史逻辑形状，还调用了 M4/M8/M16 的 concat GU `CI4096/CO1024` 与半输出 Down `CI512/CO2048`。当前模型对前者均返回 `w4c16k1`，对后者均返回 `w4c4k1`。这种一致性不能证明历史二进制由当前 commit 生成。

复算核心调用：

```cpp
PeDtype dtype{1.0, 1.0, 4.0, false};
PeShape shape{M, CI, CO};
auto model = searchBestMinitile(shape, dtype, {});
auto table = lookupMinitileTable(shape, dtype);
auto selected = table.found ? table.mt : *model;
// Reproduction must also check model.has_value(), table.legal and
// table.cutModeSupported before accepting a table entry.
```

运行产物身份（只用于本次模型计算的复核，不作为业务性能证据）：

| 文件标识 | SHA256 |
|---|---|
| `model-probe/driver.cpp` | `0be65b7aa5483c1aa8df13548bc7316c95e0ac55ef1a8e694b2e8f8d5bb5d07f` |
| `model-probe/driver` | `d3e1f0c8f6c1072f777b34cb9b45581b8190827f7a337296def4e97eb1212bd4` |
| `model-probe/results.csv` | `80e53c528dc195cb1038418385592ed566a106c33c27791e626bd9a878f736d3` |

本页不把模型预测的小数 cycle 放进业务实测表。拟合系数、模型覆盖范围和实际完成延迟是不同证据层。

<a id="pms-historical"></a>

## 6. 历史 actual.disasm：M4/M8/M16 并没有变成 w4/w8/w16

历史产物标识：`fullowner-20261019/profile-fullowner-v1-smoke-l3-ep0`。本次实际读到了下列文件，并复算 hash；`actual.disasm.S` 与 `input/kernel.disasm.S` 字节身份一致，zbin/asm hash 均匹配原 `provenance.json`。

| 文件 | SHA256 |
|---|---|
| `actual.disasm.S` / `input/kernel.disasm.S` | `b69c7a05662e2722372a71449ab77516f16e3064587325121bec96926bd3e72d` |
| `input/kernel.zbin` | `0388230b9f31bfb90a08a679ff47f3deb6562e56d705917e062a5b6a9bfa1431` |
| `provenance.json` | `08c6aa8a3620e3e589ce5d41604603b1edb3ffaa50eafd0897bc57ebbe477dab` |
| 同目录解释性源码 `owner-v1.py` | `23dfb5da27f5c861d58deeedc25ce6a1884e2e27a9c36d4d4948de4e5912dfaf` |

provenance 明确记为 live dual-core cycle daemon、**not VCS**。本文只引用静态反汇编，不引用该 profile 的周期作为新实测。原 provenance 没有提供编译器 SHA 或绑定的 owner 源文件 hash；因此这里不能补写“由当前82613编译”或声称完成了历史 source→binary 全链身份闭合。同目录 `owner-v1.py` 用于解释路径，指令中的实际配置仍直接取自 asm。

### 6.1 concat Gate+Up：CI4096、CO1024

| 分支 | 输出 shape 定位 | weight CI/CO 定位 | PE_SETM_M / PE_CONV 行号 | 实际编码 MTW/MTK/MTC | 真实 w/c/k | N_TW |
|---|---|---|---|---|---|---:|
| M4 | `1524: W[3] C[1023]` | `1537: TK[1023] TC[4095]` | 1542 / 1544 | 3 / 0 / 15 | 4 / 16 / 1 | 1 |
| M8 | `1828: W[7] C[1023]` | `1841: TK[1023] TC[4095]` | 1846 / 1848 | 3 / 0 / 15 | 4 / 16 / 1 | 2 |
| M16 | `2061: W[15] C[1023]` | `2074: TK[1023] TC[4095]` | 2079 / 2081 | 3 / 0 / 15 | 4 / 16 / 1 | 4 |

三个 `PE_SETM_M` 都是 `YMode[1] WBS[10] MTW[3] MTK[0] MTC[15]`；紧随的 `PE_SETM_U` 为 `UEN[0]`。act/weight DF[3] 对应 FP8，输出 DF[7] 对应 FP32，枚举定义见 `ZeusLowEnums.td:8–16`。

逻辑 M 增大时，内部每份 weight 仍先服务4行，后续 W-minitile 重新遍历权重。因此 M8/M16 的形状不能直接解释为8/16倍的一次驻留权重复用。

### 6.2 历史 Down：CI512，输出4096被分成两次CO2048

同目录 `owner-v1.py:571–584` 是一次 CO=2I 的 concat GU；`613–618` 定义 `DOWN_N=H//2`，沿输出列分两块调用 dot。这是同一个 owner 内的输出列切片，不是将 CI512 分到两个核心变成 CI256。

| 分支 | 输出 shape | weight 范围/输入CI证据 | PE_SETM_M / PE_CONV 行号 | 编码 MTW/MTK/MTC | 真实 w/c/k |
|---|---|---|---|---|---|
| M4 | `1643: W[3] C[2047]` | `1627–1628: SK[4095],SC[511]; TK[2047],TC[511]` | 1660 / 1662 | 3 / 0 / 3 | 4 / 4 / 1 |
| M8 | `1943: W[7] C[2047]` | `1911: activation W[7],C[511]`，同一半输出循环结构 | 1960 / 1962 | 3 / 0 / 3 | 4 / 4 / 1 |
| M16 | `2178: W[15] C[2047]` | `2135: TW[15],TC[511]`，同一半输出循环结构 | 2195 / 2197 | 3 / 0 / 3 | 4 / 4 / 1 |

这里 `WBS[11]` 对应2048；循环内 `TK_IE[0] TK[27]` 是寄存器编号，**不是逻辑输出宽度28**。例如 `1653–1655` 先令寄存器26为2048，再令27为2047，再更新 TK。直接把反汇编括号中的所有数都当立即数，会将 shape 解错。

所以网页应同时保留两栏：**当前固定业务源码的显式 pin**，与 **历史 v1 产物的实际编码**。不能把历史 concat GU1024 / Down2048 的结果直接贴到当前分开 GU512 / 完整 Down4096 的正文。

<a id="pms-source-index"></a>

## 7. 关键源文件指纹与未覆盖项

纯模型 driver 编译使用 `PeMinitileModel.cpp/.h`、`PeHWSpec.h` 与 `PeMinitileTable.h`；`SetPeHWParams.cpp` 用于核对调用顺序和 pin 分支，没有编译进 driver。CodeGen 与 lowering 同样只做源码核对。

| 相对路径 | SHA256 |
|---|---|
| `triton_shared/lib/Dialect/ZeusHigh/Transforms/PeMinitileModel.cpp` | `37c3578099331905466528ad6d740d9d93e139ab44b30adbb6c6ddde4e0c2294` |
| `triton_shared/lib/Dialect/ZeusHigh/Transforms/PeMinitileModel.h` | `2e23dfb0d50c6ecf7f83afc0f14c91d6dd1096b0ad9abcf76ae5595309c09137` |
| `triton_shared/lib/Dialect/ZeusHigh/Transforms/SetPeHWParams.cpp` | `b5156a660e58fe0467707fdb059c1ced783969a5689200ddd5185a4cadf1f6a2` |
| `triton_shared/include/triton-shared/Dialect/ZeusHigh/Transforms/PeHWSpec.h` | `965575dfceb7d7367823587a118b1c9785a9fe10d3371a58a574d72d9cbfe5f1` |
| `triton_shared/include/triton-shared/Dialect/ZeusHigh/Transforms/PeMinitileTable.h` | `a980a9cd55097f9740c9a74716b2ec6e541064ae5a75e26d3847a3f888098ce9` |
| `triton_shared/lib/Target/ZeusV3/CodeGen/InstructionSelector.cpp` | `c42d552e7f4f84af90925a356927cc9717114dce003f5f636beb7ce42f464ac1` |
| `triton_shared/lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp` | `00d23c78e9434c76f55fc140e63d9043362f550a8bd1608367d2af287ef4d91f` |
| `triton_shared/include/triton-shared/Target/ZeusV3/ISA/InstrInfo.def` | `ef20db6650d18ff259357e9eef6b315d51d5bd5b532258d220014f8570060c34` |
| `design/rtl/zeus518/pegroup/pe518_al1_mt_coord_cal.v` | `e892c578ddae91c3c31b85b75db16c9e7465b748b75efb9b006b5b18f5fafd13` |
| `design/rtl/zeus518/inst_ctrl/inst518_pe_inst_predecode.v` | `552f4271331a937a123b48a52c42aa4cdfd9e72ba89f92ac2818749f3c419d58` |
| 固定业务文件 `sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py`（第4节完整相对路径） | `143bb23ee6ba78eb8bef81d83e23a204cd5c3a57f8fd6a760483575fb6cbaf6d` |

本页未覆盖：当前业务源码的全编译链产物、当前 pin 的完整 kernel A/B 测量、硅上数据、动态 shape 最优策略、其他厂商 tiling/指令接口。任何涉及“更快”“最优”“带宽饱和”的结论仍需绑定真实业务输入、配对工具链、计时边界与执行证据。
