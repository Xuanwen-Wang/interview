# MoE 作者对硬件与同步扩展的独立审查

日期：2026-10-24。只读审查 `content/37-hardware-sync-deep.json`、`evidence/hardware-sync-sources.md`，并抽查业务源码；没有修改对方正文或执行硬件测试。

## P2：应同时公开 C2 的已知认证缺口

定位：`sync-proof-implementation` 的 `pv-boundary`、`pv-provenance`；关联循环章节。

正文已准确解释 C3 尚未单独实现一般全局事件图无环检查，但同一冻结文档还明确把循环依赖的 C2 语义认证列为首要未闭合项。若只强调独立身份回放、覆盖与最终验证，读者可能误认为 C2 在所有接受路径都已独立认证。

固定 `triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a` 的 `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:1728–1739` 列出 own loop-carried、seed 空义务、吸收出口 carrier、下沉点四类剩余路径。`lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircaseCreditPolicy.cpp:308–341` 可见相应直接接受或跳过分支：equalization seed、registered absorption、sunk point、same-token loopCarried。

建议：明确这些是仍依赖构造断言/尚未独立认证的接受路径，不能声称所有跨 token 替代均核对完成界；补身份验证段的专门证据锚点。已通知作者与主任务。

## P3：周期 FIFO 配对式应写明范围

`sync-loop-branch-mailbox/lb-seed` 的通式只引用本轮或上一轮 send，应补 `0≤k≤n` 及当前距离0/1模型的前提。当前n=3、k=1示例正确；缺少范围容易被误读成任意k均成立。

## 已通过的核对

- 独立重算条件带宽：`256×32×15/23 = 5342.60869565 B/cycle`，16KiB稳态间隔`46/15`；400MHz条件下`2.13704347826 TB/s`，G32 scale修正`1.89959420290 TB/s`。正文区分十进制TB、KiB、吞吐间隔与单次延迟，并列出双hub、R23、同域频率、读写门控与背压条件。
- 直接读取 `gdg_flowctrl.v` 确认读15/写512共同halt门控；读取 `wl1_518_weight_ctrl.v:1377–1386` 确认单/双hub四轮/两轮分支。
- 对照 `PeHWSpec.h` 重新算四个minitile例，2200.04、2733.8、987.08、622.76均正确，且文中标为历史经验模型而非本轮VCS。
- 直接读取 `StaircasePlanning.cpp:592–682` 确认62规划预算、63容量、multi-source mask原因、闭区间占用和R1限制；正文明确静态占用不是实时硬件计数。
- C3未完整独立实现、SI退休不等于数据效果、同core PE WAW不能扩为RAW/WAR全免的边界表述恰当。
- 113处来源条目/正文链接均找到实际证据文件与锚点；证据索引区分tracked SHA、非git RTL指纹和未跟踪研究文档。

本次复核没有重数全部RTL实例或执行同步验证器；结论仅限上述静态证据与计算。

## 修订后的关闭记录

再次只读核验作者修订：`pv-boundary` 已明确列出四类 C2 接受豁免，说明冻结schedule的epoch信息缺口，并把C2与C3分别限定；`pv-provenance`区分policy目标与当前实际认证范围。新增`hs-identity-doc`指向冻结LaTeX1689–1747，锚点存在。

`lb-seed`已加入距离只涉及本轮/上一轮、`0≤k≤n`的模型前提，并指向seed空义务认证仍有缺口的说明。

P2与P3均关闭；本次范围内没有剩余P1/P2问题。

## 追加：算子数据流三章交叉审查

审查 `content/16-operator-dataflow.json` 的21节及6张SVG。独立复算GQA的80MiB投影权重、167,772,160投影FLOPs、134,217,728核心FLOPs及133.03125KiB双缓冲账本；DSA的528-byte row、1.03125/33MiB latent、68/388KiB wire；KDA的48+16MiB权重、67,108,864 FLOPs、512KiB rec、1MiB rec读写、36KiB conv。数值均正确，教学与真实实现范围区分清楚。

以冻结zeus_dev runner核对DSA三compute/三collective、CP查询与历史归属、512完整pool组及live tail、packed解码与O/LSE wire；核对KDA safe_gate、BF16状态、物理转置、递推、sigmoid输出门和TP归约。所读文件相对声明SHA无差异。公开论文入口身份已核对，但内部具体参数不由论文背书。

发现P2图示假依赖：`attention-dataflow/online-schedule`把下一块预取画成当前QK的前置；`kda-dataflow/conv`把旧conv state画成当前QKV的生产者。应改为当前块就绪与独立预取、以及旧tap/新QKV双输入汇合。已通知作者与主任务。

另建议明确DSA吸收后score仍乘`256**-0.5`，不是因latent维512而改成`512**-0.5`；直接证据是冻结runner约466行CPU参考。此项为P3补充，现有正文未写错系数。

修订后readback：FlashAttention当前K/V→当前QK递推单独成链，下一块预取为独立支路；KDA旧tap和新QKV双输入汇合后分别供计算与状态写回。两图假依赖P2关闭，SVG XML解析通过。DSA投影与局部attention两节均补`1/√256`合同，P3关闭。补充建议将“value升维256”改为“每head的256维value投影”，避免512→256的维数方向措辞含混；不影响既有公式与计算。审查范围内无剩余P1/P2。
