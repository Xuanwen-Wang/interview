# VP 深度改稿：RTL 接口、吞吐与执行合同复核

日期：2026-11-15。范围为本地只读 RTL 核对与条件式算术推导；未运行 VCS、CycleSim、综合或硅上测试。源码树 `design` 不是 Git checkout，revision unknown；README 描述它来自某个历史 tag 的部分参考副本，但该描述不等于整树经过版本认证。

本轮重算既有2026-11-14摘要中的57份design文件，全部匹配；新增核对Core集成顶层、当前DT顶层及decode。旧证据里的详细内部接线继续由这些相同文件支持。本文件记录新增结论与当前最容易误读的边界，逐文件SHA256列在文末。公开正文只使用仓库相对路径。

<a id="system"></a>
## Core 拓扑与数据接口

| 实际来源 | 一基行号 | 确认事实 |
| --- | --- | --- |
| `rtl/zeus518/zeus_top/zeus_core_top_pwr.v` | 7729、7773、7817、7862 | 实例为 `dt_top_inst0…3`，每Core四个DT；旧 `dt_wrapper` 不是这里实际实例化的外壳 |
| 同上 | 7756–7771、7799–7815、7844–7860、7889–7905附近 | 每个DT分别连接L2的读返回、写数据；数据宽度256 bit，不含18-bit ECC；无DT→VP直接数据线 |
| `rtl/zeus518/dt/dt_top.v` | 52–64 | 每路读/写数据256 bit，2-bit strobe；不能误用旧wrapper的4-bit strobe说明当前集成协议 |
| `rtl/zeus518/dt/dt_decode.v` | 32、197、391–411 | format字段送入读写与数据路径；本章只列8/16-bit的载荷换算，不因256/32=8就宣称所有32-bit DT重排模式已验证 |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_zeus_top_wrapper.v` | 286、351、416、481 | 四个独立VP顶层实例 |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_top.v` | 3–5、17–34 | 单VP有Core/VP两个时钟入口，读返回与写数据各1024 bit，8-bit strobe，72-bit ECC另计 |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_cdc_top.v` | 130–194、317–577 | 普通实现跨域通路；不能默认Core与VP同一时钟 |

1024 bit=128 B，256 bit=32 B是接口容量，不等于每拍实际有效字节。4个VP端口的128 B相加也不证明任意访问模式都能获得512 B/cycle的持续L2供给。两根数据方向箭头应分别标注读/写，ready反向线不当作数据方向。

<a id="throughput"></a>
## 普通张量路径的32/64元素口径

明确适用范围：非归约、普通连续逐元素、合法配置、完整非尾组、持续供数与接收。类型分支限本次实际使用的INT8/FP8 E4M3、BF16、FP32；不能将“无论类型”扩大到RTL端口未覆盖的任意数据类型。

1. `sub_module/pre_cal/vp_518_pre_cal_fi2fp_group.v:90–137`：64个转换槽；FP32输入或pipe模式仅低32槽有效，其余普通窄输入为64槽。128B物理总线不等于128个INT8的计算宽度。
2. `sub_module/ctrl/vp_518_rd_addr_gen.v:530–557`：`rd_32line_cfg=pipe_mode`；pipe的FP32/BF16/8-bit组地址增量分别为8/4/2个16B单位，wide对应8/8/4，即有效组为32/32/32和32/64/64元素。并非pipe先吞入64个BF16再无条件双拍分发。
3. 同文件 `1227–1231`：X/Y选同一读地址出口；普通完整两tensor操作需要为X、Y各付一次读包服务。一个64B有效pipe BF16包仍占一次接口事件，不可将另一tensor的64B自动塞进未用半包。
4. `sub_module/cal/vp_518_cal_group_top.v:874–943`：wide输出数据为{B,A}；pipe为{零,B}，只含32个有意义的结果。pipe的valid/end实现复制B两份，不能写成“RTL高半valid恒零”。
5. `sub_module/post_cal/vp_518_p2s.v:139–152`：pipe在P2S分类为32-lane输入；只有普通wide窄输入→FP32输出启用split。
6. 同文件 `190–236、297–307`：pipe→BF16一组32元素，64B有效，strobe为低4个16B块；pipe→8-bit一组32元素，32B有效。该实现不将多组结果紧凑拼成128B后再输出。wide64→8-bit也只有64B有效。
7. 同文件 `327–336`：wide64→FP32保持当前输入组，先低32、再高32输出；非尾组第二次发送才让上游完成消费，因而写侧稳态上界32结果/VPcycle。

| 模式及输入 | 有效组q | 输出8/16-bit | 输出FP32 |
| --- | ---: | ---: | ---: |
| wide，8/16-bit输入 | 64 | 最多64结果/VPcycle | 最多32结果/VPcycle，64结果分两写拍 |
| wide，FP32输入 | 32 | 最多32结果/VPcycle | 最多32结果/VPcycle |
| pipe，支持的任一输入格式 | 32 | 最多32结果/VPcycle | 最多32结果/VPcycle |

以上还没有纳入第二tensor读流。相同输入格式、无广播复用、每个有效组的X/Y各单独读一次时，理想读包上界为q/s，s为1或2；写侧为q/w，w为该组需要的输出包数。因此可使用 **R≤min(q/s,q/w)** 作为归一化接口服务与计算域同速的结构上界。双tensor BF16 pipe时q=32、s=2，读侧上界16，而不是单凭有效字节128/(2B×2)=32。

不要把这一服务槽模型当真实延迟：Core与VP时钟、CDC、L2仲裁、非对齐/尾部、FIFO依赖、装表、配置、反馈和排空仍会限制实际执行。Scalar输出、TopK packet或归约模式需单独合同。

### 元素率与算力换算

给定明确的VP频率f、参与VP数n及每个结果实际算术计数a：
`FLOP/s = R × f × n × a`，除以10¹²得到TFLOP/s。TOPS只表示每秒万亿次已定义操作；浮点路径优先写TFLOP/s。加/乘各计一次，查表、旁路、搬运、比较不能未经定义混入同一FLOP分母。

以f=400MHz为条件，单VP的R=64/a=1对应0.0256 TFLOP/s，四VP为0.1024；R=32/a=1对应0.0128和0.0512。a=2则翻倍，表示每结果确有两次基础算术，而不是宣称硬件存在单舍入FMA。每组引擎的SUM0、MUL、SUM1均为32-lane位置；算术级全部相加得到的是特定占用条件下的运算计数，不能作为所有算子的统一输出能力。

<a id="pipeline"></a>
## 固定算术链与操作数配对

- `sub_module/cal/vp_518_cal_group_para_engine.v:301–308、483–727`：DIP→SUM0→PRG→MUL→FLOOR→SUM1→SHIFT，使能/旁路仅在固定位置选择。
- `sub_module/cal/prl/vp_518_fp32_mul_group.v:175–214`：MUL第二源在scalar/反馈、FIFO、PRG.k、当前主流自身间选择；self不代表重新获得流水入口的旧X。
- `sub_module/cal/prl/vp_518_cal_fifo.v:83–118`：Y、PRG.b、FLOOR.s、DIP.s共享单写入口，ready并非独立仲裁承诺；16×1028项包含1024-bit数值和标签/end信息。
- `sub_module/cal/prl/vp_518_cal_fifo_demux.v:62–91`：队头tag、consumer enable与出口缓冲决定路由，不存在任意绕过队头读取后项。
- `sub_module/cal/vp_518_cal_group_top.v:719–732、819–832`：SHF旁支跨A/B；scalar PRG参数仅连A侧FIFO。
- `sub_module/pre_cal/vp_518_pre_cal.v:222–494`：DISPART、转换、X/Y分流、参数CONCAT、Y元素广播与固定lane置换是不同功能。
- `sub_module/post_cal/vp_518_post_cal_group_top.v:119–225、229–240`：PostCal乘→加减→格式转换→P2S；接受末输入后保持working直到末输出握手，不能把最后算术valid当done。

模块精确符号、FLOOR负号、SHIFT指数语义与PRG的k/b分路继续参见[双向量流水证据](vp-vector-pipeline-rtl.md)。这些相关文件本轮hash均与既有记录相同。

<a id="state"></a>
## 归约、标量与状态寿命

- `sub_module/cal/vp_518_compare_tree.v:153–260、308–317`：acc/par/tree模式不同。
- `sub_module/cal/vp_518_acc_tree_group.v:178–221、247–285`：有效lane/尾部/维度结束配置、tensor acc/bypass与树支路共同推进条件。
- `sub_module/cal/vp_518_cal_group_scal_engine.v:195–200、211–437`：DIP_s→PRG_s→MUL_s→SUM_s→SHF_s→SQR_s→S2P。
- 同文件 `392–393`：反馈源是SQR后、S2P前的scalar valid/data，SQR本身可旁路。
- `sub_module/cal/vp_518_cal_group_scal_register_demux.v:47–72`：按固定目的编号更新对应系数寄存器并经过延迟级；不构成通用寄存器文件。
- `sub_module/cal/scl/vp_518_s2p.v:58–94`：连续scalar放到不同lane位置；它是输出组包，不是把一个系数广播到所有lane。
- `sub_module/cal/vp_518_mask.v:109–179`：保存赢家值/索引并屏蔽后续扫描，不破坏L2原tensor。

正文中的“产生系数→消费旧系数→允许覆盖”是调度必须满足的合同，不能仅据存在反馈寄存器就宣称当前RMSNorm lowering已采用该路线。数学窗口部分和验证范围不代表硬件每一树级的逐拍或逐bit复现。

<a id="control"></a>
## 配置、等待与完成

- `sub_module/ctrl/vp_518_inst_decode.v:1399–1415、1627–1775、1794–1955`：start/accept/done来源与RD/PreCal/CAL-PostCal/WR配置分流。
- `sub_module/cal/prl/vp_518_diff_disconnect.v:77–127`：命令边界与X-only/Y-only占位控制的是握手，数据并非另一层算术变换。
- `sub_module/ctrl/vp_518_wr_addr_gen.v:925–1036`：写请求/响应的分组记账、末组状态和普通done；PRG load采用独立完成分支。
- 普通写最后请求已接受但有未返回响应时，不能据此宣布完成。教学pending=0模型表达协议，不等同RTL计数器的实际偏置编码。

## 文件指纹

所有路径相对design；来源树只读。下表为本轮新计算的完整文件SHA256，非Git树无commit可报告。

| 文件 | SHA256 |
| --- | --- |
| `README.md` | `e070a286a2a00c4a2dd593fb8063b426d4ae656ee68a7060630c3d583de702cb` |
| `filelist/filelist_vp_518_top.f` | `e68b20fbfde7a4a1c17e0d9f70766c3a85b2ff76495d7982c0f6c66857151cb9` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_cal_fifo.v` | `5254f254deda2309c2c8d08818af76e25e83f23e6223719470ac5d43f474bea0` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_cal_fifo_demux.v` | `8d13f47776edd5014778283770ab4fc712f71425073d1f4da3b0b321312c3c9f` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_cal_relu.v` | `c4dedbdb56e2a3e0d7419defe8769478789f239d1ce6dd3cc6483b99d3240564` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_diff_disconnect.v` | `aa3666a90237727a3cbd60d866145d5f7558926044f6167500585c29a3efed84` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_dispart.v` | `c821fa8667f64dcb7b028eb0c252113e6dd48f2152d35062795fa1649e8fd2ec` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_dispart_group.v` | `803f6f3c08fbd855bb944e4d8273e2228f79b7c2db3a457ad9b5fc4a7f4f585b` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_floor.v` | `391ffd488966f0b243f15a91b1a6725ee6421c989c03ab0321600bb6bafe425b` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_floor_group.v` | `025730931ef3b76618d4d6ffe0d96d7d039a3ca5d3a4d422c06f264dce5d19f5` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_mul_group.v` | `e0d9fdd603db9dd63d0e720041f5867a56a14fae36aa72b04fafa374adeb9a18` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_shift.v` | `c8095231931f8864de38da7d391331a2552236a761aee54e0c545f1559cf2bc7` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_shift_group.v` | `6013da6d62dc77f1abe75378a2c25430e48b8a5c5a6048b4bfb90d60434b53fa` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_sumsub_group0.v` | `d2cdd0b78a178cc0481db21e058b4d91c44eab6b1a327d9edb78f79fcea393ed` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_sumsub_group1.v` | `9e50ae8be9ca918b29f08887e58bde7b3632909cc7fa6b209092601f2e7b5ebf` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_param_gen_group.v` | `a3e81c8e05aa4acc394b0d9673053747d78373f1d64d3166e572bd1c2a8ba580` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_param_gen_self.v` | `149cccadc78e208cb92ad01e88749252b6d8137adf5f9023943c9070f8a0f25d` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_param_gen_self_sub.v` | `941083577c29d01960f0dd654dd5e83e5e23d75a896898c3fc344f30f00f6bb4` |
| `rtl/zeus518/vp_v3/sub_module/cal/scl/vp_518_s2p.v` | `0766b6d0dc9a4cc4f858562771ff93b4e3e280eac9fba147305ef4c4ea407727` |
| `rtl/zeus518/vp_v3/sub_module/cal/scl/vp_518_s2p_scalar.v` | `72b0307d6d6ce784c0a9347170a5c16f8a065f2648fcd5e0d0ad1e66f0792f1d` |
| `rtl/zeus518/vp_v3/sub_module/cal/scl/vp_518_square_root_div_scalar.v` | `0ef9f8e183f7d46a7123def062d9dfd59623a012913548512e0e30dfa581b4dc` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_acc_tree.v` | `a5e7b40a5ec0ce74415e4df4c21fc0983679442ffd11e410052bba2411ea4892` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_acc_tree_group.v` | `e60173cff57c90eea15d7c7a8e33fd5acbea9db0e4cec77b7f81212fc57c13c5` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_para_engine.v` | `875dec6d9b6a082a87c0416a007cde52325d58f984fbe0aad3c3985b64a8333a` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_scal_engine.v` | `2bd1203fff3a39b1060de135bacadc994506fe7398b95f26212e7f5c3a1c1ea3` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_scal_register_demux.v` | `3c16819a458f431c6b4238a366e3dda6badb578aa3ae15fb1087a412621a5cb4` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_top.v` | `2b00edceb4b2be634022cae5ef951f5309cae2e4b61fa6891303c0d651a9e823` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_compare_group.v` | `0eb1ca772497a352ccfd4f34e2414a0a987dea78b1991336e7039f183e161279` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_compare_tree.v` | `d991bf9809d0b123c6551dabf3bdc87a7b69aaafcf783f122607a324bb989a2a` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_mask.v` | `c74654814100789f3e09b4c99be1b643e7015e8e3737e07a0d7652ebbcd88f29` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_mask_group.v` | `a9f63d08135f7b6008a057e8d0b171b97040ab1e76f95b7abcccd606d767e3ac` |
| `rtl/zeus518/vp_v3/sub_module/common/vp_518_out_mux.v` | `19fe73a8f780a6638daaa57d0b4f6541315a99748cc5ca3e106fea9108ff8e7a` |
| `rtl/zeus518/vp_v3/sub_module/ctrl/vp_518_ctrl_top.v` | `3bfb840f0409ff214c33b67ec6ea1769103dd8f581269f7891b3fa6375113fc3` |
| `rtl/zeus518/vp_v3/sub_module/ctrl/vp_518_inst_decode.v` | `404c0c401619a455f71c40fe16d69c05302cc645e55e938c2780925fb4e57d26` |
| `rtl/zeus518/vp_v3/sub_module/ctrl/vp_518_rd_addr_gen.v` | `fe709b87fc2aa6813bac33efa7ddceb6943699b8bf12ac7003bacbc1919d3d68` |
| `rtl/zeus518/vp_v3/sub_module/ctrl/vp_518_rd_addr_gen_top.v` | `721ea39c56b59ac44d4cbd062f95fa35ed7c1a6eed8d2a822527152f89b1d05c` |
| `rtl/zeus518/vp_v3/sub_module/ctrl/vp_518_wr_addr_gen.v` | `5c63e742abccd71b30e2dc581126a09b7715e568ba5ca66b3d1151963e91cf4e` |
| `rtl/zeus518/vp_v3/sub_module/post_cal/vp_518_fp2fi_post_group.v` | `8b0fd0d6ec19cddc3a88fe4423648370ff42e82404a797a809d14371895a92bc` |
| `rtl/zeus518/vp_v3/sub_module/post_cal/vp_518_fp32_mul_post_group.v` | `af873f21090b376a37da86afe5a4fa22600480071db2905356fa1e97103fb79a` |
| `rtl/zeus518/vp_v3/sub_module/post_cal/vp_518_fp32_sumsub_post_group.v` | `0c1f4a5665d1ba478151a72f6bf96fe3bdf2808cc82d7e0e132ceb6460a2129d` |
| `rtl/zeus518/vp_v3/sub_module/post_cal/vp_518_p2s.v` | `513ce1f12284eb44f83b5f2861ecf6a17a5b3b0a410565b4a121488cd97e91d7` |
| `rtl/zeus518/vp_v3/sub_module/post_cal/vp_518_p2s_post_group.v` | `575bf9d80e14643c4746d52fd25884cc8fe8f01d09ab90f7ebdad4541524313f` |
| `rtl/zeus518/vp_v3/sub_module/post_cal/vp_518_post_cal_group_top.v` | `23d0c309ba3654f94d4754b4734760888811e5fa04aed708d80bc08f3f3d7530` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal.v` | `88b3fb6cb77473288ec6ed56b0d9aaee3f02f97e8f002f0ca2c07839e3466ec5` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_concat.v` | `5650720ddc57aa2e17436594458a561192c93551d24739d13b81d9d82a7b9204` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_data_distr.v` | `e3aaabd955cf832fd84dccb3a7be920868785078b85d26b2a71322d5115a1956` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_data_mux.v` | `969538f42b063fa140e89e4842411e0e887759b67145c2c65570e51dd512f915` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_dispart.v` | `56c1f13a7acb4c4bcf082643fc8e6939af3c2058ca267bfd80ed15edb32b363d` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_fi2fp_group.v` | `79c7bfe2690a5b4545031d2e9bed5cb56bfa3c9b520f7d9c317488a33279d198` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_re_quan_group.v` | `f23b5cef94f8cf8d85aa3dd9e2cb1a1c0095fe5c611c22a8a7b84cfd01909766` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_split_send.v` | `0410b8e4da0d51ffb706d287b56ce5f87940c2dea5b4ce293c1fb6cac4e9a14c` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_cal_top.v` | `5ad558f3ef001bdfae9e8841b600179a75276a03ebbaba3202a187108ad640b2` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_cdc_top.v` | `b3d15ea6ef972df7092cdb7bc5d4c645b6334de4447cfc41d02499c1f46bb4d9` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_ecc_gen_check_top.v` | `9d031b70a2c4463f1f5c2a1220139a4a9af4a24c2457c44b3e1314913f9a76fa` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_top.v` | `079dfa45a99cd6fe111cd396830a540df10d38d4ef638e8eed06309819f8f06b` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_zeus_top_wrapper.v` | `935caed412d2bb186ad43d90e9214144a6a792edc00875fcc8f543bdcf9ea3d5` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_macro.v` | `aa5db213a1441b10f9400cd9ab4240254d5574984861a7faed7f18e5bff566dc` |
| `rtl/zeus518/zeus_top/zeus_core_top_pwr.v` | `73f8f2a6f7a0f6bb6a2612db10875a160894b4bcd7550d7df8267643172fca40` |
| `rtl/zeus518/dt/dt_top.v` | `46725aa8df39feb7363a0575f47ceaf725bfcc15eaf6bf4fc41e06474427287d` |
| `rtl/zeus518/dt/dt_decode.v` | `69670f8f19bbc545515233aa949cda480efe1d829b64cebedcca03e845ad213f` |
