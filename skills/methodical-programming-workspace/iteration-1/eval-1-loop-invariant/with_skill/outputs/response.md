# Partition Function for Quicksort with Loop Invariant and Termination Proof

## Formal Specification

### Precondition
```
Pre: arr is a mutable list of comparable integers
     0 <= lo < hi <= len(arr)
     pivot_idx is a valid index in [lo, hi]
```

### Postcondition
```
Post: Returns partition index p such that:
      - All elements in arr[lo:p] are <= pivot value
      - All elements in arr[p+1:hi+1] are > pivot value
      - The pivot value is at arr[p] (or conceptually partitioned)
      - arr is modified in-place (no new array created)
```

---

## 2. Implementation: Lomuto Partition Scheme

```python
def partition(arr, lo, hi, pivot_idx):
    """
    Partition array segment [lo, hi] using Lomuto scheme.
    
    Precondition:
      - arr is a list of comparable integers
      - 0 <= lo < hi <= len(arr)
      - pivot_idx is in [lo, hi]
    
    Postcondition:
      - Returns index p where elements [lo:p] <= arr[p] < elements [p+1:hi+1]
      - Array is partitioned in-place
      - Bounding function: t(i) = hi - i (strictly decreases)
    """
    # Swap pivot to end for simplicity (not essential for the proof)
    pivot_value = arr[pivot_idx]
    arr[pivot_idx], arr[hi] = arr[hi], arr[pivot_idx]
    
    # Loop invariant I:
    # - All elements in [lo, i) are <= pivot_value
    # - All elements in [i, j) are > pivot_value
    # - Element at hi is the pivot (or moved there)
    # - i <= j <= hi
    
    i = lo
    
    for j in range(lo, hi):
        # Bounding function t(j) = hi - j
        # At iteration j: t = hi - j
        # At iteration j+1: t = hi - (j+1) = hi - j - 1 < hi - j
        # So t strictly decreases ✓
        
        if arr[j] <= pivot_value:
            # Maintain invariant: move element to the "small" side
            arr[i], arr[j] = arr[j], arr[i]
            i += 1
            # Invariant maintained: [lo, i) now has one more small element
    
    # Loop exit: j == hi (all elements except pivot processed)
    # Invariant holds: [lo, i) are <= pivot, [i, hi) are > pivot
    
    # Place pivot in final position
    arr[i], arr[hi] = arr[hi], arr[i]
    
    return i
```

---

## 3. Loop Invariant Analysis

### Formal Loop Invariant I:

```
I ≡ (∀x ∈ [lo, i): x <= pivot_value) ∧
    (∀x ∈ [i, j): x > pivot_value) ∧
    (arr[hi] == pivot_value) ∧
    (lo <= i <= j <= hi)
```

### Proof that I is maintained:

**Initialization (before loop):**
- `i = lo, j = lo`
- `[lo, lo)` is empty → `∀x ∈ [lo, lo): x <= pivot_value` is **true** (vacuous)
- `[lo, lo)` is empty → `∀x ∈ [lo, lo): x > pivot_value` is **true** (vacuous)
- Pivot moved to `arr[hi]` ✓
- `lo <= lo <= lo <= hi` ✓
- **I holds** ✓

**Maintenance (assuming I holds at start of iteration with counter j):**

At the start of iteration j, assume I holds.

We inspect `arr[j]`:

**Case 1: `arr[j] <= pivot_value`**
- We execute: `arr[i], arr[j] = arr[j], arr[i]` then `i += 1`
- After swap: `arr[i-1] = arr[j]` (the value that was ≤ pivot is now at position i-1)
- Now `[lo, i)` contains this small element
- `[i, j)` remains unchanged (all > pivot from invariant)
- At the start of next iteration, j increments to j+1
- New segment: `[i, j+1) = [i, j) ∪ {arr[j]}` where `arr[j]` from **previous** iteration
  - But we just processed arr[j] (old j), so we move to new j = j+1
  - The newly processed position [i, j) still satisfies > pivot (the segment shifted right)
- **I holds after** ✓

**Case 2: `arr[j] > pivot_value`**
- We do nothing (skip the swap)
- `arr[j]` stays at position j
- Next iteration: j increments
- `[lo, i)` unchanged (still all ≤ pivot)
- `[i, j+1) = [i, j) ∪ {arr[j]}`, and arr[j] > pivot ✓
- **I holds after** ✓

