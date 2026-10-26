define i32 @plus_zero(i32 %x) {
entry:
  %sum = add i32 %x, 0
  ret i32 %sum
}
