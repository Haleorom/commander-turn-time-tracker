'use strict';

/* =========================================================
 * Commander Turn Timer — plain JS PWA, state in localStorage
 * ========================================================= */

const LAST_TURN = 99999;           // open-ended last entry
const KEY_PROFILES = 'ctt.profiles';
const KEY_GAME = 'ctt.game';
const KEY_SETUP = 'ctt.lastSetup';
const KEY_HISTORY = 'ctt.history';
const DEFAULT_HOLD_SECONDS = 4;
const DEFAULT_LIFE = 40;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

/* ---------- storage helpers ---------- */
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/blocked */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

/* ---------- time formatting ---------- */
function formatMs(ms) {
  // Round up so a fresh 3:00 shows 3:00 and 0 is reached exactly at zero.
  const negative = ms < 0;
  const totalSec = negative ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return (negative && totalSec > 0 ? '−' : '') + m + ':' + String(s).padStart(2, '0');
}

function formatSec(sec) {
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

function parseTime(str) {
  const t = String(str).trim();
  let m = /^(\d{1,3}):([0-5]?\d)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{1,3})$/.exec(t);           // plain number = minutes
  if (m) return Number(m[1]) * 60;
  return NaN;
}

/* ---------- profiles ---------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function defaultProfile() {
  return {
    id: 'default',
    name: 'Default',
    holdSeconds: DEFAULT_HOLD_SECONDS,
    entries: [
      { untilTurn: 4, seconds: 180 },
      { untilTurn: 5, seconds: 210 },
      { untilTurn: 6, seconds: 240 },
      { untilTurn: LAST_TURN, seconds: 360 },
    ],
  };
}

function loadProfiles() {
  const list = store.get(KEY_PROFILES, null);
  if (!Array.isArray(list) || list.length === 0) {
    const initial = [defaultProfile()];
    store.set(KEY_PROFILES, initial);
    return initial;
  }
  for (const p of list) {
    if (!Number.isFinite(p.holdSeconds)) p.holdSeconds = DEFAULT_HOLD_SECONDS;
  }
  return list;
}

function saveProfiles(list) { store.set(KEY_PROFILES, list); }

function secondsForTurn(entries, turn) {
  for (const e of entries) {
    if (turn <= e.untilTurn) return e.seconds;
  }
  return entries[entries.length - 1].seconds;
}

function profileSummary(entries) {
  let from = 1;
  return entries.map((e) => {
    const range = e.untilTurn >= LAST_TURN
      ? `turn ${from}+`
      : (from === e.untilTurn ? `turn ${from}` : `turns ${from}–${e.untilTurn}`);
    from = e.untilTurn + 1;
    return `${range}: ${formatSec(e.seconds)}`;
  }).join(' · ');
}

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const screens = ['menu', 'setup', 'profiles', 'editor', 'game', 'life', 'end', 'history', 'detail'];

function show(name) {
  for (const s of screens) $('screen-' + s).classList.toggle('hidden', s !== name);
  document.body.classList.remove('overtime');
  if (name === 'game' || name === 'life') { acquireWakeLock(); } else { releaseWakeLock(); }
  if (name === 'life') renderLife(true);
  if (name === 'menu') renderMenu();
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-back]').forEach((b) => {
  b.addEventListener('click', () => show(b.dataset.back));
});

/* ---------- MENU ---------- */
function renderMenu() {
  $('btn-resume').classList.toggle('hidden', !store.get(KEY_GAME, null));
}
$('btn-new-game').addEventListener('click', openSetup);
$('btn-profiles').addEventListener('click', openProfiles);
$('btn-history').addEventListener('click', openHistory);
$('btn-resume').addEventListener('click', () => {
  if (loadGame()) show('game');
});

/* ---------- SETUP ---------- */
let setupCount = 4;
let setupNames = [];

