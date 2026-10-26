# CycleSim真实案例：来源、边界与复核

采集日期：2026-10-26。源码仓库：Zeus3Simulator，HEAD `382c4f151fb8a6b59227f7a168ab231484b0864c`；本地dirty为`PROGRESS.md`，本任务未改业务源码。RTL为非Git源码drop，revision unknown；具体文件以SHA256固定。

本次只读源码、历史记录和冻结控制采样，复算公式、解码现有trace、检查网页模型。未编译或运行新CycleSim、RTL/VCS，也无硅上或完整模型端到端测量。历史表原始行保存在下列JSON中；JSON内source/path是相应来源仓库内的相对位置，不代表本公开仓库提供全部内部源码。没有公开原始模型张量、二进制或完整原业务重放包。

- [LD/ST完整案例与原始行](cyclesim-ld-st-cases.json)
- [PE完整案例、六档公式和40个真实控制锚点](cyclesim-pe-cases.json)
- [VP/DT案例、原始行与24项文件指纹](cyclesim-vp-dt-cases.json)
- [GEMM解码后的七个区间及MAIL事件](cyclesim-gemm-trace.json)
- [前版源码导航与运行接线审计](cyclesim-sources.md)：前版固定在d7ff3de，保留为参考，不能替代本文382c4f1的案例证据。

动画标识：观测重建表示用同一条日志相邻时间戳相减，不是独立预测；公式投影表示按源码运算，不伪造采样；冻结控制回放只展示存在的关键边沿，不在两点之间插值虚构valid/ready。

<a id="architecture"></a>
## 硬件与实际模型入口

单core的4VP、4DT、1PE、512KiB L2、普通LD/ST与PE专用WL1连接沿`tools/src/model_run.h`、`tools/src/sim_daemon.cpp`、`simulator/include/zeus3/base/chip_config.h`和`simulator/include/zeus3/tensor/wl1.h`核对。PE内部8组64单元沿PE RTL台架及`pe_ctrl`、`pegroup`核对。请求与返回必须分开；图中权重数据箭头由MC/PHY经WL1走向PE。

默认公共L2Bus不计跨master争用延迟；详细RTL代理或live选项存在不等于默认入口启用。普通LD/ST、VP、DT、PE宏模型与限定INT4闭环是不同层级；正文不把一个模块的逐拍资格泛化为全芯片。

<a id="total"></a>
## 128³ GEMM总时间

来源作业`26c7e41c609f`。输入BF16、M=N=K=128、单core；core400MHz。首CT trace原始1924归零，最后原始4458；CT_ED相对652，最后ST相对2528，尾部到2534。trace start/complete是队列事件，不是算术单元的每拍busy。

只读解码8字节little-endian记录；start/done各自过滤MAIL，VP/DT按mask拆实例后按实例配对，LD/ST/PE使用其单实例；不按单元将MAIL和计算混成FIFO。下面使用半开区间，事件起点为0。

| 单元 | start | end | duration |
| --- | ---: | ---: | ---: |
| LD0 | 53 | 161 | 108 |
| VP0 | 251 | 842 | 591 |
| LD0 | 886 | 1061 | 175 |
| PE0 | 1076 | 1377 | 301 |
| DT0 | 876 | 2001 | 1125 |
| VP0 | 2043 | 2238 | 195 |
| ST0 | 2276 | 2528 | 252 |

区间和2747；并集2271；七个区间未覆盖的时间263=53+90+34+42+38+6；整段2534=2271+263。第二LD175与PE301分别被DT窗口覆盖，但LD在1061结束、PE在1076开始，三者没有同时活动。并集不是datapath busy，未覆盖也不是已归因的纯前端或硬件idle。

旧87历史报告中的599/862/1064等与这份重新按opcode过滤的提取不能逐数字混用。第一VP计算完成842、MAIL尾部850，850−251=599只是一个口径线索，不能据此宣布复现当时提取算法。

<a id="ld"></a>
## 4KiB LD

