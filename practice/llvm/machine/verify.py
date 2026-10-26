#!/usr/bin/env python3
"""Run the original x86-64 MIR/ABI experiments without building LLVM."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import resource
import shlex
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--skip-runtime", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    llvm_bin = Path(os.environ["LLVM_BIN"])
    env = dict(os.environ)
    for key in ("TMPDIR", "TMP", "TEMP"):
        env[key] = str(out)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    records = []

    def run(name, command, expected=0):
        result = subprocess.run(command, capture_output=True, text=True, env=env)
        (out / (name + ".stdout")).write_text(result.stdout)
        (out / (name + ".stderr")).write_text(result.stderr)
        records.append({"name": name, "exit": result.returncode})
        if expected == 0 and result.returncode != 0:
            raise RuntimeError(f"{name} failed; inspect {out / (name + '.stderr')}")
        if expected != 0 and result.returncode == 0:
            raise AssertionError(f"{name}: malformed input was accepted")
        return result

    llc = str(llvm_bin / "llc")
    common = [llc, "-O2", "-mtriple=x86_64-unknown-linux-gnu", "-mcpu=x86-64",
              "-verify-machineinstrs"]
    for name, stage in [("selected", "finalize-isel"),
                        ("allocated", "virtregrewriter"),
                        ("framed", "prologepilog")]:
        run(name, common + [f"-stop-after={stage}", str(root / "call-pressure.ll"),
                            "-o", str(out / (name + ".mir"))])
    run("object", common + ["-filetype=obj", str(root / "call-pressure.ll"),
                             "-o", str(out / "call-pressure.o")])
    disasm = run("disassembly", [str(llvm_bin / "llvm-objdump"), "-dr",
                                  str(out / "call-pressure.o")]).stdout
    relocs = run("relocations", [str(llvm_bin / "llvm-readobj"), "--relocations",
                                 str(out / "call-pressure.o")]).stdout
    selected = (out / "selected.mir").read_text().split("body:", 1)[1]
    allocated_all = (out / "allocated.mir").read_text()
    allocated = allocated_all.split("body:", 1)[1]
    framed = (out / "framed.mir").read_text().split("body:", 1)[1]
    assert selected.count("volatile load (s64)") == 12
    assert "csr_64" in selected and "CALL64pcrel32" in selected
    assert not re.search(r"%\d+(?::[a-z0-9_]+)?", allocated)
    spill_slots = allocated_all.count("type: spill-slot")
    folded_reloads = len(re.findall(r"(?:ADD|XOR)64rm.*%stack\.", allocated))
    assert spill_slots > 0 and folded_reloads > 0
    # Frame objects remain in memory annotations, but not in address operands.
    assert not re.search(r"%stack\.\d+", "\n".join(
        line.split("::", 1)[0] for line in framed.splitlines()))
    assert "PUSH64r" in framed and "POP64r" in framed
    assert "R_X86_64_PLT32 opaque" in relocs
    assert "R_X86_64_PLT32" in disasm

    mir_common = [llc, "-mtriple=x86_64-unknown-linux-gnu", "-verify-machineinstrs"]
    run("phi", mir_common + ["-run-pass=phi-node-elimination",
                             str(root / "phi-diamond.mir"),
                             "-o", str(out / "phi-eliminated.mir")])
    run("two-address", mir_common + ["-run-pass=twoaddressinstruction",
                                     str(out / "phi-eliminated.mir"),
                                     "-o", str(out / "two-address.mir")])
    phi = (out / "phi-eliminated.mir").read_text().split("body:", 1)[1]
    assert " PHI " not in phi
    assert "%6:gr64 = COPY %3" in phi and "%6:gr64 = COPY %4" in phi
    two_address = (out / "two-address.mir").read_text().split("body:", 1)[1]
    assert "%3:gr64 = XOR64rr %3, %1" in two_address
    assert "%4:gr64 = AND64rr %4, %1" in two_address

    run("tied-valid", mir_common + ["-run-pass=machineverifier",
                                    str(root / "tied-add.mir"),
                                    "-o", str(out / "tied-valid.mir")])
    broken = (root / "tied-add.mir").read_text().replace(
        "ADD64rr $rax,", "ADD64rr $rdi,")
    (out / "tied-broken.mir").write_text(broken)
    rejected = run("tied-rejected", mir_common + ["-run-pass=machineverifier",
                   str(out / "tied-broken.mir"), "-o", str(out / "rejected.mir")],
                   expected=1)
    assert "Tied physical registers must match" in rejected.stderr

    runtime = "not requested"
    if not args.skip_runtime:
        if platform.machine() not in ("x86_64", "AMD64"):
            raise RuntimeError("Runtime check requires x86-64; use --skip-runtime")
        cc = shlex.split(os.environ.get("CC", "cc"))
        run("link", cc + ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
                          str(root / "pressure-driver.c"), str(root / "opaque.S"),
                          str(out / "call-pressure.o"), "-o", str(out / "check")])
        runtime = run("runtime", [str(out / "check")]).stdout.strip()
        assert runtime == "call-pressure: 4099 vectors passed"
    version_lines = run("version", [llc, "--version"]).stdout.splitlines()
    version = next(line.strip() for line in version_lines if "LLVM version" in line)
    digest = hashlib.sha256()
    with Path(llc).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    summary = {
        "llc_version": version,
        "llc_sha256": digest.hexdigest(),
        "target": "x86_64-unknown-linux-gnu / x86-64 / O2",
        "spill_slots": spill_slots,
        "folded_reloads": folded_reloads,
        "bad_tied_operand_rejected": True,
        "runtime": runtime,
        "steps": records,
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({key: value for key, value in summary.items() if key != "steps"},
                     indent=2))


if __name__ == "__main__":
    main()
