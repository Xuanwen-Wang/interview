# LLVM 指令选择工程复现记录

采集日期：2026-10-26。对应 `llvm-backend` 的 pipeline/target/SelectionDAG/GlobalISel 各节。

## 基线与证据范围

- 源码仓库：本机共享 `llvm-project`，版本文件为 22.0.0；Git 元数据失效，**revision unknown**，无法给出可靠 commit 或 dirty 状态。下表固定本次实际阅读文件，不能将它们归给某个未知 HEAD。
- 使用已有构建的 `llc`：`LLVM version 22.0.0git`、`Optimized build with assertions`，未重建工具链。源码快照与构建来自同一共享目录，版本字符串和观察到的 lowering 行为一致；没有可用构建 revision，不能据此声称逐文件可重现构建。
- 实验目标固定 `x86_64-unknown-linux-gnu`、`-O2`、`-mcpu=x86-64`，显式对照 `-mattr=-lzcnt` / `-mattr=+lzcnt`。可用构建注册 X86、AMDGPU、NVPTX；没有执行或推断 AArch64/RISC-V 的编译结果。
- 所有 `.ll`、C oracle 与 Python runner 是为教学原创的输入。共享源码只读；无业务代码、模型数据、工具链修改。
- baseline 生成对象、链接并在 x86-64 CPU 执行独立 oracle；`+lzcnt` 只编译。没有计时、吞吐或端到端性能结论。

`llc` SHA256：`ee92efaff64c0a990a49be5683d616d582acd8065a738e2bcae6c85e755bd444`。

## 运行入口

从仓库根目录执行，`LLVM_BIN` 指向已有工具目录；输出目录应在仓库外，机器临时目录空间足够。

```sh
LLVM_BIN=/path/to/llvm/build/bin \
python3 practice/llvm/isel/run_cases.py --output /path/to/external-output
```

非 x86-64 主机可加 `--skip-execution`，此时只能声称编译观测，不得沿用下方原生执行结论。runner 为 subprocess 设置 TMPDIR/TMP/TEMP 到输出目录，关闭 core dump，使用流式 SHA256；不会创建或重建 LLVM。原始 stdout/stderr、MIR、汇编、对象与 manifest 均保存在指定输出目录，不提交大段自动产物。

核心等价命令（全部采用同一份 `selection-cases.ll`）：

```sh
llc -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 \
  -mattr=-lzcnt -verify-machineinstrs selection-cases.ll -o baseline.s
llc -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 \
  -mattr=+lzcnt -verify-machineinstrs selection-cases.ll -o lzcnt.s
# Add -stop-after=finalize-isel for MIR; add -debug-only=isel for DAG stages.
# Add -debug-pass=Structure to observe the actual top-level pipeline.
llc -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 \
  -mattr=-lzcnt -verify-machineinstrs -filetype=obj selection-cases.ll -o baseline.o
cc -std=c11 -O2 -Wall -Wextra -Werror check_baseline.c baseline.o -o check-baseline
./check-baseline
```

## 结果与可核对的中间表示

1. 两种 feature 配置的汇编、`finalize-isel` MIR、DAG 阶段转储均返回 0；启用 MachineVerifier。
2. baseline 对象链接独立位循环 oracle，输出 `PASS: 60314 independent bit-loop/arithmetic checks`，退出 0。i8 穷举 256 个值；i32/i128 和 64 位立即数使用 9 个边界加 10,000 组固定种子样本；另有 2 个 i128 高半单独置位边界和 4 个地址用例。计数函数 oracle 按位扫描，不调用 clz builtin。`clz32_nonzero(0)` 不执行，因为该输入结果为 poison。
3. `clz32_defined` baseline：`movl $63,%eax; bsrl %edi,%eax; xorl $31,%eax`；开启 LZCNT：`lzcntl %edi,%eax`。这是目标源码采用 `hasBitScanPassThrough()` 的结果，不是预设必须产生 CMOV。
4. i8 开启 LZCNT：`movzbl %dil,%eax; lzcntl %eax,%eax; addl $-24,%eax`。DAG 的 operation legalization 先生成 zext/ctlz/sub24/trunc；最后 combine 改为 mask/ctlz/add-24/trunc；选择后 mask 成为零扩展指令。
5. i128 类型合法化：高半非零则用 `ctlz_zero_undef(high)`，否则用 `ctlz(low)+64`；结果高半为 0。i128 输入 ABI 与返回 ABI 在 MIR 中分别能核对 `$rdi/$rsi` 与 `$rax/$rdx`。
6. `clz_load` 开启 LZCNT 的 MIR 核心：