`dev_docs/sim/memory/35_load_dma.log:281`。N,H,W,C=1,1,1,4096，byte-oriented DF8，不宣称该DF8代表FP8数值；连续对齐地址0。core400MHz、AXI500MHz，L2写响应9 core拍；固定AXI slave替代NoC/GDG/MC，r_lat参数10，实际AR23→首R34为11 aclk。

core边界16 START →18 AR桶→27首R桶→42首L2写→73末L2写→82末响应→84 DONE，观测差分2+9+15+31+9+2=68。AXI事件先按实际域转换，不直接混加不同频率的cycle。当前默认解析139=32+76+13+17+1属于不同GDG/L2/入口边界，不能用139−68做同环境误差。连续8条首完成68、后续DONE间隔33，总299；不是声称START间隔33。

<a id="st"></a>
## 4KiB ST

`dev_docs/sim/memory/34_sdma_store.log:614`。相同字节几何，full SDMA台架；START14→L2请求17→首L2数据26→AW core68→B core108→DONE116。差分3+9+42+40+8=102。AW85、W86..125、B135来自AXI500MHz；W32个握手跨39 aclk间隔。实际Wlast→B10 aclk。

8192B134不是102×2，第二burst与第一burst的准备/发送有重叠。默认解析183=ceil(32×2.48)+67+13+22+1中2.48是历史全局写服务率，67不是此台架B固定10，不能直接当实测预测误差。

<a id="partial"></a>
## 部分写与RMW

st_16真实descriptor：64个2B元素、目标起点mod128=64，128B有效数据跨2行且都partial；fake read2 beat、完整写2 beat，RMW边界工作量512B。st_15：72行×256B、stride288B、address mod4096=3840，198写beat、76burst、108partial/fake read，58partial burst。

这些是原descriptor几何与已有组件向量的核对。没有完整原业务到达时刻，不能从组件预算或计数伪造整条业务ST latency；512B也不是新实测全系统DRAM流量。

<a id="pe"></a>
## BF16 PE mini-tile

`dev_docs/sim/pe_weight/72_pe_envelope.tsv:4–9`。N=H=1,W2,C768,K128，BF16×BF16→FP32，KC、MTW2、MTK1。真实PE控制+8组64单元；WL1 always valid；L2每拍一请求且固定读写9拍。当前公式手算用2048B/PEcycle理想供权匹配台架，不把生产683等配置混用。

A3072B、权重196608B、输出1024B；pass24，每pass8192 BF16 MAC。weight_demand49152是per-pegroup速率记账，不是物理DRAM权重字节。MTC解码1/2/3/4/6/12对应RTL204/156/144/144/144/156，手算212/157/142/139/138/150。MTC2具体项：floor48、credit75、首填4、array79、weight24、work157、write94，max157。`work`末项9为L2写响应，不是L2读。

原TSV部分内部计数采用绝对bench origin，不能减start_lat4拼出伪装的相对波形。本网页播放的是算式步骤。69/73保留当前具名包络常数的意义，不声称独立一拍一拍重建了其中全部寄存器。

<a id="int4"></a>
## INT4冻结控制回放

主shape FP8×INT4，N=H=1,W4,C512,K4096，FP32输出，KC、1+4 Wide；MTW4、MTC解码4/字段3、MTK1。PE/AXI/MC400MHz，divider2GHz相位250ps，bank_map e4、all_bank_active；无ECC/refresh。变化只限无UScale、group16、group32；w1c1k2是另一档mini-tile对照。

四组原始case与wave来源、哈希、每帧11pin都在PE JSON。pin中output_handshake是握手事件，不是原始ready。代表stream不是全部组计数；内部DT子字不是独立DT指令。credit寄存器/返回脉冲未采集，图中保持未知；trace_done来自独立case计时，非11pin之一。

