# Requirements Document

## Introduction

The TODO List Dashboard is a standalone, single-page web application built with HTML, CSS, and Vanilla JavaScript. It runs entirely in the browser with no backend or build step. The dashboard combines four widgets on one screen: a live greeting with the current date and time, a Pomodoro-style focus timer, a persistent to-do list, and a customizable quick-links panel. All user data is stored in the browser's LocalStorage so state survives page reloads. The application must work in Chrome, Firefox, Edge, and Safari.

## Glossary

- **Dashboard**: The single HTML page that hosts all four widgets.
- **Greeting_Widget**: The section that displays the current time, date, and a time-based greeting message.
- **Timer**: The Pomodoro-style countdown widget with a 25-minute default duration.
- **Task_List**: The widget that manages the collection of to-do items.
- **Task**: A single to-do entry with a title, a completion state, and a creation timestamp.
- **Quick_Links**: The widget that holds user-defined shortcut buttons to external URLs.
- **Link**: A single quick-link entry with a label and a URL.
- **LocalStorage**: The Web Storage API (`window.localStorage`) used for all client-side persistence.
- **Storage_Manager**: The JavaScript module responsible for reading and writing all data to LocalStorage.
- **UI_Controller**: The JavaScript module responsible for rendering widgets and handling DOM events.

---

## Requirements

### Requirement 1: Live Greeting and Clock

**User Story:** As a user, I want to see the current time, date, and a greeting when I open the dashboard, so that I have immediate context for my day.

#### Acceptance Criteria

1. THE Greeting_Widget SHALL display the current time in HH:MM:SS format, updated every second.
2. THE Greeting_Widget SHALL display the current date in the format "WEEKDAY_NAME, DD MONTH_NAME YYYY" (e.g., "Wednesday, 19 November 2026").
3. WHEN the current local hour is between 05:00 and 11:59, THE Greeting_Widget SHALL display the message "Good Morning".
4. WHEN the current local hour is between 12:00 and 17:59, THE Greeting_Widget SHALL display the message "Good Afternoon".
5. WHEN the current local hour is between 18:00 and 23:59 or between 00:00 and 04:59, THE Greeting_Widget SHALL display the message "Good Evening".
6. WHEN the Dashboard page loads, THE Greeting_Widget SHALL begin the one-second clock update interval within 1 second of page load completing, without requiring user interaction.
7. IF the local time cannot be determined, THEN THE Greeting_Widget SHALL display an error message indicating that the time is unavailable, in place of the time, date, and greeting fields.

---

### Requirement 2: Focus Timer

**User Story:** As a user, I want a 25-minute countdown timer with Start, Stop, and Reset controls, so that I can structure focused work sessions.

#### Acceptance Criteria

1. THE Timer SHALL initialize with a countdown value of 25 minutes (1500 seconds) each time the Dashboard loads or is reset.
2. WHEN the user activates the Start control while the Timer is at initial state, THE Timer SHALL begin decrementing the remaining time by one second per real-world second.
3. WHILE the Timer is counting down, THE Timer SHALL display the remaining time in MM:SS format.
4. WHEN the user activates the Stop control, THE Timer SHALL pause the countdown and retain the current remaining time.
5. WHEN the user activates the Start control while the Timer is paused, THE Timer SHALL resume decrementing from the retained remaining time.
6. WHEN the user activates the Reset control, THE Timer SHALL stop any active countdown and restore the display to 25:00.
7. WHEN the remaining time reaches 00:00, THE Timer SHALL stop the countdown and display a non-dismissible visual indicator showing session completion and play an audible alert lasting between 1 and 3 seconds.
8. WHILE the Timer is counting down, THE Timer SHALL disable the Start control to prevent duplicate intervals.
9. WHILE the Timer is paused or at the initial state, THE Timer SHALL disable the Stop control.

---

### Requirement 3: To-Do List

**User Story:** As a user, I want to add, edit, complete, and delete tasks that persist across page reloads, so that I can track my work without losing progress.

#### Acceptance Criteria

1. WHEN the user submits a non-empty task title via the add-task input, THE Task_List SHALL create a new Task with a unique identifier, the provided title, a completion state of false, and the current timestamp.
2. IF the user submits an empty or whitespace-only task title, THEN THE Task_List SHALL reject the submission and display an inline validation message adjacent to the add-task input.
3. WHEN a Task is created, THE Storage_Manager SHALL persist the full Task_List to LocalStorage under the key `todo-dashboard-tasks`.
4. THE Task_List SHALL render all stored Tasks on page load, ordered by creation timestamp ascending.
5. WHEN the user activates the complete control on a Task, THE Task_List SHALL toggle the Task's completion state and apply a visual struck-through style to the Task title of completed Tasks.
6. WHEN the completion state of a Task changes, THE Storage_Manager SHALL update the persisted Task_List in LocalStorage.
7. WHEN the user activates the edit control on a Task, THE Task_List SHALL replace the Task's title display with an inline editable text field pre-filled with the current title and set focus to that field.
8. WHEN the user confirms an edit with a non-empty, non-whitespace-only value, THE Task_List SHALL update the Task's title to the trimmed input value and return to the read-only display.
9. IF the user confirms an edit with an empty or whitespace-only value, THEN THE Task_List SHALL discard the change, restore the original title, and return to the read-only display without updating LocalStorage.
10. WHEN the Task title is updated, THE Storage_Manager SHALL persist the updated Task_List to LocalStorage.
11. WHEN the user activates the delete control on a Task, THE Task_List SHALL remove the Task from the list and re-render the remaining Tasks.
12. WHEN a Task is deleted, THE Storage_Manager SHALL persist the updated Task_List to LocalStorage.
13. IF LocalStorage is unavailable or write fails, THEN THE Storage_Manager SHALL display an error message indicating that changes could not be saved.

