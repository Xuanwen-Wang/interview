# PE 计算阵列、CI 归约与输出路径：RTL 复核

采集日期：2026-10-25。用于重写 PE 章节的架构图、数据流图和逐阶段讲解。业务源码只读；本轮没有运行 RTL、VCS、CycleSim 或硅上测量。

<a id="pe-scope"></a>

## 版本与证据范围

来源为 `design` 只读 RTL 参考副本。`README.md:1–30` 声明它是 `tag_PN100_R1_20250928` 的部分副本，并记录个别差异。它不是 Git checkout；本轮没有向远端验证整棵目录。下文以逐文件 SHA256 绑定实际读取的内容，不将其等同于整个 tag。部分文件头修改日期晚于 tag 名中的日期，因此更不能仅凭 tag 名推定所有文件的版本。

所有文件定位相对于 `design`。文件行号、模块连接、位宽、generate 数量属于直接源码事实；矩阵坐标和数式是由它们推导的数学解释。坐标主例限定 normal KC FP8；与权重路径独立复核的 pack 映射交叉核对。其他布局不能仅按坐标示意推断 GDG 物理字节地址 ABI。`pegroup/fp32_sum.v` 与 `common/fp32_sum.v` 本次 `cmp` 相同，实际 PE filelist 指向后者，引用以后者为准。

<a id="pe-shape"></a>

## 1. 应先画出的架构：横向输出列，纵向输入通道分片

主讲限定：**单 NPU core、KC、FP8 E4M3 activation × FP8 E4M3 weight、完整无尾块**。先把数学定义为 `Y[M,CO] = A[M,CI] × B[CI,CO]`；硬件命名 `C` 对应 CI，硬件命名 `K` 对应 CO，避免与常规 GEMM 的 reduction-K 混淆。

### 1.1 可数的层级与连接

| 层次 | 直接事实 | 定位 |
|---|---|---|
| NPU core → array | 一个 `pe518_array` | `rtl/zeus518/zeus_top/zeus_core_top_pwr.v:8527` |
| array → group wrapper | 一个 `pegroup518_x8_top` | `rtl/zeus518/zeus_top/pe518_array.v:1719` |
| wrapper → group | u0…u7 共 8 个 group；u1/u6 使用 mirror 模块 | `rtl/zeus518/pegroup/pegroup518_x8_top.v:997,1188,1378,1568,1758,1948,2139,2330` |
| group → PE | generate 8 个 `pe518_top`；每个有独立 AL1、16 ALU | `rtl/zeus518/pegroup/pegroup518_top.v:370–494`；mirror `m_pegroup518_top.v:377–501` |
| PE → ALU | generate 16；weight 切为 `128*i +:128`，同一 128-bit activation 广播给所有 ALU | `rtl/zeus518/pegroup/pe518_top.v:201–237` |
| ALU → MAC | generate 8；act/weight 都切成对应的 16-bit word | `rtl/zeus518/pegroup/pe518_alu.v:81–100` |

所以每 core 有 `8 × 8 × 16 × 8 = 8192` MAC cell。**这里的 8 个 group 不是 8 个 NPU core。** 8192 是 cell 数，不能脱离输入 pair 直接报 MAC/拍。正文统一用A/B表示activation/weight矩阵；硬件W轴对应M、小写w表示minitile行数。

### 1.2 FP8 KC 的轴解释

把一个 `CI128 × CO128` 权重逻辑块画成 8×8 网格，每格 `CI16 × CO16`：

- 横向 8 个 group，各有 16 个输出列 ALU。
- 纵向 8 个 PE，各负责一段 16 个 FP8 CI。
- 一格即一个 `pe518_top`，接收 16 个 FP8 activation 和 `16×16=256` 个 FP8 weight。
- 一格内 16 个 ALU 对应 16 个列；每 ALU 将 16 个 activation 与本列的 16 个 weight 做局部点积。
- 同一 group 的 8 个 PE，最终在 group 末端对同一列归约，合成 CI128 点积。
- group 之间输出列不同，**这里不存在把 8 个 group 再沿 CI 相加的必要**。

