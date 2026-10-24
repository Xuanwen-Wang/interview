# 518 硬件与 InjectSync 深度模块：证据索引

采集日期：2026-10-24。对应 `content/37-hardware-sync-deep.json`，7 章、49 小节、36 组问答、15 张原创 SVG。

## 范围与快照

- 业务仓库仅只读：没有编译编译器、执行 lit、运行 CycleSim、提交 VCS/RTL、生成 zbin 或重测性能；没有修改业务文件。
- `triton_shared` 固定 HEAD 为 `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。checkout 有已跟踪修改 `ci/test_job_vcs_case.txt`，也有未跟踪研究文件。本索引所有标作“已跟踪源码”的文件逐项确认已入库、相对 HEAD 无修改。
- `design` 是只读 RTL 参考副本，不是 git 仓库。其 README 声明为 `tag_PN100_R1_20250928` 的部分副本，并记录个别文件差异。本轮没有访问远端重新验证整棵 RTL 与该 tag 一致；下列 SHA256 绑定的是本地逐文件内容，不能当作整个 tag 的校验。
- 带宽 HTML 是未跟踪的本地研究文档，以独立 SHA256 绑定，不属于上述编译器 commit。
- 正文将直接读取 RTL、版本化编译器实现、RTL 合同文档、经验拟合、教学推导区分开。InjectSync 的大量细节来自固定版本 LaTeX 与实现核对，并非重新逐条验证所有合同引用的 RTL。
- 原始源码需要原仓库权限；公开页面仅保留相对路径、版本、行号和指纹，不提供内部地址、凭据、主机信息、个人目录或原始业务张量。
- 不据此归属个人设计贡献；用户的流片前参与和 MR 比例仍属本人经历陈述，本轮没有作者/贡献占比审计。

## 稳定章节

| ID | 顺序 | 主线 |
|---|---:|---|
| hw-memory-hierarchy | 37 | 存储、执行结构、MAC 层次与时钟 |
| hw-pe-minitile | 37.2 | KC 单位、packing、AL1/WL1、代价与搜索 |
| hw-bandwidth-credit | 37.4 | hub/MC、credit、条件带宽与计量 |
| sync-resource-events | 38 | snapshot/completion、物理 alias、RAW/WAR/WAW |
| sync-staircase-planning | 38.3 | 四点后缀最小值演算、粗化与容量 |
| sync-loop-branch-mailbox | 38.6 | owner、seed/drain、分支和吸收 |
| sync-proof-implementation | 39 | C1/C2/C3、最终验证与实现边界 |

## 本轮明确核对或修正的边界

1. **MAC 层次**：单核阵列 → 8 group → 每组 8 PE → 每 PE 16 ALU → 每 ALU 8 MAC，含 mirror group。四种合法输入 pair 与有效乘积数另行核对；输出格式不代表输入格式能力。
2. **KC 与 KW 分开**：16 KiB miniblock 与 C/K 单位推导限定 KC。输入容量 `w*c<=64`、字段边界、自动搜索域和经验输出容量模型分别说明。
3. **单/双 hub 分开**：`wl1_518_weight_ctrl.v:1377–1386` 以 wafer mode 区分四轮单 hub 与两轮双 hub；旧 `PeHWSpec.h` 将四轮写成通用说明的注释不作为无条件事实。
4. **15 与 23 的证据等级不同**：15 outstanding 可直接读 RTL；23-cycle 完整周转是带宽研究文档的条件假设，仍需按具体配置量测。2.137 TB/s 仅为双 hub、R=23、400 MHz、纯读等前提下的模型上界，R 与频率必须用同一计时域。
5. **静态占用不是实时计数**：静态区间峰值不能直接约束异步执行任意时刻的 B(t)。62 是规划预算，63 是硬件计数器容量；留余量原因与多来源 recv mask 有关。
6. **snapshot 不等于 data done**：BR 前端顺序与数据完成分开；同 core PE WAW 的 segment FIFO 写序不扩展成 RAW/WAR 全免。
7. **SI 顺序不等于数据效果**：有序退休/mail 与 match-fail/info-only 是否写入目的数据分开，跨核 launch 配对属于额外 ABI 合同。
8. **C2 接受豁免**：LaTeX 1728–1739 明确循环依赖语义认证未覆盖所有接受路径：同 token loop-carried、同 token equalization seed 的空义务、registered absorption 出口 carrier、sunk point。当前 policy 308–334 对应提前接受/跳过；不能宣称所有跨 token 替代都已独立检查完成界。冻结 schedule 的 send epoch 关系仍需成为可独立核验的事实。
9. **C3 范围**：固定 LaTeX 的实现状态明确未单独实现一般全局事件图无环检查；当前依靠前向构造与容量条件。CFG 切除自然回边后的残余环检查不是全硬件形式化证明。
10. **测试预期不是本轮测试输出**：两个 tracked fixture 只读审查；legacy 布局/report 与默认 staircase 语义门禁明确区分。

## 独立算术复核

以下为基础算术复算，不运行任何业务代码。

| 算例 | 结果与限定 |
|---|---|
| 8×8×16×8 | 8192 MAC cell/core；dtype pair 再决定每 cell 有效 MAC |
| 2×8192×400 MHz | 条件 BF16×BF16 单核 6.5536 TOPS，非实际运行频率/测量 |
| 256×32×15/23 | 5342.60869565 B/同域cycle |
| 16384÷(256×32×15/23) | 46/15≈3.0666667 cycle/16KiB 的平均稳态间隔 |
| 上式字节率×400 MHz | 2.13704347826 TB/s，十进制 TB，条件模型 |
| G32 BF16 scale / INT4 weight | 4/G=12.5%；条件纯权重有效上界2.137043/1.125≈1.899594 TB/s |
| W4,C4096,Kout2048 FP8×FP8，w4c16k1 | 97+0.43×32×4+32×64=2200.04 模型cycle |
| 同shape，w4c8k1 | 97+64×(32+9.2)=2733.8 模型cycle |
| W4,C512,Kout4096，w4c2k1 | 97+0.43×4×4+64×13.8=987.08 模型cycle |
| 同shape，w4c4k1 | 97+0.43×2×4×4+32×16=622.76 模型cycle |

SVG 为本次原创机制图、事件关系、算法图与教学反例，均非 RTL 波形、性能 trace 或硅后测量。

## 逐文件证据

<a id="hs-target"></a>

### 寄存器、L2 与 ABI 保留窗口

- 来源：`triton_shared`
- 定位：`include/triton-shared/Target/ZeusV3/TargetInfo.h:11–118`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`c987d2ed6357164768faf250994db99847be49d326250974f427eed5718b79bc`

<a id="hs-bank"></a>

### L2 bank 几何

- 来源：`triton_shared`
- 定位：`include/triton-shared/Target/ZeusV3/L2BankGeometry.h:7–12`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`7f04cedd4bde06730c4b51c7d4ee77b92923ed443910ce286db5cb671ebd17ca`

<a id="hs-spec"></a>

### 硬件边界与经验模型系数：两种证据不可混为一谈

- 来源：`triton_shared`
- 定位：`include/triton-shared/Dialect/ZeusHigh/Transforms/PeHWSpec.h:35–154`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`965575dfceb7d7367823587a118b1c9785a9fe10d3371a58a574d72d9cbfe5f1`

<a id="hs-model"></a>

### 单指令 minitile 评分和搜索

- 来源：`triton_shared`
- 定位：`lib/Dialect/ZeusHigh/Transforms/PeMinitileModel.cpp:65–316`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`37c3578099331905466528ad6d740d9d93e139ab44b30adbb6c6ddde4e0c2294`

<a id="hs-model-doc"></a>

### minitile 模型适用域与历史校准

- 来源：`triton_shared`
- 定位：`docs/architecture/pe_minitile_cost_model.md:1–210`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`cadd49615da67337a9f321cb3c1fa280b9296e15008b935da63bc9e3a8e812bf`

<a id="hs-chain"></a>

### mailbox 公理、阶梯、容量、循环与三项条件

- 来源：`triton_shared`
- 定位：`docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:168–1023`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`36b447ca0aa5d1b709bd044a0e7da0f00ea894ece536db9fc181d0b87966b462`

<a id="hs-regions"></a>

### 区域提升、循环吸收与势能均衡

- 来源：`triton_shared`
- 定位：`docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:1024–1490`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`36b447ca0aa5d1b709bd044a0e7da0f00ea894ece536db9fc181d0b87966b462`

<a id="hs-status"></a>

### 实际实现范围、SI 顺序与效果边界

- 来源：`triton_shared`
- 定位：`docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:1839–1985`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`36b447ca0aa5d1b709bd044a0e7da0f00ea894ece536db9fc181d0b87966b462`

<a id="hs-rtl-model"></a>

### 指令时序、descriptor、PE/VP/DT/DMA 同步合同

- 来源：`triton_shared`
- 定位：`docs/vcs_debug/rtl-instruction-dependency-model.md:51–1937`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`1658b2cc611ec12fc93131ce0cc269fb7312e404bed48855a046189a3e2e7517`

<a id="hs-planner"></a>

### 阶梯、容量粗化、循环配平

- 来源：`triton_shared`
- 定位：`lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircasePlanning.cpp:442–922`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`054ff07f8a2c408c1c25f9fcac99ba7488bf6d9496fe6cbd952068fe04a57400`

<a id="hs-region-code"></a>

### 区域树构建

- 来源：`triton_shared`
- 定位：`lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/RegionTree.cpp:138–453`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`9038b8939d1d47b70e0abc77f050e9d1812878a2be77f2c066b2cb40954bd8eb`

<a id="hs-checker"></a>

### 覆盖、时点、循环与规范计划验证

- 来源：`triton_shared`
- 定位：`lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircaseVerification.cpp:23–397`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`d4b72550f05326dfbb4a21b5b53bc152ac1692f0c66effaf3ce9c3cf3a643bd0`

<a id="hs-policy"></a>

### seed/drain 与 credit 身份策略

- 来源：`triton_shared`
- 定位：`lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircaseCreditPolicy.cpp:105–341`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`16501d11ef98d5c56c09b9e58709ee2787dc19ddbb1c47638c1457afa1118c55`

<a id="hs-pass"></a>

### 分析冻结、验证、物化与最终检查入口

- 来源：`triton_shared`
- 定位：`lib/Dialect/ZeusLow/Transforms/InjectSyncPass.cpp:210–420`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`81d5c8f142030a530cb98591182249106731a3741c56dc67823bd100e2112854`

<a id="hs-resources"></a>

### 物理范围、资源冲突和 may-alias

- 来源：`triton_shared`
- 定位：`lib/Dialect/ZeusLow/Transforms/InjectSync/Resources.cpp:70–1425`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`89c158d972eb5e5bf471c61ea967ea3c2bd559d4134da78411b9d4c6c31bda1d`

<a id="hs-bandwidth-doc"></a>

### 带宽来源追踪：23 cycle 条件假设

- 来源：`triton_shared`
- 定位：`docs/ldg-bandwidth-explained-2026-10-15.html:1–415`
- 版本：不属于编译器 commit；本地文件快照
- 状态：未跟踪本地研究文档，以独立 SHA256 绑定
- 文件 SHA256：`3f9e201fdb7c057ff3fa6ef5ab64b346f37270523857a43dc06507a611004c97`

<a id="hs-design"></a>

### 只读 RTL 副本的来源与时钟/计时边界

- 来源：`design`
- 定位：`README.md:1–178`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`6e983e5ee115a7965099de957279b5bd0a700bb98eb7d7856f12464a88b90a49`

<a id="hs-array"></a>

### 单核阵列入口

- 来源：`design`
- 定位：`rtl/zeus518/zeus_top/pe518_array.v:1710–1730`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`7d3c4d1e98583d3a469df92b413949b948c9cd695b273fa96f3cfb9d54755ff7`

<a id="hs-group8"></a>

### 8 个 PE group

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/pegroup518_x8_top.v:990–2340`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`9e15ae8a4a7cc43ed007106faa338ad4d135dd4abab5f5a7ec6d1bfefbb11b00`

