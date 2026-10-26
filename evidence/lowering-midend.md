# 518 lowering 中端与表示设计：源码证据

- 采集日期：2026-10-26（Asia/Shanghai）。
- 仓库：triton_shared；HEAD：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。
- 证据层级：当前工作区静态源码、ODS 与回归文件；没有重新运行编译器构建、MLIR 测试、CycleSim、VCS 或模型。
- 全仓 tracked dirty：`M ci/test_job_vcs_case.txt`。未跟踪文件较多，未作为当前主线依据。
- 本文所引路径相对 HEAD 的改动：无。
- 下表记录当前文件 SHA256，避免只写仓库版本而漏掉本地变化。

## entry-paths

- ZECC `triton_bridge.cpp:169–240` 先调用 gen_ttir，再调用 zeus-compiler；kernel_to_ttir.py 只使用 CPUBackend.make_ttir 优化 TTIR，不继续走该类 add_stages 的 llir/obj。
- 离线 zeus_compile.py:309–455 通过 triton-shared-opt(A+B) 和 zeusv3-backend(C) 分段编译。
- backend/compiler.py:302–312 的完整 add_stages 仍有 LLVM/CPU 后半段，不能画成ZECC设备必经链。
- zeus-compiler 与 zeusv3-backend 的后端核心编排相近，但入口cleanup、显式option与checkpoint处理不同；未证明二者在所有输入/选项下逐字节等价。

## bufferization

- Phase A: TritonToLinalgExperimentalPass.cpp:512–564 使用 OneShotBufferize copyBeforeWrite=true, alignment=16；注释明确 single-writer 是 VP cast fusion 的前提。融合后的 InplaceBufferize 在 ZeusHighPipeline.cpp:241–263 收回空间。
- Phase A 刻意不启用 BufferLoopHoisting，避免descriptor活跃区间跨全循环；SafeLICM保护循环承载内容的view。不能把一般CPU allocation hoisting直觉直接照搬。

## descriptors

- FmapDescType：四维；WeightDescType：三维。ExpandDim前置unit dims，不凭空拆真实数据维。PE weight的硬件NKC轴名不能不经映射就当作算法GEMM M/N/K。
- CreateFmapDesc携带原始memref与最终logical_element_type，不能追到根指针后丢失bitcast后的访问类型。
- descriptor的值、原始allocation身份、物理BR residency是三个相关但不同的身份。ZeusLow LogicalBRegResource/DescriptorRecipe/MaterializeBReg 明确拆分逻辑资源、配置版本与物理物化。
- BR set_am/set_addr/set_tensor/set_tile/set_pos在ODS显式存在；任意MemRef stride不能直接声称硬件都可编码。

## bounds

- CreateFmapDesc.cpp:1228–1513 区分物理行距与逻辑width，相关路径保存 logical_inner_extent；UBG:471–506 以getLogicalGdgShape取逻辑边界。
- BoundaryGuardUtils.cpp:104–168 普通GDG尾块min(block,max(remaining,1))是硬件零tile编码保护，不是空核correctness证明；GuardEmptyCore独立承担跳过/证明/拒绝。
- StructuredToMemref fillWithValue保留masked load other，先填后拷贝的padding不能因DMA收窄自动删除；UBG还有gather snapshot检查与zero-store guard。

## historical-boundary-guard

- 找到了 `d115a6c85a636349633e75fc5cc3326bbed99f1e`（2026-10-22，revert MR1064），但 `git merge-base --is-ancestor d115a6c85 HEAD` 返回 1。
- `git merge-base d115a6c85 HEAD` 等于本文HEAD，证明revert在另一引用上且是当前checkout的后代；此checkout不包含它。只证明本地引用关系，不推断远端master现状。
- 本文讲当前82613源码里的UnifiedBoundaryGuard，不把已见历史revert或另分支方案称为此checkout默认。

## pipeline-order

- ZeusHighPipeline.cpp是最终依据。Phase B顺序为规范化→硬件适配与映射→配置/融合→descriptor→boundary/empty-core→BR合法化与字段验证→可选并行/调度和寿命→地址分配→SISO pair planning→VerifyNoReshape。
- AddressAllocation晚于可能改变descriptor/布局的规划，但并非最后一个Pass。DoubleBuffer/loop-scheduling/parallel等是否运行取决于选项或kernel hint。

## external-primary-source

- NVIDIA CUDA Driver API, Tensor Map Object Management：<https://docs.nvidia.com/cuda/cuda-driver-api/cuda_driver_api/group__CUDA__TENSOR__MEMORY.html>（2026-10-26核对）。cuTensorMapEncodeTiled的输入含base、dims、strides、boxDim等，支持“GPU也有descriptor”的有限对照。不据此宣称任意GPU与518布局合同相同。

## interviewer-questions

1. 为什么使用ZeusHigh descriptor层？它为融合/边界/物理分配分别保留什么？为什么不早早分配物理BR？
2. copy-before-write让哪类融合更容易证明？有哪些alias或multi-user场景禁止原地化？
3. 一样的shape为何仍可能读错？给出pitch、pointer bitcast、padding和position坐标系中的一个最小反例。
4. 为何先保留逻辑坐标做boundary，再进行地址重定位？mask/other、空核、零store如何分责？
5. 加入新的layout或并行优化，放在哪一层、重算哪些分析、用什么invalid test拒绝不能保证的输入？

## teaching-example

- 采用明确教学 Y=max(X+2,0)，BF16 [6,32]、nominal tile[4,32]、末块[2,32]。有限小整数避免本章误将舍入/NaN语义混入shape教学；真实编译仍需遵守数值合同。
- 行距变体单独声明pitch48元素=96B；逻辑宽度仍32。此例不代表业务shape、实测二进制、真实性能或完整硬件模拟。

