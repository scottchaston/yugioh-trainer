# Yu-Gi-Oh! Practice Table

A browser-based Yu-Gi-Oh! TCG practice table with "training wheels" for two beginners
sharing one screen. The rules engine enforces the rules, tells you what is legal right
now, explains *why* something is or is not allowed, pauses at response windows, keeps a
readable game log, and lets you undo mistakes.

Supported decks (official TCG card text):

* **Saga of Blue-Eyes White Dragon** (Structure Deck, 41 cards)
* **Legend of the Crystal Beasts** (Structure Deck, 46 cards)

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
* Click a Graveyard, Banished pile or Extra Deck to look through it.
* **Settings**: reveal all hands/face-down cards (learning mode), pause at the quieter
  phase windows, board perspective.

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
