# VP 顶层、控制与完成路径的 RTL 复核

采集日期：2026-10-25。来源：`design` 只读 RTL 参考副本，非 Git；以下逐文件 SHA256 固定本次读到的内容。只记录模块实例、端口连接和条件逻辑，没有运行 RTL 仿真，不据此声称吞吐或固定时延。本文按真实模块分支解释；`VP_CDC_DUMMY` 等条件编译的旁路分支不与正常实现混用。

<a id="vt-top"></a>
## 单 VP 的实际外壳

基路径为 `rtl/zeus518/vp_v3/`。

| 模块/接口 | 文件与行号 | 已核对的连接 |
| --- | --- | --- |
| 外部口 | `top_wrapper/vp_518_top.v:12–16,18–34` | 68-bit 命令，1024-bit 读回和写数据，15-bit 地址、8-bit strobe，数据旁有72-bit ECC。读请求/读回、写请求/写响应分别存在。 |
| ECC | 同文件`:379–417` | L2读回→ECC检查/修正→CDC；CDC写数据→ECC生成→L2。ECC用core clock。不是计算模块。 |
| CDC | 同文件`:419–526` | 命令及accept/start/done跨域，读地址、读返回、写地址+数据、写响应各有通道；正常CDC实现位于`vp_518_cdc_top.v:194`以后的分支。 |
| 时钟门控 | 同文件`:529–536` | `CK_GATE`给CTRL与CAL的VP时钟门控；CDC跨接core与VP时钟。不能把两者当单一全局每拍。 |
| CTRL | 同文件`:538–692`，`sub_module/ctrl/vp_518_ctrl_top.v:242,431,505` | decode生成读地址配置、PreCal配置、CAL+PostCal配置、写地址配置；读地址和写地址发生器属于CTRL。 |
| CAL | `top_wrapper/vp_518_top.v:694`；`vp_518_cal_top.v:254,313,481` | PreCal、CAL group、PostCal；L2读数据经CDC直接入PreCal，输出数据交给CTRL的写地址发生器，与地址/strobe配对后进CDC。 |

<a id="vt-cdc"></a>
## CDC 的分流和时序边界

`vp_518_cdc_top.v:130–194`有`VP_CDC_DUMMY`直连分支；正常分支使用`asyn_fifo_boreg`：

- 命令`:317–338`，`DW=CMD_W, AW=5, PN=2`，core→VP。
- 读地址`:432–454`，`DW=ADDR_W+8, AW=3`，VP→core。
- 读数据`:480–502`，`DW=DATA_W, AW=3`，core→VP。
- 写数据/地址/strobe`:531–553`，`DW=ADDR_W+DATA_W+8, AW=3`，VP→core。
- 写响应`:556–577`，`DW=1, AW=5`，core→VP。
- accept/start/done分别有返回FIFO，`:341–412`。

这些是实例参数；不把AW或PN直接包装成端到端延迟。FIFO入队成功与L2实际接受不同；写响应也不同于PostCal最后一个输出有效。

<a id="vt-control"></a>
## 指令怎样铺成一次流式执行

`vp_518_ctrl_top.v:242–428`连接decode的四套配置流：`rd_cfg`、`pc_cfg`、`cg_pc_cfg`、`wr_cfg`。`vp_518_inst_decode.v:1794–1873`为各流实例化第一层link pipe，`:1876–1955`再接第二层；`:1958–1961`定义四套对外配置的valid/ready握手。不是把68-bit命令原封不动当作全部算术寄存器的单拍配置。

读地址发生器不仅发地址，还向PreCal发送`l2_cfg_fifo`元数据，见`vp_518_ctrl_top.v:492–494`及`vp_518_cal_top.v:283–285`。数据来源、结束边界等必须与返回payload配对；X/Y是同一个物理L2读口上复用的逻辑流，见`vp_518_rd_addr_gen.v:1227–1231`。不同读模式（单tensor、双tensor、tensor+vector、参数load等）在同文件`:517–523`区分。

在这版decode中，`inst_start`由内部 `s_rd_cfg_valid && s_rd_cfg_ready` 产生（`:1399–1405`）。这对信号位于两层 RD 配置 link pipe 之间、是第二层的输入握手（`:1923–1935`），不能等同读地址发生器最终接收配置的 `o_rd_cfg_valid && i_rd_cfg_ready`。`vp_accept` 则由最终写配置 `o_wr_cfg_valid && i_wr_cfg_ready` 握手产生（`:1407–1413,1943–1955`），`inst_done` 来自写地址模块（`:1415`）。名称不能替代具体采样事件；不能把 start 看作首个乘法开始，或把 accept 看作所有结果落地，也不能仅按名称给 start/accept 强加固定先后顺序。

<a id="vt-done"></a>
## 写回完成与 PRG load 完成是两个分支

`vp_518_wr_addr_gen.v:925–1036`用写请求、tile结束和返回的`wr_rsp`维护未完成写状态及两组轮换记录。普通指令的`done`依赖相应tile写响应排空；仅观察`vp2lb_wr_valid && ready`不能声称全指令完成。PRG装载没有普通tensor结果写回，它通过`i_cg_pc_cfg_load_pg_ready`及`wr_load_pg_cnt/wr_load_pg_dec`走单独完成分支（`:1014–1034`）。CAL的load-ready接口连接在`vp_518_cal_top.v:312–324`。

排障应同时观察：四套配置握手→读请求/读数据→PreCal各分流→CAL主路及第二操作数→PostCal→写请求→写响应。若valid为0，追生产者；若valid为1而ready为0，追消费者；若是双输入算术，再核对另一输入是否到齐。此方法用于选择波形观察点，不代表本次已采集业务波形。

## 文件指纹

| 文件（以上基路径下） | SHA256 |
| --- | --- |
| `top_wrapper/vp_518_top.v` | `079dfa45a99cd6fe111cd396830a540df10d38d4ef638e8eed06309819f8f06b` |
| `top_wrapper/vp_518_cdc_top.v` | `b3d15ea6ef972df7092cdb7bc5d4c645b6334de4447cfc41d02499c1f46bb4d9` |
| `top_wrapper/vp_518_cal_top.v` | `5ad558f3ef001bdfae9e8841b600179a75276a03ebbaba3202a187108ad640b2` |
| `top_wrapper/vp_518_ecc_gen_check_top.v` | `9d031b70a2c4463f1f5c2a1220139a4a9af4a24c2457c44b3e1314913f9a76fa` |
| `sub_module/ctrl/vp_518_ctrl_top.v` | `3bfb840f0409ff214c33b67ec6ea1769103dd8f581269f7891b3fa6375113fc3` |
| `sub_module/ctrl/vp_518_inst_decode.v` | `404c0c401619a455f71c40fe16d69c05302cc645e55e938c2780925fb4e57d26` |
| `sub_module/ctrl/vp_518_rd_addr_gen_top.v` | `721ea39c56b59ac44d4cbd062f95fa35ed7c1a6eed8d2a822527152f89b1d05c` |
| `sub_module/ctrl/vp_518_rd_addr_gen.v` | `fe709b87fc2aa6813bac33efa7ddceb6943699b8bf12ac7003bacbc1919d3d68` |
| `sub_module/ctrl/vp_518_wr_addr_gen.v` | `5c63e742abccd71b30e2dc581126a09b7715e568ba5ca66b3d1151963e91cf4e` |
