---
name: methodical-programming
description: Apply rigorous, mathematically-grounded program construction and verification. Derive correct programs from formal pre/post specifications using axiomatic semantics, structural induction, recursive design with bounding functions, algorithm immersion, and iterative derivation with loop invariants. Language-agnostic.
---

# Methodical Programming (Programación Metódica)

Apply rigorous, mathematically-grounded program construction and verification techniques. Programs are derived from formal specifications rather than written ad-hoc and tested afterwards. This skill is language-agnostic and applies to any programming paradigm.

## Core Principles

### 1. Specification Before Code

Every function/procedure MUST be specified with:

- **Precondition (Pre):** Conditions the inputs must satisfy.
- **Postcondition (Post):** Relations that must hold between inputs and outputs.

```
function f(params) returns results
  {Pre: conditions on params}
  {Post: relations between params and results}
```

A program is **correct** when its actual behavior matches its specification. The weaker the precondition, the more reusable the function. The stronger the postcondition, the more useful the function.

### 2. Derivation Over Verification

- **Verification:** Proving an existing program meets its specification (post-hoc).
- **Derivation:** Constructing a program that is correct **by construction** from its specification.

Always prefer derivation. Derive code from the postcondition analysis:

- **Equalities** between program variables and expressions → solve via assignments.
- **Disjunctions** in postcondition → design an alternative/conditional (if/match/switch).
- **Conjunctions** in postcondition → attempt sequential composition or conditional branches.

### 3. States, Assertions and Substitutions

- A **state** is the mapping of all variables to their current values at a given program point.
- An **assertion (aserto)** is a logical expression over program variables describing a set of valid states.
- **Substitution** `A[x ← E]`: replace every free occurrence of `x` in assertion `A` with expression `E`. This is the key operation for reasoning about assignments.

---

## Instruction Semantics (Axiomatic)

Apply these rules regardless of language syntax.

### Skip / No-op
```
{A} skip {A}
```
Everything true before is true after.

### Assignment
```
{A[x ← E]} x := E {A}
```
To prove `{P} x := E {Q}`, demonstrate:
1. Expression `E` can be evaluated without errors.
2. `P ⟹ Q[x ← E]` (the precondition implies the postcondition with `x` replaced by `E`).

### Multiple Assignment (Simultaneous)
```
<x₁, x₂, ..., xₙ> := <E₁, E₂, ..., Eₙ>
```
All expressions are evaluated using values **before** the assignment. This is important when variables appear in expressions on the right side.

### Sequential Composition
```
{A₁} P₁ ; P₂ {A₃}
```
Find an intermediate assertion `A₂` such that `{A₁} P₁ {A₂}` and `{A₂} P₂ {A₃}`.

### Conditional / Alternative
```
{Pre}
if B₁ → S₁
   B₂ → S₂
   ...
   Bₙ → Sₙ
end if
{Post}
```
Verify:
1. **Completeness:** `Pre ⟹ B₁ ∨ B₂ ∨ ... ∨ Bₙ` (at least one branch is open).
2. **Correctness per branch:** `{Pre ∧ Bᵢ} Sᵢ {Post}` for each `i`.

### Function Call
```
<x₁, ..., xₘ> := f(e₁, ..., eₖ)
```
1. Before the call: prove the arguments satisfy the function's precondition.
2. After the call: the result variables satisfy the postcondition (with parameter/result renaming).

---

## Quantifiers and Hidden Operations

Use quantifiers to express specifications concisely. Each has a **neutral element** (value on empty domain):

| Quantifier | Symbol | Neutral | Type    | Description |
|------------|--------|---------|---------|-------------|
| Summation  | Σ      | 0       | numeric | Sum over domain |
| Product    | Π      | 1       | numeric | Product over domain |
| Universal  | ∀      | true    | boolean | Conjunction (and) over domain |
| Existential| ∃      | false   | boolean | Disjunction (or) over domain |
| Counter    | N      | 0       | natural | Count where predicate holds |
| Maximum    | MAX    | —       | numeric | Max value over domain |
| Minimum    | MIN    | —       | numeric | Min value over domain |

**Splitting a quantifier** — separate one element from the domain and combine with the binary operation:
```
Σ(a: 1≤a≤n: f(a)) = Σ(a: 1≤a≤n-1: f(a)) + f(n)
MAX(a: 1≤a≤n: f(a)) = max(MAX(a: 1≤a≤n-1: f(a)), f(n))
```

The neutral element defines the base case for recursion and the initialization for iteration.

---

## Algebraic Data Types

When using a data type, reason through its **algebraic specification**:

1. **Signature:** Types (genres) and operations with their arities.
2. **Equations:** Algebraic identities that define operation behavior.
3. **Constructors:** Minimal set of operations that can build any value of the type (used as the basis for induction).

### Common Structures

