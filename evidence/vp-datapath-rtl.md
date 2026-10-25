# 518 VP 完整计算数据通路：RTL 端口与条件连接

<a id="dp-scope"></a>
## 范围和读图约定

核对日期：2026-10-25。只读检查 Zeus518 `design` 参考副本；不是 Git checkout。副本来源与已有 [硬件证据](vp-hardware-rtl.md#vp-scope) 一致，`README.md:1–20` 声明为 `tag_PN100_R1_20250928` 的部分拷贝，不能据此声称整个目录与标签一致。本文另外记录使用文件的 SHA256。

本文逐项读取模块实例、端口连接、`assign`、mux 选择和有效/反压条件。未运行 RTL 仿真、综合、编译器编译或新性能测试。总图中的线只表示可达数据路径；旁路也可能保留 `link_pipe`，不能把“bypass”画成零周期。图中不要把双向握手箭头误当双向数据流。

下文路径均相对 `design/rtl/zeus518/vp_v3/`。为使表格可读，使用以下文件简称；每个简称始终对应同一个实际文件：

| 简称 | 相对文件 |
| --- | --- |
| TOP | `top_wrapper/vp_518_cal_top.v` |
| CG | `sub_module/cal/vp_518_cal_group_top.v` |
| PARA | `sub_module/cal/vp_518_cal_group_para_engine.v` |
| SCAL | `sub_module/cal/vp_518_cal_group_scal_engine.v` |
| MSKG / MSK | `sub_module/cal/vp_518_mask_group.v` / `vp_518_mask.v` |
| CMPG / CMPT | `sub_module/cal/vp_518_compare_group.v` / `vp_518_compare_tree.v` |
| SMTG / SMT | `sub_module/cal/vp_518_acc_tree_group.v` / `vp_518_acc_tree.v` |
| MUX | `sub_module/common/vp_518_out_mux.v` |
| REG | `sub_module/cal/vp_518_cal_group_scal_register_demux.v` |
| FIFO | `sub_module/cal/prl/vp_518_cal_fifo.v` |
| S2PG / S2P | `sub_module/cal/scl/vp_518_s2p_scalar.v` / `vp_518_s2p.v` |
| RLU | `sub_module/cal/prl/vp_518_cal_relu.v` |
| POST | `sub_module/post_cal/vp_518_post_cal_group_top.v` |

通用 `vp_518_out_mux` 的定义是 `i_cal_en=1` 选择 `*_cal`，否则选择 `*_pre`；未被选择的一侧 ready 为 0（MUX:46–51）。必须沿实际端口理解，不能把实例名中的 “tree”“acc” 当成无条件语义。

<a id="dp-boundary"></a>
## disconnect 控制命令边界；bypass 仍可经过缓冲

`sub_module/cal/prl/vp_518_diff_disconnect.v` 不是算术、FIFO，也不把 X/Y 两条 payload 互相交换。其数据和 end/flag 从输入组合直连到输出（:124–127），**门控的是 ready/valid**：

- `i_connect_x_or_y` 静态选择 X（0）或 Y（1）实例，见 :28,46–47。
- 计数器记录输入已接收的 end_tile 与 `i_cal_group_post_cal_cfg_ready` 事件差额，见 :77–112。
- `can_work` 由上一拍 diff flag、working flag 和 tile 计数决定；不同命令等待更严格的空闲条件，同类命令允许有限在途状态，见 :114。
- X 实例遇到 `X_TYPE1_Y_ONLY` 或 Y 实例遇到 `Y_TYPE7_X_ONLY` 时，该占位可被接收但不继续向本支路发 valid，见 :116–122。它用于处理该支路没有真正数据的命令，不是将普通操作数随意丢弃。
- CG 的 X 实例 DW=2048（CG:472–499）；每个 PARA 的 Y 实例 DW=1024（PARA:311–338）。

总图可标“命令边界/占位过滤”并画在 X 进入 Mask、Y 进入 FIFO 之前；不要把它画成另一个 buffer 或把名字中的 disconnect 解释成物理断电。对外 `cfg_ready` 的命令语义仍由整体控制协议决定，不能将该内部事件直接改名成 L2 全局写完成。

算术 bypass 仅改变某个局部 mux 的选择。一个明确例子是 `prl/vp_518_fp32_mul_group.v:270–295` 先选乘法或输入，再在 `VP_MUL_GP_OUT_PIPE` 下使两路共同经过输出 `link_pipe`（:299–324）。ReLU 也在计算/旁路 mux 后布置由 `VP_RLU_GP_OUT_PIPE` 控制的输出管线（RLU:131–185）。

本副本 `top_wrapper/vp_macro.v:1–42` 定义上述两个宏，还定义若干 PRG/SHF/scalar 输入或输出管线宏；`filelist/filelist_vp_518_top.f:1` 列出该宏文件。这里仅确认源文件关系，未重新处理实际构建参数，不能据宏名直接许诺 bypass 总延迟为某个固定周期。


<a id="dp-overview"></a>
## 一眼能看清的完整结构

下图是连接的文字表达，不是每条指令无条件依次执行的算式：

```text
PreCal.X[64×f32] -> disconnect-X -> Mask -> Compare group
                                           |  |
                      tree scalar[1×f32] ---+  +--> tensor path[64×f32]
                              |                         |
                              |                split low32 / high32
                              |                  |            |
                              |                PARA A        [MUX B input]
                              |                  |            ^
                              |                  +--pipe----->|
                              |                  |            |
                              |                  |          PARA B
                              |                  +------┬-----+
                              |                         |
                              |                 wide/pipe merge
                              |                         |
                              |                 Sum/Acc tree group
                              |                    |          |
                              |                tree scalar   tensor acc/bypass
                              |                    |          |
                              +------[scalar input MUX]        |
                                         |                    |
                              DIP_s -> PRG_s -> MUL_s         |
                                -> SUM_s -> SHF_s -> SQR_s    |
                                         |                    |
                                  S2P scalar packing          |
                                         |                    |
                                         +--[output MUX]------+
                                                  |
                                            ReLU / bypass
                                                  |
                                              PostCal
                                                  |
                                           write data / strobe

PreCal.Y_A -> disconnect-Y -> FIFO A -> typed operand / parameter consumers
PreCal.Y_B -> disconnect-Y -> FIFO B -> typed operand / parameter consumers

Compare winner value/index -> Mask state
Mask result packet -> Compare group's tensor-output selector
SQR_s output -> selected scalar feedback registers -> fixed arithmetic operands
```

图中的 `pipe` 只存在于 A 输出至 B 输入；树形 scalar 出口不经过两组 PARA。Y 进入参数/第二操作数通路，不是与 X 一同进入 Mask 的第二份 2048-bit 向量。

<a id="dp-edges"></a>
## 顶层连接表：可以直接画出的线与必须标出的条件

| 起点 → 终点 | 实际端口或 net | 宽度 / 选择条件 | 源码 |
| --- | --- | --- | --- |
| PreCal → CG.X | `o_pre_cal_out_x_data → pre2cal_x_data → i_cal_in_x_data` | 2048 bit；带 valid/ready、end_chl、end_tile、flag | TOP:230–240,303–308,414–424 |
| PreCal → CG.Y_A/Y_B | `o_pre_cal_out_y_a/b_data → pre2cal_y_a/b_data → i_cal_in_y_a/b_data` | 每路 1024 bit；各带 3-bit flag。实例行尾的旧宽度注释不能覆盖 wire/port 声明 | TOP:218–228,291–301,402–412；CG:107–124 |
| CG.X → Mask | `i_cal_in_x_* → diff_disconnect_x → pre2prl_x_* → Mask.i_s0_*` | wide 复制输入 valid 到 64 lane；pipe 仅低 32 lane valid | CG:472–499,535–569 |
| Mask → Compare 主输入 | `Mask.o_s1_* → msk2cmp_* → Compare.i_s0_*` | 64×32-bit；Mask 未使能选择其输入旁路 | CG:538–630；MSKG:138–193 |
| Compare → PARA A | `o_s1_acc_* → cmp2prl[31:0] → cmp2pla_x_* → A.i_para_in_x_*` | 低 32 lane。这里 acc 接口也承载 Compare bypass 和 TopK packet | CG:613–617,633–637,740–750 |
| Compare → B 输入 mux | `cmp2prl[63:32] → cmp2plb_x_* → mux.i_*_pre` | wide 下 B 消费高 32 lane | CG:639–643,919–943 |
| PARA A → B 输入 mux | `A.o_para_out_* → pla2smt_* → pla2plb_x_* → link_pipe → s_pla2plb_x_*` | pipe=1 才使能；每 lane 一组带 end 标志的 link_pipe；不是绕过 B | CG:874–918 |
| B 输入 mux → PARA B | `pcm2plb_x_* → B.i_para_in_x_*` | `i_cal_group_pipe_mode=1` 选 A；=0 选 Compare 高半 | CG:840–850,919–943 |
| A/B → SMTG | `prl2smt_*` | wide 数据为 `{B,A}`；pipe 数据为 `{zeros,B}`。pipe 的 valid/end 会复制，实际有效归约 lane 还受 mask 约束 | CG:874–887,947–979；SMTG:182–190 |
| SMTG.tensor → 输出 mux | `o_s1_acc_* → smt2rlu_* → mux.i_*_cal` | 输出 mux 的 `cal_gp_out_mux=1` 时选择；可为 accumulator 结果或原 tensor 旁路 | CG:971–974,1075–1102 |
| SMTG.tree → scalar 输入 mux | `o_s1_tree_* → smt2scl_* → mux.i_*_cal` | 1×32-bit；`sum_tree_mode = enable_smt_gp && !acc_tree_gp_mode_cfg` 时被选择 | CG:976–1002 |
| Compare.tree → scalar 输入 mux | `o_s1_tree_* → cmp2scl_* → mux.i_*_pre` | `sum_tree_mode=0` 时选择；Compare 的 tree 有效性另由 CMP mode/TKV 控制 | CG:619–622,983–1015 |
| scalar 输入 mux → SCAL | `tre2scl_* → i_s0_scal_*` | 1×32-bit；不是两个树结果相加，也不是两条同时进入 scalar | CG:1010–1014,1060–1063 |
| SCAL → 输出 mux | `o_s1_scal_* → scl2rlu_* → mux.i_*_pre` | 经 S2P 后是 2048-bit carrier；`cal_gp_out_mux=0` 时选择 | CG:1065–1068,1075–1102 |
| 输出 mux → ReLU | `sct2rlu_* → RLU.i_s0_*` | 64×32-bit；ReLU enable 决定计算或旁路 | CG:1097–1123；RLU:112–159 |
| ReLU → PostCal | `o_cal_out_* → cal2pst_* → i_post_in_*` | 64×32-bit；并非 scalar 返回到 PARA 的路径 | TOP:421–424,509–512 |
| PostCal → 写数据口 | `o_post_out_data/valid/strb → o_wdata_out_*` | 1024-bit payload + 8-bit strobe；格式与打包参数决定有效字节 | TOP:514–518；POST:184–225 |

`cal_gp_out_mux` 与 `sum_acc_tree_gp_out_mux` 是两个不同层次的选择。后者在 SMTG 内选择 accumulator 输出或原 tensor；前者在 CG 尾部选择 tensor 或 scalar 打包结果。`inst_decode.v:1016–1018` 分别从 `LUTG0[9] && ACCM`、`LUTG0[10]` 得到这两个选择。

<a id="dp-mask-compare"></a>
## Compare 与 Mask：赢家反馈、数据旁路和 packet 发布

| 连接 / 复用 | 实际行为 | 证据 |
| --- | --- | --- |
| Compare.tree → Mask 状态 | `o_s1_mask_tree_{valid,ready,data,end_tile,win_index,msk_index}` 分别接 `Mask.i_cmp_tree_*`；这是一条结果/状态反馈支路，不是重新读取 tensor | CG:549–554,624–629；CMPG:414–419 |
| Mask 对当前扫描输入屏蔽 | 已存赢家的物理位置与当前扫描位置匹配时，替换为配置 `mask_gp_value`；输入 tensor 本身不因此被原地写坏 | MSK:134–179 |
| Mask → Compare packet | `Mask.o_mask_{valid,data} → msk2cmp_mask_* → Compare.i_mask_*`，1024-bit 包包含 16 values + 16 indices | CG:556–557,596–597；MSK:109–151 |
| Compare scalar tree 与 packet 出口互斥 | `s1_tree_out_en = !top_k_value[4]`；=1 放行 scalar tree；=0 scalar tree 输出变成无效，树 ready 强制为 1，并允许 Mask packet 进入 tensor 出口 | CMPG:295–322,324–382 |
| packet 如何进入 64-lane carrier | 1024-bit packet 放低 32 lane，高 32 lane 数据置零，然后经 Compare 的 tensor mux 输出 | CMPG:324–350,357–382 |
| Compare 关闭时的 bypass | `i_cmp_en=0` 选择原 `s0_fwd_*`；此时不把某次旧比较结果输出为新 tensor | CMPG:385–411 |
| Compare 第二操作数 | 来自 A/B FIFO 的两半，或指令 scalar / 反馈比较寄存器；由 `cmp_acc_b_mux` 和 `i_compare_reg_en` 选择 | CMPG:222–226；CG:593–605 |
| 比较硬件复用 | 同一组比较单元以 mode 重连成逐 lane accumulator、逐 lane 双输入比较，或树形比较；不是额外独立三套结果阵列 | CMPT:153–218,218–260,308–317 |

CMPT 的明确 mode 公式是：

- `acc_mode = !cmp_acc_tree_mode && !cmp_mode`；
- `par_mode = cmp_mode`；
- `tree_mode = cmp_acc_tree_mode && !cmp_mode`。

因此总图宜写“Compare group / acc-par-tree modes”，不能将所有 Compare 输出都称为“比较树输出”。

TopK packet 的真实出口可在总图另画一条带条件的折返：**Compare winner → Mask result slots → Compare packet selector → tensor path → A/B 的合法旁路 → SMT tensor bypass → ReLU bypass → PostCal**。不能画“Compare 的一个 32-bit tree scalar 直接变成 128 B TopK packet”。

`top_k_value[3:0]` 选择保存槽，`[4]` 控制相关输出/结束路径；`mask_gp_clr` 另外决定清除。MSK:95–126 表明 packet valid 来自 tree end 事件的延迟，清状态与结果可见的关系不能只看一个组合 mux 推定。本文没有对该时序重新运行仿真。

<a id="dp-parallel"></a>
## 两组 PARA 内部：固定主链与共享 FIFO 支路

每组实际主链顺序为：

```text
X -> DIP -> SUM0 -> PRG -> MUL -> FLR -> SUM1 -> SHF -> output
```

对应实例和主数据 net：

| 邻接连接 | 实际 net / 端口 | PARA 行号 |
| --- | --- | --- |
| X → DIP | `i_para_in_x_* → dispart.i_s0_*` | 483–508 |
| DIP → SUM0 | `dip2sma_* → sumsub_group0.i_s0_*` | 499–503,530–540 |
| SUM0 → PRG | `sma2prg_* → param_gen_group.i_s0_*` | 536–540,564–574 |
| PRG → MUL | 主 `prg2mul_*`；另有 k 的 `prg2mul_k_*` | 570–582,606–619 |
| MUL → FLR | `mul2flr_*` | 615–619,635–645 |
| FLR → SUM1 | 主 `flr2smb_*`；另有 `flr2smb_x_*` 作第二来源 | 641–653,677–691 |
| SUM1 → SHF | `smb2sft_*` | 687–727 |

各模块由 LUT 位使能，未使能的模块有对应 bypass；这是一条固定次序的可选流水，不是任意重排的 ALU 图。PARA:301–308 给出 DIP/SUM0/PRG/MUL/FLR/SUM1/SHF 分别对应位 2–8。A 接 LUT0，B 接 LUT1，但部分 scalar 系数和 dtype/mode 控制共用；不能画成两个完全独立的通用向量处理器（CG:674–710,774–810）。

第二操作数和中间旁路必须补在图中：

| 支路 | 实际连接与条件 | 证据 |
| --- | --- | --- |
| 外部 Y → FIFO | `i_para_in_y_* → disconnect_y → para_in_y_* → cal_fifo.i_s0_y_*` | PARA:311–377 |
| PRG.b → FIFO → SUM1 | `prg2fio_b_*` 作为 `DATA_FLAG_TYPE4_Y_SUM1`；不是直接把 b 接到所有算术模块 | PARA:356–359,390–424,580–582 |
| DIP.s / FLR.s → FIFO | 两种旁支均标成 `DATA_FLAG_TYPE5_Y_SHF` | PARA:361–369,505–507,651–653 |
| FIFO → typed consumers | demux 有 Compare、SUM0、PRG、MUL、SUM1、SHF、scalar PRG 七类；根据数据 flag 和 consumer enable 路由 | PARA:380–457 |
| A/B 的 SHF 数据交叉 | A 的 `o_fio2sft_*` 接 B 的 `i_fio2sft_*`，B 反向接 A；不可在图上默认为“本 FIFO 直接供本 SHF” | CG:724–732,824–832；PARA:460–478,711–715 |
| scalar PRG 装表来源 | 只有 A 的 `o_fio2scl_*` 连入 SCAL 的 `i_s0_fifo_prg_*`；B 的同名输出接 nc、ready 固定 1 | CG:719–722,819–822,1052–1055 |

FIFO 的写入口不是四个可同时接收的端口。FIFO:83–97 的 write data 选择顺序为 Y、PRG.b、FLR.s、DIP.s，只有一个 `wr_en/wr_data`，最终实例化 `vp_518_fifo_16x1028`（:104–118）。其 ready 信号也不是为每个竞争来源提供独立仲裁承诺；合法指令配置必须避免同时要求互相冲突的写来源。总图用“单写入口 mux + tagged FIFO + demux”，不要画四条独立无冲突队列。

<a id="dp-sum-scalar"></a>
## SMT 允许旁路 tensor 与归约并行推进，scalar 不是所有输出必经站

SMTG 内的 `sum_acc_tree_gp_out_mux` 选择 64-lane accumulator 结果（1）或输入 tensor（0），见 SMTG:247–272。当 SMT 开启且选择 bypass 时，输入 valid/ready 被门控，使计算支路与旁路共同消费，见 :275–285；这允许“原 tensor 继续传，同时生成归约 scalar”的组织。因此不能在总图中把 SMT 简化成一个丢弃所有输入后只留下标量的方框。

SMT 自身用同一组 accumulator 单元重连为 acc/tree。输入连接见 SMT:123–161；mode 与实例见 :205–260；64-lane 与 scalar 输出互斥选择见 :263–276。SMTG 仍保有独立的 tensor bypass，不应把“算术输出互斥”误写成“归约与原 tensor 不能共存”。

SCAL 的完整主链为：

```text
tree-input mux
  -> DIP_s -> PRG_s -> MUL_s -> SUM_s -> SHF_s -> SQR_s
  -> S2P packing -> CG output mux -> ReLU -> PostCal
```

| 连接 | 数据 net | SCAL 行号 |
| --- | --- | --- |
| DIP_s → PRG_s | 主 `dip2prg_sc_*`，另有 `dip2prg_sc_s_*` | 211–278 |
| PRG_s → MUL_s | 主 `prg2mul_sc_*` 与 k/b/s 三路 side data | 263–323 |
| MUL_s → SUM_s | `mul2sum_sc_*`，同时传 b/s side data | 312–360 |
| SUM_s → SHF_s | 主 `sum2shf_sc_*`，s 支路接 SHF FIFO 输入 | 353–388 |
| SHF_s → SQR_s | `shf2sqr_sc_*` | 385–410 |
| SQR_s → S2P | `sqr2stp_sc_*` | 394–437 |

SCAL:195–200 从 scalar LUT 的六位分别使能 DIP/PRG/MUL/SUM/SHF/SQR。SQR 也有独立 enable/bypass（`scl/vp_518_square_root_div_scalar.v:115–158`），故“反馈源位于 SQR 后”不等于“每次反馈都必须开方”。

**S2P 不是把一个 scalar 广播成 64 个相同结果。** S2P:58–94 按 `c_cnt` 将连续 scalar 装到不同 lane；FP32 到 32 个计数位置，其它输出格式到 64 个位置，或遇到本行结束提前输出。bypass 时一次 scalar 写到 lane0，lane1–3写零，其它 lane 不因这一输入重新写入。它是 scalar 结果组包路径；把一行归约因子用于下一条向量乘法，必须另画下面的反馈寄存器路径。

CG 尾部 tensor/scalar mux 的未选端 ready 被固定为 1（CG:1075–1076），以便相应内部过程前进；选择 tensor 并不意味着 scalar 计算和反馈一律关闭。总图应保留 `SQR_s → feedback` 支路，同时把最终数据出口画成条件选择。

<a id="dp-feedback"></a>
## 标量反馈是专用系数回写，不是任意寄存器环路

唯一的 scalar feedback producer 在 SCAL:392–393：

- `o_scalar_register_wr_en = sqr2stp_sc_valid`；
- `o_scalar_register_wr_data = sqr2stp_sc_data`。

它发生在 **SQR_s 输出、S2P 之前**；既不是 PostCal 的结果，也不经 L2。CG 将这对信号送给指定消费者的寄存器 demux。可画出的目的地如下：

| `i_scalar_wr_cfg` 编号 | 目的地 | 读取选择 | 连接位置 |
| --- | --- | --- | --- |
| 1 | Compare 的 scalar B 系数 | `i_scalar_rd_lut_cfg[0]`，在反馈寄存器与指令 compare scalar 中选择 | CG:502–531,593–594；CMPG:222 |
| 2 | PARA A/B 的 SUM0 系数 | `i_scalar_rd_lut_cfg[1]` | PARA:523–524,731–767；CG:712–713,812–813 |
| 3 | PARA A/B 的 MUL 系数 | `i_scalar_rd_lut_cfg[2]` | PARA:598–599,731–767 |
| 4 | PARA A/B 的 SUM1 系数 | `i_scalar_rd_lut_cfg[3]` | PARA:670–671,731–767 |
| 5 | scalar MUL 系数 | `i_scalar_rd_lut_cfg[4]` | SCAL:292–293,441–474 |
| 6 | scalar SUM 系数 | `i_scalar_rd_lut_cfg[5]` | SCAL:337–338,441–474 |

这是六个逻辑写目标；A/B 的 2/3/4 各实例化一份寄存器存储，不能据六个编号称其为统一六项通用寄存器文件。源码定义过编号 0 和 7，并不证明此处存在相应可用反馈目的地；本次实际 demux 连接只覆盖 1–6。

REG:47–72 显示：按写编号匹配更新 `wr_data_demux`，随后经过 `wr_data_dly1/dly2`，读 enable 来自 `i_scalar_rd_lut_cfg`。因此它是带状态的有限目的地回写，不是无时序成本的组合广播。原 tensor 若下一步仍要用，必须由已有数据路径或 L2 保存，不能凭反馈箭头推定原 tensor 也被留在了 scalar 寄存器中。

<a id="dp-postcal"></a>
## PostCal 也必须拆开，而不是一个泛称“store”

POST:119–225 的明确顺序：

```text
cal2mul -> FP32 post multiply -> FP32 post sum/sub
         -> fp2fi format converter -> P2S packing -> write payload/strobe
```

- post MUL 与 SUM/SUB 都由 `i_quan_en` 使能，分别消费 `i_mul_k`、`i_sumsub_b`，见 POST:119–159。
- 格式转换消费 `i_fmt_out`、carry、conv mode，见 :162–180。
- P2S 消费输出 dtype、dst C、读模式、tree/pipe 模式和计数，生成 1024-bit 及 strobe，见 :190–225。
- 输入还受 `post_working_flag` 门控（:115–118），不能只把算术深度等同于所有命令的时间。

这里的 P2S 是输出 packing；上面的 S2P 是收集 scalar 为内部并行 carrier。两者方向、状态和位置均不同，不能因为名字相近而合并成一个随处可用的 broadcast/reshape 块。

<a id="dp-drawing-rules"></a>
## 总图中必须保留的约束

1. **分叉**：Compare 有 tensor、tree scalar、Mask feedback；SMT 有 tensor acc/bypass 和 tree scalar。
2. **三个关键 mux**：B 的 X 输入选 Compare 高半或 A；scalar 输入选 sum tree 或 compare tree；最终输出选 tensor 或 scalar carrier。
3. **两种反馈分别画**：TopK 的 winner→Mask 与 SQR_s→专用系数寄存器互不等价。
4. **Y 与参数侧路**：每组 FIFO 是单写入口，PRG.b、DIP.s、FLR.s 和外部 Y 共享它；A/B SHF side data 存在交叉连线。
5. **S2P 不标 broadcast**：它装配连续 scalar 结果；向量乘法的 scalar 系数复用是另一条专用反馈路径。
6. **bypass 是选择路径**：不代表某个功能物理不存在、所有模块可重排、零延迟，或整条指令可以忽略 ready/valid。
7. **选择条件不是完整合法性**：静态连线支持某种取值，不证明所有配置组合都由软件开放或经过功能验收。

## SHA256

下列文件用于本次连接核对；路径相对 `design/`，不发布原始 RTL。

| 相对路径 | SHA256 |
| --- | --- |
| `filelist/filelist_vp_518_top.f` | `e68b20fbfde7a4a1c17e0d9f70766c3a85b2ff76495d7982c0f6c66857151cb9` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_macro.v` | `aa5db213a1441b10f9400cd9ab4240254d5574984861a7faed7f18e5bff566dc` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_diff_disconnect.v` | `aa3666a90237727a3cbd60d866145d5f7558926044f6167500585c29a3efed84` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_mul_group.v` | `e0d9fdd603db9dd63d0e720041f5867a56a14fae36aa72b04fafa374adeb9a18` |
| `rtl/zeus518/vp_v3/sub_module/cal/scl/vp_518_square_root_div_scalar.v` | `0ef9f8e183f7d46a7123def062d9dfd59623a012913548512e0e30dfa581b4dc` |
| `README.md` | `6e983e5ee115a7965099de957279b5bd0a700bb98eb7d7856f12464a88b90a49` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_cal_top.v` | `5ad558f3ef001bdfae9e8841b600179a75276a03ebbaba3202a187108ad640b2` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_top.v` | `2b00edceb4b2be634022cae5ef951f5309cae2e4b61fa6891303c0d651a9e823` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_para_engine.v` | `875dec6d9b6a082a87c0416a007cde52325d58f984fbe0aad3c3985b64a8333a` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_scal_engine.v` | `2bd1203fff3a39b1060de135bacadc994506fe7398b95f26212e7f5c3a1c1ea3` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_mask_group.v` | `a9f63d08135f7b6008a057e8d0b171b97040ab1e76f95b7abcccd606d767e3ac` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_mask.v` | `c74654814100789f3e09b4c99be1b643e7015e8e3737e07a0d7652ebbcd88f29` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_compare_group.v` | `0eb1ca772497a352ccfd4f34e2414a0a987dea78b1991336e7039f183e161279` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_compare_tree.v` | `d991bf9809d0b123c6551dabf3bdc87a7b69aaafcf783f122607a324bb989a2a` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_acc_tree_group.v` | `e60173cff57c90eea15d7c7a8e33fd5acbea9db0e4cec77b7f81212fc57c13c5` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_acc_tree.v` | `a5e7b40a5ec0ce74415e4df4c21fc0983679442ffd11e410052bba2411ea4892` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_scal_register_demux.v` | `3c16819a458f431c6b4238a366e3dda6badb578aa3ae15fb1087a412621a5cb4` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_cal_fifo.v` | `5254f254deda2309c2c8d08818af76e25e83f23e6223719470ac5d43f474bea0` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_cal_relu.v` | `c4dedbdb56e2a3e0d7419defe8769478789f239d1ce6dd3cc6483b99d3240564` |
| `rtl/zeus518/vp_v3/sub_module/cal/scl/vp_518_s2p_scalar.v` | `72b0307d6d6ce784c0a9347170a5c16f8a065f2648fcd5e0d0ad1e66f0792f1d` |
| `rtl/zeus518/vp_v3/sub_module/cal/scl/vp_518_s2p.v` | `0766b6d0dc9a4cc4f858562771ff93b4e3e280eac9fba147305ef4c4ea407727` |
| `rtl/zeus518/vp_v3/sub_module/common/vp_518_out_mux.v` | `19fe73a8f780a6638daaa57d0b4f6541315a99748cc5ca3e106fea9108ff8e7a` |
| `rtl/zeus518/vp_v3/sub_module/post_cal/vp_518_post_cal_group_top.v` | `23d0c309ba3654f94d4754b4734760888811e5fa04aed708d80bc08f3f3d7530` |
| `rtl/zeus518/vp_v3/sub_module/ctrl/vp_518_inst_decode.v` | `404c0c401619a455f71c40fe16d69c05302cc645e55e938c2780925fb4e57d26` |
