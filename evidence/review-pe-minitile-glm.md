# PE minitile 与 GLM5Next 实例审查

核对日期：2026-10-25。仍沿一个 PE HTML 从接口、阵列、单 PE、累加走到内部遍历；没有新增独立章节或改变既有章节 ID。

## 本轮内容

- 新增 MTW/MTC/MTK 本质、真实 owner shape、逐 minitile/PE 坐标三节，三张内嵌 SVG 和五道追问。
- PE 长文共23节、21张静态图、2个既有交互、41道追问，保留六段阅读路径和旧链接。
- 区分实际长度与字段减一编码；w控制同权重服务的行数，c控制归约块与AL1深度，k控制输出块与A复用/OL1占用。
- 当前 owner M4：Gate、Up各 `[4,4096]×[4096,512]`，显式 `w4c8k2`；Down `[4,512]×[512,4096]`，显式 `w4c2k4`。
- 用两个绝对模型坐标推导 group2、PE1、ALU5、MAC3、lane1，以及 AL1 地址17/4；说明局部 row2 是归组后第三行，不是原始 token ID。
- 解释当前 pin、无 pin 的精确表/模型、历史 concat GU 产物的区别，展示 w4/w8 的容量取舍而不作实测排名。

## 来源与交叉复核

| 范围 | 固定来源 | 核对方式 |
| --- | --- | --- |
| 当前 owner、fallback、Shared | `torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7` | Git object 字节、源码行号和 SHA256 |
| 内部模型与调用者 | `zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976` | H/I/E、TP/EP与参数传递 |
| minitile合法性与选择 | `triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a` | 属性、完整/部分pin、表、模型及CodeGen路径 |
| 无pin选择对照 | 同版原始C++模型与LLVM Support | 独立driver，仅调用模型/表；没有编译业务指令 |
| 历史owner-v1 | `fullowner-20261019/profile-fullowner-v1-smoke-l3-ep0` | 实际asm/zbin与provenance hash；GU和Down六组M4/M8/M16定位 |
| 物理坐标与驻留 | 前章normal FP8 KC RTL证据 | 基本块、每PE的CI条带、ALU/MAC、AL1地址和flag-only协议 |

两位独立审阅者交叉检查正文、图和证据，复算：GU的8个minitile×64次有效工作，Down的16×32；各8,388,608 MAC；每条GU的32KiB逻辑A payload与Down首次2KiB；每条投影2MiB纯weight。这些数描述逻辑工作与有效数据，不是物理总线回包或延时。

修正了两处措辞：

1. 从字段到长度是加一；从源码属性到字段才是减一，标题按解码方向改写。
2. Down的c2对应两个CI块、满足双面驻留条件。没有声称c4不能驻留，也没有将静态结果当成独立验证的选型原因。

## 网页验收

- `python3 scripts/build.py`、`python3 scripts/check.py`、`node scripts/check_pe_model.js`、`git diff --check` 通过。
- 基于本轮基线，全站64章、478小节、367道追问、120张静态SVG；构建输出保留 `index.html`、`pe.html`、`vp.html` 的独立入口。
- Chromium桌面1440×1000与移动390×844验收：新正文、字段、pin、六个新锚点、58条旧路由/锚点、搜索实际pin、图示放大与缩放通过。
- 三张新图全部文字的 `getBBox` 均处于各自 viewBox 内；SVG标识及引用加入图级前缀，避免同页冲突。
- 既有坐标交互与新算例一致；w8/CI4096的四块C与CI512的单块C交互驻留提示正确。
- 移动端无页面横向溢出；打印包含新增图表，自动展开历史对照并在打印后恢复；生成A4 PDF并抽取文本核对真实配置、坐标与历史内容。
- `file://` 离线PE入口与VP入口检查通过，无浏览器脚本错误。截图和PDF留在本地忽略目录，不进入发布源码。

## 结论边界

没有修改业务源码，没有新增业务编译、CycleSim、VCS或硅上测量。当前源码pin按已核对的编码规则给出字段片段，但没有将其称为新生成的汇编。历史provenance记为cycle daemon、not VCS，且未提供编译器SHA，因此不补写历史source→binary全链已闭合。

源码注释可以支持credit/输入输出tile的设计意图，现有整kernel评估同时改变归组、pin、overlap和调度；没有隔离其它变量的A/B证明当前GU c8k2优于c16k1。模型返回值也不是当前融合kernel的性能最优证明。

详细证据见 [minitile选择](pe-minitile-selection.md) 和 [GLM5Next形状](pe-glm-shapes.md)。
