# GEMM：三个值得放进整体 lowering 主线的真实决策案例

本轮日期 2026-10-26；当前 `triton_shared` HEAD `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。已沿前轮读取的 AGENTS/CLAUDE/InjectSync专项规则保持业务仓库只读，本分任务只读源码、Git历史和已有材料，不运行或重建编译器、模型、仿真。主任务随后另行完成了一次真实 GEMM 编译；其可读产物在本文末尾单列，不与历史 fixture 混用。下面所有“CHECK”是已入库测试的预期，不是本轮执行结果。

推荐主顺序：**1. 两核GEMM为什么store越界到另一个核 → 2. 独立GEMM为何因共址必须等待 → 3. 描述符复制为何既不能删数据依赖，也不应制造配置完成等待。** 这三例分别迫使读者回答：访问域谁来表达；空间如何改变时间；配置状态与数据存储为什么要分开建模。

## 案例一：两核各算65列，为什么core0却写了128列？

### 可核实的输入、产物与历史边界

- 历史诊断形状 M=128、K=128、N=130，CORE_NUM=2，BLOCK_M/K/N=128。每核N_per_core=65，M/K无tail，仅N分片有tail。
- 归档 `docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/` 内有 source/kernel.py、TTIR、ZeusHigh、汇编、失败C++与Python对照摘要。目录是未跟踪历史材料，不能归给当前HEAD，以下用文件hash固定。
- **已核验**：归档source/kernel.py逐字节等于修复提交 `4c41a542fa7a7d715016ee618c1613cb0dd6eaa1` 的parent中同名Git文件。该修复提交日期2026-07-17，主题 `fix(GEMM): isolate multi-core tail stores`。当前同名kernel仍采用该显式core-axis方案。
- **未核验**：归档编译器的准确revision；cpp_case/compile_log.txt为0字节，不能用它证明所有IR来自某准确compiler SHA。原目录README和report关联这些材料，这属于归档声明+源码/IR数学一致性，不能写成当前版重新编译结果。

### 原始语义与IR

旧kernel把输出描述为全局二维[M,N]，advance包含核偏移，却只对全局shape做boundary_check。循环次数按N_per_core计算，不会自动把“这个core拥有多少列”加入store语义。

原文：`docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/source/kernel.py:65–81`

```python
        shape=(M, N),          # 完整 N → stride = N
        strides=(N, 1),
        offsets=(0, 0),
        block_shape=(BLOCK_M, BLOCK_N),
        order=(1, 0),
    )

    # Per-core 列偏移
    core_n_offset = N_per_core * core_id

    # M × N × K triple loop
    for m_block in range(total_m_blocks):
        m_start = m_block * BLOCK_M

        for n_block in range(total_n_blocks):
            n_start = n_block * BLOCK_N

```

对应归档ZeusHigh的关键原文；其中 `%arg5=N`，`%arg6=core_id`，`%1=N/2`，`%12=%1*core_id`，`%19=n_start`，`%11=index(N)`：

原文：`docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/ir/kernel.zeushigh.mlir:79–89`

```mlir
        %27 = arith.addi %12, %19 : i32
        %28 = arith.index_cast %27 : i32 to index
        %29 = zeus_high.create_fmap_desc %arg2 {offset = 0, tensor_shape = [1, 1, %10, %11], tile_shape = [1, 1, 128, 128], boundary_dims = [2, 3]} : memref<*xbf16> -> !zeus_high.fmap_desc
        %30 = arith.subi %11, %28 : index
        %31 = arith.maxsi %30, %c1 : index
        %32 = arith.minsi %31, %c128 : index
        %33 = zeus_high.update_tile %29 [1, 1, %17, %32] : !zeus_high.fmap_desc -> !zeus_high.fmap_desc
        %34 = zeus_high.set_pos %33 [0, 0, %14, %28] : !zeus_high.fmap_desc -> !zeus_high.fmap_desc
        %35 = zeus_high.update_tile %21 [1, 1, %17, %32] : !zeus_high.fmap_desc -> !zeus_high.fmap_desc
        %36 = zeus_high.set_pos %35 [0, 0, 0, 0] : !zeus_high.fmap_desc -> !zeus_high.fmap_desc
        zeus_high.store %alloc_0, %arg2 desc(%36, %34) : memref<1x1x128x128xbf16>, memref<*xbf16>
