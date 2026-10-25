# VP 架构长文：审查与网页验收

日期：2026-10-25。范围是指南内容、来源、导航和独立 HTML。业务源码只读；本轮没有运行 compiler build、CycleSim、VCS、RTL 数值测试或硅上测量。

## 初版内容与入口（提交 d20a463）

新增 `content/39-vp-walkthrough.json`，稳定 chapter ID 为 `hw-vp-architecture`。在“518 硬件与后端”的 PE 专题后加入 VP 专题；独立入口为 [vp.html](https://xuanwen-wang.github.io/interview/vp.html)。

18 节按六个连续阅读阶段组织，共 11 张原创 SVG、14 道追问：

1. 核内位置、四执行器、128 B 接口和有效字节账本。
2. 描述符、PreCal、两组 32 路的 wide / pipe 连接。
3. 模块链、tree/acc、scalar、有状态 Mask 与 PRG。
4. PostCal 舍入、真实 SiLU-and-Mul 值图与 chaining 合法性。
5. 独立操作 placement、单 tile split、参数归属和同步。
6. 反压、计量边界、性能下界与面试排障主线。

`portableReading` 元数据让 PE 与 VP 分别生成下载入口；它们与全站 HTML 内嵌同一份数据、脚本和样式，仅默认路由不同。没有给新 VP 编造性能测量或新增硬件模拟器。

## 固定来源与交叉审查

- [直接 RTL](vp-hardware-rtl.md)：`design` 只读非 Git 参考副本，记录来源标签说明和 30 项文件 SHA256；不声称整目录与标签一致。
- [编译器与 kernel](vp-compiler-sources.md)：`triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a`，23 个引用文件均与固定版本逐字节一致；仓库其他 dirty 内容不作为证据。
- 硬件和编译器分别核查后，再交叉审阅正文及图示。本文的字节计算和时间下界是明确条件下的推导；源码结构不代替业务运行验收。

审查中特别处理了以下边界：

- 单 VP 是两组 32-lane engine；wide 图用输入分叉，pipe 图才用 A→B。FP32 常使用低 32 路有效 mask，不能把两个满载荷等价值当作一批 64 路有效计算。
- 双 tensor 复用一组 L2 读口；128 B 不包含 ECC。四执行器的端口位宽不能直接当共享 L2 的持续供给。
- PRG 实际为 32/64 段；单并行组的三份参数数组合计 768 B，32 lane 共享。没有沿用残留的 128 段注释。
- Smt 包含 tree 与逐 lane acc；前端归约轴要映射到硬件 C/W/H。Mask 有 16 个状态槽，字段宽度不能直接推出前端 TopK 上限。
- 数值依据实际被实例化的 i2f/f2i 路径。保留 BF16 narrowing、两次 FP32 舍入、normal/saturation 与特殊值边界。
- 当前 fast sigmoid 显式 clamp 并使用 64 段 PRG；参数 load 独立标出。未把 fast 与 accurate 配方或后续分支能力混入固定版本。
- `vp_hint(..., num_vp=4)` 是 exact 局部要求，非法拆分会报错；`auto` 与 kernel 级 parallel hint 不保证四路使用。任何一种都不直接保证四倍加速。
- 性能模型使用 `T_lb=max(...)，T≥T_lb`，速率须为相应配置的上限；busy、trace、关键路径和慢核完成时间分开解释。

## 已完成的静态与参考检查

- 构建与 `scripts/check.py`：64 章、475 小节、362 道追问、117 张正文 SVG；目录唯一归属、全部站内链接、来源文件/锚点、阅读阶段覆盖与可移植入口一致性通过。
- JavaScript 语法检查及 `git diff --check` 通过。
- 原有 PE 数学模型检查通过：16,384 个字节坐标、256 个点积、带宽与驻留边界；这不是 RTL 仿真。
- 原有 Python 参考测试 9/9，通过 C++17 的 warnings-as-errors 与 ASan/UBSan 参考程序。业务源库测试未运行。

## Chromium / Playwright 专项验收

- 390、768、1280、1440 px 页面没有横向溢出；11 张 SVG 的文字边界均在 viewBox 内。桌面、手机和 wide/pipe 放大图已视觉检查，200% 图示缩放正常。
- VP 专题、全文搜索、6 阶段与 18 小节链接、14 道问答正常。修复了阶段跳转后，前节尾部仍被 IntersectionObserver 命中而覆写当前阶段高亮的问题。
- 下载得到 `518-vp.html`，与构建的 `vp.html` 逐字节一致；`file://` 打开默认进入 VP，正文无 HTTP 资源依赖，控制台无错误。
- 桌面与 390 px 离线入口分别导出 PDF，均 23 页，覆盖全部 18 节与 14 道问答。打印时答案展开，打印后恢复关闭。wide/pipe 图、问答页和末页来源/笔记已视觉核对，无裁切。PDF 文字抽取有少量中英混排行序差异，视觉版正常。
- PE 兼容回归：C256→C128 的交互输出 `y[37]` 从 −13 变为 −9；双 hub→单 hub 的条件供数间隔 3.067→6.133，条件带宽上界 2.137→1.069。PE 下载仍指向 `pe.html` / `518-pe.html`。这些是原有教学模型的交互回归，不是新增硬件测量。
- PE 阶段高亮、旧 `hw-pe-activation-path/act-eight-stripes` 重定向、普通 `compiler-518-hardware/memory` 小节定位与高亮正常。

截图、浏览器运行状态和 PDF 仅保留为本地验证产物，不提交公开仓库。

## 发布路径

继续使用 `Xuanwen-Wang/interview` 的 `main` 与既有 GitHub Actions 构建发布 GitHub Pages。发布完成以对应提交的 workflow 成功状态、线上 HTML 与本地构建逐字节比对为准；不把本地构建成功称作已上线。


## RTL 全架构重写与实际算子扩展（2026-10-25）

初版开头只画了 L2→VP→L2，不能解释完整微架构。本轮保留稳定 chapter/section ID，重写总图和关键硬件节，增加 TopK、sigmoid、RMSNorm 与固定 CUDA 实现。当前 VP 为 30 节、10 个连续阅读阶段、21 张 SVG、27 道追问；没有拆成多个 HTML。

直接读取 RTL 实例与端口后补充三份证据：

- [顶层/控制](vp-top-control-rtl.md)：9 个文件指纹，CTRL/ECC/CDC、四套配置、元数据、写请求与写响应。
- [完整 CAL 连线](vp-datapath-rtl.md)：24 个文件指纹，所有主分支、mux、TopK packet、S2P 和反馈目标。
- [向量/输入/输出模块](vp-vector-pipeline-rtl.md)：29 个文件指纹，七段引擎、具体操作数、单写 FIFO、PreCal/PostCal。三份的文件有重叠，数字不能相加当唯一文件数。

正文和图交叉复核修正：

1. 首图展开 CMP.tensor/tree/winner、SMT.tensor/tree、scalar 输入选择、输出选择和反馈；补全 FIFO→CMP、A FIFO→scalar PRG，以及固定寄存器回到 A/B 和 scalar 的支路。
2. PreCal 先由 DISPART 分流；`split_send` 的非旁路模式选择元素广播，DATA_MUX 才整理 A/B。`re_quan` 在该副本未执行通用 scale/zp 乘加。
3. A/B 真正并行/串行连线；pipe 数据高半填零，valid/end 部分复制，最终有效 lane 由 mask 处理，不写成简单高半 valid=0。
4. PRG 主路普通为 X，对称模式可为 |X|；k 直连 MUL，b 经 FIFO。FLR 的 side.x 为 −X，特定 SUM1 SUB 配置形成 X−floor(X)。
5. CAL FIFO 实例为16×1028，单写入口按 Y>PRG.b>FLR.s>DIP.s 选择，不能画成四条无冲突队列。SHIFT 使用对侧 FIFO；只有 A FIFO 装载 scalar PRG。
6. SQR 输出回写专用 scalar 系数寄存器；S2P 负责连续结果组包，不承担任意广播。旁路之后仍可有 link pipe。
7. `inst_start` 取 decoder 内部两级 RD 配置 pipe 间握手，不等于最终 RD 接受配置；普通 done 追写响应，PRG load 走独立分支。

算子事实分别在 [TopK](vp-topk-operator.md)、[sigmoid/RMSNorm](vp-rms-sigmoid-operators.md)、[CUDA 对照](vp-cuda-operators.md)：

- Router E288/计算320/pack384 不混淆，选择用带 bias 分数、权重 Gather 原分数；TopK packet从Mask回到Compare tensor出口，源分数 Gather 在CT，前缀发布不取消8轮选择。
- fast64 的 x=1 使用实际区间/系数手算；accurate 是指数分解、向量倒数种子与一次Newton，不照旧注释误写rsqrt平方。
- 518 RMSNorm实际顺序为每4×128 tile先沿通道归约，再累加4个partial；BF16、D4096完整四行请求量104KiB（共享γ），不是每行独立加载γ。
- CUDA固定PyTorch v2.8.0与vLLM v0.10.2；专用TopK不仅支持2的幂，但E288无case；CUDA RMSNorm同样两遍输入，且存在低精度中间cast。多条VP设备指令不等于多次host launch。

本轮只做源码核对、数值手算和网站验证，没有新增业务编译、zbin核对、RTL/VCS/CycleSim或GPU运行记录，也不报告跨硬件速度倍率。

### 本轮静态与参考检查

- 构建和内容/链接检查通过：64章、490节、380问、130张SVG（包含同期已提交的PE扩展）；全部来源显式锚点、阶段覆盖和独立入口一致性通过。
- JavaScript语法、原有PE数学模型（16,384坐标/256点积）、Python参考9/9、C++17 warnings-as-errors及ASan/UBSan通过。
- 新材料未包含个人绝对目录、内部主机地址、凭据、业务原始输入或运行缓存；业务源库保持只读。

### 本轮浏览器验收

- 1440、768、390 px 页面均无全页横向溢出；30节、10阶段、27问和21张SVG渲染完整。全部SVG文字的viewBox/所在框边界检查通过；总图、向量图、PreCal、wide/pipe及算子图逐张视觉检查。
- 三种尺寸下阶段链接、搜索命中与定位、问答展开通过；总图放大150%可读。
- 下载的`518-vp.html`与当前`dist/vp.html`逐字节一致。
- 打印PDF共46页，包含30节标题、27题和全部答案；首个1110高总图完整落在第2页，底部说明完整，没有页高裁切。
- 下载版断网以本地文件打开，30节/10阶段/27问/21图完整，0 HTTP请求、0脚本错误；390 px图内横滚可到末框，150%放大对话框不超过视口。打印前展开27个答案，打印后恢复原状态。

- 现有PE交互计算浏览器抽查通过：C256→C128使`y[37]`从−13变−9；双hub→单hub使条件供数间隔3.067→6.133、带宽上界2.137→1.069、weight上限100%→65.2%，切回后恢复。这是教学计算器回归，不是硬件测量。
