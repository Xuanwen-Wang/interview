# PE activation 数据通路：从 128 B 入口到 128 路输出复用

核对日期：2026-10-25。本文为只读 RTL 静态证据与由位宽、实例和地址表达式直接得到的推导，没有运行 CycleSim、VCS、RTL 或硅上测试。业务仓库没有修改。

来源根目录用逻辑名 `design/` 表示，避免公开个人工作目录。该目录不是 git 仓库；`design/README.md:9–23` 声明其为 `tag_PN100_R1_20250928` 的部分本地副本，并列举差异。本文以末尾逐文件 SHA256 绑定读取内容，不声称重新认证了完整 tag。编译器当前 HEAD 为 `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`，但下述事实来自 RTL，不能把编译器 SHA 当 RTL 版本。

## 阅读起点与术语

本文主例是 **KC split、FP8 activation × FP8 weight、无 tail**。矩阵使用 `Y[M,N] = A[M,C] × B[C,N]`，避免 GEMM 的 K 与硬件 K 混淆：硬件 `W` 对应 token/行 M，`C` 对应输入通道/归约维，`K` 对应输出通道 N。

“一个 PE”特指 `pe518_top` 实例；一个 core 有 8 个 pegroup，每 group 有 8 个这样的 PE。单 PE 里面有 16 个 ALU，每 ALU 有 8 个 MAC cell。网站总览图应画清这一层级，不能把整个阵列、pegroup、PE、ALU 都简称 PE。

<a id="pa-entry"></a>

## 1. “一拍读 128×1 act”的精确定义

| 接口 | RTL 位宽 | 时钟/条件 | FP8 解释 |
|---|---:|---|---|
| L2 → PE controller | 1024 bit = 128 B | `core_clk`，`i_rd_dvld && o_rd_drdy` 成功握手 | 一个 token 的 128 个连续 C 元素 |
| controller → 一个 PE index 的 dispatch lane | 128 bit = 16 B | `core_clk`，8 个不同 lane | 该 token 的 16 个 C 元素 |
| 一个 PE 的 AL1 → 16 个 ALU | 128 bit = 16 B | `pe_clk`，valid/ready | 同一份 16 元素向 16 个 ALU 广播 |
| 一个 ALU → 一个 MAC cell | 16 bit = 2 B | `pe_clk`，成功 MAC 输入握手 | FP8 对应两个 C 元素 |

直接证据：

- `design/rtl/zeus518/pe_ctrl/pe_ctrl_logic.v:499–515`：`pe_ctrl_rd_data` 的 `core_clk` 和 `i_rd_data[1023:0]`。
- 同文件 `:653–675`：数据寄存器由 `i_rd_dvld && o_rd_drdy` 更新，`o_rd_drdy = data_reg_ready || !data_reg_valid`。
- 同文件 `:2286–2295`：顶层 L2 读数据、72 bit ECC、ready/valid、地址和 8 bit strobe。
- `design/rtl/zeus518/l2buffer_ctrl/rtl/z518_l2_l2buffer_ctrl.v:640–662`：PE 是 L2 的 `master3`，实例连接 `zeus_lb_clk` 与 `zeus_core_clk`，并接入 request/grant。

所以 **128 B/成功接口拍**是确定的；“持续每拍都能拿到”还要求 L2 供数、仲裁、跨时钟 FIFO、下游 credit 都不造成气泡。1024 bit 不是 1024 byte，更不是 128 个 BF16：BF16 每拍是 64 个元素。`core_clk` 的一拍也不能无条件等同于 `pe_clk` 或 profiler trace 一拍。

同文件 `:181` 的计数注释明确写出：非 BF16 为 128C 单位，BF16 为 64C 单位。`pe518_al1_mt_coord_cal.v:189–202` 用实际表达式再次确认 KC C 单位为 64/128。

<a id="pa-distribution"></a>

## 2. 从一个 128 B 向量到整核：分片一次，广播两层

KC 模式的逻辑映射可写成：

```text
A[m, c0 : c0+128]                  128 个 FP8，L2 只读一次
  ├─ lane p=0: A[m,c0+  0 : c0+ 16] ─┬─ group 0, PE 0 ─ ALU 0..15
  ├─ lane p=1: A[m,c0+ 16 : c0+ 32]   ├─ group 1, PE 0 ─ ALU 0..15
  ├─ ...                             ├─ ...
  └─ lane p=7: A[m,c0+112 : c0+128]   └─ group 7, PE 0 ─ ALU 0..15
                                      ↑ 右侧以 lane p=0 示范；其他 p 同样广播
```

