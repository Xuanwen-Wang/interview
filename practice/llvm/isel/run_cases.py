#!/usr/bin/env python3
"""Replay the SelectionDAG examples without changing or rebuilding LLVM."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import resource
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--llvm-bin", default=os.environ.get("LLVM_BIN"))
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--cc", default=os.environ.get("CC", "cc"))
parser.add_argument("--skip-execution", action="store_true")
args = parser.parse_args()
if not args.llvm_bin:
    parser.error("set LLVM_BIN or pass --llvm-bin")
source = Path(__file__).resolve().parent
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
llc = Path(args.llvm_bin).resolve() / "llc"
env = dict(os.environ, TMPDIR=str(out), TMP=str(out), TEMP=str(out))
base = [str(llc), "-O2", "-mtriple=x86_64-unknown-linux-gnu", "-mcpu=x86-64", "-verify-machineinstrs"]
records = []
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def run(name, command, expect=0):
    result = subprocess.run([str(x) for x in command], env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (out / (name + ".stdout")).write_text(result.stdout)
    (out / (name + ".stderr")).write_text(result.stderr)
    records.append({"name": name, "command": [str(x) for x in command],
                    "returncode": result.returncode})
    if expect == 0 and result.returncode != 0:
        raise RuntimeError(f"{name} failed: {result.stderr}")
    if expect != 0 and result.returncode == 0:
        raise RuntimeError(f"{name} unexpectedly succeeded")
    return result

version = run("version", [llc, "--version"]).stdout
for tag, feature in [("baseline", "-lzcnt"), ("lzcnt", "+lzcnt")]:
    for suffix, options in [("s", []), ("mir", ["-stop-after=finalize-isel"]),
                            ("debug.s", ["-debug-only=isel"])]:
        run(tag + "." + suffix, base + ["-mattr=" + feature] + options +
            [source / "selection-cases.ll", "-o", out / (tag + "." + suffix)])
run("pipeline", base + ["-debug-pass=Structure", source / "selection-cases.ll", "-o", out / "pipeline.s"])
invalid = run("invalid-immarg", base + [source / "invalid-immarg.ll", "-o", os.devnull], expect=1)
assert "immarg operand has non-immediate parameter" in invalid.stderr
# This snapshot has an incomplete X86 GlobalISel legalizer for G_CTLZ s32.
# Record coverage drift explicitly: a newer toolchain may make this case succeed.
gisel = run("gisel-boundary", base + ["-global-isel", "-global-isel-abort=1",
            source / "selection-cases.ll", "-o", out / "gisel.s"], expect=1)
assert "unable to legalize instruction" in gisel.stderr and "G_CTLZ" in gisel.stderr
baseline = (out / "baseline.s").read_text()
native = (out / "lzcnt.s").read_text()
assert not re.search(r"\blzcnt[lqw]?\s", baseline)
assert re.search(r"\bbsr[lqw]?\s", baseline)
assert re.search(r"\blzcntl\s+12\(", native)
mir = (out / "lzcnt.mir").read_text()
assert "LZCNT32rm" in mir and "load (s32)" in mir
execution = "not run"
if not args.skip_execution:
    if platform.machine().lower() not in ("x86_64", "amd64"):
        parser.error("execution requires an x86-64 host; use --skip-execution")
    run("baseline-object", base + ["-mattr=-lzcnt", "-filetype=obj", source / "selection-cases.ll", "-o", out / "baseline.o"])
    run("compile-oracle", [args.cc, "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
                           source / "check_baseline.c", out / "baseline.o", "-o", out / "check-baseline"])
    execution = run("execute-oracle", [out / "check-baseline"]).stdout.strip()
manifest = {"llvm_version": version, "llc_sha256": sha256_file(llc),
            "inputs": {p.name: sha256_file(p) for p in source.iterdir() if p.is_file()},
            "runs": records, "execution": execution,
            "scope": "+lzcnt compile only; baseline native execution; no timing or whole-backend validation"}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2))
print(execution)
print("PASS: SelectionDAG contrasts and expected verifier/GlobalISel boundaries")
