/**
 * @file app.js
 * TODO List Dashboard — single JS file.
 *
 * Module structure (Module Pattern / IIFE closures):
 *   1. Data contracts (JSDoc typedefs)
 *   2. StorageManager  — LocalStorage read/write
 *   3. UIController    — DOM rendering and event handling
 *      ├── GreetingWidget
 *      ├── TimerWidget
 *      ├── TaskListWidget
 *      ├── QuickLinksWidget
 *      └── BannerWidget
 *
 * Startup: DOMContentLoaded → UIController.init()
 */

'use strict';

/* ============================================================
   1. Data Contracts
   ============================================================ */

/**
 * A single to-do item.
 *
 * @typedef {Object} Task
 * @property {string}  id        - Unique identifier (crypto.randomUUID() or fallback).
 * @property {string}  title     - Trimmed, non-empty task description.
 * @property {boolean} completed - Completion state; false on creation.
 * @property {number}  createdAt - Unix millisecond timestamp (Date.now()).
 */

/**
 * A single quick-link entry.
 *
 * @typedef {Object} Link
 * @property {string} id    - Unique identifier (crypto.randomUUID() or fallback).
 * @property {string} label - Display text, 1–50 characters (trimmed).
 * @property {string} url   - Target URL, 1–2048 characters, must start with http:// or https://.
 */

/* ============================================================
   2. StorageManager
   Requirement refs: 5.1, 5.2, 5.3, 3.3, 3.6, 3.10, 3.12, 4.6, 4.10
   ============================================================ */

/**
 * StorageManager — thin wrapper around window.localStorage.
 * All data is JSON-serialised before writing and deserialised on reading.
 * Write failures are caught and surfaced via the unavailableFlag getter.
 *
 * @namespace StorageManager
 */