**List:** Constructors `[]` (empty) and `e:l` (cons). Operations: `++` (concat), `length`.
```
[] ++ l₂ ≡ l₂
(e:l₁) ++ l₂ ≡ e:(l₁ ++ l₂)
length([]) ≡ 0
length(e:l) ≡ 1 + length(l)
```

**Stack (LIFO):** Constructors `empty_stack` and `push(e, s)`. Operations: `top`, `pop`, `is_empty`.
```
top(empty_stack) ≡ error
top(push(e, s)) ≡ e
pop(push(e, s)) ≡ s
is_empty(empty_stack) ≡ true
is_empty(push(e, s)) ≡ false
```

**Queue (FIFO):** Constructors `empty_queue` and `enqueue(e, q)`. Operations: `front`, `dequeue`, `is_empty`.

**Binary Tree:** Constructors `empty_tree` and `plant(e, left, right)`. Operations: `root`, `left`, `right`, `is_empty`, `height`, `size`.
```
height(empty_tree) ≡ 0
height(plant(e, a₁, a₂)) ≡ 1 + max(height(a₁), height(a₂))
size(plant(e, a₁, a₂)) ≡ 1 + size(a₁) + size(a₂)
```

**Table/Map:** Constructors `create` and `assign(t, index, value)`. Operations: `lookup`, `defined`.

Use the constructor set to identify the **induction structure** of each type.

---

## Principle of Induction

To prove properties of data types, identify the **constructors** and reason by structural induction:

```
[P(base) ∧ ∀x (P(smaller(x)) ⟹ P(x))] ⟹ ∀z P(z)
```

- **Base case:** Prove the property for values built with nullary constructors (empty list, empty stack, etc.).
- **Inductive step:** Assuming the property holds for all sub-structures, prove it for the composed structure.

A **well-founded preorder** (noetherian) is required: no infinite strictly decreasing sequences exist. This guarantees that induction and recursion terminate.

---

## Recursive Programs

### Pattern

Every recursive function follows this structure:

```
function f(x) returns r
  {Pre: Q(x)}
  if d(x) →          // direct case
    r := h(x)
  ¬d(x) →            // recursive case
    v := f(s(x))
    r := c(x, v)
  end if
  {Post: R(x, r)}
  return r
```

### Verification Steps

1. **Direct case correctness:** `Q(x) ∧ d(x) ⟹ R(x, h(x))`
2. **Recursive case — legal call:** `Q(x) ∧ ¬d(x) ⟹ Q(s(x))` (precondition holds for recursive argument)
3. **Recursive case — correctness:** `Q(x) ∧ ¬d(x) ∧ R(s(x), v) ⟹ R(x, c(x, v))`
4. **Bounding function `t(x)`:** Define `t: params → ℕ` such that:
   - `Q(x) ⟹ t(x) ∈ ℕ` (always a natural number)
   - `Q(x) ∧ ¬d(x) ⟹ t(s(x)) < t(x)` (strictly decreases at each recursive call)

### Bounding Function Heuristics

| Parameter type | Typical bounding function |
|---------------|--------------------------|
| Natural number `n` decreasing | `n` itself |
| Two naturals, one always decreases | `m + n` |
| Two naturals, one decreases, other grows but never reaches it | `max(m, n)` |
| Boolean `b` changing `true → false` | `if b then 1 else 0` |
| Boolean `b` changing `false → true` | `1 - (if b then 1 else 0)` |
| Stack | `height(stack)` |
| Queue | `length(queue)` |
| Binary tree | `size(tree)` or `height(tree)` |
| List | `length(list)` |
| Interval `[i, j]` shrinking | `j - i` |

### Recursion Types

- **Linear recursion:** Each call generates at most one recursive call.
- **Multiple recursion:** A call may generate more than one recursive call (e.g., tree traversals).

### Methodology for Designing Recursive Programs

1. **Specify** the function: header, precondition, postcondition.
2. **Identify the bounding function** `t(x)` — the expression for induction over ℕ.
3. **Analyze cases:** Identify at least one direct case and one recursive case. Ensure all cases are covered.
4. **Program and verify each case.** For recursive cases, assume (by induction hypothesis) that recursive calls satisfy the specification.
5. **Validate termination:** Prove `t(x)` decreases strictly at each recursive call.

---

## Algorithm Immersion (Generalization)

When a direct recursive solution is not found, not efficient, or hard to reason about, **generalize** the function by adding parameters and/or results. This is called **immersion**.

### Techniques

#### Strengthen the Precondition
1. **Weaken the postcondition** (possibly introducing new variables).
2. **Strengthen the precondition** with the weakened postcondition — require a partial version of the result as input.
3. **Add immersion parameters** so the new precondition makes sense.
4. **Keep the original postcondition.**

