# PE weight 路径：从一个 FP8 128×128 权重块到 MAC

核对日期：2026-10-25。仅阅读本地 RTL 参考副本与版本化 packing 实现，没有编译业务代码，没有执行 CycleSim、VCS 或硅后测量。文中的坐标推导用整数标签检查，不能当作 RTL 动态验证。

<a id="pw-scope"></a>

## 1. 版本、范围与术语

- `triton_shared` 固定版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。本次使用的 `sim_check/sim_framework/weight/transform.py` 相对该版本无工作区修改。
- `design` 不是 git 仓库。README 声明是 `tag_PN100_R1_20250928` 的部分参考副本，并列出差异；下面给出每个被引用文件的 SHA256。本轮未连接远端证明它等同整棵 tag。
- 主例限定 **KC、FP8 activation × FP8 weight、normal weight store、dual hub、一个完整 128 CI ×128 CO miniblock、无 UScale/索引额外流量**。KC 的硬件 `C` 对应 GEMM reduction/CI，硬件 `K` 对应 GEMM output/CO；不要把硬件 K 与数学 GEMM K 混用。
- `g=0..7` 是 PE group，`p=0..7` 是 group 内 PE，`a=0..15` 是 PE 内 ALU，`j=0..7` 是 ALU 内 MAC cell。并非 8 个 NPU core。

<a id="pw-structure"></a>

## 2. 最适合先画清楚的结构

```text
一核：W[128 CO,128 CI]，FP8，共 16 KiB
  └─ 8 个 PE group，各负责 16 个 CO，各有一个 WL1 控制路径
      └─ group g 的 W[16g:16g+16,0:128] = 2 KiB
          ├─ 两个 hub，每个 hub 扇出到 16 个 MC
          ├─ 两轮读取，每轮 2 hub ×16 MC ×32 B = 1 KiB/group
          ├─ 格式重排：2 KiB 按 CI 段散给组内 8 个 PE
          └─ PE p：W[16g:16g+16,16p:16p+16] = 256 B
              ├─ 16 个 ALU，每个独立取 16 B weight
              ├─ 同一个 16 B act 广播给这 16 个 ALU
              └─ ALU a：W[16g+a,16p:16p+16]
                  └─ 8 个 MAC cell，每个取两个 FP8 weight 与两个 FP8 act
```

RTL 端口闭环：

1. `pegroup518_top.v:370–494` 实例化 8 个 `pe518_top`；`:528–655` 实例化本 group 的 `wl1_518_top`，八路 2048-bit weight 分别接八个 PE。
2. `pe518_top.v:30–32` 的 weight 输入为 2048 bit，act 输入在 `:25–27` 为 128 bit。
3. `pe518_top.v:201–236` 实例化 16 个 ALU；`:216` 给 ALU a `weight[128*a+:128]`，`:217` 将同一个 `w_al12alu_act_data` 接到全部 ALU。因此 **weight 按 CO 分片、act 在 16 个 CO 间广播**，不是给 ALU 广播同一个 weight。
4. `pe518_alu.v:82–100` 实例化 8 个 MAC；`:90–91` 同时切 weight 和 act 的 `16*j+:16`。
5. `pe518_mac.v:308–327,362–379` 拆解上下两个 FP8 字节；FP8 模式只有 data0/data2 对应有效乘积，data1/data3 恒零。

逻辑上每个 ALU 是一个 dot16，PE p 产生 16 个 CO 对应的 CI 局部和；同一 group 的 8 个 PE 覆盖 128 CI。组内结果归约路径在 `pegroup518_top.v:684–720` 接到 `pegroup518_sum`，数值格式和累加细节由独立的计算路径证据核对。不要把这个 128×128 图画成每个独立 cell 都拥有一个 FP32 累加器的二维 systolic array。

<a id="pw-mapping"></a>

## 3. 一块权重的地址到底怎样分配

### 3.1 先从软件 packing 确定矩阵语义

`transform.py:16–51` 接受 `weight_2d[K,C]`。normal FP8 的小块参数为 `(k1,c1,k0,c0)=(8,1,16,128)`，输出排列为 `[k_block,k_group,c_group,k1,c1,k0,c0]`。完整 128×128 的单块就是 `[8,16,128]`，按 group 顺序存放，每个 group 是 16 CO ×128 CI。这个单块看起来与 row-major 相同，但跨多个 C/K 小块时不能忽略 7D reorder。

### 3.2 给每个字节一个可追踪坐标

在 group g 内，权重 `W[16g+a,16p+c]`，其中 `c=0..15`，位于：

