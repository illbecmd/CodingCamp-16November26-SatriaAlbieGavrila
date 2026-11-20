# Implementation Plan: TODO List Dashboard

## Overview

Implement a zero-dependency, single-page dashboard as three files (`index.html`, `css/style.css`, `js/app.js`). The plan follows the module structure from the design: `StorageManager` first, then each widget, wired together at the end. Property-based tests use [fast-check](https://fast-check.dev/) via `npx`.

---

## Tasks

- [x] 1. Scaffold project files and define core data contracts
  - Create `index.html` with the four widget sections (`#greeting`, `#timer`, `#task-list`, `#quick-links`) and `#storage-banner`
  - Create `css/style.css` with the base typographic scale (heading ≥ 1.25× body), color tokens meeting WCAG 2.1 AA 4.5:1 contrast, and layout grid for 360 px–2560 px viewport range
  - Create `js/app.js` with module stubs: `StorageManager` and `UIController` using the Module Pattern (IIFE/closures)
  - Add JSDoc comments for the `Task` and `Link` data shapes
  - _Requirements: 6.2, 6.3, 7.1, 7.2, 7.3_

- [x] 2. Implement `StorageManager`
  - [x] 2.1 Implement `isAvailable()`, `load(key)`, and `save(key, data)`
    - `isAvailable()`: write/read/delete a probe value; return boolean
    - `load(key)`: read key → `JSON.parse` → return array; return `[]` on absent key, non-JSON, or non-array value
    - `save(key, data)`: `JSON.stringify` + `setItem`; catch quota/security errors, set `unavailableFlag`, expose flag via getter
    - Keys: `'todo-dashboard-tasks'` and `'todo-dashboard-links'`
    - _Requirements: 5.1, 5.2, 5.3, 3.3, 3.6, 3.10, 3.12, 4.6, 4.10_

  - [ ]* 2.2 Write property test for `StorageManager.load` — JSON round-trip (Property 1)
    - **Property 1: JSON serialization round-trip**
    - **Validates: Requirements 5.2, 5.3**
    - Use `fast-check` arbitraries for Task and Link arrays; serialize with `JSON.stringify`, deserialize with `JSON.parse`; assert deep equality

  - [ ]* 2.3 Write property test for `StorageManager.load` — bad data returns `[]` (Property 10)
    - **Property 10: StorageManager returns empty array on bad data**
    - **Validates: Requirements 5.3**
    - Generate absent keys, non-JSON strings, and valid-JSON non-arrays; call `load`; assert result is `[]`

- [x] 3. Implement `GreetingWidget`
  - [x] 3.1 Implement `formatTime(d)`, `formatDate(d)`, `getGreeting(hour)`, `tick()`, and `init()`
    - `formatTime`: zero-pad HH, MM, SS
    - `formatDate`: produce `"WEEKDAY, DD MONTH YYYY"` from a `Date` object
    - `getGreeting`: hour 5–11 → "Good Morning"; 12–17 → "Good Afternoon"; else → "Good Evening"
    - `tick`: call `new Date()`, validate with `isNaN(d.getTime())`, update DOM or show "Time unavailable"
    - `init`: call `tick()` immediately then `setInterval(tick, 1000)`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 3.2 Write property test for `getGreeting` — full hour coverage (Property 9)
    - **Property 9: Greeting function covers all hours**
    - **Validates: Requirements 1.3, 1.4, 1.5**
    - Generate integers in [0, 23]; call `getGreeting`; assert result ∈ `{"Good Morning", "Good Afternoon", "Good Evening"}`

- [x] 4. Implement `TimerWidget`
  - [x] 4.1 Implement timer state machine and countdown logic
    - States: `IDLE`, `RUNNING`, `PAUSED`, `DONE`
    - `init()`: set state to `IDLE`, display `25:00`, wire Start/Stop/Reset buttons
    - `start()`: transition `IDLE`/`PAUSED` → `RUNNING`; clear previous interval before setting new one
    - `stop()`: transition `RUNNING` → `PAUSED`; clear interval
    - `reset()`: transition any state → `IDLE`; clear interval; restore `25:00`
    - On reaching `00:00`: transition → `DONE`, apply CSS class `timer--done`, play base64 audio alert (1–3 s)
    - Enforce button enable/disable per state table from design
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

- [x] 5. Implement `TaskListWidget`
  - [x] 5.1 Implement `init(tasks)`, `addTask(title)`, and `render()`
    - `init`: store tasks array, call `render()`
    - `addTask`: trim title; reject with inline validation message if empty/whitespace; create Task (`crypto.randomUUID()` or `Date.now()+Math.random()` fallback, `completed: false`, `createdAt: Date.now()`); push to array; call `StorageManager.save`; call `render()`
    - `render`: rebuild `#task-list` innerHTML from array ordered by `createdAt` ascending
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 5.2 Write property test for `addTask` — valid title grows list by one (Property 3)
    - **Property 3: Valid task addition grows the list by one**
    - **Validates: Requirements 3.1**
    - Generate a task array and a non-whitespace title; call `addTask`; assert length increased by 1 and new entry has highest `createdAt`

  - [ ]* 5.3 Write property test for `addTask` — whitespace title rejected (Property 2)
    - **Property 2: Empty/whitespace task titles are always rejected**
    - **Validates: Requirements 3.2**
    - Generate whitespace-only strings; call `addTask`; assert list length unchanged and no `StorageManager.save` call

  - [x] 5.4 Implement `toggleTask(id)`, `beginEdit(id)`, `confirmEdit(id, value)`, `cancelEdit(id)`, and `deleteTask(id)`
    - `toggleTask`: flip `completed`; save; render
    - `beginEdit`: replace title span with `<input>` pre-filled with current title; set focus
    - `confirmEdit`: trim value; if empty/whitespace, call `cancelEdit` without saving; else update title, save, render
    - `cancelEdit`: restore read-only display without touching storage
    - `deleteTask`: splice task from array; save; render
    - Apply struck-through style to completed task titles
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

  - [ ]* 5.5 Write property test for `toggleTask` — involution (Property 5)
    - **Property 5: Toggle completion is an involution**
    - **Validates: Requirements 3.5**
    - Generate any task; call `toggleTask` twice; assert `completed` matches original value

  - [ ]* 5.6 Write property test for `confirmEdit` — whitespace edit discarded (Property 6)
    - **Property 6: Empty/whitespace edit is discarded**
    - **Validates: Requirements 3.9**
    - Generate a task with a non-empty title and a whitespace string; call `confirmEdit`; assert title unchanged and no save call

  - [ ]* 5.7 Write property test for `deleteTask` — removes exactly one entry (Property 4)
    - **Property 4: Task deletion removes exactly one entry**
    - **Validates: Requirements 3.11**
    - Generate a task list with ≥1 task; pick a random id; call `deleteTask`; assert length decreased by 1 and id absent

- [x] 6. Checkpoint — task list complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement `QuickLinksWidget`
  - [x] 7.1 Implement `init(links)`, `addLink(label, url)`, and `render()`
    - `init`: store links array, call `render()`
    - `addLink`: validate label (1–50 chars), URL (1–2048 chars, `http://` or `https://` prefix), and total count < 20; show adjacent inline validation messages on failure; create Link; push; save; render
    - Each link button: `target="_blank"`, `rel="noopener noreferrer"`, delete control
    - `render`: rebuild `#quick-links` innerHTML
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 7.2 Write property test for `addLink` — bounded at 20 (Property 7)
    - **Property 7: Valid link addition is bounded at 20**
    - **Validates: Requirements 4.1, 4.5**
    - Generate lists of size 0–19 + valid link → assert length +1; size 20 + valid link → assert unchanged

  - [ ]* 7.3 Write property test for `addLink` — URL protocol validation (Property 8)
    - **Property 8: URL protocol validation**
    - **Validates: Requirements 4.3**
    - Generate URL strings without `http://` or `https://` prefix; call `addLink`; assert list unchanged

  - [x] 7.4 Implement `deleteLink(id)`
    - Splice link from array; save; render
    - _Requirements: 4.9, 4.10_

- [x] 8. Implement `BannerWidget` and wire all modules together
  - [x] 8.1 Implement `BannerWidget` and `UIController.init()`
    - `BannerWidget`: show `#storage-banner` once when `StorageManager.unavailableFlag` is true; banner must not obscure interactive controls
    - `UIController.init()`: call `StorageManager.load` for both keys; call each widget's `init()` with loaded data; check `isAvailable()` and show banner if needed
    - Attach `DOMContentLoaded` listener to call `UIController.init()`
    - _Requirements: 3.13, 5.4, 6.3_

  - [x] 8.2 Add keyboard navigation and focus indicators
    - Ensure all buttons, inputs, and checkboxes are reachable via Tab
    - Apply visible focus outline (minimum 2 px solid) meeting WCAG 2.1 AA Focus Visible
    - Add pressed/highlight feedback for actions that produce no other visible change within 100 ms (100–500 ms duration)
    - _Requirements: 7.4, 7.5_

- [ ] 9. Final checkpoint — full integration
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Property tests require `fast-check`: `npx fast-check` or add it as a dev dependency.
- Checkpoints ensure incremental validation at logical breaks.
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "7.1"] },
    { "id": 5, "tasks": ["5.5", "5.6", "5.7", "7.2", "7.3", "7.4"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["8.2"] }
  ]
}
```
