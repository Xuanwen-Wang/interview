# LD / 内存时序源码审计

采集日期：2026-10-26。本文记录源码阅读、成本口径与默认 L2 覆盖边界。内容仅含仓库相对源码定位、必要的机制参数及文件指纹，不包含原始业务输入、内部主机或个人目录。

## 版本与本次边界

- 仓库：`Zeus3Simulator`，HEAD `d7ff3de469f8e4bfe571f4c86e127e6446ed56b0`。
- 工作树仅 `PROGRESS.md` 有既存修改；所引实现文件没有工作树差异。该记录本次 SHA256：`c551beacb6caa534f0f6a0c93b68c8103b171c47afefd6d6fa1d5ecfbe71ee76`。
- RTL 参考副本没有可核验 Git revision，标记 `revision unknown`，使用末尾文件 SHA256 绑定所读内容。
- 本次只读当前源码、已有测试与历史记录，不构建、不运行模型、不新增 VCS/RTL/硅上测量。历史台架结果不能写作本次通过。
- 所有路径均相对各自仓库根；下文简写 `core/`、`memory/`、`front/` 均位于 `simulator/include/zeus3/` 下。

## 1. 先区分默认工具与详细组件

| 层次 | 当前入口 / 性质 | 可成立的结论 | 不成立的推广 |
|---|---|---|---|
| 默认运行 | `tools/src/sim_daemon.cpp:993–1006,1124` 创建并绑定 `LsuEngine`；`tools/src/model_run.h:51–69` 同样绑定 | 普通 LD/ST 采用几何分解、具名成本和共享返回流调度 | 不能说默认业务 LD 逐引脚走完整物理 NoC/MC |
| 详细组件 | `memory/ldma_load_engine.h`、`dma_memory_runtime.h`、`ldma_read_path.h`、`ldma_load_l2_port.h` | 命令字、CDC、native burst、返回缓冲、L2 grant/response 已有明确模型 | 类存在或组件测试存在不等于生产全链路资格 |
| 组合机制台架 | `test/mem/test_shared_memory_mc.cpp:1–2,22–36,83–102` | 显式时钟/CSR/启动 profile 下组合双核 LD/ST、L2、GDG、MC/FPGA | 该测试的有限 ID/order bridge 明确是台架而非 NoC；没有原始 VCS release 身份 |

`tools/src/shared_clock_tools.h:7–10` 明确：`ZEUS3SIM_SHARED_CLOCK=1` 仅选择共享调度，不自动启用 physical LD/ST/GDG/NoC/MC/app0 fetch。

`memory/gdg_mc_fpga_memory.h:11–16,36–48` 要求显式 profile/provenance，限定 continuously supplied external divider clock、normal GDG、ECC-disabled 等条件，声明不是已识别的原始 release，也不是生产默认。

### 默认公共 L2Bus 的重要边界

`Frontend::attach` 确实将队列接到公共 L2 资源对象（`front/frontend.h:383–394`），但对象存在不证明其价格模型涵盖竞争。当前 `memory/l2.h:325–328` 的 `L2Bus::extra_cycles()` **恒返0**；`front/unit_queue.h:1727–1758` 明确只维护竞争者计数，不为跨 master 干扰增加周期。

VP 的孤立 `self_conflict()` 与显式启用的 live L2 路径具有各自范围，不能由此推断默认 LD 已承受多 VP/DT/PE 的实际 L2 背压。正文谈 macro 仲裁时，应区分 RTL 机制与默认成本模型覆盖。

## 2. LD 事件链与真实 RTL 边界

教学输入：一条合法 `LD_MOV`，描述符指定全局内存起点、shape、stride 与元素格式；输出写入本核 L2 scratchpad。L2 是显式寻址 SRAM，不是自动 cache。

1. **dispatch**：CT 捕获描述符与 mode 快照后入队；后续改写配置不应改变已派发命令。见 `simulator/src/front/frontend.cpp:685–699`。
2. **发送命令字**：队列发若干 64-bit command words。它属于指令配置通道，不是 128B 数据 beat。
3. **ACCEPT**：MOV 从 LD FIFO 被 decode 消费，`ld_mov_wren` 经 pulse CDC 回传 accept。它不等于结果就绪，也可能早于执行 start。
4. **START**：完整 descriptor 通过 `o_cmd_valid & i_cmd_ready` 交给 reader，`ld_cmd_issued` 经 pulse CDC 回传 start。
5. **run/burst 生成**：源连续性决定 run；头尾扩展到128B；按最大 burst 分组；bridge 在4KiB处拆开。
6. **AR handshake**：AXI 地址 valid 与 ready 同时成立，才真正接受请求。
7. **R handshake**：valid 与 ready 同时成立，返回一个 beat。`RLAST` 仅标一个 AXI burst 的最后 beat。
8. **重排与 L2 写**：返回经 native FIFO，按偏移拼接、映射16B lanes，再等待 L2 接收、macro grant 与 response。
9. **DONE**：带 instruction-last 标记的写及之前写的 L2 responses 全部收齐，才生成 done；之后还有有序退休及 mailbox 可见性。

