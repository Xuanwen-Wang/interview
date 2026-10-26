module {
  func.func @double(%x: i32) -> i32 {
    %two = arith.constant 2 : i32
    %a = arith.muli %x, %two : i32
    %r = arith.addi %a, %x : i32
    return %r : i32
  }
  func.func @keep_flag(%x: i32) -> i32 {
    %two = arith.constant 2 : i32
    %a = arith.muli %x, %two overflow<nsw> : i32
    return %a : i32
  }
}
