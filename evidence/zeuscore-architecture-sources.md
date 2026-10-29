# 518 ZeusCore 整体架构：来源、推导与审查边界

采集：2026-10-29 至 2026-10-30。对应 `content/36-zeuscore-architecture.json` 与独立 `zeuscore.html`。

<a id="core-provenance"></a>
## 来源与验证范围

- `design`：非 Git 的只读部分 RTL 副本。README 声明来自 `tag_PN100_R1_20250928`，本轮没有重新验证整棵树与远端 tag 一致；revision unknown，以逐文件 SHA256 绑定。
- `triton_shared`：HEAD `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`；checkout 有无关已跟踪修改和未跟踪资料。下方逐文件区分 clean tracked 与 untracked；不把本地研究 HTML 归入该 commit。
- `architecture-manual`：《Zeus_v3技术架构手册 v1.0》，原始文件不公开上传，revision unknown，以 SHA256 固定。只概述必要的架构背景，并显式保留旧容量、频率、接口数字的适用边界。
- 业务代码与 RTL 未修改；没有编译工具链、执行模型、RTL 仿真或设备性能测试。图与主例为原创教学内容。
- 用户的当前软件约定为单 rank 对应两核；顶层中两份 NDDG → core 实例链与之相容。rank 并非 RTL 定义的通用概念。
- 网页只保留仓库别名与相对定位；不包含内部地址、本机个人目录、原始文档或源代码附件。

## 本轮核验的主要结论

1. 顶层实际实例链为两份 NDDG，各包含一个 ZeusCore；核内是一套 PE、四 VP、四 DT 和独立 L2。没有用另一份四核 wrapper 推断本次配置。
2. L2 为128×256×16 B=512 KiB payload；每word额外9bit ECC。AL1/OL1各128 KiB物理量，但复制/部分和使其不等同独立tensor容量。
3. 各端口按本地有效beat算，400 MHz仅是本文统一教学假设。L2总bank位宽上界、四VP端口之和、DMA端口、WL1呈现与MC新权重不可相互替代。
4. 15在途是RTL事实，R=23是条件模型；不将VCS行为PHY结果升级为硅上带宽。
5. PE_CONV字段与9类mail映射由ISA表和顶层参数交叉核对；snapshot与data completion分开。
6. 外存只给地址几何推导与旧手册说明；没有板卡容量读回，未声称当前装机容量。
7. A[4,256]×B[256,256]教学例按CO分核；每核w4c2k1，262144 op，A 1 KiB，weight 32 KiB，FP32 Y/Z各2 KiB。未声称真实编译选择该tile。

<a id="core-top"></a>
## 芯片与核实例链

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/Zeus518_top/top/zeus518_top.v` — 3502, 5827, 7119：PCIe 与两个 NDDG wrapper | non-Git snapshot; revision unknown | `24d4214837dfa23547a1843f87ca7b95ef95a7bcaf759570a391f0c89fbf988c` |
| `design` | `rtl/nddg/rtl/nddg_subsys_wrapper.v` — 1296, 1367, 1777–1818, 2309：GDG / Hermes / core / NoC | non-Git snapshot; revision unknown | `a5fa199cf69c1d317e41f8ef276e112f37843120f264d3f1592fd5d843ac44bc` |
| `design` | `rtl/nddg/rtl/m_nddg_subsys_wrapper.v` — 1777–1818：mirror wrapper 内 core | non-Git snapshot; revision unknown | `02eb35ceb364b9aeda7c47dfd8b657fa93633286eebc0464b811d1cbc951e2e8` |
| `design` | `rtl/zeus518/zeus_top/zeus_core_top_pwr.v` — 5809, 6321, 7009, 7558, 7729–7862, 8527：核内执行器 | non-Git snapshot; revision unknown | `73f8f2a6f7a0f6bb6a2612db10875a160894b4bcd7550d7df8267643172fca40` |

<a id="core-external"></a>
## 外存：地址空间不等于可用容量

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/gdg/gdg_unit/gdg_unit.v` — 563–572：MC_SHORT_MODE=2，row13 / col7 / data256 | non-Git snapshot; revision unknown | `0cee453aa3e3b989674456081ff74840b28754715a7c0e3d0f98a5af2e50a240` |
| `design` | `rtl/gdg/gdg_unit/mc_ctrl_phy_wrap.v` — 303：行为模型缩小行地址 | non-Git snapshot; revision unknown | `12c06003cfdbcebbe6104770cf9e34a2b5f6863b4911b617ec9b71826ff5f1df` |
| `architecture-manual` | `Zeus_v3技术架构手册v1.0.docx` — word/document.xml 的 w:p 顺序索引（从0计）83–156、691、1944–1967：旧概览、旧容量与任务流程 | non-Git snapshot; revision unknown | `6fd0df2beed5bb1834f47d4aa00bc5b1366c485fada391409741223c03dbf344` |

