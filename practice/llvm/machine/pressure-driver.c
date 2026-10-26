#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

extern uint64_t call_pressure(const uint64_t *p);

static uint64_t next_value(uint64_t *state) {
  *state ^= *state << 13;
  *state ^= *state >> 7;
  *state ^= *state << 17;
  return *state;
}

static uint64_t reference(const uint64_t *p) {
  uint64_t value = 7 * UINT64_C(17) + 11;
  for (unsigned i = 0; i < 12; ++i)
    value = (i & 1) ? value ^ p[i] : value + p[i];
  return value;
}

int main(void) {
  uint64_t input[12];
  uint64_t state = UINT64_C(0x32e487b19a6d053f);
  for (unsigned test = 0; test < 4099; ++test) {
    for (unsigned i = 0; i < 12; ++i) {
      if (test == 0)
        input[i] = 0;
      else if (test == 1)
        input[i] = UINT64_MAX;
      else if (test == 2)
        input[i] = UINT64_C(1) << ((i * 7) % 64);
      else
        input[i] = next_value(&state);
    }
    uint64_t want = reference(input);
    uint64_t got = call_pressure(input);
    if (got != want) {
      fprintf(stderr, "case %u: got=%016" PRIx64 " want=%016" PRIx64 "\n",
              test, got, want);
      return 1;
    }
  }
  puts("call-pressure: 4099 vectors passed");
  return 0;
}
