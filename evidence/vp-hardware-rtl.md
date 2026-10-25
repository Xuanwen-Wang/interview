# 518 VP 硬件架构：RTL 证据与边界

<a id="vp-scope"></a>
## 副本范围与验证层级

采集日期：2026-10-25（Asia/Shanghai）。核对对象为 **Zeus518 `design` 本地只读参考副本**，不是 Git 仓库。其 `README.md:1–20` 声明：主要 RTL 是 `tag_PN100_R1_20250928` 的部分拷贝，2026-07-03 拷入，副本最后整理日期为 2026-09-19；README 同时登记了其他模块的已知副本差异。因此这里用“标签来源说明 + 逐文件 SHA256”固定本次依据，不声称整个目录与该标签逐字相同，也不把副本日期解释为芯片发布日期。

本文核对实际实例连接、位宽、generate 循环、选择条件和数据转换公式；没有运行 RTL 仿真、综合、板卡测试或新的性能实验。下面所有事实属于**固定副本源码行为**，容量与接口带宽换算属于**静态推导**。它们不能证明持续吞吐、全部指令合法组合、软件默认配置或端到端模型加速。

下文路径均相对 `design/`。全文不转载业务源码，不发布原始 RTL、内部地址或个人目录。`vp_macro.v:1–42` 含流水开关及被注释的 dummy 开关；实例连线描述的是实模块路径，运行时还需确认实际编译宏与 filelist。

<a id="vp-topology"></a>
## 拓扑：每核四个 VP，单 VP 有两组 32 路流水

| 事实 | 源码定位 | 可以怎样表述 |
| --- | --- | --- |
| core 顶层实例化 VP wrapper | `rtl/zeus518/zeus_top/zeus_core_top_pwr.v:7558` | 这是每个 core 内的 VP 子系统入口。 |
| wrapper 显式实例化四个 `vp_518_top` | `rtl/zeus518/vp_v3/top_wrapper/vp_518_zeus_top_wrapper.v:286,351,416,481` | 每 core 有 VP0–VP3 四个执行器；实例名中的 `core0` 至 `core3` 指 wrapper 内的四个 VP，不是额外四个芯片 core。 |
| 单 VP 算术组的 `LANE_NUM=64` | `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_top.v:212` | 不能只看一个子模块就把单 VP 说成总共 32 lane。 |
| 两组并行引擎分别名为 `lane_00_31` 和 `lane_32_63` | 同文件 `:674,774`；输入拆分 `:633–643` | 单 VP 内有两组 32 路 FP32 数据流水。 |
| 单组乘法用 32 路生成循环 | `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_mul_group.v:56–57,219–240` | 32 是该算术组的 lane 数，每 lane 32 bit；不是 VP 执行器个数。 |
| `pipe_mode=0` 时合并两组结果，`pipe_mode=1` 时 A 组输出经流水接 B 组 | `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_top.v:874–943` | 可称“宽模式双 32 路”和“串接模式 32 路更长计算链”。这是数据路径关系，不是每种 dtype 都能持续达到 64 元素/拍的承诺。 |

宽模式输出拼接为 `{B,A}`；串接模式输出低 32 路来自 B，高 32 路数据填零。串接还涉及对应 valid/end 标志与归约掩码，不能把填零的高半视为另一组有效结果。FP32 输入与串接模式在归约入口使用低 32 路有效掩码，见 `vp_518_acc_tree_group.v:182–190`。

<a id="vp-io"></a>
## L2 接口、两源读取和描述符

`rtl/zeus518/vp_v3/top_wrapper/vp_518_top.v:18–34` 给出每 VP 的接口：

- 一组读请求 `valid/ready + 15-bit addr + 8-bit strobe`，一组读回数据 `valid/ready + 1024-bit data + 72-bit ECC`。
- 一组写请求 `valid/ready + 15-bit addr + 8-bit strobe + 1024-bit data + 72-bit ECC`，以及独立的 `wr_rsp`。
- ECC 包装器以 8 组 `ecc128gen` / `ecc128correct` 工作，见 `vp_518_ecc_gen_check_top.v:100–111,175–190`。1024 bit 是 128 B 有效数据，72 bit ECC 不算用户载荷。