function openSetup() {
  const last = store.get(KEY_SETUP, null);
  setupCount = last && last.count ? last.count : 4;
  $('setup-life').value = last && Number.isInteger(last.startingLife) ? last.startingLife : DEFAULT_LIFE;
  setupNames = last && Array.isArray(last.names) ? last.names.slice() : [];
  const profiles = loadProfiles();
  const sel = $('setup-profile');
  sel.innerHTML = '';
  for (const p of profiles) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    sel.appendChild(o);
  }
  if (last && profiles.some((p) => p.id === last.profileId)) sel.value = last.profileId;
  renderSetup();
  show('setup');
}

function renderSetup() {
  $('players-count').textContent = setupCount;
  $('players-dec').disabled = setupCount <= MIN_PLAYERS;
  $('players-inc').disabled = setupCount >= MAX_PLAYERS;
  const box = $('player-names');
  box.innerHTML = '';
  for (let i = 0; i < setupCount; i++) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 30;
    inp.placeholder = `Player ${i + 1} (optional name)`;
    inp.value = setupNames[i] || '';
    inp.addEventListener('input', () => { setupNames[i] = inp.value; });
    box.appendChild(inp);
  }
  const p = loadProfiles().find((x) => x.id === $('setup-profile').value);
  $('setup-profile-summary').textContent = p ? profileSummary(p.entries) : '';
}

$('players-dec').addEventListener('click', () => { if (setupCount > MIN_PLAYERS) { setupCount--; renderSetup(); } });
$('players-inc').addEventListener('click', () => { if (setupCount < MAX_PLAYERS) { setupCount++; renderSetup(); } });
$('setup-profile').addEventListener('change', renderSetup);

$('btn-start').addEventListener('click', () => {
  const profile = loadProfiles().find((x) => x.id === $('setup-profile').value);
  if (!profile) return;
  const names = [];
  for (let i = 0; i < setupCount; i++) {
    const n = (setupNames[i] || '').trim();
    names.push(n || `Player ${i + 1}`);
  }
  const startingLife = Number($('setup-life').value);
  if (!Number.isInteger(startingLife) || startingLife < 1 || startingLife > 999) {
    $('setup-life').focus();
    $('setup-life').classList.add('invalid');
    return;
  }
  $('setup-life').classList.remove('invalid');
  store.set(KEY_SETUP, {
    count: setupCount, names: setupNames.slice(0, setupCount), profileId: profile.id, startingLife,
  });
  startGame(names, profile, startingLife);
});

/* ---------- PROFILES LIST ---------- */
function openProfiles() {
  const list = $('profile-list');
  list.innerHTML = '';
  for (const p of loadProfiles()) {
    const li = document.createElement('li');
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = p.name;
    const s = document.createElement('div');
    s.className = 'muted small';
    s.textContent = profileSummary(p.entries) + ` · hold ${p.holdSeconds} s to reset`;
    li.append(t, s);
    li.addEventListener('click', () => openEditor(p.id));
    list.appendChild(li);
  }
  show('profiles');
}

$('btn-add-profile').addEventListener('click', () => openEditor(null));

/* ---------- PROFILE EDITOR ---------- */
let editingId = null;

function openEditor(id) {
  const profiles = loadProfiles();
  const p = id ? profiles.find((x) => x.id === id) : null;
  editingId = p ? p.id : null;
  const base = p || { name: 'New profile', holdSeconds: DEFAULT_HOLD_SECONDS, entries: defaultProfile().entries };
  $('editor-name').value = base.name;
  $('editor-hold').value = base.holdSeconds;
  $('editor-rows').innerHTML = '';
  for (const e of base.entries) addEditorRow(e.untilTurn, e.seconds);
  refreshEditorRows();
  $('editor-error').classList.add('hidden');
  $('editor-delete').classList.toggle('hidden', !p || profiles.length <= 1);
  show('editor');
}

