# CycleSim：模型先行版本的源码复核

采集日期：2026-10-27。当前源仓库 Zeus3Simulator HEAD 为 `382c4f151fb8a6b59227f7a168ab231484b0864c`，tracked dirty 仅既存 `PROGRESS.md`。本任务只读业务仓库，没有重建工具链、运行 CycleSim 或 RTL。RTL 为非 Git drop，revision unknown，以下 SHA256 固定本次阅读的文件；不据此猜测历史执行时的完整 RTL manifest。

本轮重写16个主章节。历史记录沿用 [案例证据](cyclesim-casebook-sources.md) 和四份 JSON，本文件补充模型、参数和边界依据。新增 LD/ST 计算器从 descriptor 独立生成几何与公式结果，既不调用芯片模拟器，也不读取实测总周期反推参数。受控变体只称教学预测。旧章节 ID、stage ID 和问答 ID 保留。

<a id="architecture"></a>
## 硬件与模型分层

- `base/chip_config.h`、`tools/src/model_run.h`、`tools/src/sim_daemon.cpp`：硬件配置、工具接线和启用模型。下面缩写 include 路径均位于 `simulator/include/zeus3/`。
- `front/unit_queue.h:1760–1895`：局部串行占用、在途槽、共享读流等待、RMW预约；live 与 reservation 不能混用。
- 同文件 `ExecUnit` 的 `duration/occupancy/pipeline_depth/inflight_hold/accept_latency` 合同。这些量不能以一个 cycles 替代。
- 公共 L2Bus 默认不增加跨 master 争用时延；没有把组件级 live 路径泛化为默认全系统能力。运行接线依据沿用先前 source audit；此轮未运行 daemon。

<a id="total"></a>
## 总时间与事件

`front/unit_queue.h:1793–1895` 给出 max(arrival, busy_until, earliest_slot) 及 read/rew 队列等待；它是具体预约路径。正文依赖项写为概念前置条件，实际由前端/队列同步状态使其 eligible。完成不等于退休，公共时钟域的绝对时刻不能当耗时相加。

GEMM 七区间与起止原点沿用 `cyclesim-gemm-trace.json`，并集/未覆盖区间的数学不变量由既有 Node 测试核验。教学预约10/40/55/80以及MAIL20/120/30/3不是实测。

<a id="ld"></a>
## LD模型

- `core/lsu.h:889–1058`：16B C granule、非dense pitch、LD/ST不对称collapse、地址循环和每run长度。`runs()`的LD全局合并只依赖source，不依赖destination。
- `core/lsu.h:1073–1110`：**先按max burst分块，再分4KiB**。计算器保留这一顺序，区别于任意贪心page打包。
- `core/lsu.h:1170–1260`：`beat_term/analyse`，LD每长run额外priming，当前默认 `ceil(B×1)+max(R−1,0)+76+13+17+1`，per-burst默认0。`moved_bytes`字段只平坦对齐bytes，本轮用逐run的B计算传输拍容量。
- `core/lsu.h:125–151,698–750`：76与17的合计约束；源码注释保留过时72/21语境，正文使用实际字段76/17，并解释其参数可识别性限制。
- `core/lsu.h:280–290`：全局run priming不能完整覆盖“源连续、L2目标离散”的额外写命令，已加入正文边界。
- `core/lsu.h:1343–1420`：O=max(data+1,L2+3)；LD depth1、hold=O仅预约抽象，硬件有效在途深度未由一个固定4完全证明。
- `memory/ldma_read_port.h:123–145,178–187`：首返回流预约、同ID不同target排空约束；held-grant AR仲裁未完整建模，SI没有挂接到该端口抽象。
- RTL `zeus518/load_dma/load_dma_518_load_to_l2_ld_decode.v:241–259`：源端padding与collapse。
- RTL `zeus518/load_dma/load_dma_518_write_to_l2_ctrl.v:163–165,475–489`：bypass及末L2响应门控。

五个新计算器输入见 `config/cyclesim-cases.json` 的 `ld-model`。只有首例几何来自已有4KiB记录；其余是明确标注的stride/offset/route受控变体。均使用当前解析profile，不拿139与局部台架68算误差。原16→84日志改为展示0→68，raw origin仍留在payload。