const StorageManager = (function () {

  /** @type {boolean} Set true on the first write failure. */
  let _unavailableFlag = false;

  /** LocalStorage probe key used by isAvailable(). */
  const PROBE_KEY = '__todo_dashboard_probe__';

  /** Storage keys used by the application. */
  const KEYS = {
    TASKS: 'todo-dashboard-tasks',
    LINKS: 'todo-dashboard-links',
  };

  /**
   * Tests whether window.localStorage is readable and writable.
   * Performs a write → read → delete probe to detect private-browsing restrictions.
   *
   * @returns {boolean} true if LocalStorage is available; false otherwise.
   */
  function isAvailable() {
    try {
      const probeValue = '__probe__';
      window.localStorage.setItem(PROBE_KEY, probeValue);
      const readBack = window.localStorage.getItem(PROBE_KEY);
      window.localStorage.removeItem(PROBE_KEY);
      return readBack === probeValue;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Reads and deserialises a JSON array from LocalStorage.
   * Returns an empty array when the key is absent, the stored value is not
   * valid JSON, or the parsed value is not a JSON array.
   *
   * @param {string} key - The LocalStorage key to read.
   * @returns {Array<Task|Link>} The parsed array, or [] on any error.
   */
  function load(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  /**
   * Serialises data as JSON and writes it to LocalStorage under the given key.
   * On quota or security errors the write is silently swallowed and
   * unavailableFlag is set to true.
   *
   * @param {string}            key  - The LocalStorage key to write.
   * @param {Array<Task|Link>}  data - The array to persist.
   * @returns {void}
   */
  function save(key, data) {
    try {
      window.localStorage.setItem(key, JSON.stringify(data));
    } catch (_e) {
      _unavailableFlag = true;
    }
  }

  /**
   * Whether a write failure has occurred during the current session.
   *
   * @returns {boolean}
   */
  function getUnavailableFlag() {
    return _unavailableFlag;
  }

  return {
    KEYS,
    isAvailable,
    load,
    save,
    get unavailableFlag() { return getUnavailableFlag(); },
  };
}());

/* ============================================================
   3. UIController
   Contains all sub-widgets as inner closures.
   Requirement refs: 6.3, 7.1, 7.4, 7.5
   ============================================================ */

/**
 * UIController — owns all DOM interaction.
 * Delegates data reads/writes to StorageManager.
 *
 * @namespace UIController
 */
const UIController = (function () {

  /* ----------------------------------------------------------
     3a. GreetingWidget
     Requirement refs: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
     ---------------------------------------------------------- */

  /**
   * GreetingWidget — displays the current time, date, and time-based greeting.
   * Updates every second via setInterval.
   *
   * @namespace GreetingWidget
   */
  const GreetingWidget = (function () {

    /** @type {number|null} Handle returned by setInterval. */
    let _intervalId = null;

    /**
     * Formats a Date object as HH:MM:SS (zero-padded).
     *
     * @param {Date} d
     * @returns {string} e.g. "09:04:07"
     */
    function formatTime(d) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }

    /**
     * Formats a Date object as "WEEKDAY, DD MONTH YYYY".
     *
     * @param {Date} d
     * @returns {string} e.g. "Wednesday, 19 November 2026"
     */
    function formatDate(d) {
      const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const MONTHS   = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
      const day   = WEEKDAYS[d.getDay()];
      const date  = String(d.getDate()).padStart(2, '0');
      const month = MONTHS[d.getMonth()];
      const year  = d.getFullYear();
      return `${day}, ${date} ${month} ${year}`;
    }

    /**
     * Returns the appropriate greeting string for a given hour (0–23).
     *
     * @param {number} hour - Local hour in [0, 23].
     * @returns {"Good Morning"|"Good Afternoon"|"Good Evening"}
     */
    function getGreeting(hour) {
      if (hour >= 5 && hour <= 11) return 'Good Morning';
      if (hour >= 12 && hour <= 17) return 'Good Afternoon';
      return 'Good Evening';
    }

    /**
     * Reads the current time, validates it, and updates the DOM.
     * Displays "Time unavailable" in all three fields if the Date is invalid.
     *
     * @returns {void}
     */
    function tick() {
      const elMessage = document.getElementById('greeting-message');
      const elTime    = document.getElementById('greeting-time');
      const elDate    = document.getElementById('greeting-date');

      if (!elMessage || !elTime || !elDate) return;

      let d;
      try {
        d = new Date();
      } catch (_e) {
        d = new Date(NaN);
      }

      if (!d || isNaN(d.getTime())) {
        elMessage.textContent = 'Time unavailable';
        elTime.textContent    = 'Time unavailable';
        elDate.textContent    = 'Time unavailable';
        return;
      }

      elMessage.textContent = getGreeting(d.getHours());
      elTime.textContent    = formatTime(d);
      elDate.textContent    = formatDate(d);
    }

    /**
     * Initialises the greeting widget.
     * Calls tick() immediately, then every 1000 ms.
     *
     * @returns {void}
     */
    function init() {
      tick();
      _intervalId = setInterval(tick, 1000);
    }

    return { init, tick, formatTime, formatDate, getGreeting };
  }());

  /* ----------------------------------------------------------
     3b. TimerWidget
     Requirement refs: 2.1–2.9
     ---------------------------------------------------------- */

  /**
   * TimerWidget — 25-minute Pomodoro countdown with Start/Stop/Reset.
   *
   * States: IDLE → RUNNING → PAUSED → DONE → IDLE
   *
   * @namespace TimerWidget
   */
  const TimerWidget = (function () {

    /** Timer states. */
    const STATE = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', DONE: 'DONE' };

    const INITIAL_SECONDS = 25 * 60; // 1500

    /** @type {string} */
    let _state = STATE.IDLE;

    /** @type {number} Remaining seconds. */
    let _remaining = INITIAL_SECONDS;

    /** @type {number|null} Handle returned by setInterval. */
    let _intervalId = null;

    /**
     * Formats a remaining-seconds value as MM:SS.
     *
     * @param {number} totalSeconds
     * @returns {string} e.g. "25:00"
     */
    function formatDisplay(totalSeconds) {
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /**
     * Updates the timer display and button states to match current state.
     *
     * @returns {void}
     */
    function _updateDOM() {
      const elDisplay  = document.getElementById('timer-display');
      const elStart    = document.getElementById('timer-start');
      const elStop     = document.getElementById('timer-stop');
      const elReset    = document.getElementById('timer-reset');
      const elDone     = document.getElementById('timer-done-indicator');

      if (!elDisplay) return;

      elDisplay.textContent = formatDisplay(_remaining);

      // Button enable/disable per state table
      elStart.disabled = (_state === STATE.RUNNING || _state === STATE.DONE);
      elStop.disabled  = (_state === STATE.IDLE    || _state === STATE.PAUSED || _state === STATE.DONE);
      elReset.disabled = false;

      // Visual done indicator
      if (_state === STATE.DONE) {
        elDisplay.classList.add('timer--done');
        if (elDone) elDone.classList.remove('timer__done-indicator--hidden');
      } else {
        elDisplay.classList.remove('timer--done');
        if (elDone) elDone.classList.add('timer__done-indicator--hidden');
      }
    }

    /**
     * Clears the active countdown interval if one exists.
     *
     * @returns {void}
     */
    function _clearInterval() {
      if (_intervalId !== null) {
        clearInterval(_intervalId);
        _intervalId = null;
      }
    }

    /**
     * Called each second while RUNNING. Decrements remaining time;
     * transitions to DONE when it reaches zero.
     *
     * @returns {void}
     */
    function _tick() {
      _remaining -= 1;
      if (_remaining <= 0) {
        _remaining = 0;
        _clearInterval();
        _state = STATE.DONE;
        _playAlert();
      }
      _updateDOM();
    }

    /**
     * Plays the completion audio alert.
     * Uses a base64-encoded short beep (880 Hz sine wave, ~1 s, 8 kHz / 16-bit mono WAV).
     *
     * @returns {void}
     */
    function _playAlert() {
      const el = document.getElementById('timer-alert');
      if (!el) return;

      // Base64-encoded WAV: 880 Hz sine wave, 1 s, 8 kHz sample rate, 16-bit mono.
      // Generated at build time — no external file dependency.
      const BEEP_B64 = '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';

      el.src = 'data:audio/wav;base64,' + BEEP_B64;
      try {
        el.play();
      } catch (_e) {
        // Autoplay may be blocked; non-fatal
      }
    }

    /**
     * Transitions to RUNNING and starts the countdown interval.
     * Valid from IDLE or PAUSED state.
     *
     * @returns {void}
     */
    function start() {
      if (_state !== STATE.IDLE && _state !== STATE.PAUSED) return;
      _state = STATE.RUNNING;
      _clearInterval(); // defensive
      _intervalId = setInterval(_tick, 1000);
      _updateDOM();
    }

    /**
     * Pauses the countdown, retaining the current remaining time.
     * Valid from RUNNING state.
     *
     * @returns {void}
     */
    function stop() {
      if (_state !== STATE.RUNNING) return;
      _clearInterval();
      _state = STATE.PAUSED;
      _updateDOM();
    }

    /**
     * Resets the timer to its initial state (25:00, IDLE).
     * Valid from any state.
     * When already IDLE at 25:00, adds a brief .btn--pressed highlight
     * so the keypress registers visually within 100 ms.
     *
     * @returns {void}
     */
    function reset() {
      // Detect a no-op reset (already IDLE at full 25:00): give visual feedback
      const noVisibleChange = (_state === STATE.IDLE && _remaining === INITIAL_SECONDS);

      _clearInterval();
      _state     = STATE.IDLE;
      _remaining = INITIAL_SECONDS;
      _updateDOM();

      if (noVisibleChange) {
        const elReset = document.getElementById('timer-reset');
        if (elReset) {
          elReset.classList.add('btn--pressed');
          setTimeout(function () {
            elReset.classList.remove('btn--pressed');
          }, 200);
        }
      }
    }

    /**
     * Initialises the timer widget: sets initial display and wires buttons.
     *
     * @returns {void}
     */
    function init() {
      _updateDOM();

      const elStart = document.getElementById('timer-start');
      const elStop  = document.getElementById('timer-stop');
      const elReset = document.getElementById('timer-reset');

      if (elStart) elStart.addEventListener('click', start);
      if (elStop)  elStop.addEventListener('click', stop);
      if (elReset) elReset.addEventListener('click', reset);
    }

    return { init, start, stop, reset, formatDisplay };
  }());

  /* ----------------------------------------------------------
     3c. TaskListWidget
     Requirement refs: 3.1–3.12
     ---------------------------------------------------------- */

  /**
   * TaskListWidget — manages the in-memory task array and renders the task list.
   *
   * @namespace TaskListWidget
   */
  const TaskListWidget = (function () {

    /** @type {Task[]} In-memory task array. */
    let _tasks = [];

    /**
     * Generates a unique string identifier.
     * Uses crypto.randomUUID() when available; falls back to
     * Date.now().toString() + '-' + Math.random().toString(36).slice(2).
     *
     * @returns {string}
     */
    function _newId() {
      return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : Date.now().toString() + '-' + Math.random().toString(36).slice(2);
    }

    /**
     * Shows an inline validation error adjacent to the add-task input.
     *
     * @param {string} message
     * @returns {void}
     */
    function _showAddError(message) {
      const el = document.getElementById('task-input-error');
      if (el) el.textContent = message;
      const input = document.getElementById('task-input');
      if (input) input.classList.add('input--error');
    }

    /**
     * Clears the inline validation error on the add-task input.
     *
     * @returns {void}
     */
    function _clearAddError() {
      const el = document.getElementById('task-input-error');
      if (el) el.textContent = '';
      const input = document.getElementById('task-input');
      if (input) input.classList.remove('input--error');
    }

    /**
     * Fully rebuilds the task list DOM from the current _tasks array,
     * ordered by createdAt ascending.
     * Uses data-action / data-id attributes; events are handled via
     * delegation wired once in init().
     *
     * @returns {void}
     */
    function render() {
      const container = document.getElementById('task-items');
      if (!container) return;

      const sorted = [..._tasks].sort(function (a, b) { return a.createdAt - b.createdAt; });
      container.innerHTML = '';

      sorted.forEach(function (task) {
        const li = document.createElement('li');
        li.className  = 'task-item';
        li.dataset.id = task.id;

        // Checkbox — data-action="toggle" for delegation
        const checkbox = document.createElement('input');
        checkbox.type         = 'checkbox';
        checkbox.className    = 'task-item__checkbox';
        checkbox.checked      = task.completed;
        checkbox.dataset.action = 'toggle';
        checkbox.dataset.id     = task.id;
        checkbox.setAttribute('aria-label', 'Mark "' + task.title + '" as ' + (task.completed ? 'incomplete' : 'complete'));

        // Title span — class signals completion for struck-through style
        const titleSpan = document.createElement('span');
        titleSpan.className   = 'task-item__title' + (task.completed ? ' task-item__title--completed' : '');
        titleSpan.textContent = task.title;

        // Actions wrapper
        const actions = document.createElement('div');
        actions.className = 'task-item__actions';

        // Edit button — data-action="edit"
        const editBtn = document.createElement('button');
        editBtn.type              = 'button';
        editBtn.className         = 'btn btn--ghost';
        editBtn.textContent       = 'Edit';
        editBtn.dataset.action    = 'edit';
        editBtn.dataset.id        = task.id;
        editBtn.setAttribute('aria-label', 'Edit task: ' + task.title);

        // Delete button — data-action="delete"
        const deleteBtn = document.createElement('button');
        deleteBtn.type            = 'button';
        deleteBtn.className       = 'btn btn--danger';
        deleteBtn.textContent     = '✕';
        deleteBtn.dataset.action  = 'delete';
        deleteBtn.dataset.id      = task.id;
        deleteBtn.setAttribute('aria-label', 'Delete task: ' + task.title);

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        li.appendChild(checkbox);
        li.appendChild(titleSpan);
        li.appendChild(actions);
        container.appendChild(li);
      });
    }

    /**
     * Validates and adds a new task with the given title.
     * Rejects empty or whitespace-only titles with an inline validation message
     * adjacent to #task-input (shown in #task-input-error).
     *
     * @param {string} title - Raw user input.
     * @returns {void}
     */
    function addTask(title) {
      const trimmed = (title || '').trim();
      if (!trimmed) {
        _showAddError('Task title cannot be empty.');
        return;
      }
      _clearAddError();

      /** @type {Task} */
      const task = {
        id:        _newId(),
        title:     trimmed,
        completed: false,
        createdAt: Date.now(),
      };

      _tasks.push(task);
      StorageManager.save(StorageManager.KEYS.TASKS, _tasks);
      render();
    }

    /**
     * Toggles the completion state of the task with the given id.
     *
     * @param {string} id
     * @returns {void}
     */
    function toggleTask(id) {
      const task = _tasks.find(function (t) { return t.id === id; });
      if (!task) return;
      task.completed = !task.completed;
      StorageManager.save(StorageManager.KEYS.TASKS, _tasks);
      render();
    }

    /**
     * Replaces the title span of the specified task with an inline edit input.
     *
     * @param {string} id
     * @returns {void}
     */
    function beginEdit(id) {
      const task = _tasks.find(function (t) { return t.id === id; });
      if (!task) return;

      const li = document.querySelector('[data-id="' + id + '"]');
      if (!li) return;

      const titleSpan = li.querySelector('.task-item__title');
      if (!titleSpan) return;

      const input = document.createElement('input');
      input.type      = 'text';
      input.className = 'task-item__edit-input';
      input.value     = task.title;
      input.setAttribute('aria-label', 'Edit task title');

      titleSpan.replaceWith(input);
      input.focus();
      input.select();

      // Guard against blur firing after keydown already committed/cancelled
      let _editDone = false;

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          _editDone = true;
          confirmEdit(id, input.value);
        } else if (e.key === 'Escape') {
          _editDone = true;
          cancelEdit(id);
        }
      });

      input.addEventListener('blur', function () {
        if (!_editDone) {
          _editDone = true;
          confirmEdit(id, input.value);
        }
      });

      // Replace edit button with confirm/cancel
      const actions = li.querySelector('.task-item__actions');
      if (actions) {
        const confirmBtn = document.createElement('button');
        confirmBtn.type        = 'button';
        confirmBtn.className   = 'btn btn--primary';
        confirmBtn.textContent = '✓';
        confirmBtn.setAttribute('aria-label', 'Confirm edit');
        confirmBtn.addEventListener('click', function () {
          if (!_editDone) {
            _editDone = true;
            confirmEdit(id, input.value);
          }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type        = 'button';
        cancelBtn.className   = 'btn btn--ghost';
        cancelBtn.textContent = '✕';
        cancelBtn.setAttribute('aria-label', 'Cancel edit');
        cancelBtn.addEventListener('click', function () {
          if (!_editDone) {
            _editDone = true;
            cancelEdit(id);
          }
        });

        actions.innerHTML = '';
        actions.appendChild(confirmBtn);
        actions.appendChild(cancelBtn);
      }
    }

    /**
     * Commits an edit if value is non-empty after trimming; otherwise discards.
     *
     * @param {string} id
     * @param {string} value - Raw value from the edit input.
     * @returns {void}
     */
    function confirmEdit(id, value) {
      const trimmed = (value || '').trim();
      if (!trimmed) {
        cancelEdit(id);
        return;
      }
      const task = _tasks.find(function (t) { return t.id === id; });
      if (!task) return;
      task.title = trimmed;
      StorageManager.save(StorageManager.KEYS.TASKS, _tasks);
      render();
    }

    /**
     * Discards an in-progress edit and restores the read-only task display.
     * Does not modify storage.
     *
     * @param {string} id
     * @returns {void}
     */
    function cancelEdit(id) {
      render(); // full re-render restores original state from unchanged _tasks
    }

    /**
     * Removes the task with the given id from the list.
     *
     * @param {string} id
     * @returns {void}
     */
    function deleteTask(id) {
      const index = _tasks.findIndex(function (t) { return t.id === id; });
      if (index === -1) return;
      _tasks.splice(index, 1);
      StorageManager.save(StorageManager.KEYS.TASKS, _tasks);
      render();
    }

    /**
     * Initialises the task list widget with persisted tasks.
     * Wires the add-task form submit handler and a single delegated
     * event listener on #task-items for toggle, edit, and delete actions.
     *
     * @param {Task[]} tasks - Tasks loaded from LocalStorage.
     * @returns {void}
     */
    function init(tasks) {
      _tasks = Array.isArray(tasks) ? tasks : [];

      // Wire add-task form
      const form  = document.getElementById('add-task-form');
      const input = document.getElementById('task-input');

      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          addTask(input ? input.value : '');
          // Only clear the input when the submission succeeded (no error shown)
          const errorEl = document.getElementById('task-input-error');
          const hasError = errorEl && errorEl.textContent.trim() !== '';
          if (input && !hasError) input.value = '';
        });
      }

      // Wire delegated events on the list container (toggle / edit / delete)
      const container = document.getElementById('task-items');
      if (container) {
        container.addEventListener('change', function (e) {
          const el = e.target;
          if (el.dataset.action === 'toggle' && el.dataset.id) {
            toggleTask(el.dataset.id);
          }
        });

        container.addEventListener('click', function (e) {
          // Walk up from the click target to find a button with data-action
          let el = e.target;
          while (el && el !== container) {
            if (el.dataset && el.dataset.action && el.dataset.id) {
              const action = el.dataset.action;
              const id     = el.dataset.id;
              if (action === 'edit')   { beginEdit(id);   return; }
              if (action === 'delete') { deleteTask(id);  return; }
            }
            el = el.parentElement;
          }
        });
      }

      render();
    }

    return { init, addTask, toggleTask, beginEdit, confirmEdit, cancelEdit, deleteTask, render };
  }());

  /* ----------------------------------------------------------
     3d. QuickLinksWidget
     Requirement refs: 4.1–4.10
     ---------------------------------------------------------- */

  /**
   * QuickLinksWidget — manages user-defined shortcut buttons.
   *
   * @namespace QuickLinksWidget
   */
  const QuickLinksWidget = (function () {

    /** @type {Link[]} In-memory links array. */
    let _links = [];

    const MAX_LINKS      = 20;
    const MAX_LABEL_LEN  = 50;
    const MAX_URL_LEN    = 2048;

    /**
     * Generates a unique string identifier.
     *
     * @returns {string}
     */
    function _newId() {
      return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    }

    /**
     * Shows an inline validation error in the specified element.
     *
     * @param {string} elId    - ID of the error span element.
     * @param {string} message - Error text to display.
     * @returns {void}
     */
    function _showError(elId, message) {
      const el = document.getElementById(elId);
      if (el) el.textContent = message;
    }

    /**
     * Clears all inline validation errors on the add-link form.
     *
     * @returns {void}
     */
    function _clearErrors() {
      ['link-label-error', 'link-url-error', 'link-count-error'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
      });
    }

    /**
     * Rebuilds the links panel DOM from the current _links array.
     *
     * @returns {void}
     */
    function render() {
      const container = document.getElementById('link-items');
      if (!container) return;

      container.innerHTML = '';

      _links.forEach(function (link) {
        const wrapper = document.createElement('div');
        wrapper.className = 'link-item';
        wrapper.dataset.id = link.id;

        const anchor = document.createElement('a');
        anchor.href             = link.url;
        anchor.target           = '_blank';
        anchor.rel              = 'noopener noreferrer';
        anchor.className        = 'link-item__btn';
        anchor.textContent      = link.label;
        anchor.setAttribute('aria-label', `Open ${link.label} in a new tab`);

        const deleteBtn = document.createElement('button');
        deleteBtn.type      = 'button';
        deleteBtn.className = 'link-item__delete';
        deleteBtn.textContent = '✕';
        deleteBtn.setAttribute('aria-label', `Delete link: ${link.label}`);
        deleteBtn.addEventListener('click', function () { deleteLink(link.id); });

        wrapper.appendChild(anchor);
        wrapper.appendChild(deleteBtn);
        container.appendChild(wrapper);
      });
    }

    /**
     * Validates inputs and adds a new Link entry.
     * Shows adjacent inline validation messages on any failure.
     *
     * @param {string} label - User-provided label.
     * @param {string} url   - User-provided URL.
     * @returns {void}
     */
    function addLink(label, url) {
      _clearErrors();

      let valid = true;
      const trimLabel = (label || '').trim();
      const trimUrl   = (url   || '').trim();

      if (!trimLabel) {
        _showError('link-label-error', 'Label is required.');
        valid = false;
      } else if (trimLabel.length > MAX_LABEL_LEN) {
        _showError('link-label-error', `Label must be ${MAX_LABEL_LEN} characters or fewer.`);
        valid = false;
      }

      if (!trimUrl) {
        _showError('link-url-error', 'URL is required.');
        valid = false;
      } else if (trimUrl.length > MAX_URL_LEN) {
        _showError('link-url-error', `URL must be ${MAX_URL_LEN} characters or fewer.`);
        valid = false;
      } else if (!trimUrl.startsWith('http://') && !trimUrl.startsWith('https://')) {
        _showError('link-url-error', 'URL must begin with http:// or https://');
        valid = false;
      }

      if (_links.length >= MAX_LINKS) {
        _showError('link-count-error', `Maximum of ${MAX_LINKS} links reached.`);
        valid = false;
      }

      if (!valid) return;

      /** @type {Link} */
      const link = {
        id:    _newId(),
        label: trimLabel,
        url:   trimUrl,
      };

      _links.push(link);
      StorageManager.save(StorageManager.KEYS.LINKS, _links);
      render();
    }

    /**
     * Removes the link with the given id.
     *
     * @param {string} id
     * @returns {void}
     */
    function deleteLink(id) {
      _links = _links.filter(function (l) { return l.id !== id; });
      StorageManager.save(StorageManager.KEYS.LINKS, _links);
      render();
    }

    /**
     * Initialises the quick-links widget with persisted links.
     * Wires the add-link form submit handler.
     *
     * @param {Link[]} links - Links loaded from LocalStorage.
     * @returns {void}
     */
    function init(links) {
      _links = Array.isArray(links) ? links : [];

      const form       = document.getElementById('add-link-form');
      const labelInput = document.getElementById('link-label-input');
      const urlInput   = document.getElementById('link-url-input');

      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          addLink(
            labelInput ? labelInput.value : '',
            urlInput   ? urlInput.value   : ''
          );
          // Clear inputs only on success (errors leave inputs intact per req 4.2)
          const hasErrors = ['link-label-error', 'link-url-error', 'link-count-error']
            .some(function (id) {
              const el = document.getElementById(id);
              return el && el.textContent.trim() !== '';
            });
          if (!hasErrors) {
            if (labelInput) labelInput.value = '';
            if (urlInput)   urlInput.value   = '';
          }
        });
      }

      render();
    }

    return { init, addLink, deleteLink, render };
  }());

  /* ----------------------------------------------------------
     3e. BannerWidget
     Requirement refs: 3.13, 5.4
     ---------------------------------------------------------- */

  /**
   * BannerWidget — displays a non-blocking warning when LocalStorage is unavailable.
   *
   * @namespace BannerWidget
   */
  const BannerWidget = (function () {

    /** @type {boolean} True once the banner has been shown to avoid duplicate show calls. */
    let _shown = false;

    /**
     * Shows the storage unavailability banner once.
     * The banner is positioned via CSS so it does not obscure interactive controls.
     *
     * @returns {void}
     */
    function show() {
      if (_shown) return;
      const el = document.getElementById('storage-banner');
      if (el) {
        el.classList.remove('banner--hidden');
        _shown = true;
      }
    }

    return { show };
  }());

  /* ----------------------------------------------------------
     3f. UIController.init()
     Requirement refs: 6.3, 5.4
     ---------------------------------------------------------- */

  /**
   * Bootstraps the entire dashboard.
   * Called on DOMContentLoaded.
   *
   * Sequence:
   *   1. Load tasks and links from StorageManager.
   *   2. Initialise each widget with the loaded data.
   *   3. Show storage banner if LocalStorage is unavailable.
   *
   * @returns {void}
   */
  function init() {
    const tasks = StorageManager.load(StorageManager.KEYS.TASKS);
    const links = StorageManager.load(StorageManager.KEYS.LINKS);

    GreetingWidget.init();
    TimerWidget.init();
    TaskListWidget.init(tasks);
    QuickLinksWidget.init(links);

    if (!StorageManager.isAvailable() || StorageManager.unavailableFlag) {
      BannerWidget.show();
    }
  }

  return {
    init,
    // Expose sub-widgets for testing and task 2–8 implementations
    GreetingWidget,
    TimerWidget,
    TaskListWidget,
    QuickLinksWidget,
    BannerWidget,
  };
}());

/* ============================================================
   4. Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  UIController.init();
});