function addEditorRow(untilTurn, seconds) {
  const row = document.createElement('div');
  row.className = 'row';

  const turnCell = document.createElement('div');
  const turnInput = document.createElement('input');
  turnInput.type = 'number';
  turnInput.inputMode = 'numeric';
  turnInput.min = '1';
  turnInput.className = 'turn-input';
  turnInput.value = untilTurn >= LAST_TURN ? '' : untilTurn;
  const fixed = document.createElement('div');
  fixed.className = 'fixed';
  fixed.textContent = 'rest of game';
  turnCell.append(turnInput, fixed);

  const timeInput = document.createElement('input');
  timeInput.type = 'text';
  timeInput.inputMode = 'numeric';
  timeInput.placeholder = 'm:ss';
  timeInput.className = 'time-input';
  timeInput.value = formatSec(seconds);

  const del = document.createElement('button');
  del.className = 'btn del';
  del.textContent = '✕';
  del.setAttribute('aria-label', 'Delete row');
  del.addEventListener('click', () => { row.remove(); refreshEditorRows(); });

  row.append(turnCell, timeInput, del);
  $('editor-rows').appendChild(row);
}

// The last row is always "rest of game"; only it hides the turn input.
function refreshEditorRows() {
  const rows = [...$('editor-rows').children];
  rows.forEach((row, i) => {
    const isLast = i === rows.length - 1;
    const inp = row.querySelector('.turn-input');
    row.querySelector('.fixed').classList.toggle('hidden', !isLast);
    inp.classList.toggle('hidden', isLast);
    row.querySelector('.del').style.visibility = rows.length > 1 ? 'visible' : 'hidden';
    if (!isLast && !inp.value) {
      const prev = i > 0 ? Number(rows[i - 1].querySelector('.turn-input').value) || 0 : 0;
      inp.value = prev + 1;
    }
  });
}

$('editor-add-row').addEventListener('click', () => {
  const rows = [...$('editor-rows').children];
  // Insert a new row before the "rest of game" row.
  const last = rows[rows.length - 1];
  const prevTurn = rows.length > 1 ? Number(rows[rows.length - 2].querySelector('.turn-input').value) || 0 : 0;
  const lastTime = last ? parseTime(last.querySelector('.time-input').value) : 180;
  addEditorRow(prevTurn + 1, Number.isFinite(lastTime) ? lastTime : 180);
  const newRow = $('editor-rows').lastElementChild;
  if (last) $('editor-rows').insertBefore(newRow, last);
  refreshEditorRows();
});

function readEditor() {
  const name = $('editor-name').value.trim();
  if (!name) return { error: 'Please enter a profile name.' };
  const rows = [...$('editor-rows').children];
  if (rows.length === 0) return { error: 'Add at least one row.' };
  const entries = [];
  let prev = 0;
  for (let i = 0; i < rows.length; i++) {
    const isLast = i === rows.length - 1;
    const seconds = parseTime(rows[i].querySelector('.time-input').value);
    if (!Number.isFinite(seconds) || seconds <= 0) return { error: `Row ${i + 1}: enter a time like 3:00.` };
    let untilTurn = LAST_TURN;
    if (!isLast) {
      untilTurn = Number(rows[i].querySelector('.turn-input').value);
      if (!Number.isInteger(untilTurn) || untilTurn < 1) return { error: `Row ${i + 1}: “Until turn” must be a whole number.` };
      if (untilTurn <= prev) return { error: `Row ${i + 1}: turns must increase from row to row.` };
    }
    entries.push({ untilTurn, seconds });
    prev = untilTurn;
  }
  const holdSeconds = Number($('editor-hold').value);
  if (!Number.isInteger(holdSeconds) || holdSeconds < 1 || holdSeconds > 30) {
    return { error: 'Hold to reset: enter whole seconds between 1 and 30.' };
  }
  return { name, entries, holdSeconds };
}

$('editor-save').addEventListener('click', () => {
  const res = readEditor();
  if (res.error) {
    $('editor-error').textContent = res.error;
    $('editor-error').classList.remove('hidden');
    return;
  }
  const profiles = loadProfiles();
  if (editingId) {
    const p = profiles.find((x) => x.id === editingId);
    p.name = res.name;
    p.entries = res.entries;
    p.holdSeconds = res.holdSeconds;
  } else {
    profiles.push({ id: uid(), name: res.name, holdSeconds: res.holdSeconds, entries: res.entries });
  }
  saveProfiles(profiles);
  openProfiles();
});

$('editor-cancel').addEventListener('click', openProfiles);

armConfirm($('editor-delete'), 'Tap again to delete', () => {
  const profiles = loadProfiles().filter((x) => x.id !== editingId);
  if (profiles.length === 0) return;
  saveProfiles(profiles);
  openProfiles();
});

