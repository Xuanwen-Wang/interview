# 同次 GEMM 后端审计

采集/核对日期：2026-10-26。主例 `python/zeus_examples/GEMM/gemm_normal_dense_bf16xbf16_bf16dst_f32acc_128x128x128_1core.py`，函数 `gemm_mkn_loop_f32acc_kernel`，单核、BM=BK=BN=128、BF16×BF16、FP32 跨 K 块累加、BF16 输出；M/K/N 为运行时参数。正文统一手算代入 M=130/K=260/N=130，但没有实际运行该组尺寸；实编译仍是同一动态 kernel。

## 证据边界

- 使用本机现有工具链作一次只编译采集，未重建；原始产物留在本地 `gemm-capture/`，网页嵌入对应摘录。
- 本次 `compile.stdout` 最后阶段明确为 `ZeusHigh → Assembly`。已取得 TTIR、High、逐 pass backend log、S；不能声称该次产生了 zbin 或跑过功能/性能仿真。
- binary SHA256 已固定。`zeusv3-backend` 为 `a54b9b1cd15025563015ccab906c76b52f921e033756456464550d38f54bc546`；`triton-shared-opt` 为 `9d99759e9f835c4b114f12443e9c4bd00b1756d04dd11c19c7f85f3eda2ebb9f`。采集前后核对确认采集前后 hash 相同，但 binary 构建对应 commit 未独立证实。
- 源码解释独立绑定 `triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a`；tracked dirty 为 `ci/test_job_vcs_case.txt`，以下实现文件 tracked clean。不能把该 HEAD 硬绑定 binary。
- `test/ZeusV3Backend/Integration/EndToEnd/matmul_mkn_aligned128_1core.mlir` 虽被 Python 注释称作对应手写 test，但它是 INT8/BF16 acc 的手工 Low fixture，不能拼成这个 BF16/FP32 主例的中间阶段。
- July 两核尾块历史 artifact 与此主链独立，未混入当前 IR。

## 直接用于正文的 11 节

后端正文覆盖 11 个稳定节 ID；真实 IR 从本次记录按行提取并 HTML 转义。每节证据折叠说明给出精确行段；业务源码未修改。

## 关键纠错与可讲的因果

1. **本例不是 PE 直接读写累加器**：TTIR 37–39 是 dot(zero) 后独立 addf(loop accumulator,dot)。High/Low 和 S 都保持该分离。Low 15089–15092；S295–303。PE 输出本块 partial，VP DTSR 读旧 accumulator 与 partial 再写 accumulator。源码 `ZeusHighToZeusLow.cpp:4478–4480` 明确 PE dst 只写；跨 K 的相加不能通过改 PE dst 省掉。
2. **末尾 cast 仍是独立命令**：Low15103–15111、S319–326。TensorOut+FP32→BF16描述符+carry_round；独立 STSR。若候选优化 last-iteration add+cast，要处理末轮拆分、K=0 和舍入边界；每轮BF16不等价。
3. **清零不是浮点 old×0 即可**：High38–40 的 nan_safe_fill 到S130–143使用同地址INT8字节视图，C从128元素变512字节(编码511)，正零可省typed stage。源码5403–5507,5511–5560。不扩展到负零或任意 fill。
4. **控制流两次展开职责不同**：BeforeSCF5402循环；AfterSCF6002–6007/6151–6153循环头与回边；AfterLowerArith6963–6978又把boundarymax/min变菱形。因此不能说SCF→CF后CFG再不变。给出的clamp是真实路径代码，不保证任意负尺寸都受支持。
5. **φ不是张量寄存器搬运**：boundary合流标量见Low6963–6978，S82–88两边写R26；tensoracc早已buffer化。一般GPR并行copy可破环，此case没有复制环。ARphi不受支持，不可泛称各regclass共用MOV。
6. **signed分支不是SUB+JL**：S61–70 有 JO+resetflags+反向JGE。selector1470–1544解释frozenRTL与诊断模拟器N/NxorV差异；必须保留flags producer。语义反例INT_MIN−1只是解释，不是本次运行输入。
7. **真实spill非常适合解释分配器**：BeforeCodeGen15592起无该spill；After15972新增get_spill_vreg、16017存M块数、16037循环头恢复。S43写VR3lane0、S62恢复。当前源码将第0块spill scratch固定映射VR3；本次选择的是M块数和lane0。不可叫张量spill/SRAM地址分配；也不可没有决策报告就声称具体victim选择是全局最优或已知用了fallback。
8. **目标字段表示不是shape变化**：WBS128→7，MT(4,1,2)→(3,0,1)，S295；动态W/C用临时Rx27/Rx28减一，S208–210。IE0表示寄存器字段，27不是tileW。源码679–748,2944–2978。
9. **recipe不是最终BR号**：Low15069–15077 logical resource3/recipe/materialize描述PEpartial。98304是L2地址，65536是buffer字节，最后SBR7才是实际寄存器。为有限BR和配置重放保留表达；代价为资源身份/状态/同步跨层契约。
10. **SelectionDAG仅能说当前路线**：项目内RA→select→peephole→晚期fetch合法化→ASM/zbin源路径清晰；本人回忆的早期讨论缺独立设计记录。采用LLVMtarget的利弊只作架构分析，不作历史动机。
11. **代码生成与装载仍有ABI**：S1–15记录单核、36字节参数区、6参数描述和AR30占位。weight实际打包占据后续offset间隔，别简单6×4。本次到ASM；zbin的layout/encoding/patch仅用源码说明。

## 日志阶段目录