<a id="hs-group"></a>

### 每 group 8 个 PE

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/pegroup518_top.v:365–495`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`93a6e2d2c8da227da004dd0478516cc91ff96a362541878ffe7e48d3d0385d23`

<a id="hs-pe"></a>

### 每 PE 16 个 ALU

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/pe518_top.v:198–220`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`85c37c00a76a086a44d8f1921cb62f5e50cc614f5f910c2ab3756283c86c3ab8`

<a id="hs-alu"></a>

### 每 ALU 8 个 MAC cell

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/pe518_alu.v:78–100`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`47c7d1ef6b9864ebe4093260dcd21a9685107057994dd0baf43e33dc15489f37`

<a id="hs-mode"></a>

### 四种合法输入组合与 fallback

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/pe518_alu_ctrl.v:80–94`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`67efd29a15325f3266f43cd2365a8a2f1db148927870bb3b0327c169cd49dc4b`

<a id="hs-mac"></a>

### MAC 数据路径的有效乘积数

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/pe518_mac.v:600–800`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`22a161b4a274541cd79b925c4f1fbe9ea62b7fd018d9d789f9dfa09fb3038a87`

<a id="hs-coord"></a>

### C/K 元素遍历单位

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/pe518_al1_mt_coord_cal.v:190–210`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`e892c578ddae91c3c31b85b75db16c9e7465b748b75efb9b006b5b18f5fafd13`

