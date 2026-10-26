# llc driver 与函数 feature 属性的诊断实验

日期：2026-10-26。共享 LLVM 版本字符串 `22.0.0git`，revision unknown；源码 Git 元数据不能使用，不能据版本字符串推断 commit。使用现成工具，没有修改或重建 LLVM。

## 输入与命令

原创 `practice/llvm/diagnostics/feature-override.ll` 定义两个 `llvm.ctlz.i32(x, false)` 函数，分别有 `-lzcnt` 与 `+lzcnt` 函数属性。

```bash
LLVM_BIN=/path/to/llvm/build/bin python3 practice/llvm/diagnostics/run_cases.py --out /path/to/output
```

脚本固定 `-O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 -verify-machineinstrs`，分不传 `-mattr`、传 `+lzcnt`、传 `-lzcnt` 三种情况，输出汇编及 `-stop-after=finalize-isel` 的 MIR。2026-10-26 三组检查全部通过。

| 参数 | 原 `-lzcnt` 函数 | 原 `+lzcnt` 函数 |
| --- | --- | --- |
| 不传 mattr | BSR 序列；属性仍为 `-lzcnt` | LZCNT |
| `-mattr=+lzcnt` | LZCNT；属性变为 `-lzcnt,+lzcnt` | LZCNT |
| `-mattr=-lzcnt` | BSR 序列 | BSR 序列；属性变为 `+lzcnt,-lzcnt` |

这只验证配置传播与选指令的观测，没有执行这些函数或作性能测量。相同 IR intrinsic 的语义执行另见 isel 实验。

## 调用链与源码指纹

`llc.cpp` 调用 `codegen::setFunctionAttributes`；`CommandFlags.cpp` 将非空命令行 feature 串追加到既有属性后；`X86TargetMachine::getSubtargetImpl` 再读取函数属性构造和缓存 Subtarget。因此只读最后一个函数，会漏掉工具入口改写属性的步骤。

| 源文件（llvm-project 相对路径） | SHA256 |
| --- | --- |
| `llvm/lib/CodeGen/CommandFlags.cpp` | `b2bb34966db56cefad5bcc087f0a80af7d159590ed523631413bfc5c3e2fe140` |
| `llvm/lib/Target/X86/X86TargetMachine.cpp` | `0a80b47bfd45fdcf0eb2456fb1da33907a2ed445e5481858876e410efad12ba7` |
| `llvm/lib/CodeGen/TargetPassConfig.cpp` | `709205a50ca8737db38acdf4554af3e9fcccca9be2f103ca4dab12e96388c95f` |
| `llvm/lib/CodeGen/SelectionDAG/SelectionDAGISel.cpp` | `dda3d47c2dfe69ee50366c0e6d22ad7f49046060ae99efa9e15461bd7615f361` |

后两份文件用于总图和阶段解释。图中的 DAG combine、类型合法化、vector 合法化、操作合法化、选择与初始调度是 `CodeGenAndEmitDAG` 内部逻辑；优化 CodeGen 的 RA、PEI 等由 `TargetPassConfig` 组织。图不声称所有目标具备相同实际 Pass 列表。