| 事实 | RTL 相对位置 |
|---|---|
| 命令FIFO、SRC/DST/TRG/MOV配置、三段dec valid | `zeus518/load_dma/load_dma_518_load_to_l2_ld_decode.v:152–174,208–231,350–358` |
| ACCEPT源自MOV、START源自descriptor握手 | 同文件 `381–398` |
| reader空闲且writer command ready才能接新描述符 | `zeus518/load_dma/load_dma_518_load_to_l2_read_ctrl.v:86,109–113` |
| 128B对齐、burst长度、返回空间预留 | `zeus518/load_dma/load_dma_518_native_mread_ctrl.v:95–162` |
| app0/1/2地址仲裁及RID路由 | `zeus518/load_dma/load_dma_518_native_mread_arbit_and_route.v:82–128` |
| 4KiB split、8项返回CDC、arsize=7 | `zeus518/load_dma/load_dma_518_native2axi_master_read_ctrl.v:140–174,193–232` |
| L2 ready、响应计数、尾写限流、done | `zeus518/load_dma/load_dma_518_write_to_l2_ctrl.v:423–491` |

**注释不能代替赋值逻辑。** `write_to_l2_ctrl.v:52` 的端口注释描述最后数据发出，实际 `o_ldma2iq_inst_done = last_rsp_back` 在491行，所以完成必须按响应解释。`LD_WR_CMD_CREDIT(4)` 的名字也不能证明四个独立在飞槽；`core/lsu.h:1387–1405` 明确该参数没有被使用，实际阶段占用相互耦合。

## 3. 字节、run、beat、burst 的独立账本

- 有效字节：程序实际需要的元素数乘元素大小。
- run：地址生成器能连续推进的一段。跨步矩阵可能一行一个run。
- beat：当前AXI路径1024bit，即128B的一次数据传送；不是整条指令延迟。
- burst：一个AR描述的若干beats，LEN=beats−1；5bit LEN上限32beats，不能跨4KiB。
- L2 lane：16B SRAM字；128B L2写请求最多包含八个lane。

对起点a、长度n>0的run：

```
beats(a,n) = floor((a+n−1)/128) − floor(a/128) + 1
bus_bytes(a,n) = 128 × beats(a,n)
efficiency = useful_bytes / bus_bytes
```

多run分别求和；即使两个run访问相同总线line，也不能无依据地合并请求。

| 教学输入 | 有效字节 | beats / bus bytes | 含义 |
|---|---:|---:|---|
| a=0,n=4 | 4B | 1 / 128B | 有效比例3.125% |
| a=120,n=16 | 16B | 2 / 256B | 跨128B边界，有效比例6.25% |
| a=2048,n=4096 | 4096B | 32 / 4096B | 4KiB边界拆成16+16两个burst，字节无浪费 |
| 64行，每行64B，源行距128B | 4096B | 64 / 8192B | 每行独立run，各需一个128B返回beat；有效比例50% |
| 连续4096B，a=0 | 4096B | 32 / 4096B | 相同有效字节，一个32-beat burst |

上述为可复算教学数据，不是时延/带宽实测。

精确几何入口：`core/lsu.h:866–870` 对齐；`933–953` collapse；`969–1067` runs；`1074–1103` bursts。LD全局端是source，所以源连续性不应被L2目的stride打碎；ST全局端是destination，不能套同一合并规则。非dense的C维按16B粒度padding，`DDE`改变地址步长及run合并。

### 当前报表字段限制

`Breakdown::moved_bytes` 在 `analyse:1196` 使用 `aligned_bytes(t.gdg_addr,t.bytes)`，仍按flat区间算。真正逐run的beats在 `1201–1213` 累加。strided总线字节应使用 **`128 × b.beats`**，不能直接拿 `moved_bytes` 作为实际总线账。本次仅说明现状，不修改实现。

## 4. 当前解析成本及日志 service 的区别

`core/lsu.h:1239–1260` 的成本分解为：

