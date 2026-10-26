# Original System V x86-64 callee. Deliberately overwrite caller-saved GPRs.
.text
.globl opaque
.type opaque,@function
opaque:
  imulq $17, %rdi, %rax
  addq $11, %rax
  movabsq $0x1122334455667788, %rcx
  movabsq $0x8877665544332211, %rdx
  movabsq $0x123456789abcdef0, %rsi
  movabsq $0x0fedcba987654321, %rdi
  movabsq $0x0102030405060708, %r8
  movabsq $0x0807060504030201, %r9
  movabsq $0x55aa55aa55aa55aa, %r10
  movabsq $0xaa55aa55aa55aa55, %r11
  retq
.size opaque, .-opaque
.section .note.GNU-stack,"",@progbits
