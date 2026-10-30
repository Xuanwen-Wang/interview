# VP 设计图到完整执行过程：2026-10-30 复核

## 范围与版本

- 正文：`content/39-vp-walkthrough.json`，稳定 chapter ID `hw-vp-architecture`；40 小节，新增 10 小节、7 张原创 SVG，保留全部原有 section ID。
- 设计图：用户于 2026-10-30 提供的 VP CORE 架构图；原文档版本、日期、局部符号图例未知。仅作阅读线索，不作为逐拍时序或最终实现能力的单独证明。原图不进入公开仓库及 Pages，文件 SHA256 仅用于固定参考对象。
- RTL：`design` 非 Git 参考副本，**revision unknown**；逐文件摘要见 [vp-design-source-hashes.json](vp-design-source-hashes.json)。与 2026-10-25 三份详细连线证据逐项比对，已列出的既有文件 hash 全部相同。本次又直接读取命令 decode、端口、读源选择、PreCal 转换、CAL FIFO/demux、A/B 模式、树与输出 mux、PostCal 组包、写响应完成等关键实现。
- 原有 TopK/sigmoid/RMSNorm 和编译器实例继续保留它们在 2026-10-25 证据中的版本范围；本次不将原有编译器结论重新归给当前 checkout HEAD。
- 本次没有修改业务仓库，没有编译工具链，没有执行功能仿真、CycleSim、VCS、综合或设备性能实验。新增数值、shape 和性能下界为带条件的教学推导。

下面 RTL 文件路径均相对 `design/rtl/zeus518/vp_v3/`。行号对应 hash 所绑定的快照。既有完整端口说明继续见 [顶层控制](vp-top-control-rtl.md)、[数据通路](vp-datapath-rtl.md)、[双向量流水](vp-vector-pipeline-rtl.md)。

<a id="design-map"></a>
## 设计标签与实现映射

| 原图标签 | 当前追踪位置 | 教学边界 |
| --- | --- | --- |
| INST CTRL / DECODE、CDC、ECC | `top_wrapper/vp_518_top.v:12–34,379–536,538–694` | 命令口 68 bit；有效读写数据各 1024 bit；校验位各 72 bit；地址 15 bit、strobe 8 bit；端口宽度不是吞吐实测 |
| PRE CAL / FCV / DMX | `sub_module/pre_cal/vp_518_pre_cal.v:222–494` | 分支拆成 DISPART、i2f、re_quan、CONCAT、SPLIT_SEND、DATA_MUX、DATA_DISTR；不靠 DMX 名称推断任意交换能力 |
| MSK / CMT | `sub_module/cal/vp_518_cal_group_top.v:535–643` | CMT 对应 Compare group；tensor、tree、winner→Mask 和 packet 返回路径分开 |
| 两条向量算术链 | `sub_module/cal/vp_518_cal_group_para_engine.v:483–727` | A/B 各 32 lane，DIP→SUM0→PRG→MUL→FLR→SUM1→SHF；局部 X 是当级值 |
| SMT 与上方标量链 | `sub_module/cal/vp_518_cal_group_top.v:947–1102`；`vp_518_cal_group_scal_engine.v:195–437` | 两个 tree 来源选择后进入一条 scalar 链，不是第三组向量引擎 |
| RLU / QUA / FCV / P2S | `sub_module/cal/vp_518_cal_group_top.v:1107–1123`；`sub_module/post_cal/vp_518_post_cal_group_top.v:119–225` | 最终数据选择后才进入 ReLU/PostCal；分开数值计算、类型转换、组包 |

未依据原图小方框 S/P/D/V/M/L、X/C/R 等局部字符编造完整含义；图中 C1/C32/C64 仅按相应位置的标量/向量宽度解释，并由端口确认。原图的 64-bit 标注与 RTL 的 68-bit 模块命令口采用不同口径，正文明确展开，未推断原图修订历史。

<a id="command"></a>
## 命令状态、分流与完成事件

- `sub_module/ctrl/vp_518_inst_decode.v:695–749`：命令锁存；高 4 bit 选择配置槽，低 64 bit 更新对应状态。
- 同文件 `751–758`：高 4 bit 全 1 类别的终结有效信号；不是宣称全部类别均为任意可执行的外部 ISA。
- 同文件 `1794–1955`：四套配置及两层 link pipe；`1399–1415` 规定 start、accept、done 的来源。
- `sub_module/ctrl/vp_518_ctrl_top.v:242–428`：连接 RD、PreCal、CAL/PostCal、WR 四套配置；`492–494` 连接读元数据。
- `top_wrapper/vp_518_cdc_top.v:130–194,317–577`：DUMMY 与普通异步 FIFO 分支区别；各配置/数据/响应跨域，不把正常实现当单时钟直连。
- `sub_module/ctrl/vp_518_wr_addr_gen.v:925–1036`：普通写请求、结束标志、响应记账与 PRG load 的独立 done 分支。

