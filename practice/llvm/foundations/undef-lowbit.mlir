// Multiplying an undef by two still guarantees a zero least-significant bit.
// Duplicating the undef operand in an add would allow independent choices.
module {
  func.func @undef_lowbit() -> i8 {
    %u = llvm.mlir.undef : i8
    %two = arith.constant 2 : i8
    %one = arith.constant 1 : i8
    %product = arith.muli %u, %two : i8
    %lowbit = arith.andi %product, %one : i8
    return %lowbit : i8
  }
}
