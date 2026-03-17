# Binary Search Implementation

Here's a binary search implementation with tests:

## Implementation

```python
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    
    return -1
```

## How it works

Binary search works by dividing the array in half each time. If the middle element is your target, you're done. If the middle element is too small, you search the right half. If it's too large, you search the left half.

## Test cases

```python
# Basic tests
assert binary_search([1, 2, 3, 4, 5], 3) == 2
assert binary_search([1, 2, 3, 4, 5], 1) == 0
assert binary_search([1, 2, 3, 4, 5], 5) == 4
assert binary_search([1, 2, 3, 4, 5], 6) == -1
assert binary_search([], 1) == -1
```

## Why it's efficient

Binary search is O(log n) because you eliminate half the remaining elements with each comparison. This makes it much faster than a linear search for large arrays.

## Important notes

- The array must be sorted
- Returns -1 if the element is not found
- Returns the index if the element is found (though with duplicates it might return any matching index)
