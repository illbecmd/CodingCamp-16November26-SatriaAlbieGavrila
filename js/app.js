/**
 * @file app.js
 * TODO List Dashboard — single JS file.
 * Includes:
 *   - StorageManager & UIController architecture
 *   - Smart Natural Language Processing (NLP) Task Parser
 *   - Multi-View Toggle (List, Kanban Board, Calendar/Timeline)
 *   - Global Keyboard Shortcuts (N, Space, 1/2/3, D, Esc, ?)
 *   - Light/Dark Theme, Custom Greeting Name, Custom Pomodoro Time, Sort & Duplicate Guard
 */

'use strict';

/* ============================================================
   1. Data Contracts
   ============================================================ */

/**
 * @typedef {Object} Task
 * @property {string}      id        - Unique identifier.
 * @property {string}      title     - Cleaned task title.
 * @property {boolean}     completed - Completion state.
 * @property {string}      status    - Kanban status: 'todo' | 'inprogress' | 'done'.
 * @property {string|null} tag       - Extracted hashtag (without #), e.g., 'pribadi'.
 * @property {string|null} deadline  - ISO datetime string or null.
 * @property {number}      createdAt - Unix millisecond timestamp.
 */

/**
 * @typedef {Object} Link
 * @property {string} id    - Unique identifier.
 * @property {string} label - Display text (1–50 chars).
 * @property {string} url   - Target URL (http:// or https://).
 */

/* ============================================================
   2. StorageManager
   ============================================================ */
