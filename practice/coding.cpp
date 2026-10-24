// Original C++17 exercises. The linked list is acyclic and caller-owned.
#include <algorithm>
#include <cassert>
#include <limits>
#include <stdexcept>
#include <vector>

struct Node {
  int value;
  Node* next = nullptr;
};

Node* reverse_k_group(Node* head, int k) {
  if (k <= 0) throw std::invalid_argument("k must be positive");
  Node dummy{0, head};
  Node* before = &dummy;
  while (true) {
    Node* end = before;
    for (int i = 0; i < k; ++i) {
      end = end->next;
      if (!end) return dummy.next;
    }
    Node* after = end->next;
    Node* current = before->next;
    Node* old_head = current;
    Node* previous = after;
    while (current != after) {
      Node* following = current->next;
      current->next = previous;
      previous = current;
      current = following;
    }
    before->next = end;
    before = old_head;
  }
}

void heap_sort(std::vector<int>& a) {
  auto down = [&a](std::size_t i, std::size_t end) {
    while (i < end / 2) {
      std::size_t child = i * 2 + 1;
      if (child + 1 < end && a[child + 1] > a[child]) ++child;
      if (a[i] >= a[child]) break;
      std::swap(a[i], a[child]);
      i = child;
    }
  };
  for (std::size_t i = a.size() / 2; i > 0; --i) down(i - 1, a.size());
  for (std::size_t end = a.size(); end > 1; --end) {
    std::swap(a[0], a[end - 1]);
    down(0, end - 1);
  }
}

// Out-of-place CPU transpose. A cache tile limits the active row working set.
std::vector<float> tiled_transpose(const std::vector<float>& input,
                                   std::size_t rows, std::size_t cols,
                                   std::size_t tile) {
  if (!tile || (cols && rows > std::numeric_limits<std::size_t>::max() / cols)
      || input.size() != rows * cols)
    throw std::invalid_argument("invalid shape or tile");
  std::vector<float> output(input.size());
  if (!rows || !cols) return output;
  for (std::size_t r = 0; r < rows;) {
    const auto re = r + std::min(tile, rows - r);
    for (std::size_t c = 0; c < cols;) {
      const auto ce = c + std::min(tile, cols - c);
      for (std::size_t i = r; i < re; ++i)
        for (std::size_t j = c; j < ce; ++j)
          output[j * rows + i] = input[i * cols + j];
      c = ce;
    }
    r = re;
  }
  return output;
}

int main() {
  for (std::size_t rows : {0, 1, 17, 32, 33})
    for (std::size_t cols : {0, 1, 32, 35, 65})
      for (std::size_t tile : {1, 8, 16, 32, 100}) {
        std::vector<float> input(rows * cols);
        for (std::size_t i = 0; i < input.size(); ++i) input[i] = static_cast<float>(i);
        const auto output = tiled_transpose(input, rows, cols, tile);
        for (std::size_t i = 0; i < rows; ++i)
          for (std::size_t j = 0; j < cols; ++j)
            assert(output[j * rows + i] == input[i * cols + j]);
        assert(tiled_transpose(output, cols, rows, tile) == input);
      }
  bool rejected = false;
  try { tiled_transpose({}, 1, 1, 32); } catch (const std::invalid_argument&) { rejected = true; }
  assert(rejected);
  rejected = false;
  try { tiled_transpose({}, 0, 0, 0); } catch (const std::invalid_argument&) { rejected = true; }
  assert(rejected);
  for (int n = 0; n <= 25; ++n) {
    for (int k = 1; k <= 29; ++k) {
      std::vector<Node> storage(n);
      for (int i = 0; i < n; ++i) storage[i] = Node{i, i + 1 < n ? &storage[i + 1] : nullptr};
      Node* head = reverse_k_group(n ? &storage[0] : nullptr, k);
      std::vector<int> expected(n);
      for (int i = 0; i < n; ++i) expected[i] = i;
      for (int i = 0; i + k <= n; i += k) std::reverse(expected.begin() + i, expected.begin() + i + k);
      for (int value : expected) {
        assert(head && head->value == value);
        assert(head == &storage[value]);
        head = head->next;
      }
      assert(head == nullptr);
    }
  }
  for (int seed = 0; seed < 200; ++seed) {
    std::vector<int> a;
    for (int j = 0; j < seed % 57; ++j) a.push_back((j * j + 17 * seed) % 23 - 11);
    auto expected = a;
    std::sort(expected.begin(), expected.end());
    heap_sort(a);
    assert(a == expected);
  }
}