**条件换算**：假设每拍该端口握手一次且数据全部有效，单 VP 单方向的接口上限是 128 B/拍；四 VP 同方向端口位宽求和为 512 B/拍。这只是端口上限，未核对整个 L2 的 bank 争用、其他执行器流量、反压与实际时钟，不能写成已经测得的带宽，也不能据此保证四 VP 线性加速。

两源读取不是两条独立 L2 读总线。`vp_518_rd_addr_gen.v:24–42` 接受单 tensor、双 tensor、tensor+vector、参数加载等模式及两组起始地址；`:517–523` 列出读模式；`:629–637` 选择 X/Y 基址；`:1227–1231` 把 X/Y 地址复用到同一个 L2 读口。双 tensor 的 W/H 广播由两个 tensor LUT 的维度使能控制，相关偏移在 `:559–581` 为维度禁用时取零。不能把“最多两个显式 tensor 起始地址”解释成最多两个算术操作数：scalar 配置、PRG 表、内部 FIFO 和反馈寄存器也能提供系数。

描述符/控制不仅包含指针：`vp_518_rd_addr_gen.v:33–67` 接受 dtype、tensor mode、W/H/C 尺寸、offset、读次数、loop 区域；`:99–109` 定义格式和 tensor 维度位；`:532–540` 区分 WHC/CWH 访问及 32/64 路相关读粒度。地址跨 loop 区域和 strobe 拆分在 `:1234–1313`，地址错误类型在 `:1382–1414`。这证明访问布局和边界信息参与地址生成；不等价于任意 Python stride 或任意负 stride 都受支持。

<a id="vp-pipeline"></a>
## PreCal → 可配置计算链 → PostCal

顶层依据：`rtl/zeus518/vp_v3/top_wrapper/vp_518_cal_top.v:254,313,481` 依次实例化 `pre_cal`、`cal_group_top`、`post_cal_group_top`。完整 VP 还含 ECC、CDC、控制模块，见 `vp_518_top.v:379,419,538,694`。

| 阶段 | 直接源码依据 | 架构含义 |
| --- | --- | --- |
| PreCal 展宽、重排及类型转换 | `sub_module/pre_cal/vp_518_pre_cal.v:77–79` 为 1024-bit 入、2048-bit 出、64 lanes；`vp_518_pre_cal_fi2fp_group.v:44–50,89–100,116–125` | 低精度搬运数据展开成内部 FP32。FP32 单次输入只有低 32 路，预处理还有 concat / split / mux，不能仅按接口位宽猜完整时序。 |
| FP32 拼接 | `sub_module/pre_cal/vp_518_pre_cal_concat.v:63–85,99–109` | 非 bypass 模式记录两次输入后产生拼接有效数据；不是额外翻倍的 L2 口。 |
| 向量算术 | `sub_module/cal/vp_518_cal_group_para_engine.v:483,513,547,588,625,659,699` | 实例链包含 dispart、sum/sub0、PRG、mul、floor、sum/sub1、shift；配置位控制使能/bypass与系数来源。不要把它画成可以任意连接的 GPU 通用寄存器 ALU。 |
| 比较、归约、标量 | `sub_module/cal/vp_518_cal_group_top.v:538,573,947,1020`；`vp_518_cal_group_scal_engine.v:211,237,283,327,364,394,419` | Mask/比较树、sum/acc tree、标量计算与 scalar-to-parallel 通路共同支持跨元素操作和反馈。 |
| PostCal | `sub_module/post_cal/vp_518_post_cal_group_top.v:119,140,162,200` | 后处理乘、加/减、格式转换、P2S/打包；输入是 64×32 bit，输出回到 1024 bit（`:45–60`）。 |

向量乘法系数可来自 scalar、FIFO、PRG、输入数据，见 `vp_518_fp32_mul_group.v:67–70,199–214`。标量反馈目的寄存器分配可见 `vp_518_cal_group_scal_engine.v:70–77`。这些路径解释为什么融合需要检查系数、布局和状态是否兼容；它们本身不证明任何特定编译器融合已发生。

<a id="vp-prg"></a>
## PRG：分段选参数，再由算术流水求值

