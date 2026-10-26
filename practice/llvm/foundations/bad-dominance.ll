; Expected rejection: %v does not dominate its use at merge.
define i32 @bad(i1 %condition, i32 %x) {
entry:
  br i1 %condition, label %then, label %merge
then:
  %v = add i32 %x, 1
  br label %merge
merge:
  ret i32 %v
}
