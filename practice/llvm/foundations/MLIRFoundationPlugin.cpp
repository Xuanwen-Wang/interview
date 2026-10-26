// Original teaching passes: one local rewrite and one deliberately partial lowering.
#include "mlir/Conversion/LLVMCommon/Pattern.h"
#include "mlir/Conversion/LLVMCommon/TypeConverter.h"
#include "mlir/Dialect/Arith/IR/Arith.h"
#include "mlir/Dialect/Func/IR/FuncOps.h"
#include "mlir/Dialect/LLVMIR/LLVMDialect.h"
#include "mlir/IR/Matchers.h"
#include "mlir/Pass/Pass.h"
#include "mlir/Tools/Plugins/PassPlugin.h"
#include "mlir/Transforms/DialectConversion.h"
#include "mlir/Transforms/GreedyPatternRewriteDriver.h"

using namespace mlir;
namespace {
struct DoublePattern : OpRewritePattern<arith::MulIOp> {
  using OpRewritePattern::OpRewritePattern;
  LogicalResult matchAndRewrite(arith::MulIOp Op,
                               PatternRewriter &Rewriter) const override {
    auto Ty = dyn_cast<IntegerType>(Op.getType());
    if (!Ty || !Ty.isSignless() ||
        Op.getOverflowFlags() != arith::IntegerOverflowFlags::none)
      return Rewriter.notifyMatchFailure(Op, "requires unflagged scalar integer");
    APInt C;
    if (!matchPattern(Op.getRhs(), m_ConstantInt(&C)) || C != 2)
      return Rewriter.notifyMatchFailure(Op, "rhs must be integer two");
    // Keep a single use of the input: add(x, x) is unsound for undef values.
    auto One = Rewriter.create<arith::ConstantOp>(
        Op.getLoc(), Rewriter.getIntegerAttr(Ty, 1));
    Rewriter.replaceOpWithNewOp<arith::ShLIOp>(Op, Op.getLhs(), One);
    return success();
  }
};
struct DoublePass : PassWrapper<DoublePass, OperationPass<func::FuncOp>> {
  MLIR_DEFINE_EXPLICIT_INTERNAL_INLINE_TYPE_ID(DoublePass)
  StringRef getArgument() const final { return "demo-double"; }
  StringRef getDescription() const final { return "Expand scalar multiply by two"; }
  void getDependentDialects(DialectRegistry &R) const override {
    R.insert<arith::ArithDialect>();
  }
  void runOnOperation() override {
    RewritePatternSet Patterns(&getContext());
    Patterns.add<DoublePattern>(&getContext());
    GreedyRewriteConfig Config;
    Config.enableFolding(false);
    if (failed(applyPatternsGreedily(getOperation(), std::move(Patterns), Config)))
      signalPassFailure();
  }
};
struct MulLowering : ConvertOpToLLVMPattern<arith::MulIOp> {
  using ConvertOpToLLVMPattern<arith::MulIOp>::ConvertOpToLLVMPattern;
  LogicalResult matchAndRewrite(arith::MulIOp Op, OpAdaptor Adaptor,
                               ConversionPatternRewriter &Rewriter) const override {
    if (Op.getOverflowFlags() != arith::IntegerOverflowFlags::none)
      return Rewriter.notifyMatchFailure(Op, "nowrap lowering omitted in this example");
    Type ResultTy = getTypeConverter()->convertType(Op.getType());
    if (!ResultTy || !isa<IntegerType>(ResultTy))
      return failure();
    Rewriter.replaceOpWithNewOp<LLVM::MulOp>(
        Op, ResultTy, Adaptor.getLhs(), Adaptor.getRhs());
    return success();
  }
};
template <bool Full>
struct LowerMulPass : PassWrapper<LowerMulPass<Full>, OperationPass<ModuleOp>> {
  MLIR_DEFINE_EXPLICIT_INTERNAL_INLINE_TYPE_ID(LowerMulPass<Full>)
  StringRef getArgument() const final {
    return Full ? "demo-lower-mul-full" : "demo-lower-mul";
  }
  StringRef getDescription() const final { return "Lower only muli, with 32-bit index"; }
  void getDependentDialects(DialectRegistry &R) const override {
    R.insert<LLVM::LLVMDialect>();
  }
  void runOnOperation() override {
    MLIRContext *Context = &this->getContext();
    LowerToLLVMOptions Options(Context);
    Options.overrideIndexBitwidth(32);
    LLVMTypeConverter Converter(Context, Options);
    RewritePatternSet Patterns(Context);
    Patterns.add<MulLowering>(Converter);
    ConversionTarget Target(*Context);
    Target.addLegalOp<ModuleOp, UnrealizedConversionCastOp>();
    Target.addLegalDialect<LLVM::LLVMDialect>();
    Target.addIllegalOp<arith::MulIOp>();
    LogicalResult R = Full
        ? applyFullConversion(this->getOperation(), Target, std::move(Patterns))
        : applyPartialConversion(this->getOperation(), Target, std::move(Patterns));
    if (failed(R)) this->signalPassFailure();
  }
};
}
extern "C" LLVM_ATTRIBUTE_WEAK PassPluginLibraryInfo mlirGetPassPluginInfo() {
  return {MLIR_PLUGIN_API_VERSION, "MLIRFoundationPlugin", "1.0", [] {
    PassRegistration<DoublePass>();
    PassRegistration<LowerMulPass<false>>();
    PassRegistration<LowerMulPass<true>>();
  }};
}