The weakened postcondition provides ideas for:
- **Base case guard:** The condition that "inverts" the weakening.
- **Recursive case:** Only immersion parameters change between calls → **tail recursion** with constant postcondition.

#### Weaken the Postcondition
1. Introduce new variables replacing sub-expressions in the postcondition.
2. Drop some equalities → weaker requirement.
3. The dropped equalities become the **initializations** to recover the original function from the immersion.
4. Strengthen the precondition with domain conditions on the new parameters as needed.

#### Efficiency Immersion
When a complex expression `f(x)` must be recomputed at every recursive call:
- **As extra result:** Add `w = f(x)` to the postcondition. After a recursive call with `s(x)`, update `w` from `f(s(x))` to `f(x)`.
- **As extra parameter:** Add `w = f(x)` to the precondition. Use `w` instead of computing `f(x)`. When making recursive calls, compute the new parameter value from the current `w`.

#### Unfold/Fold Technique (Tail Recursion Transformation)
Transform linear recursion into tail recursion:

1. Given `f(x) = c(f(s(x)), x)` (linear recursive case), define immersion `g(y, w) = c(f(y), w)`.
2. **Unfold:** Substitute `f`'s cases into `g`'s definition.
3. **Fold:** Manipulate the expression back into `g`'s form.
4. The result is a tail-recursive `g`, with `f(x) = g(x, neutral)` where `neutral` is the identity element of `c`.

---

## Iterative Programs (Loops)

### While Loop Semantics

```
{Invariant I}
while B do
  S
end while
{Post: Q}
```

### Verification (Two Phases)

**Phase 1 — Partial Correctness:**
1. Define an **invariant** `I`: a condition that holds at the start of every iteration.
2. **Initialization:** `Pre ⟹ I` (the precondition implies the invariant).
3. **Maintenance:** `{I ∧ B} S {I}` (the body preserves the invariant).
4. **Exit:** `I ∧ ¬B ⟹ Post` (invariant + loop exit condition implies postcondition).

**Phase 2 — Termination:**
1. Define a **bounding function** `t` with values in ℕ.
2. **Bounded:** `I ∧ B ⟹ t > 0`.
3. **Decreasing:** `{I ∧ B ∧ t = T} S {t < T}` (the body strictly decreases the bound).

### Transformation: Tail Recursion → Iteration

A tail-recursive function with **constant postcondition** transforms directly into a while loop:

| Recursive element | Iterative element |
|-------------------|-------------------|
| Precondition of immersed function | Loop **invariant** |
| Bounding function (preorder) | Loop **bounding function** |
| Immersion parameters | Loop **local variables** |
| Recursive case guard | Loop **condition** `B` |
| Parameter update in recursive call | Loop **body** |
| Direct case body | Code **after** the loop |
| Initial call arguments | Loop **initialization** (before the while) |

### Direct Iterative Derivation

1. The **invariant core** is typically a weakened postcondition.
2. Design guarded instructions that **preserve** the invariant and **decrease** the bounding function.
3. Sufficient cases are covered when: `Invariant ∧ ¬(B₁ ∨ B₂ ∨ ... ∨ Bₙ) ⟹ Post`.

---

## Workflow Summary

When writing any function, follow this process:

1. **Specify:** Write precondition and postcondition. Identify input/output types.
2. **Analyze the postcondition:** Determine if the solution requires assignment, conditionals, recursion, or iteration.
3. **Choose strategy:**
   - Simple postcondition with equalities → direct assignment/composition.
   - Disjunctions → conditional/alternative.
   - Inductive structure → recursion or iteration.
4. **For recursive solutions:**
   - Identify cases (direct + recursive).
   - Define bounding function.
   - Verify each case.
   - Consider immersion if needed for efficiency or tail recursion.
5. **For iterative solutions:**
   - Derive invariant (weakened postcondition).
   - Define bounding function.
   - Design loop body that preserves invariant and decreases bound.
   - Set initializations and post-loop code.
6. **Verify:** Ensure all proof obligations are met — or derive code so they hold by construction.

---

## Applying This Skill

When generating or reviewing code in **any language**:

- Always think in terms of **preconditions and postconditions**, even if the language doesn't enforce them. Document them as comments, assertions, type constraints, or contracts.
- Use **assertions/contracts** available in the language (`assert`, `require`, `ensure`, design-by-contract libraries, property-based tests) to encode pre/post conditions.
- When designing recursive functions, **explicitly identify** the bounding function and verify termination.
- When designing loops, **explicitly state the invariant** and bounding function.
- Prefer **deriving** code from specifications over writing code and testing afterwards.
- When a recursive solution is not tail-recursive, consider **immersion** techniques to transform it.
- Use **algebraic reasoning** over data structures: define operations by their equations, reason by structural induction.
- Encode bounding functions as **decreasing measures** where the language supports it (e.g., Dafny's `decreases`, Coq's structural recursion, or manual assertions).
