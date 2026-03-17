# Derivación de Binary Search desde Especificación Formal

## 1. Especificación Formal

### Precondición (Pre)
```
Pre: arr is a sorted array of integers (∀i ∈ [0, len(arr)-1): arr[i] <= arr[i+1])
     lo, hi are indices with 0 <= lo <= hi < len(arr)
     target is an integer
```

### Postcondición (Post)
```
Post: result = -1           if ¬(∃i: lo <= i <= hi ∧ arr[i] == target)
      result = i            if ∃i: lo <= i <= hi ∧ arr[i] == target
      0 <= result < len(arr) if result ≠ -1
```

La postcondición es una **disyunción**: encontramos el target O retornamos -1. Esta estructura sugiere un **condicional en la derivación**.

---

## 2. Derivación del Algoritmo

### Análisis de la postcondición

Tenemos dos casos:
1. **Target está presente:** hallar el índice
2. **Target está ausente:** retornar -1

Para explorar dónde está el target en un array **ordenado**, usamos la propiedad: si arr es ordenado y arr[mid] > target, entonces target está en la mitad izquierda.

### Estrategia: Divide and Conquer con Invariante de Intervalo

**Loop Invariant I:**
```
I: target ∈ arr[lo..hi] ⟹ target ∈ arr[lo_curr..hi_curr]
```

Es decir: si el target existe en el rango original [lo, hi], debe estar en el rango actual [lo_curr, hi_curr].

**Bounding Function (Variante):**
```
t(lo_curr, hi_curr) = hi_curr - lo_curr + 1
```
El tamaño del intervalo decrece en cada iteración.

### Derivación paso a paso

**Estado inicial:** `lo_curr = lo, hi_curr = hi`
- Trivialmente: `I` se mantiene (el rango actual es igual al original).

**Cuerpo del loop (mientras `lo_curr <= hi_curr`):**

1. Calcular punto medio: `mid = (lo_curr + hi_curr) // 2`
2. Comparar `arr[mid]` con `target`:
   - **Si `arr[mid] == target`:** retornar `mid` (encontramos la solución)
   - **Si `arr[mid] > target`:** target debe estar a la izquierda → `hi_curr = mid - 1`
     - Nuevo intervalo: `[lo_curr, mid-1]`
     - `t` decrece: `hi_curr - lo_curr + 1` → `(mid-1) - lo_curr + 1 = mid - lo_curr < (hi_curr - lo_curr + 1)`
   - **Si `arr[mid] < target`:** target debe estar a la derecha → `lo_curr = mid + 1`
     - Nuevo intervalo: `[mid+1, hi_curr]`
     - `t` decrece: `hi_curr - (mid+1) + 1 = hi_curr - mid < (hi_curr - lo_curr + 1)` (porque mid > lo_curr)

**Terminación:**
- Loop termina cuando `lo_curr > hi_curr` (intervalo vacío).
- En ese punto: target no existe en el rango → retornar `-1`.

---

## 3. Implementación Derivada

```python
def binary_search(arr, target, lo=0, hi=None):
    """
    Precondition:
      - arr is a sorted list of integers
      - 0 <= lo <= hi < len(arr)
      - target is an integer
    
    Postcondition:
      - Returns index i where arr[i] == target and lo <= i <= hi
      - Returns -1 if target not found in arr[lo:hi+1]
    """
    if hi is None:
        hi = len(arr) - 1
    
    # Initialization maintains invariant I
    lo_curr, hi_curr = lo, hi
    
    # Loop invariant I: if target exists in [lo, hi], it exists in [lo_curr, hi_curr]
    # Bounding function t = hi_curr - lo_curr + 1 (strictly decreases)
    while lo_curr <= hi_curr:
        mid = (lo_curr + hi_curr) // 2
        
        if arr[mid] == target:
            # Target found
            return mid
        elif arr[mid] > target:
            # Target in left half (if it exists)
            hi_curr = mid - 1
            # t(mid, lo_curr) = (mid - 1) - lo_curr + 1 < (hi_curr - lo_curr + 1) = t(before)
        else:  # arr[mid] < target
            # Target in right half (if it exists)
            lo_curr = mid + 1
            # t(mid, hi_curr) = hi_curr - (mid + 1) + 1 < (hi_curr - lo_curr + 1) = t(before)
    
    # Loop exit: lo_curr > hi_curr → interval is empty → target not found
    return -1
```

