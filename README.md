# Commander Turn Timer

A small offline PWA that gives each player a countdown per turn in Commander games.

**Live app:** https://haleorom.github.io/commander-turn-time-tracker/

## Install on Android
1. Open the link above in Chrome (internet is needed only this first time).
2. Menu ⋮ → **Add to Home screen** / **Install app**.
3. From then on it opens from the home screen and works fully offline.

## Features
- **Time profiles**: rows of "until turn N → m:ss"; the last row covers the rest of the game. Multiple profiles supported.
  Default: turns 1–4 3:00 · turn 5 3:30 · turn 6 4:00 · turn 7+ 6:00.
- **Game**: choose number of players (2–8), optional names and a profile.
- Tap the big timer to start/pause. **Hold it for 4 seconds** to reset the current player's countdown to the turn's time (paused), without moving to the next player.
- At 0 the screen turns red, the phone vibrates and the timer keeps counting overtime.
- **Next player** resets the countdown to the current turn's time and starts it immediately; after the last player the turn number goes up.
- **Undo** restores the state before the last *Next player* (paused, with the time that was left). Can be repeated.
- Game in progress, profiles and last setup are kept in `localStorage`, so they survive closing the app or restarting the phone.
- Keeps the screen awake during a game (Screen Wake Lock API).

## Development
Plain HTML/CSS/JS, no build step. Serve the folder over HTTP (e.g. `python3 -m http.server`) and open it.
When you change any file, bump `VERSION` in `sw.js` so installed copies pick up the update.