`sub_module/cal/prl/vp_518_param_gen_self.v:58–67` 为 breakpoint、k、b 各声明 64×32-bit 存储。参数以 32×32-bit 输入，计数器按三次有效参数输入依次选中 breakpoint、k、b，见 `:84–105,114–170`；32/64 段选择在 `:174–176`。每个 32-lane `param_gen_group` 实例化一份 `param_gen_self`（`vp_518_param_gen_group.v:215–249`），其参数被 32 路查询单元共享（`vp_518_param_gen_self.v:179–213`）。

**容量推导（单个 32-lane 并行 PRG 表）**：`3 × 64 × 32 bit = 6144 bit = 768 B`；32 段的有效表载荷为 384 B。768 B 指这三个参数数组的物理位数总和，不含控制寄存器、FIFO、标量 PRG，也不是整 VP 通用 SRAM 容量。两组并行引擎各实例化参数模块；不应将 lane 数乘进共享表容量。

`vp_518_param_gen_self_sub.v:174–220` 比较输入与 breakpoint，按 32/64 段选择 one-hot 索引；`:222–226` 取对应 k/b。随后乘法和加法模块消费参数，可以表达分段仿射求值。若使用对称/旋转模式，还会变换符号，见 `vp_518_param_gen_group.v:204–210`。这是函数近似的硬件机制，不是“硬件直接精确执行 exp/sigmoid/SiLU”。具体函数表、区间、误差与组合顺序必须另外绑定编译器/算子版本。

`vp_518_param_gen_group.v:27` 的旧注释提到 `2:128`，但该端口只有 1 bit；实际数组和选择逻辑只证明 32/64 段。本文不依据旧注释宣称 128 段。

<a id="vp-reduction"></a>
## 归约与有状态 Mask

`sub_module/cal/vp_518_acc_tree.v:23–55` 区分 tree/acc，并定义 C-only 与 WHC-all 两种 tree 维度；`:123–160` 描述树形加法连接，`:263–276` 区分 64 路 acc 输出与单个 32-bit tree 输出。`vp_518_acc_tree_group.v:179–192` 使用 C 读计数、WH 计数与尾块有效 mask；`vp_518_inst_decode.v:955–963,1040–1052` 从比较/累加模式和维度字段计算范围。

因此可以解释“沿硬件 C 归约”和“整个 WHC 区域归约”，但不能直接等同于前端任意 `axis=0/1`：前端轴要先映射到描述符的 C/W/H。树形、顺序累加与分块组合会改变浮点加法顺序，数值合同必须随实现验收。

`sub_module/cal/vp_518_mask.v:55–57` 给出 16 个结果槽和 64 路输入；`:109–151` 保存比较树赢家的 value/index，在相应结束事件与 clear 位条件下清除或更新；`:161–179` 对已命中的位置代入 mask value。该实现支持多轮比较时记住已选位置，不能等同于普通无状态逐元素 select。5-bit `top_k_value` 中高位参与结束/清空时机（`:106`），低四位选槽（`:122`）；不能用字段总宽推断有 32 个槽，也不能只凭这段 RTL 断言编译器所有 TopK API 的合法 K 上限。

<a id="vp-numerics"></a>
## 精度：核对被实例化的转换器

本次连接核对发现，实际 PreCal 使用 `vp_518_i2f`（`vp_518_pre_cal_fi2fp_group.v:116–125`），实际 PostCal 使用 `vp_518_f2i`（`vp_518_fp2fi_post_group.v:100–122`）；两文件列于 `filelist/filelist_vp_518_top.f:78–79`。旁边旧 `raw2float` / `float2raw` 文件名虽然直观，不能替代生效实例链。