normal KC FP8 主例可以写 `co(g,a)=16g+a`，`ci(p,j)=16p+j`。本轮已与 [weight 独立证据](./pe-weight-rtl.md#pw-mapping) 交叉核对：固定版本 `transform.py:16–51` 的 normal FP8 为 `(k1,c1,k0,c0)=(8,1,16,128)`，`weight_data_format.v:581–588,661–668,1013–1024` 将两轮数据重排给各 PE。本文矩阵记为 `B[CI,CO]`，该 pack 接口记为 `weight_2d[CO,CI]`，是同一组权重的转置视角。其他 store mode、INT4 和跨多个块的物理地址，仍不能照抄这个线性图。

`pe518_al1_mt_coord_cal.v:189–202` 独立印证：KC FP8 的 C 基本单位 128，普通权重 K 基本单位 128；KC BF16 的 C 基本单位 64；INT4 权重的 K 基本单位 256。

## 2. Activation 的空间复用：128 个不同数，不是每个 group 重读一份

`pe_ctrl_logic.v:4173–4435` 把同编号 PE 的 `pegx_peN_act_data` 广播给所有 8 个 group。例如 PE0 的同一 128-bit 向量同时送 group0…7 的 PE0。各 group 的接受信号组成向量反馈，见 `4139–4171`。

进入每个 PE 后，`pe518_top.v:216–217` 对 weight 做 ALU 切片，而 activation 没有按 ALU 切片，直接向 16 个 ALU 广播；ALU 内才按 16 bit 切给 8 个 MAC。

因此满块 FP8 KC 的理想一次计算发射可按下列层次理解：

| 边界 | 不同 activation 数据量 | 用途 |
|---|---:|---|
| 整个 CI 基本块 | 128 个 FP8 = 128 B | 一个 token 的 CI128 向量 |
| 每个 CI 分片 PE | 16 个 FP8 = 16 B | 同时服务 16 个本 group 的 CO |
| 每 MAC cell | 2 个 FP8 = 2 B | 本列的两个 CI 乘积 |
| 一个 activation 标量的空间消费 | 8 group × 16 ALU = 128 个 weight | 同时参与 128 个输出列 |

因此用户说的“1 cycle 读 128×1 act”，在 **128 个 FP8、完整 KC 块、接口满速、供数就绪** 的口径下，与阵列的 128 B 基本输入一致；外部 L2 接口拍属于 core_clk，阵列接受拍属于 pe_clk，不能在未确认时钟配置时混为同一拍。不能误写成“每个 PE 读取 128 个 FP8”，也不能把总计 64 个 AL1 接口宽度相加后声称是外部独立读取量。AL1 驻留重放还可能让实际 L2 读取次数更少；这里仅解释一次阵列发射所需的不同数据。

`pe518_top.v:26–32` 每 PE 端口为 activation 128 bit、weight 2048 bit；所有 PE 的 weight 端口合计 `64×2048 bit = 16 KiB`，activation 端口物理扇出合计 1 KiB，但其中有 8 倍广播重复。**物理扇出位数、不同数据字节数、外部存储读取量是三种口径。**

## 3. 一个 MAC cell 到一个 ALU：不是 8192 个 FP32 FMA 的平铺

<a id="pe-formats"></a>

### 3.1 输入组合决定有效乘积数

`pe518_alu_ctrl.v:87–90` 只有四种组合解码。前三种精确匹配，第四路是 fallback；不应把未支持的任意混合 dtype 也称为合法模式。

| act × weight | 每 cell 有效乘积/接受拍 | 每 ALU 的数学作用 | 单 core MAC/pe_clk 接受拍 |
|---|---:|---|---:|
| BF16 × BF16 | 1 | 8 个 CI 乘积归约成 1 列局部和 | 8192 |
| INT8 × INT8 | 2 | 16 个 CI 乘积归约成 1 列局部和 | 16384 |
| FP8 × FP8 | 2 | 16 个 CI 乘积归约成 1 列局部和 | 16384 |
| FP8 × INT4 | 4 | **同 16 个 CI 产生 2 个输出列**的局部和 | 32768 |

证据：`pe518_mac.v:274–302` 为 INT8 拆 nibble 后组合；`356–385,687–690` 为 FP8 两路有效；`394–416,734–737` 为 FP8×INT4 四路；`764–789` 为 BF16 组合后仅一路有效。四个输出端口始终存在，不能用端口数直接算 MAC 数。

**FP8×INT4 重点**：同一个 cell 的低 8-bit activation 同时乘 weight 的低两个 nibble，另一个 activation 同时乘高两个 nibble；这是 2 个 CI × 2 个 CO。`pe518_add_tree_wrapper.v:72–121` 用 data0/data2 组成第一棵 16 项树，用 data1/data3 组成第二棵树。它不意味着 CI 并行宽度从 128 变 256；实际扩大的是 CO，从 128 变 256。每 ALU 有两个 OL1 更新结果，按相邻地址保存，见 `pe518_ol1_buffer.v:43–68`、`pe518_ol1_buffer_ctrl.v:155–171,266–285`。

<a id="pe-dot"></a>

### 3.2 局部点积的格式与流水

FP8 × FP8 一条 ALU lane 的数据路径：

1. 8 个 MAC cell，每个接收 2 个 FP8 activation 与 2 个 FP8 weight，产生 2 个有效乘积。
2. 乘积输出是 **28-bit 内部编码**；不是 IEEE FP32 存储值。公共树使用其中 `[27:26]` 的类型位、`[25:17]` 的指数和 `[16:0]` 的有符号数值部分。
3. `pe518_add_tree` 在 16 个输入中找最大指数，指数对齐，扩展为 30-bit 有符号定点数，再把 16 项求和，得到带共同指数的内部结果。
4. `pe518_add_tree_norm` 转为符号、指数、绝对值，调用 `pe518_norm`；这一步生成 `{sign, exponent[7:0], fraction[22:0]}` 的 32-bit 浮点值。
5. 若 UEN 开启，`pe518_scaling` 将局部和乘 BF16 scale，再 normalize 到 FP32；关闭时旁路。
6. 之后才进入 OL1 的 FP32 跨拍累计。

定位：`pe518_alu.v:59–65,102–148,169–215`；`pe518_add_tree.v:23–41,60–75,78–154,169–184`；`pe518_add_tree_norm.v:58–107`；`pe518_norm.v:244–282`；`pe518_scaling.v:62–109`。

这意味着“FP32 accumulation”能准确描述 OL1 和 group 归约边界，但**不能扩写成每个 MAC 都是一条逐元素 IEEE FP32 FMA，也不能承诺与 CPU 串行 FP32 累加 bitwise 相同**。局部多项求和、OL1 跨拍加法、group 跨 PE 求和分别有自己的对齐/归一化/舍入边界。本轮只核对路径，没有做数值全覆盖验证。

<a id="pe-stages"></a>

### 3.3 可以画成阶段图，不能画成每拍保证完成图

`pe518_alu_ctrl.v:134–169` 给出握手阶段：

| 相对握手边沿 | 信号 | 数据动作 |
|---|---|---|
| E0 | `o_mac_act_wei_hs` | act/weight 共同握手；乘法输入字段寄存 |
| E1 | `o_mac_multx_ab_hs` | 乘法输出编码寄存 |
| E2 | `o_mac_in_hs` | 16 路对齐和归约结果寄存 |
| E3 | `o_add_tree_hs` | norm 产生 FP32 局部点积 |
| 后续可选一级 | `o_scaling_in_hs` | UEN 的 scale 乘法与 norm；未开 UEN 时旁路 |
| 后续 3-stage 单元 | `fp32_sum(PIPES=3)` | 当前局部和与 OL1 旧和相加 |

这张表仅表示 **无反压下相邻接受阶段的对应关系**，E0 定义为已经在阵列入口接受数据，不从 PE_CONV issue 开始算。源端等待、AL1 SRAM、WL1、CDC、OL1 数据尚未可读、输出 buffer 占用都可能停住 valid/ready。不要把“每拍可接受 16384 MAC”改写成“一个 CI128×CO128 GEMM 从发指令到写回只需 1 cycle”。

## 4. 跨 CI 的累计：先在每个 PE 内跨拍，再跨 8 个 PE 归约

<a id="pe-ci-accum"></a>

### 4.1 用 CI256 算例把两类加法分开

仍取 KC FP8，令输入通道 CI=256，一个 token、CO128。为说明逻辑，定义每一批的 C 基本块编号 `t=0,1`，PE 编号 `p=0…7`，局部 CI 编号 `j=0…15`。

```text
q[g,p,a,t] = dot16(A[128t + 16p : 128t + 16p + 16],
                  B[同一 CI 段, co(g,a)])

OL1[g,p,a] = fp32_accumulate(q[g,p,a,0], q[g,p,a,1])
Y[co(g,a)] = group_reduce8(OL1[g,0,a], …, OL1[g,7,a])
```

`dot16`、`fp32_accumulate`、`group_reduce8` 指相应 RTL 数值路径，不代表数学实数和或固定的 Python 求和顺序。

关键点：PE3 不只负责输入通道 48…63；在第二个 C 基本块还负责 176…191。这两个局部贡献先累加到 PE3 自己的 OL1。group 最后把 PE0…PE7 同一 ALU 列的累计结果相加。**不要画成每个 CI128 块先完成全 group reduce，再把 128 列结果回写 L2 读回来累加**，当前 OL1 路径不是这样。

取全 1 的简单整数算例可做图：每个 `dot16=16`；每个 PE 的两个 C 块得到 `OL1=32`；group 8 路归约得到 `Y=256`。这是可复算的教学数据，不是 RTL 仿真结果。若输入改成一个 token X 全 2、W 全 1，则每列 Y=512，同一权重可以对第二个 token 重放，两个 token 必须使用独立 OL1 地址。

<a id="pe-ol1"></a>

### 4.2 OL1 真正保存什么

每个 ALU 包含 `pe518_ol1`：两路 `fp32_sum(PIPES=3)` 分别处理普通列与 INT4 扩展列。普通 FP8 模式只用第一路写回，第二路不形成另一输出列。

- `pe518_ol1.v:60–104`：输入 A 是新局部结果 `i_scaling_data0/1`，输入 B 是 OL1 旧值，`i_sum_en=i_scaling_acc_en`。
- `common/fp32_sum.v:123–139`：累计关闭时 B 置零；输入被拆为 FP32 指数/尾数；`667–707` 做输出舍入和拼接。
- `pe518_ol1_buffer.v:39–40`：每 ALU 两个 bank，每 bank `16 × 32 bit`，共 128 B。
- `pe518_ol1_buffer.v:43–73`：当前写 bank 供累计读取，完成 bank 供下游输出读取。
- 每 PE 总 OL1 存储 `16 ALU × 2 bank × 16 entry × 4 B = 2 KiB`；每 group 16 KiB；每 core 128 KiB。这是**本地分布式部分和容量**，不是同等数量完整 Y 元素的独立容量。KC 时同一个逻辑输出列有 8 个 PE 的部分和；INT4 每次更新又占两项地址。

OL1 的 ping/pong 意义是当前 partial-sum 的累计与已完成块的输出可以隔离，并非无限制地允许上游持续写。`pe518_ol1_ctrl.v:74–86` 明确累计要等待 `sum_in_tmp_vld`；`pe518_ol1_buffer_ctrl.v:237–287` 用已完成写入数量 `avlb_mtc_cnt` 决定旧值能否读，并在换 bank 时屏蔽误读。短 w 下反馈不能被其他输出地址更新隐藏，会成为额外等待来源，不能只分析 WL1。

### 4.3 完成整个 CI 后才切换 OL1 bank

`pe518_al1_mt_coord_cal.v:417`：`ol1_switch = mt_last_point && tc_end`。`432–451` 维护“后续 C 贡献是否要加到旧和”的状态；输出 `o_acc_en` 是状态变化脉冲，**不是每拍直接等于累计状态**。`pe518_alu_ctrl.v:232–236` 在数据握手时用该脉冲翻转 `o_scaling_acc_en`。画控制图时应把“toggle token”与“accumulate enable state”分开。

这种分离也解释为何仅看 `o_acc_en` 波形容易误解：一个脉冲可以打开后面多批 C 的累计，不是只有脉冲那一拍相加。最终 C 完成触发关闭累计和 bank 切换；控制 token 跟随数据流水。

<a id="pe-group-reduce"></a>

## 5. Group 末端：KC 才有 8 路 CI 合并，KW 是不同映射

`pegroup518_sum.v:12` 标注 `ymode=1` 为 KC。

- `105–107`：KC 输入 valid 需要 8 个 PE 的 OL1 valid 同时具备。
- `122–160`：每个 PE 的 ready 与其他 7 个 PE valid 联动，保证同一位置部分和同步消费。
- `162–182`：8×512-bit 数据进入 `pegroup518_fp32x8_sum`。
- `pegroup518_fp32x8_sum.v:86–119`：16 个并行 ALU-sum lane，每 lane 接收 8 个 FP32，并 normalize 成一个 FP32；输出为 16×32=512 bit。
- 归约实现并非 8 个 FP32 逐一串行相加：`pegroup518_fp32x8_alu_sum.v:104–200` 求共同指数、对齐为 32-bit 有符号数，再求 8 项和；`291–297` 转为 sign/exp/frac，后接 norm。
- wrapper 中有 4 个 valid/ready pipeline stage，见 `pegroup518_fp32x8_sum.v:54–84`。这是模块内部无反压流水结构，不是整个阵列到 L2 的完成延迟。

KW 下 `pegroup518_sum.v:186–227` 按 PE0→PE7 选择输出，绕过 8 路加法；因为此时 PE 维度用于不同 W 位置，而不是同一个 token 的不同 CI 分片。`pe518_al1_mt_coord_cal.v:194–202` 的 KW 单位是 FP8 C16、W8；KC 是 FP8 C128、W1。前面的 128×128 主图必须显式标 KC，不能无条件套给 KW。

<a id="pe-output"></a>

## 6. 最后一个常被漏掉的瓶颈：DFO 转换和窄输出

`pegroup518_top.v:684–770` 连接顺序是 `8 PE OL1 → group_sum → pegroup518_dt`。DT 接收 512 bit，输出 128 bit；16 路 `inst518_ct_mov_float2raw` 把 FP32 结果转换为 DFO。

`pegroup518_dt.v:92–130` 的输出计数器表明：

| 一个 group 的 16 列输出 | 有效 payload | 128-bit 出口的握手数 |
|---|---:|---:|
| INT8 / FP8 | 16 B | 1 |
| BF16 | 32 B | 2 |
| FP32 | 64 B | 4 |

8 group 相加，出口总位宽是每 pe_clk 最多 128 B 的结构口径。若后续没有反压、同域同速且已供齐结果，CO128 FP32 的 512 B 需要 4 轮输出握手；FP8 只需 1 轮。`pegroup518_top.v:775–795` 后面还有跨到 core clock 的 FIFO。以上不是端到端 L2 完成保证。

**“内部 FP32 累加”与“最终输出 FP32”是两件事**：前者是计算精度路径，后者由指令 DFO 决定，并改变下游占用。不能因为 FP8 输入就假定输出只有 128 B，也不能把 BF16 输出当成内部 BF16 psum。

## 7. 应如何从这些图再推算力、带宽与 minitile

从主图出发，而不是先抛经验系数：

1. KC FP8 一次满阵列发射：128 个不同 activation ×128 列 = 16384 个乘积，consume 一个 16 KiB 权重基本块；全 1 算例每列局部数学贡献为 128。
2. 同一个 weight 基本块为 w 个 token 重放：理想提供 w 次阵列发射，独立 activation 共 `128w` B，权重不同数据仍是 16 KiB，每个 token 需要不同 partial-sum 地址。
3. 若已经独立核对上游权重**平均供给间隔**为 T cycle/block，最简单模型的阵列发射利用上界是 `min(1,w/T)`；T 不是 MAC 流水深度，不是每笔 weight 首读延迟，也不是固定 RTL 常数。
4. activation 的空间广播、AL1 沿 CO 重放、WL1 沿 token 重放、OL1 沿 CI 累计，是四种不同机制。把箭头都叫“cache reuse”会失去真正的约束。
5. w 增大增加 weight 的时间复用，也增加 OL1 地址占用和 AL1 驻留。c 增大增加 AL1 持有的 CI 基本块并减少部分切换，但并不增加阵列单拍 CI 宽度。k 增大扩展所遍历的输出列块，不能把现有物理 ALU 数翻倍。
6. 把 PE 数据通路、OL1 反馈、DFO 窄输出都画出后，才能合理讨论为什么“w够大能填满WL1供数空档”仍不保证 kernel 满吞吐。

功耗/时钟/峰值只可在明确核数、输入 pair 和 `pe_clk` 后换算。例：**条件假设单 core、FP8×FP8、pe_clk=400 MHz**，`16384×2×400e6=13.1072 TOPS`。这是理论 capacity，不是 VCS 或硅上实测；实际部署时钟比须由当前 job 配置验证。

## 8. 作图建议与应保留的限制

建议用同一套颜色：activation 蓝色、weight 橙色、partial sum 与输出紫色、控制灰色。每图同时标 axis、dtype、数量单位和作用范围。

1. **主架构图**：CI 纵轴×CO 横轴的 8×8 PE 网格；左侧一个 CI128 act 向量分 8 条，每条广播到 8 group；顶部/每格 weight 数据；每列 group 下方 FP32×8 归约。只展开一个格子到 16 ALU，避免 8192 个小方块淹没阅读。
2. **一个 ALU 放大图**：8 cell×2 FP8 产品→16项 exponent-align tree→norm→UScale optional→FP32 accumulator→OL1 feedback；标出树与跨拍反馈的区别。
3. **CI256 走查图**：t0/t1 两排，每个 PE先累计16+16，再8PE加成256；用符号 Y[m,co] 贯穿所有级。
4. **四 token 复用图**：一份 WL1 weight 被接收 w 次，不用动画暗示重新读 MC；4 个 token 对应 OL1不同地址。C块推进时同一 token 的旧 psum被取回相加。
5. **吞吐/延迟分开图**：多个不同 token/CI 批次在 MAC、tree、norm、OL1 流水重叠；明确 E0 是 accept 边沿，不是指令 issue。
6. **输出精度对比图**：同样16个FP32内部结果，DFO FP8/BF16/FP32为1/2/4个128-bit beat。

限制：normal KC FP8 单块映射已与 weight 路径交叉核对，但未对全部 store mode、dtype 和任意维度的物理地址置换做动态验证；未做全数值 corner-case、未重放 VCS波形、未给出任意 minitile 下绝对指令时延。正文可用上面的语义映射和模块阶段图，但不能把未测行为包装成精确逐周期 trace。

## 逐文件指纹

下表由本次读取的本地文件直接计算，均不包含原始源码副本。

| 相对路径 | SHA256 |
|---|---|
| `rtl/zeus518/zeus_top/zeus_core_top_pwr.v` | `73f8f2a6f7a0f6bb6a2612db10875a160894b4bcd7550d7df8267643172fca40` |
| `rtl/zeus518/zeus_top/pe518_array.v` | `7d3c4d1e98583d3a469df92b413949b948c9cd695b273fa96f3cfb9d54755ff7` |
| `rtl/zeus518/pegroup/pegroup518_x8_top.v` | `9e15ae8a4a7cc43ed007106faa338ad4d135dd4abab5f5a7ec6d1bfefbb11b00` |
| `rtl/zeus518/pegroup/pegroup518_top.v` | `93a6e2d2c8da227da004dd0478516cc91ff96a362541878ffe7e48d3d0385d23` |
| `rtl/zeus518/pegroup/m_pegroup518_top.v` | `17e6c5858a7fee9aa0ce8c47efd9c7c696ae6291d78605e9fb2b7e345754773a` |
| `rtl/zeus518/pegroup/pe518_top.v` | `85c37c00a76a086a44d8f1921cb62f5e50cc614f5f910c2ab3756283c86c3ab8` |
| `rtl/zeus518/pegroup/pe518_alu.v` | `47c7d1ef6b9864ebe4093260dcd21a9685107057994dd0baf43e33dc15489f37` |
| `rtl/zeus518/pegroup/pe518_mac.v` | `22a161b4a274541cd79b925c4f1fbe9ea62b7fd018d9d789f9dfa09fb3038a87` |
| `rtl/zeus518/pegroup/pe518_alu_ctrl.v` | `67efd29a15325f3266f43cd2365a8a2f1db148927870bb3b0327c169cd49dc4b` |
| `rtl/zeus518/pegroup/pe518_add_tree_wrapper.v` | `e7f367b918f08b7aaaf3c590541a3a31f96247d2572733219ca665259bcd5bce` |
| `rtl/zeus518/pegroup/pe518_add_tree.v` | `a9ad222709c850c578d59df27a7cf3572d2a68503d8cf0254aaf807c351ca194` |
| `rtl/zeus518/pegroup/pe518_add_tree_norm.v` | `1b41780a1efd39564ccaba35d6260b249e37d9d7f83543bd8c0dba637dcc656b` |
| `rtl/zeus518/pegroup/pe518_norm.v` | `1edc05e1abb92779815595615f16c79594a1c9f174580c163e2267abaa2a0e19` |
| `rtl/zeus518/pegroup/pe518_scaling.v` | `4555721daa641297783ab95dfb56f10498a7c8333a4f37e29f1b295eff600da2` |
| `rtl/zeus518/pegroup/pe518_ol1.v` | `0dcffbc901949ee0a37cffb40a53752a0af15f8071813fa74d453c6bdf3a5e9f` |
| `rtl/zeus518/pegroup/pe518_ol1_buffer.v` | `815416955a9474dd9ede4355073aff58554255f7c6cb88d2ac56fe960b1f535f` |
| `rtl/zeus518/pegroup/pe518_ol1_ctrl.v` | `76972f03bc8d29f44e9257e7de402a4c618c13c7abbed65ad8447e15555df11e` |
| `rtl/zeus518/pegroup/pe518_ol1_buffer_ctrl.v` | `01aea4ce3ba7e6eeaa3ab1f8beeab981a7e1841c15f7607746fb6be6f914aac0` |
| `rtl/zeus518/pegroup/pe518_al1_mt_coord_cal.v` | `e892c578ddae91c3c31b85b75db16c9e7465b748b75efb9b006b5b18f5fafd13` |
| `rtl/zeus518/pegroup/pegroup518_sum.v` | `711143242330e5d61290e1c16720e7ad1a550265fdbb9744a214494c4502a29c` |
| `rtl/zeus518/pegroup/pegroup518_fp32x8_sum.v` | `121a8a4431b856efa3472503dccdcc27ac462f8c639b18f907abcf4b06a50bf9` |
| `rtl/zeus518/pegroup/pegroup518_fp32x8_alu_sum.v` | `f2ed469ca49d368caa38bc8b80155cd7c28c3a7964fb163d0dcf46193c611811` |
| `rtl/zeus518/pegroup/pegroup518_dt.v` | `e7ce490d584a77c69226ff4cf3bd152a218ed6e2183678fc0617c617e0b34cfb` |
| `rtl/zeus518/common/fp32_sum.v` | `6e16fd2826797042f66826ef0c412f1898b87ba5e0641d5ff90c20f39236a21d` |
| `rtl/zeus518/pe_ctrl/pe_ctrl_logic.v` | `f52913bf2bbd4cba3b85974cbe67fedd6874466f2dc42e0bd5deafe94db9eb7e` |
| `filelist/filelist_pegroup518_top.f` | `743a9e51838fbca0e57fd731cb2f6a7e827f499871db9c14b812797aaa7ca132` |