```

### 错误直觉 → 硬件后果

错误直觉：“for只跑ceil(N_per_core/BLOCK_N)次，因此最后一块store自然知道属于本核的65列；加了boundary_check就不会越界。”

真实合同只有global N。代入原IR，列宽为 `min(max(N-global_col,1),128)`：

| 核 | global_col | global-bound合法宽度 | 本核真正应有宽度 | 实际写列 |
| --- | ---: | ---: | ---: | --- |
| core0 | 0 | 128 | 65 | [0,128) |
| core1 | 65 | 65 | 65 | [65,130) |

重叠为[65,128)，恰好63列。对全局数组合法，不等于对本核输出所有权合法。这不是“应该再加跨核mail”的问题：正确程序应该让两核各写自己的切片。

历史cpp_case/output_summary记录这63列错误；python_case/output_summary则写**数值等于golden，但进程rc=1（dirty mailbox leftovers）**。Python串行跑core0后core1，使后写core1恰好覆盖core0的多余输出，不能写“Python后端PASS”。本轮未重跑，也不把这些C++模拟器现象叫VCS/RTL证据。

### 当前修复：把所有权轴放回访问接口

原文：`python/zeus_examples/GEMM/gemm_normal_blocked_bf16xbf16_bf16dst_bf16acc_128x128x128_2core.py:62–70`

```python
    # CONTRACT: The host partitions N evenly across CORE_NUM weight buffers.
    c_ptr_template = tl.make_block_ptr(
        base=c_ptr,
        shape=(M, CORE_NUM, N_per_core),
        strides=(N, N_per_core, 1),
        offsets=(0, core_id, 0),
        block_shape=(BLOCK_M, 1, BLOCK_N),
        order=(2, 1, 0),
    )
```

原文：`python/zeus_examples/GEMM/gemm_normal_blocked_bf16xbf16_bf16dst_bf16acc_128x128x128_2core.py:108–115`

```python
            # Keep the core axis explicit so the final N tile is bounded by
            # N_per_core while the physical row stride remains the global N.
            c_tile_ptr = tl.advance(c_ptr_template, (m_start, 0, n_start))
            tl.store(
                c_tile_ptr,
                tl.expand_dims(acc, 1),
                boundary_check=(0, 2),
            )
```

现在logical shape是[M,2,65]，物理stride仍是[N,65,1]=[130,65,1]。core轴固定为core_id，最后一维的合法域是65，因此tail按`min(BLOCK_N,N_per_core-n_start)`裁剪，同时每行仍跨130个BF16元素。`expand_dims(acc,1)`使结果形状匹配显式core轴。

这正好可以把主文的“shape、stride、ExpandDim、descriptor、boundary”串在一个真实GEMM上：**逻辑域负责访问权限，stride负责物理寻址，二者不能用同一数字替代。**

### 方案取舍与支持边界

- 选显式分片view/core轴：所有权跟随访问进入IR，复用通用边界路径；代价是多维视图/axis传播需要正确，descriptor不能只保留物理pitch而丢逻辑范围。
- 可选显式mask：逐元素表达所有权清楚，但需要当前target能忠实实现对应mask或块化访问；不能无条件假设一个任意mask都能转为矩形tile。
- 不选“从loop次数猜store所有权”：循环边界不普遍等于存储权限，遇到不同映射/额外consumer容易误推。
- 不选“固定core1最后写”：它掩盖重叠，并把不必要的串行执行变成隐含依赖。
- 当前kernel注明host均匀分N，使用整数`N//CORE_NUM`；这不是对任意不整除N的完整通用分片方案。本例130可被2整除。
- 修复在**kernel/生成器接口**显式化合同，不能把原语义按global boundary正确下降一概判为编译器单点bug。架构问题是目标编译链需要哪类信息，缺失时应显式表达或拒绝，而不是凭意图猜。

建议图：同一行130列，上画两核ownership [0,65)/[65,130)，下画旧store [0,128)/[65,130)，红色突出63列重叠；另一幅将[M,N]拆为[M,core,localN]，用一条stride=130的箭头保持物理行距。

## 案例二：两个没有RAW的GEMM，为什么“省1KiB”会制造PE→PE等待？

### 原始IR：释放A，再把独立结果Z放进空洞

