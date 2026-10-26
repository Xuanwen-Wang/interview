# LLVM / MLIR 基础篇：原创插件与工程核对

采集日期：2026-10-26。对应正文 `content/50-compiler-internals.json`，原创文件位于 `practice/llvm/foundations/`。

## 范围与来源

本次只编译原创教学插件与 CPU 小例子，读取共享 LLVM/MLIR 源码，没有修改业务源码、重建 LLVM 工具链、执行模型或设备实验。工具报告 `22.0.0git`，共享 checkout 的 Git 元数据不可用，源码 revision unknown；不能根据版本串推断 commit。源码与工具分别记录 SHA256，不能把现有二进制与所有眼前源码自动视作一一对应的可复现构建。

本机绝对路径不进入公共记录。复现者用 `LLVM_ROOT` 指定自己的开发树，用 `OUTPUT` 指定仓库外输出目录；本次实际临时目录位于用户指定的数据盘临时空间，未使用 `/tmp`。

## 实际执行

```bash
python3 practice/llvm/foundations/run.py \
  --llvm-root "$LLVM_ROOT" --output "$OUTPUT"
```

运行器将 TMPDIR/TMP/TEMP 指向 OUTPUT。用已有 clang++ 编译两个共享插件，由 opt/mlir-opt 导出的符号解析 LLVM/MLIR API，没有链接另一套静态 LLVM 副本。该方式已在当前 Linux 工具验证，不声明适用于任意发布包或操作系统。

1. **LLVM 变换。** 自定义 `MulPow2Pass` 只处理无 nowrap 标记的标量整数乘法。匹配单比特常量后改为同类型 shl；使用 APInt，支持本例 i128 常量 2^64，不截断到宿主整数。
2. **分析缓存反例。** 正确 pipeline 为 `function(demo-print-muls,demo-mul-pow2,demo-print-muls)`，kernel count 为 3→1；错误 `demo-bad-preservation` 返回全部保留，count 为 3→3，而输出同样仅剩一个 mul。两种 pipeline 都启用 `-verify-each` 且 exit 0。说明 verifier 不校验任意缓存的业务语义。
3. **LLVM 原生执行。** 原始与改写 IR 分别经 clang 编译为 CPU 共享库；穷举 256×256=65,536 对 i8 输入，分别与独立 Python oracle `(11*x + 128*y) & 255` 比较，全部一致。仅测试 `kernel`；不会用带 nsw 的函数在其 poison 定义域之外执行来宣称等价。
4. **MLIR greedy。** 编译 `DoublePattern`，运行 `builtin.module(func.func(demo-double))`。无标记 muli-by-two 变成 shli-by-one；带 nsw 的函数不变。虽然显式关闭 folding，driver 仍删除失去使用的旧常量 2，新建移位常量 1 保留；正文据实际输出说明。
5. **MLIR conversion。** `demo-lower-mul` 固定教学目标 index=32 位，部分转换输出两个 index→i32 target materialization 和一个 i32→index source materialization。本快照的 LLVMTypeConverter 通用回调创建 unrealized_conversion_cast。
6. **完整下降。** 接 `convert-arith-to-llvm{index-bitwidth=32},convert-func-to-llvm{index-bitwidth=32},reconcile-unrealized-casts`，得到 i32 参数/返回值的 llvm.func，且无转换桥。经 mlir-translate 到 LLVM IR 再编译 CPU 共享库。
7. **MLIR 语义比较。** 原始标准下降与自定义改写后下降分别编译，rewrite 对 1,024 个 i32 值与 `3*x mod 2^32` 比较，index 例子对 1,024 对输入与 `x*y mod 2^32` 比较，全部一致。样本含 7 个显式边界与固定随机种子；不是穷举 32 位空间。
8. **两个预期拒绝。** SSA 反例输出 `Instruction does not dominate all uses!`；同一不完整转换设置使用 full conversion 时输出 `failed to legalize operation 'func.func'`。运行器要求二者失败并检查关键诊断。

