#!/usr/bin/env python3
"""Compile the original plugins and check semantic and failure contracts.

Linux / LLVM 22 development tree with exported tool symbols is required.
No toolchain rebuild occurs. All outputs go to --output, outside the repository.
"""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import random
import re
import shlex
import subprocess

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--llvm-root', type=Path, default=os.environ.get('LLVM_ROOT'))
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if not args.llvm_root:
        parser.error('set LLVM_ROOT or pass --llvm-root')
    root = args.llvm_root.resolve()
    out = args.output.resolve()
    if out == Path('/tmp') or Path('/tmp') in out.parents or HERE in out.parents:
        parser.error('use an external output directory, not /tmp or the example tree')
    out.mkdir(parents=True, exist_ok=True)
    bins = root / 'build/bin'
    env = os.environ.copy()
    env.update(TMPDIR=str(out), TMP=str(out), TEMP=str(out))
    commands = []

    def run(name, cmd, *, expect_failure=False):
        p = subprocess.run([str(v) for v in cmd], capture_output=True, text=True, env=env)
        (out / f'{name}.stdout').write_text(p.stdout)
        (out / f'{name}.stderr').write_text(p.stderr)
        commands.append({'name': name, 'returncode': p.returncode})
        if (p.returncode != 0) != expect_failure:
            raise RuntimeError(f'{name}: unexpected exit {p.returncode}\n{p.stderr}')
        return p

    flags = shlex.split(run('cxxflags', [bins / 'llvm-config', '--cxxflags']).stdout)
    llvm_plugin = out / 'FoundationPlugin.so'
    mlir_plugin = out / 'MLIRFoundationPlugin.so'
    run('compile-llvm-plugin', [bins / 'clang++', '-fPIC', '-shared', *flags,
        HERE / 'FoundationPlugin.cpp', '-o', llvm_plugin])
    run('compile-mlir-plugin', [bins / 'clang++', '-fPIC', '-shared', *flags,
        '-I' + str(root / 'mlir/include'),
        '-I' + str(root / 'build/tools/mlir/include'),
        HERE / 'MLIRFoundationPlugin.cpp', '-o', mlir_plugin])
    for label, transform in [('correct', 'demo-mul-pow2'),
                             ('stale', 'demo-bad-preservation')]:
        p = run(label, [bins / 'opt', f'-load-pass-plugin={llvm_plugin}', '-S',
            f'-passes=function(demo-print-muls,{transform},demo-print-muls)',
            '-verify-each', '-debug-pass-manager', HERE / 'input.ll',
            '-o', out / f'{label}.ll'])
        counts = re.findall(r'observe @kernel mul=(\d+)', p.stderr)
        assert counts == (['3', '1'] if label == 'correct' else ['3', '3']), counts
    after = (out / 'correct.ll').read_text()
    assert 'shl i128 %x, 64' in after
    assert 'mul nsw i8 %x, -128' in after
    assert 'mul <2 x i8>' in after
    poison = run('poison', [bins / 'opt', '-S', '-passes=instcombine',
                            HERE / 'poison.ll', '-o', '-']).stdout
    assert 'ret i8 -128' in poison and 'ret i8 poison' in poison
    # Poison may legally be refined to a concrete value by optimization.
    # Compare definedness independently instead of expecting the folder to
    # print poison for every flagged overflow.
    assert -128 <= 1 * -128 <= 127
    assert not (-128 <= 1 * (1 << 7) <= 127)
    dominance = run('dominance', [bins / 'opt', '-passes=verify',
        '-disable-output', HERE / 'bad-dominance.ll'], expect_failure=True)
    assert 'does not dominate all uses' in dominance.stderr

    def llvm_library(name, ir):
        so = out / f'{name}.so'
        run(name + '-native', [bins / 'clang', '-shared', '-fPIC', '-O0',
                               ir, '-o', so])
        return ctypes.CDLL(str(so))

    before_lib = llvm_library('before', HERE / 'input.ll')
    after_lib = llvm_library('after', out / 'correct.ll')
    for lib in [before_lib, after_lib]:
        lib.kernel.argtypes = [ctypes.c_uint8, ctypes.c_uint8]
        lib.kernel.restype = ctypes.c_uint8
    for x in range(256):
        for y in range(256):
            expected = (11 * x + 128 * y) & 255
            assert before_lib.kernel(x, y) == after_lib.kernel(x, y) == expected

    mlir_opt = [bins / 'mlir-opt', f'--load-pass-plugin={mlir_plugin}', '--verify-each']
    rewrite = run('rewrite', [*mlir_opt,
        '--pass-pipeline=builtin.module(func.func(demo-double))', HERE / 'rewrite.mlir']).stdout
    (out / 'rewrite.mlir').write_text(rewrite)
    assert 'overflow<nsw>' in rewrite
    assert 'arith.shli %arg0,' in rewrite
    # Independent allowed-value sets for each use of undef. Duplicating the
    # source use expands behavior; one concrete native run cannot prove this.
    source_lowbits = {(2 * x) & 1 for x in range(256)}
    duplicate_lowbits = {(x + y) & 1 for x in range(256) for y in range(256)}
    shifted_lowbits = {(x << 1) & 1 for x in range(256)}
    assert source_lowbits == shifted_lowbits == {0}
    assert duplicate_lowbits == {0, 1}
    undef_rewrite = run('undef-rewrite', [*mlir_opt,
        '--pass-pipeline=builtin.module(func.func(demo-double))',
        HERE / 'undef-lowbit.mlir']).stdout
    assert 'arith.shli' in undef_rewrite and 'arith.muli' not in undef_rewrite
    assert 'arith.addi' not in undef_rewrite
    partial = run('partial', [*mlir_opt,
        '--pass-pipeline=builtin.module(demo-lower-mul)', HERE / 'conversion.mlir']).stdout
    assert partial.count('builtin.unrealized_conversion_cast') == 3
    assert 'llvm.mul' in partial and ': index to i32' in partial
    full = run('full-expected-failure', [*mlir_opt,
        '--pass-pipeline=builtin.module(demo-lower-mul-full)', HERE / 'conversion.mlir'],
        expect_failure=True)
    assert "failed to legalize operation 'func.func'" in full.stderr
    finish = ('convert-arith-to-llvm{index-bitwidth=32},'
              'convert-func-to-llvm{index-bitwidth=32},reconcile-unrealized-casts')
    final = run('complete-conversion', [*mlir_opt,
        f'--pass-pipeline=builtin.module(demo-lower-mul,{finish})', HERE / 'conversion.mlir']).stdout
    assert 'unrealized_conversion_cast' not in final
    assert 'llvm.func @index_product' in final and 'index' not in final.replace('index_product', '')
    (out / 'converted.mlir').write_text(final)

    def mlir_library(name, mlir_file):
        lowered = run(name + '-lower', [bins / 'mlir-opt', mlir_file,
            f'--pass-pipeline=builtin.module({finish})']).stdout
        lowered_file = out / f'{name}.llvm.mlir'
        lowered_file.write_text(lowered)
        translated = run(name + '-translate', [bins / 'mlir-translate',
            '--mlir-to-llvmir', lowered_file]).stdout
        ir_file = out / f'{name}.ll'
        ir_file.write_text(translated)
        return llvm_library(name, ir_file)

    mlir_before = mlir_library('mlir-before', HERE / 'rewrite.mlir')
    mlir_after = mlir_library('mlir-after', out / 'rewrite.mlir')
    index_before = mlir_library('index-before', HERE / 'conversion.mlir')
    index_after = mlir_library('index-after', out / 'converted.mlir')
    for lib in [mlir_before, mlir_after]:
        lib.double.argtypes = [ctypes.c_uint32]
        lib.double.restype = ctypes.c_uint32
    for lib in [index_before, index_after]:
        lib.index_product.argtypes = [ctypes.c_uint32, ctypes.c_uint32]
        lib.index_product.restype = ctypes.c_uint32
    rng = random.Random(20261026)
    values = [0, 1, 2, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff]
    values += [rng.getrandbits(32) for _ in range(1017)]
    for x in values:
        assert mlir_before.double(x) == mlir_after.double(x) == (3 * x) & 0xffffffff
    for x in values:
        y = rng.getrandbits(32)
        assert index_before.index_product(x, y) == index_after.index_product(x, y) == (x * y) & 0xffffffff
    report = {'llvm_integer_pairs': 65536, 'mlir_rewrite_values': len(values),
              'mlir_index_pairs': len(values), 'expected_failures': 2,
              'stale_analysis_reproduced': True, 'poison_counterexample': True,
              'undef_duplicate_use_counterexample': True,
              'commands': commands,
              'input_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in sorted(HERE.iterdir()) if p.is_file()}}
    (out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k not in ['commands', 'input_sha256']}, indent=2))


if __name__ == '__main__':
    main()
