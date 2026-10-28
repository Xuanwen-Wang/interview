# MoE 四 kernel：ABI、计算与 core 分工复核

核对日期：2026-10-28（Asia/Shanghai）。用户要求按输入 shape、实际计算、输出 shape 详细讲解四个 kernel，并把第四个明确称为“rank 内 Reduce”。

## 来源与范围

本次通过远端分支查询取得 torch_zeus master `5259f1625b85f4e9bac138669ffc033249facc8a`，经 GitHub Contents API 按该完整 SHA 下载以下文件。五文件均与上次固定 `58e71d46629677b43e797deaae02d1a50eb72e57` 的副本逐字节相同。讲解使用当前优化路径，不把旧 generic reducer 的四维 Routed ABI 混入主线。

路径前缀：`sgl-kernel-zeus-triton/python/glm53_flash/moe/`。

| 文件 | SHA256 | 本次读取位置 |
| --- | --- | --- |
| `sgl_moe_router_linear_biased_topk.py` | `44a1773b5dc20bf2409ac0071eabcd78fd9a0b0acbe678fcf4f4e9770367bad0` | `603–635` M4 行分配；`1211–1376` 公开 API、返回顺序与 launch |
| `sgl_moe_shared_expert_silu_down_tp4.py` | `dc8e1cd71abb3da0200bf4ef39a9ef1985424efc7127fa0e51f7e4f1339ba819` | `511–651` pack、入口、静态流水；`651–783` 连续 parent、别名检查、launch |
| `sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py` | `18a90f68f50b199ebf4ba8c742620a7cc5f45df4755fa35166a3d32f86f66a64` | `1254` merged ABI；`1536` owner；`1706–1825` 输入守卫、字节视图与输出 |
| `sgl_moe_sum_reduce_core_partial.py` | `217e843c05693ed1da2531a62f0cfd5c1ca8b8546534c60dcdc871347a3937bd` | `334–441` valid rows、shape/alias 守卫、13项 launch 参数 |
| `sgl_moe_reduce_sparse_fast.py` | `70ae7ea696788927449a83348cc430006825584b3fad61bde89c719b6fa887b9` | `76–330` token 分工、Shared-first、slot 升序、完整 H 与输出 |

调用实参继续采用 zeus_dev `05ee10f9cc25d19fca0a144ae095c79b3a888976` 的 `model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py:1025–1150`：Router factor2.5、Shared 单独调用、Routed per-tensor、Reduce 本次 IDs 与专家范围、Reduce factor1。该文件 SHA256 `35c1258b304169fa349061929c91702470712d9f49c9087af06d37a287349b66`，核对时相关工作区文件无修改。外层通信仍是此前明确的归档 TP4×EP4 decode 接线，不声称当前 kernel 单独决定所有生产部署。

模型维度仍采用已固定的官方配置（见 `moe-communication-20261028.md`）：H4096、I2048、E288、Top8、Shared1。T24 与具体路由、partial 数值分别标为布局算例和教学构造。

## 技术审查

- Router：各 rank 都处理完整24行、288候选；core0 行0–3/8–11/16–19，core1 行4–7/12–15/20–23；返回 `(weights, ids)`。Shared 不占 Top8 槽位。
- Shared：每 rank I512 再分两个 I256；两个 core 都处理24行，分别写完整 H4096。`gate_up` 的2表示两种投影，输出 `[2,T,H]` 的2表示两个 core partial。pack 的逻辑矩阵与设备指针表分开。
- Routed：默认按 local expert 奇偶分 owner，每 core36专家，每专家完整 rank-local I512；输出三维 `[T,8,H]`。有效 slot 只有一个 writer；未命中本卡的 slot 未定义。merged 的 int8 view 是存储别名，不是 ID 数值转换。
- rank 内 Reduce：用同次 IDs 过滤后按 slot 升序做 FP32 乘积/累加，Shared-first，输出 BF16；消去 Shared core 和 route slot 轴，保留 T/H。实际执行 core 按输出行0–11/12–23分工，每个 core 都读取两 Shared plane。`BLOCK_H=2048` 不代表此快路径每 core 仅处理半行，内部 `LOCAL_H=4096`。
- 输入张量、scales、输出不重叠；Graph replay 不能复用上次路由有效性。未定义槽位可能被跨度 DMA 搬入，但不进入浮点运算。
- token7 的 core 分工刻意串起来：Router core1；Shared 双 core；Routed expert5/core1 与 expert20/core0；最后 Reduce core0。计算值 `0.5+0.5+0.3125×1+0.3125×2=1.9375` 沿用前面通信图的构造。
- 修正总图的输入说明：X 是前三个 kernel 的共同输入，rank 内 Reduce 读取 R、S、IDs、α，不再读取 X。

## 内容与验收

保留全部章节、section、阅读阶段 ID 和旧深链接，仅扩展既有连续 MoE HTML。正文、图与交互统一使用“rank 内 Reduce”。新增 Routed 输入到有效槽位、Reduce 输入轴到输出两张 SVG；其余受名称影响的四张图逐张复查。

可理解性审查：每个 kernel 均先定义输入轴与生产者，再展开投影/筛选/累加，最后说明输出尚缺的贡献。沿同一个 token7 追踪四次调用，区分模型专家数、TP通道、执行 core、token 行与 TopK 槽位。公开 API、设备入口参数与内部 tile 分层呈现，较细的参数表可展开阅读。

已执行的验证：

- `python3 scripts/build.py`、`python3 scripts/check.py`、`python3 scripts/check_public_artifact.py`、`node --check web/moe-explorer.js`、`node scripts/check_moe_model.js`、`git diff --check` 全部通过；24个允许的 Pages 文件，232张图。
- 独立算术复核连续 stride、1536/384/192 KiB 容量、Router24行覆盖与不重叠、token7 的 owner 与1.9375示例。现有独立模型继续覆盖非均匀 Top8、TP/EP求和、Shared一次、错序与重复求和反例；本轮未改变交互数学模型。
- Playwright 桌面1440×1000及手机390×844；新增/扩展的7个关键 section 无页面横向溢出。逐张查看六张受影响图；文字 bbox 全部在 viewBox 内，连线与阅读顺序明确。
- 搜索“逐轴拆开 ABI”唯一命中新的 rank 内 Reduce 入口；旧 `moe-combine-reduce/local-equation` 深链接仍到 `kern-reduce-abi`；折叠参数表可开关，图示放大可打开/关闭。
- 通信交互中的 rank 内 Reduce 正确显示 token7 的1.9375；标题与文案同步更新。
- 实际下载 `glm53-flash-moe.html` 与本地 `dist/moe.html` 逐字节相同，SHA256 为 `3502f6fd0abe7783cbb78577309fb7fee1da77f26977941300bd0b3693c4b07a`；通过 `file://` 打开下载文件，核验折叠表和交互。
- 打印生成56页 A4 PDF；查看第32、38、39、41页，确认新增两图完整、长表格按行续页、参数/计算代码完整显示。浏览器报告0错误、0警告。

此任务不修改业务仓库，不执行业务 kernel、Graph、多 rank、CycleSim、VCS、设备或整模型性能实验。源码阅读、算术与浏览器验证不等于运行业务 kernel。发布、CI与线上字节核验由交付消息分别记录。