u32：835拍，MAC91..720，输出116..780，DT123..808，尾部27。u16首MAC73更早、总1148更晚。三档主例均256 MAC /128 output /512 DT子字，但只收32激活字与16flag；AL1复用不能重复收费。等待条件395和输出反压195可能与其他状态重叠，不直接相加算总周期。w1c1k2为128激活字/128flag，2008拍。

历史表中的expected model是当时冻结预测，不冒充本次运行的当前模型。本地未具备同一完整原张量/zbin输入重放，网页材料仅足以复核公式和控制投影。

<a id="vp"></a>
## VP逐元素、B2B与规约

MUL：[1,1,256] FP32→同shape，Lrd=Lwr17，always-ready行为L2，VP400MHz、phase0。台架激活MUL级但非数值oracle。launch→done87=15+17+19+4+7+8+17；其中15/55/62是公式投影，不说TSV保存全量中间波形。`62_vp_b2b.tsv:99–101` credit1/2/4单条都87，连续平均done间隔62/31/17.5，14条发射中取后10间隔。两尾槽长期约束max(10,35/2)=17.5仅对应足够外部credit情形；不是四个独立VP的吞吐。

规约：[1,4,128] BF16→[1,1,4] FP32；vector MUL+SUM树，scalar MUL+SUM+SQT；真实VP0/真实L2/depth4端口，其他master idle。`test/vp/vp_pipeline_rtl.tsv:7` scalar_0_2_4：start1078、cal1106、rootin1136、root1142、scalar1143、duration241。归零28/58/64/65为记录锚点，done由start+duration得到；SQT73..204是源码投影。公式28+6+24+6+1+8+99+32+6+17+8+5+1=241。PSMO1第25行240只是在两个输入短根节点上快1。

<a id="dt"></a>
## DT尾块

BF16[1,16,8,20]、order4、Lrd9/Lwr2、真实DT+行为L2。原命令目的surface为[1,16,8,20]，并非紧凑NCHW[1,20,16,8]，所以只称冻结时序fixture，不称布局数值验收。

每H的8×16块fill8/drain16，8×4块fill8/drain4。XFER=16×(16+8)=384，R256、write320、NB32、Bl4，exec384+32+4+9+2+2=433，head3后436。错误max(R,W)会得到369。控制W16C24在9/2下565，W16C1在9/2下286，W16C32在9/9下580；不能把派生9/9的572/293当作前两条原profile的观测。

<a id="parallel"></a>
## 多DT共享L2

每条DT tile BF16[1,8,16,32]，source allocation [1,8,16,256]、destination [1,8,16,32]，order0。真实DT1/2/4+真实128macro L2，额外PE读口流量是合成continuous master3，128B每accepted拍，不含完整PE计算。各DT直接同时注入5命令字，绕过生产inst_ctrl。

隔离几何式293=256+16+9+9+3不预测跨master争用。source pitch512B/16B字交错粒度=32，同源相位0/32/64/96。三个实例数记录DT0 exec302/303/426、rdstall21/22/136、邻居rate .91391/.59016/.50816。exec只保存DT0，rate分母是所有活动DT窗口并集的注册门控，原始win和accw整数未保留，不能逆造精确grant序列或四条DT的结束时间。

<a id="evaluation"></a>
## 依赖、误差与评估

依赖与退休沿inst_queue/inst_ctrl及前版源码审计核对；历史87报告解释过VP计算后MAIL越过未退休项造成下游提前。区分accept、service done、ordered retire与mail visible，不能把局部延迟残差加到所有下游上。

每点signed error=(model−RTL)/RTL；选型regret=RTL(model-selected)/min(RTL candidates)−1。BF16模型选MTC6，候选RTL同优144，regret0，但不证明MTC6优于3/4。INT4历史模型1765、某次VCS1865而repeat1765的例外继续保留，见PE JSON引用的README/repeats/calibration，不能以selected examples替代全量精度结论。

## 文件指纹索引

下列指纹用于固定当前阅读的文件；原始行、行号及更细的符号引用在案例JSON中。RTL revision unknown，以sha固定；历史测量生成时间/编译commit未知时不补猜。