## file-hashes

| 相对路径 | SHA256 |
| --- | --- |
| `backend/compiler.py` | `f3149995e2882afa896b61eb9d30063a4b2af873cd8857a7004021aa8875b3bc` |
| `tools/zecc/csrc/triton_bridge.cpp` | `92aa635a45470ae2fc5c74b78c989ed7127c66bfb90ae4efa4b2e162625e85e7` |
| `tools/zecc/kernel_to_ttir.py` | `9c49ff8ca2c7f4b9545225f093a49985bb57eb84ae2f14e0b6bc0f5f02d573a0` |
| `zeus_compile.py` | `7bae9277f26a2586b945ff3d7d9c12cec6340762ab591ebf63bca6058264252e` |
| `tools/zeus-compiler/zeus-compiler.cpp` | `91fc3b1bbff0c02c97bea622ab2c0c104ed9cccb21a6e88e0513fc745ed55020` |
| `tools/zeusv3-backend/zeusv3-backend.cpp` | `5da639aa4ed4af24979d27bb74a6464359fd1b8142d4dd1f6037bcf11827f75a` |
| `lib/Conversion/TritonToLinalgExperimental/TritonToLinalgExperimentalPass.cpp` | `2895e2379ff8603206bbe94ec95c1e84d7014a76f323b8c0ea7f2c4d9723668b` |
| `lib/Analysis/PtrAnalysis.cpp` | `5d70173956b8241c837a017f7e57a38b5cc62814048d382ab54ef720be62c573` |
| `lib/Conversion/StructuredToMemref/StructuredToMemref.cpp` | `ad5117f19f3fbf5b546f4e5c658248d5162c9d6f7e5ac0011c1c19337c2c5d41` |
| `lib/Dialect/ZeusHigh/Transforms/ZeusHighPipeline.cpp` | `118d7b62b796f52cefaac8e022ea7ea785ad5b0ee96ee0ab2a8f7e50f4736de1` |
| `lib/Dialect/ZeusHigh/Transforms/ExpandDim.cpp` | `2fe449af6427e511612ab5b6732b09b51a88e9af4074949e10cf6b599b1a6045` |
| `lib/Dialect/ZeusHigh/Transforms/CreateFmapDesc.cpp` | `dee20557db686be0e01f0fa03b76fa2011c3111714a7c278d94c10af9b573651` |
| `lib/Dialect/ZeusHigh/Transforms/CreateWeightDesc.cpp` | `a3e1726b9ecc73f81d2b8b5cdc161683c7b5adce1fe136bc1796efea3879b1a1` |
| `lib/Dialect/ZeusHigh/Transforms/UnifiedBoundaryGuard.cpp` | `e8fde3354d054ba13d658ac509d79dffe9b166d6d5e36f4812b8fb93f9cf1d51` |
| `lib/Dialect/ZeusHigh/Transforms/BoundaryGuardUtils.cpp` | `3d371286bcefb6e4822e7600d9dcc596a939a55f72d88d507a5f227723f4ca4b` |
| `lib/Dialect/ZeusHigh/Transforms/LegalizeBRAddressing.cpp` | `65f571cf6e1ebd60b11ed3af1860c0a738105ff6650a732b91c4d58840fbe780` |
| `lib/Dialect/ZeusHigh/Transforms/ValidateDescWidths.cpp` | `2b9968005d11ac999b1505f317ded73550f15f74a047cf18d6c06f5ef3f1b671` |
| `include/triton-shared/Dialect/ZeusHigh/IR/ZeusHighTypes.td` | `36e045d4e39d2993077a3f5450c8d5e1a73fb4d779163877fb4f286eb3a9a51f` |
| `include/triton-shared/Dialect/ZeusHigh/IR/Ops/ZeusHighDescOps.td` | `2dec95feb71bc6619a1329dd22c43e99484052b8ef6e642e62aadf1af621e8c6` |
| `include/triton-shared/Dialect/ZeusHigh/IR/Ops/ZeusHighWeightDescOps.td` | `9f064a0d6b6c65b61517c44e69f1ab107d62e730281c1ce0e181e18a76e41806` |
| `include/triton-shared/Dialect/ZeusLow/IR/ZeusLowTypes.td` | `f467d429836fc2974ed9876c19563e30912d38baa53f97c7dc6f67bc93846614` |
| `include/triton-shared/Dialect/ZeusLow/IR/Ops/ZeusLowRegCfgOps.td` | `db6d848904115e2dc96bbfe0e5dd89452bc3c88ab10e285459e0df20266df3ea` |
| `include/triton-shared/Dialect/ZeusLow/IR/Ops/ZeusLowAllocOps.td` | `5e0ec18e62594482a402e60ae6689f637bad406010cf64a38742fb649bb2dc82` |
| `test/ZeusV3Midend/Unit/Transforms/create_fmap_desc_runtime_gdg_pitch.mlir` | `1f67121a26c472b0340000d08a8f26e55c24da068650adc1bf56d8c29aa61c49` |
| `test/ZeusV3Midend/Unit/Transforms/create_fmap_desc_runtime_gdg_pitch_invalid.mlir` | `52f7a03a12455f247cf2db9835d7f893d5fa1cb67ea2f38422dd8abb20d6cc80` |
| `test/ZeusV3Midend/Unit/Transforms/legalize_gdg_row_pitch.mlir` | `e0aa039643bdee82f1c600c1c9315a84a4fd46926f54e0c5afb60d5220671161` |
