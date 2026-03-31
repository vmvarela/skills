---
name: strategic-planning
description: Guide the planning phase of software development. Use when designing system architecture, planning modules, defining interfaces, or making any structural decision — to minimize complexity through deep abstractions, information hiding, and long-term maintainability over quick tactical fixes.
---

# Strategic Software Design Planner

Software rots because of accumulated tactical decisions — each one small and reasonable at the time, together turning a clean system into a tangle of workarounds. This skill pushes back. It teaches agents to treat design as an investment, favoring simple interfaces over simple implementations, and deep abstractions over shallow wrappers.

The ideas here come from John Ousterhout's *A Philosophy of Software Design*. The goal is not ceremony — it is to spend the 10–20% of planning time that prevents the next 80% of maintenance pain.

## Core Principles

### 1. Strategic over Tactical Programming

Tactical programming is writing something that works *right now*. Strategic programming is writing something that is easy to change *six months from now*.

Every design decision is an investment. Ask: does this choice reduce future complexity, or does it just move it somewhere else? Allocate 10–20% of effort to finding the cleanest design — not because it is perfectionist, but because debt compounds faster than features.

### 2. Design Deep Modules

A module is **deep** when its interface is simple relative to the functionality it provides. A module is **shallow** when the interface cost approaches or exceeds the abstraction benefit.

The Unix file I/O interface (`open`, `read`, `write`, `close`) is five functions that hide tens of thousands of lines of filesystem and device complexity. That is the target. When designing a module, ask: what is the simplest interface that still lets callers ignore everything they do not need to know?

Shallow modules — thin wrappers, pass-through adapters, one-line methods with five-word names — add interface complexity without reducing cognitive load. Avoid them.

### 3. Information Hiding & Leakage Prevention

Every module should own its design decisions completely. If the same knowledge (a data format, a protocol detail, a configuration structure) appears in two modules, you have a leakage problem. Changes to that knowledge will require changes in multiple places.

**Temporal decomposition** is the most common source of leakage: structuring code around *when* things happen (read → parse → validate → store) rather than around *what information belongs together*. When you see a chain of small modules each responsible for one step, look for the information they share — that shared information should probably live in one place.

### 4. Somewhat General-Purpose Interfaces

The interface should be slightly more general than the current use case requires. Not wildly generic, not a framework — just enough that a second caller would not need you to change the signature.

Highly specialized behavior belongs in the application layer (above) or in a driver (below). Core modules stay generic. When you find yourself adding a parameter that only one caller will ever set, that parameter is a sign the caller should be doing more work itself.

### 5. Pull Complexity Downwards

When there is a choice between a complex implementation and a complex interface, choose the complex implementation. The implementation pain is paid once, by you, now. The interface pain is paid repeatedly, by every caller, forever.

Configuration parameters are a common violation: exporting a tunable that exists only because you did not want to decide a default forces every caller to understand an internal tradeoff they should never have seen. Decide the default. If it needs to be overridable, make overriding it rare and explicit.

### 6. Define Errors Out of Existence

Exception handling is complexity that callers cannot avoid. Design APIs so that the normal flow handles the common case cleanly, with no exception needed.

Techniques:
- **Redefine semantics**: `delete(file)` that succeeds even when the file does not exist. The caller wanted the file gone — it is gone.
- **Mask at a low level**: retry a transient network failure inside the module rather than surfacing it.
- **Aggregate**: rather than raising on the first validation error, collect all errors and return them together.

When an exception is genuinely unavoidable, keep it close to where the information exists to handle it. Do not propagate it upward until it becomes someone else's problem.

### 7. Design It Twice

The first design you think of is rarely the best one. It is the most obvious one, which is different.

For every major interface or module boundary, rough out two radically different approaches. They do not need to be complete — sketching the signatures and a paragraph of trade-offs is enough. Then choose, or combine the best elements. The discipline of inventing the second option forces you to understand the problem better than the first option alone allows.

### 8. Documentation-Driven Design

Write the interface comment before writing the implementation. If the comment requires more than three sentences to describe what the method does, the abstraction is probably wrong. A long comment is not a documentation problem — it is a design signal.

Good interface comments describe:
- What the abstraction *is*, not how it is implemented
- What each argument means and its valid range
- What the method guarantees after it returns (postcondition)
- What side effects the caller must know about

If you find yourself writing "this method does X except when Y, in which case it does Z, unless W is set" — stop and redesign the interface.

## Planning Execution Workflow

Work through these steps before touching any implementation.

**1. Decompose by information, not by execution order.**
List the distinct pieces of knowledge the system must manage. Each piece should map to one module. If two modules need the same information to do their job, they should probably be one module or one should own the information and expose it.

**2. Design each interface twice.**
For each module boundary, sketch two different interface signatures. Write a one-line summary of each trade-off. Choose the deeper one.

**3. Draft interface comments before any code.**
For each class and public method, write the comment first. If you cannot write it cleanly in three sentences, iterate on the interface — not the comment.

**4. Audit for error elimination.**
For each exception the current design would raise, ask whether the module's semantics can be redefined to make it unnecessary. If not, decide whether to mask, aggregate, or expose — and document the choice.

**5. Check layer abstraction.**
Each architectural layer should provide an abstraction that is meaningfully different from the layers above and below it. If a layer is mostly forwarding calls with minor changes, it is probably not carrying its weight. Either push its logic into an adjacent layer or find the hiding it should be doing.