新增命令图为因果与分流示意。没有按 start/accept 名称强加先后关系，没有把内部握手命名为首个算术有效周期。

<a id="streams"></a>
## 地址、用途标签与双输入

- `sub_module/ctrl/vp_518_rd_addr_gen.v:517–523`：不同读模式；`1227–1231`：X/Y 地址的选择。读配置与返回 payload 的对应见 CTRL 与 PreCal 端口连接。
- `sub_module/pre_cal/vp_518_pre_cal_dispart.v:126–132,241–242`：按包标志选择参数或转换支路，不是所有 FP32 tensor 都无条件旁路转换。
- `sub_module/pre_cal/vp_518_pre_cal_fi2fp_group.v:90–137`：64 个槽，BF16 取每个 16-bit 元素，FP32 仅低 32 个有效；pipe 也限制主有效 lane。
- `sub_module/pre_cal/vp_518_pre_cal_concat.v:63–85,99–134`、`vp_518_pre_cal_split_send.v:198–232,249–256`、`vp_518_pre_cal_data_mux.v:99–136,164–170`：拼接、元素广播、有限固定置换分别说明。

正文的 byte offset 是逻辑连续张量的字节推导，不直接写入 RTL 15-bit 地址字段，也未从地址位数推断 L2 byte 容量。W/H/C 映射为教学假设，不冒充某一次实际编译输出。

<a id="lanes"></a>
## A/B lane 的具体定位

- `sub_module/cal/vp_518_cal_group_top.v:633–643,674–871,874–943`：A 消费低 32，wide B 消费高 32；pipe B 改消费 A，经 32 份带结束标志的 link pipe。
- pipe carrier 高半是零，valid/end 标志有复制；不在正文伪造高半 valid 恒零的 RTL。
- `sub_module/cal/prl/vp_518_fp32_mul_group.v:175–214`：MUL 第二源与自身乘法选择。教学二元乘法指定外部 FIFO Y，不混为 PRG.k 或 scalar。
- 完整 BF16 组的 128 B→内部 256 B 是表示展宽，不是额外 L2 读。

<a id="fifo"></a>
## FIFO 来源、容量与队头条件

- `sub_module/cal/prl/vp_518_cal_fifo.v:83–118`：共享 ready、单个写数据 mux、Y > PRG.b > FLR.s > DIP.s 优先级；实际实例 16×1028。数值载荷是 16×1024 bit=2048 B，另有元数据。
- `sub_module/cal/vp_518_cal_group_para_engine.v:350–457`：各来源 tag 与七种消费者；`460–479`：SHF 输出缓冲。
- `sub_module/cal/prl/vp_518_cal_fifo_demux.v:62–91`：当前 FIFO 数据 tag 匹配、消费者使能与出口缓冲 ready 决定读取；没有随机选择后续队列项。出口存在 link pipe，不把队头出队和最终算术消费混为同一事件。
- `sub_module/cal/vp_518_cal_group_top.v:719–732,819–832`：scalar PRG 装表仅接 A FIFO；A/B SHF 辅助线交叉。

“PRG.b 与外部 Y 同拍争入口”是非法配置的反例，不是已复现的合法 kernel 故障。未运行任何碰撞仿真，也未因图上有路径便宣布某个新融合 recipe 可被当前编译器接受。

<a id="reduction"></a>
## 归约范围和结束条件

- `sub_module/cal/vp_518_compare_tree.v:153–260,308–317`：acc/par/tree 模式。
- `sub_module/cal/vp_518_acc_tree_group.v:178–221`：C 读次数、尾部、FP32/pipe 有效范围、WHC 结束计数；`247–285`：tensor acc/bypass 与计算支路的共同前进条件。
- `sub_module/cal/vp_518_acc_tree.v:123–161,205–276`：树/累加接线与结果选择。
- `sub_module/cal/vp_518_cal_group_top.v:983–1015`：SMT tree 或 Compare tree 选择；`1075–1102`：最终 tensor 或 scalar 组包选择，两种 mux 不混用。