<a id="st"></a>
## ST模型

- `core/lsu.h:502,643,692,750,775`：写速率2.48、部分burst周转36/末22、启动22。
- `core/lsu.h:1173–1180`：Q计partial burst，latency与occupancy分开计 `(Q−1)×36+22` 与 `Q×36`。
- `core/lsu.h:1244–1257,1358–1361,1404–1420`：L全局固定项103；O=max(data+Q×36,24+13+B)；四槽到duration，UnitQueue再用max(O,H)保护槽释放。
- `core/lsu.h:1430–1439`、`memory/gdg_rew_port.h`、`front/unit_queue.h:1859–1871`：跨core共享部分写链预约，不重复计同引擎occupancy。
- RTL `zeus518/sdma/sdma_st_cmd_decode.v:303–315,367–379`：四在途计数、ST合并必须兼顾源目标及16B对齐。
- RTL `zeus518/sdma/sdma_st_get_l2_cal.v`：读L2、长度FIFO、AW/W/B状态。

`st-model`五个例子包括历史st_15/st_16 descriptor的地址归一、4KiB完整写、教学64半行及额外路径56。56只作为指定教学参数变化，不声称归一地址等价原NoC路线。st_15/st_16原fixture没有整条业务latency，所以新预测2669/130不带虚构RTL误差。4KiB原14→116图改0→102。

<a id="partial"></a>
## RMW

RTL `gdg/gdg_top_rew_processor.v:100–116,139–148`：partial W接收触发fake AR；`w_b_hs_cnt`门控；下游完整WSTRB。P个partial beat产生P份旧128B行工作；Q个partial burst用于时间近似，两者不能互换。512B/39168B为组件边界工作账，不是全系统DRAM实测。

<a id="pe"></a>
## BF16 PE与连续指令

- `tensor/pe_engine.h:384–406,457–470,515–570,769–881`：KC下Wblock=MTW，MTC原始字段+1；mini words与reads区别；mini_tile_stream、供权和独立KC输出路径。
- `tensor/pe_engine.h:730–758`：short_burst_extra的测量关系；原因仍属推断，正文没有把某一未证明内部泡当事实。
- `tensor/pe_engine.h:997–1042`：读迭代occupancy与第二阶段done递推；stage_two_head=68。明确保留array-bound命令START未完全对齐的限制，不能以DONE对齐替代START验收。
- 历史六档BF16台架来自 `72_pe_envelope.tsv:4–9`。网页有限计算器仅支持六档固定shape，不承诺任意BF16/KW参数外推。L2读写9、理想WL1供权2048的条件保持不变。
- 第二阶段8×128×256与8×256×4096控制是源码注释所指的其他控制shape，不与BF16六档混算，也不把注释“silicon”扩写成硅上测量。

<a id="int4"></a>
## INT4局部闭环

`tensor/pe_int4_timing.h:11–78,95–115`：12/33首边界、状态准备、old outstanding判断、17拍信用返回、预期输出数量、序列化part。`tensor/pe_engine.h:884–913`：支持条件以及 `last_transfer+27+Lwr−9`。

四组冻结波形/案例仍见 `cyclesim-pe-cases.json`。11pin缺少credit寄存器，因此图保留unknown。835和1148是历史值，文章没有新运行INT4控制器。

<a id="vp"></a>
## VP流水、两尾槽与规约

- `vector/vp_engine.h:630–695`：输入E由格式/CGPm决定；Stensor/Dtensor/vector模式；输出pack不能只按目标位数换算。
- 同文件 `926–934`：逐元素主包络；`1390–1457`：地址阶段A、两尾槽H、Btail，另有队列credit。
- 同文件 `1149–1177,1263–1301`：根节点到达、标量前缀与SQT约束；`test/vp/test_vp_pipeline.cpp:83–86`的fixture事件换算（文件位置沿历史来源索引）。
- 87为command-launch→done；241为特定fixture的inst_start→done。二者从未按同一原点合表。
- 新正文补充Dtensor双输入同读口及FP32向量拼接，明确逐元素等宽流假设，不能泛化到pooling/paramgen/reduction。

