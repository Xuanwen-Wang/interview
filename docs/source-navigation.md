# 源码导航

查编译器、算子或 LLVM 时先查对应源码，再形成解释。下列路径是各仓库内部的相对路径；仓库别名在本机 `AGENTS.local.md` 中映射为绝对目录。首次使用先确认目录存在、实际调用入口和版本。

## 按问题找入口

| 问题 | 首选仓库 | 继续追踪 |
| --- | --- | --- |
| TTIR lowering、Zeus IR、Pass、同步、指令生成 | `triton_shared` | 实际 pipeline → producer/consumer → 对应回归 |
| 算子语义、shape、layout、Triton kernel、launch | `torch_zeus` | 公共 API → dispatch → kernel → reference/业务测试 |
| LLVM/MLIR IR、分析、重写、Dialect Conversion | `llvm-project` | 同版本声明 → 实现 → 测试 → 本工程调用点 |
| Python DSL / JIT 到 TTIR | `triton` | language → AST code generator → backend；本机是定制 fork |
| 模型组合、prefill/decode、KV 管理、调度 | `sglang` | 模型 forward → backend → 算子调用及参数 |
| 时序模型与校准 | `Zeus3Simulator` | 当前模型范围 → 子系统 → 校准测试；与 RTL/设备分开 |

不要把 `torch_zeus` wrapper 当作最终设备 kernel，也不要把 `triton_shared` 的目标相关行为归因于通用 LLVM。跨仓库结论要沿真实 import、dispatch 和调用参数连接。

## triton_shared

TTIR lowering、ZeusHigh/ZeusLow pass、descriptor、同步、CodeGen；不是算子wrapper。

| 相对入口 | 查什么 |
| --- | --- |
| `docs/architecture/README.md` | 先读全链路概览，随后核对真实源文件，文档可能滞后 |
| `backend/compiler.py` | Python backend编译入口与阶段配置 |
| `tools/zeus-compiler/zeus-compiler.cpp` | 统一编译器实际pass注册与选项 |
| `lib/Conversion/TritonToLinalgExperimental` | Phase A入口和TTIR lowering |
| `lib/Conversion/LinalgToZeusHigh` | Linalg到ZeusHigh转换 |
| `lib/Dialect/ZeusHigh/Transforms/ZeusHighPipeline.cpp` | Phase B实际pipeline |
| `lib/Conversion/ZeusHighToZeusLow` | ZeusHigh到ZeusLow转换 |
| `tools/zeusv3-backend/zeusv3-backend.cpp` | Phase C实际pipeline入口之一 |
| `lib/Dialect/ZeusLow/Transforms` | 同步、控制流及低层变换 |
| `include/triton-shared/Dialect/ZeusHigh/IR` | ZeusHigh ODS/type约束 |
| `include/triton-shared/Dialect/ZeusLow/IR` | ZeusLow ODS/type约束 |
| `lib/Target/ZeusV3` | CodeGen、ISA编码、Binary发射 |
| `test/ZeusV3Midend` | 中端回归 |
| `test/ZeusV3Backend` | 后端回归 |
| `test/Conversion` | 转换回归 |
| `sim_check` | 本地功能仿真框架 |

## torch_zeus

算子API、wrapper/dispatch、权重打包、Triton kernel及CPU reference；不将Python wrapper或fallback当设备kernel。

| 相对入口 | 查什么 |
| --- | --- |
| `sgl-kernel-zeus-triton/README.md` | 当前推理kernel源码布局与接口约定 |
| `sgl-kernel-zeus-triton/python/__init__.py` | 公共API；跟随实际import到唯一owner |
| `sgl-kernel-zeus-triton/python/_model_compat.py` | 兼容别名，不是独立kernel实现 |
| `sgl-kernel-zeus-triton/python/glm53_flash/kernel_manifest.json` | 模型调用、源版本、hash和callable归属 |
| `sgl-kernel-zeus-triton/python/glm53_flash/moe` | MoE Router/Routed/Shared/Reduce实际实现 |
| `sgl-kernel-zeus-triton/python/glm53_flash/dsa` | DSA实际实现 |
| `sgl-kernel-zeus-triton/python/common/linear` | 共享Linear |
| `sgl-kernel-zeus-triton/python/jit.py` | JIT launcher/编译调用衔接 |
| `sgl-kernel-zeus-triton/tests` | 业务shape、reference、误差与接口回归 |
| `torch_zeus/csrc/aten/operators/zenl` | ATen wrapper/注册到ZENL |
| `zenl/src/host` | ZENL host dispatch |
| `zenl/src/triton` | ZENL设备Triton kernel |
| `tests/test_op` | ATen功能测试 |

## triton

Triton Python DSL、语义、JIT与TTIR生成；本地是定制fork，不能称完全等同upstream。

