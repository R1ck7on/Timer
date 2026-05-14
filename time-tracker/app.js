(function () {
  "use strict";

  const STORAGE_KEY = "timeTracker_v1";

  /** @typedef {{ id: string, name: string }} Task */
  /** @typedef {{ id: string, taskId: string, startedAt: number, endedAt: number }} Session */

  /** @type {string | null} */
  let memoryStore = null;
  /** @type {"local"|"session"|"memory"} */
  let storageBackend = "local";

  function parseState(raw) {
    if (!raw || typeof raw !== "string") return null;
    try {
      const data = JSON.parse(raw);
      return {
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
      };
    } catch {
      return null;
    }
  }

  function safeStorageGet(storage) {
    try {
      return storage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function loadState() {
    const lsRaw = safeStorageGet(localStorage);
    if (lsRaw) {
      const p = parseState(lsRaw);
      if (p) {
        storageBackend = "local";
        return p;
      }
    }
    const ssRaw = safeStorageGet(sessionStorage);
    if (ssRaw) {
      const p = parseState(ssRaw);
      if (p) {
        storageBackend = "session";
        return p;
      }
    }
    if (memoryStore) {
      const p = parseState(memoryStore);
      if (p) {
        storageBackend = "memory";
        return p;
      }
    }
    storageBackend = "local";
    return { tasks: [], sessions: [] };
  }

  function saveState(state) {
    const json = JSON.stringify({ tasks: state.tasks, sessions: state.sessions });
    try {
      localStorage.setItem(STORAGE_KEY, json);
      storageBackend = "local";
      setStorageNotice();
      return true;
    } catch {
      /* continue */
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, json);
      storageBackend = "session";
      setStorageNotice();
      return true;
    } catch {
      /* continue */
    }
    memoryStore = json;
    storageBackend = "memory";
    setStorageNotice();
    return false;
  }

  function setStorageNotice() {
    const el = document.getElementById("storageNotice");
    if (!el) return;
    const messages = {
      local: "",
      session:
        "Сохранение: только эта вкладка (sessionStorage). Закрыли вкладку — данные пропадут. Периодически делайте «Экспорт JSON».",
      memory:
        "Браузер не даёт сохранять на диск. Данные только пока открыта страница. Сразу сделайте «Экспорт JSON», чтобы не потерять.",
    };
    const m = messages[storageBackend];
    if (!m) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.classList.remove("hidden");
    el.textContent = m;
  }

  function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  }

  function formatDateTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const els = {
    taskChoice: document.getElementById("taskChoice"),
    taskChoiceEmpty: document.getElementById("taskChoiceEmpty"),
    btnNewTaskQuick: document.getElementById("btnNewTaskQuick"),
    clockDisplay: document.getElementById("clockDisplay"),
    btnStart: document.getElementById("btnStart"),
    btnPause: document.getElementById("btnPause"),
    btnStop: document.getElementById("btnStop"),
    timerHint: document.getElementById("timerHint"),
    formAddTask: document.getElementById("formAddTask"),
    newTaskName: document.getElementById("newTaskName"),
    taskList: document.getElementById("taskList"),
    sessionsBody: document.getElementById("sessionsBody"),
    sessionsEmpty: document.getElementById("sessionsEmpty"),
    totalsLine: document.getElementById("totalsLine"),
    btnExport: document.getElementById("btnExport"),
    btnCopyJson: document.getElementById("btnCopyJson"),
    importFile: document.getElementById("importFile"),
    btnClearHistory: document.getElementById("btnClearHistory"),
    modalOverlay: document.getElementById("modalOverlay"),
    quickTaskName: document.getElementById("quickTaskName"),
  };

  let state = loadState();
  setStorageNotice();

  let running = false;
  let paused = false;
  let segmentStart = null;
  let accumulatedMs = 0;
  let activeTaskId = null;
  let tickId = null;
  /** @type {string | null} выбранная для таймера задача (не путать с activeTaskId во время записи) */
  let selectedTimerTaskId = null;

  function taskById(id) {
    return state.tasks.find((t) => t.id === id);
  }

  function getSelectedTaskId() {
    if (selectedTimerTaskId && taskById(selectedTimerTaskId)) {
      return selectedTimerTaskId;
    }
    return null;
  }

  /**
   * @param {string | null} [preferId] — выбрать эту задачу после перерисовки
   */
  function refreshTaskChoice(preferId) {
    const box = els.taskChoice;
    box.innerHTML = "";

    if (state.tasks.length === 0) {
      selectedTimerTaskId = null;
      els.taskChoiceEmpty.classList.remove("hidden");
      return;
    }

    els.taskChoiceEmpty.classList.add("hidden");

    let next =
      preferId && taskById(preferId)
        ? preferId
        : selectedTimerTaskId && taskById(selectedTimerTaskId)
          ? selectedTimerTaskId
          : state.tasks[0].id;

    selectedTimerTaskId = next;

    state.tasks.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "task-chip";
      btn.dataset.taskId = t.id;
      btn.textContent = t.name;
      btn.setAttribute("aria-pressed", t.id === selectedTimerTaskId ? "true" : "false");
      btn.addEventListener("click", () => {
        if (running && !paused) return;
        selectedTimerTaskId = t.id;
        syncTaskChoiceVisual();
        updateTimerUI();
      });
      box.appendChild(btn);
    });
    syncTaskChoiceVisual();
  }

  function syncTaskChoiceVisual() {
    const box = els.taskChoice;
    if (!box.querySelector(".task-chip")) return;
    const highlight =
      running || paused ? activeTaskId : selectedTimerTaskId;
    if (!highlight) return;
    box.querySelectorAll(".task-chip").forEach((b) => {
      b.setAttribute(
        "aria-pressed",
        b.dataset.taskId === highlight ? "true" : "false"
      );
    });
  }

  function refreshTaskList() {
    els.taskList.innerHTML = "";
    state.tasks.forEach((t) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.className = "name";
      span.textContent = t.name;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-ghost btn-sm danger-text";
      del.textContent = "Удалить";
      del.addEventListener("click", () => removeTask(t.id));
      li.appendChild(span);
      li.appendChild(del);
      els.taskList.appendChild(li);
    });
  }

  function refreshSessionsTable() {
    const sessions = [...state.sessions].sort((a, b) => b.startedAt - a.startedAt);
    els.sessionsBody.innerHTML = "";
    if (sessions.length === 0) {
      els.sessionsEmpty.classList.remove("hidden");
    } else {
      els.sessionsEmpty.classList.add("hidden");
    }

    const totalsByTask = {};
    sessions.forEach((s) => {
      const dur = s.endedAt - s.startedAt;
      totalsByTask[s.taskId] = (totalsByTask[s.taskId] || 0) + dur;
    });

    sessions.forEach((s) => {
      const task = taskById(s.taskId);
      const name = task ? task.name : "(удалённая задача)";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(name)}</td>
        <td>${formatDateTime(s.startedAt)}</td>
        <td>${formatDateTime(s.endedAt)}</td>
        <td>${formatDuration(s.endedAt - s.startedAt)}</td>
        <td></td>
      `;
      const tdBtn = tr.querySelector("td:last-child");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost btn-sm danger-text";
      btn.textContent = "×";
      btn.title = "Удалить запись";
      btn.addEventListener("click", () => removeSession(s.id));
      tdBtn.appendChild(btn);
      els.sessionsBody.appendChild(tr);
    });

    const parts = Object.entries(totalsByTask).map(([tid, ms]) => {
      const t = taskById(tid);
      const label = t ? t.name : "прочее";
      return `${label}: ${formatDuration(ms)}`;
    });
    els.totalsLine.textContent =
      parts.length > 0 ? "Итого по задачам: " + parts.join(" · ") : "";
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function persist(preferTaskId) {
    saveState(state);
    refreshTaskChoice(preferTaskId ?? null);
    refreshTaskList();
    refreshSessionsTable();
    updateTimerUI();
  }

  function currentElapsedMs() {
    let ms = accumulatedMs;
    if (running && !paused && segmentStart != null) {
      ms += Date.now() - segmentStart;
    }
    return ms;
  }

  function updateClock() {
    els.clockDisplay.textContent = formatDuration(currentElapsedMs());
  }

  function startTick() {
    stopTick();
    tickId = setInterval(updateClock, 250);
  }

  function stopTick() {
    if (tickId != null) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  function updateTimerUI() {
    const hasTasks = state.tasks.length > 0;
    const taskId = getSelectedTaskId();

    if (running && !paused) {
      els.btnStart.disabled = true;
      els.btnPause.disabled = false;
    } else if (running && paused) {
      els.btnStart.disabled = !taskId;
      els.btnPause.disabled = true;
    } else {
      els.btnStart.disabled = !hasTasks || !taskId;
      els.btnPause.disabled = true;
    }

    const elapsed = currentElapsedMs();
    els.btnStop.disabled = !(running || paused) || elapsed <= 0;

    if (!running && !paused) {
      els.timerHint.textContent = "Выберите задачу и нажмите «Старт».";
    } else if (paused) {
      els.timerHint.textContent = "Пауза. «Старт» продолжит отсчёт.";
    } else {
      const t = taskById(activeTaskId);
      els.timerHint.textContent = t ? `Идёт учёт: «${t.name}»` : "";
    }

    updateClock();
    syncTaskChoiceVisual();
  }

  function beginSession(taskId) {
    activeTaskId = taskId;
    selectedTimerTaskId = taskId;
    running = true;
    paused = false;
    accumulatedMs = 0;
    segmentStart = Date.now();
    startTick();
    updateTimerUI();
  }

  function resumeSession() {
    if (!paused) return;
    paused = false;
    segmentStart = Date.now();
    startTick();
    updateTimerUI();
  }

  function pauseSession() {
    if (!running || paused) return;
    accumulatedMs += Date.now() - segmentStart;
    segmentStart = null;
    paused = true;
    stopTick();
    updateTimerUI();
  }

  function stopAndRecord() {
    const ms = currentElapsedMs();
    if (ms <= 0 || !activeTaskId) return;
    const end = Date.now();
    const start = end - ms;
    state.sessions.push({
      id: uid(),
      taskId: activeTaskId,
      startedAt: start,
      endedAt: end,
    });
    running = false;
    paused = false;
    accumulatedMs = 0;
    segmentStart = null;
    activeTaskId = null;
    stopTick();
    saveState(state);
    refreshSessionsTable();
    updateTimerUI();
  }

  function openQuickTaskModal() {
    if (!els.modalOverlay) return;
    els.quickTaskName.value = "";
    els.modalOverlay.classList.remove("hidden");
    els.modalOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => els.quickTaskName.focus(), 0);
  }

  function closeQuickTaskModal() {
    if (!els.modalOverlay) return;
    els.modalOverlay.classList.add("hidden");
    els.modalOverlay.setAttribute("aria-hidden", "true");
  }

  els.btnStart.addEventListener("click", () => {
    const selected = getSelectedTaskId();
    if (!running && !paused) {
      if (!selected) return;
      beginSession(selected);
    } else if (paused) {
      if (!selected) return;
      if (selected === activeTaskId) {
        resumeSession();
      } else {
        if (
          !confirm(
            "Сменить задачу? Текущая сессия на паузе — она будет сброшена без сохранения."
          )
        ) {
          return;
        }
        running = false;
        paused = false;
        accumulatedMs = 0;
        segmentStart = null;
        stopTick();
        beginSession(selected);
      }
    }
  });

  els.btnPause.addEventListener("click", pauseSession);

  els.btnStop.addEventListener("click", stopAndRecord);

  els.formAddTask.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.newTaskName.value.trim();
    if (!name) return;
    const newTask = { id: uid(), name };
    state.tasks.push(newTask);
    els.newTaskName.value = "";
    persist(newTask.id);
  });

  function removeTask(id) {
    const hasSessions = state.sessions.some((s) => s.taskId === id);
    if (
      hasSessions &&
      !confirm(
        "У задачи есть записи в истории. Удалить задачу? (история останется с пометкой)"
      )
    ) {
      return;
    }
    if (activeTaskId === id && (running || paused)) {
      if (!confirm("Таймер активен для этой задачи. Сбросить и удалить?")) return;
      running = false;
      paused = false;
      accumulatedMs = 0;
      segmentStart = null;
      activeTaskId = null;
      stopTick();
    }
    state.tasks = state.tasks.filter((t) => t.id !== id);
    persist();
  }

  function removeSession(id) {
    state.sessions = state.sessions.filter((s) => s.id !== id);
    persist();
  }

  function buildExportJson() {
    return JSON.stringify(state, null, 2);
  }

  function exportFileName() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `time-tracker-backup-${stamp}.json`;
  }

  els.btnExport.addEventListener("click", async () => {
    const json = buildExportJson();
    const name = exportFileName();

    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await showSaveFilePicker({
          suggestedName: name,
          types: [
            {
              description: "JSON",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }

    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (win) {
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return;
    }

    try {
      await navigator.clipboard.writeText(json);
      alert(
        "Всплывающие окна заблокированы. JSON скопирован в буфер — вставьте в Блокнот и сохраните как файл .json"
      );
    } catch {
      alert(
        "Не удалось открыть новую вкладку (часто из‑за блокировки всплывающих окон) и не удалось скопировать в буфер. Разрешите всплывающие окна для этого файла или нажмите «Копировать JSON»."
      );
    }
    URL.revokeObjectURL(url);
  });

  if (els.btnCopyJson) {
    els.btnCopyJson.addEventListener("click", async () => {
      const json = buildExportJson();
      try {
        await navigator.clipboard.writeText(json);
        alert("JSON скопирован в буфер. Вставьте в Блокнот и сохраните как файл .json");
      } catch {
        alert(
          "Буфер недоступен. Нажмите «Экспорт (вкладка)» и разрешите всплывающие окна — в открывшейся вкладке нажмите Ctrl+S."
        );
      }
    });
  }

  els.importFile.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data.tasks) || !Array.isArray(data.sessions)) {
          alert("Файл не похож на резервную копию Time Tracker.");
          return;
        }
        if (!confirm("Заменить текущие данные импортом?")) return;
        state = { tasks: data.tasks, sessions: data.sessions };
        if (running || paused) {
          running = false;
          paused = false;
          accumulatedMs = 0;
          segmentStart = null;
          activeTaskId = null;
          stopTick();
        }
        persist();
      } catch {
        alert("Не удалось прочитать JSON.");
      }
    };
    reader.readAsText(file, "UTF-8");
  });

  els.btnClearHistory.addEventListener("click", () => {
    if (!confirm("Удалить все записи истории? Задачи останутся.")) return;
    state.sessions = [];
    persist();
  });

  els.btnNewTaskQuick.addEventListener("click", openQuickTaskModal);

  document.getElementById("modalCancel").addEventListener("click", closeQuickTaskModal);

  document.getElementById("modalOk").addEventListener("click", () => {
    const name = els.quickTaskName.value.trim();
    if (!name) {
      els.quickTaskName.focus();
      return;
    }
    const newTask = { id: uid(), name };
    state.tasks.push(newTask);
    closeQuickTaskModal();
    persist(newTask.id);
  });

  if (els.modalOverlay) {
    els.modalOverlay.addEventListener("click", (e) => {
      if (e.target === els.modalOverlay) closeQuickTaskModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      els.modalOverlay &&
      !els.modalOverlay.classList.contains("hidden")
    ) {
      closeQuickTaskModal();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && running && !paused) {
      updateClock();
    }
  });

  refreshTaskChoice(null);
  refreshTaskList();
  refreshSessionsTable();
  updateTimerUI();
})();