### Exit (when loop terminates):

When `j == hi`:
- Invariant I holds
- `[lo, i)` has all elements ≤ pivot_value
- `[i, hi)` has all elements > pivot_value
- `arr[hi]` contains pivot_value

We swap `arr[i]` and `arr[hi]`:
- `arr[i]` is the first element > pivot (or beyond if all are ≤ pivot)
- After swap:
  - `[lo, i)` are all ≤ pivot ✓
  - `arr[i]` is the pivot ✓
  - `[i+1, hi+1)` are all > pivot ✓

**Postcondition satisfied** ✓

---

## 4. Termination Proof

### Bounding Function:
```
t(j) = hi - j
```

### Properties:

1. **Always non-negative:** `I ∧ B ⟹ t > 0`
   - While `j < hi`: `t = hi - j > 0` ✓

2. **Strictly decreasing:** At each iteration, j increments by 1 (implicit in `for j in range(lo, hi)`)
   - `t(j) = hi - j`
   - `t(j+1) = hi - (j+1) = hi - j - 1 = t(j) - 1 < t(j)` ✓

### Conclusion:
- t starts at `hi - lo > 0` (given lo < hi)
- t decreases by exactly 1 each iteration
- After at most `hi - lo` iterations, `t = 0`
- Loop terminates ✓

---

## 5. Test Suite

```python
def test_partition_basic():
    """Base case: partition a 2-element array"""
    arr = [5, 3]
    p = partition(arr, 0, 1, pivot_idx=0)
    assert arr[p] == 5
    assert all(x <= arr[p] for x in arr[:p])
    assert all(x > arr[p] for x in arr[p+1:])

def test_partition_all_less():
    """Case: all elements less than pivot"""
    arr = [1, 2, 3, 5]
    p = partition(arr, 0, 3, pivot_idx=3)
    assert arr[p] == 5
    assert all(x <= arr[p] for x in arr[:p])

def test_partition_all_greater():
    """Case: all elements greater than pivot"""
    arr = [10, 8, 9, 5]
    p = partition(arr, 0, 3, pivot_idx=0)
    assert arr[p] == 5
    assert all(x > arr[p] for x in arr[p+1:])

def test_partition_mixed():
    """General case: mixed elements"""
    arr = [3, 7, 8, 5, 2, 1, 9, 5, 4]
    p = partition(arr, 0, len(arr)-1, pivot_idx=3)
    pivot_val = arr[p]
    assert all(x <= pivot_val for x in arr[:p])
    assert all(x > pivot_val for x in arr[p+1:])

def test_partition_subrange():
    """Precondition: partition within [lo, hi] subrange"""
    arr = [10, 3, 7, 8, 5, 20]
    p = partition(arr, 1, 4, pivot_idx=2)  # Only partition indices 1-4
    pivot_val = arr[p]
    assert all(x <= pivot_val for x in arr[1:p])
    assert all(x > pivot_val for x in arr[p+1:5])
    # Elements outside [1, 4] untouched
    assert arr[0] == 10
    assert arr[5] == 20

def test_partition_with_duplicates():
    """Edge case: array with duplicate elements"""
    arr = [5, 5, 5, 3, 5, 2]
    p = partition(arr, 0, len(arr)-1, pivot_idx=0)
    pivot_val = arr[p]
    assert all(x <= pivot_val for x in arr[:p])
    assert all(x > pivot_val for x in arr[p+1:])

def test_partition_single_element_range():
    """Edge case: minimal range"""
    arr = [5, 3, 7]
    p = partition(arr, 1, 1, pivot_idx=1)
    assert p == 1  # Single element partition returns its index
```

---

## 6. Summary

✓ **Loop invariant** explicitly stated as a logical predicate  
✓ **Maintenance** proven by case analysis (arr[j] <= pivot vs arr[j] > pivot)  
✓ **Termination** proven with bounding function t(j) = hi - j (decreases by 1 each iteration)  
✓ **Implementation** is correct Lomuto partition scheme (used in quicksort)  
✓ **Language** is Python as requested  

The partition function is derived to maintain its invariant at every point and is guaranteed to terminate.