当前回归 `@independent` 中两个计算分别是a×w→y、b×w→z，第二个不读取第一个的结果。activation/result都是[1,1,4,128] BF16，即1024B。以下截取原文；此前b、a已load，y在片上已分配：

原文：`test/ZeusV3Midend/Unit/Transforms/address_allocation_pe_inflight_reuse.mlir:27–37`

```mlir
  zeus_high.pe %a, %w, %y desc(%ad, %wd, %yd) {op_type = "matmul"} : memref<1x1x4x128xbf16>, memref<128x128x1x1xbf16>, memref<1x1x4x128xbf16>
  memref.dealloc %a : memref<1x1x4x128xbf16>
  %z = memref.alloc() {alignment = 16 : i64} : memref<1x1x4x128xbf16>
  %zd = zeus_high.create_fmap_desc %z {offset = 0, tensor_shape = [1, 1, 4, 128], tile_shape = [1, 1, 4, 128]} : memref<1x1x4x128xbf16> -> !zeus_high.fmap_desc
  zeus_high.pe %b, %w, %z desc(%bd, %wd, %zd) {op_type = "matmul"} : memref<1x1x4x128xbf16>, memref<128x128x1x1xbf16>, memref<1x1x4x128xbf16>
  memref.dealloc %b : memref<1x1x4x128xbf16>
  memref.dealloc %y : memref<1x1x4x128xbf16>
  memref.dealloc %z : memref<1x1x4x128xbf16>
  memref.dealloc %w : memref<128x128x1x1xbf16>
  return
}
```

### 错误直觉 → 硬件后果

错误直觉：“memref.dealloc a之后就没人使用A，z正好可以复用；两个PE又在同一个FIFO，不需要额外处理。”

`dealloc`标志编译期逻辑寿命，不是“PE异步读取已完成”。若z覆盖A原来的SRAM区间，PE₂的输出写会覆盖PE₁尚在读取的输入，增加WAR。两个PE命令可以有在途流水；同PE的WAW写入顺序证明不能直接证明reader lifetime。

当前midend测试的FileCheck预期给出两个放置：BASE的z addr=1024；启用`avoid-pe-inflight-reuse=true`后z addr=3072。四个块的独立地址不是本轮编译所得，仅为源码回归既定预期。

为把该后果落到同步IR，可旁证一个**独立的后端最小回归**（不是上述midend例子实际下降出的下一阶段）：

原文：`test/ZeusV3Backend/Unit/Transforms/inject_sync_same_unit_linear_war.mlir:91–113`

```mlir

    // REPORT: linear-war-resource-admission
    // REPORT: WAR block=^0 op#{{[0-9]+}}(PE)->op#{{[0-9]+}}(PE) resource=l2_region#8192+128 status=ADMIT reason=ordered-admitted
    // REPORT: linear-token-plan
    // REPORT: WAR channel=PE->PE send=^0:op#{{[0-9]+}} recv=^0:op#{{[0-9]+}} coalesce=ordered-war-fifo-channel
    return
  }

  // CHECK-LABEL: func.func @vp_same_unit_linear_war_interleaved_uses_segments
  // REPORT-LABEL: func @vp_same_unit_linear_war_interleaved_uses_segments
  func.func @vp_same_unit_linear_war_interleaved_uses_segments(
      %src: !zeus_low.breg<act, l2>,
      %read0: !zeus_low.breg<act, l2>,
      %read1: !zeus_low.breg<act, l2>,
      %write0: !zeus_low.breg<act, l2>,
      %write1: !zeus_low.breg<act, l2>,
      %out0: !zeus_low.breg<act, l2>,
      %out1: !zeus_low.breg<act, l2>) {
    %tok = zeus_low.vp_config : !zeus_low.token
    zeus_low.breg_set_addr %read0, addr 3072 {zeus.l2_region_base = 3072 : i64, zeus.l2_region_size_bytes = 128 : i64} : !zeus_low.breg<act, l2>
    zeus_low.breg_set_addr %write0, addr 3136 {zeus.l2_region_base = 3136 : i64, zeus.l2_region_size_bytes = 128 : i64} : !zeus_low.breg<act, l2>
    zeus_low.breg_set_addr %read1, addr 4096 {zeus.l2_region_base = 4096 : i64, zeus.l2_region_size_bytes = 128 : i64} : !zeus_low.breg<act, l2>
    zeus_low.breg_set_addr %write1, addr 4160 {zeus.l2_region_base = 4160 : i64, zeus.l2_region_size_bytes = 128 : i64} : !zeus_low.breg<act, l2>
```

