#!/usr/bin/env python3
"""Validate provenance and concrete decoded dependency relationships on CPU."""
import hashlib
import importlib.util
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
base=root/'evidence/cuda-sm90-20261031'
spec=importlib.util.spec_from_file_location('controls',root/'practice/cuda-sm90/decode_controls.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
manifest=json.loads((base/'provenance.json').read_text())
for name,digest in manifest['repository_files'].items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
records=module.annotate((base/'execution.sass').read_text())
assert records==json.loads((base/'controls.json').read_text())
by=lambda kernel,op:[r for r in records if r['kernel']==kernel and r['instruction'].startswith(op)]
chain=by('fma_chain','FFMA')
independent=by('fma_ilp','FFMA')
assert len(chain)==len(independent)==8
assert all(r['stall']==4 for r in chain[:-1])
assert all(r['stall']==1 for r in independent[:-1])
assert chain[0]['wait_mask']==1<<by('fma_chain','LDG')[0]['write']
loads=by('tensor_m16n8k16','LDG')
mma=by('tensor_m16n8k16','HMMA')
assert len(loads)==2 and len(mma)==1
assert loads[0]['write']==loads[1]['write']==3
assert mma[0]['wait_mask']==8
# Known recorded control word: fields differ, helping catch bit-offset swaps.
f=module.decode(int('004fc800000000093f00000002007423',16))
assert f==dict(stall=4,write=None,read=None,wait_mask=4,reuse_mask=0)
try:
    module.annotate('/*0000*/ FFMA R0,R0,R1,R2; /* 0x0000000000000000 */')
except ValueError:
    pass
else:
    raise AssertionError('Truncated disassembly accepted')
print(f'SM90 evidence: {len(records)} native instructions parsed; file hashes, static chain/ILP controls and dynamic producer-consumer waits verified. No GPU execution.')
