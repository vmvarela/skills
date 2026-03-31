---
name: pragmatic-build
description: Guide the build phase of software development. Use when writing, testing, or refactoring code — to eliminate duplication, decouple modules, program deliberately, crash early on impossible states, drive design through tests, and refactor continuously. Based on the principles from The Pragmatic Programmer.
---

# Pragmatic Code Constructor

Most software problems are self-inflicted. Duplication that makes changes ricochet across the codebase. Coupling that turns a one-line fix into a week-long archaeology expedition. Code that "works" but nobody — including the author — knows why. This skill exists to prevent all three.

The principles here come from *The Pragmatic Programmer* by Hunt and Thomas. The goal is not to write clever code but to write code you can trust, change, and hand off without apology.

## Core Principles

### 1. DRY — Don't Repeat Yourself

Every piece of knowledge has exactly one authoritative home in the system. Not two files that both know the shape of a User, not a comment that restates what the code already says, not a test that duplicates the validation logic it is testing.

The problem with duplication is not aesthetic — it is that when the knowledge changes, you now have multiple places to update and no way to guarantee you found them all. A schema migration that requires coordinated changes in four files is a DRY violation waiting to bite you.

When you find yourself copying and pasting, stop. Ask: where should this knowledge live, and how do I give it a single home?

### 2. Orthogonality & Decoupling

Two things are orthogonal when changing one has no effect on the other. Your database layer changing from Postgres to SQLite should not require changes to your business logic. Your UI changing from REST to GraphQL should not touch your domain model.

**Tell, Don't Ask.** Do not retrieve an object's state to make a decision, then update the object. Push the decision into the object itself. This is the difference between:

```python
# Ask (bad): caller reaches into order to decide
if order.is_paid() and order.items_in_stock():
    order.status = "confirmed"

# Tell (good): order knows how to confirm itself
order.confirm()
```

**Avoid train wrecks.** `user.account().wallet().balance()` chains three dependencies into a single expression. Any of those three can change shape and your code breaks. Reach for the thing you actually need, or design the enclosing object to expose it directly.

**Global data is coupling in disguise.** Every module that reads global state is now dependent on everything that writes it. Make dependencies explicit through parameters and constructors.

### 3. Program Deliberately

Coincidental programming is writing code that works on your machine today for reasons you do not fully understand. It will fail in production for reasons you understand even less.

Before writing a block of code, know:
- What you expect the inputs to be and their valid ranges
- What algorithm or sequence of steps you are intentionally following
- What the expected output or side effect is
- Which assumptions this code depends on

If you cannot answer those questions, you are guessing. Guessing produces code that passes tests until the edge case you never imagined shows up in production at 2am.

Document your assumptions as assertions (see next section) rather than comments — assertions are checked at runtime; comments are not.

### 4. Crash Early & Assertive Programming

A program that detects an impossible state and terminates is far safer than one that continues with corrupted data and produces a wrong answer ten steps later. The first failure is loud and located. The second is silent and misleading.

Use assertions to encode your assumptions:

```python
def process_payment(amount: float, account: Account) -> None:
    assert amount > 0, f"Payment amount must be positive, got {amount}"
    assert account.is_active(), f"Cannot charge inactive account {account.id}"
    # ... rest of the implementation
```

Assertions are not error handling for expected failures — use exceptions for those. Assertions are for things that should be impossible: a sorted list that is not sorted, a non-null field that is null, a state machine in a state it was never supposed to reach.

Never disable assertions in production. If assertions are too slow, you have a performance problem to fix, not an assertion problem to suppress.

### 5. Test to Code

A test is the first caller of your code. If the test is awkward to write — too many things to set up, too many private details to reach into, too hard to describe what success looks like — that is feedback about the design, not the test.

**Write tests before the core logic**, not to follow a process, but to force yourself to think about the interface from the caller's side before you are invested in an implementation.

**Test state coverage, not just line coverage.** 100% line coverage with happy-path inputs tells you nothing about what happens at the boundaries. Cover:
- Minimum and maximum valid inputs
- The first and last element of a collection
- Empty collections and null inputs
- Inputs that should trigger error paths

**Every escaped bug gets a test.** When a bug reaches production, the first fix is to write the test that would have caught it. Then fix the code. Now that class of bug cannot return silently.

### 6. Continuous Refactoring

Code is not construction — you do not pour a foundation and build walls that must stand forever. It is closer to gardening: organic, living, requiring regular maintenance to stay healthy.

Refactor when you see:
- **Duplication** — knowledge with more than one home
- **Non-orthogonal design** — a change in one place requiring changes in unrelated places
- **Outdated knowledge** — code that no longer reflects the current understanding of the domain
- **Performance problems** — once you have correct behavior and tests to protect it
- **Broken windows** — bad names, dead code, commented-out blocks, TODO comments older than a sprint

Refactoring rules: keep the tests green, change structure not behavior, commit small. Do not refactor and add features in the same commit — you will not be able to tell which change broke something.

"Fix broken windows immediately." A single ugly function that nobody wants to touch signals that standards are optional, and standards that are optional will not be maintained.

### 7. Balance Resources

Every resource you acquire — file handles, network connections, locks, allocated memory, database transactions — must be released by the same scope that acquired it. If the function opens a file, the function closes it. If the constructor allocates, the destructor frees.

Use language constructs that enforce this automatically:

```python
# Balanced: context manager guarantees close() even on exception
with open("data.csv") as f:
    process(f)

# Unbalanced: exception between open and close leaks the handle
f = open("data.csv")
process(f)   # if this raises, f is never closed
f.close()
```

When a function acquires multiple resources, release them in the reverse order of acquisition. When two functions share responsibility for a resource, ownership must be explicit in the interface — not implicit in convention.

## Build Execution Workflow

Work through these steps for each feature or fix.

**1. Tracer bullet first.**
Before building the full feature, get the thinnest possible end-to-end path working: a real request hitting a real handler returning a real (even stub) response. This validates that all the layers connect before you invest in any one layer's details.

**2. Write tests to drive the interface.**
Write the test for the function you are about to implement. Let the awkwardness of the test tell you if the interface is wrong before the implementation exists to make it harder to change.

**3. Implement deliberately.**
Write the logic with your assumptions visible as assertions, your resource acquisitions paired with releases, and your algorithm chosen — not guessed at.

**4. Refactor while green.**
With passing tests, look at the code you just wrote with fresh eyes. Is there duplication? Are there orthogonality violations the working implementation made visible? Fix them now, while context is fresh and tests protect you.

**5. Commit clean.**
All tests pass, no broken windows, no dead code. The commit message explains *why* the change was made, not just what changed.
