; Moving nsw from mul to shl is not always valid at the sign bit.
define i8 @mul_defined() {
  %r = mul nsw i8 1, -128
  ret i8 %r
}
define i8 @shift_poison() {
  %r = shl nsw i8 1, 7
  ret i8 %r
}
define i8 @overshift() {
  %r = shl i8 1, 8
  ret i8 %r
}
