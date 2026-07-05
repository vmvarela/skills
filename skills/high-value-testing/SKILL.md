---
name: high-value-testing
description: Guide the code review and testing phase. Use when evaluating code for testability, designing unit tests, or looking for edge cases — to ensure tests resist refactoring, provide fast feedback, and actually catch bugs rather than just padding coverage metrics.
---

# The Testing Oracle

Most test suites are liabilities disguised as assets. They break when you refactor internal logic, they take too long to run, and they still let critical edge cases slip into production. This skill pushes back. It treats testing not as a verification chore, but as an intellectual investigation into software risk and a strict audit of system design.

The ideas here synthesize Vladimir Khorikov's *Unit Testing*, Elisabeth Hendrickson's *Explore It!*, and Cem Kaner's *Lessons Learned*. The goal is simple: achieve 90% confidence with 10% effort by writing tests that actually matter.

## Core Principles

### 1. Refactoring Resistance (The Golden Rule)

A test is only valuable if it gives you the confidence to change the code. If you refactor the internal implementation of a function—without changing its observable output—and your test breaks, you have a **false positive**. 

False positives destroy trust in the test suite. Never write tests that couple themselves to implementation details. Do not verify *how* the code does its job (e.g., checking if a specific internal method was called three times); verify *what* the code produces (the final state or the returned value). 

### 2. Testability is a Design Smell

If a piece of code is hard to test, the problem is rarely the testing framework; the problem is the code's design. 

Before writing a single assertion, look at the dependencies. If a function reaches out to a database, reads the system clock, and mutates a global variable, testing it will be a nightmare. Use testing as a design pressure tool: force the separation of business logic (pure, easily testable) from infrastructure logic (impure, requires integration tests).

### 3. Heuristics over Happy Paths

Automated tests check what you already know. Bugs live in the things you didn't think about. Use exploratory heuristics to actively try to break the code:
- **Data boundaries:** What happens with `null`, empty strings, maximum integer values, or negative numbers?
- **Time and State:** What if this function is called twice in a row? What if the network times out? What if the events arrive out of order?
- **External Dependencies:** Assume every third-party API will eventually return garbage, fail silently, or take 30 seconds to respond. How does the code handle it?

### 4. High-Value over High-Coverage

100% line coverage is a vanity metric. A test that covers 50 lines of simple getters/setters provides less value than a single test covering a complex 5-line state transition.

Prioritize tests based on risk. Ask: *"What is the absolute worst thing that could go wrong in this module?"* Write a test for that. Leave trivial code untested if the cost of testing it exceeds the cost of it failing.

### 5. Mocks are a Last Resort

Over-mocking leads to fragile tests that pass even when the real system is broken. Only use mocks for out-of-process dependencies that you do not control (like a third-party payment gateway or an external email service). 

For internal dependencies, prefer using the real objects. If the real objects are too heavy to use in a unit test, that is a signal to refactor them (see Principle 2).

## Testing Execution Workflow

Work through these steps when reviewing code or planning a test suite.

**1. Risk Analysis.**
Identify the top three critical risks in the code snippet. What assumptions is the code making about its inputs, state, or external dependencies? Document what happens if those assumptions are violated.

**2. Testability Audit.**
Critique the design before writing tests. Identify hidden dependencies, side effects, or temporal coupling. Suggest architectural refactors (like injecting dependencies or extracting pure functions) that would make the code trivial to test.

**3. Exploratory Attack.**
Generate a list of edge cases using Hendrickson's heuristics. Do not stop at "invalid email format." Think maliciously: overflow the buffer, pass unexpected data types, simulate async race conditions. 

**4. Design High-Value Tests.**
Define a minimal set of tests (usually 1-2 integration tests and a handful of unit tests) that provide maximum safety. Focus entirely on the observable end-state and reject any test that would fail if the internal variables were simply renamed.

**5. Mental Mutation Testing.**
Play devil's advocate. If a developer accidentally changed a `<` to a `<=` in the core logic, would the proposed tests catch it? If the answer is no, the tests are incomplete.