| 仓库 | 相对文件 | SHA256 |
| --- | --- | --- |
| CycleSim | `test/vcs/results/gemm_mkn_blocked_aligned.26c7e41c609f/vcs/output_trace_core0.bin` | `60a212b9e16d9f7b5a55080ef01b1ded27ef578eedc21c87d42a157fd2c39d64` |
| CycleSim | `test/vcs/results/gemm_mkn_blocked_aligned.26c7e41c609f/vcs/trace_time_alignment.json` | `ac97c531221d29224a6d59dade472a69ac7ea223266883b425077da768abceaf` |
| CycleSim | `tools/scripts/decode_vcs_trace.py` | `f4d790821cc5e8f166b0d6fa85d40cfcff0a7028e1d3140907bbd65d22eaa40f` |
| CycleSim | `dev_docs/sim/memory/35_load_dma.log` | `cd0854f1c82d0b846e3ca7d68ac54cd8b7a3690e4c80d0bb653b620c28ad9469` |
| CycleSim | `dev_docs/sim/memory/34_sdma_store.log` | `20da835c0ce08288ceb39b3da93ae9a287214c278f09f660666b41156b6c4bce` |
| CycleSim | `test/lsu/rtl_tb/tb_load_dma.v` | `14718dbd8852de019afc3cb4e8003071caedc6ca45d81a1f9f7a77aa469d5cbc` |
| CycleSim | `test/lsu/rtl_tb/tb_sdma_store.v` | `554af26b27e96fed28b7a25ed56b860ac490222dc2973ac22ace1e76155ca894` |
| CycleSim | `simulator/include/zeus3/core/lsu.h` | `1bccf671e6a23cf5a6b32ab2c8442a69981ea6291debe935c5c5ddeb2b5dda49` |
| CycleSim | `tools/src/model_run.h` | `06c9abd39f8c93dd27736aac44dfe871eda5258b288621057e0d08a334c09be7` |
| CycleSim | `simulator/include/zeus3/memory/gdg_top_rmw.h` | `b4f0469fc51dcccbb11825d46613ac23dc4b64b98f7360de17897d901417b2e5` |
| CycleSim | `test/memory/test_gdg_top_rmw.cpp` | `55619b39a513f718b4a7fac4ce65e9eee834e3716b4d8e3307159b0c2df5429f` |
| CycleSim | `test/memory/gdg_top_rmw_rtl.inc` | `4715a54a01519814b06f6a9494e8a330df608241df6cc2227773b05236ec8c74` |
| CycleSim | `test/front/dma_queue_rtl/reference.json` | `bc812b6955287cad5eadc5b97a8cc21cf2216a7803f6097415aff29f235035ea` |
| CycleSim | `test/front/dma_queue_rtl/probe.cpp` | `d9395dbbd2de3f82ec53e9c46cea83633803e26a7d7e0ace02e932d431bcc27d` |
| CycleSim | `PROGRESS.md` | `963eca71ed0b3d30e25979a222021eb7ede515fc28d41f18f69e2b38fa7c8b3c` |
| RTL | `zeus518/load_dma/load_dma_518_write_to_l2_ctrl.v` | `50548834adb349448ee1630c096fe5f221a67eea8015d08e7ae2f6511a0869a4` |
| RTL | `zeus518/load_dma/load_dma_518_load_to_l2_read_ctrl.v` | `1d0f832bb7186e5e9b806214f70592b772cf928efa62e2bf92f86ce5e3f4fd55` |
| RTL | `zeus518/sdma/sdma_st_get_l2_cal.v` | `e9d665c33fe2fae2ce4d49e7dfbe043f0c96f14df22318654c2d1d653cb2feb5` |
| RTL | `zeus518/sdma/sdma_st_cmd_decode.v` | `b786072bbe0b9d979e693b47e1b016ebd550812c5928a58c7a65eff01bff0bed` |
| RTL | `gdg/gdg_top_rew_processor.v` | `97ab202ddaddebf43cc559b6d0e2e4dc02bd8a27bcdba6c6d7950f23c836e1d9` |
| CycleSim | `test/memory/rmw_st_rtl/st_16/source.json` | `1a2af50e514d39c3f629da780bdaaee25b039d1347c2a05f9bf359d6958ce988` |
| CycleSim | `test/memory/rmw_st_rtl/st_16/aw.hex` | `2cdfb896c17683ecc0a7cae3eb769b7fe6b4f6899564f9405554a2da305d7452` |
| CycleSim | `test/memory/rmw_st_rtl/st_16/w.hex` | `5dbd58f8bc13daa4eb45ed50d3a4074c33dbf434ed126e08b63f525e4af892bd` |
| CycleSim | `test/memory/rmw_st_rtl/st_15/source.json` | `215498c5c20870022ef5277f0b7bc3feece393aab8aa44417314965fb4c42837` |
| CycleSim | `test/memory/rmw_st_rtl/st_15/aw.hex` | `10d2079c427eb6d424376443fd2056029657294042aa0c11a694a4a215d29778` |
| CycleSim | `test/memory/rmw_st_rtl/st_15/w.hex` | `2de085871b04c762c7bf79354398a5641554ffa2543100c0e4a90f3ef3ccc3e9` |
| CycleSim | `dev_docs/sim/vp_dt/62_vp_b2b.tsv` | `ae147552ad81d76b0c72cfc3958522ea7e9a5942a9649b4873d2339c2d963267` |
| CycleSim | `test/vp/rtl_tb/measure_vp_b2b.py` | `cb3d5d431610108ae7b7b0f6d19d9d87094c7921f78078682a24b4cc80806fb3` |
| CycleSim | `test/vp/rtl_tb/vp_prog.py` | `c9f23fccdeb391b6e2a17422086b33da818884af8f105a5da51a7d6ab6493446` |
| CycleSim | `simulator/include/zeus3/vector/vp_engine.h` | `0ffef2917c73d1b69cd9be62b2c684208d99eba014efe065307a46c0ee09eb5b` |
| CycleSim | `test/vp/vp_pipeline_rtl.tsv` | `15d79316552ee1d7d8d46c6952753a746a757a5ffd3e81b63b07ca36d38402a2` |
| CycleSim | `test/vp/rtl_tb/measure_vp_scalar_arrival.py` | `31679ae189cd665335f87ebaa803d09d3d629b4fc612192f78cbcd25e9691896` |
| CycleSim | `test/vp/rtl_tb/gen_vp_l2.py` | `ebbf96485a879075e6beb7f7c691f688cbee20535c5f364df2d0c1ac7f8f2043` |
| CycleSim | `test/vp/test_vp_pipeline.cpp` | `a13103bcab9bcdf584ad74cb76dff13f26724919f8ee89cc765f436d1fc19152` |
| CycleSim | `dev_docs/sim/vp_dt/63_dt_calibration.tsv` | `f1db23dab4e281ca19434dc95bf4d9835d4793382c22d70441b6c7b02e5369d6` |
| CycleSim | `test/dt/rtl_tb/measure_dt_cost.py` | `72ff917954779adbd19c5c7a3ce1aededb32ceff70e167dcb47616838613a6b5` |
| CycleSim | `test/dt/rtl_tb/dt_cmd.py` | `ff47cc3aa7bf75d1a683766b57b6b1a9fe6302936f251d64ae2e66a4cc262c5a` |
| CycleSim | `dev_docs/sim/vp_dt/63_dt_calibration.md` | `b7fb320285cd37b2aaea5fc3580e43d768c4e55a37c50b84f23dc664bbe2bf2b` |
| CycleSim | `simulator/include/zeus3/data/dt_engine.h` | `78ddb541fa38fcf15a0c666aabec6697db445fd001ba00b4215c6a1de476fc9f` |
| CycleSim | `dev_docs/sim/vp_dt/63_dt_intfpred.tsv` | `dbce7aa1e29404580883cbad8da2a51716585e7c6f579798f165fdb8e61ac30f` |
| CycleSim | `test/dt/rtl_tb/tb_dt_l2.v` | `da046772d7c89cd0aba3749ca1246030bc0cb005037b8897a226157ed512f5b2` |
| RTL reference copy | `zeus518/vp_v3/sub_module/ctrl/vp_518_wr_addr_gen.v` | `5c63e742abccd71b30e2dc581126a09b7715e568ba5ca66b3d1151963e91cf4e` |
| RTL reference copy | `zeus518/vp_v3/sub_module/cal/vp_518_acc.v` | `c5603167dd3ecc4e321878a765c2b5998bbabdd67de476097d099139d44952e1` |
| RTL reference copy | `zeus518/vp_v3/sub_module/cal/vp_518_acc_tree.v` | `a5e7b40a5ec0ce74415e4df4c21fc0983679442ffd11e410052bba2411ea4892` |
| RTL reference copy | `zeus518/vp_v3/sub_module/cal/scl/vp_518_square_root_div.v` | `8047cfdc50e050258626377b81b50aad587c5969bbc83032a40ac10c6ce7211f` |
| RTL reference copy | `zeus518/dt/dt_inst_parse.v` | `2b4a60d0056f07abf8e18090a54af83f2bb5de5e53153b9fa865586930b3b729` |
| RTL reference copy | `zeus518/dt/rd_dtbuf_ctrl.v` | `20512679d92f93e5e17fc127ab0b9177025a213aba6df29eb9d4a4025e2af0b6` |
| RTL reference copy | `zeus518/l2buffer_ctrl/rtl/z518_l2_l2buffer_ctrl.v` | `44a2022879adef52e1b1d7dfdd03983ff836fb7825c981a492e6874d624bd05e` |
| CycleSim | `CLAUDE.md` | `bbb56b59c424193d52e885f0267ccbe665157c13130d2d4252eee46152e6ce51` |
| CycleSim | `simulator/include/zeus3/tensor/pe_engine.h` | `1908864c00fa0abe5961ee3acb59b90839cd53191bc4d9841ab3ad0ffc6a23bb` |
| CycleSim | `simulator/include/zeus3/tensor/pe_int4_timing.h` | `baa9a7f913516be9c241d1fbd35af2b8826d27f2cb14ee18de215c7709edccbb` |
| CycleSim | `simulator/include/zeus3/tensor/pe_int4_consumer.h` | `1fb2f161f295f7c24e231be1de5b1f628c030f14fe85517c00d14a7abced9760` |
| CycleSim | `simulator/include/zeus3/tensor/wl1_int4_path.h` | `2e0aa0d1722686cda8ee77eb1315ee6e7fadd630d1028a8093022a0b461c04d6` |
| CycleSim | `test/pe/rtl_tb/pe_cmd.py` | `4cdd51fceacb2cd44fbd9933fa7edff16e747c75db0d042bbf9e94fbf9ee73f7` |
| CycleSim | `test/pe/rtl_tb/measure_pe_array.py` | `c569bb5c0737612efe70c9916346a9918746a0ba3449d5f8bbe6101b705df790` |
| CycleSim | `test/pe/rtl_tb/tb_pe_array.v` | `c96fab8fe7d2297e43f901476ece60d8fe882e9eecdec10a092ab9874cfae96e` |
| CycleSim | `test/pe/rtl_tb/measure_pe_mt.py` | `2740da4f477711c859f99544e9907fa999e89d3f14c03ef4133ce48aef2c67c7` |
| CycleSim | `test/pe/rtl_tb/tb_pe_mt.v` | `d44c96af5b4480f57d9fac5c33efebc8db1018e32d4e8ea194967f358820070f` |
| CycleSim | `dev_docs/sim/pe_weight/72_pe_envelope.tsv` | `5b4fe5bd2a397623d5656c85a88654287ed80e05ade61fd8182ddcf90be2bd29` |
| CycleSim | `dev_docs/sim/pe_weight/72_pe_mt.tsv` | `949aad24a4aeadcf9ac4537d35c8735f48ccfceea49cb320fe3939a967f8f50f` |
| CycleSim | `dev_docs/sim/pe_weight/72_pe_calibration.md` | `84b6111f04482383d923e98cadb0f4d0afeba4137cd59fba8e2371e4d9e8b33d` |
| CycleSim | `test/pe/int4_rtl/cases.tsv` | `5995dc892fb101c522f4736688f5e9ea2dd90e76d682d7200f8477caf510077e` |
| CycleSim | `test/pe/int4_rtl/README.md` | `b0d409154cfe30c4657be9db33641aa56a9f436e7cd7fd3c3bc8114a7fa00d86` |
| CycleSim | `test/pe/int4_rtl/vcs_repeats.json` | `53276bd75f142229a3de81bc442151ebdeb3b8f3a916f55162da5971bfc14eed` |
| CycleSim | `test/pe/int4_rtl/issue16_calibrated.json` | `105da1a8bc59a70ea314cb3a43c0d2cc6d59f4c333900bd442ec18655286d607` |
| CycleSim | `test/pe/test_pe_int4_wave.cpp` | `37833cd9ef579b49374439068c7baf689ab05955baa5d2b1ba064cffafc99557` |
| CycleSim | `test/pe/test_pe_int4_calibration.cpp` | `0f13899462bcf30a803b87a2dab425cade312d26a57e82bd047c85f10dcfde8e` |
| CycleSim | `test/wl1/int4_wave/provenance.json` | `0b8a1b3828a345b1d37a3e0f80cbadbda2a6ed5ec5f4a72d03f64b0e2ce4af8d` |
| CycleSim | `test/wl1/int4_wave/README.md` | `c32002f6dd1fa96970275a236eb594f105738aaed9c05520ed76ef8b289c5d12` |
| CycleSim | `tools/src/sim_daemon.cpp` | `54464f0a30814a9581dc1dc762929399bb45281d6c85646bb91e743f00046a0a` |
| RTL | `zeus518/pe_ctrl/pe_ctrl_logic.v` | `f52913bf2bbd4cba3b85974cbe67fedd6874466f2dc42e0bd5deafe94db9eb7e` |
| RTL | `zeus518/pe_ctrl/pec_pipelines.v` | `3bf715bc9c80ed82cec6c75bfad94a9ad77c72f67bbad29414f445282973e6c2` |
| RTL | `zeus518/pegroup/pe518_al1.v` | `5f35c60924b10919c20575c72e3c557b525835133e12056a42f642010ccfa887` |
| RTL | `zeus518/pegroup/pe518_al1_mt_coord_cal.v` | `e892c578ddae91c3c31b85b75db16c9e7465b748b75efb9b006b5b18f5fafd13` |
| RTL | `zeus518/pegroup/pe518_alu_ctrl.v` | `67efd29a15325f3266f43cd2365a8a2f1db148927870bb3b0327c169cd49dc4b` |
| RTL | `zeus518/pegroup/pe518_ol1_ctrl.v` | `76972f03bc8d29f44e9257e7de402a4c618c13c7abbed65ad8447e15555df11e` |
| RTL | `zeus518/pegroup/pegroup518_dt.v` | `e7ce490d584a77c69226ff4cf3bd152a218ed6e2183678fc0617c617e0b34cfb` |
| RTL | `zeus518/wl1/wl1_518_uscale_ctrl.v` | `a903434d465fdb84cb81468af77fd36389607778e64dce15f2d49a844603956c` |
| RTL | `zeus518/wl1/wl1_518_rd_buffer.v` | `65feb4f1af5f50030240d49941d09d9fc48ee314dc2acf9d2379e1feafb54bf1` |
| CycleSim | `simulator/include/zeus3/base/chip_config.h` | `9c103de39ff1570b6a42634ef69defc920823fff3f791158ad67978e1e452e70` |