## Poison 反例的证据层级

`mul nsw i8 1,-128` 的有符号数学结果为 -128，处于 i8 范围；`shl nsw i8 1,7` 的有符号乘 128 结果超出该范围，按 LangRef 的 nsw-shl 条件产生 poison。二者位模式可能相同，但 definedness 不同，不能无条件复制 nsw。

**实际观察并非“两个常量会打印不同输出”。** 本机 instcombine 对上述两条都打印 `ret i8 -128`，因为 poison 可被合法细化为具体值。正文与测试没有拿这种输出当作变换正确性证明；独立整数范围判断保存反例。另一个 `shl i8 1,8` 本次确实打印 `ret i8 poison`。这些观察分别对应语义推导与特定工具输出，不混为一谈。

## 交叉审稿修正：增加一次 undef 使用会改变语义

初稿 MLIR pattern 曾使用 `muli x,2 → addi x,x`。普通整数差分全部通过，但独立审稿指出增加 undef use 的风险。`undef-lowbit.mlir` 保留混合 Dialect 反例：`llvm.mlir.undef` → `arith.muli` 乘 2 → `arith.andi` 取低位。按照 LLVM undef 每次使用可独立选择的语义，源低位允许集合是 `{0}`，错误 addi 目标允许集合扩大为 `{0,1}`。

最终代码已改为 `arith.shli x,1`，保持一次 x 使用；运行器用独立的 8 位集合穷举验证 mul/shl 的低位集合均为 `{0}`，duplicate-use 的 add 反例为 `{0,1}`，并实际运行修后 pattern 处理该输入。上述所有常规测试在修正后重新完整运行通过。

本次并未宣称观察到 native miscompile：该快照 translation/优化可把原始与错误变换都细化为 0，单次原生输出不能证明允许行为集合相同。相关源码依据为 `llvm/docs/LangRef.rst` 的 undef 多次 use 示例，以及 `mlir/include/mlir/Dialect/LLVMIR/LLVMOps.td` 的 LLVM_UndefOp 定义。

## 原创输入与实现哈希

| 文件 | SHA256 |
| --- | --- |
| `FoundationPlugin.cpp` | `bc9bd9bd1d32bd9ec40e9dcd23b2e0471d7c1a3fa3a68c61001cbe7375bc9ad4` |
| `MLIRFoundationPlugin.cpp` | `90bfdde875aab401f42d3b3b0a40ec0ab7a8c7478695b633d9180d7fdcd086c1` |
| `bad-dominance.ll` | `c2893827c1aed64947922c53256f399797358c2e02b62a2945fcff6bd4168238` |
| `conversion.mlir` | `b710dd44712ffcfe4a4fd6a5816892db05016f075e5d3ed1d1d0eacf3ed0c01e` |
| `input.ll` | `9a676212b3d497a7af59337220a3838e3749defe9d199218714da673e28a7166` |
| `poison.ll` | `45a04109fa41acd283bfc41374b5c5a7245cdb7b49965a19a644aae2ef5534c9` |
| `rewrite.mlir` | `db342f730d4b4bdde1b38ab820143192a140e1ae389a1cfeb709ac601f69a1fa` |
| `run.py` | `060c4ebc9345ec923dd4e5ca1cdd17cb473fc8982cd7117b22952df622a4a42e` |
| `undef-lowbit.mlir` | `b6e7109aa34942d17faeb919f22a7e75261f6c322b9508e220ebb1b19345c1d4` |

## 工具哈希

| 相对位置 | SHA256 |
| --- | --- |
| `build/bin/opt` | `69f1c24961018766fb20aaf37879e18bf8c82a56f8ec0b2c7819dd556436f083` |
| `build/bin/mlir-opt` | `d90207a0ef04990e698096dfc2861d2899941d53197b995ee77997609a0c7010` |
| `build/bin/mlir-translate` | `a85adaf7553a053a0e93c0160d008273f72e5c45fe6072fa1e56930b7099b063` |
| `build/bin/clang-22` | `096731bddff8334786f3b551a9a21ae1206851b59475d607d356f245361c7038` |
| `build/bin/llvm-config` | `b822fcc29d3dae50d947f4a2930b130d83dd63c642b1003eb4e20fd4c0731315` |

