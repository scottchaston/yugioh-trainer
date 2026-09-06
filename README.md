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

### Option C – on the internet
See "Playing online with a friend" below: once the app is published (free), anyone with the address can open
it, and two people can duel each other from different places.

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

## Playing online with a friend

Open the app, and under **Play online with a friend**:

1. One player presses **Host a duel**. A room code such as `DRAGON-4821` appears, with a link.
2. Send the code or the link to your friend (text message, email, chat).
3. The friend opens the link (or presses **Join a duel** and types the code), picks a name and deck, and
   presses **Join**.
4. The host sees the friend appear, chooses who goes first, and presses **Start Duel**.

During the Duel each player sees only their own hand and their own decisions. When the other player is
deciding, a grey **WAITING** banner says what they are doing ("Guesty is choosing: Choose a Monster Zone…",
"Hosty is deciding whether to respond…"). Response windows still pause the game for whoever may respond.
**Ask to undo** asks the other player to allow the take-back; **Reveal all** and **Rewind** are not available
online. If a connection drops, the guest presses **Reconnect** (or re-joins with the same code) and the Duel
continues where it was; the host's page keeps the Duel, and even after a page reload the setup screen offers
**Resume it**.

How it works: the rules engine runs on the host's browser only. The guest's browser sends "I do X / I choose Y",
the host applies it through the same rules engine you use offline, and sends back a view with the host's hand,
face-down cards and both Decks hidden. The two browsers talk directly (WebRTC); a free public introduction
service (PeerJS) only helps them find each other, and no game data is stored anywhere.

### Putting it on the internet for free

Online play needs the page to be reachable by both players. Any of these is free:

* **GitHub Pages** (public repositories): `.github/workflows/pages.yml` builds and publishes the app. One-time
  setup: repository Settings → Pages → Source: **GitHub Actions**. Then every push to `main` deploys, or use
  "Run workflow" on the Actions tab for any branch. The site appears at
  `https://<your-user>.github.io/yugioh-trainer/`.
* **Cloudflare Pages / Netlify / Vercel** (private repositories too): connect the repository, build command
  `npm run build`, output folder `dist`.
* **No hosting at all**: give your friend a copy of `dist/single/practice-table.html`. Opening the file
  directly in a browser also works for online play.

Room codes are private: nobody can join a Duel without the code, and codes stop working when the host leaves.

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