这里read=[8192,8320)、write=[8256,8384)，重叠64B；FileCheck预期前PE带send_mails=[PE]，后PE带recv_mails=[PE]。这说明同unit依赖仍可能需要self-channel等待。

### 当前选择：地址分配优化的是空间与同步的共同成本

`AddressAllocation.cpp::findPaidReusePair`（约2246–2283行）用尾访问者和首访问者的物理队列、现有RAW路径等识别有代价的复用；独立PE复用只有`avoidPEInflightReuse`开启时作为额外放置偏好。默认该选项false（Passes.td相关选项约772行），不是默认无条件保留四份buffer。

- `@independent`：有空间时为z保留独立1KiB，避免这条新WAR。不能因此声称PE₁/PE₂完全重叠，更不能从地址断言加速比例。
- `@raw_reuse`：第二个GEMM读取第一个的输出，本来就有RAW完成等待；两种模式都把z放在0，额外占空间未必改善等待前沿。
- `@capacity_fallback`：[1,1,576,128] BF16的三个大buffer能放下，第四块独立空间放不下；即使avoid开，预期仍复用addr=147456。性能偏好不能让可行分配失败。
- 后端始终依最终物理布局重建依赖；中端判断“免费复用”只是成本预测，不是免同步证明。

### 放进主文的位置与问题

放在真实GEMM的`zeus_high.pe`、`dealloc`和最终地址出现之后，一次只问：“下一条独立PE输出能不能用这块空洞？”让读者先选方案，再展示新增WAR与空间代价。可以画三条轨道：逻辑IR寿命、硬件读生命周期、物理地址占用，说明为什么第一条结束不代表第二条结束。

本案例来自2026-10-20提交`5dd4ddbe47d91ca5a081fd466df2a9d0e389dbe4`（independent PE reuse placement）及当前HEAD；本轮不引用MR或任何历史性能数字。

## 案例三：复制了BR，为什么配置已独立，而GEMM的数据依赖仍在？

### 原始IR：复制描述符，LD写原buffer，PE从copy读取

原文：`test/ZeusV3Backend/Unit/Transforms/inject_sync_breg_copy_data_alias.mlir:13–28`

```mlir
  func.func @same_block_copy_snapshot_raw(
      %base: !zeus_low.areg,
      %gdg: !zeus_low.breg<act, gdg>,
      %source: !zeus_low.breg<act, l2>,
      %out: !zeus_low.breg<act, l2>,
      %weight: !zeus_low.breg<weight, wdram>) {
    %copy = zeus_low.breg_copy %source : !zeus_low.breg<act, l2>
    zeus_low.dma_load %source, [%base, %gdg]
        : !zeus_low.areg, !zeus_low.breg<act, gdg>,
          !zeus_low.breg<act, l2>
    zeus_low.pe_compute %out, %copy, %weight
        : !zeus_low.breg<act, l2>, !zeus_low.breg<act, l2>,
          !zeus_low.breg<weight, wdram>
    return
  }

```

### 错误直觉一：不同BR SSA就是不同数据

`breg_copy`复制的是描述符状态，不是对应SRAM张量内容。`%copy`和`%source`可以是两个配置槽，却指向同一数据footprint。LD写source以后，PE经copy读取仍需LD→PE RAW完成关系。

当前回归将具体MAIL编排断言显式钉在legacy planner（文件前两条RUN），同时另有默认planner的strict+mailbox gate RUN。不能把legacy的`token#0`/phase3摆放当作当前staircase必定逐字相同的输出；共同语义是**数据别名不能丢**。

`Resources.cpp:25–41`给出关键区分：

原文：`lib/Dialect/ZeusLow/Transforms/InjectSync/Resources.cpp:25–41`

```cpp
void collectAliasClosure(Value root, llvm::SmallPtrSetImpl<Value> &aliases,
                         bool includeBRegCopyDataAliases) {
  if (!root)
    return;
  SmallVector<Value> worklist{root};
  while (!worklist.empty()) {
    Value current = worklist.pop_back_val();
    if (!aliases.insert(current).second)
      continue;

    // BRegCopy snapshots descriptor state but preserves the copied data
    // footprint. Follow the defining input only for data-resource aliasing;
    // descriptor-state aliasing intentionally stops at this boundary.
    if (includeBRegCopyDataAliases)
      if (auto copy = current.getDefiningOp<BRegCopyOp>();
          copy && !isMultiExecutorSplitSubviewBuffer(current))
        worklist.push_back(copy.getInput());
```