## 引用源码哈希

| llvm-project 相对位置 | SHA256 |
| --- | --- |
| `llvm/include/llvm/IR/Value.h` | `359d1bbf59d747a0e0b2e40a2b94569cd984b5fbcb46e7dd935b67d44a6ba7cc` |
| `llvm/lib/IR/Value.cpp` | `effdf10d1d887a4475e369895a4c04fdd9073c5156baf84679419d516cab9ae1` |
| `llvm/lib/IR/Instruction.cpp` | `9bf76bcfa337f9be66646e3eee15665442b4f17f7093aca95dc1dc5ce727f855` |
| `llvm/include/llvm/IR/DataLayout.h` | `0855a033de59b19efe4daba69f05f327357963673f050b4b487dc381bac6fae4` |
| `llvm/include/llvm/IR/PassManager.h` | `3b2ad99390f8482c35430c08bce822047a2c61f50806d92b18cec7327e7f56f7` |
| `llvm/include/llvm/IR/PassManagerImpl.h` | `97aa3e5d2b85a5a2cc8b36b559f6c748f3eb0a65e77cfd89488c116f25277527` |
| `llvm/include/llvm/IR/PassManagerInternal.h` | `3670b2e55c40808c4a7b32b24b15440f342395a9729e2b15d0f64d0d51b7ead4` |
| `llvm/include/llvm/IR/Analysis.h` | `1684f620a8c098067b78112957a965bc9f9cfb7ed84801bc482338c8cdc71d49` |
| `llvm/lib/Passes/PassBuilder.cpp` | `7bf4a734a9de03a00947d31f9db6f6f112549b048aaf1c42b2fbe7f001eb2b1b` |
| `llvm/lib/IR/Verifier.cpp` | `9793f3823d3dafb8d62ccaee6241303b6274b3558b19784ca9a55bb117d541fd` |
| `llvm/include/llvm/ADT/APInt.h` | `d7d68ea5d0d4f67f0985fe95150c8b5e049a8d7234a2593c53ce75fa0aedd248` |
| `llvm/include/llvm/ADT/STLExtras.h` | `1050dac5e798a549c19552034709cec5ba5c5dbbc70fe39f9f05f225d24ba1b7` |
| `llvm/docs/LangRef.rst` | `21fe60706bf48588466254e849aeea9d8f70f8d7ee731aeb07ff3f9a3bb4fb67` |
| `llvm/lib/Transforms/Scalar/EarlyCSE.cpp` | `57b77366a1f8b3e599b762382fa1b200490bfa22d674d1e12ec1b370cea2c3cb` |
| `llvm/lib/Transforms/Scalar/LICM.cpp` | `b8f8466caecd8512dcac22a014514f10263a85ac82dc662d0260a55f2ebd7b61` |
| `llvm/lib/Analysis/ScalarEvolution.cpp` | `3cf36f52e33d7bbac927c01f38f8116ccf2723c75c2d7dc12aabdff297775eeb` |
| `llvm/lib/Transforms/Vectorize/LoopVectorize.cpp` | `aa77d08248a8b1b6e90c93df7486b3d9e01615bda6c15530106d6b786fbbafdb` |
| `mlir/include/mlir/IR/Operation.h` | `e6fa8d742b79163d347a5f5c818750ce231c12bbea33f35b70b86d18f5f28162` |
| `mlir/include/mlir/IR/Value.h` | `ad9695092514ae153506e398658389889987530012836f7d346197af9bec422e` |
| `mlir/include/mlir/Pass/Pass.h` | `b69e43223894495998b0bff50f58f548e2df18201165ff1ba6d4255e200832cf` |
| `mlir/include/mlir/Pass/AnalysisManager.h` | `f41b1af652b25f0ec6c5688bf8ffcb045ae266d2d48072b1685b351a6458517e` |
| `mlir/include/mlir/Transforms/DialectConversion.h` | `ff69769af208e6d7eac8b05656553142592b2075bb608c4cb2a4d12d99b4c464` |
| `mlir/include/mlir/Dialect/Arith/IR/ArithOps.td` | `8060a92f8c700d4a4bfcc1795ac3b9f7009442a46ec8741c395830cf7bb8479d` |
| `mlir/lib/Transforms/Utils/DialectConversion.cpp` | `feecba4214846ff11b18490f21147669ec776340a09f7e3ce0f2962ba1eabb6f` |
| `mlir/lib/Transforms/Utils/GreedyPatternRewriteDriver.cpp` | `5b933b5de7aebee141cac7f2ef8a5b09fd63a8ec15bc32fef491b33c2f5b783f` |
| `mlir/lib/Rewrite/PatternApplicator.cpp` | `43876098381c07cc9b41ce3c05b7a39cc7a33f385784b1de6319842d5976d5d6` |
| `mlir/lib/Conversion/LLVMCommon/TypeConverter.cpp` | `77302438d67bad9418fcd7c3ef720a78cbd058d44e289babdb8f5de0b7e174e5` |
| `mlir/lib/Conversion/FuncToLLVM/FuncToLLVM.cpp` | `bbe06b5d6708ec36c179c75ddc71e884a4f6b0e62162bdf5f7daed5ca21f18fe` |
| `mlir/docs/PatternRewriter.md` | `37bed5918cac5b9dc1535932e63f06909151ebc8b08c931a09a8888b1aadc872` |
| `llvm/lib/Passes/StandardInstrumentations.cpp` | `4bcd421449b14556d830e8a77b8342ebbc927c7cadfa30e4ff4ab24f8fc38daf` |
| `mlir/include/mlir/Dialect/LLVMIR/LLVMOps.td` | `c599abb044d9c5d4ec3c83a7bc6cf6a6960da918d2b2818d4142b01e097f268b` |