<a id="hs-ol1"></a>

### OL1 ping/pong

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/pe518_ol1_buffer.v:30–75`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`815416955a9474dd9ede4355073aff58554255f7c6cb88d2ac56fe960b1f535f`

<a id="hs-act"></a>

### flag-only 与 AL1 credit

- 来源：`design`
- 定位：`rtl/zeus518/pe_ctrl/pe_ctrl_logic.v:340–3948`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`f52913bf2bbd4cba3b85974cbe67fedd6874466f2dc42e0bd5deafe94db9eb7e`

<a id="hs-replay"></a>

### WL1 weight 重放与 FIFO pop

- 来源：`design`
- 定位：`rtl/zeus518/wl1/wl1_518_weight_data_format.v:1120–1152`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`d7f88009ed2e45cd098c1ba231f1292ef29aee5db1b16bf22f31d893189d2dac`

<a id="hs-wafer"></a>

### 单 hub 四次与双 hub 两次读取

- 来源：`design`
- 定位：`rtl/zeus518/wl1/wl1_518_weight_ctrl.v:1370–1395`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`c88b8edb5bb5dc3af12c5c53f6c74d5841c5f527b5743fef8487ffb7dab9809c`

<a id="hs-hub"></a>

### MC 位宽、16 路广播与回包聚合

- 来源：`design`
- 定位：`rtl/zeus518/wl1/wl1_518_hub_weight_req_distribute.v:10–87`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`fb59dba778b84dabf3481d435439e9ab80ca5d8acc8a8f92ee221f1dd0033f00`

<a id="hs-credit"></a>

### 15 read outstanding 的更新与门控

- 来源：`design`
- 定位：`rtl/gdg/gdg_unit/gdg_flowctrl.v:20–54`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`54bbb7e259b5dd5f965902a919aa6e42a09a294c80640d954da30032d5ecafae`

<a id="hs-clock"></a>

### 时钟分频、选择与 PE gate

- 来源：`design`
- 定位：`rtl/zeus518/zeus_top/zeus_crm.v:510–685`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`15902a31ce1be5e8b968c74aa43d3c7a58ef7f25cf6dbadc8919230a6bae19a2`

<a id="hs-snapshot"></a>

### PE 描述符锁存与命令 snapshot

- 来源：`design`
- 定位：`rtl/zeus518/inst_ctrl/inst518_pe_inst_predecode.v:120–495`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`552f4271331a937a123b48a52c42aa4cdfd9e72ba89f92ac2818749f3c419d58`

<a id="hs-fixture-cycle"></a>

### 未建模 CFG 环：legacy 拒绝与 staircase 更早拒绝

- 来源：`triton_shared`
- 定位：`test/ZeusV3Backend/Unit/Transforms/inject_sync_dependency_unmodeled_cfg_cycle.mlir:1–45`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`393d345c037e500b72f58d2dcb23fb7eae021b5fb311c90930f8df6f4d1ad258`

<a id="hs-fixture-gate"></a>

### 固定 legacy 布局与默认 planner 语义门禁

- 来源：`triton_shared`
- 定位：`test/ZeusV3Backend/Unit/Transforms/inject_sync_dependency_no_fallback_gate.mlir:1–58`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`23dd5c6bb50b1dbf19a3410ddfc54d6b7da5517157913a1ee836655b5b0138bd`

<a id="hs-group-mirror"></a>

### mirror group 同样生成 8 个 PE

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/m_pegroup518_top.v:372–495`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`17e6c5858a7fee9aa0ce8c47efd9c7c696ae6291d78605e9fb2b7e345754773a`

