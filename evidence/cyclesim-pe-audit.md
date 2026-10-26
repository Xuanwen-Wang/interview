# PE / WL1 / PE 内部 DT 源码审计

采集日期：2026-10-26。只读检查，无构建、无模拟运行、无新 RTL/VCS 实验。普通 PE、BF16 和 INT4 使用同一功能语义入口，但当前时序实现的粒度不同；不能将一条限定 INT4 路径的精度推广到所有 PE。

## 版本与公开证据边界

- `Zeus3Simulator` HEAD：`d7ff3de469f8e4bfe571f4c86e127e6446ed56b0`；工作区只有 `PROGRESS.md` 已有未提交修改。其 SHA256 与 RTL 逐文件指纹见同目录 `cyclesim-pe-provenance.json`。
- RTL source drop 无 Git 元数据，revision 未知。依据必须为相对文件位置与 SHA256，不能虚构 RTL commit。
- 已读 `CLAUDE.md`、`PROGRESS.md` §6/§7、`dev_docs/sim/pe_weight/70_pe_rtl.md`、`71_wl1_rtl.md`、`72_pe_calibration.md`（重点 §10/§14）、`73_wl1_calibration.md` §8。
- 文档旧段落与源码旧注释有历史边界。例：`wl1.h` 顶部称所有 GEMM 的 MTW=1，但 `pe_engine.h:210-231` 已明确 KC GEMM 可以 MTW≥4，复用由 formatter repeat 决定。正文必须按字段与实际代码讲，不以 GEMM/conv 标签推断。
- 本文历史结果依据仓库已有记录，不因本次打开文件而成为新测。尤其 INT4 1055 条只能称冻结历史样本。

## 关键断言与定位

| ID | 断言 | 当前源码与 RTL |
|---|---|---|
| PE1 | daemon/timeline 默认实例确实接入 PeEngine 和 Wl1Engine；不是只在 test 存在 | `tools/src/sim_daemon.cpp:875-876,1012-1013`；`tools/src/model_run.h:51,59,66,114-119` |
| PE2 | 普通 PE 用 mini-tile/credit/weight 包络；INT4 谓词命中后用闭环控制投影覆盖 cycles | `simulator/include/zeus3/tensor/pe_engine.h:807-900` |
| PE3 | INT4 支持边界：Wide、KC、FP8 activation×INT4、wmode0、FP32/BF16 输出、完整 source geometry、C128/K256 与 offset 对齐、tn=th=1、UGroup≥16 且二次幂 | `pe_engine.h:892-900`；默认 profile `:332-336` |
| PE4 | AL1 每组/单元信用 2，发送端要全部八组有信用；消费最后 mini-tile token 才归还 | RTL `zeus518/pe_ctrl/pe_ctrl_logic.v:1043-1061`；`zeus518/pegroup/pe518_al1.v:220-223`；模型 `pe_engine.h:339-350` |
| PE5 | mtw/mtk 是 decoded extents，mtc 是 encoded field；有效 A 要被实际 W/K 截断；C 增加计算，不增加独立累加槽 | `pe_engine.h:123-129,384-406,509-559` |
| PE6 | mini-tile 流速受 MAC 与双信用两种约束；对累计总时长取整，不能每块取整再相加；短 burst 有独立 +1 | `pe_engine.h:663-717,720-775`；历史隔离测试 `test/pe/rtl_tb/tb_pe_mt.v`、`dev_docs/sim/pe_weight/72_pe_calibration.md` §10 |
| PE7 | 权重带宽普通模型取 port/request/outstanding 最小；MTW repeat 是 formatter 重播，不是跨指令通用cache | `simulator/include/zeus3/tensor/wl1.h:175-197,214-242`；`pe_engine.h:210-231,927-941` |
| PE8 | INT4 live buffer 分开 address-valid/data-valid/引用代次；权重2路各32 outstanding/4slot，scale28/28 | `wl1_read_buffer.h:13-17,42-96,114-138`；`wl1_int4_path.h:165-166`；RTL `wl1_518_rd_buffer.v:136-169,199-205` |
| PE9 | INT4 模型实际推进WL1/MC/AL1/ALU/OL1；MC同地址对称lane取代表；不建DIN竞争；不是全芯片共享L2仲裁 | `wl1_int4_path.h:108-171`；`wl1_read_hub.h:10-12,49-72`；`wl1_mc_read_port.h:11-17,28-39`；`pe_int4_consumer.h:64-90` |
| PE10 | old-state信用：sender先读旧值，tick末尾更新返回信用；不能同拍借用新信用 | `pe_int4_timing.h:64-75`；RTL `pe_ctrl_logic.v:1043-1061` |
| PE11 | 指令生成器done不等buffer/数据done；最后held request跨ECO-05交接可由hit变miss | `wl1_int4_path.h:121-135`；`wl1_read_buffer.h:53-75`；RTL `wl1_518_uscale_ctrl.v:875`、`wl1_518_rd_buffer.v:136-169` |
| PE12 | PE内部DT是结果格式转换/序列化，独立DT引擎另外排程；16个结果经128bit端口，8bit/16bit/32bit=1/2/4传输 | RTL `zeus518/pegroup/pegroup518_dt.v:92-138`；`pe_int4_timing.h:22-23,56-58,115-117` |
| PE13 | accept=命令扇出；start=read gen接收；done=最终L2写response计数满足，三者不能混用 | RTL `pe_ctrl_logic.v:3391-3399,2190-2198`；模型 `pe_engine.h:990-993` |
| PE14 | 跨PE命令是读地址占用+输出serial两阶段，不是duration等于II | `pe_engine.h:995-1042`；已知array-bound start可偏早，见`:1004-1008` |
| PE15 | 历史闭环测试用geometry输入，逐拍比较11信号，无recorded ready注入；与组件recorded stimulus测试分开 | `test/pe/test_pe_int4_wave.cpp:8-28`；`test/wl1/test_wl1_int4_wave.cpp`；`dev_docs/sim/pe_weight/72_pe_calibration.md:2047-2106` |