/* Two-tap confirmation (avoids blocking browser dialogs). */
function armConfirm(btn, confirmText, action) {
  let timer = null;
  const original = btn.textContent;
  btn.addEventListener('click', () => {
    if (btn.classList.contains('confirm')) {
      clearTimeout(timer);
      btn.classList.remove('confirm');
      btn.textContent = original;
      action();
      return;
    }
    btn.classList.add('confirm');
    btn.textContent = confirmText;
    timer = setTimeout(() => {
      btn.classList.remove('confirm');
      btn.textContent = original;
    }, 3000);
  });
}


/* ---------- GAME ---------- */
/*
 * game = {
 *   id, startedAt,
 *   players: [names], profileName, entries: [...], holdSeconds,   (profile snapshot)
 *   turn, player,                     (1-based turn, 0-based player)
 *   remainingMs, runningSince,        (countdown; runningSince = epoch ms | null)
 *   usedMs,                           (real running time of the current player's turn, pauses excluded)
 *   alerted,                          (vibration done for this countdown)
 *   startingLife, life: [n per player], out: [turn eliminated | null per player],
 *   log: [{ turn, player, ms, life: [...] }],   (completed player-turns; life snapshot at Next)
 *   history: [{ turn, player, remainingMs, usedMs, alerted }]   (undo stack)
 * }
 */
let game = null;
let rafId = null;

function now() { return Date.now(); }

function elapsedSinceStart() {
  return game.runningSince == null ? 0 : now() - game.runningSince;
}
function currentRemaining() {
  return game ? game.remainingMs - elapsedSinceStart() : 0;
}
function currentUsed() {
  return game ? game.usedMs + elapsedSinceStart() : 0;
}

// Fold the running segment into remainingMs/usedMs and pause.
function settle() {
  const e = elapsedSinceStart();
  game.remainingMs -= e;
  game.usedMs += e;
  game.runningSince = null;
}

function saveGame() { if (game) store.set(KEY_GAME, game); }

function loadGame() {
  const g = store.get(KEY_GAME, null);
  if (!g || !Array.isArray(g.players) || !Array.isArray(g.entries)) return false;
  // Fill fields missing from games saved by older versions.
  g.id = g.id || uid();
  g.startedAt = g.startedAt || now();
  g.holdSeconds = Number.isFinite(g.holdSeconds) ? g.holdSeconds : DEFAULT_HOLD_SECONDS;
  g.usedMs = g.usedMs || 0;
  g.log = Array.isArray(g.log) ? g.log : [];
  g.history = (g.history || []).map((h) => ({ usedMs: 0, ...h }));
  g.startingLife = Number.isInteger(g.startingLife) ? g.startingLife : DEFAULT_LIFE;
  if (!Array.isArray(g.life) || g.life.length !== g.players.length) g.life = g.players.map(() => g.startingLife);
  if (!Array.isArray(g.out) || g.out.length !== g.players.length) g.out = g.players.map(() => null);
  game = g;
  renderGame();
  startTicking();
  return true;
}

function startGame(names, profile, startingLife = DEFAULT_LIFE) {
  game = {
    id: uid(),
    startedAt: now(),
    players: names,
    profileName: profile.name,
    entries: profile.entries.map((e) => ({ ...e })),
    holdSeconds: profile.holdSeconds || DEFAULT_HOLD_SECONDS,
    turn: 1,
    player: 0,
    remainingMs: secondsForTurn(profile.entries, 1) * 1000,
    runningSince: null,
    usedMs: 0,
    alerted: false,
    startingLife,
    life: names.map(() => startingLife),
    out: names.map(() => null),
    log: [],
    history: [],
  };
  saveGame();
  renderGame();
  startTicking();
  show('game');
}

function toggleRunning() {
  if (!game) return;
  if (game.runningSince == null) {
    game.runningSince = now();
  } else {
    settle();
  }
  saveGame();
  renderGame();
}