const StorageManager = (function () {
  let _unavailableFlag = false;
  const PROBE_KEY = '__todo_dashboard_probe__';

  const KEYS = {
    TASKS: 'todo-dashboard-tasks',
    LINKS: 'todo-dashboard-links',
    PREFS: 'todo-dashboard-prefs',
  };

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

  function save(key, data) {
    try {
      window.localStorage.setItem(key, JSON.stringify(data));
    } catch (_e) {
      _unavailableFlag = true;
    }
  }

  function loadPrefs() {
    try {
      const raw = window.localStorage.getItem(KEYS.PREFS);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function savePrefs(partial) {
    try {
      const current = loadPrefs();
      window.localStorage.setItem(KEYS.PREFS, JSON.stringify({ ...current, ...partial }));
    } catch (_e) {
      _unavailableFlag = true;
    }
  }

  return {
    KEYS,
    isAvailable,
    load,
    save,
    loadPrefs,
    savePrefs,
    get unavailableFlag() { return _unavailableFlag; },
  };
}());

/* ============================================================
   3. Smart NLP Parser (Bahasa Indonesia & English)
   Extracts:
     - Hashtags: #pribadi, #kerja, #kuliah
     - Relative dates: hari ini / today, besok / tomorrow, lusa, nama hari (senin-minggu)
     - Times: jam 2 siang, pukul 14:30, jam 9 pagi, jam 8 malam, at 3pm
   ============================================================ */
const SmartNLP = (function () {
  const DAYS_MAP = {
    minggu: 0, sunday: 0,
    senin: 1, monday: 1,
    selasa: 2, tuesday: 2,
    rabu: 3, wednesday: 3,
    kamis: 4, thursday: 4,
    jumat: 5, "jum'at": 5, friday: 5,
    sabtu: 6, saturday: 6,
  };

  function toLocalISOString(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatReadableDeadline(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function parse(rawInput) {
    let text = (rawInput || '').trim();
    let tag = null;
    let targetDate = null;
    let hasDateMatch = false;
    let hasTimeMatch = false;
    let hours = 9; // Default morning reminder if only date is specified
    let minutes = 0;

    // 1. Extract #tag
    const tagMatch = text.match(/(?:^|\s)#([a-zA-Z0-9_-]+)/);
    if (tagMatch) {
      tag = tagMatch[1].toLowerCase();
      text = text.replace(tagMatch[0], ' ');
    }

    const now = new Date();
    const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 2. Extract relative day keywords
    const relDayRegex = /\b(hari ini|today|besok|tomorrow|lusa)\b/i;
    const relMatch = text.match(relDayRegex);
    if (relMatch) {
      const kw = relMatch[1].toLowerCase();
      targetDate = new Date(baseDate);
      if (kw === 'besok' || kw === 'tomorrow') {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (kw === 'lusa') {
        targetDate.setDate(targetDate.getDate() + 2);
      }
      hasDateMatch = true;
      text = text.replace(relMatch[0], ' ');
    } else {
      // Check weekday names (e.g., "senin", "jumat")
      const weekdayRegex = /\b(minggu|senin|selasa|rabu|kamis|jumat|jum'at|sabtu|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;
      const wdMatch = text.match(weekdayRegex);
      if (wdMatch) {
        const targetDow = DAYS_MAP[wdMatch[1].toLowerCase()];
        targetDate = new Date(baseDate);
        let diff = targetDow - targetDate.getDay();
        if (diff <= 0) diff += 7;
        targetDate.setDate(targetDate.getDate() + diff);
        hasDateMatch = true;
        text = text.replace(wdMatch[0], ' ');
      }
    }

    // 3. Extract time expressions: "jam 2 siang", "pukul 14.30", "jam 9:15 malam", "at 5pm"
    const timeRegex = /\b(?:jam|pukul|at)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|siang|sore|malam|am|pm)?\b/i;
    const timeMatch = text.match(timeRegex);
    if (timeMatch && (timeMatch[0].toLowerCase().includes('jam') || timeMatch[0].toLowerCase().includes('pukul') || timeMatch[2] || timeMatch[3])) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const period = (timeMatch[3] || '').toLowerCase();

      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        if ((period === 'siang' || period === 'sore' || period === 'malam' || period === 'pm') && h < 12) {
          h += 12;
        } else if ((period === 'pagi' || period === 'am') && h === 12) {
          h = 0;
        }
        hours = h;
        minutes = m;
        hasTimeMatch = true;
        text = text.replace(timeMatch[0], ' ');
      }
    }

    // Combine date + time if either matched
    let deadline = null;
    if (hasDateMatch || hasTimeMatch) {
      if (!targetDate) {
        targetDate = new Date(baseDate);
        // If user only typed "jam 2 siang" and 14:00 already passed today, schedule for tomorrow
        if (hours < now.getHours() || (hours === now.getHours() && minutes <= now.getMinutes())) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
      }
      targetDate.setHours(hours, minutes, 0, 0);
      deadline = toLocalISOString(targetDate);
    }

    const cleanTitle = text.replace(/\s+/g, ' ').trim();

    return {
      title: cleanTitle || rawInput.trim(),
      tag,
      deadline,
      hasMetadata: Boolean(tag || deadline),
    };
  }

  return { parse, formatReadableDeadline };
}());

/* ============================================================
   4. UIController
   ============================================================ */
const UIController = (function () {

  /* ----------------------------------------------------------
     4a. ThemeController (Light / Dark Mode)
     ---------------------------------------------------------- */
  const ThemeController = (function () {
    let _theme = 'light';

    function apply(theme) {
      _theme = theme === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', _theme);
      const icon = document.getElementById('theme-icon');
      const text = document.getElementById('theme-text');
      if (icon) icon.textContent = _theme === 'dark' ? '☀️' : '🌙';
      if (text) text.textContent = _theme === 'dark' ? 'Light' : 'Dark';
    }

    function toggle() {
      const next = _theme === 'dark' ? 'light' : 'dark';
      apply(next);
      StorageManager.savePrefs({ theme: next });
    }

    function init() {
      const prefs = StorageManager.loadPrefs();
      apply(prefs.theme || 'light');
      const btn = document.getElementById('theme-toggle');
      if (btn) btn.addEventListener('click', toggle);
    }

    return { init, toggle };
  }());

  /* ----------------------------------------------------------
     4b. GreetingWidget (Clock, Date, Greeting, Custom Name)
     ---------------------------------------------------------- */
  const GreetingWidget = (function () {
    let _userName = '';

    function formatTime(d) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }

    function formatDate(d) {
      const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const MONTHS   = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
      return `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }

    function getGreeting(hour) {
      if (hour >= 5 && hour <= 11) return 'Good Morning';
      if (hour >= 12 && hour <= 17) return 'Good Afternoon';
      return 'Good Evening';
    }

    function tick() {
      const elMessage = document.getElementById('greeting-message');
      const elTime    = document.getElementById('greeting-time');
      const elDate    = document.getElementById('greeting-date');
      if (!elMessage || !elTime || !elDate) return;

      const d = new Date();
      if (isNaN(d.getTime())) {
        elMessage.textContent = 'Time unavailable';
        elTime.textContent    = 'Time unavailable';
        elDate.textContent    = 'Time unavailable';
        return;
      }

      const base = getGreeting(d.getHours());
      elMessage.textContent = _userName ? `${base}, ${_userName}` : base;
      elTime.textContent    = formatTime(d);
      elDate.textContent    = formatDate(d);
    }

    function init() {
      const prefs = StorageManager.loadPrefs();
      _userName = (prefs.userName || '').trim();

      const editBtn   = document.getElementById('edit-name-btn');
      const nameForm  = document.getElementById('name-form');
      const nameInput = document.getElementById('user-name-input');
      const cancelBtn = document.getElementById('cancel-name-btn');

      if (editBtn && nameForm && nameInput) {
        editBtn.addEventListener('click', function () {
          nameInput.value = _userName;
          nameForm.classList.remove('name-form--hidden');
          nameInput.focus();
        });
      }

      if (cancelBtn && nameForm) {
        cancelBtn.addEventListener('click', function () {
          nameForm.classList.add('name-form--hidden');
        });
      }

      if (nameForm && nameInput) {
        nameForm.addEventListener('submit', function (e) {
          e.preventDefault();
          _userName = nameInput.value.trim();
          StorageManager.savePrefs({ userName: _userName });
          nameForm.classList.add('name-form--hidden');
          tick();
        });
      }

      tick();
      setInterval(tick, 1000);
    }

    return { init, tick, formatTime, formatDate, getGreeting };
  }());

  /* ----------------------------------------------------------
     4c. TimerWidget (25m Default + Presets + Custom Minutes)
     ---------------------------------------------------------- */
  const TimerWidget = (function () {
    const STATE = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', DONE: 'DONE' };
    let _defaultSeconds = 25 * 60;
    let _state = STATE.IDLE;
    let _remaining = _defaultSeconds;
    let _intervalId = null;

    function formatDisplay(totalSeconds) {
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function _updateDOM() {
      const elDisplay = document.getElementById('timer-display');
      const elStart   = document.getElementById('timer-start');
      const elStop    = document.getElementById('timer-stop');
      const elDone    = document.getElementById('timer-done-indicator');
      if (!elDisplay) return;

      elDisplay.textContent = formatDisplay(_remaining);
      elStart.disabled = (_state === STATE.RUNNING || _state === STATE.DONE);
      elStop.disabled  = (_state !== STATE.RUNNING);

      if (_state === STATE.DONE) {
        elDisplay.classList.add('timer--done');
        if (elDone) elDone.classList.remove('timer__done-indicator--hidden');
      } else {
        elDisplay.classList.remove('timer--done');
        if (elDone) elDone.classList.add('timer__done-indicator--hidden');
      }
    }

    function _clearInterval() {
      if (_intervalId !== null) {
        clearInterval(_intervalId);
        _intervalId = null;
      }
    }

    function _playAlert() {
      const el = document.getElementById('timer-alert');
      if (!el) return;
      const BEEP_B64 = 'UklGRqQ+AABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YYA+AAAAAMwxvkx2RMIc3OcJvn6yhcoY++wtrEuxRkQhkuzMwAeyDcc19t0pTUqkSKMlXPHOw+CxzsNc8aMlpEhNSt0pNfYNxweyzMCS7EQhsUasS+wtGPuFyn6yCb7c58IcdkS+TMwxAAA0zkKzirs+4yQY90GCTXs16AQU0lS0T7m83m4TND/5TfM4ywkj1rO1XLdd2qQOMjwgTjI8pA5d2ly3s7Uj1ssJ8zj5TTQ/bhO83k+5VLQU0ugEezWCTfdBJBg+44q7QrM0zgAAzDG+THZEwhzc5wm+frKFyhj77C2sS7FGRCGS7MzAB7INxzX23SlNSqRIoyVc8c7D4LHOw1zxoyWkSE1K3Sk19g3HB7LMwJLsRCGxRqxL7C0Y+4XKfrIJvtznwhx2RL5MzDEAADTOQrOKuz7jJBj3QYJNezXoBBTSVLRPubzebhM0P/lN8zjLCSPWs7Vct13apA4yPCBOMjykDl3aXLeztSPWywnzOPlNND9uE7zeT7lUtBTS6AR7NYJN90EkGD7jirtCszTOAA==';
      el.src = 'data:audio/wav;base64,' + BEEP_B64;
      try { el.play(); } catch (_e) {}
    }

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

    function start() {
      if (_state !== STATE.IDLE && _state !== STATE.PAUSED) return;
      _state = STATE.RUNNING;
      _clearInterval();
      _intervalId = setInterval(_tick, 1000);
      _updateDOM();
    }

    function stop() {
      if (_state !== STATE.RUNNING) return;
      _clearInterval();
      _state = STATE.PAUSED;
      _updateDOM();
    }

    function toggleStartStop() {
      if (_state === STATE.RUNNING) stop();
      else if (_state === STATE.IDLE || _state === STATE.PAUSED) start();
    }

    function reset() {
      const noVisibleChange = (_state === STATE.IDLE && _remaining === _defaultSeconds);
      _clearInterval();
      _state     = STATE.IDLE;
      _remaining = _defaultSeconds;
      _updateDOM();

      if (noVisibleChange) {
        const elReset = document.getElementById('timer-reset');
        if (elReset) {
          elReset.classList.add('btn--pressed');
          setTimeout(() => elReset.classList.remove('btn--pressed'), 200);
        }
      }
    }

    function setMinutes(mins) {
      const parsed = parseInt(mins, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 120) return;
      _defaultSeconds = parsed * 60;
      document.querySelectorAll('.btn--chip').forEach((chip) => {
        chip.classList.toggle('is-active', Number(chip.dataset.minutes) === parsed);
      });
      reset();
    }

    function init() {
      _updateDOM();

      const elStart = document.getElementById('timer-start');
      const elStop  = document.getElementById('timer-stop');
      const elReset = document.getElementById('timer-reset');
      const elCustomInput = document.getElementById('timer-custom-min');
      const elCustomBtn   = document.getElementById('timer-set-custom');

      if (elStart) elStart.addEventListener('click', start);
      if (elStop)  elStop.addEventListener('click', stop);
      if (elReset) elReset.addEventListener('click', reset);

      document.querySelectorAll('.btn--chip').forEach((chip) => {
        chip.addEventListener('click', () => setMinutes(chip.dataset.minutes));
      });

      if (elCustomBtn && elCustomInput) {
        elCustomBtn.addEventListener('click', () => {
          setMinutes(elCustomInput.value);
          elCustomInput.value = '';
        });
      }
    }

    return { init, start, stop, reset, toggleStartStop, formatDisplay };
  }());

  /* ----------------------------------------------------------
     4d. TaskListWidget (Smart NLP, Multi-View, Sort, Modal Detail)
     ---------------------------------------------------------- */
  const TaskListWidget = (function () {
    /** @type {Task[]} */
    let _tasks = [];
    let _currentView = 'list'; // 'list' | 'kanban' | 'calendar'
    let _sortMode = 'oldest';
    let _modalTaskId = null;

    function _newId() {
      return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function _normalizeTask(raw) {
      const completed = Boolean(raw.completed);
      return {
        id: raw.id || _newId(),
        title: String(raw.title || '').trim(),
        completed,
        status: raw.status || (completed ? 'done' : 'todo'),
        tag: raw.tag || null,
        deadline: raw.deadline || null,
        createdAt: Number(raw.createdAt) || Date.now(),
      };
    }

    function _persist() {
      StorageManager.save(StorageManager.KEYS.TASKS, _tasks);
    }

    function _showAddError(message) {
      const el = document.getElementById('task-input-error');
      const input = document.getElementById('task-input');
      if (el) el.textContent = message;
      if (input) input.classList.add('input--error');
    }

    function _clearAddError() {
      const el = document.getElementById('task-input-error');
      const input = document.getElementById('task-input');
      if (el) el.textContent = '';
      if (input) input.classList.remove('input--error');
    }

    function _getSortedTasks() {
      const copy = [..._tasks];
      switch (_sortMode) {
        case 'newest':
          return copy.sort((a, b) => b.createdAt - a.createdAt);
        case 'alpha':
          return copy.sort((a, b) => a.title.localeCompare(b.title));
        case 'deadline':
          return copy.sort((a, b) => {
            if (!a.deadline && !b.deadline) return a.createdAt - b.createdAt;
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return new Date(a.deadline) - new Date(b.deadline);
          });
        case 'oldest':
        default:
          return copy.sort((a, b) => a.createdAt - b.createdAt);
      }
    }

    function _createBadgeElements(task) {
      const frag = document.createDocumentFragment();
      if (task.tag) {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'pill pill--tag';
        tagSpan.textContent = `#${task.tag}`;
        frag.appendChild(tagSpan);
      }
      if (task.deadline) {
        const isOverdue = !task.completed && new Date(task.deadline) < new Date();
        const dateSpan = document.createElement('span');
        dateSpan.className = `pill ${isOverdue ? 'pill--overdue' : 'pill--date'}`;
        dateSpan.textContent = `⏰ ${SmartNLP.formatReadableDeadline(task.deadline)}`;
        frag.appendChild(dateSpan);
      }
      return frag;
    }

    /* --- View 1: List View --- */
    function _renderListView(container, tasks) {
      if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">Belum ada tugas. Ketik tugas di atas atau tekan <kbd>N</kbd>.</div>';
        return;
      }

      const ul = document.createElement('ul');
      ul.className = 'task-list';
      ul.setAttribute('aria-label', 'Tasks list');

      tasks.forEach((task) => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.dataset.id = task.id;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-item__checkbox';
        checkbox.checked = task.completed;
        checkbox.setAttribute('aria-label', `Mark "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`);
        checkbox.addEventListener('change', () => toggleTask(task.id));

        const content = document.createElement('div');
        content.className = 'task-item__content';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'task-item__title' + (task.completed ? ' task-item__title--completed' : '');
        titleSpan.textContent = task.title;
        content.appendChild(titleSpan);

        if (task.tag || task.deadline) {
          const meta = document.createElement('div');
          meta.className = 'task-item__meta';
          meta.appendChild(_createBadgeElements(task));
          content.appendChild(meta);
        }

        const actions = document.createElement('div');
        actions.className = 'task-item__actions';

        const detailBtn = document.createElement('button');
        detailBtn.type = 'button';
        detailBtn.className = 'btn btn--ghost btn--xs';
        detailBtn.textContent = 'Detail';
        detailBtn.setAttribute('aria-label', `Edit detail for ${task.title}`);
        detailBtn.addEventListener('click', () => openTaskModal(task.id));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn--danger btn--xs';
        delBtn.textContent = '✕';
        delBtn.setAttribute('aria-label', `Delete ${task.title}`);
        delBtn.addEventListener('click', () => deleteTask(task.id));

        actions.append(detailBtn, delBtn);
        li.append(checkbox, content, actions);
        ul.appendChild(li);
      });

      container.appendChild(ul);
    }

    /* --- View 2: Kanban Board View --- */
    function _renderKanbanView(container, tasks) {
      const board = document.createElement('div');
      board.className = 'kanban-board';

      const COLUMNS = [
        { key: 'todo',       label: '📋 To Do' },
        { key: 'inprogress', label: '⚡ In Progress' },
        { key: 'done',       label: '✅ Done' },
      ];

      COLUMNS.forEach((col) => {
        const colEl = document.createElement('div');
        colEl.className = 'kanban-col';
        colEl.dataset.status = col.key;

        // Drag & Drop handlers
        colEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          colEl.classList.add('is-drag-over');
        });
        colEl.addEventListener('dragleave', () => colEl.classList.remove('is-drag-over'));
        colEl.addEventListener('drop', (e) => {
          e.preventDefault();
          colEl.classList.remove('is-drag-over');
          const taskId = e.dataTransfer.getData('text/plain');
          if (taskId) moveTaskStatus(taskId, col.key);
        });

        const colTasks = tasks.filter((t) => t.status === col.key);

        const header = document.createElement('div');
        header.className = 'kanban-col__header';
        header.innerHTML = `<span>${col.label}</span><span class="badge">${colTasks.length}</span>`;
        colEl.appendChild(header);

        colTasks.forEach((task) => {
          const card = document.createElement('div');
          card.className = 'kanban-card';
          card.draggable = true;
          card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.id);
          });

          const title = document.createElement('div');
          title.className = 'kanban-card__title' + (task.completed ? ' task-item__title--completed' : '');
          title.textContent = task.title;
          card.appendChild(title);

          if (task.tag || task.deadline) {
            const meta = document.createElement('div');
            meta.className = 'task-item__meta';
            meta.appendChild(_createBadgeElements(task));
            card.appendChild(meta);
          }

          const footer = document.createElement('div');
          footer.className = 'kanban-card__footer';

          const statusSelect = document.createElement('select');
          statusSelect.className = 'select-sm';
          statusSelect.setAttribute('aria-label', `Move ${task.title}`);
          COLUMNS.forEach((opt) => {
            const o = document.createElement('option');
            o.value = opt.key;
            o.textContent = opt.label.replace(/^[^\s]+\s/, '');
            if (opt.key === task.status) o.selected = true;
            statusSelect.appendChild(o);
          });
          statusSelect.addEventListener('change', (e) => moveTaskStatus(task.id, e.target.value));

          const detailBtn = document.createElement('button');
          detailBtn.type = 'button';
          detailBtn.className = 'btn btn--ghost btn--xs';
          detailBtn.textContent = 'Edit';
          detailBtn.addEventListener('click', () => openTaskModal(task.id));

          footer.append(statusSelect, detailBtn);
          card.appendChild(footer);
          colEl.appendChild(card);
        });

        board.appendChild(colEl);
      });

      container.appendChild(board);
    }

    /* --- View 3: Calendar / Timeline View --- */
    function _renderCalendarView(container, tasks) {
      if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">Belum ada tugas untuk ditampilkan di Timeline.</div>';
        return;
      }

      const timeline = document.createElement('div');
      timeline.className = 'timeline-list';

      const groups = new Map();
      const unscheduled = [];

      const scheduled = tasks
        .filter((t) => t.deadline)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

      scheduled.forEach((task) => {
        const d = new Date(task.deadline);
        const dateKey = d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        if (!groups.has(dateKey)) groups.set(dateKey, []);
        groups.get(dateKey).push(task);
      });

      tasks.filter((t) => !t.deadline).forEach((t) => unscheduled.push(t));

      groups.forEach((dayTasks, dateLabel) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'timeline-group';

        const h = document.createElement('h3');
        h.className = 'timeline-group__heading';
        h.textContent = `📅 ${dateLabel}`;
        groupEl.appendChild(h);

        _renderListView(groupEl, dayTasks);
        timeline.appendChild(groupEl);
      });

      if (unscheduled.length > 0) {
        const groupEl = document.createElement('div');
        groupEl.className = 'timeline-group timeline-group--unscheduled';

        const h = document.createElement('h3');
        h.className = 'timeline-group__heading';
        h.textContent = '📌 Tanpa Deadline (Backlog)';
        groupEl.appendChild(h);

        _renderListView(groupEl, unscheduled);
        timeline.appendChild(groupEl);
      }

      container.appendChild(timeline);
    }

    function render() {
      const container = document.getElementById('task-view-container');
      const statsEl   = document.getElementById('task-stats');
      if (!container) return;

      const doneCount = _tasks.filter((t) => t.completed).length;
      if (statsEl) statsEl.textContent = `${doneCount}/${_tasks.length} done`;

      container.innerHTML = '';
      const sorted = _getSortedTasks();

      if (_currentView === 'kanban') {
        _renderKanbanView(container, sorted);
      } else if (_currentView === 'calendar') {
        _renderCalendarView(container, sorted);
      } else {
        _renderListView(container, sorted);
      }
    }

    function setView(viewName) {
      if (!['list', 'kanban', 'calendar'].includes(viewName)) return;
      _currentView = viewName;
      document.querySelectorAll('.view-switcher__btn').forEach((btn) => {
        const active = btn.dataset.view === viewName;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', String(active));
      });
      render();
    }

    function addTask(rawInput) {
      const trimmed = (rawInput || '').trim();
      if (!trimmed) {
        _showAddError('Task title cannot be empty.');
        return false;
      }

      const parsed = SmartNLP.parse(trimmed);
      if (!parsed.title) {
        _showAddError('Please provide a valid task title.');
        return false;
      }

      // Prevent duplicate task titles
      const duplicate = _tasks.some((t) => t.title.toLowerCase() === parsed.title.toLowerCase());
      if (duplicate) {
        _showAddError('Tugas dengan judul yang sama sudah ada.');
        return false;
      }

      _clearAddError();

      const task = {
        id: _newId(),
        title: parsed.title,
        completed: false,
        status: 'todo',
        tag: parsed.tag,
        deadline: parsed.deadline,
        createdAt: Date.now(),
      };

      _tasks.push(task);
      _persist();
      render();
      return true;
    }

    function toggleTask(id) {
      const task = _tasks.find((t) => t.id === id);
      if (!task) return;
      task.completed = !task.completed;
      task.status = task.completed ? 'done' : 'todo';
      _persist();
      render();
    }

    function moveTaskStatus(id, newStatus) {
      const task = _tasks.find((t) => t.id === id);
      if (!task) return;
      task.status = newStatus;
      task.completed = (newStatus === 'done');
      _persist();
      render();
    }

    function deleteTask(id) {
      _tasks = _tasks.filter((t) => t.id !== id);
      _persist();
      render();
    }

    /* --- Modal Detail & Edit --- */
    function openTaskModal(id) {
      const task = _tasks.find((t) => t.id === id);
      if (!task) return;
      _modalTaskId = id;

      document.getElementById('modal-task-title').value = task.title;
      document.getElementById('modal-task-status').value = task.status || (task.completed ? 'done' : 'todo');
      document.getElementById('modal-task-tag').value = task.tag || '';
      document.getElementById('modal-task-deadline').value = task.deadline || '';

      const modal = document.getElementById('task-modal');
      modal.classList.remove('modal--hidden');
      document.getElementById('modal-task-title').focus();
    }

    function closeTaskModal() {
      _modalTaskId = null;
      const modal = document.getElementById('task-modal');
      if (modal) modal.classList.add('modal--hidden');
    }

    function init(tasks) {
      _tasks = Array.isArray(tasks) ? tasks.map(_normalizeTask) : [];

      const form    = document.getElementById('add-task-form');
      const input   = document.getElementById('task-input');
      const preview = document.getElementById('task-nlp-preview');
      const sortSel = document.getElementById('task-sort');

      // Live Smart NLP Preview while typing
      if (input && preview) {
        input.addEventListener('input', () => {
          const val = input.value.trim();
          if (!val) {
            preview.classList.add('nlp-preview--hidden');
            return;
          }
          const parsed = SmartNLP.parse(val);
          if (parsed.hasMetadata) {
            preview.classList.remove('nlp-preview--hidden');
            preview.innerHTML = `
              <span>✨ Smart Deteksi:</span>
              <strong>${parsed.title}</strong>
              ${parsed.deadline ? `<span class="pill pill--date">⏰ ${SmartNLP.formatReadableDeadline(parsed.deadline)}</span>` : ''}
              ${parsed.tag ? `<span class="pill pill--tag">#${parsed.tag}</span>` : ''}
            `;
          } else {
            preview.classList.add('nlp-preview--hidden');
          }
        });
      }

      if (form && input) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (addTask(input.value)) {
            input.value = '';
            if (preview) preview.classList.add('nlp-preview--hidden');
          }
        });
      }

      // View Switcher Tabs
      document.querySelectorAll('.view-switcher__btn').forEach((btn) => {
        btn.addEventListener('click', () => setView(btn.dataset.view));
      });

      // Sort Selector
      if (sortSel) {
        sortSel.addEventListener('change', (e) => {
          _sortMode = e.target.value;
          render();
        });
      }

      // Modal Events
      const modalForm = document.getElementById('modal-edit-form');
      if (modalForm) {
        modalForm.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!_modalTaskId) return;
          const task = _tasks.find((t) => t.id === _modalTaskId);
          const newTitle = document.getElementById('modal-task-title').value.trim();
          if (task && newTitle) {
            task.title = newTitle;
            task.status = document.getElementById('modal-task-status').value;
            task.completed = (task.status === 'done');
            const rawTag = document.getElementById('modal-task-tag').value.trim().replace(/^#/, '');
            task.tag = rawTag || null;
            task.deadline = document.getElementById('modal-task-deadline').value || null;
            _persist();
            render();
          }
          closeTaskModal();
        });
      }

      const modalDelBtn = document.getElementById('modal-delete-btn');
      if (modalDelBtn) {
        modalDelBtn.addEventListener('click', () => {
          if (_modalTaskId) {
            deleteTask(_modalTaskId);
            closeTaskModal();
          }
        });
      }

      document.querySelectorAll('[data-close-modal="true"]').forEach((el) => {
        el.addEventListener('click', closeTaskModal);
      });
      const closeModalBtn = document.getElementById('modal-close-btn');
      if (closeModalBtn) closeModalBtn.addEventListener('click', closeTaskModal);

      render();
    }

    return { init, addTask, toggleTask, deleteTask, setView, closeTaskModal, render };
  }());

  /* ----------------------------------------------------------
     4e. QuickLinksWidget
     ---------------------------------------------------------- */
  const QuickLinksWidget = (function () {
    let _links = [];
    const MAX_LINKS = 20;
    const MAX_LABEL_LEN = 50;
    const MAX_URL_LEN = 2048;

    function _newId() {
      return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    }

    function _showError(elId, message) {
      const el = document.getElementById(elId);
      if (el) el.textContent = message;
    }

    function _clearErrors() {
      ['link-label-error', 'link-url-error', 'link-count-error'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
      });
    }

    function render() {
      const container = document.getElementById('link-items');
      const counter = document.getElementById('link-counter');
      if (!container) return;

      if (counter) counter.textContent = `${_links.length} / ${MAX_LINKS}`;
      container.innerHTML = '';

      _links.forEach((link) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'link-item';
        wrapper.dataset.id = link.id;

        const anchor = document.createElement('a');
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.className = 'link-item__btn';
        anchor.textContent = link.label;
        anchor.setAttribute('aria-label', `Open ${link.label} in a new tab`);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'link-item__delete';
        deleteBtn.textContent = '✕';
        deleteBtn.setAttribute('aria-label', `Delete link: ${link.label}`);
        deleteBtn.addEventListener('click', () => deleteLink(link.id));

        wrapper.append(anchor, deleteBtn);
        container.appendChild(wrapper);
      });
    }

    function addLink(label, url) {
      _clearErrors();
      let valid = true;
      const trimLabel = (label || '').trim();
      const trimUrl   = (url || '').trim();

      if (!trimLabel) {
        _showError('link-label-error', 'Label is required.');
        valid = false;
      } else if (trimLabel.length > MAX_LABEL_LEN) {
        _showError('link-label-error', `Max ${MAX_LABEL_LEN} chars.`);
        valid = false;
      }

      if (!trimUrl) {
        _showError('link-url-error', 'URL is required.');
        valid = false;
      } else if (trimUrl.length > MAX_URL_LEN) {
        _showError('link-url-error', `Max ${MAX_URL_LEN} chars.`);
        valid = false;
      } else if (!trimUrl.startsWith('http://') && !trimUrl.startsWith('https://')) {
        _showError('link-url-error', 'URL must start with http:// or https://');
        valid = false;
      }

      if (_links.length >= MAX_LINKS) {
        _showError('link-count-error', `Maximum of ${MAX_LINKS} links reached.`);
        valid = false;
      }

      if (!valid) return false;

      _links.push({ id: _newId(), label: trimLabel, url: trimUrl });
      StorageManager.save(StorageManager.KEYS.LINKS, _links);
      render();
      return true;
    }

    function deleteLink(id) {
      _links = _links.filter((l) => l.id !== id);
      StorageManager.save(StorageManager.KEYS.LINKS, _links);
      render();
    }

    function init(links) {
      _links = Array.isArray(links) ? links : [];
      const form = document.getElementById('add-link-form');
      const labelInput = document.getElementById('link-label-input');
      const urlInput = document.getElementById('link-url-input');

      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (addLink(labelInput.value, urlInput.value)) {
            labelInput.value = '';
            urlInput.value = '';
          }
        });
      }
      render();
    }

    return { init, addLink, deleteLink, render };
  }());

  /* ----------------------------------------------------------
     4f. KeyboardShortcuts & BannerWidget
     ---------------------------------------------------------- */
  const KeyboardShortcuts = (function () {
    function openHelp() {
      const modal = document.getElementById('shortcuts-modal');
      if (modal) modal.classList.remove('modal--hidden');
    }

    function closeHelp() {
      const modal = document.getElementById('shortcuts-modal');
      if (modal) modal.classList.add('modal--hidden');
    }

    function init() {
      const helpBtn = document.getElementById('shortcut-help-btn');
      if (helpBtn) helpBtn.addEventListener('click', openHelp);

      document.querySelectorAll('[data-close-shortcuts="true"]').forEach((el) => {
        el.addEventListener('click', closeHelp);
      });

      document.addEventListener('keydown', (e) => {
        const tag = document.activeElement ? document.activeElement.tagName : '';
        const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

        // Esc works everywhere (closes modals or blurs active input)
        if (e.key === 'Escape') {
          TaskListWidget.closeTaskModal();
          closeHelp();
          const nameForm = document.getElementById('name-form');
          if (nameForm) nameForm.classList.add('name-form--hidden');
          if (isTyping) document.activeElement.blur();
          return;
        }

        // Ignore single-key shortcuts while typing inside inputs
        if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;

        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            const taskInput = document.getElementById('task-input');
            if (taskInput) taskInput.focus();
            break;
          case ' ':
            e.preventDefault();
            TimerWidget.toggleStartStop();
            break;
          case '1':
            TaskListWidget.setView('list');
            break;
          case '2':
            TaskListWidget.setView('kanban');
            break;
          case '3':
            TaskListWidget.setView('calendar');
            break;
          case 'd':
            ThemeController.toggle();
            break;
          case '?':
            e.preventDefault();
            openHelp();
            break;
        }
      });
    }

    return { init };
  }());

  const BannerWidget = (function () {
    let _shown = false;
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
     4g. Bootstrap
     ---------------------------------------------------------- */
  function init() {
    const tasks = StorageManager.load(StorageManager.KEYS.TASKS);
    const links = StorageManager.load(StorageManager.KEYS.LINKS);

    ThemeController.init();
    GreetingWidget.init();
    TimerWidget.init();
    TaskListWidget.init(tasks);
    QuickLinksWidget.init(links);
    KeyboardShortcuts.init();

    if (!StorageManager.isAvailable() || StorageManager.unavailableFlag) {
      BannerWidget.show();
    }
  }

  return {
    init,
    GreetingWidget,
    TimerWidget,
    TaskListWidget,
    QuickLinksWidget,
    BannerWidget,
  };
}());

document.addEventListener('DOMContentLoaded', UIController.init);