准确的二维网格应是：group 维映射不同输出 N 区段；PE index p 维映射不同 C 分片。每个 group 的 8 个 PE 消费相同 128C 向量的不同分片，之后沿 C 合并部分和。每个 PE 的 16 个 ALU 对应不同输出列，使用同一份 activation，读取各自 weight 片段。

### 分片：8 个 16 B lane

`pe_ctrl_logic.v:938–956`：KC 下，对 lane `i` 写入的是 `buffer_data[127+i*128 : 0+i*128]`。控制器会先收集最多 8 次 L2 返回，并对每 lane 存成 8 个 128 bit word，然后逐 word 发出（`:840–866`、`:972–1012`）。这是一段重排/缓冲流水，不能把输入向量在同一个绝对时刻“组合直通”到 MAC。

`ymode=0` 的 KW 分支不同：`:954–955` 把完整 1024 bit 返回分配给选中的 PE index；之后该 PE 分时消费 8 个 16 B word。KC 图中的 C 方向分片解释不能未经调整套给 KW。

### 第一层广播：同一 lane → 8 个 group

`pe_ctrl_logic.v:4173–4204` 将 `pegx_pe0_act_data` 原样连到 group 0..7 的 PE0。PE1..7 也有同样连接（`:4206–4434`）。因此 8 个 group 消费的是复制后的同一个 C 分片，而不是 8 次独立 L2 读取。

### 第二层广播：一个 PE 的 AL1 → 16 个 ALU

`pe518_top.v:201–218` 在 `for(i=0;i<16;i++)` 中，所有 ALU 的 `i_act_data` 都接同一个 `w_al12alu_act_data`，但 weight 接 `i_wl12pe_weight_data[128*i+:128]`。

`pe518_alu.v:82–97` 再把 act 与 weight 各切为 `16*i +: 16` 送到 8 个 MAC cell。

于是 FP8 主例中，**在各 group 均就绪、计算事件理想对齐的吞吐口径下，每个 A[m,c] 被 8 group × 16 ALU = 128 个输出列复用**。这才是 128 B activation 能支持 16,384 MAC 的原因；它不是从 L2 读出 16 KiB activation。各 group 的实际握手可能因反压而错开，广播关系不等于无条件同拍完成。

