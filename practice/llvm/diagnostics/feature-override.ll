; Per-function features are part of a reproducible backend test.
target triple = "x86_64-unknown-linux-gnu"
declare i32 @llvm.ctlz.i32(i32, i1 immarg)

define i32 @function_without_lzcnt(i32 %x) #0 {
  %r = call i32 @llvm.ctlz.i32(i32 %x, i1 false)
  ret i32 %r
}

define i32 @function_with_lzcnt(i32 %x) #1 {
  %r = call i32 @llvm.ctlz.i32(i32 %x, i1 false)
  ret i32 %r
}

attributes #0 = { "target-features"="-lzcnt" }
attributes #1 = { "target-features"="+lzcnt" }
