#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

extern uint32_t clz32_defined(uint32_t);
extern uint32_t clz32_nonzero(uint32_t);
extern uint8_t clz8_defined(uint8_t);
extern __uint128_t clz128_defined(__uint128_t);
extern uint32_t clz_load(const uint32_t *, uint64_t);
extern uint64_t add_imm32_fit(uint64_t);
extern uint64_t add_imm32_miss(uint64_t);
extern uint64_t add_imm32_far(uint64_t);

static unsigned leading_zero_bits(__uint128_t value, unsigned width) {
  unsigned count = 0;
  for (unsigned i = width; i != 0; --i) {
    if (((value >> (i - 1)) & 1) != 0)
      break;
    ++count;
  }
  return count;
}

static uint64_t next_random(uint64_t *state) {
  *state ^= *state << 13;
  *state ^= *state >> 7;
  *state ^= *state << 17;
  return *state;
}

int main(void) {
  unsigned checks = 0;
  for (unsigned i = 0; i < 256; ++i) {
    if (clz8_defined((uint8_t)i) != leading_zero_bits(i, 8))
      return fprintf(stderr, "clz8 mismatch at %u\n", i), 1;
    ++checks;
  }
  uint64_t state = UINT64_C(0x7265677265737369);
  const uint64_t edges[] = {0, 1, 2, 255, 256, UINT32_MAX,
                           UINT64_C(1) << 31, UINT64_C(1) << 63, UINT64_MAX};
  for (unsigned i = 0; i < 10009; ++i) {
    uint64_t low = i < 9 ? edges[i] : next_random(&state);
    uint64_t high = i < 9 ? (i % 2 ? 0 : edges[i]) : next_random(&state);
    uint32_t value = (uint32_t)low;
    __uint128_t wide = ((__uint128_t)high << 64) | low;
    if (clz32_defined(value) != leading_zero_bits(value, 32))
      return fprintf(stderr, "clz32 mismatch at sample %u\n", i), 1;
    ++checks;
    if (value != 0) {
      if (clz32_nonzero(value) != leading_zero_bits(value, 32))
        return fprintf(stderr, "clz32_nonzero mismatch at sample %u\n", i), 1;
      ++checks;
    }
    if (clz128_defined(wide) != leading_zero_bits(wide, 128))
      return fprintf(stderr, "clz128 mismatch at sample %u\n", i), 1;
    ++checks;
    if (add_imm32_fit(low) != low + UINT64_C(2147483647) ||
        add_imm32_miss(low) != low + UINT64_C(2147483648) ||
        add_imm32_far(low) != low + UINT64_C(2147483649))
      return fprintf(stderr, "immediate mismatch at sample %u\n", i), 1;
    checks += 3;
  }
  const unsigned high_only_bits[] = {64, 127};
  for (unsigned i = 0; i < 2; ++i) {
    __uint128_t value = (__uint128_t)1 << high_only_bits[i];
    if (clz128_defined(value) != leading_zero_bits(value, 128))
      return fprintf(stderr, "clz128 high-only mismatch at bit %u\n", high_only_bits[i]), 1;
    ++checks;
  }
  const uint32_t values[] = {0, 1, 2, 3, 0, UINT32_MAX, UINT32_C(1) << 31};
  for (unsigned i = 0; i < 4; ++i) {
    if (clz_load(values, i) != leading_zero_bits(values[i + 3], 32))
      return fprintf(stderr, "address mismatch at index %u\n", i), 1;
    ++checks;
  }
  printf("PASS: %u independent bit-loop/arithmetic checks\n", checks);
  return 0;
}
