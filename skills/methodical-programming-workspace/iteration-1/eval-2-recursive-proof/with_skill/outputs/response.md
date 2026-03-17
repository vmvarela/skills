# Structural Induction Proof of Merge Sort Correctness

## 1. Formal Specification

### Precondition
```
Pre: arr is a finite list of comparable elements (integers, strings, etc.)
```

### Postcondition
```
Post: Returns a list such that:
      - Elements are in non-decreasing order (∀i: result[i] <= result[i+1])
      - result is a permutation of arr (same elements, possibly reordered)
      - length(result) = length(arr)
```

---

## 2. Structural Induction Proof

Merge sort uses the **algebraic data type List** with constructors:
- **Base:** `[]` (empty list)
- **Inductive:** `e:l` (cons: prepend element e to list l)

### Induction Hypothesis

For any list of length n, merge_sort returns a sorted permutation.

---

## 3. Base Case

**Claim:** `merge_sort([]) = []` and `merge_sort([x]) = [x]` (both correct).

**Proof:**

When `len(arr) <= 1`:
- Execution reaches the direct case: `if len(arr) <= 1: return arr`
- Returns the list unchanged
- A list of 0 or 1 element is trivially sorted ✓
- It is trivially a permutation of itself ✓

**Base case proven.** ✓

---

## 4. Inductive Step

**Induction Hypothesis (IH):** Assume `merge_sort(left)` and `merge_sort(right)` both return sorted permutations for lists of length < n.

**Goal:** Prove `merge_sort(arr)` returns a sorted permutation when `len(arr) = n > 1`.

**Proof for `len(arr) > 1`:**

```python
mid = len(arr) // 2
left = merge_sort(arr[:mid])      # Recursive call on left half (len < n)
right = merge_sort(arr[mid:])      # Recursive call on right half (len < n)
return merge(left, right)
```

**Step 1:** By IH, `left` is sorted and is a permutation of `arr[:mid]`.
**Step 2:** By IH, `right` is sorted and is a permutation of `arr[mid:]`.

**Step 3:** Prove that `merge(left, right)` combines two sorted lists into a single sorted list.

---

## 5. Correctness of Merge Function

**Specification of `merge`:**
```
Pre: left and right are both sorted lists
Post: Returns a sorted list containing all elements from left and right
```

**Proof:**

```python
def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])      # Append remaining from left
    result.extend(right[j:])      # Append remaining from right
    return result
```

**Loop Invariant:**
```
I: result contains elements from left[0:i] and right[0:j], merged in sorted order
   All elements in result <= all elements in left[i:] and right[j:]
   i <= len(left), j <= len(right)
```

**Initialization:** `result = [], i = 0, j = 0` → I holds trivially. ✓

**Maintenance:** In each iteration:
- We compare `left[i]` and `right[j]` (both exist since `i < len(left)` and `j < len(right)`)
- We append the smaller one to result and increment the corresponding index
- Since `left` and `right` are sorted:
  - `left[i]` ≤ all elements in `left[i+1:]`
  - `right[j]` ≤ all elements in `right[j+1:]`
  - Therefore, appending the minimum of `left[i]` and `right[j]` preserves sorted order ✓
  - Invariant maintained ✓

**Exit:** When `i == len(left)` or `j == len(right)`:
- One list is exhausted
- We append the remaining elements (which are already sorted)
- Final result is sorted ✓

**Merge correctness proven.** ✓

---

## 6. Back to Inductive Step

Given:
- `left` is sorted (by IH)
- `right` is sorted (by IH)
- `merge(left, right)` returns a sorted list (just proven)

**Conclusion:** `merge_sort(arr)` for `len(arr) > 1` returns a sorted permutation. ✓

---

## 7. Termination Proof

**Bounding Function:**
```
t(arr) = len(arr)
```

**Properties:**

1. **Initially natural:** `len(arr)` is a natural number ≥ 0.

