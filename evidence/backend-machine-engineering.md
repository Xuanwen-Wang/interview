# Machine IR 到对象文件：工程实验记录

采集日期：2026-10-26。对应 `llvm-backend` 的 `machine-ir` 至 `mc-output` 九节。源码仓库为共享 `llvm-project` 快照；只读核对，没有修改业务源码或重建工具链。

## 证据边界

- 源码 Git 元数据不可用，revision unknown。引用实现按下面的文件 SHA256 固定，不能由版本字符串推断 commit。
- 工具报告 `LLVM version 22.0.0git`，带 assertions。源码文件和已建二进制分别指纹化；没有可恢复的 Git revision 能证明完整构建来源。
- 实验目标固定 `x86_64-unknown-linux-gnu`、`-mcpu=x86-64`、`-O2`。运行层是本机 x86-64/Linux 上的原创 CPU 算例，不涉及模型、设备 kernel、CycleSim、VCS 或性能测量。
- 正文明确区分实际执行分支和源码分析：本例展示 call regmask、callee-saved、InlineSpiller、folded reload、PEI 与 ELF call relocation；未覆盖全部 eviction/区域拆分/recoloring、大帧 scavenging 或 PIC/TLS 等分支。

## 可重跑输入与入口

原创输入在 `practice/llvm/machine/`：

| 文件 | 用途 |
| --- | --- |
| `call-pressure.ll` | 12 个独立 volatile i64 load 跨未知外部调用，调用后交替 add/xor，所有算术按模 2^64 解释 |
| `phi-diamond.mir` | 两个前驱提供不同值，独立重放 PHIElimination 与 TwoAddressInstruction |
| `tied-add.mir` | 合法的 post-RA tied operand 用例；脚本只改变一个输入寄存器制造负例 |
| `opaque.S` | 返回 17*x+11，主动覆盖其余 caller-saved GPR，按 SysV 保存 callee-saved GPR |
| `pressure-driver.c` | 独立 uint64 参考计算；全零、全 1、分散单 bit、4096 组固定种子伪随机输入 |
| `verify.py` | 指定 LLVM_BIN 和外置输出目录，重跑 MIR/对象/负例/链接与执行，写 summary.json |

```sh
LLVM_BIN=/path/to/llvm/build/bin \
  python3 practice/llvm/machine/verify.py --out /path/to/external-output
```

脚本把 TMPDIR/TMP/TEMP 指向外置输出目录，关闭 core dump。全部生成的 MIR、stderr、反汇编、对象和可执行文件保留在指定目录，不写入仓库。非 x86-64 主机可显式传 `--skip-runtime`，此时只能声称编译验证。需要 C 编译器，可通过 `CC` 指定；没有编译 LLVM 本身。

核心命令为：

```sh
"$LLVM_BIN/llc" -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 \
  -verify-machineinstrs -stop-after=finalize-isel call-pressure.ll -o selected.mir
# 同一输入再分别 stop-after=virtregrewriter 和 stop-after=prologepilog。
"$LLVM_BIN/llc" -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 \
  -verify-machineinstrs -filetype=obj call-pressure.ll -o call-pressure.o
"$LLVM_BIN/llvm-objdump" -dr call-pressure.o
"$LLVM_BIN/llvm-readobj" --relocations call-pressure.o
"$LLVM_BIN/llc" -mtriple=x86_64-unknown-linux-gnu -verify-machineinstrs \
  -run-pass=phi-node-elimination phi-diamond.mir -o phi-eliminated.mir
"$LLVM_BIN/llc" -mtriple=x86_64-unknown-linux-gnu -verify-machineinstrs \
  -run-pass=twoaddressinstruction phi-eliminated.mir -o two-address.mir
```

另外以 `-debug-only=regalloc -stop-after=virtregrewriter` 保存本篇引用的 RA trace。debug 参数依赖带相应调试支持的 LLVM 构建，不是所有 release 发行包都可用。

## 本次结果

- 正向编译、三个 MIR 截面、单 pass、反汇编与重定位检查均通过。
- RA 后 6 个普通 spill slot，每个 8 字节、对齐 8；6 个跨调用值使用 RBX/RBP/R12–15，另外 6 个使用栈槽。
- 后 6 个 add/xor 全部采用 ADD64rm/XOR64rm 折叠 reload；没有独立 reload MOV 不表示没有栈读取。
- PEI 后 `stackSize=104`、CSR 48 字节，6 次 push 后再减 RSP 56；数据槽为调整后 RSP+8 到 RSP+48，间隔 8。
- call 编码在 .text+0x60，relocation 字段在 +0x61，`R_X86_64_PLT32 opaque -4`；另有 .eh_frame 的 R_X86_64_PC32 引用，不混作 call 重定位。
- 合法 tied MIR 通过；变异版将 `$rax = ADD64rr $rax, $rsi` 的首源改成 `$rdi`，MachineVerifier 拒绝，诊断 `Tied physical registers must match.`。负例预期非零退出，由脚本断言失败原因；并不把崩溃当作成功编译。
- 链接独立 `opaque.S` 与 C 驱动，输出 `call-pressure: 4099 vectors passed`。uint64 oracle 不使用有符号溢出，callee 主动破坏 caller-saved GPR。

