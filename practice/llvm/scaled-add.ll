target triple = "x86_64-unknown-linux-gnu"

define i32 @scaled_add(i32 %x, i32 %y) {
entry:
  %scaled = mul i32 %x, 5
  %sum = add i32 %scaled, %y
  ret i32 %sum
}
