# Partition Function for Quicksort in Python

Here's a partition function for quicksort:

## Implementation

```python
def partition(arr, lo, hi, pivot_idx=None):
    if pivot_idx is None:
        pivot_idx = hi
    
    # Move pivot to end
    arr[pivot_idx], arr[hi] = arr[hi], arr[pivot_idx]
    pivot = arr[hi]
    i = lo - 1
    
    for j in range(lo, hi):
        if arr[j] < pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    
    arr[i + 1], arr[hi] = arr[hi], arr[i + 1]
    return i + 1
```

## How it works

The partition function works by placing the pivot element and arranging everything smaller to the left and everything larger to the right. This is used as a key step in quicksort.

The algorithm maintains a pointer `i` that marks the boundary between smaller and larger elements.

## Tests

```python
def test_partition_basic():
    arr = [3, 7, 8, 5, 2]
    p = partition(arr, 0, 4)
    left = arr[:p]
    right = arr[p+1:]
    assert all(x < arr[p] for x in left)
    assert all(x >= arr[p] for x in right)

def test_partition_already_sorted():
    arr = [1, 2, 3, 4, 5]
    p = partition(arr, 0, 4)
    assert arr[p] == 5
```

## Complexity

- Time: O(n) where n is the range [lo, hi]
- Space: O(1) - in-place partitioning

This partition scheme is the Hoare or Lomuto partition, commonly used in quicksort implementations.