输出列归属与 weight formatter 的独立切片复核一致：`g` 对应 CO 区段 `16g…16g+15`，ALU `a` 对应其中 CO `16g+a`。实际字节 packing 与 `W[37,73]` 的可复算走查见 [weight 路径证据](pe-weight-rtl.md#pw-mapping)，不把逻辑矩阵示意当作未经重排的外存 ABI。

这个“128 倍”指乘法操作数扇出，不是 L2 带宽被硬件免费扩大为 128 倍。实际计算拍仍需等 weight 和流水 ready。

<a id="pa-capacity"></a>

## 3. AL1 的实际组成与容量

每个 `pe518_top` 仅实例化一份 `pe518_al1`，它内部有两个单口 SRAM：

- `pe518_al1.v:112–130`：`pe_al1_buffer_ping` 与 `pe_al1_buffer_pong` 两个 wrapper。
- `pe518_al1_sram_sp_128x64_wrapper.v:7–18`：`DATA_WIDTH=128`、`DEPTH=64`、`ADDR_WIDTH=6`。
- 单块容量 `128 bit × 64 = 1024 B = 1 KiB`；每 PE 的 ping+pong 为 2 KiB。
- 64 个 PE 的 **物理总量**为 `64 × 2 KiB = 128 KiB`。
- KC 下 8 个 group 有 8 份相同 activation 副本，扣除这种广播复制后，每个 ping/pong 面的不同字节容量是 `8 PE × 1 KiB = 8 KiB`；两面最多 16 KiB。若两个面存同一 C tile，独立数据还会更少。

这里必须分别标出“物理 SRAM 容量”和“不同 activation 可驻留容量”。前者适合解释芯片面积/扇出，后者用于判断是否能避免 L2 reload。

它们是单口 SRAM，不是一个随意并发读写的双端口 2 KiB cache。`pe518_al1_wrctrl.v:295–303` 明确在各 buffer 内选择写地址/读地址；ping/pong 的意义是允许某一面被消费时另一面接受后续数据，仍受所有权和 credit 约束。

<a id="pa-address"></a>

## 4. 先看地址，再引出 minitile：为何 w×c≤64

硬件字段 `MTW/MTC/MTK` 为长度减一。下文小写 `w,c,k` 是实际长度，不是原始字段位值。

### 装入与读取采用不同顺序

L2 装入的 KC 局部顺序中 C 最快、W 次之：`pe_ctrl_logic.v:207–216` 的 enable 链与 `:241–267` 的计数器相连；因此一个 PE 的 SRAM 可以视为 `A_local[w][c]`。

AL1 计算读取则 **W 最快，再 K，最后 C**：`pe518_al1_mt_coord_cal.v:290–298`。实际读地址为：

```text
rd_sram_addr = mt_coordinate_w_r * curr_mt_c_len + mt_coordinate_c_r
```

证据：同文件 `:399–403`。地址完全不含 `k`，因此不同输出 K block 重读相同 A 元素；这是从 RTL 直接可见的 activation 复用。

例：`w=4,c=2,k=2`，某个 PE 的 AL1 存 8 个 16 B word：

| 地址 | 内容 |
|---:|---|
| 0,1 | token 0 的 C block 0、1 |
| 2,3 | token 1 的 C block 0、1 |
| 4,5 | token 2 的 C block 0、1 |
| 6,7 | token 3 的 C block 0、1 |

计算读取次序：

```text
C block 0, K block 0: addr 0,2,4,6  // 4 个 token 配同一 weight block
C block 0, K block 1: addr 0,2,4,6  // A 再用一次，换输出列的 weight
C block 1, K block 0: addr 1,3,5,7  // 下一段 C，更新相应 psum
C block 1, K block 1: addr 1,3,5,7
```

这些是有序成功计算事件，不是无条件连续 wall-clock 拍。任何 weight/AL1/OL1 反压都可插入空拍。

因为 SRAM 地址只有 6 bit，满 KC minitile 的有效地址需要 `w*c≤64`。FP8 一个 core 每个 C 基本块对应 128 个 C 元素，所以：

```text
整核不同 A 字节 = w × c × 128 B ≤ 8192 B = 8 KiB / buffer
单 PE A 字节    = w × c × 16 B  ≤ 1024 B = 1 KiB / buffer
```

这应是网站介绍 minitile 的起点：先让读者看到真实 SRAM 和下标，再解释 w/c 调整，不要先甩出约束常数。

<a id="pa-residency"></a>

## 5. 两种复用要分开：minitile 内 k 重读与外层 K tile 的 flag-only

### minitile 内

上节地址没有 k：同一局部 SRAM 内容供 `k` 个输出块反复消费。它不要求再次 L2 读取。

### 外层 K tile

`pe_ctrl_logic.v:3947–3948` 用整条指令的 C 范围及 minitile C 长度，判定它需要一块还是两块 C minitile。`minitile_k_cnt` 是外层 K minitile 计数，不是上节的 minitile 内 k 计数。

精确条件在 `:353`：

```text
flag_only = (one_cmtile && minitile_k_cnt >= 2)
         || (two_cmtile && minitile_k_cnt >= 1)
```

| 当前 W 区段需要的 C minitile 数 | 初始加载 | 后续外层 K minitile |
|---|---|---|
| 1 | 前两个外层 K minitile 将同一 A 分别放入 ping 和 pong | 第三个开始仅发 flag，交替读已有副本 |
| 2 | 第一个外层 K minitile 将 C0/C1 分别放入 ping/pong | 第二个开始只发 flag，轮流消费 C0/C1 |
| >2 | 两面无法保留全部 C 工作集 | 本条件不启用 flag-only，需要重新读取/覆盖 |

边界：若整个 K 只有一块，不会为了复用主动多填另一面；表格描述的是确实存在后续 K minitile 时的行为。外层 K 遍历完成后，`:286–302` 将 `minitile_k_cnt` 清零，因此后续 W 区段不会误复用前一组 token 的数据。

flag-only 并非“什么都不发”：

- `:475–483`：`!flag_only` 才产生真实 L2 read request。
- `:680–690`：flag-only 不等待 L2 返回，生成控制信息。
- `:1066–1067`：`pe_act_en = send && !pe_out_only`，而 `pe_act_flag` 仍发送。
- `pe518_al1_wrctrl.v:106–142`：flag 切换 ping/pong、标记数据 ready、清零写地址；只有 act_en 才真正写 SRAM。因此保留原数据内容。

网站不应简化为“只要 AL1 装过一次，就能一直复用”；两面初始内容、C tile 数、W 区段和命令生命周期都属于前提。

<a id="pa-flow-control"></a>

## 6. credit 归还的是“可复用 buffer”，不是每个 16 B word

`pe_ctrl_logic.v:1043–1067` 为每个 PE index `i` 和 group `k` 保持一个 credit，初始值为 **2**，对应两面 AL1：

1. 一个 minitile 的 `pe_act_flag[i]` 发出时，所有目标 group 对应的 credit 减一。
2. 每个 group 的 `pe_act_accept[i][k]` 返回时，该目标 credit 加一。
3. 同拍发送 flag 和接到 accept，计数不变。
4. `pe_out_ready[i]` 要求 8 个 group 的 credit 全非零，所以最慢的一个目标 group 可以反压该 broadcast lane。

真正返回 accept 的事件在 `pe518_al1.v:220`：

```text
o_peg2pec_pe_act_accept = al12alu_act_data_hs && o_al12alu_mt_end
```

其中 `al12alu_act_data_hs = valid && ready`（`:177`）。这代表该 minitile 的最后一个 activation 已被 MAC 入口接受，而不是“写进 AL1 就返还”、也不是“地址发出就返还”。命令 accept 另由最后 tile 的握手产生（`:223`）。

注意这不表示整条 PE 指令已经完成：后面还存在乘法、加法树、scale、OL1 累加、跨 PE 合并和输出写回流水。复用 A buffer 的安全边界和输出完成的安全边界不同。

### 明确跨时钟边界

`pegroup518_top.v:370–420`：每个 PE 有 AL1 command 异步 FIFO 与 130 bit activation 异步 FIFO，后者搬运 `{act_en,act_data[127:0],act_flag}`，从 `i_crm2peg_core_clk` 到 `pe_clk`。`act_en || act_flag` 即可写入 FIFO，因而 flag-only 能跨域。

`:424–435` 再用 pulse CDC 将 act_accept 从 pe_clk 送回 core_clk。因此 credit 返还天然含跨域时延，不能只看 AL1 SRAM 的一拍读延迟推整条供数节拍。

### AL1 遇到缺 weight 会怎样

`pe518_alu_ctrl.v:157–162`：

```text
pipe_valid[0] = weight_vld && act_vld && alu_cmd_rdy
act_rdy       = pipe_ready[0] && weight_vld && alu_cmd_rdy
weight_rdy    = pipe_ready[0] && act_vld && alu_cmd_rdy
MAC handshake = pipe_valid[0] && pipe_ready[0]
```

只有 A、B 和下游同时可用，才消费这一对数据。`pe518_al1.v:170–185` 用 `!act_valid || act_ready` 允许读地址推进，否则保留当前有效数据。不能按“AL1 可以每拍读”就断言 MAC 每拍一定计算。

<a id="pa-psum-boundary"></a>

## 7. activation 本身不被累加；C 归约产生 psum

应画两条颜色不同的路径：A 从 AL1 读出，广播后参与乘法；乘积走加法树/OL1，而不是让 A 在 AL1 中边读边被修改。

AL1 只读出 A，同时携带控制标记。`pe518_al1_mt_coord_cal.v:432–451` 根据 C 遍历产生 acc_en 的切换事件；`ol1_switch = mt_last_point && tc_end`（`:417`）表示当前输出块的 C 归约已经走完。`pe518_alu_ctrl.v:232–236` 在对应有效数据被接收时将该事件翻转为持久的 `o_scaling_acc_en`。因此 `o_acc_en` 不是一个应直接逐拍照搬为“当前需要累加”的恒定 bool，而是有流水对齐的控制事件。

完整的部分和数值位宽、OL1 FP32 accumulator、8 个 PE 的 C 方向合并，应由对应算术通路证据解释；本文不凭 A 路径的 128 bit 接口推断 FP32 累加。

<a id="pa-budget"></a>

## 8. 从数据流推算带宽，而不是把数字先贴到图上

FP8 KC 主例，一个有效阵列计算步消费 `A[1,128]` 与 `B[128,128]`，执行 16,384 MAC。

| 量 | 数值 | 解释 |
|---|---:|---|
| 不同 activation 数据 | 128 B | 8 个 PE index 各 16 B |
| 64 份 AL1 合计本地读出 | 1024 B/有效 pe_clk 拍 | 8 个 group 的物理副本；不能当 L2 流量 |
| ALU 内部 MAC 入口的 A operand 总投递 | 16 KiB/有效拍 | 上一项再向 16 个 ALU 广播；不能当 SRAM 独立读流量 |
| 该步不同 weight 数据 | 16 KiB | 128×128 FP8；由 weight 侧证据补齐 |
| MAC 总数 | 16,384 | 128C×128N，不等于单个 MAC 的串行 FMA 次数 |

在 `core_clk = pe_clk = 400 MHz` 的**示例配置**下，L2→controller 入口位宽上限是 `128 B×400MHz = 51.2 GB/s`。实际持续带宽需要测量；频率和无气泡假设必须与图一起标出。

当一个 16 KiB weight block 在 w 个 token 间复用时，w 个有效计算拍需要 `128w B` 不同 A，而 W 的平均供数需求下降为 `16 KiB/w` 每有效拍。A 的读取地址说明“为何 token 的 A 要换，weight 可以不换”；外层 k 的 A 复用又说明“为何输出列换了，A 可以不换”。这两条正交复用关系是 AL1/WL1 平衡的起点。

若要比较 WL1 条件模型 `46/15` cycle/16KiB，必须另核实其时钟、credit 周转、wafer mode 和实际部署。本证据仅确认 activation 侧，不把该研究模型称为硅片定值。

## 9. 可直接落地的插图组织

1. **整核二维矩阵图**：横向 8 个 group，标输出列 N；纵向每 group 8 个 PE，标 C 分片。A 从左侧 8 根 16 B 线横向广播，weight 从上方分别落入各块，psum 向下归约。
2. **单 PE 放大图**：AL1 ping/pong（各 64×128 bit）→一条 128 bit 广播线→16 个 ALU；weight 2048 bit切为16×128 bit；每 ALU 放大为8×16 bit MAC入口。
3. **真实 A 的“颜色追踪”图**：固定 token m、C元素17，穿过L2 lane1、8group PE1、各16ALU；以不同 B[c,n] 乘出不同输出列的贡献。标明广播而非额外读取。
4. **地址热图**：w=4,c=2,k=2 的 8 个 SRAM 地址，切换 C/K 控件高亮 0,2,4,6 或1,3,5,7；相邻K切换不改变A地址。
5. **ping/pong所有权图**：真实write与flag-only使用不同箭头；最右列显示最后MAC握手→CDC→credit+1，不把输出写回完成放在同一个事件上。

## 10. 尚不能由本次静态读取直接确认的量

- 具体部署中 L2 仲裁后持续供数速率和实际 `core_clk:pe_clk` 比值。
- 用户所说“3 cycle”在其当前任务中的实际测量口径；weight agent 应独立核实。
- 每个 SRAM 宏实际硅后时序、功耗和布局距离；本文只分析 RTL 逻辑结构。
- 所有 shape、tail、KW 配置以及 dtype 组合下的长期供数和数值行为。这里未执行硬件测试。

## 文件快照

下表由本次读取文件计算 SHA256，供之后复核差异。行号与上文对应。

| 文件（相对 design） | SHA256 |
|---|---|
| `README.md` | `6e983e5ee115a7965099de957279b5bd0a700bb98eb7d7856f12464a88b90a49` |
| `rtl/zeus518/pe_ctrl/pe_ctrl_logic.v` | `f52913bf2bbd4cba3b85974cbe67fedd6874466f2dc42e0bd5deafe94db9eb7e` |
| `rtl/zeus518/l2buffer_ctrl/rtl/z518_l2_l2buffer_ctrl.v` | `44a2022879adef52e1b1d7dfdd03983ff836fb7825c981a492e6874d624bd05e` |
| `rtl/zeus518/pegroup/pegroup518_top.v` | `93a6e2d2c8da227da004dd0478516cc91ff96a362541878ffe7e48d3d0385d23` |
| `rtl/zeus518/pegroup/pe518_top.v` | `85c37c00a76a086a44d8f1921cb62f5e50cc614f5f910c2ab3756283c86c3ab8` |
| `rtl/zeus518/pegroup/pe518_alu.v` | `47c7d1ef6b9864ebe4093260dcd21a9685107057994dd0baf43e33dc15489f37` |
| `rtl/zeus518/pegroup/pe518_alu_ctrl.v` | `67efd29a15325f3266f43cd2365a8a2f1db148927870bb3b0327c169cd49dc4b` |
| `rtl/zeus518/pegroup/pe518_al1.v` | `5f35c60924b10919c20575c72e3c557b525835133e12056a42f642010ccfa887` |
| `rtl/zeus518/pegroup/pe518_al1_wrctrl.v` | `9b89503aaa9593d2342a5c780e688670620a243b8f4e5dfa2be69c996901cdeb` |
| `rtl/zeus518/pegroup/pe518_al1_mt_coord_cal.v` | `e892c578ddae91c3c31b85b75db16c9e7465b748b75efb9b006b5b18f5fafd13` |
| `rtl/zeus518/pegroup/pe518_al1_sram_sp_128x64_wrapper.v` | `57e6f281ae6ae5079eb48b58019cf4acee13bb7f59309b1461991cbd63022460` |
