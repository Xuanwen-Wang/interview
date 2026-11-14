# PE 与 LDG 连续讲解：主例、地址与遍历证据

采集日期：2026-11-14。本页支持 PE 连续教程中的布局、minitile 与 MC 交互。只完成源码静态核对、逐元素整数标签检查和独立算术；没有编译业务 kernel，没有运行功能模拟、CycleSim、VCS 或真实设备实验。

<a id="scope"></a>

## 1. 来源身份与主例边界

| 来源 | 固定身份 | 本轮范围 |
| --- | --- | --- |
| 指南基线 | `interview 00e9b0b5d09e9ea05e583866d769398b3d140c85` | 从已有 PE 证据继续核对，保留历史来源的日期和限制 |
| 编译器与仿真数据 pack 参考 | `triton_shared a6161ef94b1941f786ce05d4e31104ec91ea22d4` | 下文引用的 tracked 文件相对 HEAD 干净；仓库另有无关未跟踪资料，未读取或修改 |
| RTL | `design` 非 Git 只读部分副本，`revision unknown` | README 声明来自 `tag_PN100_R1_20250928` 的部分副本；本轮未认证完整 tag，按文末逐文件 SHA256 固定 |
| 历史业务 shape/pin | `torch_zeus 3656952bfee88b1d5f7b68d0e724e54a7a5353d7` | 沿用本仓 [pe-glm-shapes.md](pe-glm-shapes.md#m4-gate) 和 [pe-minitile-selection.md](pe-minitile-selection.md#pms-owner-pins) 于 2026-10-25 采集的 Git object 证据；不改称最新 owner 或本轮编译产物 |
| 2026-10-15 带宽参考 | 公开网页及 `notes 79209004675acace8ead58c75c7624caf127e942` 的干净同名文件 | 线上与该本地文件 hash 相同；作为历史推导来源，23 拍周转不是本轮量测 |
| 2026-11-13 行切换参考 | 公开网页，以正文文件 SHA256 固定 | 不在上述本地 notes HEAD；只绑定线上内容，不能归给该本地 commit |

两篇参考均在本轮以 HTTP 200 重新读取：

| 页面 | 原始 HTML 字节数 | SHA256 |
| --- | ---: | --- |
| [GLM53 MoE 的 LDG/MC row alignment](https://xuanwen-wang.github.io/notes/articles/hardware/2026-11-13-glm53-moe-ldg-mc-row-alignment.html) | 104939 | `8a193d7fa62356a0ad2caf3d207b5ab6561aeb11644d7c9cc43981a4b3f1625b` |
| [LDG 带宽的来源与推导](https://xuanwen-wang.github.io/notes/articles/hardware/2026-10-15-ldg-bandwidth-explained.html) | 305355 | `1401efce91753be086d70a9bcb25b1ef4ace60832391357168949256ebae80ff` |

主例为一个 core 的 `A[4,4096] × B[4096,512] → Y[4,512]`：FP8 activation × FP8 weight，normal weight store，KC，dual hub，无 UScale、索引、tail 或额外 scale 读取；输出 FP32。硬件 W/C/K 分别对应数学 M/CI/CO。为解释历史 `w4c8k2` 的数据流，采用真实长度 `w=4,c=8,k=2`；ISA 字段是 `MTW=3,MTC=7,MTK=1`。

该 shape 与 minitile 来自历史单个 Gate/Up 投影；本页额外明确采用 `WBS=128`、`PIK=PIC=0`、16 KiB 对齐 base 的 normal pack 教学合同。它们没有被重新编译为该历史业务的 descriptor，不能据此声称复现了该业务二进制、当前最优 minitile 或完整 MoE 性能。Gate 与 Up 分别有一套下述计算，不能把两者混成一条 CO1024 指令。

| 账目 | 算式 | 主例结果 |
| --- | --- | ---: |
| C 基本块数 `Cu` | `4096 / 128` | 32 |
| K 基本块数 `Ku` | `512 / 128` | 4 |
| 外层 W/C/K minitile 数 | `1 × (32/8) × (4/2)` | 8 个 minitile |
| 不同 weight miniblock | `Cu × Ku` | 128 块 |
| 阵列等效成功计算事件 | `128 × w` | 512 次 |
| 数学 MAC | `4 × 4096 × 512` | 8,388,608 |
| 纯权重有效字节 | `4096 × 512 × 1` | 2 MiB |
| 唯一 activation 数据 | `4 × 4096 × 1` | 16 KiB |
| 此遍历的 L2→AL1 请求有效字节 | `2 个外层 K tile ×16 KiB` | 32 KiB |
| FP32 输出有效字节 | `4 ×512 ×4` | 8 KiB |

512 是每个 PE 完成本次工作所对应的成功输入消费次数，按全阵列完整块折算为 512 个工作事件；它不是已观测的统一握手信号，也不是 512 个 wall-clock cycle。各 group 接受时刻可错开，等待、首填、AL1 重装、OL1 反馈和写回均未被该计数扣除。

<a id="packing"></a>

## 2. 从逻辑坐标到 normal pack 字节

`triton_shared/sim_check/sim_framework/weight/transform.py:16–51` 的接口输入为 `[CO,CI]`，与正文 `B[CI,CO]` 是转置观察同一组数。normal FP8 的参数是 `(k1,c1,k0,c0)=(8,1,16,128)`；输出轴顺序为 `[k_block,k_group,c_group,k1,c1,k0,c0]`。本主例 `WBS=128`，所以 `k_group=1`。

对任意权重元素定义：

```text
q = floor(CO_index / 128)        0..3
t = floor(CI_index / 128)        0..31
g = floor((CO_index % 128)/16)   0..7，group
a = CO_index % 16               0..15，ALU
p = floor((CI_index % 128)/16)   0..7，group 内 PE
j = CI_index % 16               0..15，PE 内 CI

CO_index = 128*q + 16*g + a
CI_index = 128*t + 16*p + j
block_id = q*32 + t
byte_offset = block_id*16384 + g*2048 + a*128 + p*16 + j
```

`byte_offset` 相对 weight base；它描述 normal FP8 pack 的实际字节序。一个 16 KiB miniblock 在每个 group 占 2 KiB，在每个 PE 占 256 B。跨多个基本块时，不能把整个 `[CO,CI]` 普通 row-major 数组当已完成 pack。

本轮用 2,097,152 个互异整数给所有权重元素编号，运行上述固定源码的 `transform_weight_7d` 函数，再逐元素核对公式结果与物理排列：全部相等、地址无重复、无空洞。运行只涉及 Python/NumPy 数组，不执行模拟器或编译器。这是数据排列检查，不是 PE 数值或 RTL 握手验证。

正文统一以 `Act[4,4096]`、`Weight[512,4096]`、`Out[4,512]` 表达运算；本页公式中的 q/t 分别对应正文的 `k_block/c_block`。选中 `Weight[165,1097]` 时，CO 块为 1、CI 块为 8、存储块号为 40，块内坐标为 `[37,73]`。块首 `0xA0000` 加块内偏移 `0x12C9`，得到相对 base 的 packed 地址 `0xA12C9`；普通二维行优先数组中的偏移则为 676937。块内每行连续 128 B，多个 CI 块间的 pack 改变了整张矩阵的字节排列。

同一元素对应 group2 / PE4 / ALU5 / lane9；lane9 是 MAC4 的高字节。PE 所需的 256 B 来自 16 个 CO 行各一段 16 B，外存片段间步长为 128 B；formatter 才将它们收集成 PE 本地的连续权重。该元素在 PE 的 256 B 输入中位于 byte89。新交互的独立检查还覆盖完整块的硬件归属双射、地址逆映射、跨 CI127/128 的边界反例和非法坐标拒绝。

`WBS`、PIK/PIC 和 minitile 是三类信息：WBS 与完整 source geometry 决定 pack/address 合同；PIK/PIC 表示所选输出/归约起点；`w/c/k` 控制该范围内怎样遍历与复用。缩小计算 tile 后仍使用完整 source C pitch，地址跨度不会自动随 tile 缩小。改变外存布局必须同时匹配 pack、base、source shape、位置和 descriptor，不能只改 MTK/MTC。

<a id="traversal"></a>

## 3. 外层遍历、成功消费与缓冲寿命

以下是无 tail 主例的**逻辑消费伪代码**。读请求可以提前，回包与计算可以重叠；代码不是逐拍时序，也不要求循环体内的所有存储动作串行完成。

```text
for tw in 0..0:
    for tk in 0..1:
        for tc in 0..3:
            load A[0:4, 1024*tc : 1024*(tc+1)] into AL1
            for c_local in 0..7:
                for k_local in 0..1:
                    t = 8*tc + c_local
                    q = 2*tk + k_local
                    request/assemble weight miniblock (q,t)
                    for w_local in 0..3:
                        consume A and the same weight FIFO head
                        update this output's distributed OL1 partial sum
        drain completed outputs CO[256*tk : 256*(tk+1)]
```

外层 `tc` 比 `tk` 快：`design/rtl/zeus518/wl1/wl1_518_weight_ctrl.v:580–720` 依次推进 `mtk → mtc → tc → tk → tw`，其中前两项是 minitile 内权重请求的快慢顺序。`pe518_al1_st_coord_cal.v:125–159` 独立显示 subtile 的 C 先行、K 次之。AL1 成功读取则是 W 最快、K 次之、C 最慢：`pe518_al1_mt_coord_cal.v:287–298`。两者通过 formatter 的 w 次重放相容，不能把 pack 中 C 连续误读成计算时一定先扫完整 C 再换 K。

**AL1。** 本例每个 PE 的当前面使用 32 个 16 B word；地址为 `w_local*8+c_local`，不含 k。装入时 C 最快、W 次之，计算读取时例如先读 `0,8,16,24`，换 k 后再次读这四个地址，再推进 c 为 `1,9,17,25`。直接依据是 `pe518_al1_mt_coord_cal.v:399–403` 与 `pe_ctrl_logic.v:207–216`。`Cu/c=4`，`pe_ctrl_logic.v:3947–3959` 的 one/two-C-minitile 条件都不成立，所以 `:353` 的 flag-only 不生效；第二个外层 tk 仍重新请求完整 A。32 KiB 是该静态请求合同的有效字节，不含 group 广播复制、总线 ECC 或时序成本。

AL1 的读面在每个 minitile 尾翻转（`pe518_al1_mt_coord_cal.v:405–409`），只在硬件 reset 置零，不能将当前指令的 `tc % 2` 宣称为永远固定的物理 ping/pong 编号。若图中将首次使用的面任意命名为 A，则本例局部交替序号为 `(tk*4+tc)%2`；这只是相对命名，不保证后台 prefetch 或换面发生的绝对时刻。

**WL1。** `wl1_518_weight_data_format.v:1130–1147` 只在成功接受后推进 replay 计数，满 w 次才 pop 输出 FIFO。主例每个新 miniblock 对四行各消费一次；同一 FIFO 头被重放不等于 MC 重读四份。consumer 未 ready 时不前进。

**OL1。** 非 INT4 的局部 slot 可按此成功结果顺序写成 `k_local*4+w_local`，共有 8 项；`pe518_ol1_buffer_ctrl.v:145–169,194–235` 的地址递增、回绕及最大地址锁存支持这个映射。OL1 在不同 c_local 和外层 tc 之间保留对应输出的部分和。`pe518_al1_mt_coord_cal.v:417` 的 `ol1_switch=mt_last_point && tc_end`，以及 `:432–451` 的 accumulate 控制，表明要完成整个 CI4096 后才交出这一组结果，不是在每个 c8 minitile 末清零或输出。

对固定 token、q、g、a，每个 PE 在 32 个 C 基本块上累计 32 段 dot16，即 512 项；同 group 的 8 个 PE 再合成完整 4096 项输出。结果经 group reduction、DFO 转换和 L2 写回才可供后继使用。OL1 完成一面、输出消费者取完一面、整条 PE_CONV 完成是不同边界，不能用数组工作事件替代它们。更完整的算术/舍入与输出路径见 [pe-compute-rtl.md](pe-compute-rtl.md#pe-ci-accum)。

<a id="mc-row"></a>

## 4. 从一个 miniblock 到 MC row/column

此节限定上述 normal FP8、dual-hub、16 KiB 对齐 base；row 简式进一步限定 `splicing_mode=1`、`bank_map=0xe4`、低地址 bank 区间。它不是所有 wafer/bank-map 配置的通用公式。

在 group 内，对元素的局部 ALU/PE/CI 坐标 `(a,p,j)`：

```text
round = floor(a/8)                     0 或 1
hub = floor((a%8)/4)                   0 或 1
MC = 4*(a%4) + floor(p/2)              0..15
byte_in_MC = 16*(p%2) + j              0..31
1024*round + 512*hub + 32*MC + byte_in_MC
    = 128*a + 16*p + j
```

RTL 的地址删除链是：`wl1_518_weight_ctrl.v:1252` 删除全局 byte address 的 group 位 `[13:11]`；`wl1_518_weight_rd_ctrl.v:157–165` 删除 group 地址的 hub 位 `[9]`；`wl1_518_hub_weight_req_distribute.v:54–61` 再删除 MC 位 `[8:5]` 和 32 B 内偏移。对某一固定 MC，第 b 个 miniblock 的两次请求因此为：

```text
b = q*Cu+t
mc_word(round) = base/8192 + 2*b + round
round = 0,1
```

每个 MC 返回 32 B，每轮 `8 group ×2 hub ×16 MC ×32 B=8192 B`；两轮为 16 KiB。两轮表示两笔读请求，不是从发起到阵列消费的 2-cycle latency。hub 汇聚需要所有 16 路返回有效再一起消费（`wl1_518_hub_weight_req_distribute.v:80–84`），不表示所有 MC 必须同拍完成。

对于正文选中的字节，base=0 时 block40 的两笔请求为 word80/81。ALU5 对应 round0、hub1，PE4 对应 MC6 的前 16 B，所以字节归属为 group2 / hub1 / MC6 / word80 / byte9。它属于第 18 份 Weight miniblock；服务输入行 2 时，是第 71 次成功消费工作事件（从 1 开始），当前 minitile 的 AL1 word 为 16、OL1 slot 为 6。这些分别是地址、读序、消费次序与局部槽位，不能混作同一种编号。

当前 `splicing_mode=1` 的完整地址变换来自 `gdg_axi2frame.v:126–137`：

```text
x = mc_word & 0x1fffff
s = (x + 0x1a000) & 0x1fffff
mapped = s if (s & 0x100000) else x
logical_bank = 1 if (s & 0x100000) else 0
row = (mapped >> 7) & 0x1fff
column = mapped & 0x7f
```

`bank_map=0xe4` 对逻辑 bank/layer 编号保持对应；映射寄存器的作用见 `mc_frame2frame_aux.v:398–409`。本教程选择的 `base=0 / 0x88000`、CI≤8192、CO512 均处于 `x+0x1a000 < 2^20` 的低地址区域，因此可化简为 `row=floor(mc_word/128)`、`column=mc_word%128`。一个 MC row 有 `128×32 B=4 KiB`；固定本配置并聚合全部 256 MC 后，对应全核线性地址的 1 MiB 行跨度。`splicing_mode=0` 在 `gdg_axi2frame.v:112–123` 改用位7选 bank、`[20:8]` 选 row，不能继续照抄上述简式。

`mc_frame2frame_aux.v:134–149` 跟踪此前 row/layer；row 不同，或者未启用 all-bank-active 时 layer 不同，会改变行状态。动画统计的是给定逻辑请求序列的相邻 row 变化，**不是 PRE/ACT 实测条数，也不是多 MC 关键路径耗时**。

独立枚举 `tk→tc→c_local→k_local→round`，保留 w=4,c=8,k=2，得到下表。首次冷打开单列，因此“row 切换”不含第一笔请求前的初始打开。

| CI / CO | base | 每 MC 请求数 | 相邻 row 变化次数 | 加首次冷打开后的段数 |
| --- | --- | ---: | ---: | ---: |
| 2048 / 512 | `0` | 128 | 0 | 1 |
| 2048 / 512 | `0x88000` | 128 | 3 | 4 |
| 4096 / 512 | `0` | 256 | 1 | 2 |
| 4096 / 512 | `0x88000` | 256 | 118 | 119 |
| 8192 / 512 | `0` | 512 | 255 | 256 |
| 8192 / 512 | `0x88000` | 512 | 252 | 253 |

这些是地址序列的算术结果。本例 CI4096 的 1 MiB 对齐能改善访问局部性；CI8192 的相邻 q 块自身已跨越 1 MiB，对齐不能消去固有的交替访问。独立 blocked storage 可以改变 source pitch，但需要重新 pack 并调整 descriptor；仅缩小 TC 没有改变完整 source C pitch。换行开销还依赖时序寄存器、当前行状态、请求/返回队列和重叠，不能将切换次数乘一个常数后直接宣称性能收益。

<a id="credit"></a>

## 5. credit 与带宽：哪些是事实，哪些是条件推导

`gdg_flowctrl.v:33–40,51` 是直接 RTL 证据：读请求占 outstanding，达到 15 时停止新请求，返回被接收后回收。`gdg_rdata_buffer.v:37–38,54–60` 中的接收事件为 aclk 侧返回 FIFO 的 `valid && ready`，不是 MC 首次产生数据；下游背压会延后 credit 回收。

令同一计数时钟域下的 credit 平均周转时间为 R，单 MC 最大读发射率为 s。纯权重、平衡供给且不存在额外流量时，条件上界为：

```text
new_weight_bytes_per_cycle <= 256*32*min(s,15/R)
interval_per_16KiB >= 16384/new_weight_bytes_per_cycle
```

如果**采用参考文章的条件假设** `R=23、s=1`，且相关时钟口径已经统一，得到 `46/15≈3.067 cycle/16 KiB`、`5342.61 B/cycle`；再假设 400 MHz，得到约 `2.137 TB/s`。本轮仅核对算式与 15-credit 的 RTL 来源，没有波形重新量测 23，也没有对当前设备测量持续带宽。

MC→hub 的新返回位宽、WL1→PE 的重放呈现位宽、有效权重带宽和整个 kernel 的端到端速率是不同量。参考 VCS 使用的行为 PHY、刷新设置和时钟配置不能升级为硅上实测；UScale、行切换、尾块、写流量和输出背压改变条件后必须重算。主例的 w4 复用只说明每份 weight 有四次消费机会，不保证满利用率。

<a id="compiler"></a>

## 6. 当前编译器与历史配置分开

当前引用身份为 `triton_shared a6161ef94b1941f786ce05d4e31104ec91ea22d4`：

- `lib/Dialect/ZeusHigh/Transforms/SetPeHWParams.cpp:161–210`：WBS、数学轴到硬件轴，以及真实 minitile 属性；`:230–256` 校验完整 pin，`:282–320` 处理精确表和约束搜索。
- `lib/Target/ZeusV3/CodeGen/InstructionSelector.cpp:2944–2977`：WBS 取 log2；MTW/MTK/MTC 从真实长度统一减一。
- `lib/Dialect/ZeusHigh/Transforms/CreateWeightDesc.cpp:1069–1088`：normal/vcache 的 effective PIK/PIC 对齐检查；vcache 会交换 raw 位置角色，不能将 normal 主例地址图直接套用。
- `lib/Dialect/ZeusHigh/Transforms/PeMinitileModel.cpp:281–284`：FP8 非驻留分支仍把 `N_TC>2 && k>1` 排除在模型可信候选外；它不等于硬件字段非法。
- 同文件 `:342–388`：满足 `useInt4Model` 条件的 FP8×INT4 分支自动搜索 w 可到8，其他分支到4；k自动搜索上限2，仍受容量、shape与安全 stride 条件限制。支持域来自对应分支，不能推广为所有 INT4 组合。
- `include/triton-shared/Dialect/ZeusHigh/Transforms/PeHWSpec.h:46–64,147–165`：硬件真实字段上限 w16/k16/c64，与自动搜索域分别记录。

因此，旧 [minitile 证据](pe-minitile-selection.md#pms-selection) 所引用 `82613bc2eb30feb9ef7f57aef20584df0ef9e28a` 中“自动 w≤4”不能概括本次源码的 INT4 分支。该旧版本与当前上述模型、PeHWSpec、SetPeHWParams 三文件合计有 200 行新增、19 行删除；本页只更新与教程有关的边界，不声称重做模型校准。

历史 `w4c8k2` 来自显式 pin；当前普通 `tl.dot` 通过最终 PeOp shape、dtype、覆盖表和模型做选择，两条路径不能互相冒充。这里既不新加 kernel 手动 pin，也不声称当前自动搜索会选择本教学例。硬件合法性、编译器候选资格、单指令预测与完整业务最优分别需要不同证据。

## 7. RTL 文件指纹

以下路径均相对 `design`，都是 `revision unknown` 的非 Git 快照。逐文件 hash 是本轮读取的身份，不把 README 的 tag 声明当成整树认证。

| 相对文件 | SHA256 |
| --- | --- |
| `rtl/zeus518/pe_ctrl/pe_ctrl_logic.v` | `f52913bf2bbd4cba3b85974cbe67fedd6874466f2dc42e0bd5deafe94db9eb7e` |
| `rtl/zeus518/pegroup/pe518_al1_mt_coord_cal.v` | `e892c578ddae91c3c31b85b75db16c9e7465b748b75efb9b006b5b18f5fafd13` |
| `rtl/zeus518/pegroup/pe518_al1_st_coord_cal.v` | `24a536dc32753c03ac87d7faa2cd30e73eb14e62737341562be72e3a5c8c28f5` |
| `rtl/zeus518/pegroup/pe518_ol1_buffer_ctrl.v` | `01aea4ce3ba7e6eeaa3ab1f8beeab981a7e1841c15f7607746fb6be6f914aac0` |
| `rtl/zeus518/wl1/wl1_518_weight_ctrl.v` | `c88b8edb5bb5dc3af12c5c53f6c74d5841c5f527b5743fef8487ffb7dab9809c` |
| `rtl/zeus518/wl1/wl1_518_weight_rd_ctrl.v` | `153d578c98429ed56ca3370bf05715f264871f8e3e90b65322c337e62bea3470` |
| `rtl/zeus518/wl1/wl1_518_hub_weight_req_distribute.v` | `fb59dba778b84dabf3481d435439e9ab80ca5d8acc8a8f92ee221f1dd0033f00` |
| `rtl/zeus518/wl1/wl1_518_weight_data_format.v` | `d7f88009ed2e45cd098c1ba231f1292ef29aee5db1b16bf22f31d893189d2dac` |
| `rtl/gdg/gdg_unit/gdg_axi2frame.v` | `53b7c137d3ca3f570e72c1a0efba46a0bc4e9bcb022a1eade2acaf997da7d2aa` |
| `rtl/gdg/gdg_unit/gdg_flowctrl.v` | `54bbb7e259b5dd5f965902a919aa6e42a09a294c80640d954da30032d5ecafae` |
| `rtl/gdg/gdg_unit/gdg_rdata_buffer.v` | `fb768cb193373219b1006993b3b73e634fb2ea1e8f1efa99523505432a8061fc` |
| `IP/ZGGX/MC_2025_09_12/rtl/mc/mc_frame2frame_aux.v` | `8adec30a768d338ad1bbcc9d19e0716912c1c6a358e34b143fa97cc718bb5d9e` |
| `rtl/gdg/gdg_unit/gdg_unit.v` | `0cee453aa3e3b989674456081ff74840b28754715a7c0e3d0f98a5af2e50a240` |

阵列计数另外沿 `pegroup518_x8_top.v` 的8个group（含两个mirror）、`pegroup518_top.v:370–454` 的8个PE、`pe518_top.v:201–217` 的16个ALU、`pe518_alu.v:81–98` 的8个MAC逐层核对。FP8双乘积路径来自 `pe518_alu_ctrl.v:87–90` 与 `pe518_mac.v:687–690`。这些只支持 full-block 成功消费的工作量折算；没有据此报告当前时钟、实测 TOPS 或 MAC 利用率百分比。

| 阵列相关文件 | SHA256 |
| --- | --- |
| `rtl/zeus518/pegroup/pegroup518_x8_top.v` | `9e15ae8a4a7cc43ed007106faa338ad4d135dd4abab5f5a7ec6d1bfefbb11b00` |
| `rtl/zeus518/pegroup/pegroup518_top.v` | `93a6e2d2c8da227da004dd0478516cc91ff96a362541878ffe7e48d3d0385d23` |
| `rtl/zeus518/pegroup/pe518_top.v` | `85c37c00a76a086a44d8f1921cb62f5e50cc614f5f910c2ab3756283c86c3ab8` |
| `rtl/zeus518/pegroup/pe518_alu.v` | `47c7d1ef6b9864ebe4093260dcd21a9685107057994dd0baf43e33dc15489f37` |
| `rtl/zeus518/pegroup/pe518_mac.v` | `22a161b4a274541cd79b925c4f1fbe9ea62b7fd018d9d789f9dfa09fb3038a87` |
| `rtl/zeus518/pegroup/pe518_alu_ctrl.v` | `67efd29a15325f3266f43cd2365a8a2f1db148927870bb3b0327c169cd49dc4b` |

## 8. 本轮检查及未覆盖项

- 逐元素比对实际 pack 函数与坐标公式：2,097,152 个元素全部通过，并验证完整地址双射。
- 独立枚举主例：128个不同miniblock、512个成功计算工作事件、8,388,608 MAC；AL1局部地址恰为0..31，OL1局部slot恰为0..7。
- 独立枚举三种CI、两种base共六组MC请求序列；上表row变化计数通过，所有地址均在声明的低bank简化域内。
- 重新读取两篇公开参考并核验原始HTML hash；源码引用和RTL指纹已记录。
- 没有产生业务二进制、运行仿真、检查真实波形或测量当前部署；32KiB activation请求量、row变化次数和带宽公式均属于已说明条件下的静态推导。网页交互、桌面/打印/离线和兼容链接由指南整体改动另行验收。