## 真实入口核对

只读核对 `triton_shared` HEAD `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。以下引用文件当时没有本地修改；另以 SHA256 绑定：

| 文件 | SHA256 | 源码事实 |
| --- | --- | --- |
| `backend/compiler.py` | `f3149995e2882afa896b61eb9d30063a4b2af873cd8857a7004021aa8875b3bc` | `add_stages` 中存在 ttir→ttsharedir→llir→obj 路线 |
| `tools/zeus-compiler/zeus-compiler.cpp` | `91fc3b1bbff0c02c97bea622ab2c0c104ed9cccb21a6e88e0513fc745ed55020` | 实际专用入口串接 ZeusHigh、ZeusLow、同步与自定义 CodeGen |

本文据此说明“依赖 LLVM 基础设施”不能等同于“最终必经上游 llc 的 SelectionDAG/Greedy RA”。环境脚本引用共享 build 只是依赖入口事实，未证明业务 binary 的完整构建来源，也没有执行业务编译。完整业务链详解由网站独立的 lowering 内容承担。

## 验证限度

- 已执行：两个原创插件编译、IR verifier、分析缓存好坏对照、SSA/full conversion 预期失败、限定整数域 CPU 差分与独立 oracle、输出结构核对。
- 仅源码/语义分析：MemorySSA、LICM、SCEV、vectorization、memref descriptor、分析依赖自定义 invalidate 示意、LLVM 各层 proxy 的生命周期；未声称本轮新实现或完整执行这些优化。
- 未执行：目标硬件性能、设备后端、模型、RTL、poison 输入的动态等价证明、跨平台 ABI 与新 LLVM 版本兼容。原生 O0 编译仅为运行例子，不是被测变换的性能评估。
- 页面技术/教学/视觉交叉审查由主任务统一记录；源码实验通过不代替浏览器验收。