| 项目 | 证据 | 正确边界 |
| --- | --- | --- |
| 外部格式 | `vp_518_pre_cal_fi2fp_group.v:44–47`；`vp_518_post_cal_group_top.v:32–33`；`vp_518_f2i.v:122`、`vp_518_i2f.v:170` | 本路径的格式选择是 INT8、FP8 E4M3、BF16、FP32 四种。底层端口/旧注释里出现 INT32 或其他常量，不构成这些 tensor 路径支持其他格式的证据。 |
| BF16 展宽 | `vp_518_i2f.v:197–210` | 正常数保留符号、指数并将 7-bit 尾数放到 FP32 尾数高位；特殊值还有独立处理，不能只靠位拼接概括完整合同。 |
| BF16 窄化 | `vp_518_f2i.v:189–195` | 普通数用 round-to-nearest ties-to-even；不是直接截断。 |
| BF16 NaN / 饱和 / 零 | `vp_518_f2i.v:194,197–226` | NaN 尾数保持非零；normal/saturation 对 Inf/溢出的结果不同；零分支产生正零。因此不要宣传所有转换天然保留 NaN payload、quiet 位或 signed zero。 |
| FP8 E4M3 | `vp_518_f2i.v:233–280` | 有普通数/非规格化舍入和 normal/saturation 分支；模式是数值合同的一部分。 |
| FP32 乘法特殊值 | `vp_518_fp32_mul.v:46–49,484–497` | 输入 NaN 与 Inf×0 走不同 NaN 常量路径；零输出也有显式处理。数学恒等式不足以证明某个 bypass 或乘 1 变换保持所有特殊位模式。 |

本次未对算术模块逐输入穷举，也未运行 bit-exact RTL 测试。正文应将“内部 FP32 数据通路”“转换的具体规则”和“整个算子的误差验收”分开表述。SiLU/Softmax 等函数的实际误差还取决于参数表、拆分、归约、舍入点，本文不提供未经测量的最大误差或 ULP 保证。

<a id="vp-handshake"></a>
## 握手、完成与 trace

- 数据前进依赖 valid/ready。读地址输出的 ready 接自 L2，见 `vp_518_rd_addr_gen.v:1343–1358`；写侧 `o_wdata_out_ready` 由写配置、地址进度和下游 ready 等共同决定，见 `vp_518_wr_addr_gen.v:284–296`。所以端口拥堵可通过 PostCal/算术链向前传播，不能只按算术级数估整条指令时间。
- `inst_start` 是读配置握手后的寄存脉冲，见 `vp_518_inst_decode.v:1399–1405`；并不直接表示第一笔 L2 回数或第一个 lane 已开始计算。
- 普通写完成跟踪已发写请求与 `wr_rsp` 的差值和 tile 结束标志，见 `vp_518_wr_addr_gen.v:887–902,946–974,1025–1034`。PRG load 走 `wr_load_pg_dec` 的完成分支，不能笼统写“所有 VP 指令都等 L2 写完成”。
- VP 顶层有 `CREDIT=2`（`vp_518_top.v:48–52`），写跟踪也有 ping/pong 及在途控制（`vp_518_wr_addr_gen.v:904–921`）。这不足以把全芯片的指令 credit、L2 请求 credit 和流水容量说成同一个 2。
- 指令控制端依据共享顺序 FIFO 的 VP 选择字段弹出对应 start/done 队列：`rtl/zeus518/inst_ctrl/inst518_queue_vp.v:1280–1297,1713–1720`。done 还受 `vp_send_mail_no_ov` 条件约束；trace 生成见同文件 `:1500–1517`。因此不同 VP 的外显 trace 起止可能受记录顺序和 mailbox 影响，不能把条形宽度未经审计就当纯算术 busy，也不能凭 trace 图推导片上硅测吞吐。

## 不由本证据证明的结论

本次不证明任意 op 一拍完成、四 VP 线性加速、任意融合合法、PRG 近似达到指定误差、整个 L2 持续峰值、指定 MHz 下的持续算力或任何硅上/端到端性能。固定副本之外的生产 RTL 与本副本是否一致，应重新比对文件指纹与构建配置。

## 文件 SHA256

下面是本次读取并用于论证的文件指纹。标签溯源说明与代码身份分别固定；不会用一个非 Git 目录的标签说明替代逐文件身份。

