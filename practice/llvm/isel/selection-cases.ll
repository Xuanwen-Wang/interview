; Original engineering examples. Target and features are supplied to llc.
declare i8 @llvm.ctlz.i8(i8, i1 immarg)
declare i32 @llvm.ctlz.i32(i32, i1 immarg)
declare i128 @llvm.ctlz.i128(i128, i1 immarg)

define i32 @clz32_defined(i32 %x) {
  %r = call i32 @llvm.ctlz.i32(i32 %x, i1 false)
  ret i32 %r
}

define i32 @clz32_nonzero(i32 %x) {
  %r = call i32 @llvm.ctlz.i32(i32 %x, i1 true)
  ret i32 %r
}

define i8 @clz8_defined(i8 %x) {
  %r = call i8 @llvm.ctlz.i8(i8 %x, i1 false)
  ret i8 %r
}

define i128 @clz128_defined(i128 %x) {
  %r = call i128 @llvm.ctlz.i128(i128 %x, i1 false)
  ret i128 %r
}

define i32 @clz_load(ptr %base, i64 %index) {
  %p0 = getelementptr i32, ptr %base, i64 %index
  %p1 = getelementptr i32, ptr %p0, i64 3
  %x = load i32, ptr %p1, align 4
  %r = call i32 @llvm.ctlz.i32(i32 %x, i1 false)
  ret i32 %r
}

define i64 @add_imm32_fit(i64 %x) {
  %r = add i64 %x, 2147483647
  ret i64 %r
}

define i64 @add_imm32_miss(i64 %x) {
  %r = add i64 %x, 2147483648
  ret i64 %r
}

define i64 @add_imm32_far(i64 %x) {
  %r = add i64 %x, 2147483649
  ret i64 %r
}
