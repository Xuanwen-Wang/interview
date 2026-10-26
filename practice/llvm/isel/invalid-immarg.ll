; Negative test: the second ctlz argument must be a literal immediate.
declare i32 @llvm.ctlz.i32(i32, i1 immarg)
define i32 @invalid_ctlz(i32 %x, i1 %zero_is_poison) {
  %r = call i32 @llvm.ctlz.i32(i32 %x, i1 %zero_is_poison)
  ret i32 %r
}
