# PE 微架构专题重构与验收

日期：2026-10-25。范围是指南内容、图示、交互与 GitHub Pages；业务源码只读。此次没有执行 VCS、CycleSim 或硅上测试。

## 阅读顺序

原来的三章改成六章，先有结构和数据路径，再有吞吐与调参：

1. `hw-memory-hierarchy`：单核 8×8 PE、group/PE/ALU/MAC 分工、128×128 weight 的归属。
2. `hw-pe-activation-path`：128 B 入口、CI 切片、跨 group 与 ALU 广播、AL1 ping/pong、地址遍历、flag-only。
3. `hw-pe-weight-path`：16 KiB → 2 KiB → 256 B → 16 B → 2 B；normal pack、双 hub/MC 字节、FIFO head replay、credit 回收。
4. `hw-pe-compute-path`：局部 dot16、内部编码/对齐树、FP32/UScale、OL1 跨 C、group 八路归约、DT 分拍输出。
5. `hw-bandwidth-credit`：由不同接口的字节量推 act、weight、算术与输出限制，带条件复算 46/15。
6. `hw-pe-minitile`：将 w/c/k 直接映回 replay、AL1 地址、OL1 工作，再读历史代价模型和搜索域。

专题共有 52 节、36 道追问、19 张静态 SVG；另有 2 个可交互演示。全站为 58 章、416 节、306 道追问、73 张正文静态 SVG。旧章节和 section ID 保留；笔记与已读状态仍用原键。

## 证据与审查修正

三条路径分别由独立代理核验，再交叉审查坐标、时钟和接口。

- [activation](pe-activation-rtl.md)：11 个文件 SHA256、AL1 深度/字宽、W→K→C 消费顺序、两份驻留门控。
- [weight](pe-weight-rtl.md)：18 个文件 SHA256，normal pack 与 formatter bit slice 的逐字节对应。
- [compute](pe-compute-rtl.md)：26 个文件 SHA256，局部点积与跨 C/跨 PE 的不同累加边界。

上述文件列表可能重叠，不相加声称独立来源数量。集成时重新计算三个索引中所有文件的 SHA256，均与记录一致。

审查并修正：

- 将“每拍的有效 MAC 工作”“平均权重块间隔”“首块延迟”“最终写回完成”分开；不把输入拍数当流水总延迟。
- 一份 128 B act 是 core 入口的唯一数据，不是每个 PE 各读 128 B；物理广播副本和外部流量分账。
- 先在各 PE 的 OL1 跨 C 块累加，再由 group 汇合 8 个 PE；输入 A 本身不累加。
- FP8×INT4 扩大输出通道并行度；不能把它说成 CI 从 128 扩到 256。
- WL1 FIFO 深度为两个 entry，不称为两级 FIFO；read credit 在 aclk 返回 FIFO 被下游握手取走时归还。
- C256 交互明确第一、第二 C 块的实际 CI 范围；W 权重转置视角与硬件 W 行轴分开定义。
- R=23 是条件参数。模型还明确每 MC 最大发射率 1 次/同域周期；400/500 MHz 只作换算假设。

## 数值与浏览器验收

通过 `python3 scripts/build.py`、`python3 scripts/check.py`、JS 语法检查、`git diff --check`。

`node scripts/check_pe_model.js`：

- 16,384 个 weight 字节的完整映射、唯一性和独立反向解码。
- 128 个输出 × C128/C256 共 256 例，分 PE 部分和与直接逐 CI 点积一致。
- 46/15、条件 TB/s、FP8 峰值、单/双 hub、w1/w2/w4、频率变换和 AL1 驻留翻转。

另一个代理用独立 packed 字节 oracle 和 BigInt 直求和复核，并扫过 1,152 组 w/C/R/hub 参数。上述是数学与源码核对，不是 RTL 仿真验收。

Playwright 实际 Chromium 验收：

- 全站回归 **184/184**：58 章桌面与 390 px 移动布局、专题菜单、搜索、目录、公司页、来源筛选、图示放大、个人笔记、练习、打印与无 JS 异常。
- PE 专项 **21/21**：六章菜单、所有 PE SVG 文本在 viewBox 内、末字节位置、C128/C256 结果、第二 C 块范围、w8 重装与短 C 驻留、单 hub、两种交互图的当前状态放大、移动端、打印。
- 直接检查实际截图：全核阵列、activation 广播、weight 放大拆分、compute 部分和、桌面/手机交互。给窄屏矩阵增加放大入口，表格增加横向滚动提示，并修正总览图标签与线条重叠。
- A4 PDF 保留矩阵、部分和表与解释，隐藏编辑控件；截图、浏览器状态与 PDF 属于本地验收产物，不提交到公开仓库。

## 发布边界

本地通过后提交到公开 `Xuanwen-Wang/interview` 的 main，由现有 GitHub Actions 构建与发布。最终发布状态应以对应提交的 workflow、线上 HTML 字节核验和线上关键交互为准；本文件不将“本地构建通过”写成“已上线”。

模型和实验的前提随正文保留。未新增硅上/仿真性能数字，不用这一轮教程测试声称 518 实测胜过 NVIDIA。
