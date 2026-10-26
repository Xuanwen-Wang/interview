# 两篇编译器教程的原创实验

这些文件是教程的可复跑输入与小型插件；不修改目标 LLVM 源码，也不重建 LLVM。正文在 `compiler-foundations.html` 与 `llvm-backend.html`。

本次基线：现成的 Linux LLVM/MLIR `22.0.0git` 开发构建、X86 后端、assertions/debug 输出可用，Git revision unknown，源文件与工具 SHA256 见 `evidence/` 中对应记录。精确 MIR、指令、诊断和 API 可能随版本变化。语义 oracle 与特定版本输出检查是不同的验证层级；换版本遇到差异应调查，不能直接删除断言。

## 准备

设置自己的路径。输出目录必须在源码仓库外，并使用环境允许的临时存储位置。插件编译需要开发树头文件、`llvm-config`、`clang++`，以及能导出插件依赖符号的 `opt`/`mlir-opt`。这是本次构建的条件，不是任意发行版二进制都支持的保证。

```bash
export LLVM_ROOT=/path/to/llvm-project
export LLVM_BIN="$LLVM_ROOT/build/bin"
export OUT=/path/to/external/experiment-output
mkdir -p "$OUT"
export TMPDIR="$OUT" TMP="$OUT" TEMP="$OUT"
```

## 基础篇：真实插件、分析失效与转换边界

```bash
python3 practice/llvm/foundations/run.py --llvm-root "$LLVM_ROOT" --output "$OUT/foundations"
```

- `FoundationPlugin.cpp`：实现自定义乘法数量分析、观察 Pass、受合法性约束的 `mul → shl` Pass，以及故意错误声明保留分析的对照。
- `input.ll`：含 i8 符号位常量、不可变换的 nowrap/向量边界及 i128 常量；无符号模算术由独立 oracle 穷举 i8 参数组合。
- `poison.ll`、`bad-dominance.ll`：分开演示定义域与结构错误。不能从 constant folder 为 poison 选择某个具体值反推原表达式处处有定义。
- `undef-lowbit.mlir`：展示把一次使用复制成两次的风险；最终 pattern 使用 `shli` 保留单次使用，运行器单独比较允许结果集合。
- `MLIRFoundationPlugin.cpp`：greedy pattern 与部分/完整 Dialect Conversion，演示 index 位宽、adaptor 和 materialization；后续内建转换闭合到 LLVM dialect。

脚本编译的是本目录原创插件，输出 `.so`、IR、日志和摘要均在指定目录。插件有意采用保守范围；不把教学 strength reduction 作为生产优化收益。

## 后端前半：同一个语义在不同目标条件下怎么下降

```bash
python3 practice/llvm/isel/run_cases.py --llvm-bin "$LLVM_BIN" --output "$OUT/isel"
```

- `selection-cases.ll`：i8/i32/i128 的 ctlz、zero-defined/zero-poison、地址折叠和符号扩展立即数边界。
- `check_baseline.c`：独立逐位计数与 uint64 模算术参考，执行 baseline 对象；`+lzcnt` 只作编译对照。
- `invalid-immarg.ll`：预期被 IR verifier 拒绝。
- 脚本同时保存此快照 X86 GlobalISel 对 `G_CTLZ s32` 的真实失败边界；新版工具可能已经补全此能力，需区分覆盖变化和回归。

原生执行需要 x86-64 Linux 主机与 C 编译器。其他平台可传 `--skip-execution`，此时只有编译观察，不能报告语义执行通过。

## 后端后半：跨调用的值如何活过寄存器分配

```bash
LLVM_BIN="$LLVM_BIN" python3 practice/llvm/machine/verify.py --out "$OUT/machine"
```

- `call-pressure.ll`：12 个独立 volatile load 跨越不透明调用，之后交替 add/xor；固定此输入制造可解释的压力。
- `opaque.S`：计算明确返回值，并主动改写 caller-saved GPR，避免错误分配在普通空函数上侥幸通过。
- `pressure-driver.c`：对边界和固定种子随机输入做独立参考运算。
- `phi-diamond.mir`：单独运行 PHI 消除及 two-address 变换，保留必要 CFG/live-in 信息。
- `tied-add.mir`：正确物理寄存器约束；脚本只改一个输入寄存器生成反例，确认 MachineVerifier 给出 tied-register 诊断。

保存选指令后、RA 后、PEI 后 MIR，核对 spill/folded reload、FrameIndex 消除、CSR 保存恢复和 `opaque` 的对象 relocation。非 x86-64 主机可传 `--skip-runtime`。

## 配置诊断：为什么原始 IR 的 feature 不是最终配置

```bash
python3 practice/llvm/diagnostics/run_cases.py --llvm-bin "$LLVM_BIN" --out "$OUT/features"
```

对同一对函数比较无 `-mattr`、`+lzcnt`、`-lzcnt`。同时读机器指令和 MIR 中被 driver 修改后的属性，复现命令行 feature 追加行为。

以上运行均不包含性能计时；语义采样不构成一般等价性证明，X86 实验也不验证其他目标的后端。
