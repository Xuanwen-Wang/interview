// One host thread controls four GPUs. This is a correctness example, not a benchmark.
#include <cuda_runtime.h>
#include <nccl.h>
#include <array>
#include <cstdio>
#include <cstdlib>

static void cuda_check(cudaError_t error, const char* operation) {
  if (error != cudaSuccess) {
    std::fprintf(stderr, "%s: %s\n", operation, cudaGetErrorString(error));
    std::exit(EXIT_FAILURE);
  }
}
static void nccl_check(ncclResult_t error, const char* operation) {
  if (error != ncclSuccess) {
    std::fprintf(stderr, "%s: %s\n", operation, ncclGetErrorString(error));
    std::exit(EXIT_FAILURE);
  }
}
#define CUDA(call) cuda_check((call), #call)
#define NCCL(call) nccl_check((call), #call)

int main() {
  constexpr int ranks = 4, count = 4;
  int available = 0;
  CUDA(cudaGetDeviceCount(&available));
  if (available < ranks) {
    std::fprintf(stderr, "This example requires four visible CUDA devices.\n");
    return EXIT_FAILURE;
  }
  std::array<ncclComm_t, ranks> comms{};
  std::array<cudaStream_t, ranks> streams{};
  std::array<float*, ranks> buffers{};
  std::array<std::array<float, count>, ranks> host{};
  std::array<int, ranks> devices{0, 1, 2, 3};
  for (int rank = 0; rank < ranks; ++rank) {
    CUDA(cudaSetDevice(devices[rank]));
    CUDA(cudaStreamCreate(&streams[rank]));
    CUDA(cudaMalloc(&buffers[rank], count * sizeof(float)));
    for (int c = 0; c < count; ++c) host[rank][c] = 10 * rank + c + 1;
    CUDA(cudaMemcpyAsync(buffers[rank], host[rank].data(), count * sizeof(float),
                         cudaMemcpyHostToDevice, streams[rank]));
  }
  NCCL(ncclCommInitAll(comms.data(), ranks, devices.data()));
  NCCL(ncclGroupStart());
  for (int rank = 0; rank < ranks; ++rank) {
    CUDA(cudaSetDevice(devices[rank]));
    NCCL(ncclAllReduce(buffers[rank], buffers[rank], count, ncclFloat, ncclSum,
                       comms[rank], streams[rank]));
  }
  NCCL(ncclGroupEnd());
  bool correct = true;
  for (int rank = 0; rank < ranks; ++rank) {
    CUDA(cudaSetDevice(devices[rank]));
    CUDA(cudaMemcpyAsync(host[rank].data(), buffers[rank], count * sizeof(float),
                         cudaMemcpyDeviceToHost, streams[rank]));
    CUDA(cudaStreamSynchronize(streams[rank]));
    for (int c = 0; c < count; ++c)
      correct = correct && host[rank][c] == ranks * (c + 1) + 10 * ranks * (ranks - 1) / 2;
    std::printf("rank %d: %.0f %.0f %.0f %.0f\n", rank,
                host[rank][0], host[rank][1], host[rank][2], host[rank][3]);
    NCCL(ncclCommDestroy(comms[rank]));
    CUDA(cudaFree(buffers[rank]));
    CUDA(cudaStreamDestroy(streams[rank]));
  }
  return correct ? EXIT_SUCCESS : EXIT_FAILURE;
}