```
analyse().cycles = beat_term + memory_round_trip + l2_round_trip
                 + command_overhead + route_extra + per_command_extra
                 + bursts × per_burst_overhead
```

普通LD的beat项是 `ceil(beats×load_beat_x100/100)`，并加需要拼接启动的后续run开销（`1170–1190`）。当前default load rate为1 core-cycle/beat；这是模型成本项，不是完整物理路径已经独立量完的声明。

教学代入当前core0、普通global route、单连续run、无额外争用参数：128B的 **`LsuEngine::analyse().cycles` / `duration()`** 为 `1+76+13+17+0+1+0=108`；连续4096B为 `32+76+13+17+1=139`。

**不得将108/139直接标成timeline完整`svc`。** 默认LD在 `front/unit_queue.h:664–690` 设置CDC=(4,4)，`1724`取response back，`1905–1909`还将back与共享返回排队等加入记录done。因此在不含其他排队时日志svc差可为112/143；这里的重点是核对字段合同，不能把额外四拍误认作模型回归。前端排队、命令发射、mail等待、退休等待仍是其他边界。

| 当前项 | 值 / 规则 | 依据与限制 |
|---|---|---|
| beat宽、LEN、page split | 128B、最多32、4KiB | READ-RTL结构参数 |
| LD本体开销 | 17 core cycles | 仓库历史独立load-DMA RTL台架；本次未重跑 |
| L2 port往返 | 13 | 历史独立L2台架9+2×depth2；受测时钟/端口条件 |
| global memory往返 | 76 | SOLVED-RESIDUAL，不是分别量完NoC/GDG/MC后相加 |
| 本核weight窗口读 | 128 | 历史路径校准，不能推广到peer weight或任意远端 |
| core1 route extra | 56 | 默认工具配置，来自特定历史路由，不是普适NoC常数 |
| LD资源占用 | max(data+1,l2_latency+3) | 模型对连续完成限流的表达，不等于admission间隔 |

当前默认值位置：`core/lsu.h:109,161,290,374,561,750,842`。历史文档前部的62、后部21不能当当前DMA开销。DMA21+memory72变为17+76，总和仍93；这让来源更清楚，不使同一个floor变成两条独立实验。

历史“MC不在drop”也不能作为当前全局事实：存在后续控制源码仍须绑定release、filelist、CSR、PHY分支和时钟，才能解释被比较VCS作业的绝对周期。

## 5. 四类背压及默认模型覆盖

### 5.1 native返回空间

normal LD数据FIFO为512beats，offset/info FIFO为128项。发burst前预留完整返回空间，消费一beat归还一份。`LdmaNativeRead::signals/tick` 位于 `memory/ldma_native_read.h:30–35,63–81,119–121`；RTL对应 `native_mread_ctrl.v:143–162`。

L2慢 → 返回数据消费慢 → 预留信用回收慢 → AR停发。这是反压链，不应写成一个固定拥塞罚。

### 5.2 fetch、LD、SI共享读口

RTL app0=fetch、app1=LD、app2=SI。AR仲裁grant保持到胜者释放request，R共享返回FIFO并用RID路由。默认 `LdmaReadPort` 模拟共享返回流及同ID跨target ordering，但明确不模拟完整held-grant请求模式，SI也未挂到此默认流（`memory/ldma_read_port.h:35–38,111–116,165–180`）。详细 `LdmaReadPath` 则具有三app、held grant、split与CDC状态。

教学假设：A在t=0发、head=20、8beats，返回占[20,28)；B在t=4发、head=20、8beats，理论24开始却等到28，实际[28,36)。B的4拍等待来自共享流，不是memory head变长。默认 `schedule/first_beat` 用 `max(ready_time,shared_stream_free)` 表达（`133–145,197–207`）。

同ID改target还可能先等旧target最后响应，再开始新往返。不同ID避开此ordering条件也仍共享R带宽。

### 5.3 L2宏阵列

L2为128个macro，按16B字交错：`macro=(byte_addr>>4)&127`，总容量512KiB。128B请求最多触8个macro，DT32B最多触2个。冲突取决于具体时刻、地址与mask，不能“有四VP就固定四分之一带宽”。

这是RTL机制。默认公共L2Bus不计上述跨master干扰；详细LD路径将m23真正接到 `L2Timing` 的grant/response（`memory/ldma_load_l2_port.h:13–59`），两种层次必须分开说。

### 5.4 尾响应串行化