教学部分和 p[r,g] 描述数学范围，不承诺树的每级延迟、确切浮点结合顺序或中间 packet 次序。抽象 64 项二叉树的六层不等于指令六个时钟周期。

<a id="state"></a>
## 标量与状态寿命

- `sub_module/cal/vp_518_cal_group_scal_engine.v:392–437`：反馈来自 SQR 后、S2P 前；SQR 可旁路。
- `sub_module/cal/vp_518_cal_group_scal_register_demux.v:47–72` 及各调用实例：写目标为 Compare、A/B SUM0/MUL/SUM1、scalar MUL/SUM；它们是固定目的地，不是统一通用寄存器文件。
- `sub_module/cal/scl/vp_518_s2p.v:58–94`：连续 scalar 按位置组包；FP32 32 个位置，窄格式 64 个或结束提前输出，未把 S2P 称为系数广播。
- `sub_module/cal/vp_518_mask.v:109–179`：winner 值/索引状态及后续屏蔽；不写坏原 L2 tensor。
- PRG 表与现有数值/生命周期证据见 `vp-vector-pipeline-rtl.md` 和正文既有 `vp-prg-ownership`。

逐行“产生系数→反馈→消费→允许覆盖”的描述是需要满足的依赖合同，不宣称所有 RMSNorm lowering 已采用寄存器反馈或具备自动状态排程。

<a id="writeback"></a>
## 输出表示与完成

- `sub_module/post_cal/vp_518_post_cal_group_top.v:119–225,229–240`：post MUL、SUM/SUB、f2i、P2S，末端等待结束包消费。
- `sub_module/post_cal/vp_518_p2s.v:139–153,190–236,252–337`：普通 wide 窄输入转 FP32 输出分成两份载荷；FP32/pipe 的普通输入形状为 32 个有效值；tail/tree 模式另有条件。
- `sub_module/ctrl/vp_518_wr_addr_gen.v:925–1036`：写接受与写响应排空不同；普通 done 与无普通 tensor 输出的参数 load 分开。

两份 128 B 是完整 64 元素 FP32 输出的有效载荷账，不承诺两个连续物理时钟周期。QUA 的分离乘/加不称单舍入 FMA。

<a id="example"></a>
## 贯穿算例与独立复算

固定教学条件：X/Y/Z=[4,128] BF16、行优先连续、完整对齐组、单 VP wide、MUL 从 FIFO 取 Y、其他无关阶段采用合法旁路、无 PRG/scale 装载。它不是实际 ISA dump，不声称已生成或运行该指令。

| 量 | 推导 | 结果 |
| --- | --- | --- |
| 单 tensor 元素数 | 4×128 | 512 |
| 单 tensor 有效字节 | 512×2 | 1024 B |
| 全部逻辑组 | 4×(128/64) | 8 |
| 两输入读载荷 | 2×1024 / 128 | 16 个满载等价值 |
| BF16 输出载荷 | 1024 / 128 | 8 个满载等价值 |
| X[1,37] byte offset | 2×(128+37) | 330 B |
| 该元素 BF16 wide 分组 | c<64；37=32+5 | 本行第 0 组，B 局部 lane5 |
| 该元素改成 FP32 输入 | 37=32+5 | 本行第 1 组，低半 lane5 |
| 每行常数 r+1 的 row-sum | 128×(r+1) | [128,256,384,512] |
| 错把行也归约 | 128+256+384+512 | 1280，shape 与合同不同 |

独立复算通过枚举全部 (r,c) 并反向重建位置、用逐元素直接求和校验行统计、用实际 BF16 对应的精确值检查 1.5×(−2)=−3。原有章节/问题 ID 及阅读阶段覆盖用结构检查核对。校验记录保留在本次审稿记录中，不新增照抄文案的仓库测试。

<a id="performance"></a>
## 性能模型的限定

- B/β 是同一范围内各方向的条件下界；β 统一为 B/s，T 为 s。
- max(read,write,compute) 只作为下界，不是实际命令时间预测。
- 16 拍只在显式归一化同域、每拍满载读、读写可并行的教学前提下成立；没有把它当作硬件实测。
- L_fill+(G−1)×II+L_drain 仅用于模式固定、同域、稳态假设；不能与整段读/写时间重复相加。
- 四 VP 分行保持总有效字节不变；没有承诺四倍加速。L2 争用、配置、参数、同步与 PE 重叠都需要真实证据。
