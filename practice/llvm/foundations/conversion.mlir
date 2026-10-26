// This experiment deliberately chooses a target with 32-bit index arithmetic.
module {
  func.func @index_product(%x: index, %y: index) -> index {
    %r = arith.muli %x, %y : index
    return %r : index
  }
}