| `design/` 相对路径 | SHA256 |
| --- | --- |
| `README.md` | `6e983e5ee115a7965099de957279b5bd0a700bb98eb7d7856f12464a88b90a49` |
| `filelist/filelist_vp_518_top.f` | `e68b20fbfde7a4a1c17e0d9f70766c3a85b2ff76495d7982c0f6c66857151cb9` |
| `rtl/zeus518/zeus_top/zeus_core_top_pwr.v` | `73f8f2a6f7a0f6bb6a2612db10875a160894b4bcd7550d7df8267643172fca40` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_macro.v` | `aa5db213a1441b10f9400cd9ab4240254d5574984861a7faed7f18e5bff566dc` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_zeus_top_wrapper.v` | `935caed412d2bb186ad43d90e9214144a6a792edc00875fcc8f543bdcf9ea3d5` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_top.v` | `079dfa45a99cd6fe111cd396830a540df10d38d4ef638e8eed06309819f8f06b` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_ecc_gen_check_top.v` | `9d031b70a2c4463f1f5c2a1220139a4a9af4a24c2457c44b3e1314913f9a76fa` |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_cal_top.v` | `5ad558f3ef001bdfae9e8841b600179a75276a03ebbaba3202a187108ad640b2` |
| `rtl/zeus518/vp_v3/sub_module/ctrl/vp_518_inst_decode.v` | `404c0c401619a455f71c40fe16d69c05302cc645e55e938c2780925fb4e57d26` |
| `rtl/zeus518/vp_v3/sub_module/ctrl/vp_518_rd_addr_gen.v` | `fe709b87fc2aa6813bac33efa7ddceb6943699b8bf12ac7003bacbc1919d3d68` |
| `rtl/zeus518/vp_v3/sub_module/ctrl/vp_518_wr_addr_gen.v` | `5c63e742abccd71b30e2dc581126a09b7715e568ba5ca66b3d1151963e91cf4e` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal.v` | `88b3fb6cb77473288ec6ed56b0d9aaee3f02f97e8f002f0ca2c07839e3466ec5` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_fi2fp_group.v` | `79c7bfe2690a5b4545031d2e9bed5cb56bfa3c9b520f7d9c317488a33279d198` |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_concat.v` | `5650720ddc57aa2e17436594458a561192c93551d24739d13b81d9d82a7b9204` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_top.v` | `2b00edceb4b2be634022cae5ef951f5309cae2e4b61fa6891303c0d651a9e823` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_para_engine.v` | `875dec6d9b6a082a87c0416a007cde52325d58f984fbe0aad3c3985b64a8333a` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_fp32_mul_group.v` | `e0d9fdd603db9dd63d0e720041f5867a56a14fae36aa72b04fafa374adeb9a18` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_param_gen_group.v` | `a3e81c8e05aa4acc394b0d9673053747d78373f1d64d3166e572bd1c2a8ba580` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_param_gen_self.v` | `149cccadc78e208cb92ad01e88749252b6d8137adf5f9023943c9070f8a0f25d` |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_param_gen_self_sub.v` | `941083577c29d01960f0dd654dd5e83e5e23d75a896898c3fc344f30f00f6bb4` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_acc_tree_group.v` | `e60173cff57c90eea15d7c7a8e33fd5acbea9db0e4cec77b7f81212fc57c13c5` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_acc_tree.v` | `a5e7b40a5ec0ce74415e4df4c21fc0983679442ffd11e410052bba2411ea4892` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_scal_engine.v` | `2bd1203fff3a39b1060de135bacadc994506fe7398b95f26212e7f5c3a1c1ea3` |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_mask.v` | `c74654814100789f3e09b4c99be1b643e7015e8e3737e07a0d7652ebbcd88f29` |
| `rtl/zeus518/vp_v3/sub_module/post_cal/vp_518_post_cal_group_top.v` | `23d0c309ba3654f94d4754b4734760888811e5fa04aed708d80bc08f3f3d7530` |
| `rtl/zeus518/vp_v3/sub_module/post_cal/vp_518_fp2fi_post_group.v` | `8b0fd0d6ec19cddc3a88fe4423648370ff42e82404a797a809d14371895a92bc` |
| `rtl/zeus518/vp_v3/sub_module/common/vp_518_i2f.v` | `6e9ef107a1ce3da8d91c29bb2245db6b27af90c227e5411bea58ab1562584633` |
| `rtl/zeus518/vp_v3/sub_module/common/vp_518_f2i.v` | `e8426477d5c77c6e44464b497266d59340720904554f66b248486c5c261b9bb6` |
| `rtl/zeus518/vp_v3/sub_module/common/vp_518_fp32_mul.v` | `88d5550f4271aed9c3c18a054384ece944c0b4c8537710b4eabcc461d4db8692` |
| `rtl/zeus518/inst_ctrl/inst518_queue_vp.v` | `0f8cf7f494fe60e3d0343fb6d480f1b6b62109830f53ee46bce52b54c390169d` |
