; Original teaching input: 12 independent volatile values live across a call.
target triple = "x86_64-unknown-linux-gnu"

declare i64 @opaque(i64)

define i64 @call_pressure(ptr %p) {
entry:
  %p0 = getelementptr i64, ptr %p, i64 0
  %v0 = load volatile i64, ptr %p0, align 8
  %p1 = getelementptr i64, ptr %p, i64 1
  %v1 = load volatile i64, ptr %p1, align 8
  %p2 = getelementptr i64, ptr %p, i64 2
  %v2 = load volatile i64, ptr %p2, align 8
  %p3 = getelementptr i64, ptr %p, i64 3
  %v3 = load volatile i64, ptr %p3, align 8
  %p4 = getelementptr i64, ptr %p, i64 4
  %v4 = load volatile i64, ptr %p4, align 8
  %p5 = getelementptr i64, ptr %p, i64 5
  %v5 = load volatile i64, ptr %p5, align 8
  %p6 = getelementptr i64, ptr %p, i64 6
  %v6 = load volatile i64, ptr %p6, align 8
  %p7 = getelementptr i64, ptr %p, i64 7
  %v7 = load volatile i64, ptr %p7, align 8
  %p8 = getelementptr i64, ptr %p, i64 8
  %v8 = load volatile i64, ptr %p8, align 8
  %p9 = getelementptr i64, ptr %p, i64 9
  %v9 = load volatile i64, ptr %p9, align 8
  %p10 = getelementptr i64, ptr %p, i64 10
  %v10 = load volatile i64, ptr %p10, align 8
  %p11 = getelementptr i64, ptr %p, i64 11
  %v11 = load volatile i64, ptr %p11, align 8
  %r = call i64 @opaque(i64 7)
  %s0 = add i64 %r, %v0
  %s1 = xor i64 %s0, %v1
  %s2 = add i64 %s1, %v2
  %s3 = xor i64 %s2, %v3
  %s4 = add i64 %s3, %v4
  %s5 = xor i64 %s4, %v5
  %s6 = add i64 %s5, %v6
  %s7 = xor i64 %s6, %v7
  %s8 = add i64 %s7, %v8
  %s9 = xor i64 %s8, %v9
  %s10 = add i64 %s9, %v10
  %s11 = xor i64 %s10, %v11
  ret i64 %s11
}
