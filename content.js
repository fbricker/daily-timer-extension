// Daily Standup Timer - injected into every page
(function() {
  'use strict';

  if (window.__dailyTimerInjected) return;
  window.__dailyTimerInjected = true;

  const STEP = 15;
  const MIN_DURATION = 15;
  const MAX_DURATION = 600;
  const CIRC = 471.24; // 2 * PI * 75 (radius)

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

  // Restore preferences
  chrome.storage.local.get(['totalDuration', 'soundOn', 'visible', 'collapsed', 'position'], (data) => {
    if (typeof data.totalDuration === 'number') totalDuration = data.totalDuration;
    if (typeof data.soundOn === 'boolean') soundOn = data.soundOn;
    if (typeof data.visible === 'boolean') visible = data.visible;
    if (typeof data.collapsed === 'boolean') collapsed = data.collapsed;
    remaining = totalDuration;
    init(data.position);
  });

  function persist() {
    chrome.storage.local.set({ totalDuration, soundOn, visible, collapsed });
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

  // ===== UI =====
  let root, ring, timeDisplay, phaseLabel, statusDot, counterEl,
      durationDisplayEl, btnPlus, btnMinus, btnStart, btnNext,
      btnReset, soundToggle, miniTime, header;

  function buildUI() {
    root = document.createElement('div');
    root.id = 'daily-timer-root';
    root.innerHTML = `
      <div class="dt-card">
        <div class="dt-header">
          <div class="dt-header-left">
            <div class="dt-status-dot"></div>
            <span class="dt-title-text">Daily timer</span>
          </div>
          <div class="dt-header-buttons">
            <button class="dt-icon-btn" data-action="collapse" title="Minimizar">−</button>
            <button class="dt-icon-btn" data-action="close" title="Cerrar (clic en el ícono para reabrir)">×</button>
          </div>
        </div>
        <div class="dt-mini">
          <div class="dt-status-dot"></div>
          <span class="dt-mini-time">2:00</span>
          <button class="dt-icon-btn" data-action="expand" title="Expandir">▢</button>
        </div>
        <div class="dt-body">
          <div class="dt-counter">Persona <span class="dt-person-num">1</span></div>
          <div class="dt-ring-wrap">
            <svg viewBox="0 0 160 160">
              <circle class="dt-ring-bg" cx="80" cy="80" r="75"></circle>
              <circle class="dt-ring-fg" cx="80" cy="80" r="75"></circle>
            </svg>
            <div class="dt-time-display">
              <div class="dt-time">2:00</div>
              <div class="dt-phase">en pausa</div>
            </div>
          </div>
          <div class="dt-duration-config">
            <span class="dt-label">Duración</span>
            <button class="dt-step-btn" data-action="minus">−</button>
            <span class="dt-duration-display">2:00</span>
            <button class="dt-step-btn" data-action="plus">+</button>
          </div>
          <div class="dt-controls">
            <button class="dt-btn dt-btn-primary" data-action="start">Iniciar</button>
            <button class="dt-btn" data-action="next">Siguiente</button>
            <button class="dt-btn" data-action="reset">Reiniciar</button>
          </div>
          <div class="dt-footer">
            <label>
              <input type="checkbox" data-action="sound" />
              Sonido
            </label>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    // Cache refs
    ring = root.querySelector('.dt-ring-fg');
    timeDisplay = root.querySelector('.dt-time');
    phaseLabel = root.querySelector('.dt-phase');
    statusDot = root.querySelectorAll('.dt-status-dot');
    counterEl = root.querySelector('.dt-person-num');
    durationDisplayEl = root.querySelector('.dt-duration-display');
    btnPlus = root.querySelector('[data-action="plus"]');
    btnMinus = root.querySelector('[data-action="minus"]');
    btnStart = root.querySelector('[data-action="start"]');
    btnNext = root.querySelector('[data-action="next"]');
    btnReset = root.querySelector('[data-action="reset"]');
    soundToggle = root.querySelector('[data-action="sound"]');
    miniTime = root.querySelector('.dt-mini-time');
    header = root.querySelector('.dt-header');

    soundToggle.checked = soundOn;
  }

  function applyVisibility() {
    if (!visible) root.classList.add('dt-hidden');
    else root.classList.remove('dt-hidden');
    if (collapsed) root.classList.add('dt-collapsed');
    else root.classList.remove('dt-collapsed');
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
      phaseLabel.textContent = 'tiempo excedido';
      phaseLabel.classList.add('dt-over');
      setStatus('dt-over');
    } else {
      phaseLabel.classList.remove('dt-over');
      if (running) {
        phaseLabel.textContent = remaining <= getWarningThreshold() ? 'queda poco' : 'en curso';
        setStatus(remaining <= getWarningThreshold() ? 'dt-warning' : 'dt-running');
      } else {
        phaseLabel.textContent = 'en pausa';
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

  function updateCounter() {
    counterEl.textContent = personCount;
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
    ensureAudio();
    running = true;
    btnStart.textContent = 'Pausar';
    intervalId = setInterval(tick, 1000);
    render();
  }

  function pause() {
    running = false;
    btnStart.textContent = 'Reanudar';
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
    btnStart.textContent = 'Iniciar';
    render();
  }

  function nextPerson() {
    personCount++;
    updateCounter();
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    remaining = totalDuration;
    warned = false;
    finished = false;
    running = true;
    btnStart.textContent = 'Pausar';
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
  function wireEvents() {
    root.addEventListener('click', (e) => {
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
      }
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
    updateCounter();
    render();
    wireEvents();
  }
})();