RA trace 的关键摘录（位置是 SlotIndex，不是周期或机器码地址；省略非关键操作数）：

```text
RegMasks: 256r
%12 [208r,672r:0) 0@208r
RS_Assign -> wait for second round -> RS_Split
Inline spilling GR64:%12
216r MOV64mr %stack.0, ..., killed %27
672r %16 = XOR64rm %16(tied-def 0), %stack.0, ...
%27 [208r,216r:0) -> $rax
```

%12 是 ISel 后第十二个输入；%16 是后续 two-address/coalescing 阶段的累加器，跨截面不按同号 vreg 猜对应关系。本例并未执行全局 region split 等所有机制，正文对那些分支仅引用源码。

## 三类审查结论

- 技术：以真实 MIR 逐项核对 call regmask、tied、MMO、VNInfo/SlotIndex、spill fold、CSR/栈对齐与 relocation；算法概念与当前实现入口相互对应。源码分析没有冒充运行覆盖。
- 教学：以两个具名输入（跨调用压力、PHI diamond）分别贯穿，首次定义新量；把输入、输出、失败样本、调试入口与后端适配职责相连。主线不是单纯算法名清单。
- 视觉：提供一张原创 spill 生命史 SVG，明确 SlotIndex 非周期、非比例以及寄存器短区间与栈上保存的区别。整页桌面/手机/打印的实际渲染由集成验收补充；本记录不声称已替代浏览器审查。

## 文件指纹

工具：

| 工具 | SHA256 |
| --- | --- |
| `llc` | `ee92efaff64c0a990a49be5683d616d582acd8065a738e2bcae6c85e755bd444` |
| `llvm-objdump` | `032c95bec8d72d850023e9f9e38bd10d727812f34e00fc5ea3cb3b3b06564237` |
| `llvm-readobj` | `ac15f7584e5942ede728bc375af091b8e6e8ca751c2c0a622c4eee2637e1a3b1` |

引用源码：

