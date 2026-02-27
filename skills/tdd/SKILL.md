---
name: tdd
description: Follow test-driven development with the red-green-refactor loop. Write failing tests first, make them pass with minimal code, then refactor. Covers unit and integration test strategies across Python, JavaScript/TypeScript, Go, and other languages.
---

# Test-Driven Development (TDD)

Write tests before writing implementation code. The red-green-refactor loop keeps your design honest, your coverage real, and your refactoring safe. This skill is language-agnostic — the cycle and strategies apply whether you're writing Python, TypeScript, Go, Java, or anything else.

## The Red-Green-Refactor Loop

Every change follows three phases:

1. **Red — Write a failing test.** Express the desired behavior as a test that fails right now because the code doesn't exist yet. The test should fail for the right reason (missing behavior, not a setup error or syntax problem). Run it; confirm it is red.

2. **Green — Make it pass with the minimum code.** Write the simplest implementation that makes the test pass. Resist adding anything beyond what the test demands. Hardcoding a return value is fine here — subsequent tests will force a real implementation.

3. **Refactor — Improve without changing behavior.** Clean up duplication, rename for clarity, extract abstractions, optimize where justified. The tests must stay green. Commit only after the tests pass.

Repeat. Each cycle is small — typically 2–10 minutes. If a cycle grows long, the test is too large; break it down.

---

## Unit Tests

Unit tests target a single unit of behavior — one function, method, or class — in isolation from its dependencies.

### Principles

- **One behavior per test.** A test that checks five things is five tests waiting to be separated. When one fails you want to know exactly which behavior broke.
- **Arrange-Act-Assert.** Structure every test: set up state, call the unit under test, assert on the outcome. Keep each phase visible.
- **Name tests after behavior.** `test_returns_empty_list_when_no_results` beats `test_search_2`. The name is the first line of documentation.
- **Isolate dependencies.** Use fakes, stubs, or mocks for I/O, databases, time, randomness, or any external service. A unit test should pass without a network, disk, or clock.
- **Keep tests fast.** Unit tests should run in milliseconds. Slow tests stop being run continuously.

### Examples

**Python (pytest)**

```python
# test_cart.py
def test_total_is_zero_for_empty_cart():
    cart = Cart()
    assert cart.total() == 0

def test_total_reflects_added_items():
    cart = Cart()
    cart.add(Item("book", price=12.00))
    cart.add(Item("pen", price=1.50))
    assert cart.total() == 13.50
```

**JavaScript/TypeScript (Jest or Vitest)**

```typescript
// cart.test.ts
it("returns 0 for an empty cart", () => {
  const cart = new Cart();
  expect(cart.total()).toBe(0);
});

it("sums prices of added items", () => {
  const cart = new Cart();
  cart.add({ name: "book", price: 12.0 });
  cart.add({ name: "pen", price: 1.5 });
  expect(cart.total()).toBe(13.5);
});
```

**Go (testing package)**

```go
// cart_test.go
func TestEmptyCartTotal(t *testing.T) {
    cart := NewCart()
    if cart.Total() != 0 {
        t.Errorf("expected 0, got %v", cart.Total())
    }
}

func TestCartTotalSumsPrices(t *testing.T) {
    cart := NewCart()
    cart.Add(Item{Name: "book", Price: 12.00})
    cart.Add(Item{Name: "pen", Price: 1.50})
    if cart.Total() != 13.50 {
        t.Errorf("expected 13.50, got %v", cart.Total())
    }
}
```

---

## Integration Tests

Integration tests verify that multiple units work together correctly — a service talking to a real database, an HTTP handler wired to actual business logic, two modules interacting end-to-end.

### Principles

- **Test at a boundary.** Integration tests are most valuable at explicit seams: HTTP endpoints, database queries, message queue consumers, external API clients. Don't write integration tests for internal logic — that's what unit tests are for.
- **Use real dependencies where practical.** Spin up a real database (in-memory or containerized) rather than mocking every SQL call. The point is to test the interaction, not your mock's correctness.
- **Isolate test data.** Each test starts from a known state (empty table, seeded fixtures). Use transactions that roll back or recreate state per test.
- **Keep the integration test suite separate.** Mark or organize them so you can run unit tests in a second and integration tests in a separate step (pre-commit, CI).
- **Don't duplicate unit-test logic.** If unit tests already cover the business rule, the integration test only needs to confirm the plumbing connects correctly.

### Examples

**Python (pytest + SQLAlchemy)**

```python
# test_order_repository.py
def test_saves_and_retrieves_order(db_session):
    repo = OrderRepository(db_session)
    order = Order(customer_id=42, total=99.00)
    repo.save(order)
    retrieved = repo.find_by_customer(42)
    assert retrieved.total == 99.00
```

**TypeScript (supertest + Express)**

```typescript
// orders.integration.test.ts
it("POST /orders creates an order and returns 201", async () => {
  const response = await request(app)
    .post("/orders")
    .send({ customerId: 42, total: 99.0 });
  expect(response.status).toBe(201);
  expect(response.body.id).toBeDefined();
});
```

**Go (net/http/httptest)**

```go
// orders_handler_test.go
func TestCreateOrderReturns201(t *testing.T) {
    body := strings.NewReader(`{"customerId":42,"total":99.0}`)
    req := httptest.NewRequest(http.MethodPost, "/orders", body)
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    NewRouter(realDB).ServeHTTP(w, req)
    if w.Code != http.StatusCreated {
        t.Errorf("expected 201, got %d", w.Code)
    }
}
```

---

## TDD Workflow

When implementing any feature or fixing any bug:

1. **Understand what behavior is needed.** Write it down in plain language before touching code.
2. **Write the smallest failing test** that captures one piece of that behavior. Run it — confirm it is red.
3. **Write the minimum code** to make it green. No more. Run the full test suite — confirm everything is green.
4. **Refactor.** Remove duplication, improve names, extract helpers. Run tests after each change — stay green.
5. **Repeat** with the next piece of behavior.

When fixing a bug:

1. **Write a test that reproduces the bug.** The test must fail before your fix.
2. Fix the code. The test turns green.
3. Ensure no other tests regressed.

---

## Test Organization

| Test type | Location | When to run |
|-----------|----------|-------------|
| Unit | `tests/unit/` or next to source | On every file save; always before commit |
| Integration | `tests/integration/` | On commit; in CI before merge |
| End-to-end | `tests/e2e/` | In CI; optionally pre-deploy |

Keep the test pyramid in mind: many unit tests, fewer integration tests, very few end-to-end tests. Unit tests are fast and precise; integration tests catch wiring bugs; end-to-end tests protect critical user journeys.

---

## What to Test

Test behavior visible from the outside of the unit, not internal implementation. Ask: *if I refactor the internals without changing behavior, should this test break?* If yes, the test is too coupled to implementation — rewrite it against the public interface.

Test the unhappy paths explicitly: empty inputs, boundary values, error conditions. These are where behavior is most often underspecified and most often wrong.

Do not test:
- Language or framework features (the framework's tests cover those).
- Simple getters/setters with no logic.
- Code generated entirely by a third-party tool.

---

## Applying This Skill

When writing or reviewing code:

- **Never write implementation code without a failing test first** unless the code is configuration, scaffolding, or generated.
- **Keep each red-green-refactor cycle small.** If you've been red for more than a few minutes, the test is too large.
- **Treat a failing test as a specification.** The test describes the contract; the implementation fulfills it.
- **Refactor only on green.** Moving code while tests are failing conflates two problems.
- **Delete or update tests when behavior changes intentionally.** A passing test for a removed feature is misleading.