<a id="core-l2"></a>
## L2 几何、端口与单口 SRAM

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/zeus518/l2buffer_ctrl/rtl/z518_l2_l2buffer_ctrl.v` — 265–272：128 SRAM，256行，128数据+9 ECC；各 master 到 bank 的仲裁 | non-Git snapshot; revision unknown | `44a2022879adef52e1b1d7dfdd03983ff836fb7825c981a492e6874d624bd05e` |
| `design` | `rtl/zeus518/l2buffer_ctrl/rtl/z518_l2_l2buffer_ctrl_sram_sp_256x128_wrapper.v` — 1–18, 90–105：单口宏接口 | non-Git snapshot; revision unknown | `a858f517236d3586c98c70dc9f4c313b548ae7ce5ad8dc6e711f6b957a94a60c` |
| `triton_shared` | `include/triton-shared/Target/ZeusV3/L2BankGeometry.h` — 7–12：2048 B交织 / 128 B访问 | tracked; clean relative to HEAD | `7f04cedd4bde06730c4b51c7d4ee77b92923ed443910ce286db5cb671ebd17ca` |

<a id="core-local-storage"></a>
## AL1、OL1 与重放

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/zeus518/pegroup/pe518_al1_wrctrl.v` — 39–50, 295–303：双面64×128bit地址与单口选择 | non-Git snapshot; revision unknown | `9b89503aaa9593d2342a5c780e688670620a243b8f4e5dfa2be69c996901cdeb` |
| `design` | `rtl/zeus518/pegroup/pe518_ol1_buffer.v` — 20–68：每ALU双面16×32bit | non-Git snapshot; revision unknown | `815416955a9474dd9ede4355073aff58554255f7c6cb88d2ac56fe960b1f535f` |
| `design` | `rtl/zeus518/wl1/wl1_518_weight_data_format.v` — 118–126, 1130–1152：FIFO与MTW消费后pop | non-Git snapshot; revision unknown | `d7f88009ed2e45cd098c1ba231f1292ef29aee5db1b16bf22f31d893189d2dac` |

<a id="core-target"></a>
## 编译器资源与 ABI

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `triton_shared` | `include/triton-shared/Target/ZeusV3/TargetInfo.h` — 23–32、80–115；VR spill / runtime args / external page / weight address ABI：硬件总量与保留规则分开 | tracked; clean relative to HEAD | `c987d2ed6357164768faf250994db99847be49d326250974f427eed5718b79bc` |

