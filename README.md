# Commander Turn Timer

A small offline PWA that gives each player a countdown per turn in Commander games.

**Live app:** https://commandertracker.to-dev.net/

## Install on Android
1. Open the link above in Chrome (internet is needed only this first time).
2. Menu ⋮ → **Add to Home screen** / **Install app**.
3. From then on it opens from the home screen and works fully offline.

## Features
- **Time profiles**: rows of "until turn N → m:ss"; the last row covers the rest of the game. Multiple profiles supported.
  Default: turns 1–4 3:00 · turn 5 3:30 · turn 6 4:00 · turn 7+ 6:00.
- **Game**: choose number of players (2–8), optional names, a color and icon per player (tap the round badge), the turn order (drag the ☰ handle), starting life (default 40) and a time profile. The last players used are remembered for the next game.
- **No timer**: the last choice in the profile list turns the game into a life counter only (no timer, turns, Next/Undo or history; life, commander damage and layout still work). The default profile is still the one proposed.
- **Player widgets** (one screen for everything): −/+ per player (hold to repeat); tap a player's icon/name to remove them from the turn order (or mark them as lost) or put them back.
- Tap the big timer to start/pause. **Hold it** (default 4 s, configurable per profile) to reset the current player's countdown to the turn's time (paused), without moving to the next player.
- At 0 the screen turns red, the phone vibrates and the timer keeps counting overtime.
- **Next player** (⏭ button) resets the countdown to the current turn's time and starts it immediately; after the last player the turn number goes up.
- **Undo** restores the state before the last *Next player* (paused, with the time that was left). Can be repeated.
- **End game** → optionally pick the winner → *Save game* (or *Discard*).
- **Commander damage**: drag from a player's icon/name to another player's widget; a popup sets the damage of that hit (−/+, negative to correct). It is added to the commander-damage total and subtracted from life; totals are listed under each widget ("🐉 Tobia – 7"), red at 21+, with an option to remove the player. Saved games show a *Cmd dmg* table in the history.
- **Default position**: without a custom layout, the widgets sit in a two-column grid above the buttons.
- **Custom life layout**: tap **✥ Layout** to enter repositioning mode. Drag any bar anywhere; drag its ⟳ handle to rotate it to any angle (snaps near 0/90/180/270°, a tap turns it 90°); drag its ⤡ handle to resize it (70–200%, a tap resets to 100%). *Done* saves, *Reset layout* goes back to the default grid. The layout is saved per number of players.
- **Games history**: every saved game with the time each player used on every turn (pauses excluded), plus total / average / longest turn per player, and a *Life* view with every player's life after each *Next player* press.
- Game in progress, history, profiles and last setup are kept in `localStorage`, so they survive closing the app or restarting the phone.
- Keeps the screen awake during a game (Screen Wake Lock API).

## Development
Plain HTML/CSS/JS, no build step. Serve the folder over HTTP (e.g. `python3 -m http.server`) and open it.
When you change any file, bump `VERSION` in `sw.js` so installed copies pick up the update.
