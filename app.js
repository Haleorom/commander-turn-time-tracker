'use strict';

/* =========================================================
 * Commander Turn Timer — plain JS PWA, state in localStorage
 * ========================================================= */

const LAST_TURN = 99999;           // open-ended last entry
const KEY_PROFILES = 'ctt.profiles';
const KEY_GAME = 'ctt.game';
const KEY_SETUP = 'ctt.lastSetup';
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
const screens = ['menu', 'setup', 'profiles', 'editor', 'game'];

function show(name) {
  for (const s of screens) $('screen-' + s).classList.toggle('hidden', s !== name);
  document.body.classList.remove('overtime');
  if (name === 'game') { acquireWakeLock(); } else { releaseWakeLock(); }
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
$('btn-resume').addEventListener('click', () => {
  if (loadGame()) show('game');
});

/* ---------- SETUP ---------- */
let setupCount = 4;
let setupNames = [];

function openSetup() {
  const last = store.get(KEY_SETUP, null);
  setupCount = last && last.count ? last.count : 4;
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
  store.set(KEY_SETUP, { count: setupCount, names: setupNames.slice(0, setupCount), profileId: profile.id });
  startGame(names, profile);
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
    s.textContent = profileSummary(p.entries);
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
  const base = p || { name: 'New profile', entries: defaultProfile().entries };
  $('editor-name').value = base.name;
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
  return { name, entries };
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
  } else {
    profiles.push({ id: uid(), name: res.name, entries: res.entries });
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
 *   players: [names], profileName, entries: [...],   (profile snapshot)
 *   turn, player,                                    (1-based turn, 0-based player)
 *   remainingMs, runningSince (epoch ms | null),
 *   alerted (vibration done for this countdown),
 *   history: [{ turn, player, remainingMs, alerted }]
 * }
 */
let game = null;
let rafId = null;

function now() { return Date.now(); }

function currentRemaining() {
  if (!game) return 0;
  return game.runningSince == null
    ? game.remainingMs
    : game.remainingMs - (now() - game.runningSince);
}

function saveGame() { if (game) store.set(KEY_GAME, game); }

function loadGame() {
  const g = store.get(KEY_GAME, null);
  if (!g || !Array.isArray(g.players) || !Array.isArray(g.entries)) return false;
  game = g;
  renderGame();
  startTicking();
  return true;
}

function startGame(names, profile) {
  game = {
    players: names,
    profileName: profile.name,
    entries: profile.entries.map((e) => ({ ...e })),
    turn: 1,
    player: 0,
    remainingMs: secondsForTurn(profile.entries, 1) * 1000,
    runningSince: null,
    alerted: false,
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
    game.remainingMs = currentRemaining();
    game.runningSince = null;
  }
  saveGame();
  renderGame();
}

function nextPlayer() {
  if (!game) return;
  game.history.push({
    turn: game.turn,
    player: game.player,
    remainingMs: currentRemaining(),
    alerted: game.alerted,
  });
  if (game.history.length > 500) game.history.shift();

  game.player += 1;
  if (game.player >= game.players.length) {
    game.player = 0;
    game.turn += 1;
  }
  game.remainingMs = secondsForTurn(game.entries, game.turn) * 1000;
  game.runningSince = now();
  game.alerted = false;
  saveGame();
  renderGame();
}

function undo() {
  if (!game || game.history.length === 0) return;
  const prev = game.history.pop();
  game.turn = prev.turn;
  game.player = prev.player;
  game.remainingMs = prev.remainingMs;
  game.runningSince = null;          // restored paused
  game.alerted = prev.alerted || prev.remainingMs <= 0;
  saveGame();
  renderGame();
}

function endGame() {
  game = null;
  stopTicking();
  store.remove(KEY_GAME);
  show('menu');
}

function renderGame() {
  if (!game) return;
  $('game-turn').textContent = game.turn;
  $('game-player').textContent = game.players[game.player];
  $('game-profile').textContent = game.profileName;
  $('btn-undo').classList.toggle('invisible', game.history.length === 0);
  const running = game.runningSince != null;
  $('game-timer').classList.toggle('paused', !running);
  $('game-hint').textContent = running ? 'Tap the timer to pause' : 'Tap the timer to start';
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
  const over = ms <= 0;
  if (!$('screen-game').classList.contains('hidden')) {
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

$('game-timer').addEventListener('click', toggleRunning);
$('btn-next').addEventListener('click', nextPlayer);
$('btn-undo').addEventListener('click', undo);
armConfirm($('btn-end'), 'Tap again to end', endGame);

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
  if (document.visibilityState === 'visible' && !$('screen-game').classList.contains('hidden')) {
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