```text
group 内字节偏移 = 128*a + 16*p + c
请求轮 r          = a // 8                   ∈ {0,1}
hub h             = (a % 8) // 4            ∈ {0,1}
MC 编号           = 4*(a % 4) + p//2        ∈ [0,15]
MC 32B 返回内偏移 = 16*(p % 2) + c          ∈ [0,31]
```

核对等式：

```text
1024*r + 512*h + 32*MC + byte_in_MC = 128*a + 16*p + c
```

含义：同一个 MC 的一笔 32 B 数据含某一 CO 的 32 个相邻 CI，后续被分成两个 PE 各 16 B；下一轮读取覆盖另外 8 个 CO。group 中两个 hub 并非各负责一个 PE，也不是把完整 2 KiB 复制到两边。

例：`W[37,73]`。

- `g=2, a=5, p=4, c=9`，属于 group 2 的 CO 37 和 PE 4 的 CI 64..79。
- group 内偏移 `5*128+4*16+9=713`。
- 请求轮 0、hub 1、MC 6、MC 返回内第 9 字节。
- 重排后是 PE 4 的 weight 字节 `5*16+9=89`，ALU 5 的第 9 字节。
- 最终送到 ALU 5 的 MAC cell 4 的上字节，与 `act[73]` 相乘；同 cell 下字节处理 `W[37,72]*act[72]`。

### 3.3 地址选择与返回拼接的 RTL 证据

- `wl1_518_weight_ctrl.v:1252` 删除全局地址的 group 选择位 `[13:11]`，形成 group 内地址；`:1377–1386` dual-hub 每轮地址增加 `0x400`，末轮计数为 1，所以是 **轮 0、轮 1 两轮**。single-hub 增加 `0x200`，末轮为 3，所以四轮。
- `wl1_518_weight_rd_ctrl.v:157–177` 删除 hub 选择位 `[9]`，普通 weight 同时选择两个 hub `2'b11`；索引块读取是另一种选择，不能套用本主例。
- `wl1_518_hub_weight_req_distribute.v:49–68` 将 hub 读请求分发给 16 个 MC，地址删除 MC 选择位 `[8:5]` 及 32B beat 内字节位。
- 同文件 `:76–83` 仅当 `&i_mc_weight_rd_dvld[15:0]` 成立时发出 4096-bit hub 返回；每个 MC 对应返回总线的连续 256-bit 段。这里是等待 16 路数据都可用后共同弹出，不要求所有 MC 的物理完成时刻完全相同。
- `wl1_518_weight_rd_ctrl.v:286–305` 用选择记录 FIFO 保持返回路由顺序；dual-hub 只有两个 hub 都 ready-to-return 才拼 `{hub1[4095:0],hub0[4095:0]}`，形成 8192 bit=1 KiB。

### 3.4 重排器把两轮数据拼为 8 个 PE 的 256 B

`wl1_518_weight_data_format.v:581–588` 在第 0 轮为 PE p 提取下面八个 128-bit 段，按低到高的顺序：

```text
input[  0*1024 + 128*p +:128]
input[  1*1024 + 128*p +:128]
input[  2*1024 + 128*p +:128]
input[  3*1024 + 128*p +:128]
input[4096+0*1024 + 128*p +:128]
input[4096+1*1024 + 128*p +:128]
input[4096+2*1024 + 128*p +:128]
input[4096+3*1024 + 128*p +:128]
```

即每个 PE 从 1 KiB 返回里抽取 8 个 CO ×16 CI=128 B。第 1 轮做同样的抽取；`:661–668` 将第 1 轮的 128 B 放高半部、第 0 轮的 128 B 放低半部，形成该 PE 的 256 B。`:1013–1024` 对 KC 选择 `w_mode_1_weight_out_fifo_data[p]`。所以 PE p 最终看到 16 个相邻 CO，各包含它自己的 16 CI。

这段 RTL 上方有 `// KW` 注释，但实际 selector 同时用于 KC 与 KW。判断路径必须看 `INST_YMOD`，不能只看这条注释。KW 会把同一个被选中的 256 B weight 送给八个 PE，利用的是另一种空间复用；不能把 KC 的 CI 切分图直接用来解释 KW。

本次独立整数标签检查从 `:581–588` 的真实 slice 表达式提取起点，并枚举 `8g×8p×16a×16c=16384` 字节，所有目的字节与上面的矩阵坐标相同，物理路由无重复无缺失。这只是 **源码 slice/坐标代数检查**，不是模拟 RTL 的握手、时钟或数值。

<a id="pw-replay"></a>

## 4. WL1 是怎么复用 weight 的

### 4.1 真正保存和重放的位置

