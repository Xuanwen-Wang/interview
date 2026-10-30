"""Run with torchrun --standalone --nproc-per-node=4 allreduce.py [--backend gloo]."""
import argparse
import os
from datetime import timedelta

import torch
import torch.distributed as dist


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backend', choices=['nccl', 'gloo'], default='nccl')
    args = parser.parse_args()
    local_rank = int(os.environ['LOCAL_RANK'])
    if args.backend == 'nccl':
        torch.cuda.set_device(local_rank)
        device = torch.device('cuda', local_rank)
    else:
        device = torch.device('cpu')
    dist.init_process_group(args.backend, timeout=timedelta(seconds=60))
    try:
        rank, world = dist.get_rank(), dist.get_world_size()
        data = torch.arange(1, 5, device=device, dtype=torch.float32) + 10 * rank
        expected = torch.arange(1, 5, dtype=torch.float32) * world + 10 * world * (world - 1) / 2
        dist.all_reduce(data, op=dist.ReduceOp.SUM)
        # The blocking CPU copy below observes completion on the current CUDA stream.
        actual = data.cpu()
        torch.testing.assert_close(actual, expected, rtol=0, atol=0)
        print(f'rank={rank} result={actual.tolist()}', flush=True)
    finally:
        dist.destroy_process_group()


if __name__ == '__main__':
    main()