---

### Requirement 4: Quick Links

**User Story:** As a user, I want to add and remove shortcut buttons that open my favorite websites, so that I can navigate quickly from the dashboard.

#### Acceptance Criteria

1. WHEN the user submits a valid label and URL via the add-link form, THE Quick_Links widget SHALL create a new Link entry with the provided label (1–50 characters) and URL (1–2048 characters).
2. IF the user submits an add-link form with an empty label or empty URL, THEN THE Quick_Links widget SHALL reject the submission and display an inline validation message adjacent to the invalid field without clearing any other field values.
3. IF the user submits a URL that does not begin with `http://` or `https://`, THEN THE Quick_Links widget SHALL reject the submission and display an inline validation message adjacent to the URL field indicating the URL must include a protocol, without clearing any other field values.
4. IF the user submits a label exceeding 50 characters or a URL exceeding 2048 characters, THEN THE Quick_Links widget SHALL reject the submission and display an inline validation message adjacent to the offending field.
5. IF the total number of stored Links has reached 20, THEN THE Quick_Links widget SHALL reject any new submission and display an inline validation message indicating the maximum number of links has been reached.
6. WHEN a Link is created, THE Storage_Manager SHALL persist the full Links collection to LocalStorage under the key `todo-dashboard-links`.
7. THE Quick_Links widget SHALL render all stored Links on page load.
8. WHEN the user activates a Link button, THE Dashboard SHALL open the Link's URL in a new browser tab.
9. WHEN the user activates the delete control on a Link, THE Quick_Links widget SHALL remove that Link from the displayed list immediately and re-render the remaining Links.
10. WHEN a Link is deleted, THE Storage_Manager SHALL persist the updated Links collection to LocalStorage.

---

### Requirement 5: Data Persistence and Storage Contract

**User Story:** As a user, I want my tasks and links to be available every time I open the dashboard, so that I never lose my data between sessions.

#### Acceptance Criteria

1. THE Storage_Manager SHALL use `window.localStorage` as the sole persistence mechanism; no cookies, sessionStorage, or remote APIs shall be used.
2. THE Storage_Manager SHALL serialize all data as JSON strings before writing to LocalStorage.
3. THE Storage_Manager SHALL deserialize JSON strings when reading from LocalStorage and return an empty array when the key is absent, the stored value is not valid JSON, or the parsed value is not a JSON array.
4. WHEN LocalStorage is unavailable (e.g., private-browsing restrictions), THE Dashboard SHALL remain operational for the current session — all add, complete, and delete operations SHALL function in memory — and SHALL display a single non-blocking banner that does not obscure interactive controls, indicating that data will not be saved between sessions.

---

### Requirement 6: Cross-Browser Compatibility and Technical Constraints

**User Story:** As a user, I want the dashboard to work in any modern browser without installation, so that I can use it anywhere.

#### Acceptance Criteria

1. THE Dashboard SHALL pass all acceptance criteria in the current stable release of Chrome, Firefox, Edge, and Safari without requiring polyfills or transpilation.
2. THE Dashboard SHALL be implemented using a single HTML file, a single CSS file located in `css/`, and a single JavaScript file located in `js/`.
3. THE Dashboard SHALL reach an interactive state — defined as all four widgets rendered and responsive to user input — within 2 seconds of the page load event completing on a machine with no network throttling and a single-core CPU speed of 1 GHz or higher.
4. THE UI_Controller SHALL update visible state within 100 milliseconds of any user interaction (button clicks, form submissions, checkbox toggles).
5. THE Dashboard SHALL render correctly on viewport widths from 360px to 2560px without horizontal scrolling.

---

### Requirement 7: User Interface and Accessibility

**User Story:** As a user, I want a clean, readable interface with clear visual hierarchy, so that I can use the dashboard without confusion or eye strain.

#### Acceptance Criteria

1. THE Dashboard SHALL present all four widgets (Greeting, Timer, Task List, Quick Links) on a single scrollable page with visible section boundaries.
2. THE Dashboard SHALL apply a consistent typographic scale where heading text uses a font size at least 1.25× larger than the body text font size.
3. THE Dashboard SHALL provide sufficient color contrast between text and background colors to meet WCAG 2.1 AA contrast ratio requirements (minimum 4.5:1 for normal text).
4. WHEN a user action produces no visible change within 100 milliseconds, THE UI_Controller SHALL apply a visible state change to the activated control — such as a highlight or pressed indicator — lasting between 100 milliseconds and 500 milliseconds, so the user knows the action was registered.
5. THE Dashboard SHALL ensure all interactive controls (buttons, inputs, checkboxes) are keyboard-navigable and display a visible focus indicator meeting WCAG 2.1 AA Focus Visible requirements (minimum 2px solid outline).