上表省略 simulator 路径前缀的文件均位于 `simulator/include/zeus3/tensor/`。RTL 的 `wl1_*.v` 位于 `zeus518/wl1/`，`pe_ctrl_logic.v` 位于 `zeus518/pe_ctrl/`。

## 不应掩盖的不足

1. 普通 PE 的 `pipe_latency=69` 与跨指令 `stage_two_head=68` 必须看来源：并非每个常数都由当前模块逐拍推导。`stage_two_head` 约束由历史 back-to-back 观测建立，内部机制尚未完整定位，`pe_engine.h:315-330` 明写。
2. 普通 PE 对 array-bound 场景的后继 start 戳可能偏早：读发生器实际受阵列反压。模型 two-stage done 约束改善不等于内部每拍start已精确。
3. 同样 MTW×MTK，MTW负责activation words，MTK负责read reuse；不能只看乘积。短K/短W时有效A截断尤其重要。
4. INT4闭环是指令局部重建：每次 `PeInt4Timing path(...)`，`path.run()`，缓存只按完整geometry等key复用结果；不是跨指令保持MC状态的整芯片物理系统。
5. 默认INT4 profile显式400MHz/1+4/FPGA_MC_PHY/source CSRs；refresh/ECC关闭，同步lane。不能推到其它clock/PHY/wafer、并发LW/DIN、任意L2竞争、BF16 activation或任意layout。
6. 1055冻结矩阵旧观测“999精确、MAPE0.0267%、1054落±5%”可放在可展开证据栏但不必把全部数字放主线；其中历史多100拍点仍保留，不能清掉异常或加补偿常数。

## 可手算例子

教学假设：四个相同mini-tile，KC，已解码MTW=4/MTK=1/MTC=0，实际W/K足够，W_a=4输入字，R_a=4阵列读取，A=4独立累加槽，II_mac=1；假设信用RTT L=17来自固定1:1校准配置；短burst额外项δ=0。

- 空管mini-tile span=4；稳态每块下界P=max(4,(4+4+17)/2)=12.5拍。
- 四块stream=ceil(4×12.5)=50拍；各块ceil为13再相加会错误成52拍。
- PeEngine array_cycles包含首块fill=4，所以本例array项=54拍。仍非完整PE完成时间，尚要与weight/write分支比较并加边界延迟。
- 反例：字段MTW=4/MTK=4但实际W=1且只有1个K pass，则有效A=1，II=4；字段乘积16会误报II=1。

## 原创图设计

`content/41-cyclesim-engineering.json` 附六节和四张原创SVG：PE前向/反压结构、双信用事件、INT4供数闭环、accept/start/internal-DT/L2-response时间点。全部标“结构示意”，不把框宽当时长，不拷贝RTL图或长代码。

## 交付检查

未构建业务库、未运行业务实验、未改业务文件。完整网页验收见 [本篇验收记录](review-cyclesim-guide.md)。