function nextPlayer() {
  if (!game) return;
  settle();
  game.log.push({ turn: game.turn, player: game.player, ms: game.usedMs, life: game.life.slice() });
  game.history.push({
    turn: game.turn,
    player: game.player,
    remainingMs: game.remainingMs,
    usedMs: game.usedMs,
    alerted: game.alerted,
  });

  // Advance to the next player still in the game; passing the last seat starts a new turn.
  const n = game.players.length;
  const anyActive = game.out.some((o) => o == null);
  let steps = 0;
  do {
    game.player += 1;
    if (game.player >= n) {
      game.player = 0;
      game.turn += 1;
    }
    steps += 1;
  } while (anyActive && game.out[game.player] != null && steps <= n);
  game.remainingMs = secondsForTurn(game.entries, game.turn) * 1000;
  game.usedMs = 0;
  game.runningSince = now();
  game.alerted = false;
  saveGame();
  renderGame();
}

function undo() {
  if (!game || game.history.length === 0) return;
  const prev = game.history.pop();
  game.log.pop();
  game.turn = prev.turn;
  game.player = prev.player;
  game.remainingMs = prev.remainingMs;
  game.usedMs = prev.usedMs;
  game.runningSince = null;          // restored paused
  game.alerted = prev.alerted || prev.remainingMs <= 0;
  saveGame();
  renderGame();
}

/* Reset the current player's countdown to this turn's time (paused).
 * Time already spent in this turn stays counted in usedMs. */
function resetTimer() {
  if (!game) return;
  settle();
  game.remainingMs = secondsForTurn(game.entries, game.turn) * 1000;
  game.alerted = false;
  saveGame();
  renderGame();
  if (navigator.vibrate) navigator.vibrate(150);
}

function renderGame() {
  if (!game) return;
  $('game-turn').textContent = game.turn;
  $('game-player').textContent = game.players[game.player];
  $('game-profile').textContent = game.profileName;
  if (!$('screen-life').classList.contains('hidden')) renderLife(false);
  $('btn-undo').classList.toggle('invisible', game.history.length === 0);
  const running = game.runningSince != null;
  $('game-timer').classList.toggle('paused', !running);
  $('game-hint').textContent = (running ? 'Tap the timer to pause' : 'Tap the timer to start')
    + ` · hold ${game.holdSeconds} s to reset`;
  $('hold-bar').style.transitionDuration = game.holdSeconds + 's';
  renderTimer();
}

function renderTimer() {
  if (!game) return;
  const ms = currentRemaining();
  const text = formatMs(ms);
  const el = $('game-timer');
  if (el.textContent !== text) {
    el.textContent = text;
    el.classList.toggle('long', text.length >= 6);
  }
  const mini = $('life-timer');
  if (mini.textContent !== text) mini.textContent = text;
  mini.classList.toggle('paused', game.runningSince == null);
  const over = ms <= 0;
  if (!$('screen-game').classList.contains('hidden') || !$('screen-life').classList.contains('hidden')) {
    document.body.classList.toggle('overtime', over);
  }
  if (over && game.runningSince != null && !game.alerted) {
    game.alerted = true;
    saveGame();
    if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
  }
}

function tick() {
  renderTimer();
  rafId = requestAnimationFrame(tick);
}
function startTicking() { if (rafId == null) rafId = requestAnimationFrame(tick); }
function stopTicking() { if (rafId != null) cancelAnimationFrame(rafId); rafId = null; }

/* Tap = start/pause, hold N s (profile setting) = reset. */
let holdTimer = null;
let holdFired = false;
let holdStartedAt = 0;

function holdStart(e) {
  if (!game || (e.pointerType === 'mouse' && e.button !== 0)) return;
  holdFired = false;
  holdStartedAt = now();
  clearTimeout(holdTimer);
  const track = $('hold-bar').parentElement;
  track.classList.remove('holding');
  void track.offsetWidth;            // restart the CSS transition
  track.classList.add('holding');
  holdTimer = setTimeout(() => {
    holdTimer = null;
    holdFired = true;
    track.classList.remove('holding');
    resetTimer();
  }, game.holdSeconds * 1000);
}

function holdEnd() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  $('hold-bar').parentElement.classList.remove('holding');
}

