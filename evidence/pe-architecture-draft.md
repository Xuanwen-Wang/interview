# PE 架构六部分改稿

日期：2026-11-14。指南基线：37c041f757e8a284d54f85f10dc123da4ea38bc4。本记录覆盖六部分重组、布局补充与本地验收；发布状态以对应 Git 提交及 Pages workflow 为准。

## 组织与图示

正文按架构总览、数据表示与 Weight 布局、PE Array 组织与计算通路、输入供给与存储接口、minitile 与执行流程、性能约束与软件配置排列。

首图建立 L2、LDG、WL1、PE Array、分布式 AL1/OL1、group 归约与输出的关系。LDG 表示存储域；读请求由 WL1 请求控制经 hub 发往 MC。图按功能归属组织，不表示 floorplan、芯片边界或逐拍时序。

布局静图直接保留 notes 2026-11-13 文章图 3a 的矩阵、CO 带首地址、512 KiB 括号及线性存储条构图，图注注明来源。参考身份沿用 [既有证据](pe-ldg-walkthrough.md#scope)。主例为 normal KC、FP8×FP8、WBS128、M4/CI4096/CO512、FP32 输出。

非零字节坐标退为可展开核对。原阵列、ALU/MAC、OL1、归约、流水及 DFO 图用于对应模块；独立 CI256 手算与较小 AL1 地址例均标注条件。历史模型长例子缩为适用性说明与证据链接。

## 补充技术核对

编译器固定 triton_shared a6161ef94b1941f786ce05d4e31104ec91ea22d4；RTL 为原非 Git 部分副本，revision unknown。业务源码只读。编译器工作区有既存未跟踪文件，本次引用的 transform.py、SetPeHWParams.cpp、InstructionSelector.cpp、InstrInfo.def 相对该版本均无暂存或非暂存修改。

| 结论 | 来源位置 |
| --- | --- |
| WBS 是 pack 的输出通道分组宽度，WBS128 的 k_group 为 1 | sim_check/sim_framework/weight/transform.py:23,40–50 |
| normal 缺省 WBS 与 BLOCK_N 相关，本例 WBS128 是明确选择 | lib/Dialect/ZeusHigh/Transforms/SetPeHWParams.cpp:161–199 |
| 当前 FP8 路径每 ALU 的 OL1 一面有 16 个 FP32 槽，w×k≤16 | rtl/zeus518/pegroup/pe518_ol1_buffer.v:39–59；pe518_ol1_buffer_ctrl.v:155–235 |
| descriptor 保存 dtype、地址和形状；PE_SETM_M 配置模式与 minitile，PE_SETM_U 控制 UScale | lib/Target/ZeusV3/CodeGen/InstructionSelector.cpp:2914–3072 |
| PE_CONV predecode 握手锁存所用描述符 | rtl/zeus518/inst_ctrl/inst518_pe_inst_predecode.v:375–456 |
| PE 指令完成等待本笔所需写响应 | rtl/zeus518/pe_ctrl/pe_ctrl_logic.v:2191–2209,4625 |

RTL 文件 SHA256：

| 文件 | SHA256 |
| --- | --- |
| pe518_ol1_buffer.v | 815416955a9474dd9ede4355073aff58554255f7c6cb88d2ac56fe960b1f535f |
| pe518_ol1_buffer_ctrl.v | 01aea4ce3ba7e6eeaa3ab1f8beeab981a7e1841c15f7607746fb6be6f914aac0 |
| pe_ctrl_logic.v | f52913bf2bbd4cba3b85974cbe67fedd6874466f2dc42e0bd5deafe94db9eb7e |
| inst518_pe_inst_predecode.v | 552f4271331a937a123b48a52c42aa4cdfd9e72ba89f92ac2818749f3c419d58 |

## 审阅范围

技术审阅检查模块归属、数据分配、格式边界、容量及控制/完成过程；阅读审阅检查六部分概念依赖和示例范围；视觉审阅实际查看桌面总图、布局图、保留硬件图及交互。

读序、重放和 credit 仍是教学模型。本轮没有新增 kernel 编译、功能模拟、CycleSim、VCS/RTL 或真实设备测量。数学与控件检查不能替代读者对整体解释和呈现效果的评价。

## miniblock 物理分布与算子打包补充

2026-11-14，针对第 04 节“连续”的地址层级不清，以及算子缺少输入打包步骤的问题，补充如下内容。仍限定 normal KC、FP8、WBS128、dual-hub；主例 CO512/CI4096，无 tail、UScale 或 index。定位单 MC 的示例以 base=0 开始。

- 整核聚合 packed 字节地址：一个 miniblock 的轴序为 `[group=8, CO_in_group=16, PE=8, CI_in_PE=16]`，即块内偏移 `2048*g+128*a+16*p+j`。同一 CO 行的 128 B 在此地址中连续。
- LDG 分布：每个 WL1 对应一个 PE group 的 16 CO。`round=a//8`、`hub=(a%8)//4`、`mc=4*(a%4)+p//2`、`byte=16*(p%2)+j`。同一 CO 的 128 B 分给四个 MC，每个 MC 保存 32 B；每笔再拆两个 16 B 片段交给相邻 PE。
- 固定 WL1 0/hub0/MC0，其地址连续 word0…3 分别保存 `Weight[0,0:32]`、`Weight[8,0:32]`、`Weight[0,128:160]`、`Weight[8,128:160]`。这是存储顺序；w4c8k2 的实际请求从 word0,1→64,65→2,3 开始。
- PE 输入：formatter 为每个 PE 收集 16 个 CO 行中的 16 B 片段，重组为连续 256 B 接口。PE0 在第一个 miniblock 的片段聚合地址起点为 0,128,…,1920，不能误写成从 LDG 连续读取的 256 B。

新图生成器 `scripts/pe_miniblock_figure.py` 分别展示 8 路归属、单 WL1 的 MC 分布及 PE0 重组，MC 编号均为各 hub 内局部编号。图展示地址/数据对应，不表示芯片 floorplan、逐周期请求或返回时刻。

### 从逻辑矩阵到聚合 buffer

正文的 NumPy 参考实现处理已编码的 FP8 原始 `uint8` 字节矩阵，不做数值量化：

```python
raw.reshape(CO//128, 8, 16, CI//128, 8, 16).transpose(0, 3, 1, 2, 4, 5).copy(order='C').reshape(-1)
```

该表达式与 `triton_shared` a6161ef 的 `sim_check/sim_framework/weight/transform.py:16–51` normal/fp8/WBS128 输出一致。独立核对包括：

1. 用 2,097,152 个互异整数位置标签覆盖完整 `[512,4096]`，与实际 `transform_weight_7d` 逐项相等，无重复/遗漏。
2. 用 uint8 位型输入验证连续 2,097,152 B 输出逐字节相等；这不构成 FP8 数值运算测试。
3. 用 `[128,256]` 的 32,768 个标签，按 RTL 地址删位、hub 拼接及实际 128-bit 切片重组 PE 输入，确认逻辑坐标与 PE 数据归属一致。

pack、地址删位和 formatter 的来源位置与文件 SHA256 见 [既有权重证据](pe-weight-rtl.md#pw-mapping)。本轮再次核对，transform.py、weight_ctrl、weight_rd_ctrl、hub_weight_req_distribute、weight_data_format、pegroup518_top 的文件 hash 均与既有记录一致；transform.py 相对 a6161ef 干净。

补充加载/编码证据同属 a6161ef，引用文件无暂存或非暂存改动：

| 相对文件 | 位置与用途 | SHA256 |
| --- | --- | --- |
| sim_check/sim_framework/weight/layout.py | 91–103：DenseLayout normal/WBS128 pack 后保存单份数据文件 | d1d4b32974aac882e4f2ae0ca2bbb1534e95cd4c2dfa407c6823b72cbcae132a |
| sim_check/sim_framework/relocator.py | 125–151：为单份权重登记 addr/size/dtype/path | dc09c0257a5388b01a8f6cc966f820361b4235f5390ec1c4d38c71605c87d0d7 |
| sim_check/sim_framework/dtypes.py | 17–26：量化为 float8 后按原始字节 view，区分编码与整数数值转换 | 4b8325b817c6fda7042da99d8797e1b1851d3782a7bec3eb67727ed58b3c7dd3 |

加载链仅核对仿真框架的文件/地址合同与 RTL 读端，不声称验证了真机 Host SDK、DMA 或任意 memcpy 的 LDG 写入路由。正文不发明设备搬运 API。上述 Python 与整数切片检查属于 host 布局核对，不是 RTL 仿真或设备验证。
