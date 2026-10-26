// Original teaching plugin. Build against the exact LLVM used by opt.
#include "llvm/ADT/STLExtras.h"
#include "llvm/IR/Constants.h"
#include "llvm/IR/IRBuilder.h"
#include "llvm/IR/InstIterator.h"
#include "llvm/IR/PassManager.h"
#include "llvm/Passes/PassBuilder.h"
#include "llvm/Passes/PassPlugin.h"
#include "llvm/Support/raw_ostream.h"

using namespace llvm;

namespace {
class MulCountAnalysis : public AnalysisInfoMixin<MulCountAnalysis> {
  friend AnalysisInfoMixin<MulCountAnalysis>;
  static AnalysisKey Key;
public:
  struct Result { unsigned Count; };
  Result run(Function &F, FunctionAnalysisManager &) {
    unsigned Count = 0;
    for (Instruction &I : instructions(F))
      Count += I.getOpcode() == Instruction::Mul;
    errs() << "compute @" << F.getName() << " mul=" << Count << '\n';
    return {Count};
  }
};
AnalysisKey MulCountAnalysis::Key;

struct PrintMulCountPass : PassInfoMixin<PrintMulCountPass> {
  PreservedAnalyses run(Function &F, FunctionAnalysisManager &AM) {
    unsigned Count = AM.getResult<MulCountAnalysis>(F).Count;
    errs() << "observe @" << F.getName() << " mul=" << Count << '\n';
    return PreservedAnalyses::all();
  }
};

class MulPow2Pass : public PassInfoMixin<MulPow2Pass> {
  bool LieAboutPreservation;
public:
  explicit MulPow2Pass(bool Lie = false) : LieAboutPreservation(Lie) {}
  PreservedAnalyses run(Function &F, FunctionAnalysisManager &) {
    bool Changed = false;
    for (BasicBlock &BB : F) {
      for (Instruction &I : make_early_inc_range(BB)) {
        auto *Mul = dyn_cast<BinaryOperator>(&I);
        if (!Mul || Mul->getOpcode() != Instruction::Mul ||
            !Mul->getType()->isIntegerTy() || Mul->hasNoSignedWrap() ||
            Mul->hasNoUnsignedWrap())
          continue;
        Value *X = Mul->getOperand(0);
        auto *C = dyn_cast<ConstantInt>(Mul->getOperand(1));
        if (!C) {
          C = dyn_cast<ConstantInt>(Mul->getOperand(0));
          X = Mul->getOperand(1);
        }
        if (!C || !C->getValue().isPowerOf2())
          continue;
        unsigned Shift = C->getValue().logBase2();
        IRBuilder<> Builder(Mul);
        Value *Replacement = Builder.CreateShl(
            X, ConstantInt::get(Mul->getType(), Shift), "pow2");
        Mul->replaceAllUsesWith(Replacement);
        Mul->eraseFromParent();
        Changed = true;
      }
    }
    if (!Changed || LieAboutPreservation)
      return PreservedAnalyses::all();
    PreservedAnalyses PA;
    PA.preserveSet<CFGAnalyses>();
    return PA;
  }
};
}

extern "C" LLVM_ATTRIBUTE_WEAK PassPluginLibraryInfo llvmGetPassPluginInfo() {
  return {LLVM_PLUGIN_API_VERSION, "FoundationPlugin", "1.0",
    [](PassBuilder &PB) {
      PB.registerAnalysisRegistrationCallback([](FunctionAnalysisManager &AM) {
        AM.registerPass([] { return MulCountAnalysis(); });
      });
      PB.registerPipelineParsingCallback(
        [](StringRef Name, FunctionPassManager &PM,
           ArrayRef<PassBuilder::PipelineElement>) {
          if (Name == "demo-print-muls") PM.addPass(PrintMulCountPass());
          else if (Name == "demo-mul-pow2") PM.addPass(MulPow2Pass());
          else if (Name == "demo-bad-preservation") PM.addPass(MulPow2Pass(true));
          else return false;
          return true;
        });
    }};
}