`collectBufferAliasClosure`设置true，沿copy追数据身份；`collectBRegDescriptorAliasClosure`设置false，在copy处停止，表示后续配置改写不传播进旧快照。`isBufferAlias`与`isBRegDescriptorStateAlias`因此有意不是同一个函数。

### 错误直觉二：保护descriptor复用，也要等PE计算done

相反极端是给每次set_pos都加PE completion等待。实际硬件在predecode阶段snapshot BR，旧命令读取的是其command中的配置；后续CT改BR并不一定改变旧命令。对应真实回归：

原文：`test/ZeusV3Backend/Unit/Transforms/inject_sync_breg_descriptor_frontend_order.mlir:23–33`

```mlir
      %weight: !zeus_low.breg<weight, wdram>) {
    %c0 = arith.constant 0 : i32
    zeus_low.breg_set_addr %buffer, addr 4096 : !zeus_low.breg<act, l2>
    zeus_low.breg_set_am %buffer, dtype BF16 : !zeus_low.breg<act, l2>
    zeus_low.pe_compute %out, %buffer, %weight : !zeus_low.breg<act, l2>, !zeus_low.breg<act, l2>, !zeus_low.breg<weight, wdram>
    zeus_low.breg_set_pos %buffer, (%c0 : i32), dims ["N"] : !zeus_low.breg<act, l2>
    return
  }

  // PE command issue snapshots the shared source descriptor before the next
  // PE command updates access/mode fields. This WAR is front-end ordering, not
```

该例的CHECK要求：CT setter→PE的BRegConfig RAW，以及PE→后续setter的BRegConfig WAR，都进入descriptor-front-end-no-mail/snapshot-ordering合同；它不要求后续配置改写等待矩阵计算完成。若同时存在L2数据冲突，那条边仍需独立保护，不能用这个配置proof删除它。

另一个反例在同文件`@copy_source_and_result_are_distinct_slots`：source addr=4096，copy，source改成12288，PE经copy仍读原4096快照；后续source setter不能成为copy配置的最新定义。

### 当前设计与代价

选择资源分层：配置字段身份、snapshot关系、实际数据footprint和完成事件分别表示。这样既避免漏同步，也避免因每次改描述符而强制串行化。代价是资源模型、alias closure、proof类型和最终verifier都必须保持这条区分，不能用一个通用“同一个BR”布尔判断取代。

在GEMM主线里，最自然的接入点是K-loop推进：循环更新下一块position/weight descriptor时，前一条PE可能已经锁存旧配置但仍读取旧数据。读者应先回答“两种对象哪一个可以复用”，再读资源模型，而不是先背InstructionEffect类名。这里是同构机制解释，不能把该独立fixture伪装为归档GEMM逐阶段输出。

## 现有长文为什么仍像流水账：应怎样据这些案例重写

1. **缺少可持续追踪的对象。** 每节换一个玩具表达式或列若干pass，读者无法知道“刚才的A tile现在是谁、它的描述符现在存了什么”。应选一份来源可解释的真实GEMM，给A/W/partial/output稳定颜色和名字，每层保留同一片IR上下文；不能把不同fixture拼成伪造的连续编译。
2. **缺少真正会分叉的决定。** 每节写“这里需要保留shape”和“合法化很重要”没有展示选择。应在每次IR变化前提出具体两选一：global N还是per-core N；复用旧A还是留独立空间；BRcopy按配置alias还是数据alias。再用一个失败输入裁掉错误方案。
3. **缺少IR里的证据闭环。** 一张抽象框图后面跟类名，只证明系统有这些模块。需要让读者亲手算出65/128、1024/3072、4096/12288的含义，并指出哪个operand/attr维持不变量。
4. **不该让“权威语气”替代验证级别。** 原归档是旧IR与模拟器诊断，当前修复是source+Git，不存在当前重新导出的High/Low产物就应留白。要明确区分“原文”“局部教学重命名”“当前源码机制”“未重新跑”。
5. **结论应回答硬件为什么逼出这项设计。** 块指令需要明确访问域、多core需要明确ownership、异步PE让逻辑dealloc不等于完成、前端snapshot让配置与数据生命周期分离。这些因果比“Phase B之后Phase C”更能展示整体lowering责任。