<a id="core-pe-array"></a>
## PE 物理阵列、输入组合和 tile

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/zeus518/zeus_top/pe518_array.v` — 1710–1730：阵列实例 | non-Git snapshot; revision unknown | `7d3c4d1e98583d3a469df92b413949b948c9cd695b273fa96f3cfb9d54755ff7` |
| `design` | `rtl/zeus518/pegroup/pegroup518_x8_top.v` — 990–2340：八个group含mirror | non-Git snapshot; revision unknown | `9e15ae8a4a7cc43ed007106faa338ad4d135dd4abab5f5a7ec6d1bfefbb11b00` |
| `design` | `rtl/zeus518/pegroup/pegroup518_top.v` — 365–495：每group八个PE；684–770：归约与DFO | non-Git snapshot; revision unknown | `93a6e2d2c8da227da004dd0478516cc91ff96a362541878ffe7e48d3d0385d23` |
| `design` | `rtl/zeus518/pegroup/m_pegroup518_top.v` — 372–495：mirror同样八个PE | non-Git snapshot; revision unknown | `17e6c5858a7fee9aa0ce8c47efd9c7c696ae6291d78605e9fb2b7e345754773a` |
| `design` | `rtl/zeus518/pegroup/pe518_top.v` — 198–220：16 ALU | non-Git snapshot; revision unknown | `85c37c00a76a086a44d8f1921cb62f5e50cc614f5f910c2ab3756283c86c3ab8` |
| `design` | `rtl/zeus518/pegroup/pe518_alu.v` — 78–100：8 MAC cell | non-Git snapshot; revision unknown | `47c7d1ef6b9864ebe4093260dcd21a9685107057994dd0baf43e33dc15489f37` |
| `design` | `rtl/zeus518/pegroup/pe518_mac.v` — 600–800：不同格式的有效乘积路径 | non-Git snapshot; revision unknown | `22a161b4a274541cd79b925c4f1fbe9ea62b7fd018d9d789f9dfa09fb3038a87` |
| `design` | `rtl/zeus518/pegroup/pe518_alu_ctrl.v` — 87–91：输入pair选择，其他组合fallback不能视为支持 | non-Git snapshot; revision unknown | `67efd29a15325f3266f43cd2365a8a2f1db148927870bb3b0327c169cd49dc4b` |
| `design` | `rtl/zeus518/pegroup/pe518_al1_mt_coord_cal.v` — 190–210, 290–298：dtype与坐标单位 | non-Git snapshot; revision unknown | `e892c578ddae91c3c31b85b75db16c9e7465b748b75efb9b006b5b18f5fafd13` |
| `design` | `rtl/zeus518/inst_ctrl/inst518_pe_inst_predecode.v` — 123–125：MTW/MTK/MTC位宽；375–454：BR锁存 | non-Git snapshot; revision unknown | `552f4271331a937a123b48a52c42aa4cdfd9e72ba89f92ac2818749f3c419d58` |

<a id="core-vp-dt"></a>
## VP 与 DT

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/zeus518/vp_v3/top_wrapper/vp_518_zeus_top_wrapper.v` — 286, 351, 416, 481：四个VP实例 | non-Git snapshot; revision unknown | `935caed412d2bb186ad43d90e9214144a6a792edc00875fcc8f543bdcf9ea3d5` |
| `design` | `rtl/zeus518/vp_v3/top_wrapper/vp_518_top.v` — 18–34：128 B读写+ECC | non-Git snapshot; revision unknown | `079dfa45a99cd6fe111cd396830a540df10d38d4ef638e8eed06309819f8f06b` |
| `design` | `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_top.v` — 874–943：wide / pipe；947–1123：归约和输出 | non-Git snapshot; revision unknown | `2b00edceb4b2be634022cae5ef951f5309cae2e4b61fa6891303c0d651a9e823` |
| `design` | `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_param_gen_self.v` — 58–67, 84–105：PRG表，不乘lane数 | non-Git snapshot; revision unknown | `149cccadc78e208cb92ad01e88749252b6d8137adf5f9023943c9070f8a0f25d` |
| `design` | `rtl/zeus518/dt/dt_top.v` — 45–65：32 B读写接口 | non-Git snapshot; revision unknown | `46725aa8df39feb7363a0575f47ceaf725bfcc15eaf6bf4fc41e06474427287d` |

<a id="core-isa"></a>
## ISA 与当前编码器

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `triton_shared` | `docs/ZeusV3_ISA_v1.4.json` — PE_CONV、CT_*、VP_*、DT_*、LD/ST/LW/SI/SO 各条目；PE字段bit63…0 | untracked snapshot | `22c42995f0bd83db264015e76607ed09c0128361b3b27e8f9c172435b220cbc8` |
| `triton_shared` | `lib/Target/ZeusV3/ISA/Encoding.cpp` — 70–111：uint64编码与位宽mask | tracked; clean relative to HEAD | `430755631e8bf450d229ebd0744999ba4d8d47d6947ee826805f70f5535753e3` |

<a id="core-sync"></a>
## 执行、同步、通知及传输合同

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `triton_shared` | `docs/vcs_debug/rtl-instruction-dependency-model.md` — 25–115：顺序前端和异步队列；828–884：ST/LW完成；1237–1300：SI/SO；其余章节核验特殊边界 | tracked; clean relative to HEAD | `1658b2cc611ec12fc93131ce0cc269fb7312e404bed48855a046189a3e2e7517` |

