// Daily Standup Timer - injected into every page
(function() {
  'use strict';

  if (window.__dailyTimerInjected) return;
  window.__dailyTimerInjected = true;

  const STEP = 15;
  const MIN_DURATION = 15;
  const MAX_DURATION = 600;
  const CIRC = 471.24; // 2 * PI * 75 (radius)

  // ===== i18n (default English, Spanish if browser language is Spanish) =====
  const STRINGS = {
    en: {
      title: 'Daily timer',
      minimize: 'Minimize',
      close: 'Close (click the icon to reopen)',
      expand: 'Expand',
      person: 'Person',
      duration: 'Duration',
      start: 'Start',
      pause: 'Pause',
      resume: 'Resume',
      next: 'Next',
      reset: 'Reset',
      sound: 'Sound',
      paused: 'paused',
      running: 'running',
      almostDone: 'almost done',
      overtime: 'time exceeded',
      configurePeople: 'Configure people',
      peopleTitle: 'People',
      closePanel: 'Close panel',
      addPlaceholder: 'Name',
      addBtn: 'Add',
      removeTitle: 'Remove',
      randomOrder: 'Random order',
      upNext: 'Up next',
      noPeopleHint: 'No one added yet. The counter will show Person 1, 2…',
      stranger: 'Stranger',
      showOrder: 'Show running order',
      hideOrder: 'Hide running order',
      linearFilter: 'Auto-filter Linear by speaker',
    },
    es: {
      title: 'Daily timer',
      minimize: 'Minimizar',
      close: 'Cerrar (clic en el ícono para reabrir)',
      expand: 'Expandir',
      person: 'Persona',
      duration: 'Duración',
      start: 'Iniciar',
      pause: 'Pausar',
      resume: 'Reanudar',
      next: 'Siguiente',
      reset: 'Reiniciar',
      sound: 'Sonido',
      paused: 'en pausa',
      running: 'en curso',
      almostDone: 'queda poco',
      overtime: 'tiempo excedido',
      configurePeople: 'Configurar personas',
      peopleTitle: 'Personas',
      closePanel: 'Cerrar panel',
      addPlaceholder: 'Nombre',
      addBtn: 'Agregar',
      removeTitle: 'Quitar',
      randomOrder: 'Orden aleatorio',
      upNext: 'Sigue',
      noPeopleHint: 'Aún no agregaste a nadie. El contador mostrará Persona 1, 2…',
      stranger: 'Desconocido',
      showOrder: 'Mostrar orden de la daily',
      hideOrder: 'Ocultar orden de la daily',
      linearFilter: 'Filtrar Linear automáticamente',
    },
  };
  const t = (navigator.language || 'en').toLowerCase().startsWith('es') ? STRINGS.es : STRINGS.en;

  // State
  let totalDuration = 120;
  let remaining = totalDuration;
  let running = false;
  let intervalId = null;
  let personCount = 1;
  let warned = false;
  let finished = false;
  let soundOn = true;
  let visible = true;
  let collapsed = false;
  let people = [];
  let randomOrder = false;
  let order = []; // current cycling order; in-memory only (re-shuffled per daily)
  let dailyStarted = false;
  let panelOpen = false;
  let orderViewOpen = false;
  let linearFilterEnabled = false;
  let lastLinearFilterName = null; // last name we successfully clicked in Linear's panel
  let applyingLinearFilter = false;
  let linearPanelOpenedByUs = false; // whether we opened Linear's right panel for this daily
  const spoken = new Set(); // names already spoken in the current daily
  const linearAvatars = new Map(); // person name → { type: 'img'|'initials', src?, initials?, bgColor? }

  // Restore preferences
  chrome.storage.local.get(
    ['totalDuration', 'soundOn', 'visible', 'collapsed', 'position', 'people', 'randomOrder', 'orderViewOpen', 'linearFilterEnabled'],
    (data) => {
      if (typeof data.totalDuration === 'number') totalDuration = data.totalDuration;
      if (typeof data.soundOn === 'boolean') soundOn = data.soundOn;
      if (typeof data.visible === 'boolean') visible = data.visible;
      if (typeof data.collapsed === 'boolean') collapsed = data.collapsed;
      if (Array.isArray(data.people)) people = data.people.filter(p => typeof p === 'string');
      if (typeof data.randomOrder === 'boolean') randomOrder = data.randomOrder;
      if (typeof data.orderViewOpen === 'boolean') orderViewOpen = data.orderViewOpen;
      if (typeof data.linearFilterEnabled === 'boolean') linearFilterEnabled = data.linearFilterEnabled;
      remaining = totalDuration;
      buildOrder();
      init(data.position);
    }
  );

  function persist() {
    chrome.storage.local.set({ totalDuration, soundOn, visible, collapsed, people, randomOrder, orderViewOpen, linearFilterEnabled });
  }

  function persistPosition(top, right) {
    chrome.storage.local.set({ position: { top, right } });
  }

  // ===== Audio =====
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { return null; }
    }
    return audioCtx;
  }
  function beep(freq, duration, volume) {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }
  function warningSound() {
    beep(660, 0.15, 0.2);
    setTimeout(() => beep(660, 0.15, 0.2), 200);
  }
  function endSound() {
    beep(880, 0.2, 0.25);
    setTimeout(() => beep(1100, 0.2, 0.25), 220);
    setTimeout(() => beep(1320, 0.4, 0.3), 440);
  }

  // ===== Helpers =====
  function getWarningThreshold() {
    return Math.min(30, Math.floor(totalDuration / 4));
  }
  function format(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  function buildOrder() {
    order = [...people];
    if (randomOrder) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
  }

  // ===== Linear auto-filter =====
  function isOnLinear() {
    return /(?:^|\.)linear\.app$/i.test(location.hostname);
  }

  // Find a clickable row in Linear's right Assignees panel whose visible text
  // contains the speaker's name (or its email-local). Best-effort and brittle:
  // Linear's class names are obfuscated, so we rely on text + viewport region.
  function findLinearAssigneeRow(name) {
    const target = name.toLowerCase().trim();
    if (!target) return null;
    const rightCutoff = window.innerWidth * 0.55;
    const candidates = document.querySelectorAll('button, [role="button"], [role="option"], [role="menuitem"], a, li');
    let best = null;
    let bestScore = -1;
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').toLowerCase().trim();
      if (!text || text.length > 80 || text.length < target.length) continue;
      // Substring match against displayed text (covers display name + email).
      if (!text.includes(target)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Right-side panel only — skip the issue list, header pills, etc.
      if (rect.left < rightCutoff) continue;
      let score = 0;
      if (text.includes('@')) score += 10;       // email row
      if (text.length < 50) score += 4;          // short row, more likely a list item
      if (rect.left > window.innerWidth * 0.7) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function extractAvatarFromRow(row) {
    // Avatar is either an <img> (uploaded photo) or a <div> with bg color + initials.
    const img = row.querySelector('img[alt*="Avatar"], img[width="18"]');
    if (img && img.src) return { type: 'img', src: img.src };
    const div = row.querySelector('div[aria-label][style*="backgroundColor"]');
    if (div) {
      const initials = (div.textContent || '').trim();
      const style = div.getAttribute('style') || '';
      const match = style.match(/--x-backgroundColor:\s*([^;]+)/);
      const bgColor = match ? match[1].trim() : '';
      if (initials) return { type: 'initials', initials, bgColor };
    }
    return null;
  }

  function scrapeLinearAvatars() {
    if (!isOnLinear() || people.length === 0) return;
    const rightCutoff = window.innerWidth * 0.55;
    const rows = document.querySelectorAll('div[role="button"][tabindex="0"]');
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.left < rightCutoff) continue;
      const text = (row.innerText || '').toLowerCase();
      if (!text || text.length > 80) continue;
      const avatar = extractAvatarFromRow(row);
      if (!avatar) continue;
      // Match this row to one of our people by substring (first match wins).
      for (const personName of people) {
        if (linearAvatars.has(personName)) continue;
        const target = personName.toLowerCase().trim();
        if (target && text.includes(target)) {
          linearAvatars.set(personName, avatar);
          break;
        }
      }
    }
  }

  function createAvatarEl(name) {
    const data = linearAvatars.get(name);
    if (!data) return null;
    if (data.type === 'img') {
      const img = document.createElement('img');
      img.src = data.src;
      img.className = 'dt-avatar';
      img.alt = '';
      return img;
    }
    const div = document.createElement('div');
    div.className = 'dt-avatar dt-avatar-initials';
    if (data.bgColor) div.style.background = data.bgColor;
    div.textContent = data.initials;
    return div;
  }

  function findLinearPanelToggle() {
    // The right-side details panel toggle. aria-label flips between "Open details" and "Close details".
    return document.querySelector(
      'button[aria-label="Open details"], button[aria-label="Close details"]'
    );
  }

  function isLinearPanelOpen(toggle) {
    return !!toggle && toggle.getAttribute('aria-expanded') === 'true';
  }

  function realClick(el) {
    // Some custom button libraries listen on pointerdown/mouseup, not just click.
    // Fire the full sequence to mimic a real user click.
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const opts = {
      bubbles: true, cancelable: true, composed: true, view: window,
      button: 0, buttons: 1,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (_) {}
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    try { el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 })); } catch (_) {}
    el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
  }

  function ensureLinearNarrowStyles() {
    if (document.getElementById('dt-linear-narrow-style')) return;
    const style = document.createElement('style');
    style.id = 'dt-linear-narrow-style';
    // While the daily is running, narrow the right panel to 125px so only the
    // assignee avatars are visible (no slide animation, no big reflow).
    // Rows inside still have a valid bounding rect, so findLinearAssigneeRow
    // + dispatchEvent keep working.
    style.textContent = `
      body.dt-linear-narrow-panel div:has(> aside [data-restore-scroll-view="predefined-view-sidebar"]) {
        width: 125px !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function pressLinearPanelShortcut() {
    // Cmd+I on Mac, Ctrl+I elsewhere. Dispatch on multiple targets — Linear's
    // hotkey listener may be attached to any of these, depending on focus state.
    const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
    const init = {
      key: 'i',
      code: 'KeyI',
      keyCode: 73,
      which: 73,
      bubbles: true,
      cancelable: true,
      composed: true,
      metaKey: isMac,
      ctrlKey: !isMac,
    };
    const targets = [document, window, document.body, document.activeElement];
    for (const target of targets) {
      if (!target) continue;
      try {
        target.dispatchEvent(new KeyboardEvent('keydown', init));
        target.dispatchEvent(new KeyboardEvent('keyup', init));
      } catch (_) {}
    }
  }

  function waitFor(predicate, timeoutMs) {
    // setInterval-based polling — more reliable than requestAnimationFrame,
    // which can stall under heavy main-thread work or focus changes.
    return new Promise(resolve => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        let result;
        try { result = predicate(); } catch (_) { result = null; }
        if (result) { clearInterval(interval); resolve(result); return; }
        if (Date.now() - startTime > timeoutMs) { clearInterval(interval); resolve(null); }
      }, 60);
    });
  }

  async function applyLinearFilter(name) {
    if (!linearFilterEnabled || !isOnLinear() || !name) return;
    // For "Stranger N" speakers, filter Linear by "No assignee".
    const searchTerm = name.startsWith(t.stranger) ? 'No assignee' : name;
    if (searchTerm === lastLinearFilterName) return;
    if (applyingLinearFilter) return; // prevent concurrent runs racing on the panel
    applyingLinearFilter = true;
    const isFirstCall = !document.body.classList.contains('dt-linear-narrow-panel');
    try {
      // First call of the daily: narrow the panel and (if needed) open it.
      // Subsequent calls reuse the already-open, already-narrowed panel.
      if (isFirstCall) {
        ensureLinearNarrowStyles();
        const toggle = findLinearPanelToggle();
        const wasClosed = !toggle || !isLinearPanelOpen(toggle);
        document.body.classList.add('dt-linear-narrow-panel');
        if (wasClosed) {
          linearPanelOpenedByUs = true;
          pressLinearPanelShortcut();
        } else {
          linearPanelOpenedByUs = false;
        }
      }

      // Wait for the row to appear (panel + lazy-loaded content).
      const row = await waitFor(() => findLinearAssigneeRow(searchTerm), 6000);
      if (!row) return;

      // First call: scrape avatars from the panel before clicking (rows are
      // currently in their stable, unfiltered state).
      if (isFirstCall) {
        scrapeLinearAvatars();
        renderOrderView();
        renderPeopleList();
      }

      realClick(row);
      lastLinearFilterName = searchTerm;
    } finally {
      applyingLinearFilter = false;
    }
  }

  function endLinearFilterSession() {
    const hadNarrowClass = document.body.classList.contains('dt-linear-narrow-panel');
    if (hadNarrowClass) {
      if (linearPanelOpenedByUs) {
        pressLinearPanelShortcut(); // close — Linear will animate it shut at 30px width
        linearPanelOpenedByUs = false;
        // Remove the narrowing override after the close animation settles, so
        // the panel doesn't briefly snap to 360px before disappearing.
        setTimeout(() => document.body.classList.remove('dt-linear-narrow-panel'), 350);
      } else {
        // Was already open — leave it open, just restore its natural width.
        document.body.classList.remove('dt-linear-narrow-panel');
      }
    }
    lastLinearFilterName = null;
    if (linearAvatars.size > 0) {
      linearAvatars.clear();
      renderOrderView();
      renderPeopleList();
    }
  }

  // ===== UI =====
  let root, ring, timeDisplay, phaseLabel, statusDot,
      currentNameEl, nextUpEl,
      durationDisplayEl, btnPlus, btnMinus, btnStart, btnNext,
      btnReset, soundToggle, miniTime, header,
      sidePanelEl, peopleListEl, addInputEl, addFormEl, randomToggleEl,
      orderListEl, btnOrderToggle, btnPeopleToggle, linearFilterToggleEl;

  function buildUI() {
    root = document.createElement('div');
    root.id = 'daily-timer-root';
    root.innerHTML = `
      <div class="dt-side-panel">
        <div class="dt-panel-header">
          <span class="dt-panel-title">${t.peopleTitle}</span>
          <button class="dt-icon-btn" data-action="closePanel" title="${t.closePanel}">×</button>
        </div>
        <div class="dt-panel-body">
          <form class="dt-add-form">
            <input type="text" class="dt-add-input" placeholder="${t.addPlaceholder}" maxlength="40" />
            <button type="submit" class="dt-btn dt-btn-primary dt-add-btn">${t.addBtn}</button>
          </form>
          <ul class="dt-people-list"></ul>
          <label class="dt-random-toggle">
            <input type="checkbox" data-action="random" />
            <span>${t.randomOrder}</span>
          </label>
          <label class="dt-random-toggle">
            <input type="checkbox" data-action="linearFilter" />
            <span>${t.linearFilter}</span>
          </label>
        </div>
      </div>
      <div class="dt-card">
        <div class="dt-header">
          <div class="dt-header-left">
            <div class="dt-status-dot"></div>
            <span class="dt-title-text">${t.title}</span>
          </div>
          <div class="dt-header-buttons">
            <button class="dt-icon-btn" data-action="people" title="${t.configurePeople}">☰</button>
            <button class="dt-icon-btn dt-order-btn" data-action="toggleOrder" title="${t.showOrder}">⇅</button>
            <button class="dt-icon-btn" data-action="collapse" title="${t.minimize}">−</button>
            <button class="dt-icon-btn" data-action="close" title="${t.close}">×</button>
          </div>
        </div>
        <div class="dt-mini">
          <div class="dt-status-dot"></div>
          <span class="dt-mini-time">2:00</span>
          <button class="dt-icon-btn" data-action="expand" title="${t.expand}">▢</button>
        </div>
        <div class="dt-body">
          <div class="dt-counter">
            <div class="dt-current-name"></div>
            <div class="dt-next-up" hidden></div>
          </div>
          <div class="dt-ring-wrap">
            <svg viewBox="0 0 160 160">
              <circle class="dt-ring-bg" cx="80" cy="80" r="75"></circle>
              <circle class="dt-ring-fg" cx="80" cy="80" r="75"></circle>
            </svg>
            <div class="dt-time-display">
              <div class="dt-time">2:00</div>
              <div class="dt-phase">${t.paused}</div>
            </div>
          </div>
          <div class="dt-duration-config">
            <span class="dt-label">${t.duration}</span>
            <button class="dt-step-btn" data-action="minus">−</button>
            <span class="dt-duration-display">2:00</span>
            <button class="dt-step-btn" data-action="plus">+</button>
          </div>
          <div class="dt-controls">
            <button class="dt-btn dt-btn-primary" data-action="start">${t.start}</button>
            <button class="dt-btn" data-action="next">${t.next}</button>
            <button class="dt-btn" data-action="reset">${t.reset}</button>
          </div>
          <div class="dt-footer">
            <label>
              <input type="checkbox" data-action="sound" />
              ${t.sound}
            </label>
          </div>
        </div>
        <div class="dt-order-view">
          <ol class="dt-order-list"></ol>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    // Cache refs
    ring = root.querySelector('.dt-ring-fg');
    timeDisplay = root.querySelector('.dt-time');
    phaseLabel = root.querySelector('.dt-phase');
    statusDot = root.querySelectorAll('.dt-status-dot');
    currentNameEl = root.querySelector('.dt-current-name');
    nextUpEl = root.querySelector('.dt-next-up');
    durationDisplayEl = root.querySelector('.dt-duration-display');
    btnPlus = root.querySelector('[data-action="plus"]');
    btnMinus = root.querySelector('[data-action="minus"]');
    btnStart = root.querySelector('[data-action="start"]');
    btnNext = root.querySelector('[data-action="next"]');
    btnReset = root.querySelector('[data-action="reset"]');
    soundToggle = root.querySelector('[data-action="sound"]');
    miniTime = root.querySelector('.dt-mini-time');
    header = root.querySelector('.dt-header');
    sidePanelEl = root.querySelector('.dt-side-panel');
    peopleListEl = root.querySelector('.dt-people-list');
    addInputEl = root.querySelector('.dt-add-input');
    addFormEl = root.querySelector('.dt-add-form');
    randomToggleEl = root.querySelector('[data-action="random"]');
    orderListEl = root.querySelector('.dt-order-list');
    btnOrderToggle = root.querySelector('[data-action="toggleOrder"]');
    btnPeopleToggle = root.querySelector('[data-action="people"]');
    linearFilterToggleEl = root.querySelector('[data-action="linearFilter"]');

    soundToggle.checked = soundOn;
    randomToggleEl.checked = randomOrder;
    linearFilterToggleEl.checked = linearFilterEnabled;
  }

  function applyVisibility() {
    if (!visible) root.classList.add('dt-hidden');
    else root.classList.remove('dt-hidden');
    if (collapsed) {
      root.classList.add('dt-collapsed');
      // Collapsing closes the panel/order view — it doesn't make sense over a mini bar.
      panelOpen = false;
      orderViewOpen = false;
    } else {
      root.classList.remove('dt-collapsed');
    }
    if (panelOpen) root.classList.add('dt-panel-open');
    else root.classList.remove('dt-panel-open');
    if (orderViewOpen) root.classList.add('dt-order-open');
    else root.classList.remove('dt-order-open');
    if (btnOrderToggle) {
      btnOrderToggle.classList.toggle('dt-active', orderViewOpen);
      btnOrderToggle.title = orderViewOpen ? t.hideOrder : t.showOrder;
    }
    if (btnPeopleToggle) {
      btnPeopleToggle.classList.toggle('dt-active', panelOpen);
    }
  }

  // ===== Render =====
  function setStatus(state) {
    statusDot.forEach(d => {
      d.classList.remove('dt-running', 'dt-warning', 'dt-over');
      if (state) d.classList.add(state);
    });
  }

  function updateRing() {
    const ratio = Math.max(0, Math.min(1, remaining / totalDuration));
    ring.setAttribute('stroke-dashoffset', CIRC * (1 - ratio));
    if (remaining <= 0) {
      ring.setAttribute('stroke', '#E24B4A');
    } else if (remaining <= getWarningThreshold()) {
      ring.setAttribute('stroke', '#EF9F27');
    } else {
      ring.setAttribute('stroke', '#1D9E75');
    }
  }

  function render() {
    let timeText, isOver = false;
    if (remaining < 0) {
      timeText = '+' + format(Math.abs(remaining));
      isOver = true;
    } else {
      timeText = format(remaining);
    }
    timeDisplay.textContent = timeText;
    miniTime.textContent = timeText;
    timeDisplay.classList.toggle('dt-over', isOver);
    miniTime.classList.toggle('dt-over', isOver);

    if (isOver) {
      phaseLabel.textContent = t.overtime;
      phaseLabel.classList.add('dt-over');
      setStatus('dt-over');
    } else {
      phaseLabel.classList.remove('dt-over');
      if (running) {
        phaseLabel.textContent = remaining <= getWarningThreshold() ? t.almostDone : t.running;
        setStatus(remaining <= getWarningThreshold() ? 'dt-warning' : 'dt-running');
      } else {
        phaseLabel.textContent = t.paused;
        setStatus(null);
      }
    }
    updateRing();
  }

  function updateDurationDisplay() {
    durationDisplayEl.textContent = format(totalDuration);
    btnMinus.disabled = totalDuration <= MIN_DURATION;
    btnPlus.disabled = totalDuration >= MAX_DURATION;
  }

  function nameAt(idx) {
    // idx is 0-based position in the daily.
    // 0..order.length-1 → named person; beyond → "Stranger N" (counted from 1).
    if (idx < order.length) return order[idx];
    return `${t.stranger} ${idx - order.length + 1}`;
  }

  function updateCounter() {
    if (people.length === 0) {
      currentNameEl.textContent = `${t.person} ${personCount}`;
      nextUpEl.hidden = true;
      return;
    }
    const idx = personCount - 1;
    currentNameEl.textContent = nameAt(idx);
    nextUpEl.textContent = `${t.upNext}: ${nameAt(idx + 1)}`;
    nextUpEl.hidden = false;
  }

  function renderOrderView() {
    if (!orderListEl) return;
    orderListEl.innerHTML = '';
    // Order view shows the named participants only (strangers are dynamic).
    if (order.length === 0) {
      const li = document.createElement('li');
      li.className = 'dt-order-empty';
      li.textContent = t.noPeopleHint;
      orderListEl.appendChild(li);
      return;
    }
    const currentIdx = personCount - 1;
    order.forEach((name, i) => {
      const li = document.createElement('li');
      li.className = 'dt-order-item';
      li.draggable = true;
      li.dataset.orderIdx = String(i);
      if (spoken.has(name)) li.classList.add('dt-spoken');
      if (i === currentIdx && currentIdx < order.length) li.classList.add('dt-current');

      const handle = document.createElement('span');
      handle.className = 'dt-order-handle';
      handle.textContent = '⋮⋮';

      const num = document.createElement('span');
      num.className = 'dt-order-num';
      num.textContent = `${i + 1}.`;

      const nameEl = document.createElement('span');
      nameEl.className = 'dt-order-name';
      nameEl.textContent = name;

      li.appendChild(handle);
      li.appendChild(num);
      const avatar = createAvatarEl(name);
      if (avatar) li.appendChild(avatar);
      li.appendChild(nameEl);
      orderListEl.appendChild(li);
    });
  }

  function refreshAll() {
    renderPeopleList();
    renderOrderView();
    updateCounter();
  }

  function renderPeopleList() {
    peopleListEl.innerHTML = '';
    if (people.length === 0) {
      const li = document.createElement('li');
      li.className = 'dt-people-empty';
      li.textContent = t.noPeopleHint;
      peopleListEl.appendChild(li);
      return;
    }
    people.forEach((name, i) => {
      const li = document.createElement('li');
      const avatar = createAvatarEl(name);
      if (avatar) li.appendChild(avatar);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'dt-person-name';
      nameSpan.textContent = name;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'dt-person-remove';
      removeBtn.dataset.removeIdx = String(i);
      removeBtn.textContent = '×';
      removeBtn.title = t.removeTitle;
      li.appendChild(nameSpan);
      li.appendChild(removeBtn);
      peopleListEl.appendChild(li);
    });
  }

  // ===== Actions =====
  function tick() {
    remaining--;
    if (remaining === getWarningThreshold() && !warned) {
      warned = true;
      warningSound();
    }
    if (remaining === 0 && !finished) {
      finished = true;
      endSound();
    }
    render();
  }

  function start() {
    if (running) { pause(); return; }
    const wasFreshDaily = !dailyStarted;
    dailyStarted = true;
    ensureAudio();
    running = true;
    btnStart.textContent = t.pause;
    intervalId = setInterval(tick, 1000);
    renderOrderView(); // refresh "current" highlight
    render();
    if (wasFreshDaily) applyLinearFilter(nameAt(personCount - 1));
  }

  function pause() {
    running = false;
    btnStart.textContent = t.resume;
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    render();
  }

  function reset() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    running = false;
    remaining = totalDuration;
    warned = false;
    finished = false;
    // Exit daily mode: next Start begins a fresh daily with a new shuffle.
    personCount = 1;
    spoken.clear();
    dailyStarted = false;
    lastLinearFilterName = null;
    endLinearFilterSession();
    buildOrder();
    btnStart.textContent = t.start;
    refreshAll();
    render();
  }

  function nextPerson() {
    // Mark the just-finished speaker as spoken (only for named people).
    const prevIdx = personCount - 1;
    if (prevIdx < order.length) spoken.add(order[prevIdx]);
    personCount++;
    dailyStarted = true;
    renderOrderView();
    updateCounter();
    applyLinearFilter(nameAt(personCount - 1));
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    remaining = totalDuration;
    warned = false;
    finished = false;
    running = true;
    btnStart.textContent = t.pause;
    ensureAudio();
    intervalId = setInterval(tick, 1000);
    render();
  }

  function adjustDuration(delta) {
    const next = totalDuration + delta;
    if (next < MIN_DURATION || next > MAX_DURATION) return;
    totalDuration = next;
    if (!running) {
      remaining = totalDuration;
      warned = false;
      finished = false;
    }
    updateDurationDisplay();
    render();
    persist();
  }

  // ===== Event wiring =====
  function addPerson(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    people.push(trimmed);
    buildOrder();
    refreshAll();
    persist();
  }

  function removePerson(idx) {
    if (idx < 0 || idx >= people.length) return;
    const removedName = people[idx];
    people.splice(idx, 1);
    spoken.delete(removedName);
    buildOrder();
    refreshAll();
    persist();
  }

  function moveInOrder(from, to) {
    if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    // Mirror in `people` so the manual ordering persists across sessions.
    const pFrom = people.indexOf(item);
    if (pFrom !== -1) {
      people.splice(pFrom, 1);
      const insertAt = Math.min(to, people.length);
      people.splice(insertAt, 0, item);
    }
    refreshAll();
    persist();
  }

  function wireEvents() {
    root.addEventListener('click', (e) => {
      const removeIdx = e.target.dataset.removeIdx;
      if (removeIdx !== undefined) {
        removePerson(parseInt(removeIdx, 10));
        return;
      }
      const action = e.target.dataset.action;
      if (!action) return;
      switch (action) {
        case 'start': start(); break;
        case 'next': nextPerson(); break;
        case 'reset': reset(); break;
        case 'plus': adjustDuration(STEP); break;
        case 'minus': adjustDuration(-STEP); break;
        case 'collapse': collapsed = true; applyVisibility(); persist(); break;
        case 'expand': collapsed = false; applyVisibility(); persist(); break;
        case 'close': visible = false; applyVisibility(); persist(); break;
        case 'people': panelOpen = !panelOpen; applyVisibility(); break;
        case 'closePanel': panelOpen = false; applyVisibility(); break;
        case 'toggleOrder': orderViewOpen = !orderViewOpen; applyVisibility(); persist(); break;
      }
    });

    addFormEl.addEventListener('submit', (e) => {
      e.preventDefault();
      addPerson(addInputEl.value);
      addInputEl.value = '';
      addInputEl.focus();
    });

    randomToggleEl.addEventListener('change', () => {
      randomOrder = randomToggleEl.checked;
      buildOrder();
      refreshAll();
      persist();
    });

    linearFilterToggleEl.addEventListener('change', () => {
      linearFilterEnabled = linearFilterToggleEl.checked;
      lastLinearFilterName = null; // re-apply on next advance
      if (!linearFilterEnabled) endLinearFilterSession();
      persist();
    });

    // Drag and drop on the order list.
    let draggedIdx = null;
    orderListEl.addEventListener('dragstart', (e) => {
      const li = e.target.closest('li[data-order-idx]');
      if (!li) return;
      draggedIdx = parseInt(li.dataset.orderIdx, 10);
      li.classList.add('dt-dragging');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(draggedIdx));
      } catch (_) {}
    });
    orderListEl.addEventListener('dragover', (e) => {
      if (draggedIdx === null) return;
      const li = e.target.closest('li[data-order-idx]');
      if (!li) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      orderListEl.querySelectorAll('.dt-drop-over').forEach(el => el.classList.remove('dt-drop-over'));
      li.classList.add('dt-drop-over');
    });
    orderListEl.addEventListener('drop', (e) => {
      if (draggedIdx === null) return;
      const li = e.target.closest('li[data-order-idx]');
      if (!li) return;
      e.preventDefault();
      const target = parseInt(li.dataset.orderIdx, 10);
      moveInOrder(draggedIdx, target);
      draggedIdx = null;
    });
    orderListEl.addEventListener('dragend', () => {
      draggedIdx = null;
      orderListEl.querySelectorAll('.dt-dragging').forEach(el => el.classList.remove('dt-dragging'));
      orderListEl.querySelectorAll('.dt-drop-over').forEach(el => el.classList.remove('dt-drop-over'));
    });

    soundToggle.addEventListener('change', () => {
      soundOn = soundToggle.checked;
      persist();
    });

    // Allow clicking the mini bar to expand
    root.querySelector('.dt-mini').addEventListener('click', (e) => {
      if (e.target.dataset.action) return;
      collapsed = false;
      applyVisibility();
      persist();
    });

    // Drag to move
    let dragging = false, startX, startY, startTop, startRight;
    function onDragStart(e) {
      if (e.target.closest('button')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = root.getBoundingClientRect();
      startTop = rect.top;
      startRight = window.innerWidth - rect.right;
      e.preventDefault();
    }
    function onDragMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newTop = Math.max(0, startTop + dy);
      const newRight = Math.max(0, startRight - dx);
      root.style.top = newTop + 'px';
      root.style.right = newRight + 'px';
    }
    function onDragEnd() {
      if (!dragging) return;
      dragging = false;
      const rect = root.getBoundingClientRect();
      persistPosition(rect.top, window.innerWidth - rect.right);
    }
    header.addEventListener('mousedown', onDragStart);
    root.querySelector('.dt-mini').addEventListener('mousedown', (e) => {
      if (e.target.dataset.action) return;
      onDragStart(e);
    });
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // Keyboard shortcuts (only when not typing)
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      if (!visible) return;
      // Use Alt+key to avoid conflicts with Linear's own shortcuts
      if (!e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); start(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); nextPerson(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); reset(); }
    });
  }

  // ===== Toolbar message handler =====
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_TIMER') {
      visible = !visible;
      applyVisibility();
      persist();
    }
  });

  // ===== Init =====
  function init(savedPos) {
    buildUI();
    if (savedPos && typeof savedPos.top === 'number') {
      root.style.top = savedPos.top + 'px';
      root.style.right = savedPos.right + 'px';
    }
    applyVisibility();
    updateDurationDisplay();
    refreshAll();
    render();
    wireEvents();
  }
})();