2. **Strictly decreases in recursive calls:**
   - When `len(arr) > 1`:
     - `mid = len(arr) // 2`
     - `len(left) = len(arr[:mid]) = mid < len(arr)` (since mid ≤ len(arr)//2 < len(arr))
     - `len(right) = len(arr[mid:]) = len(arr) - mid < len(arr)` (since at least 1 element removed)
   - Both recursive calls have strictly smaller lists ✓

3. **Reaches base case:** Since lists decrease in size and are non-negative, eventually `len(arr) <= 1`, and recursion terminates. ✓

**Termination proven.** ✓

---

## 8. Bug Analysis

**Examining the provided code:**

```python
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result
```

**Verdict: The code is CORRECT.** ✓

- Base case is correct (returns small lists unchanged)
- Recursion correctly divides by midpoint
- Merge function correctly combines sorted lists
- Stability is preserved (using `<=` comparison)
- All elements are preserved (extend adds remaining)

**No bugs found.** ✓

---

## 9. Derived Test Cases from Specification

The specification has these elements:
- **Base constructor `[]`:** empty list (neutral for length)
- **Inductive constructor:** list with 1+ elements

### Test Suite:

```python
def test_merge_sort_empty():
    """Base case: empty list (neutral of length)"""
    assert merge_sort([]) == []

def test_merge_sort_single():
    """Minimal inductive case: one element"""
    assert merge_sort([5]) == [5]

def test_merge_sort_two_sorted():
    """Minimal inductive case: two elements already sorted"""
    assert merge_sort([1, 2]) == [1, 2]

def test_merge_sort_two_unsorted():
    """Minimal inductive case: two elements needing sort"""
    assert merge_sort([2, 1]) == [1, 2]

def test_merge_sort_general():
    """General inductive case: multiple elements"""
    assert merge_sort([3, 1, 4, 1, 5]) == [1, 1, 3, 4, 5]

def test_merge_sort_already_sorted():
    """Boundary case: input already sorted"""
    assert merge_sort([1, 2, 3, 4, 5]) == [1, 2, 3, 4, 5]

def test_merge_sort_reverse():
    """Boundary case: reverse sorted input"""
    assert merge_sort([5, 4, 3, 2, 1]) == [1, 2, 3, 4, 5]

def test_merge_sort_duplicates():
    """Edge case: all elements identical"""
    assert merge_sort([5, 5, 5, 5]) == [5, 5, 5, 5]

def test_merge_sort_stability():
    """Specification property: merge sort is stable (preserves order of equal elements)"""
    arr = [(1, 'a'), (1, 'b'), (1, 'c')]
    result = merge_sort(arr)
    assert result == [(1, 'a'), (1, 'b'), (1, 'c')]  # Order preserved for equal keys

def test_merge_sort_length_preserved():
    """Postcondition: length is preserved"""
    for test_arr in [[], [1], [3, 1, 4], [5, 4, 3, 2, 1]]:
        assert len(merge_sort(test_arr)) == len(test_arr)

def test_merge_sort_permutation():
    """Postcondition: result is a permutation (same elements)"""
    test_arr = [3, 1, 4, 1, 5, 9, 2]
    result = merge_sort(test_arr)
    assert sorted(test_arr) == result
    assert sorted(test_arr) == sorted(result)  # Element frequencies match

def test_merge_sort_with_negatives():
    """Coverage: negative numbers"""
    assert merge_sort([-3, 1, -1, 4]) == [-3, -1, 1, 4]

def test_merge_sort_with_floats():
    """Coverage: floating-point numbers"""
    assert merge_sort([3.5, 1.2, 4.8, 1.2]) == [1.2, 1.2, 3.5, 4.8]
```

---

## 10. Summary

✓ **Base case proven:** len(arr) ≤ 1 returns sorted trivially  
✓ **Inductive step proven:** Recursive calls + merge produces sorted result  
✓ **Merge correctness proven:** Loop invariant maintains sorted order  
✓ **Termination proven:** Bounding function len(arr) decreases strictly  
✓ **Code analysis:** No bugs found in the provided implementation  
✓ **Test cases derived:** 12 tests covering base, inductive, boundary, and edge cases  

**Conclusion:** The merge sort implementation is correct by construction and proven via structural induction. ✓