```text
%2:gr32 = LZCNT32rm %0, 4, %1, 12, $noreg,
          implicit-def dead $eflags :: (load (s32) from %ir.p1)
```

最终为 `lzcntl 12(%rdi,%rsi,4),%eax`。生成 matcher 记录 MemRef、检查 load 类型和 HasLZCNT、执行 selectAddr、合并 chain，再生成机器节点。不是把访存语义丢掉以后合成一个算术指令。

7. 常量 2147483647 用 LEA 位移；2147483648 被选成 `SUB64ri32 ...,-2147483648`；2147483649 用 `movl` 物化后加法。阶段日志证明第二个改写发生在 Select，最后 Combine 后仍为 add；规则在 `X86InstrCompiler.td`，另有 `X86add_flag_nocf` 变体，不能假设 add 与 sub 的所有 flags 等价。

## 负例与支持边界

**IR 合同负例**：`invalid-immarg.ll` 把 ctlz 第二参数写成 SSA 值。llc 返回 1：

```text
immarg operand has non-immediate parameter
i1 %zero_is_poison
input module cannot be verified
```

失败发生在 LLVM IR verifier，尚未进入合法化/选择器。修 pattern 无法修复这种输入。

**GlobalISel 边界**：相同 baseline 输入，加 `-global-isel -global-isel-abort=1`，返回 1：

```text
LLVM ERROR: unable to legalize instruction: %1:_(s32) = G_CTLZ %0:_(s32)
(in function: clz32_defined)
```

源码 `X86LegalizerInfo.cpp` 的 G_CTLZ 规则对 s32 受 HasLZCNT 限制，没有为本例 baseline 接通 SelectionDAG 那样的 BSR 下降。结论仅适用于此工具哈希和该配置，不能概括所有 target 或更新版本。runner 把它作为版本绑定的预期失败；升级后若成功，应更新证据和讲解。禁 fallback 是为了确认走通的是 GISel 本身。

## 源文件与生成选择表 SHA256

下列路径相对 `llvm-project` 根目录；`build/lib/...` 是当时已存在的生成表，本轮没有运行 TableGen 重建。