`weight_data_format.v:1031–1049` 为八个 PE 各实例化一个 **2048-bit、深度 2** 的 output FIFO。各 FIFO 的头部直接连到对应 PE weight 端口（`:1166–1173`）。这一级合计每 group 4 KiB 存储、全核 32 KiB；这只是该级 FIFO 容量，**不是完整 WL1 或片上 weight 存储总容量**。前面还有 hub read buffer、返回 pipeline 和重排暂存。

读取一份新 weight 之后，输出 FIFO 头部不立刻 pop。`:1130–1144` 的 `r_mtw_cnt` 每完成一轮消费才递增；`:1146–1147` 只有 `r_mtw_cnt >= internal_mtw_cnt_max` 才共同弹出 8 个 FIFO。非尾 minitile 的 `internal_mtw_cnt_max=INST_MTW`（`:264–265`），即字段编码 `w-1`。

例如 w=4：同一个 16 KiB 物理块依次与 4 行 activation 相乘。每个输出 FIFO 的同一个 256 B 头部可以被 PE 读取 4 次；第四次消费结束才 pop，新 weight 才成为头部。**复用主要发生在 WL1 formatter 输出 FIFO 的保持/重放，不需要每个 MAC 独立存 4 份权重。**

### 4.2 “一次消费”不等于无条件的一个时钟

输出采用 `wl1_518_req_distribute_fsm`：

- `weight_data_format.v:1058–1065` 选择全部 8 PE。
- `req_distribute_fsm.v:49–59,80–114` 在全 ready 时 bypass；若部分 PE 提前接受，FSM 记住尚未接受的对象，只对它们继续 valid，避免重复发给已接受的 PE。
- 所有选中 PE 接受完当前呈现，`wl1_weight_rdy` 才完成 group 级握手并推进 replay 计数。
- PE 本身的 `pe518_alu_ctrl.v:159–162` 要求 weight valid、act valid、ALU command ready 与 pipeline ready 同时满足才计算。

所以理想无 stall 才是 w 个连续 PE clock；有 AL1 未就绪、OL1/backpressure 等等待时，replay 的第 4 次完成可能远晚于第 4 个时钟。建议图中画 **accepted beat 0/1/2/3**，另用空白灰格表示等待，不要把所有等待归咎于 weight 带宽。

### 4.3 下游 stall 怎样逆向影响外存

当任意 output FIFO full，最后一轮重排不能写入（`:495–497`）；它进一步反压返回 pipeline 与 hub read buffer。MC 读返回本身没有普通消费者反压，因此用返回 FIFO 和 outstanding credit 防止溢出。

重要细节：`gdg_rdata_buffer.v:37–38,54–60` 的 `rdata_buffer_received` 是 **aclk 侧返回 FIFO 的 `valid && ready`**，不是 MC 侧数据第一次出现。`gdg_flowctrl.v:33–40` 到这个事件才回收读 outstanding。下游不能消费返回时，即使 DRAM 已经完成读，credit 仍被占用，新的请求会更早停住。这直接把 PE/formatter 的背压反馈到 MC 供数率。

<a id="pw-bandwidth"></a>

## 5. 三层带宽，不是一个“3 cycle”

### 5.1 WL1 formatter → PE 的瞬时通路

每 group 8 PE ×256 B =2 KiB/accepted PE beat；全核 8 group = **16 KiB/accepted PE beat**。FP8 下这一份 weight 与 128 个独立 act 元素相乘，得到 16384 个 scalar products。这里的 16 KiB 是 downstream 使用的数据位宽；复用时可以在许多 accepted beats 上重复这 16 KiB，不能直接视为 MC 每拍新返回了 16 KiB。

### 5.2 物理 MC 读口的聚合位宽

dual-hub 的 8 group ×2 hub ×16 MC =256 个 MC，每个 read beat 256 bit=32 B。全部 MC 每拍都返回一笔、完全对齐且没有额外流量时，上游聚合为 **8192 B/MC-cycle**，收集一份全核 16 KiB weight 需要两轮。因此“位宽理想下两轮读”和“PE 一拍消费 16 KiB”同时成立，中间由 formatter 拼接并用 FIFO 解耦。

这里应写轮/beat，不把两轮解释为从发起第一笔请求到 PE 可用的完整 2-cycle latency。请求仲裁、流水、请求 CDC、MC 行状态、PHY、返回 CDC、聚合和 formatter 都在 latency 路径上。

### 5.3 credit 限制的条件稳态间隔

`gdg_flowctrl.v:51` 在 `rdata_outstanding>=15` 时停止新请求；`gdg_axi2frame.v:65–98` 的请求在 aclk 接受后经过异步 FIFO 进入 MC 域；返回经 `gdg_rdata_buffer.v:40–60` 的 16-entry CDC FIFO 回到 aclk，真正 pop 才回 credit。