<a id="core-front"></a>
## 寄存器、mailbox 和命令 credit

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/zeus518/inst_ctrl/zeus518_inst_ctrl.v` — 24–65：默认command credit、实际mail bit顺序、MW=6 | non-Git snapshot; revision unknown | `c5c0ea1b6ef8efd188338e7da3891fe6cf6a84ff8c63463bf50db656e9a0a4a4` |
| `design` | `rtl/zeus518/inst_ctrl/inst518_ct_unit.v` — 22–34、1200–1300：寄存器宽度与实例数 | non-Git snapshot; revision unknown | `d1232dd174c166acbabbe57c3e162432ec3a4a39735641dc265436c255ad60e8` |
| `design` | `rtl/zeus518/inst_ctrl/inst518_queue_inbox.v` — 20–100及计数更新：按发送类别的token，默认映射受顶层覆盖 | non-Git snapshot; revision unknown | `3cdea836a2ade09863782a75bcf5f8b0e227a772171ad0e7447bb29160047cce` |
| `design` | `rtl/zeus518/inst_ctrl/inst518_credit_ctrl.v` — 20–50：发命令扣减、ack归还 | non-Git snapshot; revision unknown | `a43c27d27018b8f52fb7e17dc892c198e5cf350b41d6d65915f0c42070fe1a8a` |

<a id="core-clocks"></a>
## 时钟及台架边界

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/zeus518/zeus_top/zeus_crm.v` — 510–685：可配置分频、选择、门控 | non-Git snapshot; revision unknown | `15902a31ce1be5e8b968c74aa43d3c7a58ef7f25cf6dbadc8919230a6bae19a2` |
| `design` | `README.md` — 1–20、3.3–3.6：副本、频率配置、FPGA_MC_PHY与trace局限；文内历史测量未作为本篇新实测 | non-Git snapshot; revision unknown | `6e983e5ee115a7965099de957279b5bd0a700bb98eb7d7856f12464a88b90a49` |

<a id="core-ports"></a>
## LD/ST/PE 有效数据接口

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/zeus518/load_dma/load_dma_518_load_to_l2.v` — 1024-bit L2 payload端口 | non-Git snapshot; revision unknown | `cb54b312109a5183a1fde8d7e689931a65e23b67510973645e08edb67aeec7c6` |
| `design` | `rtl/zeus518/sdma/Zeus518_sdma_top_wrapper.v` — 1024-bit L2 payload端口 | non-Git snapshot; revision unknown | `a05903101818e7afef24e65253e7414bbd97981161d7f9fa50fc7c35d04d2671` |
| `design` | `rtl/zeus518/pegroup/pegroup518_dt.v` — 16路FP32输入→128-bit最终输出；DFO分拍 | non-Git snapshot; revision unknown | `e7ce490d584a77c69226ff4cf3bd152a218ed6e2183678fc0617c617e0b34cfb` |

<a id="core-weight"></a>
## 新权重、信用与阵列呈现

| 来源 | 相对文件与定位 | 状态 | SHA256 |
|---|---|---|---|
| `design` | `rtl/zeus518/wl1/wl1_518_hub_weight_req_distribute.v` — 17–35, 58–83：16×256-bit聚合 | non-Git snapshot; revision unknown | `fb59dba778b84dabf3481d435439e9ab80ca5d8acc8a8f92ee221f1dd0033f00` |
| `design` | `rtl/zeus518/wl1/wl1_518_weight_ctrl.v` — 1377–1386：单/双hub读取次数 | non-Git snapshot; revision unknown | `c88b8edb5bb5dc3af12c5c53f6c74d5841c5f527b5743fef8487ffb7dab9809c` |
| `design` | `rtl/gdg/gdg_unit/gdg_flowctrl.v` — 27–51：读在途15门控 | non-Git snapshot; revision unknown | `54bbb7e259b5dd5f965902a919aa6e42a09a294c80640d954da30032d5ecafae` |
| `triton_shared` | `docs/ldg-bandwidth-explained-2026-10-15.html` — 本地未跟踪研究稿：R=23的条件建模背景，不是版本化编译器代码或本轮实测 | untracked snapshot | `3f9e201fdb7c057ff3fa6ef5ab64b346f37270523857a43dc06507a611004c97` |

## 算术与必要反例

| 推导 | 结果 | 限定 |
|---|---|---|
| 8×8×16×8 | 8192 MAC cell/core | 物理数量 |
| FP8 pair: 2×8192×2 | 32768 op/有效拍 | MAC计2op |
| 256×32×15/23 | 5342.60869565 B/拍 | 双hub，R=23 |
| 16384/(256×32×15/23) | 46/15≈3.066667拍 | 稳态权重间隔，不是指令延迟 |
| FP8 AI = 2M | M门槛46/15，M4跨过 | 仅weight供数 |
| G32 BF16 scale / INT4 weight | 12.5% | 未计请求粒度 |
| per-core Y[4,128] FP32 / 128B口 | 16有效拍 | 反例：大于算术下界8拍 |
| 不同A容量 / AL1面 | 128KiB / 2 / 8 = 8KiB | KC group复制 |
| 对齐128B地址0与2048 | 同组bank0…7 | 地址不同仍争用 |

自动复算和页面验收结果另见 `review-zeuscore-architecture.md`。