| 相对入口 | 查什么 |
| --- | --- |
| `python/triton/language/core.py` | DSL API与tensor操作 |
| `python/triton/compiler/code_generator.py` | Python AST到TTIR |
| `python/triton/compiler/compiler.py` | 编译cache和backend orchestration |
| `include/triton/Dialect/Triton/IR` | Triton dialect契约 |
| `lib/Dialect/Triton/IR` | Triton dialect实现 |

## llvm-project

上游通用MLIR/LLVM机制，依当前项目所用源码/构建版本核对；不是Zeus后端。

| 相对入口 | 查什么 |
| --- | --- |
| `mlir/include/mlir/IR/Operation.h` | Operation接口 |
| `mlir/lib/IR/Operation.cpp` | IR对象实现 |
| `mlir/include/mlir/Transforms/DialectConversion.h` | Conversion合法性接口 |
| `mlir/lib/Transforms/Utils/DialectConversion.cpp` | Conversion实现 |
| `mlir/lib/Transforms/Utils/GreedyPatternRewriteDriver.cpp` | greedy rewrite调度 |
| `mlir/include/mlir/Interfaces/SideEffectInterfaces.td` | 副作用interface |
| `mlir/lib/Analysis` | 通用分析 |
| `mlir/test` | 上游回归例子 |
| `llvm/include/llvm/ADT` | 容器和基础抽象 |
| `llvm/lib/Support` | 支撑库 |
| `llvm/include/llvm/IR/Instructions.h` | LLVM IR 指令接口 |
| `llvm/lib/IR/Instructions.cpp` | LLVM IR 实现 |
| `llvm/include/llvm/IR/PassManager.h` | New Pass Manager |
| `llvm/lib/Passes/PassBuilder.cpp` | Pass pipeline 注册 |
| `llvm/lib/Analysis` | LLVM 分析 |
| `llvm/lib/CodeGen` | 通用机器后端 |
| `llvm/lib/Target` | 目标相关后端 |
| `llvm/test/CodeGen` | CodeGen 回归 |

## sglang

模型forward、调度、prefill/decode入口、KV pool和attention backend选择。

| 相对入口 | 查什么 |
| --- | --- |
| `python/sglang/srt/models` | 模型forward/模块组成 |
| `python/sglang/srt/layers/attention` | attention backend选择与执行 |
| `python/sglang/srt/mem_cache/memory_pool.py` | KV/cache存储管理 |
| `python/sglang/srt/model_executor/model_runner.py` | 模型执行入口 |
| `python/sglang/srt/managers/scheduler.py` | 请求调度 |

## Zeus3Simulator

时序模型/校准证据；CycleSim、functional、VCS/RTL与硅上测量必须分开。

| 相对入口 | 查什么 |
| --- | --- |
| `PROGRESS.md` | 先读模型当前状态、可信范围；导航只读不更新 |
| `dev_docs/README.md` | 子系统设计文档索引 |
| `simulator/include/zeus3` | 时序模型接口 |
| `simulator/src` | 时序模型实现 |
| `test` | 模型回归与校准测试 |
| `tools/scripts` | 重放和分析入口 |

## 版本与证据的最小记录

1. 读目标仓库的 `AGENTS.md`、`AGENTS.local.md`、`CLAUDE.md` 和与任务相关的 `.claude/` 指导；业务源码默认只读。不要为写指南擅自构建、安装依赖或启动模型。
2. 固定问题：输入 shape/dtype/stride、prefill 或 decode、运行入口和预期行为。先查入口，再跟到实现，不按文件名或旧文档猜测。
3. 记录仓库、完整 HEAD、相关文件的 dirty 状态、相对路径/符号、采集日期。有本地改动时补文件 hash 或相关 diff 证据；不将未提交实现归给 HEAD。
4. 源码位置和 binary 位置分别核实。编译或性能结论还需要实际工具链、运行时、binary hash、输入及计时口径；本次只读查源码不等于重跑验证。
5. Git 元数据不可用时写明 `revision unknown`，记录引用文件 SHA256；版本字符串只能作为补充，不能推断 commit。公开网页只呈现必要的仓库与相对源码定位，不能带入本机目录和内部主机地址。

## 本轮核实发现的易错入口

以下是 2026-10-26 的目录核实结果，后续使用仍要复查：

- 编译器仓库名称是 `triton_shared`，不要按口述误拼为 `torch_shared`。
- `torch_zeus/CLAUDE.md` 中关于 Triton 后端尚未支持的旧说明已落后于实际目录。推理 kernel 先查 `sgl-kernel-zeus-triton`，并从公共 API 跟随当前实现归属。
- 旧文档提及的 `ZeusLowPipeline.cpp` 当前不存在；Phase C 的注册从两个 compiler/backend 工具入口追踪。
- 本机 LLVM checkout 的 Git 元数据不可用，不能可靠报告源码 commit。构建头文件中的 `22.0.0git` 也不能代替 commit；按文件 hash 绑定依据。

本轮各入口与版本边界的核实见 [规范落地记录](../evidence/review-agent-rules.md)。