下一命令带last标记的数据遇到 `last_rsp_cnt!=0` 会停止，直到上一命令尾响应归来（RTL `write_to_l2_ctrl.v:484–491`）。短流可能受L2 round trip限制，长流则主要受data beats限制。

历史台架记录 `period=max(beats+1,l2_latency+3)`；当前l2=13下是16拍下界。这里的period是受测连续命令的完成间隔/模型资源占用，不是每条LD只花16拍，也不能拿它证明每次START必须相隔16。

`dev_docs/sim/memory/81_lsu_floor.md` 保存的历史fused RMSNorm边界反例：两条224-beat LD的VCS START可只隔6拍，抽象模型将后一条start推后225拍；DONE间隔却大多都约225。完成吞吐相近仍可能把等待放错位置。本次未新跑该例。

## 6. 对齐LD的五步方法

1. **固定身份**：同zbin、输入、descriptor、地址空间、core、CSR、clock、release；记录源码与binary身份，先核动态命令条数。描述符非法或false PASS先解决合同。
2. **固定事件**：逐serial/PC记录dispatch、最后command word、ACCEPT、START、AR handshake、首/尾R handshake、L2写、尾response、DONE/retire，注明时钟域与trace寄存器偏移。
3. **先核流量**：逐run地址、长度、beats、bursts、4KiB split、RID、L2 mask；流量不一致时不先调latency。
4. **找首分歧**：AR晚查command/credit/arbitration；AR对而首R晚查NoC/MC；R对而L2写晚查buffer/realign/ready；L2写对而DONE晚查response counter/CDC/trace。
5. **扩大反例**：扫长度、对齐、burst上限、连续/stride、fetch、VP/DT并发、单/双核和target切换；报告绝对误差与选型排序，而非只一个108拍小例子。

不变量：valid且未ready时payload稳定；循环计数只随handshake推进；返回不超过预留空间；tag无丢失/重复/错配；DONE之前该命令尾L2 response已到。模块台架须同时说明stub、固定信号和旁路范围。

## 7. 引用文件SHA256

### CycleSim

| 相对路径 | SHA256 |
|---|---|
| `PROGRESS.md` | `c551beacb6caa534f0f6a0c93b68c8103b171c47afefd6d6fa1d5ecfbe71ee76` |
| `simulator/include/zeus3/core/lsu.h` | `1bccf671e6a23cf5a6b32ab2c8442a69981ea6291debe935c5c5ddeb2b5dda49` |
| `simulator/include/zeus3/memory/l2.h` | `baeac03cc24990e3993ef1a621dbb4eb432ac05a17f577585209690b33dd16c0` |
| `simulator/include/zeus3/front/unit_queue.h` | `371153c1500064fcde6cd0236c366516f81e572aa5d9e64b76404493a5ae7510` |

### RTL参考副本（revision unknown）

| 相对RTL根路径 | SHA256 |
|---|---|
| `zeus518/load_dma/load_dma_518_load_to_l2_ld_decode.v` | `55480261fed8dd9341aff1e628514dc7678b5fdfbbdc71603454fef791031829` |
| `zeus518/load_dma/load_dma_518_load_to_l2_read_ctrl.v` | `1d0f832bb7186e5e9b806214f70592b772cf928efa62e2bf92f86ce5e3f4fd55` |
| `zeus518/load_dma/load_dma_518_native_mread_ctrl.v` | `f06fee2d88e150648670a44aebb7990c86c28831fc3cef0f5fe8b327fd83a3ae` |
| `zeus518/load_dma/load_dma_518_native_mread_arbit_and_route.v` | `322f1ce5948048f0beba4b3c22c95d082e6b577e5cb1dc051534260aad5a51f6` |
| `zeus518/load_dma/load_dma_518_native2axi_master_read_ctrl.v` | `43eea35958d4171de1d37d5a3f9c70984a883e61a76e8e6995c89dce1fd9bf71` |
| `zeus518/load_dma/load_dma_518_write_to_l2_ctrl.v` | `50548834adb349448ee1630c096fe5f221a67eea8015d08e7ae2f6511a0869a4` |
| `zeus518/load_dma/load_dma_518_round_robin_arbiter.v` | `f207811924f37220d7e2e3d1709a06e7be2c9d9b27343e81e584bcbff29df031` |
| `zeus518/l2buffer_ctrl/rtl/z518_l2_l2buffer_ctrl.v` | `44a2022879adef52e1b1d7dfdd03983ff836fb7825c981a492e6874d624bd05e` |

本次只核验源码和文档身份；这些指纹不代表已认证当前运行二进制、历史VCS工具链或实际硬件配置。