| 阶段 | kernel.backend.log 起止行 |
|---|---|
| After ConvertZeusHighToZeusLow | 510–1057 |
| Before SCFToControlFlow | 5082–5673 |
| After SCFToControlFlow | 5674–6283 |
| After LowerArith | 6894–7313 |
| After LowerStandardCF | 7734–8152 |
| Before InjectSync | 14472–14837 |
| After InjectSync | 14838–15214 |
| Before CodeGen | 15592–15968 |
| After CodeGen | 15969 起 |

`After` dump 缺失不表示 pass 未执行；例如本次 SplitCriticalEdges 无 After，不能据此编造它具体分裂了哪条边。

## 不应声称的结论

- 没有本次 runtime/数值/性能证据，不能称正确率或加速比；静态出现spill/多条SETM也不能直接推出瓶颈。
- 没有selector前后机器指令dump，不能判断每条PEEPHOLE_GUARD标签由何种晚期合法化引入；当前源码有fetcherratum流程，但本例是否实质修改不能由标签猜。
- GPR、BReg描述符、VRspilllane、L2tensorallocation四个资源层次必须分开。
- `PE_SETM_U UEN0`确实显式重置状态，本例不是UScale算例。
- lane64是模式配置，不是本例已量出的吞吐。

## 文件 SHA256

| 文件（相对根） | SHA256 |
|---|---|
| source/lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp | `00d23c78e9434c76f55fc140e63d9043362f550a8bd1608367d2af287ef4d91f` |
| source/lib/Conversion/ZeusHighToZeusLow/VPModuleToConfigMapping.cpp | `1a763fc4bb3aeac1a4b173716ada506dc3e8eb57e522801b51963cef587947d5` |
| source/lib/Dialect/ZeusLow/Transforms/LowerArithPass.cpp | `d986b72256ca9cd6e147b4064641779861fd580de281f1cfc563e302de9da0c9` |
| source/lib/Dialect/ZeusLow/Transforms/StandardCFLowering.cpp | `1e6610f4bf20e9cf97867aa6a7290d88914acea227be345e53a7b396dcc89cbd` |
| source/lib/Dialect/ZeusLow/Transforms/LowerStandardCFPass.cpp | `a46ed1604e183a335d57b33a70c2b9252e61b3057dd59ce9e29f1f170018fe21` |
| source/lib/Target/ZeusV3/CodeGen/InstructionSelector.cpp | `c42d552e7f4f84af90925a356927cc9717114dce003f5f636beb7ce42f464ac1` |
| source/lib/Target/ZeusV3/CodeGen/CodeGenPass.cpp | `5349d05c30e995814fb9de17e9764cfd0ddf06a6a43718b97a0cf83c73ba1817` |
| source/lib/Target/ZeusV3/CodeGen/SpillRewriter.cpp | `e2f508b3ba9b2f40dd68efcc8c8a9b991c7d08f5da07969a24b1d03aec5bd17a` |
| source/lib/Target/ZeusV3/CodeGen/RegisterAllocatorBase.cpp | `127d3f9b038ccb9b70b0e1f9cb1abe9726d4076a9398c930ddc2f9f6b15e5d58` |
| source/lib/Target/ZeusV3/CodeGen/PeepholeOptimizer.cpp | `aa2c7d220f10e252a998aa72c52077b9c03c34b798d6e04bbec4bb102fc285ee` |
| source/lib/Target/ZeusV3/Binary/CTFetchErratum.cpp | `be5dd4ac505687a0d497b9f2d3e02c7dfd43f70f59a1da63abf3f0c434a4e5a6` |
| source/lib/Target/ZeusV3/Binary/Builder.cpp | `cb65ee9efb4a94eb10deabe4b8a0f2b58e44cbfd0d789952bc0f300cb23709c2` |
| source/lib/Target/ZeusV3/CodeEmitter.cpp | `3a90c95c952633c7b0abb5d2caec3f6fa9ce0b65f0ac3592c4c5a3e458e9318a` |
| source/tools/zeus-compiler/zeus-compiler.cpp | `91fc3b1bbff0c02c97bea622ab2c0c104ed9cccb21a6e88e0513fc745ed55020` |
| capture/kernel.py | `6cb349d6d67abbe7fa23c02987c579bea6226099e633bcabf94dff9697c6db9b` |
| capture/ir/kernel.ttir.mlir | `d64a2cf660f50340c41848eb69a93a729655e46efbd1f73550df7ec4d93d61af` |
| capture/ir/kernel.zeushigh.mlir | `4f31aca78fd9ea0b5bb5b177d772c3a60f8532cfd160ff8bc351e340af697012` |
| capture/ir/kernel.backend.log | `e1957c09332b6e75c9f2878098cb2b5009f5210e5d966da801026d047bc3610d` |
| capture/ir/kernel.S | `d083dd637b7e766ca117e324ec851f91d99d754f3a011cf20134152944f80b9e` |

## 面试追问（围绕真实产物）

- 为什么M块数被spill，而不是K块号？若重新计算与VRreload二选一，拿什么数据比较？当前没有分配决策报告时能确认到哪一步？
- 可以把PEpartial和accumulator复用同一L2地址吗？VP会同时读哪些旧值，PEdst的访问契约允许什么？
- 只将最后一轮VP加法融合BF16cast要新增什么控制流？K=0与tail如何处理，如何验证舍入未提前？
- 为什么dynamictile128要先减一，而PI位置不能减一？立即数字段放不下与硬件decoded字段放不下有什么不同？
- 对conditionaledge上的blockarg怎样避免无条件执行phi复制？为什么AR没有对应MOV就不能直接套GPR方案？
- 对signedcompare删掉JO保护要怎样证明范围？为什么死寄存器定义消除不能删除写flags的SUB？
- 为什么把physicalBR分配拖到后面还要在InjectSync后复查contract？数据地址不变时描述符复用仍会改变什么？