令 R 为 **从消耗一个 credit 到该 credit 可再次使用的平均周转时间**，以同一个时钟域计；令 s 为每 MC 的最大新读发射率。对于纯 weight、平衡并行的流量，条件上界为：

```text
new_weight_B_per_cycle ≤ 256 MC ×32 B ×min(s,15/R)
T_weight_per_16KiB    ≥ 16384 / new_weight_B_per_cycle
```

若另行采用 `s=1`、`R=23`、MC/aclk/PE 有效计数域比例已对齐，则：

```text
T_weight ≥ 2×23/15 =46/15 ≈3.067 cycle/16 KiB
bandwidth ≤8192×15/23 ≈5342.61 B/cycle
400 MHz 时为2.137 TB/s（十进制），单核条件模型
```

15 是直接 RTL 阈值；23 是已有带宽研究对某一 MC/CDC 配置作出的周转假设，本次没有运行波形重新量测它。README 的 VCS 配置还涉及行为 PHY 与刷新关闭，不能把这组上界说成硅上持续实测。若 R、时钟比、行命中、刷新、仲裁、UScale、写流量或下游背压变化，都要重新代入。

“3 cycle 进来一块 128×128 FP8”可以用于说明 **流水填满后的平均供给间隔约 3.07 cycle**，不能说单个请求发出 3 cycle 后就可算，也不能说每 3 个离散 cycle 固定到一整块。

### 5.4 为什么 w 是关键，而不是因为 weight 突然读得更快

在上述条件模型、完整 KC FP8 小块、AL1/OL1 均不额外限制、无重读/额外流量时：

```text
每块计算工作 = w ×16384 MAC
该块至少占用 w 个 PE accepted beat
上游平均每 T_weight 个周期补一块新 weight
稳态 MAC 利用率上界 ≈min(1,w/T_weight)
```

采用 T=46/15，w=1/2/3/4 分别为 32.6%/65.2%/97.8%/100% 的条件上界。w=4 的意义是把“一份权重的 4 次使用”覆盖到供数间隔，**不是**把 MC 带宽提高四倍。w 增大会增加 activation 驻留、OL1 输出位置和其它资源占用，所以还要在结构理解之后再讨论 minitile 与 AL1/WL1 平衡。

<a id="pw-boundaries"></a>

## 6. bank、缓存和额外流量的边界

- 每个 MC 不是一个 2048-bit SRAM bank。`gdg_unit.v:560–572` 将 MC wrapper 配成 256-bit array 数据、13-bit row、7-bit column、`MC_SHORT_MODE=2`。按 128 列×32 B，可得到每个 row 4 KiB 的接口几何。
- `gdg_axi2frame.v:112–139` 根据 `splicing_mode` 使用不同的 bank/row 映射。不能只给出一个 bank bit 就声称覆盖所有 wafer mode。
- `weight_rd_ctrl.v:189–234` 每个 hub read buffer 参数为 `RD_REQ_OTS=32`、`RD_DBUF_DEPTH=4`、`RD_DATA_WIDTH=4096`。这是 hub 侧缓冲配置，与 MC 的 15 outstanding 以及 formatter 的两层 FIFO 是不同层级、不同单位。
- `wl1_518_hub.v:532–590` 和 `wl1_518_hub_mc_req_ctrl.v:258–307` 明确有 din/weight/uscale 三路请求竞争同一个 MC 读口。UScale 并不是免费附带在 weight 的 16 KiB 内；“纯 weight 2.137 TB/s”不等于用户有效 weight 在完整算子中都能达到它。
- BF16 下 16 KiB 对应 128 CO×64 CI；FP8×INT4 则常用 256 CO×128 CI 的 nibble packing。它们不能复用本节 FP8 的全套 CO/CI 字节坐标。INT4 packing 见 `transform.py:86–109`，低/高 nibble 对应相隔 128 的 CO。

## 7. 建议正文图的顺序