---

## 4. Derivación de Casos de Prueba desde la Postcondición

La postcondición tiene estructura: `result = -1 ∨ (result = i ∧ arr[i] == target)`

### Elementos estructurales:
1. **Disyunción en postcondición** → un test por rama
2. **Rango [lo, hi]** → casos límite: principio, final, fuera de rango
3. **Array ordenado** → casos con valores duplicados, arrays pequeños

### Test Suite Derivada:

```python
import pytest

def test_target_found_single_element():
    """Base case: array with one element, target found"""
    arr = [5]
    assert binary_search(arr, 5) == 0

def test_target_not_found_single_element():
    """Base case: array with one element, target not found"""
    arr = [5]
    assert binary_search(arr, 3) == -1

def test_target_found_at_beginning():
    """Inductive case: target at lo boundary"""
    arr = [1, 2, 3, 4, 5]
    assert binary_search(arr, 1) == 0

def test_target_found_at_end():
    """Inductive case: target at hi boundary"""
    arr = [1, 2, 3, 4, 5]
    assert binary_search(arr, 5) == 4

def test_target_found_middle():
    """General case: target in the middle"""
    arr = [1, 2, 3, 4, 5]
    assert binary_search(arr, 3) == 2

def test_target_not_found_between():
    """Postcondition branch: target does not exist"""
    arr = [1, 3, 5, 7, 9]
    assert binary_search(arr, 4) == -1

def test_target_not_found_before_all():
    """Postcondition branch: target smaller than all elements"""
    arr = [5, 10, 15]
    assert binary_search(arr, 1) == -1

def test_target_not_found_after_all():
    """Postcondition branch: target larger than all elements"""
    arr = [5, 10, 15]
    assert binary_search(arr, 20) == -1

def test_empty_array():
    """Base case: empty array"""
    arr = []
    assert binary_search(arr, 5, lo=0, hi=-1) == -1

def test_range_boundary_search_within_subrange():
    """Precondition: search within [lo, hi] boundaries"""
    arr = [1, 2, 3, 4, 5]
    # Search only in [1, 3]
    result = binary_search(arr, 4, lo=0, hi=2)
    assert result == -1  # 4 exists but outside search range

def test_duplicate_elements():
    """Specification edge case: array with duplicates (returns any valid index)"""
    arr = [1, 2, 2, 2, 5]
    result = binary_search(arr, 2)
    assert result in [1, 2, 3]  # Any index with value 2 is valid
```

---

## 5. Verificación de Corrección

### Prueba del invariante:

**Initialization:** `I` trivialmente verdadero (lo_curr = lo, hi_curr = hi).

**Maintenance:** Cuando `arr[mid] > target`:
- Antes: Si target ∈ [lo, hi], entonces target ∈ [lo_curr, hi_curr]
- Asignación: `hi_curr := mid - 1`
- Dado que arr es ordenado y arr[mid] > target, tenemos target < arr[mid]
- Por lo tanto, target ∈ [lo, mid-1] ⊆ [lo, hi_curr]
- `I` se mantiene ✓

**Termination:** Cuando `lo_curr > hi_curr`:
- El intervalo [lo_curr, hi_curr] es vacío
- No puede existir target en un intervalo vacío
- Retornar -1 es correcto ✓

### Correctness Summary:
✓ Precondición: Asumida por el caller
✓ Postcondición rama 1: Si target no existe → retorna -1 ✓
✓ Postcondición rama 2: Si target existe → retorna índice válido ✓
✓ Todas las ramas manejadas
✓ Termination guaranteed

**Implementación derivada es correcta por construcción.** ✓