const timerEl = $('game-timer');
timerEl.addEventListener('pointerdown', holdStart);
timerEl.addEventListener('pointerup', holdEnd);
timerEl.addEventListener('pointercancel', holdEnd);
timerEl.addEventListener('pointerleave', holdEnd);
timerEl.addEventListener('contextmenu', (e) => e.preventDefault());
timerEl.addEventListener('click', () => {
  if (holdFired) { holdFired = false; return; }   // the long press already acted
  // A press longer than a tap that was released early is an aborted reset: do nothing.
  if (holdStartedAt && now() - holdStartedAt > 600) return;
  toggleRunning();
});

$('btn-next').addEventListener('click', nextPlayer);
$('btn-undo').addEventListener('click', undo);
armConfirm($('btn-end'), 'Tap again to end', openEndScreen);

/* ---------- LIFE ---------- */
$('btn-to-life').addEventListener('click', () => show('life'));
$('btn-to-time').addEventListener('click', () => { show('game'); renderGame(); });

function changeLife(p, delta) {
  if (!game) return;
  game.life[p] += delta;
  saveGame();
  renderLife(false);
}

/* Press = ±1, keep pressed = repeat faster. */
function attachRepeat(btn, fn) {
  let delay = null;
  let interval = null;
  const stop = () => {
    clearTimeout(delay); clearInterval(interval);
    delay = interval = null;
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    stop();
    fn();
    delay = setTimeout(() => { interval = setInterval(fn, 90); }, 450);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

function toggleOut(p) {
  if (!game) return;
  game.out[p] = game.out[p] == null ? game.turn : null;
  saveGame();
  renderLife(false);
}

// rebuild = true recreates the rows (screen opened); false just updates values.
function renderLife(rebuild) {
  if (!game) return;
  const list = $('life-list');
  if (rebuild || list.children.length !== game.players.length) {
    list.innerHTML = '';
    game.players.forEach((name, p) => {
      const row = document.createElement('div');
      row.className = 'life-row';
      const nm = document.createElement('div');
      nm.className = 'name';
      nm.textContent = name;
      const minus = document.createElement('button');
      minus.className = 'btn pm';
      minus.textContent = '−';
      minus.setAttribute('aria-label', `Decrease ${name}'s life`);
      const val = document.createElement('div');
      val.className = 'life-val';
      const plus = document.createElement('button');
      plus.className = 'btn pm';
      plus.textContent = '+';
      plus.setAttribute('aria-label', `Increase ${name}'s life`);
      const outBtn = document.createElement('button');
      outBtn.className = 'btn out-btn';
      attachRepeat(minus, () => changeLife(p, -1));
      attachRepeat(plus, () => changeLife(p, +1));
      // Removing needs a second tap; bringing a player back is a single tap.
      let armTimer = null;
      outBtn.addEventListener('click', () => {
        if (game.out[p] != null) { toggleOut(p); return; }
        if (outBtn.classList.contains('confirm')) {
          clearTimeout(armTimer);
          outBtn.classList.remove('confirm');
          toggleOut(p);
          return;
        }
        outBtn.classList.add('confirm');
        outBtn.textContent = 'Sure?';
        armTimer = setTimeout(() => { outBtn.classList.remove('confirm'); renderLife(false); }, 3000);
      });
      row.append(nm, minus, val, plus, outBtn);
      list.appendChild(row);
    });
  }
  [...list.children].forEach((row, p) => {
    const isOut = game.out[p] != null;
    row.classList.toggle('current', p === game.player);
    row.classList.toggle('out', isOut);
    const val = row.querySelector('.life-val');
    val.textContent = game.life[p];
    val.classList.toggle('low', game.life[p] <= 0);
    const outBtn = row.querySelector('.out-btn');
    if (!outBtn.classList.contains('confirm')) outBtn.textContent = isOut ? 'Back' : 'Out';
    outBtn.setAttribute('aria-label', isOut ? `Put ${game.players[p]} back in the game` : `Remove ${game.players[p]} from the turn order`);
  });
  $('life-turn').textContent = game.turn;
  $('life-current').textContent = game.players[game.player];
}

/* ---------- END OF GAME ---------- */
let pendingRecord = null;
let chosenWinner = null;

function openEndScreen() {
  if (!game) return;
  settle();
  const log = game.log.slice();
  // Include the turn in progress if any time was spent on it.
  if (game.usedMs > 0) log.push({ turn: game.turn, player: game.player, ms: game.usedMs, life: game.life.slice() });
  pendingRecord = {
    id: game.id,
    startedAt: game.startedAt,
    endedAt: now(),
    profileName: game.profileName,
    players: game.players.slice(),
    turns: log.length ? log[log.length - 1].turn : game.turn,
    winner: null,
    startingLife: game.startingLife,
    finalLife: game.life.slice(),
    out: game.out.slice(),
    log,
  };
  saveGame();
  // Preselect the winner when exactly one player is still in the game.
  const left = game.out.map((o, i) => (o == null ? i : -1)).filter((i) => i >= 0);
  chosenWinner = left.length === 1 ? left[0] : null;
  renderWinnerChoices();
  $('end-summary').textContent =
    `${pendingRecord.turns} turn${pendingRecord.turns === 1 ? '' : 's'} · ` +
    `${formatDuration(sum(log.map((l) => l.ms)))} of turn time`;
  show('end');
}

function renderWinnerChoices() {
  const box = $('winner-list');
  box.innerHTML = '';
  const options = [{ idx: null, label: 'No winner / skip' }]
    .concat(pendingRecord.players.map((name, idx) => ({ idx, label: name })));
  for (const o of options) {
    const b = document.createElement('button');
    b.className = 'btn choice' + (chosenWinner === o.idx ? ' selected' : '');
    b.textContent = (chosenWinner === o.idx ? '✓ ' : '') + o.label;
    b.addEventListener('click', () => { chosenWinner = o.idx; renderWinnerChoices(); });
    box.appendChild(b);
  }
}

function finishGame(saveIt) {
  if (saveIt && pendingRecord) {
    pendingRecord.winner = chosenWinner;
    const hist = store.get(KEY_HISTORY, []);
    hist.unshift(pendingRecord);
    store.set(KEY_HISTORY, hist);
  }
  pendingRecord = null;
  game = null;
  stopTicking();
  store.remove(KEY_GAME);
  if (saveIt) openHistory(); else show('menu');
}

$('end-save').addEventListener('click', () => finishGame(true));
$('end-back').addEventListener('click', () => { pendingRecord = null; show('game'); renderGame(); });
armConfirm($('end-discard'), 'Tap again to discard', () => finishGame(false));

/* ---------- HISTORY ---------- */
function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function openHistory() {
  const hist = store.get(KEY_HISTORY, []);
  const list = $('history-list');
  list.innerHTML = '';
  $('history-empty').classList.toggle('hidden', hist.length > 0);
  for (const g of hist) {
    const li = document.createElement('li');
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = formatDate(g.startedAt);
    const s1 = document.createElement('div');
    s1.className = 'small';
    s1.textContent = g.players.map((n, i) => (i === g.winner ? '🏆 ' + n : n)).join(', ');
    const s2 = document.createElement('div');
    s2.className = 'muted small';
    s2.textContent = `${g.turns} turns · ${formatDuration(sum(g.log.map((l) => l.ms)))} · ${g.profileName}`;
    li.append(t, s1, s2);
    li.addEventListener('click', () => openDetail(g.id));
    list.appendChild(li);
  }
  show('history');
}

let detailId = null;

function openDetail(id) {
  const g = store.get(KEY_HISTORY, []).find((x) => x.id === id);
  if (!g) return openHistory();
  detailId = id;
  $('detail-title').textContent = formatDate(g.startedAt);
  $('detail-meta').textContent =
    `${g.profileName} · ${g.turns} turns · winner: ${g.winner == null ? '—' : g.players[g.winner]}`;

  renderDetailView(g);
  show('detail');
}

let detailView = 'times';

function renderDetailView(g) {
  $('seg-times').classList.toggle('selected', detailView === 'times');
  $('seg-life').classList.toggle('selected', detailView === 'life');
  const box = $('detail-table');
  box.innerHTML = '';
  box.appendChild(detailView === 'life' ? buildLifeTable(g) : buildTimesTable(g));
}

function playerHeader(table, g, firstLabel) {
  const thead = table.createTHead().insertRow();
  thead.insertCell().textContent = firstLabel;
  g.players.forEach((name, i) => {
    const th = document.createElement('th');
    const out = g.out && g.out[i] != null ? ` (out T${g.out[i]})` : '';
    th.textContent = (i === g.winner ? '🏆 ' : '') + name + out;
    thead.appendChild(th);
  });
}

function buildLifeTable(g) {
  const table = document.createElement('table');
  table.className = 'times';
  playerHeader(table, g, 'After');
  const tbody = table.createTBody();
  const withLife = g.log.filter((l) => Array.isArray(l.life));
  if (!withLife.length && !g.finalLife) {
    const r = tbody.insertRow();
    const c = r.insertCell();
    c.colSpan = g.players.length + 1;
    c.textContent = 'No life data for this game.';
    return table;
  }
  const addRow = (label, life) => {
    const r = tbody.insertRow();
    r.insertCell().textContent = label;
    life.forEach((v) => {
      const c = r.insertCell();
      c.textContent = v;
      if (v <= 0) c.className = 'out-cell';
    });
  };
  if (Number.isInteger(g.startingLife)) addRow('Start', g.players.map(() => g.startingLife));
  for (const l of withLife) addRow(`T${l.turn} · ${g.players[l.player]}`, l.life);
  if (g.finalLife) {
    const tfoot = table.createTFoot();
    const r = tfoot.insertRow();
    r.insertCell().textContent = 'End';
    g.finalLife.forEach((v) => { r.insertCell().textContent = v; });
  }
  return table;
}

function buildTimesTable(g) {
  const n = g.players.length;
  const grid = {};                       // grid[turn][player] = ms
  for (const l of g.log) {
    (grid[l.turn] = grid[l.turn] || {})[l.player] = (grid[l.turn][l.player] || 0) + l.ms;
  }
  const turns = Object.keys(grid).map(Number).sort((a, b) => a - b);

  const table = document.createElement('table');
  table.className = 'times';
  playerHeader(table, g, 'Turn');
  const tbody = table.createTBody();
  for (const t of turns) {
    const r = tbody.insertRow();
    r.insertCell().textContent = t;
    for (let p = 0; p < n; p++) {
      const ms = grid[t][p];
      r.insertCell().textContent = ms == null ? '—' : formatDuration(ms);
    }
  }
  const tfoot = table.createTFoot();
  const per = g.players.map((_, p) => g.log.filter((l) => l.player === p).map((l) => l.ms));
  const addFoot = (label, fn) => {
    const r = tfoot.insertRow();
    r.insertCell().textContent = label;
    per.forEach((arr) => { r.insertCell().textContent = arr.length ? formatDuration(fn(arr)) : '—'; });
  };
  addFoot('Total', sum);
  addFoot('Avg', (a) => sum(a) / a.length);
  addFoot('Max', (a) => Math.max(...a));
  return table;
}

function currentDetail() { return store.get(KEY_HISTORY, []).find((x) => x.id === detailId); }
$('seg-times').addEventListener('click', () => { detailView = 'times'; const g = currentDetail(); if (g) renderDetailView(g); });
$('seg-life').addEventListener('click', () => { detailView = 'life'; const g = currentDetail(); if (g) renderDetailView(g); });

$('detail-back').addEventListener('click', openHistory);
armConfirm($('detail-delete'), 'Tap again to delete', () => {
  store.set(KEY_HISTORY, store.get(KEY_HISTORY, []).filter((x) => x.id !== detailId));
  openHistory();
});

/* ---------- screen wake lock ---------- */
let wakeLock = null;
async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { wakeLock = null; }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible'
      && (!$('screen-game').classList.contains('hidden') || !$('screen-life').classList.contains('hidden'))) {
    acquireWakeLock();
  }
});

/* ---------- boot ---------- */
loadProfiles();
if (loadGame()) {
  show('game');
} else {
  show('menu');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
