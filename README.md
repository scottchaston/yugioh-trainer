# Yu-Gi-Oh! Practice Table

A browser-based Yu-Gi-Oh! TCG practice table with "training wheels" for two beginners
sharing one screen. The rules engine enforces the rules, tells you what is legal right
now, explains *why* something is or is not allowed, pauses at response windows, keeps a
readable game log, and lets you undo mistakes.

Supported decks (official TCG card text, all effects implemented):

* **Saga of Blue-Eyes White Dragon** (Structure Deck: 40 Main Deck + 1 Extra Deck card)
* **Legend of the Crystal Beasts** (Structure Deck: 44 Main Deck + 2 Extra Deck cards)

A Main Deck must have 40 to 60 cards, so both preconstructed decks are legal as printed.

See `PROJECT_STATUS.md` for what works today and what is planned.

## How to open it (no programming knowledge needed)

### Option A – the one-file version
`dist/single/practice-table.html` is a single file containing the whole app.
Double-click it to open it in Chrome, Edge, Firefox or Safari. (It is produced by
`npm run build:single`; if the folder is missing, use option B once to create it.)

### Option B – run from source
1. Install **Node.js** (LTS version) from https://nodejs.org – accept the defaults.
2. Open a terminal (on Windows: search for "Command Prompt"; on Mac: "Terminal").
3. Type `cd ` followed by a space, drag this project folder into the window, press Enter.
4. Type `npm install` and press Enter (only needed the first time).
5. Type `npm run dev` and press Enter. It prints a web address such as
   `http://localhost:5173/` – open that address in your browser.
6. To stop, press `Ctrl+C` in the terminal.

## Playing

* Choose names, decks and who goes first, then **Start Duel**.
* Click any card to read it and see its **Actions**; disabled actions have a
  **Why not?** link that explains the rule.
* Press **What can I do?** to highlight every legal move for the turn player.
* When the other player can respond (a Set Trap, a Quick-Play Spell, Honest…), the table
  pauses with **RESPONSE AVAILABLE**; that player picks a card or declines.
* **Undo** (or Ctrl+Z) reverses the last step, including individual choices inside an
  action. **Rewind** jumps back to any earlier point.
* Click a Graveyard, Banished pile or Extra Deck to look through it. Extra Deck monsters such as
  Azure-Eyes Silver Dragon are Synchro Summoned from there (open the Extra Deck, click the card).
* A Gemini monster (Darkstorm Dragon) shows a **Gemini Summon** action once it is face-up on the field.
* Crystal Master and Crystal Keeper can be placed in your Pendulum Zones (the leftmost and rightmost
  Spell & Trap Zones); with both placed, a **Pendulum Summon** button appears.
* Rainbow Dragon, Rainbow Dark Dragon, Hamon, Rainbow Overdragon and Overdrive offer their own
  **Special Summon** actions when their conditions are met (click the card, or open the Extra Deck).
* Every card has a generated illustration (no official artwork): monsters charge across the board when
  they attack, and Spells/Traps are revealed with their emblem when activated.
* **Suggest move** gives optional strategy ideas, always labelled STRATEGY: they are advice, never rules.
* **Rules help** opens a beginner's reference (phases, summons, positions, battle, Spell Speeds and chains,
  costs versus effects, Crystal Beasts, Pendulum and Gemini monsters).
* The right-hand panel shows a turn checklist and, while cards respond to each other, the chain and its
  resolution order.
* **Sound**: every monster has its own voice (dragons roar, the Crystal Beast tiger and cat growl, warriors
  swing swords, the pegasus whinnies, the tortoise thuds), each Spell/Trap has a fitting sound (a chain rattles
  for Kunai with Chain and Fiendish Chain, Swords of Revealing Light swooshes, Burst Stream charges and blasts,
  Crystal cards chime), and swaps, bounces and position changes swoosh. Browsers only allow audio after you
  click something, so the first click on the page turns it on.
* **Music**: an optional looping "duel theme" in the spirit of the anime soundtracks (composed and played by
  the app itself, no copyrighted recordings). It gets more intense during the Battle Phase. Turn it on/off
  and set the volume in Settings.
* **Settings**: reveal all hands/face-down cards (learning mode), pause at the quieter
  phase windows, board perspective (turn player at the bottom by default), animations, sound effects,
  background music and its volume.

## Online play (not built yet)

The rules engine is deterministic and a Duel is plain data (JSON) plus a log of the actions and choices each
player made, so two-player play over the internet is a natural extension: a small server holds the one true
Duel state, each player's browser sends only "I do X / I choose Y", and the server sends each player back a view
with the other player's hand and face-down cards hidden. A room code would connect two private opponents; the same
code base could be wrapped as a phone/tablet app. See PROJECT_STATUS.md, "Suggested next steps".

## For developers

```
npm install        # once
npm run dev        # development server
npm test           # rules-engine tests (Vitest)
npm run typecheck  # TypeScript
npm run build      # production build into dist/
npm run build:single   # additionally writes dist/single/practice-table.html
```

Layout:

| Folder | Purpose |
| --- | --- |
| `src/cards` | Card data (`data/cards.json`, generated from official TCG text) and deck lists |
| `src/engine` | Deterministic rules engine (state, actions, chains, battle, legality) |
| `src/effects` | Card-effect scripts, one folder per deck |
| `src/state` | Game store: history, Undo/rewind, pending decisions |
| `src/ui` | React interface |
| `tests` | Vitest rules and card-interaction tests |
| `e2e` | Browser smoke tests (Playwright) |
| `scripts` | Card-data extraction and single-file build |

Card text source: the Yaml Yugi project (mirror of the official Konami card database),
cross-checked against the BabelCDB database. Regenerate with
`python3 scripts/extract-cards.py cards.json > src/cards/data/cards.json`.