1. 先画 **一核 8 group、每 group 8 PE、每 PE 16 ALU、每 ALU 8 MAC**，同时在每层标出 CO/CI 归属。重心是数据归属而不是只乘四个数。
2. 画 128×128 权重矩阵：纵向按 16 CO 切 8 group，横向按 16 CI 切 8 PE，突出一个 16×16 矩形是一个 PE 的 256 B。
3. 放大 group 的 16×128 矩阵，上/下 8 CO 代表两轮；每轮再分两个 hub，每个 hub 4 CO。每行 CI 以 32B 切四个 MC，标 MC 编号即可直观看到 16 MC。
4. 跟踪 `W[37,73]`，用一致颜色连接 request 0/hub1/MC6/byte9 → PE4/ALU5/MAC4 high byte。
5. 用同一份 FIFO 头部的四次 accepted beats，配不同 activation row，解释 w replay 与最后一次 pop；旁边画一处 stalled PE 的分发 FSM，避免把握手误画成无条件同步。
6. 最后才画三层带宽：16 KiB/PE beat、8 KiB/MC ideal beat、credit 条件 5342.61 B/cycle，并解释这三者不矛盾。

<a id="pw-fingerprints"></a>

## 8. 本次来源指纹

下列路径相对各自来源根目录。完整代码只读引用，未复制到本仓库。

| 来源 | 相对文件 | SHA256 |
|---|---|---|
| design | `README.md` | `6e983e5ee115a7965099de957279b5bd0a700bb98eb7d7856f12464a88b90a49` |
| design | `rtl/zeus518/wl1/wl1_518_weight_ctrl.v` | `c88b8edb5bb5dc3af12c5c53f6c74d5841c5f527b5743fef8487ffb7dab9809c` |
| design | `rtl/zeus518/wl1/wl1_518_weight_rd_ctrl.v` | `153d578c98429ed56ca3370bf05715f264871f8e3e90b65322c337e62bea3470` |
| design | `rtl/zeus518/wl1/wl1_518_hub_weight_req_distribute.v` | `fb59dba778b84dabf3481d435439e9ab80ca5d8acc8a8f92ee221f1dd0033f00` |
| design | `rtl/zeus518/wl1/wl1_518_weight_data_format.v` | `d7f88009ed2e45cd098c1ba231f1292ef29aee5db1b16bf22f31d893189d2dac` |
| design | `rtl/zeus518/wl1/wl1_518_req_distribute_fsm.v` | `89684cf126d1ecbb4a8dfc5245f98c6ab130b674a537f1256073aec7d53c4b09` |
| design | `rtl/zeus518/wl1/wl1_518_hub_mc_req_ctrl.v` | `627cc0e0930959cf675cc0117249f315b09578b91744bbb895948413960a5e55` |
| design | `rtl/zeus518/wl1/wl1_518_hub.v` | `4a87f4df04073da79d197bb04fd1c5e2ddc5e654f05f347b715b7e9d903e9a83` |
| design | `rtl/zeus518/pegroup/pegroup518_top.v` | `93a6e2d2c8da227da004dd0478516cc91ff96a362541878ffe7e48d3d0385d23` |
| design | `rtl/zeus518/pegroup/pe518_top.v` | `85c37c00a76a086a44d8f1921cb62f5e50cc614f5f910c2ab3756283c86c3ab8` |
| design | `rtl/zeus518/pegroup/pe518_alu.v` | `47c7d1ef6b9864ebe4093260dcd21a9685107057994dd0baf43e33dc15489f37` |
| design | `rtl/zeus518/pegroup/pe518_mac.v` | `22a161b4a274541cd79b925c4f1fbe9ea62b7fd018d9d789f9dfa09fb3038a87` |
| design | `rtl/zeus518/pegroup/pe518_alu_ctrl.v` | `67efd29a15325f3266f43cd2365a8a2f1db148927870bb3b0327c169cd49dc4b` |
| design | `rtl/gdg/gdg_unit/gdg_flowctrl.v` | `54bbb7e259b5dd5f965902a919aa6e42a09a294c80640d954da30032d5ecafae` |
| design | `rtl/gdg/gdg_unit/gdg_axi2frame.v` | `53b7c137d3ca3f570e72c1a0efba46a0bc4e9bcb022a1eade2acaf997da7d2aa` |
| design | `rtl/gdg/gdg_unit/gdg_rdata_buffer.v` | `fb768cb193373219b1006993b3b73e634fb2ea1e8f1efa99523505432a8061fc` |
| design | `rtl/gdg/gdg_unit/gdg_unit.v` | `0cee453aa3e3b989674456081ff74840b28754715a7c0e3d0f98a5af2e50a240` |
| triton_shared | `sim_check/sim_framework/weight/transform.py` | `adbd7a07fffe73c36055db43c4183f5e3e603ba21e00d1258c7672a2002c71ae` |

未闭合项：没有用新波形确认 R、首块延迟或真实 overlap；没有复现 MC bank/refresh 实测；没有将本主例的地址公式推广到 vcache、KW、INT4、BF16、稀疏 index 或 UScale 的所有路径。以上限制应随相应图表保留，不能用“已读 RTL”代替这些测量。
