#!/usr/bin/env python3
"""Check how llc composes command-line and per-function target features."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--llvm-bin', default=os.environ.get('LLVM_BIN'), required=not os.environ.get('LLVM_BIN'))
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
llc = str(Path(a.llvm_bin) / 'llc')
source = Path(__file__).with_name('feature-override.ll')
results = {}
for name, flags in [('attributes', []), ('force-on', ['-mattr=+lzcnt']), ('force-off', ['-mattr=-lzcnt'])]:
    prefix = [llc, '-O2', '-mtriple=x86_64-unknown-linux-gnu', '-mcpu=x86-64', '-verify-machineinstrs', *flags, str(source)]
    asm = a.out / (name + '.s')
    mir = a.out / (name + '.mir')
    subprocess.run([*prefix, '-o', str(asm)], check=True)
    subprocess.run([*prefix, '-stop-after=finalize-isel', '-o', str(mir)], check=True)
    text = asm.read_text()
    functions = {}
    for func in ('function_without_lzcnt', 'function_with_lzcnt'):
        match = re.search(r'^' + func + r':.*?^\.Lfunc_end', text, re.S | re.M)
        if not match:
            raise AssertionError('missing function: ' + func)
        functions[func] = bool(re.search(r'\blzcntl\b', match.group()))
    expected = {
        'attributes': [False, True], 'force-on': [True, True], 'force-off': [False, False]
    }[name]
    if list(functions.values()) != expected:
        raise AssertionError((name, functions, expected))
    results[name] = functions
(a.out / 'summary.json').write_text(json.dumps(results, indent=2) + '\n')
print('PASS: function attributes, command-line enable, command-line disable; inspect emitted MIR attributes and assembly.')