<a id="hs-core"></a>

### 每 core 的 PE array 实例

- 来源：`design`
- 定位：`rtl/zeus518/zeus_top/zeus_core_top_pwr.v:8520–8540`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`73f8f2a6f7a0f6bb6a2612db10875a160894b4bcd7550d7df8267643172fca40`

<a id="hs-al1-return"></a>

### AL1 最后点握手归还 credit

- 来源：`design`
- 定位：`rtl/zeus518/pegroup/pe518_al1.v:190–223`
- 版本：README 声明的部分 RTL 副本；不是 git SHA
- 状态：只读 RTL 参考副本/说明，以本地 SHA256 绑定
- 文件 SHA256：`5f35c60924b10919c20575c72e3c557b525835133e12056a42f642010ccfa887`

<a id="hs-planner-option"></a>

### 默认 staircase 与显式 legacy 选项

- 来源：`triton_shared`
- 定位：`include/triton-shared/Dialect/ZeusLow/Transforms/Passes.td:120–140`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`f2b9002b89fb432d43ddbafe6e47ef4738bd077cfc45717758b3205d0a9fbbb5`

<a id="hs-identity-doc"></a>

### C2 身份验证与四类明确未闭合的接受路径

- 来源：`triton_shared`
- 定位：`docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:1689–1747`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 状态：已跟踪源码/文档，已核对相对 HEAD 无改动
- 文件 SHA256：`36b447ca0aa5d1b709bd044a0e7da0f00ea894ece536db9fc181d0b87966b462`

## 验证记录与剩余边界

- 已对本索引文件逐项检查存在、行范围和指纹；已跟踪文件逐项检查 HEAD 差异为空。未跟踪文件不冒充版本化源码。
- 教材结构按仓库 JSON schema 检查；SVG 独立解析，正文 source anchor 对照本索引。页面构建与最终渲染由主任务统一完成。
- 尚未重新测量：完整 MC credit RTT、真实芯片频率/带宽、域外 w/k 配置、UScale 物理重复读取、所有 lane/退休资源的运行压力、SI 跨核可见性。
- 未完成的模型/实现能力按文档明确保留：上述 C2 循环/epoch 接受豁免的独立认证、一般全局事件图独立无环检查、profile 成本粗化、任意非规整 CFG 支持；不能用本次静态阅读宣称这些已完成。
- 独立交叉 review 补充发现 C2 接受豁免与 seed 公式域前提；已在正文、问答和本索引修正。n/k 首轮配对公式明确限定距离至多1、0≤k≤n。