<a id="dt"></a>
## DT几何与分支

`data/dt_engine.h:280–324`：reshape使用2R；pass令Wout=R；转角逐块sum(max)、NB、Bl、Lrd/Lwr与head3。`440–476`：occupancy=duration+2，credit在done返还。网页有限计算器和历史时序fixture的目的surface限制保留。

<a id="parallel"></a>
## 多实例与共享资源

真实1/2/4DT记录、128macro地址相位、DT0与窗口分母见 `cyclesim-vp-dt-cases.json` 和旧案例证据。正文请求级递推是建立共享模型所需的机制说明，**不是宣称默认L2Bus已经实现同样仲裁**。未补造DT1/2/3终点或逐拍grant。

<a id="evaluation"></a>
## 依赖与评估

`front/unit_queue.h` 的credit、outbox及退休状态，已有前端审计和历史GEMM MAIL排错支持模型边界。正文将计算、退休、mail可见分开；教学mailbox时间只给下界，具体同边沿允许行为仍依实现。

新增 Δdone=Δstart+Δduration 分解、可识别性、受控反例与候选集regret。实验矩阵是建议的检验设计，不冒充已完成的新实验。

## 本轮读到的关键文件SHA256

以下文件属于来源仓库。路径均为相对路径；没有公开完整内部源码或二进制。

| 仓库 | 相对文件 | SHA256 |
| --- | --- | --- |
| CycleSim | `simulator/include/zeus3/core/lsu.h` | `1bccf671e6a23cf5a6b32ab2c8442a69981ea6291debe935c5c5ddeb2b5dda49` |
| CycleSim | `simulator/include/zeus3/front/unit_queue.h` | `371153c1500064fcde6cd0236c366516f81e572aa5d9e64b76404493a5ae7510` |
| CycleSim | `simulator/include/zeus3/memory/ldma_read_port.h` | `e9c61dc082889727bebdfb40761a38bc8f0dde01550d04b2b2d6f940c18c1bac` |
| CycleSim | `simulator/include/zeus3/memory/gdg_rew_port.h` | `5bb98d47f3efe30b57730de0844c77dd09f6ff66c5652264e5efaba6acc624cd` |
| CycleSim | `simulator/include/zeus3/tensor/pe_engine.h` | `1908864c00fa0abe5961ee3acb59b90839cd53191bc4d9841ab3ad0ffc6a23bb` |
| CycleSim | `simulator/include/zeus3/tensor/pe_int4_timing.h` | `baa9a7f913516be9c241d1fbd35af2b8826d27f2cb14ee18de215c7709edccbb` |
| CycleSim | `simulator/include/zeus3/vector/vp_engine.h` | `0ffef2917c73d1b69cd9be62b2c684208d99eba014efe065307a46c0ee09eb5b` |
| CycleSim | `simulator/include/zeus3/data/dt_engine.h` | `78ddb541fa38fcf15a0c666aabec6697db445fd001ba00b4215c6a1de476fc9f` |
| RTL | `zeus518/load_dma/load_dma_518_load_to_l2_ld_decode.v` | `55480261fed8dd9341aff1e628514dc7678b5fdfbbdc71603454fef791031829` |
| RTL | `zeus518/load_dma/load_dma_518_write_to_l2_ctrl.v` | `50548834adb349448ee1630c096fe5f221a67eea8015d08e7ae2f6511a0869a4` |
| RTL | `zeus518/sdma/sdma_st_cmd_decode.v` | `b786072bbe0b9d979e693b47e1b016ebd550812c5928a58c7a65eff01bff0bed` |
| RTL | `zeus518/sdma/sdma_st_get_l2_cal.v` | `e9d665c33fe2fae2ce4d49e7dfbe043f0c96f14df22318654c2d1d653cb2feb5` |
| RTL | `gdg/gdg_top_rew_processor.v` | `97ab202ddaddebf43cc559b6d0e2e4dc02bd8a27bcdba6c6d7950f23c836e1d9` |
