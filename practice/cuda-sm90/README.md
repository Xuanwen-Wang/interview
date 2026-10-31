# SM90 编译探针

这些原创 PTX 只用于观察原生指令、静态排程和依赖字段。记录于 2026-10-31：`ptxas 12.8.93`、`nvdisasm 12.8.90`、目标 `sm_90`，未在 GPU 上运行。它不是 GEMM benchmark，也不包含 GPU 数值验证。

- `fma_chain`：一个累加器的八步依赖链。
- `fma_ilp`：四个累加器各两步，观察交错后的编码。
- `tensor_m16n8k16`：一个 FP16 输入、FP32 累加的 warp MMA，观察 HMMA lowering。

三个入口的教学 launch 合同为一个 32-thread CTA。每个线程读写自己的槽，输入输出不得重叠；Tensor 输入是按 PTX lane-fragment 顺序打包的缓冲，**不是普通 row-major 矩阵**。本任务没有提供或执行 GPU runtime harness。

在已获准的临时目录中复现（先设置 `TMPDIR`；用上述 CUDA 版本的工具）：

```bash
BUILD_DIR="$(mktemp -d "${TMPDIR:?Set an approved temporary root}/cuda-sm90.XXXXXX")"
ptxas -arch=sm_90 -O3 -v practice/cuda-sm90/execution.ptx -o "$BUILD_DIR/execution.cubin"
nvdisasm -hex -c "$BUILD_DIR/execution.cubin" > "$BUILD_DIR/execution.sass"
python3 practice/cuda-sm90/decode_controls.py "$BUILD_DIR/execution.sass"
```

`decode_controls.py` 只读取反汇编文本；字段位置引用 Mesa NAK 的固定 commit，不修改或执行二进制。不能将其作为 NVIDIA 稳定 SASS ABI，也不能将 stall 字段视为设备实测周期。

完整文本、逐条解码与 SHA256 在 [编译证据](../../evidence/cuda-sm90-20261031/)；源与产物绑定检查：

```bash
python3 scripts/check_sm90_evidence.py
node scripts/check_cuda_execution.js
```
