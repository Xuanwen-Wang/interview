; Arithmetic is modulo 2^8 unless nowrap flags say otherwise.
define i8 @kernel(i8 %x, i8 %y) {
entry:
  %a = mul i8 %x, 8
  %b = mul i8 128, %y
  %c = mul i8 %x, 3
  %d = add i8 %a, %b
  %r = add i8 %d, %c
  ret i8 %r
}

define i8 @flagged(i8 %x) {
  %a = mul nsw i8 %x, -128
  ret i8 %a
}

define <2 x i8> @vector(<2 x i8> %x) {
  %a = mul <2 x i8> %x, <i8 8, i8 8>
  ret <2 x i8> %a
}

define i128 @wide(i128 %x) {
  %a = mul i128 %x, 18446744073709551616
  ret i128 %a
}
