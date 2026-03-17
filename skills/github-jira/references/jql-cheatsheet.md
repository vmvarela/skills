# JQL Cheatsheet

Ready-to-use JQL queries. Replace `<PROJECT_KEY>` with your project key and
`<COMPONENT>` with your component name where applicable.

---

## Backlog and planning

```jql
-- Full project backlog
project = <PROJECT_KEY> AND sprint is EMPTY AND statusCategory != Done ORDER BY priority ASC, created ASC

-- Backlog filtered by component (one repository)
project = <PROJECT_KEY> AND sprint is EMPTY AND component = <COMPONENT> AND statusCategory != Done ORDER BY priority ASC

-- Tickets ready for next sprint (refined)
project = <PROJECT_KEY> AND sprint is EMPTY AND label = "ready" AND statusCategory != Done ORDER BY priority ASC

-- Unassigned tickets in backlog
project = <PROJECT_KEY> AND sprint is EMPTY AND assignee is EMPTY AND statusCategory != Done ORDER BY priority ASC

-- Active epics
project = <PROJECT_KEY> AND issuetype = Epic AND statusCategory != Done ORDER BY priority ASC
```

---

## Active sprint

```jql
-- Full active sprint
project = <PROJECT_KEY> AND sprint in openSprints() ORDER BY status ASC, priority ASC

-- Active sprint for my component
project = <PROJECT_KEY> AND sprint in openSprints() AND component = <COMPONENT> ORDER BY status ASC

-- What is "In Progress" right now
project = <PROJECT_KEY> AND sprint in openSprints() AND status = "In Progress"

-- What hasn't been started yet
project = <PROJECT_KEY> AND sprint in openSprints() AND status in ("To Do", "Backlog")

-- Completed in the current sprint
project = <PROJECT_KEY> AND sprint in openSprints() AND statusCategory = Done

-- My tickets in the active sprint
project = <PROJECT_KEY> AND sprint in openSprints() AND assignee = currentUser()
```

---

## Blockers and risk

```jql
-- Blocked tickets
project = <PROJECT_KEY> AND sprint in openSprints() AND label = blocked

-- Tickets not updated in more than 3 days (potential silent blockers)
project = <PROJECT_KEY> AND sprint in openSprints() AND status = "In Progress" AND updated <= -3d

-- Critical or high priority tickets without assignee
project = <PROJECT_KEY> AND priority in (Highest, High) AND assignee is EMPTY AND statusCategory != Done

-- Open high-priority bugs
project = <PROJECT_KEY> AND issuetype = Bug AND priority in (Highest, High) AND statusCategory != Done ORDER BY priority ASC
```

---

## Releases and versions

```jql
-- Tickets in a specific version
project = <PROJECT_KEY> AND fixVersion = "v1.2.0"

-- Completed tickets with no version assigned (pending release tagging)
project = <PROJECT_KEY> AND statusCategory = Done AND fixVersion is EMPTY

-- Tickets going into the next release (completed in active sprint)
project = <PROJECT_KEY> AND sprint in openSprints() AND statusCategory = Done AND fixVersion is EMPTY

-- Version history: what was delivered
project = <PROJECT_KEY> AND fixVersion = "v1.2.0" AND statusCategory = Done ORDER BY issuetype ASC
```

---

## Text and label searches

```jql
-- Search by text in summary or description
project = <PROJECT_KEY> AND text ~ "authentication" ORDER BY updated DESC

-- Tickets with a specific label
project = <PROJECT_KEY> AND label = "retrospective"

-- Tickets of a specific type in the sprint
project = <PROJECT_KEY> AND sprint in openSprints() AND issuetype = Bug

-- Subtasks of a parent ticket
parent = <PROJECT_KEY>-123
```

---

## Metrics and reports

```jql
-- Tickets closed in the current sprint
project = <PROJECT_KEY> AND sprint in openSprints() AND statusCategory = Done ORDER BY resolutiondate DESC

-- Tickets created this week
project = <PROJECT_KEY> AND created >= startOfWeek() ORDER BY created DESC

-- Carryover: tickets from the previous sprint not completed
project = <PROJECT_KEY> AND sprint in closedSprints() AND statusCategory != Done ORDER BY sprint DESC

-- Velocity: completed in the last 3 sprints
project = <PROJECT_KEY> AND sprint in closedSprints() AND statusCategory = Done AND sprint in (lastSprint(), lastSprint(-1), lastSprint(-2))
```

---

## Component filters (multi-repo)

When each component represents a repository, these filters are useful for
focusing on a specific team or repo:

```jql
-- Active sprint for a specific component
project = <PROJECT_KEY> AND sprint in openSprints() AND component = <COMPONENT>

-- Backlog for a component, ordered by priority
project = <PROJECT_KEY> AND sprint is EMPTY AND component = <COMPONENT> AND statusCategory != Done ORDER BY priority ASC

-- All open bugs for a component
project = <PROJECT_KEY> AND issuetype = Bug AND component = <COMPONENT> AND statusCategory != Done ORDER BY priority ASC
```

---

## JQL quick reference

- `sprint in openSprints()` → current active sprint
- `sprint in closedSprints()` → already closed sprints
- `statusCategory` has 3 values: `"To Do"`, `"In Progress"`, `"Done"` (independent of your board's state names)
- `currentUser()` → the authenticated user
- `startOfWeek()`, `startOfMonth()` → relative dates
- `-3d` → 3 days ago (also `-1w`, `-1h`)
- `~` → text search (contains)
- `=` → exact match
- `is EMPTY` / `is not EMPTY` → null fields
