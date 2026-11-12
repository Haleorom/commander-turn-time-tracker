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
- **Game**: choose number of players (2–8), optional names, a color and icon per player (tap the round badge), the turn order (drag the ☰ handle), starting life (default 40) and a profile. The last players used are remembered for the next game.
- **Life counter**: the ❤ strip on the right of the timer screen opens the life screen (−/+ per player, hold to repeat; tap a player's icon/name to remove them from the turn order or put them back). The ⏳ strip on the left goes back. The countdown keeps running and is shown small at the top.
- Tap the big timer to start/pause. **Hold it** (default 4 s, configurable per profile) to reset the current player's countdown to the turn's time (paused), without moving to the next player.
- At 0 the screen turns red, the phone vibrates and the timer keeps counting overtime.
- **Next player** (⏭ button) resets the countdown to the current turn's time and starts it immediately; after the last player the turn number goes up.
- **Undo** restores the state before the last *Next player* (paused, with the time that was left). Can be repeated.
- **End game** → optionally pick the winner → *Save game* (or *Discard*).
- **Custom life layout**: tap **✥ Layout** (timer or life screen) to enter repositioning mode. Drag any bar anywhere; drag its ⟳ handle to rotate it to any angle (snaps near 0/90/180/270°, a tap turns it 90°). *Done* saves, *Reset layout* goes back to the list. The layout is saved per number of players and the bars appear in the same place, fully usable, on the timer screen too.
- **Games history**: every saved game with the time each player used on every turn (pauses excluded), plus total / average / longest turn per player, and a *Life* view with every player's life after each *Next player* press.
- Game in progress, history, profiles and last setup are kept in `localStorage`, so they survive closing the app or restarting the phone.
- Keeps the screen awake during a game (Screen Wake Lock API).

## Development
Plain HTML/CSS/JS, no build step. Serve the folder over HTTP (e.g. `python3 -m http.server`) and open it.
When you change any file, bump `VERSION` in `sw.js` so installed copies pick up the update.