## 文件身份、状态与hash

当前源码/回归均按HEAD核验且相关文件无dirty；历史bundle未跟踪，revision unknown，只用hash绑定，不把其compiler产物归给HEAD。未读取或复制原始模型tensor数据到报告。

| 文件 | 身份 | SHA256 |
| --- | --- | --- |
| `python/zeus_examples/GEMM/gemm_normal_blocked_bf16xbf16_bf16dst_bf16acc_128x128x128_2core.py` | 当前HEAD，无相关dirty | `941e4e966663f55642e26d2e7b72c382dbc6027423b6ea31963125643c462078` |
| `test/ZeusV3Midend/Unit/Transforms/address_allocation_pe_inflight_reuse.mlir` | 当前HEAD，无相关dirty | `c14d89f609d5ee2d0396de034c8bea48e6dbb311e68768976851888adb9e0d70` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_same_unit_linear_war.mlir` | 当前HEAD，无相关dirty | `76b9bd759738280bea66ffc6c52d6c90f5f9d1a9a60922d1c352bb8a323b834e` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_breg_copy_data_alias.mlir` | 当前HEAD，无相关dirty | `1ba1d90169c1590641534faf33b8eaba463edf5fbacf0adaae444736735c33cb` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_breg_descriptor_frontend_order.mlir` | 当前HEAD，无相关dirty | `92f8d15ae7d5312437a7e42ec93cac340b460af7ad8cb9ea8d5e101985385d36` |
| `lib/Dialect/ZeusHigh/Transforms/AddressAllocation.cpp` | 当前HEAD，无相关dirty | `4c6485f82b7420062ba389f056c3389a46eb66d625aa7ab3176a104e109cf05f` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Resources.cpp` | 当前HEAD，无相关dirty | `89c158d972eb5e5bf471c61ea967ea3c2bd559d4134da78411b9d4c6c31bda1d` |
| `docs/vcs_debug/rtl-instruction-dependency-model.md` | 当前HEAD，无相关dirty | `1658b2cc611ec12fc93131ce0cc269fb7312e404bed48855a046189a3e2e7517` |
| `docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/source/kernel.py` | 历史未跟踪材料 | `ae2db3353afc78b6a83870c08c3517abe085da17c4b41105f86e376d8c7806ba` |
| `docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/ir/kernel.ttir.mlir` | 历史未跟踪材料 | `370ab48100c4d57a1fab18510524dd4f4cdc6c3767ffc0b19e0a69db61958ade` |
| `docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/ir/kernel.zeushigh.mlir` | 历史未跟踪材料 | `26c5576d98acd037033c23fc5e1f260f05c23245009b77cb49754fee91ac1254` |
| `docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/ir/kernel.S` | 历史未跟踪材料 | `9266c81a6d55e2b781a037731e7f6ca29ca450c065eaeef1dbf381bbd2b20f8b` |
| `docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/report.md` | 历史未跟踪材料 | `0408b546622cc4ce108c741efab6277edaabc0ef0d65c0795d089f3d13304160` |
| `docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/cpp_case/output_summary.txt` | 历史未跟踪材料 | `5eab6a24ab6734f614543a98e5dcf5ed3d2434e7cc5626bd9e28188463e1cc88` |
| `docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/python_case/output_summary.txt` | 历史未跟踪材料 | `22160c6951894056c775c321be82096453595ad645d199fa92bb21b3de000a56` |
| `docs/2026-07-02-gemm-2core-tail-diagnostic-artifacts/cpp_case/compile_log.txt` | 历史未跟踪材料 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |


## 补充：主任务本轮真实单核 GEMM 的地址与同步证据

### 采集身份与边界

- 主任务于2026-10-26调用既有工具完成一次 Python → TTIR → ZeusHigh → Assembly 编译，本分任务只读产物。
- 目录 `capture/`。
- `kernel.py` 函数 `gemm_mkn_loop_f32acc_kernel`；签名 a/w/c BF16，M/K/N运行时；常量 CORE_NUM=1，BLOCK_M=BLOCK_K=BLOCK_N=128。
- `compile.stdout` 记录三步完成；`hashes-before.txt` 与 `hashes-after.txt` 完全相同。编译工具按二进制hash固定；工具构建自何SHA未单独从此记录证明，所以不能把当前工作区HEAD直接当二进制build SHA。
- 本次没有运行该kernel，不能标成数值正确、CycleSim/VCS通过或性能结果。M=130/K=260/N=130是正文代入动态IR的教学参数，不是执行shape。