| 文件 | SHA256 |
| --- | --- |
| `cmake/Modules/LLVMVersion.cmake` | `4bfbf0035b772cf590538b515f8753833fde0839a1128b4f6f0503a343fa4fbb` |
| `llvm/docs/LangRef.rst` | `21fe60706bf48588466254e849aeea9d8f70f8d7ee731aeb07ff3f9a3bb4fb67` |
| `llvm/include/llvm/CodeGen/TargetLowering.h` | `a5e8ca68a8b547353596ed0f9f18d229fc9c7f051a1a0e548988d3504da2e3fd` |
| `llvm/include/llvm/CodeGen/CallingConvLower.h` | `4a969ae8b5f74d9ed7008e1abad49ced5407be84986d308e95732966692dde29` |
| `llvm/include/llvm/CodeGen/SelectionDAGNodes.h` | `d91bf3b91569aa4b2fe62c53a497bd8a51359bc3a0ca27b8885e5822423a8ac8` |
| `llvm/lib/CodeGen/CodeGenTargetMachineImpl.cpp` | `3e193e165888aede1d6c1639e025e59bfd358103e649f121837e4f712afc4c7c` |
| `llvm/lib/CodeGen/TargetPassConfig.cpp` | `709205a50ca8737db38acdf4554af3e9fcccca9be2f103ca4dab12e96388c95f` |
| `llvm/lib/CodeGen/FinalizeISel.cpp` | `bad7ad8ffe853243b6d1d317fb6c8aa83cb7ec1424cba950277b9aa0900fc147` |
| `llvm/lib/CodeGen/SelectionDAG/SelectionDAGISel.cpp` | `dda3d47c2dfe69ee50366c0e6d22ad7f49046060ae99efa9e15461bd7615f361` |
| `llvm/lib/CodeGen/SelectionDAG/SelectionDAGBuilder.cpp` | `29967fd734d2c8e26d66b9b12298f29e4a66589be5c1b2f91660633fbd525cfd` |
| `llvm/lib/CodeGen/SelectionDAG/DAGCombiner.cpp` | `3463184c9eee47a4abcbf6ed91d794fae76337e0da6667dbaa53ecd5eb9e8dba` |
| `llvm/lib/CodeGen/SelectionDAG/LegalizeTypes.cpp` | `f9455b1600e598add44c968b4bb1d41d9332d022488344f685d427deee86ccff` |
| `llvm/lib/CodeGen/SelectionDAG/LegalizeIntegerTypes.cpp` | `747f7e4243e3a8b025768d1eb928a77ba58d8feb016371137c82fb5ff2a2ff6f` |
| `llvm/lib/CodeGen/SelectionDAG/LegalizeDAG.cpp` | `836a5237b9c0d84cca29fcb984198298915cb55c2fa98cbe5a0c3acef218d3ff` |
| `llvm/lib/CodeGen/SelectionDAG/ScheduleDAGSDNodes.cpp` | `701e2c0c275fef81b04e865da9232dc6502731ba45d6e610fae1e617a19b0279` |
| `llvm/lib/CodeGen/SelectionDAG/InstrEmitter.cpp` | `0cf67a788b69b0fd3782bbd9b42ed3b725395d76047842184cd3ae485842b069` |
| `llvm/lib/Target/X86/X86ISelLowering.cpp` | `a6bed271fd260ea92e2514890c78162415c8cd4d42855058fe23eabb64d29fb6` |
| `llvm/lib/Target/X86/X86ISelLoweringCall.cpp` | `72c1d7372edad72cd4bf8bcc6ac507aeef17c24737042dbf57a6b07c9da6f445` |
| `llvm/lib/Target/X86/X86ISelDAGToDAG.cpp` | `5a3aa6501debf00cfa54d6ae546dc15a3ca466f1bc065e44e96ad6dfd9060779` |
| `llvm/lib/Target/X86/X86Subtarget.h` | `76f2dd45b1bd6adb6b4b4a5366c958d099392af7344630323bdb04cb1761add9` |
| `llvm/lib/Target/X86/X86CallingConv.td` | `a7a0b033716501070ea1025caada896bc7a2cebfb3e2693b19cb5522aadfae06` |
| `llvm/lib/Target/X86/X86InstrMisc.td` | `a3b66bcb445fb9ba1843b93f8b612d1eeeb1b5e52614b96d7ae73e39ae944fe9` |
| `llvm/lib/Target/X86/X86InstrCompiler.td` | `8ebf2e5ca24d993312547175ef8e89a39871ac7ff930d10ffa81481ca4354653` |
| `llvm/lib/Target/X86/X86InstrFragments.td` | `a93b914223d05b7159c369c992cd499145b990bb73d9cdc1baed28aead385c77` |
| `llvm/lib/Target/X86/GISel/X86LegalizerInfo.cpp` | `af9191ae4a0ed9a76769c94de6f765712f5fd5795575fb7cfac27121aec5f859` |
| `build/lib/Target/X86/X86GenDAGISel.inc` | `1b337b892fc8a125e8bfba828822d057cafa87920b61a3faa7fb8529db247085` |

## 原创实验输入 SHA256

| 文件（相对 practice/llvm/isel） | SHA256 |
| --- | --- |
| `check_baseline.c` | `5a7fb65261dbefd267c93228826e1e05c543289e82d89abf6bea87226d94ce39` |
| `invalid-immarg.ll` | `81127ff17215edfc98d72209df4fb5e8ae3b57def9d7251f3fcf5a892298ae1a` |
| `run_cases.py` | `a2ac80a6a2390e332ea9dbf34941d1f1bea86cb4a6f38ef83bbcb3a64d08a21b` |
| `selection-cases.ll` | `091983239c3f7d02a215133ac8b946384df2af007fb447b74a3aefabd0ba1a1b` |

## 阅读依据与审查

- 官方机制参考：[LLVM Code Generator](https://llvm.org/docs/CodeGenerator.html)、[GlobalISel](https://llvm.org/docs/GlobalISel/index.html)；术语和架构用于交叉核对，具体实现、接口和行为依上表当前源码。
- ctlz 的 poison/零语义核对本快照 `llvm/docs/LangRef.rst` 的 `int_ctlz`。
- 用户提供的 Five100Miles 历史系列用于理解预期模块组织；本次 web 读取目录失败，未用搜索摘要支持技术结论，也未复制其正文或图。
- 技术自审：逐项核对 Type/Operation legalization 分界、ReplaceNodeResults/LowerOperationWrapper/LowerOperation 路径、BSR fallback、LZCNT TD字段、selector内存折叠和GISel失败位置；纠正了“+2^31一定物化”和“zero必须分支/CMOV”两种常见误判。
- 教学自审：先给同一个输入的语义合同，再用阶段IR/MIR/汇编解释变化；新增i128拆分图明确高/低半、条件与zero-poison分支。最终页面的视觉检查由整合任务记录，本文件不把JSON解析成功当作视觉验收。
