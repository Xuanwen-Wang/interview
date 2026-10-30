# GEMM launch 到 H200 SM：来源与验收

采集日期：2026-10-30。修改 `content/24-cuda-hopper.json`；新增一个连续阅读阶段、四个稳定小节与四张原创 SVG，保留原有章节、小节和学习记录键。

## 技术依据

| 来源 | 核对范围 | 正文中的边界 |
| --- | --- | --- |
| [CUDA C++ Programming Guide 12.8 — Thread Hierarchy](https://docs.nvidia.com/cuda/archive/12.8.0/cuda-c-programming-guide/index.html#thread-hierarchy) | grid/block 的维数，x 优先线性线程序号，线程块独立执行 | 索引描述程序工作，不指定 SM 坐标 |
| [CUDA 12.8 — SIMT Architecture](https://docs.nvidia.com/cuda/archive/12.8.0/cuda-c-programming-guide/index.html#simt-architecture) | block 按可用执行容量分发，多个 block 可驻留一个 SM，完成后补入新 block；连续 32 个线程组成 warp | 普通 launch 无全 GPU 的逐轮屏障；图中 CTA 顺序不是硬件 trace |
| [CUDA 12.8 — Compute Capability 9.0](https://docs.nvidia.com/cuda/archive/12.8.0/cuda-c-programming-guide/index.html#compute-capability-9-0) | 每 SM 四个 warp scheduler；warp 静态分配给 scheduler，发射时选就绪 warp | 区分 warp 归属和逐次发射；不承诺 `warp_id % 4` 物理映射 |
| [Nsight Compute Profiling Guide — Hardware Model](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html#hardware-model) | 四个 SMSP 的资源；普通驻留执行期间 warp 归属一个 SMSP；active/eligible/issued 区别 | 在线文档，未固定工具发行版；不将其 Turing 示例中的 warp 池数量套到 Hopper，也没有执行 profile |
| [Hopper Tuning Guide 12.8 — Occupancy](https://docs.nvidia.com/cuda/archive/12.8.0/hopper-tuning-guide/index.html#occupancy) | 64 warp / 2,048 thread 每 SM，寄存器及 Shared 等驻留约束 | 教学 block 的 8 CTA/SM 只是线程/warp 上限，不是实测驻留数 |
| [NVIDIA GTC 2024 — CUDA Programming and Optimization](https://developer-blogs.nvidia.com/wp-content/uploads/2024/08/CUDA-Programming-and-Optimization.pdf) | 第 4–5 页 H200 SXM 132 SM、Hopper SM 四分区与每分区 FP32 / Tensor Core 资源 | 沿用硬件逐层放大篇的产品范围；未启用 MIG；逻辑线程不与物理单元一一绑定 |
| [CUDA 12.8 — Warp Matrix Functions](https://docs.nvidia.com/cuda/archive/12.8.0/cuda-c-programming-guide/index.html#warp-matrix-functions) | WMMA 集体参与、fragment 分布未指定、FP16 输入/FP32 累加 16×16×16 合同 | 右列是另一种实现合同，不与左列全 FP32 示例声称数值等价；未反推机器指令数量 |
| [PTX ISA 8.7 — WGMMA](https://docs.nvidia.com/cuda/archive/12.8.0/parallel-thread-execution/index.html#asynchronous-warpgroup-level-matrix-multiply-accumulate-instructions) | 四个连续 warp / 128 threads 的 warpgroup 异步矩阵指令 | 不把四个 warp 与四个 SMSP 或 Tensor Core 建立程序可指定的绑定 |

## 原创教学合同与数学检查

- SIMT GEMM：行主序 A[1024,128] × B[128,1024] → C[1024,1024]；全 FP32，不转置，不加旧 C；grid=(64,64,1)，block=(16,16,1)。示例没有尾块，也没有调用 Tensor Core。
- 逐一枚举 4,096 × 256 个线程，验证 1,048,576 个输出恰好各有一个 writer，地址完整覆盖 C，无重叠或缺口。
- 按 z/y/x 嵌套枚举线程、每连续 32 个切成 warp，独立核对 256 个线程的坐标及两行/warp 关系。选中 CTA(5,3)、thread(7,2) 对应 tid=39、warp=1、lane=7、C[50,87]。
- CPU 精确整数模型：A(r,k)=(7r+3k) mod 11−5，B(k,c)=(13k+5c) mod 17−8。按八轮 Shared tile 模拟选中 CTA 的 256 个点积，与直接沿完整 K 求和的独立参考逐项一致；选中值为 −56。将 B 的 Shared 索引错误转置的反例被拒绝。这只验证算式与索引，不模拟 FP32 舍入或 barrier 时序。
- 算术核对：每 CTA 8 warp；As/Bs 合计 2,048 B；K 方向 8 轮；仅按 64 warp/SM 得到 8 CTA/SM 上界。launch 的动态 Shared 参数 0 不影响静态 Shared 的 2 KiB 分配。
- 四张图均为原创：CTA/输出 tile 与线程索引；SM 接纳与资源释放；四 SMSP 的假设就绪快照；标量 FMA 与 WMMA 对照。四分区编号配对、每 SM 两个示意 CTA 和时刻 t₀/t₁ 都是教学假设，不是实测顺序或时间。

## 验收范围

技术审稿沿以上官方文档核对。初学者审稿沿一个 C[50,87] 从 launch 追到寄存器、执行单元与 store；明确 shape、warp/lane、Shared 两次 barrier 和精度变化。

- `python3 scripts/build.py`、`python3 scripts/check.py`、`node scripts/check_cuda_model.js`（220 参数案例）与 `git diff --check` 通过。发布前另运行 `scripts/check_public_artifact.py`。
- Chromium 实际桌面检查 1440×1080、1280×1080：文档及 SVG 文字无越界；逐张查看四张新图，移开经过文字的连接线；四图均可打开、切换 150% 放大并关闭。
- 搜索“分区”可以定位新小节并跳转；旧 `cta-warp-thread` 深链接、笔记重载、已读状态保存通过。所有原小节 ID 与独立 HTML 文件名保留，阶段覆盖顺序检查通过。
- 原有 occupancy 交互把 Shared 改为 96 KiB 后显示 2 CTA/SM 上界；没有修改其模型或脚本。
- 实际点击下载完整 CUDA HTML；以本地 HTTP 拦截提供下载文件、关闭网络后，正文、图示放大与 occupancy 参数变化仍可使用，未使用 `file://` 作为验收入口。
- 使用完整文章的打印样式生成 43 页 A4 PDF；新增图分别位于第 13、15、17、19 页，图与图注完整，没有跨页切断。检查中未出现页面脚本错误。

GitHub Actions 部署及线上文件一致性属于发布后的独立检查，以提交对应的工作流结果和交付说明为准。

本次没有 CUDA 编译、设备数值运行、SASS 检查、Nsight profile、GPU 时序或性能测量；不报告实测寄存器数、实际驻留数量或真实物理调度映射。仅检查桌面，不进行移动端验收。