#### 文件指纹

| 文件（采集目录相对路径） | SHA256 |
| --- | --- |
| `kernel.py` | `6cb349d6d67abbe7fa23c02987c579bea6226099e633bcabf94dff9697c6db9b` |
| `compile.stdout` | `e7f091ad55425be2c375664a62ac71d59b396de66db242837a57e9125d8e440d` |
| `ir/kernel.ttir.mlir` | `d64a2cf660f50340c41848eb69a93a729655e46efbd1f73550df7ec4d93d61af` |
| `ir/kernel.zeushigh.mlir` | `4f31aca78fd9ea0b5bb5b177d772c3a60f8532cfd160ff8bc351e340af697012` |
| `ir/kernel.midend_passes.log` | `7b3224d5720b20bcd6be63761ff6eb5395317ea481a5db379a8a01592cabef7c` |
| `ir/kernel.backend.log` | `e1957c09332b6e75c9f2878098cb2b5009f5210e5d966da801026d047bc3610d` |
| `ir/kernel.S` | `d083dd637b7e766ca117e324ec851f91d99d754f3a011cf20134152944f80b9e` |

编译工具/driver hash：

```
9d99759e9f835c4b114f12443e9c4bd00b1756d04dd11c19c7f85f3eda2ebb9f  build/bin/triton-shared-opt
a54b9b1cd15025563015ccab906c76b52f921e033756456464550d38f54bc546  build/bin/zeusv3-backend
c5df3d83c7b114052c5f0c4680f0ee9770e800999af899b3fc7c29a177f1ae3a  build/bin/zeus-compiler
7bae9277f26a2586b945ff3d7d9c12cec6340762ab591ebf63bca6058264252e  zeus_compile.py
6cb349d6d67abbe7fa23c02987c579bea6226099e633bcabf94dff9697c6db9b  capture/kernel.py
```

### 实际分配表：高水位192KiB，不等于同时活跃量或硬件容量

`ir/kernel.zeushigh.mlir:38–93`：

| 角色 | memref | BR映射（Pre/PostInjectSync） | 物理区间 | 字节数 |
| --- | --- | --- | --- | ---: |
| FP32跨K累加器 | `%alloc` | `%54` | [0,65536) | 65536 |
| BF16 A tile | `%alloc_1` | `%66` | [65536,98304) | 32768 |
| FP32本次dot部分结果 | `%alloc_2` | `%77` | [98304,163840) | 65536 |
| BF16输出 | `%alloc_0` | `%85` | [163840,196608) | 32768 |

权重走 `<weight,wdram>`，不计作第五个SRAM tile。运行时参数区和栈不在该表内。A/partial在K循环内部alloc/dealloc，输出在K循环之后；单凭相加的192KiB不能称其“同时逻辑活跃峰值”。本轮未做最优放置证明。

特别注意当前PE目标语义：PE在OL1内部完成该dot累加并写FP32 partial，VP显式把partial加进64KiB accumulator；`carry_mode="round"`不是“读取L2 dst再累加”的含义。当前 `EffectBuilder.cpp` 将PE目的地视为写，不把dst加入read set。

### 同一对 Pre/Post InjectSync：新增同步，而非拼接不同kernel

`ir/kernel.backend.log`：Before marker14472，After marker14838，下一pass marker15215。

- Before范围没有`zeus_low.mail`，也没有send/recv属性。
- After范围有11条独立`zeus_low.mail`；12条操作出现send属性、11条操作出现recv属性（操作计数，不是mail条数或性能开销）。
- 相同SSA名字在此两阶段可对应，CodeGen内BR recipe展开后名字会变化，不能跨阶段只按编号认对象。

After中的原始操作与来源行：

`kernel.backend.log:15068`

```mlir
zeus_low.dma_load %66, [%13, %74] {recv_mails = ["PE"], send_mails = ["PE"], zeus.dma_base_alias_class = 0 : i64} : !zeus_low.areg, <act, gdg>, <act, l2>
```

