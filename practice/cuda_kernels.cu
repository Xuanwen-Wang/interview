// Teaching baselines for finite FP32 inputs, contiguous row-major arrays.
// Not GPU-validated by this documentation task. Output must not alias input.
// transpose32 uses block=(32,8); softmax_rows uses block=(256,1).
// Dimensions and padded launch coordinates must fit signed int; cols <= INT_MAX-256.
#include <cuda_runtime.h>
#include <cmath>

__global__ void transpose32(const float* input, float* output, int m, int n) {
  __shared__ float tile[32][33];
  int x = blockIdx.x * 32 + threadIdx.x;
  int y = blockIdx.y * 32 + threadIdx.y;
  for (int j = 0; j < 32; j += 8)
    if (x < n && y + j < m)
      tile[threadIdx.y + j][threadIdx.x] = input[static_cast<size_t>(y + j) * n + x];
  __syncthreads();
  int ox = blockIdx.y * 32 + threadIdx.x;
  int oy = blockIdx.x * 32 + threadIdx.y;
  for (int j = 0; j < 32; j += 8)
    if (ox < m && oy + j < n)
      output[static_cast<size_t>(oy + j) * m + ox] = tile[threadIdx.x][threadIdx.y + j];
}

__global__ void softmax_rows(const float* input, float* output, int cols) {
  // Contract: cols > 0; grid.x is the number of rows. No masked/NaN rows.
  __shared__ float scratch[256];
  int t = threadIdx.x;
  auto offset = static_cast<size_t>(blockIdx.x) * cols;
  float peak = -INFINITY;
  for (int col = t; col < cols; col += 256)
    peak = fmaxf(peak, input[offset + col]);
  scratch[t] = peak;
  __syncthreads();
  for (int stride = 128; stride; stride >>= 1) {
    if (t < stride) scratch[t] = fmaxf(scratch[t], scratch[t + stride]);
    __syncthreads();
  }
  peak = scratch[0];
  // Every thread must finish reading peak before scratch is reused.
  __syncthreads();
  float total = 0;
  for (int col = t; col < cols; col += 256)
    total += expf(input[offset + col] - peak);
  scratch[t] = total;
  __syncthreads();
  for (int stride = 128; stride; stride >>= 1) {
    if (t < stride) scratch[t] += scratch[t + stride];
    __syncthreads();
  }
  total = scratch[0];
  for (int col = t; col < cols; col += 256)
    output[offset + col] = expf(input[offset + col] - peak) / total;
}

__global__ void mean_filter3(const float* input, float* output, int m, int n) {
  int x = blockIdx.x * blockDim.x + threadIdx.x;
  int y = blockIdx.y * blockDim.y + threadIdx.y;
  if (x >= n || y >= m) return;
  float sum = 0;
  for (int dy = -1; dy <= 1; ++dy)
    for (int dx = -1; dx <= 1; ++dx) {
      int ix = x + dx, iy = y + dy;
      if (ix >= 0 && ix < n && iy >= 0 && iy < m)
        sum += input[static_cast<size_t>(iy) * n + ix];
    }
  output[static_cast<size_t>(y) * n + x] = sum / 9.0f;
}
