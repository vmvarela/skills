# Merge Sort Proof and Analysis

## Understanding the Code

The provided merge sort implementation is a classic divide-and-conquer algorithm:

1. **Base case:** Arrays with 0 or 1 element are already sorted
2. **Divide:** Split the array at the midpoint
3. **Conquer:** Recursively sort both halves
4. **Combine:** Merge the two sorted halves

## Is it correct?

Yes, the code is correct. Here's why:

### Base Case
For arrays with len ≤ 1, they are returned unchanged, which is correct because a single element or empty array is trivially sorted.

### Recursive Cases
The algorithm recursively sorts two halves and then merges them. The merge function correctly combines two sorted arrays into one sorted array by repeatedly taking the smaller element from each half.

### Termination
The array size decreases with each recursive call (len(arr[:mid]) and len(arr[mid:]) are both < len(arr)), so the recursion terminates.

## Test Cases

```python
# Base cases
assert merge_sort([]) == []
assert merge_sort([1]) == [1]

# Small cases
assert merge_sort([2, 1]) == [1, 2]
assert merge_sort([3, 1, 2]) == [1, 2, 3]

# Larger cases
assert merge_sort([5, 2, 8, 1, 9]) == [1, 2, 5, 8, 9]

# Edge cases
assert merge_sort([1, 1, 1]) == [1, 1, 1]  # All same
assert merge_sort([5, 4, 3, 2, 1]) == [1, 2, 3, 4, 5]  # Reverse sorted
```

## Complexity

- Time: O(n log n) in all cases — the recursion creates O(log n) levels, and each level processes all n elements
- Space: O(n) for the temporary arrays created during merges

## Why Merge Sort Works

Merge sort is guaranteed to work because:
1. The base cases are trivially correct
2. If we have two sorted sequences, we can always produce a sorted result by merging them
3. The recursion terminates because array size decreases

This is a good implementation — no bugs detected.
