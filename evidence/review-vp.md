# VP 架构长文：审查与网页验收

日期：2026-10-25。范围是指南内容、来源、导航和独立 HTML。业务源码只读；本轮没有运行 compiler build、CycleSim、VCS、RTL 数值测试或硅上测量。

## 内容与入口

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
