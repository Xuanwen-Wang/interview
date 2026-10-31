#!/usr/bin/env python3
"""Read-only control-field annotation for the recorded SM90 disassembly.

Field positions follow Mesa NAK sm70_encode.rs, commit
61a2e907f1d6e4a8432d91d0fde5d439a875fbbe. This is an open-compiler
interpretation, not an NVIDIA-stable SASS ABI or a timing measurement.
"""
import argparse
import json
import re
from pathlib import Path


def decode(word):
    def bits(start, width):
        return (word >> start) & ((1 << width) - 1)
    return {
        'stall': bits(105, 4),
        'write': None if bits(110, 3) == 7 else bits(110, 3),
        'read': None if bits(113, 3) == 7 else bits(113, 3),
        'wait_mask': bits(116, 6),
        'reuse_mask': bits(122, 4),
    }


def annotate(source):
    kernel = None
    pending = None
    records = []
    for line in source.splitlines():
        m = re.match(r'\s*\.section\s+\.text\.([^,]+)', line)
        if m:
            kernel = m[1]
        m = re.match(r'\s*/\*([0-9a-f]+)\*/\s+(.*?)\s*/\* 0x([0-9a-f]{16}) \*/', line)
        if m:
            pending = (m[1], m[2].strip(), int(m[3], 16))
            continue
        m = re.fullmatch(r'\s*/\* 0x([0-9a-f]{16}) \*/\s*', line)
        if m and pending:
            offset, instruction, low = pending
            word = (int(m[1], 16) << 64) | low
            records.append(dict(kernel=kernel, offset=offset, instruction=instruction,
                                encoding=f'{word:032x}', **decode(word)))
            pending = None
    if pending or not records:
        raise ValueError('Incomplete or empty nvdisasm -hex input')
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('sass', type=Path)
    args = parser.parse_args()
    print(json.dumps(annotate(args.sass.read_text()), indent=2))
