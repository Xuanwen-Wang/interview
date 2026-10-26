# LLVM / MLIR 两篇工程教程重写验收

日期：2026-10-26。范围：基础组件篇与后端下降篇、原创实验、来源记录及对应的站内入口。此记录覆盖此前仅介绍模块和 5*x+y 的版本。

## 技术审查与修正

基础篇围绕两个实际编译、加载的插件组织：先建立 Value/Use 与对象生命周期，再解释变换前提、AnalysisManager 缓存失效、LLVM 与 MLIR Pass 的作用域；最后完成 greedy rewrite、index 类型转换和 materialization 的闭合。后端篇围绕 ctlz 与跨调用压力程序，沿 IR、DAG、MIR、物理寄存器、栈帧到对象重定位分析。源码入口用于解释分支与约束，未用文件名列表代替推导。

由基础篇、选指令前半、机器后半的作者交叉复核，并由主任务整合：

- 修复 MLIR 初稿 `muli x,2 → addi x,x` 复制 undef use 的问题，最终用单次使用的 `shli x,1`。正文保留允许结果集合反例；没有把普通整数测试通过或 constant folder 输出 0 当作通用等价证明。
- 核对 properties 与 `getAttr` 的桥接语义、PassManagerImpl 中 invalidate/after-pass 回调的顺序、conversion adaptor 和 source/target materialization、rollback 的可见性边界。
- 区分不能投机执行的边上计算与 fresh incoming vreg 的 PHI copy，未声称每个临界边都必须拆分。
- 根据当前 X86 源码及实际输出解释 BSR 零输入补偿、i128 拆分与立即数 +2^31 转为 SUB 的选择逻辑；将 mayLoad 描述错误和丢失 MMO 的后果分别说明。
- 对照 Greedy 日志明确本例经过分配失败和 InlineSpiller；不把进入 RS_Split 阶段写成已经验证全局 region splitting/recoloring。
- 总图拆开 SelectionDAG 内部步骤与顶层 Pass，并以另一分支标出 GlobalISel；FrameIndex、regmask、tied operand、implicit-def、MMO 都作为阶段交接的约束讲解。

共享 LLVM/MLIR 报告 22.0.0git，Git revision unknown。引用源文件与工具分别保存 SHA256；不能把现有工具二进制与当前所有源文件自动视作精确匹配的可复现构建。业务源码只读，未重建 LLVM。细节见 `compiler-foundations-engineering.md`、`backend-isel-engineering.md`、`backend-machine-engineering.md`、`compiler-driver-engineering.md`。

## 实验与支持的结论

| 实验 | 实际结果与边界 |
| --- | --- |
| LLVM 插件 | 原始与改写程序分别对独立 oracle 检查 65,536 对 i8 输入；支持所测模整数域。i128 常量和 nowrap/向量拒绝边界另作输出核对。 |
| 分析缓存 | 正确失效 count 3→1；错误保留 count 3→3，但两者 verifier 均通过，复现缓存语义错误。 |
| MLIR 插件 | greedy rewrite 的 1,024 个 i32 值、index=32 转换的 1,024 对输入均通过；修复 undef 后完整重跑。另以集合穷举检验 duplicate-use 反例。 |
| 预期失败 | SSA 支配错误、full conversion 未合法化 func.func、非立即数 immarg、X86 G_CTLZ s32 的强制 GlobalISel 路径、物理 tied operand 违规均被相应运行器检查。失败范围绑定当前输入与快照。 |
| 选择与合法化 | baseline 对独立位计数/模算术 oracle 执行 60,314 项检查；包括窄类型、i128 高低半边界、地址与立即数。+lzcnt 仅编译，不声明运行覆盖。 |
| RA / ABI | 12 个值跨不透明调用，6 个 spill 槽、6 次 folded reload；主动覆盖 caller-saved 的汇编 callee 配合 4,099 组原生结果核对。 |
| 栈帧与 MC | RA 后抽象栈槽、PEI 后 stackSize=104、48 字节 CSR push 与 56 字节栈调整、R_X86_64_PLT32 的 -4 addend 均与输出对应。 |
| 配置传播 | 无 mattr、+lzcnt、-lzcnt 三组对照核对 driver 追加函数 feature 串及最终选择。 |

Poison/undef 合法性仍需语义论证；本次没有声称从有限原生样本证明所有输入等价。未执行目标设备、业务模型、RTL、跨平台 ABI 或性能测试。MemorySSA、LICM、SCEV 等章节标明源码分析范围，不包装成新实现的优化。

## 教学审查

每一条主线依次回答：输入有什么约束、实现在哪个分支处理、输出为何长这样、错改后会破坏什么、怎样在合适截面复现。保留完整插件、IR/MIR、独立 oracle 和可复跑脚本，读者可以修改失败前提并观察结果。图中的箭头表示依赖或表示交接，SlotIndex 图不是硬件时间线。RA、调度、栈帧等节保留稳定 ID，可独立继续扩写。

历史博客仅作为模块组织线索；技术判断由当前源码、原始语义和已运行实验支持。章节数、篇幅和测试数量不作为深度或正确性的替代指标。

## 页面与发布检查

- 构建、内容/引用检查、全部前端 JavaScript 语法、现有五组交互教学模型、9 个 coding 参考测试及 C++ ASan/UBSan 检查通过。
- 公共产物的 16 个边界测试及最终 dist 检查通过；本次提交不包含插件产物、原生可执行文件、日志、浏览器状态或私人文档。
- Playwright / Chromium 实测：42 个当前章节锚点、51 个历史锚点全部解析；两卷入口、搜索 demo-bad-preservation、点击后端总图跳到 RA、图示 200% 放大和两篇 HTML 下载通过，无页面 JavaScript 错误。
- 在独立浏览器状态中种入旧版笔记和已读记录后验证迁移：旧笔记可读，保留历史已读，新两篇不会因旧章节已读而自动完成。
- 1440×1000 桌面、390×844 手机截图已检查；手机文档宽度为 390，无整页横向溢出。四张图的文本、连线、含义与实际输出核对；另检查 A4 打印图页，侧栏隐藏、18/24 个 section 均保留。
- 两个独立 HTML 经 file:// 打开，默认分别进入正确教程，章节完整；打印、下载、离线阅读保留原有使用方式。
- 内容检查器将过宽的 INLINE_ 字符串拒绝改为只识别实际未展开模板注释，允许合法的 MLIR_DEFINE_EXPLICIT_INTERNAL_INLINE_TYPE_ID 宏。分别检查模板标记被拒绝、真实宏被允许。

用户已授权直接发布现有公开 GitHub 仓库与 Pages。部署完成与线上字节一致性由发布后的实际检查确认；本文件的本地验证不能替代部署状态。