`kernel.backend.log:15089`

```mlir
zeus_low.pe_compute %77, %66, %61 {carry_mode = "round", dst_dtype = "FP32", mtc = 2 : i32, mtk = 1 : i32, mtw = 4 : i32, recv_mails = ["LD", "VP"], send_mails = ["VP", "LD"], src_a_dtype = "BF16", wbs = 128 : i32, weight_dtype = "BF16", weight_mode = "normal", ymode = "KC", zeus.weight_dram_array = 0 : i64, zeus.weight_dram_slab = 0 : i64, zeus.weight_dram_slot = -1 : i64} : <act, l2>, <act, l2>, <weight, wdram>
```

`kernel.backend.log:15092`

```mlir
zeus_low.vp_compute %80, %54, %54, %77, exec_unit unit0 {operandSegmentSizes = array<i32: 1, 1, 1, 1>, recv_mails = ["PE", "VP"], send_mails = ["PE"]} : !zeus_low.token, !zeus_low.breg<act, l2>
```

`kernel.backend.log:15111`

```mlir
zeus_low.vp_compute %86, %85, %54, exec_unit unit0 {operandSegmentSizes = array<i32: 1, 1, 1, 0>, recv_mails = ["VP", "ST"], send_mails = ["VP", "ST"]} : !zeus_low.token, !zeus_low.breg<act, l2>
```

`kernel.backend.log:15201`

```mlir
zeus_low.dma_store[%17, %94], %85 {recv_mails = ["VP"], send_mails = ["VP"], zeus.dma_base_alias_class = 2 : i64} : !zeus_low.areg, <act, l2>, <act, gdg>
```


由这些精确MAIL属性及物理数据角色，可以解释三组跨单元通道：

| 区域 | RAW（当前tile） | WAR（同槽位下一次复用） |
| --- | --- | --- |
| A[65536,98304) | LD→PE | PE→LD |
| partial[98304,163840) | PE→VP | VP→PE |
| output[163840,196608) | VP→ST | ST→VP |

这是同次数据角色+操作顺序的因果分析。本次日志没有逐边dependency report，不应声称每个MAIL是某条唯一依赖的最小实现。VP→VP自通道与初始参数LD→CT也实际存在，但不要把它们挤进仅讲三个跨单元buffer的简图后又号称完整通道图。

### 首尾通知：可以手算一条循环通道

同次After在K循环入口：

```mlir
zeus_low.mail PE {send_mails = ["LD"]}
zeus_low.mail VP {send_mails = ["PE"]}
```

退出K循环：

```mlir
zeus_low.mail LD {recv_mails = ["PE"]}
zeus_low.mail PE {recv_mails = ["VP"]}
```

对PE→LD而言：每次LD接收可覆写A的许可，每次PE完成后归还许可。初次没有上一次PE，所以必须先seed；最后一次PE仍归还，而循环已不再执行LD，所以退出drain。VP→PE同理。对于教学K260/BLOCK_K128，T=3：1seed+3completion send 对3body receive+1drain。整数收发相等只是解释这两条具体通道，不构成一般FIFO身份、容量、嵌套分支和零trip证明。

### 一个容易漏掉的实际别名

同次After： `%54` 是FP32 accumulator描述符，`%55`则是nan-safe fill生成的INT8视图；两者都指向addr0、region_size65536。fill用`%55`，add/trunc用`%54`。因此BR SSA值与dtype不同不能用作数据无别名证明。

反过来，同次PE之后可看到`breg_set_tile %77`再送VP；该配置修改必须按前端descriptor snapshot合同理解，而不是把所有后续BR setter一律推迟到PE完成。独立BRcopy fixture给出更小反例（正文案例三）。配置快照与数据完成不能共用一个未经区分的“BR依赖”。

### 可集成章节

`drafts/gemm-cases-sections.json` 为数组，共四节：

- `lowering-placement`：实际四块地址、生命周期与异步完成。
- `lowering-placement-case`：独立1KiB PE复用回归。
- `lowering-decision-ledger`：历史双核N130访问域错误及3D view修复。
- `gemm-sync-bridge`：同次GEMM的三组正反向MAIL和两组seed/drain。

正文只使用离线可读的内嵌来源说明，不链接未打包的evidence Markdown。截图和SVG由主任务统一绘制。