| 相对路径 | SHA256 |
| --- | --- |
| `llvm/include/llvm/CodeGen/MachineFunction.h` | `2a3822f4b0f347886a10fd15b20507b54c969b2731b31184ac94afe7467bccb9` |
| `llvm/include/llvm/CodeGen/MachineInstr.h` | `db69251f6984de1c34da377cedd3fa61dcf0203f1de1c800a1f324eccc9dfb0a` |
| `llvm/include/llvm/CodeGen/MachineOperand.h` | `6eba505bd20f75e720b0735c53d79ff3510b34a31c578c14371115b2ed6baca1` |
| `llvm/include/llvm/CodeGen/MachineMemOperand.h` | `69d449ca3dfc54825ee144531bbc476f77bc6693b5e33921b7bbfc83aa6492a8` |
| `llvm/include/llvm/CodeGen/SlotIndexes.h` | `9722882a427eab871368b9e1be2c1e528f91b637bb1a3d5ec791b0296df67df4` |
| `llvm/include/llvm/CodeGen/LiveInterval.h` | `090539edeca814701ef6440edf74e24c4b967b2aadc7740ee98878c7ba4a9a9c` |
| `llvm/include/llvm/CodeGen/LiveRegMatrix.h` | `d8499881097b7240b2a783f831c6f2dd55dd0f8faa95abdc2ca1d96ea78a48aa` |
| `llvm/lib/CodeGen/PHIElimination.cpp` | `76736d12c6ce2467b092b4865d9848e7a5705fd8ea4ccee819e1c390c748e656` |
| `llvm/lib/CodeGen/TwoAddressInstructionPass.cpp` | `568f6192c492aabb8e02fb82a3cd884943af74a8f06b4c6ab20deb44e841fb3c` |
| `llvm/lib/CodeGen/RegisterCoalescer.cpp` | `bb8e792a9ef8022aa1daacdf21a57fe44394b89520dca47874b39fbdf5bbad4c` |
| `llvm/lib/CodeGen/MachineVerifier.cpp` | `85a4e943ad2edd660d0b366a2932b8c749fef65e732011dba5593ba00b456d90` |
| `llvm/lib/CodeGen/ScheduleDAGInstrs.cpp` | `c7ce06ca9ca3c41443a7b3eb06504f1f7788d2cdf78875a4d7c4fe7ec1e41b7f` |
| `llvm/lib/CodeGen/MachineScheduler.cpp` | `48d93d340382576d651b28973bf4b598e46ddc90a3b5b31d3eebd30fc8b205fe` |
| `llvm/lib/CodeGen/LiveIntervals.cpp` | `25d2bf60a0ce4c89141fe7cb70022678d2f2584477bc309af67bc5ac626d0dc8` |
| `llvm/lib/CodeGen/LiveRegMatrix.cpp` | `909c341961ab38db80e584bb3fc847533d0008afb5ec81711a69c2fcc6efc1d8` |
| `llvm/lib/CodeGen/RegAllocGreedy.cpp` | `c1905eae0464f4f71f95122d34e2790e8209e5ee15c357548b363a4c3107dcf8` |
| `llvm/lib/CodeGen/SplitKit.cpp` | `a2f10c4adbbdffe5d22b54dd79edac37942225d6e68b69e0d268e876813d6dcc` |
| `llvm/lib/CodeGen/SpillPlacement.cpp` | `84d5dd052cdf86fecad529eb87885eab250a5f5dde506c06b1cf79429fdd6138` |
| `llvm/lib/CodeGen/InlineSpiller.cpp` | `b5f17b1ee10aab359ff436219630cf1d16ee6c03ee13060fba5bef68201e2033` |
| `llvm/lib/CodeGen/LiveRangeEdit.cpp` | `e3e90398b7cfb188d4d1c3c3a8113db63dacc6b44f488bd992b4bf692c95fa5c` |
| `llvm/lib/CodeGen/StackSlotColoring.cpp` | `5bdff05f64dbb8297bfd61af0c422d61542180d524f05c34bb8b55361430a4c3` |
| `llvm/lib/CodeGen/VirtRegMap.cpp` | `8bacf912bc897019b891563f453d2e8e8863840624be2b3e8dc33d605094c20e` |
| `llvm/lib/CodeGen/PrologEpilogInserter.cpp` | `9562edbf17eb3c357ca519b5f085775c5e4d47f947fe0d9151050a18d34e76c7` |
| `llvm/lib/CodeGen/RegisterScavenging.cpp` | `63abf0efeef89a467f1e8584b1e7dd0d5466c013cf63c22d86e811814e8b6f67` |
| `llvm/lib/CodeGen/TargetPassConfig.cpp` | `709205a50ca8737db38acdf4554af3e9fcccca9be2f103ca4dab12e96388c95f` |
| `llvm/lib/CodeGen/ExpandPostRAPseudos.cpp` | `dec9dbd088ae0e51bca76977922c66c22e4e1afb9a43d1f20f8a013567bc9c08` |
| `llvm/lib/CodeGen/MachineCopyPropagation.cpp` | `51ccdb4e433e253ec1a45de3892514a252724047f049e4afc46d2475711ca8a4` |
| `llvm/lib/Target/X86/X86InstrInfo.cpp` | `584b08aaebe83b5ab35dc0e1c0e1e25d2109c456c62ab9cc93a06650c5c8cfca` |
| `llvm/lib/Target/X86/X86RegisterInfo.cpp` | `0a191eba62511f2f818720ecc2251280a1dbb0a89d0fa5dc588ad97c4fde4c41` |
| `llvm/lib/Target/X86/X86FrameLowering.cpp` | `9c11d289dd571056a0c59b1c1f1d25664c601eef72c948ef0b530df448785760` |
| `llvm/lib/Target/X86/X86MCInstLower.cpp` | `915becafd55525c47bea5fef0a1763d547903821d19632f17c47e1283be71769` |
| `llvm/lib/Target/X86/MCTargetDesc/X86MCCodeEmitter.cpp` | `9322e2dd4bc197643a873983a77275ba89517f32d1d5ea0a63f0f3bbd6b6e47d` |
| `llvm/lib/Target/X86/MCTargetDesc/X86ELFObjectWriter.cpp` | `5f885bb0a4d34f6180f7a9d23f5ed2b095b302778071e0f9db010a5ee9a7b77d` |
| `llvm/lib/MC/MCAssembler.cpp` | `c2fd58a26542d2dfa80bf729800b49b8f30515215cde5781be484f2254c089e3` |
| `llvm/include/llvm/Target/TargetSchedule.td` | `c80a933047140cf9e6398f056c45fbce25eefe540b697a8e7421056e5f1ad1ad` |

原创输入（本记录生成时）：

| 文件 | SHA256 |
| --- | --- |
| `practice/llvm/machine/call-pressure.ll` | `dac307bfe98222d083feaf1c4b74afda8b1e6495ee03212e3d6debada78b900c` |
| `practice/llvm/machine/opaque.S` | `65d2d73e9a91adf31ab9dc7ed32279dff5a28b9873155745f522f5778ae86999` |
| `practice/llvm/machine/phi-diamond.mir` | `dec38e29d5172b6cb9d9802fb853e55e34a7ea5ec3fcbc51f2931cedcda99277` |
| `practice/llvm/machine/pressure-driver.c` | `1b764de3233640c37fa3aa1eec8eca7b5cc1d3e543e5137d01653c9403d5ea0f` |
| `practice/llvm/machine/tied-add.mir` | `102c9873905b5d1225efbc8deba08ba6fc4f819f6a149598dbf00c3b5ec1e608` |
| `practice/llvm/machine/verify.py` | `b46807e302428801d06e112310e33ba8bdb25edb235cb2cc0753dec3df6b3f43` |
