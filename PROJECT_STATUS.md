# Project status

Concise hand-off document. Keep it current when finishing a work session.

## Purpose
Browser-based Yu-Gi-Oh! TCG practice table for two beginners sharing one screen.
The rules engine (code, never an AI model) decides legality, explains rules, pauses at
response windows, logs everything, and supports Undo. Accuracy over feature count.

## Development plan
| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Board, decks, turns/phases, summons, battle, Spell/Trap setting + timing, chains, GY/banished/Extra Deck, log, Undo, tests | **Done** |
| 2 | All Saga of Blue-Eyes card effects (Synchro, Gemini, Azure-Eyes, Honest, Kaiser Glider, traps…) + tests | **Done** (all 41 cards) |
| 3 | Legend of the Crystal Beasts incl. Crystal Beasts as Continuous Spells, Rainbow Ruins, Rainbow Dragon, Fusion | **Done** (all 46 cards) |
| 4 | Chains/timing refinement, teaching explanations, "What can I do?" polish, strategy suggestions | **Done**: chain stack panel, turn checklist, Rules help, "Suggest move" (strategy, clearly separated) |
| 5 | Interface polish, animations, online play, adding more decks | **Done**: shaded card art with scene backdrops, creature battle animations, particles, screen shake, per-creature voices and per-card Spell/Trap sounds, optional procedural duel music; online play over WebRTC with GitHub Pages deployment; **Beware of Traptrix** (all 46 cards) and **The Crimson King** (all 49 cards) with Xyz and Link Summons |

## What works now (Phase 1)
* Two players, deck lists for four Structure Decks with official TCG text (179 distinct cards),
  Extra Deck correctly separated (Azure-Eyes; Rainbow Overdragon; Ultimate Crystal Rainbow Dragon Overdrive; the
  Traptrix Xyz/Link monsters; the Red Dragon Archfiend Synchro family).
* Coin flip / choice of first player; 5-card opening hands; first turn: no draw, no Battle Phase.
* Draw, Standby, Main 1, Battle, Main 2, End Phases; hand-size limit (discard to 6); deck-out loss; LP 0 loss.
* Normal Summon, Set, Tribute Summon (1 / 2 Tributes by Level), one Normal Summon/Set per turn,
  Flip Summon, manual battle-position change with all the usual restrictions.
* Attacks: target choice, direct attacks, ATK vs ATK, ATK vs DEF (no damage, DEF-higher damage to attacker),
  equal ATK both destroyed, face-down monsters flipped before damage calculation, one attack per monster,
  replays when the opponent's monster count changes, piercing hook, Damage Step sub-windows
  (start / before calc / during calc / after calc / end).
* Spell/Trap: Setting (Field Spells to the Field Zone, replacing the old one), Normal Spells only in own
  Main Phase at open state, Quick-Play from hand only on own turn, Set Quick-Play and Traps not usable the turn
  they are Set, Spell Speeds, chain building (both players pass consecutively), reverse resolution, Normal
  Spells/Traps sent to GY after resolving, Continuous/Equip/Field remain, "keep on field" (Swords).
* Trigger effects (mandatory / optional, turn-player-first ordering, "when… you can" missed timing for
  non-last chain links), fast-effect windows after actions, attacks, phase changes, chain links.
* Scheduled effects ("until the End Phase", "End Phase of the opponent's 3rd turn").
* **All Saga of Blue-Eyes cards are implemented** (`src/effects/blueEyes`): Synchro Summon of Azure-Eyes (with its
  protection and Standby revival), Gemini Summon of Darkstorm Dragon, Maiden with Eyes of Blue (attack negation and
  targeting response), Rider of the Storm Winds (becomes an Equip Card, piercing, destroyed instead), Kaiser Glider,
  Hieratic Dragon of Tefnuit, Mirage Dragon, Divine Dragon Apocralyph, Herald of Creation, The White Stone of Legend,
  Kaibaman, Kaiser Sea Horse (2 Tributes for LIGHT), Shining Angel, Honest, and all Spells/Traps incl. Champion's
  Vigilance (Summon/activation negation), Fiendish Chain (effect negation), Call of the Haunted (linked), Damage
  Condenser, Castle of Dragon Souls, Soul Exchange (forced Tribute), Burst Stream, Stamping Destruction, Wingbeat,
  White Elephant's Gift, One for One, Dragonic Tactics, Trade-In, Cards of Consonance, Dragon Shrine, Silver's Cry,
  Monster Reborn, Swords of Revealing Light, Enemy Controller, Compulsory Evacuation Device, Kunai with Chain.
* **All Legend of the Crystal Beasts cards are implemented** (`src/effects/crystalBeasts`): the seven Crystal Beasts
  (placement instead of destruction, Pegasus placement, Ruby mass summon, Amethyst Cat direct attack, Tortoise, Topaz
  Tiger Damage Step bonus, Amber Mammoth redirect, Cobalt Eagle), Crystal Beast Rainbow Dragon, Rainbow Dragon (summon
  condition, first-turn effect restriction, boost/reset), Rainbow Dark Dragon, Rainbow Overdragon (Tribute summon,
  Fusion via Ultimate Crystal Magic), Ultimate Crystal Rainbow Dragon Overdrive, Hamon, Crystal Master / Keeper
  (Pendulum Zones, Pendulum Summon, Pendulum effects), Dimension Shifter, Contact "C", Ash Blossom, Ghost Belle,
  Ancient City - Rainbow Ruins (counts Crystal Beasts in the S/T Zone; all five thresholds), Advanced Dark, every
  "Crystal" Spell/Trap, Rainbow Bridge (+ of the Heart), Awakening of the Crystal Ultimates, Rare Value, Melody,
  Foolish Burial Goods, Cosmic Cyclone, Counter Gem, Ferret Flames, Metaverse, Crystal Aegis (Tokens).
* Engine features added for it: Pendulum Zones/Summon, Extra Monster Zone use, Pendulum monsters to the Extra Deck,
  Tokens, Attribute changes, effect-allowed direct attacks, battle-damage modifiers (halve / none), "banish instead"
  replacement (Dimension Shifter), effect tags for hand traps, extra Normal Summons, damage-step start hooks.
* **All Beware of Traptrix cards are implemented** (`src/effects/traptrix`): the eight Main Deck Traptrix (Pudica,
  Arachnocampa, Atrax, Myrmeleo, Nepenthes, Dionaea, Genlisea, Vesiculo), the Extra Deck Traptrix (Rafflesia Xyz with
  "apply a Hole Trap from the Deck", Allomerus, Cularia, Pinguicula, Atypus, Sera, Mantis Link Monsters), the Kaiju
  (Gadarla, Kumongous: Summon to the opponent's field by Tributing their monster), Retaliating "C", Resonance Insect,
  Lonefire Blossom, Rose Lover, Sauge de Fleur, Mekk-Knights (column counting; Blue Sky search), Artifact Moralltach
  (Set as a Spell, Summons itself when destroyed on the opponent's turn), Fire/Ice/Thunder Hand, Traptrip Garden
  (extra Normal Summon, destruction replacement), Traptantalizing Tune, Raigeki, Harpie's Feather Duster, the whole
  "Hole" Trap family (Trap Hole, Bottomless, Void, Floodgate, Gravedigger's, Traptrix Trap Hole Nightmare, Terrifying
  Trap Hole Nightmare), Trap Trick, The Phantom Knights of Shade Brigandine and Traptrix Holeutea (Traps that become
  monsters), Artifact Sanctum, Naturia Sacred Tree, Evenly Matched (from the hand at the end of the Battle Phase).
* **All The Crimson King cards are implemented** (`src/effects/crimsonKing`): every Resonator (Soul, Vision, Dark,
  Creation, Synkron, Red, Crimson), Bone Archfiend, Vice Dragon, Battle Fader, Red Sprinter, Red Warg, Wandering King
  Wildwind, Phantom King Hydride (Tuner treated as non-Tuner), Magical King Moonstar, Absolute King Back Jack, Red
  Dragon Archfiend/Assault Mode (+ Assault Mode Activate and Assault Beast), Psi-Reflector, Fire Ant Ascator, Ascator
  Dawnwalker, Danger! Nessie! / Chupacabra! (random discard), Witch of the Black Forest, Absolute Powerforce, Crimson
  Gaia, Resonator Engine / Call / Command, Burning Soul (Synchro Summon mid-chain), Pot of Extravagance, Fiendish
  Golem, Red Zone, King's Synchro, Red Reign, Time to Stand Up, Powerful Rebirth, Terrors of the Overroot, and the
  Synchro family: Red Dragon Archfiend, Scarlight and Scarred (treated as "Red Dragon Archfiend"), Hot Red Dragon
  Archfiend Abyss / Bane / King Calamity, Red Nova Dragon, Red Supernova Dragon, Red Rising Dragon.
* Engine features added for them (`src/engine/xyz.ts`, `link.ts`, generalised `synchro.ts`): Xyz Summon with
  attached materials (a `material` zone, `attachMaterial` / `detachMaterials`, materials to the GY when the Xyz
  monster leaves), Link Summon with LINK ratings, arrows and placement in the Extra Monster Zones or linked zones
  (`linkArrowTargets`, `usableLinkZones`), field columns (`column` procedures), Synchro Summons with several Tuners
  and Synchro monsters as material, Traps treated as monsters, cards Set as Spells (Artifacts), "unaffected by" hooks,
  effect negation for a turn, Level modifiers, random choices (`Game.random`), "cannot Special Summon except…" turn
  locks, "cannot activate cards/effects in response" locks, trap activation from the hand, the rule that a card
  already on the chain cannot be activated again, and card art/sound archetypes for Traptrix, plants, Kaiju, fiends,
  archfiends, knights, hands, relics and psychics (`src/ui/art`, `src/ui/sound.ts`).
* Teaching (Phase 4): `src/ui/TeachPanels.tsx` (chain stack with resolution order, per-turn checklist, Rules help
  modal) and `src/strategy/suggest.ts` (heuristic suggestions labelled STRATEGY; never used for legality). Board
  orientation defaults to "turn player at the bottom" so highlighted zones stay on the owner's side; highlighted
  zones are labelled with the deciding player's name and rows carry "Player X's side" tags.
* Sound (`src/ui/sound.ts`): a small Web Audio synth toolkit (tones with slides/vibrato/FM/distortion, filtered
  noise, chimes, swooshes, thuds) builds every sound at runtime, so there are no audio files. `playCreature(archetype,
  'attack' | 'call')` gives each of the 24 creature archetypes a voice (dragon roar, feline roar, tortoise thud, bird
  screech, pegasus whinny and hooves, mammoth trumpet, carbuncle chirp, angel chimes, sword swing and ring, mage zap,
  serpent hiss, insect buzz, ghost wail, titan thunder, stone rumble, Traptrix giggle and snap, plant rustle, Kaiju
  bellow, fiend cackle, archfiend roar with flame, knight hum, hand crackle, relic ring, psychic pulse).
  `playMotif(kind, isTrap)` gives each of the 63 Spell/Trap emblems its own sound (chain rattle for Kunai with Chain / Fiendish Chain / Crystal Release, sword
  swooshes, Burst Stream charge and blast, Stamping Destruction stomp, wing flaps, card shuffles, crystal chimes,
  cyclone, horns, soul wail, device beeps, and so on). Generic sounds (draw, set, summon, attack, impact, damage,
  heal, negate, flip, boost, swoosh, click) cover everything else; bounces, banishes, control swaps and position
  changes use the swoosh. `src/ui/FxLayer.tsx` picks the sound from the same `artFor(def)` lookup that picks the
  card's illustration, so a card's look and voice always match. Settings → Sound effects toggles it.
* Music (`src/ui/music.ts`): a procedural, loop-based duel theme (150 BPM, E minor, drums, sawtooth bass, pads and a
  lead melody with vibrato) scheduled with a look-ahead timer on the Web Audio clock; a "battle" intensity adds
  arpeggios and fills during the Battle Phase. It starts after the first click (browser autoplay rules) while a Duel
  is running and stops at the winner screen or on returning to setup. Settings → Background music and volume.
* Particles/shake: `src/ui/Particles.tsx` draws impact/shatter/sparkle bursts on a canvas; damage shakes the board.
* Card art (`src/ui/art`): every monster has a procedurally drawn creature (dragon, feline, tortoise, bird, pegasus,
  mammoth, carbuncle, angel, warrior, mage, serpent, insect, ghost, titan, stone, traptrix, plant, kaiju, fiend,
  archfiend, knight, hand, relic, psychic) with a per-card palette and features; every Spell/Trap has its own emblem. Used on card faces, in the attack animation (attacker charges the
  defender) and in the activation spotlight. `?gallery=1` shows all illustrations.
* Visual effects layer (`src/ui/FxLayer.tsx`): attack beam + impact, spotlight reveal for Spell/Trap/monster effect
  activations, destruction shatter, floating LP damage, summon glow, NEGATED stamp, ATK/DEF boosts, "Continuous Spell"
  placement. Driven by the engine's `state.fx` event stream (Settings → Animations turns it off).
* Interface: board with all zones incl. Extra Monster Zones, hands, piles (click to inspect), LP, turn/phase track,
  card inspector with legal/illegal actions and Why?/Why not?, "What can I do?", RESPONSE AVAILABLE panel,
  decision prompts (targets, zones, options), game log, Undo (per step, incl. choices inside an action),
  Rewind to any earlier point, settings (reveal all, phase-window pauses, perspective, animations, sound effects,
  background music + volume), winner screen.
* Single-file build: `npm run build:single` → `dist/single/practice-table.html`.

## Computer opponent (`src/ai`)
* `player.ts`: `aiDecide(committed, pending, seat, level)` returns either an action or an answer to the prompt
  addressed to the computer. It only ever chooses among `getLegalActions()` and the engine's prompts. Medium and
  hard score candidates by *rollout*: `execute()` the action (or the rest of the pending one) in a copy, answering
  the computer's own prompts with cheap heuristics (`quickAnswer`) and the human's with "decline / minimum"
  (`opponentDefault`), then `evaluate()` the end state (LP/300, monster stats, back-row and hand counts, plus a
  threat/pressure term weighted 0.5 for medium and 1 for hard). Attack targets branch per target; a face-down target
  is estimated (DEF ≈ 1500) instead of simulated so the computer never learns what a Set monster is. Easy is random
  with light structure (attacks 90% of the time, responds 30%). `rankCards` decides which cards to give up or take
  from prompt wording; `candidateAnswers` keeps the branching small (≤ 8 single cards, min/max sets).
* `controller.ts`: subscribes to the store; when it is the computer's move it decides after 450–900 ms and calls
  `localDispatch`/`localAnswer`. Engine-rejected actions are remembered per history length so they are not retried;
  a 40-actions-per-turn cap ends the turn. `undoAgainstComputer()` undoes until the human is to act again.
  `PlayerConfig.ai` (engine setup) marks the seat; the App locks the perspective to the human, hides the computer's
  prompts, disables the turn buttons while it acts, and shows only the human's end-of-Duel outcome.
* Tests: `tests/ai.test.ts` (self-play across all deck pairs and levels with no illegal moves, hard beats easy,
  strongest-monster Summon, Set when outclassed, Trap Hole response). Browser: `e2e/solo.mjs`.
* Known limits: no multi-turn planning (one action at a time); rollouts use the real deck order for the computer's
  own draws/excavations; evaluation is generic (no per-archetype strategy), so combo-heavy lines (Traptrix Rafflesia
  choices, Resonator Synchro chains) are found only when each step looks good on its own.

## Phones, previews, end of the Duel
* `src/ui/styles.css` `@media (max-width: 900px)`: the board and the side panels stack; `App.tsx` measures the board
  container with a `ResizeObserver` and applies CSS `zoom` to `.board-scale` so all seven columns fit the width
  (the FX layer keeps working because `getBoundingClientRect` reports zoomed sizes). New decisions scroll into view;
  a fixed bottom bar (`.mobile-cardbar`) names the tapped card and jumps to the Card details panel. Hover lifts are
  disabled on touch devices.
* Installable web app: `public/manifest.webmanifest`, `public/icon-192.png` / `icon-512.png` (generated from an
  SVG with Playwright), `public/sw.js` (network-first page, cache-first hashed assets, same-origin only), registered
  from `src/main.tsx` in production builds served over http(s) only. `index.html` carries the theme-color and Apple
  home-screen tags.
* Card previews in prompts (`PromptPanel.tsx`): every option in a select-cards or response prompt has a **read card**
  link that opens a compact `CardSummary` inside the prompt and shows the card in the inspector; clicking a card on
  the board while choosing also updates the inspector.
* End of the Duel (`src/ui/DuelEnd.tsx`): DEFEAT (white flash, cracks drawn with stroke-dashoffset, falling shards,
  `playSound('defeat')`) then VICTORY (rotating rays, confetti, crown, `playSound('victory')`); the buttons fade in
  after the sequence. Online only the local seat's outcome plays; with animations off a static card shows at once.
* Sound: `Settings.sfxVolume` (0–2, default 1) drives the effects bus through `setSfxVolume`; the bus now runs into a
  `DynamicsCompressorNode` so loud settings do not clip. A "test (dragon roar)" link sits next to the slider.
* Browser check: `e2e/mobile.mjs` (390×844 viewport, prompt preview, both end screens). The store exposes
  `window.__ygoDebug.endDuel(winner, reason)` in development builds only (`import.meta.env.DEV`) for that script.

## Online play (two browsers)

* `src/net/`: `protocol.ts` (JSON messages), `transport.ts` (channel interface + in-memory loopback for tests),
  `view.ts` (per-seat redaction: opponent hand, both Decks, opponent Extra Deck and face-down cards become a
  `__hidden__` placeholder; cards a player is choosing from are revealed to that player; Deck order and RNG state
  are not sent), `session.ts` (HostSession runs the normal store and validates every guest intent through the
  engine, sends `PlayerView`s (redacted state, the prompt if it is theirs, legal actions computed by the host,
  a "waiting for…" text); GuestSession is a thin client that forwards intents), `peer.ts` (WebRTC via PeerJS,
  free public signalling, STUN + a free TURN relay; `?peerhost=` for a local PeerServer in tests).
* Card uids are opaque (`p0-17`, numbering shuffled per Duel) so hidden cards leak nothing.
* Undo needs the opponent's consent (request/allow/deny); Rewind and Reveal all are disabled online; the host's
  phase-window setting applies to both players; the guest asks the host for strategy suggestions.
* The host saves the Duel (setup + every action with its answers) to localStorage after each step; it can be
  resumed after a page reload and the guest re-joins with the same code. `saveDuel()/replayDuel()` in the store
  are the general save format (replaying is deterministic).
* Deployment: `.github/workflows/pages.yml` publishes `dist/` to GitHub Pages; `vite.config.ts` uses relative
  asset paths so the same build works on any host, in a sub-folder, or opened from disk.
* Tests: `tests/online.test.ts` (opaque ids, redaction rules, save/replay, host and guest sessions over the
  loopback transport); `e2e/online.mjs` drives two Chromium contexts through a room over real WebRTC with a
  local PeerServer (`e2e/peerserver.mjs`).

## Architecture (see README for folders)
* `GameState` is plain JSON. Every player action runs as a generator "process" (`src/engine/actions.ts`)
  that `yield`s a `Prompt` whenever a player must decide; `execute(base, action, answers)` replays the process
  from the committed state with the recorded answers (`src/engine/process.ts`). The store keeps the committed
  history plus the pending action's answers → Undo is just "drop the last answer / last state".
* Card scripts (`src/effects`) implement `CardScript` (`src/engine/scripts.ts`): effects with kind
  (activate / ignition / quick / trigger / continuousIgnition), Spell Speed, allowed zones, condition, cost,
  targets, resolve; plus continuous hooks (modifyStats, preventTargeting, preventEffectDestruction,
  restrictAttack, extraAttacks, piercing, destruction replacement, special-summon procedures).
* Generic timing rules live in `src/engine/flow.ts` (`canActivateEffect`) and produce the beginner-friendly
  explanations; scripts only add card-specific conditions.
* Legal actions + explanations: `src/engine/legality.ts`.

## Tests
`npm test` → 149 Vitest tests in `tests/` (setup, turns, summons, battle, Spell/Trap timing, legality listing,
Blue-Eyes interactions in `phase2-blueeyes.test.ts`, Crystal Beast placement in `crystal-beasts-base.test.ts`,
the Crystal Beast deck in `phase3-crystal-beasts.test.ts`, online play in `online.test.ts`, the independent-review
fixes in `rules-review.test.ts`, Xyz/Link/Hole Traps/Kaiju/Artifacts in `phase5-traptrix.test.ts`, the Red Dragon
Archfiend Synchro family and Resonators in `phase5-crimson-king.test.ts`). The harness deals neutral hands by default
(`keepHands: true` to keep the dealt cards) and matches answers to prompt types.
Helpers in `tests/harness.ts` (`makeGame`, `put`, `start`, `endTurn`, answer builders `A`).
Browser smoke tests: `e2e/` (needs `npm run dev` running); `e2e/extradeck.mjs` performs an Xyz and a Link Summon.

## Rules-engine fixes from the independent review

1. **Proper Special Summon status is kept in the GY and while banished.** `sendToGraveyard()` and `banish()` no
   longer clear `properlySummoned`; only returning to the Extra Deck / hand / Deck does (`toDeck`, `toHand`, the
   Pendulum-to-Extra-Deck redirect). A negated Special Summon clears the flag before the monster is destroyed. So a
   properly Synchro Summoned Azure-Eyes (or a properly Summoned Rainbow Overdragon / Rainbow Dragon Overdrive) can be
   revived by Monster Reborn, Call of the Haunted or Castle of Dragon Souls, and one that reached the GY any other way
   cannot. Tests: `tests/rules-review.test.ts`, "Proper Special Summon status".
2. **Damage Step timing.** `EffectDef.damageStep` now distinguishes four windows (`DAMAGE_STEP_WINDOWS` in
   `flow.ts`): `'beforeCalc'` for ATK/DEF modifiers and "during the Damage Step" effects (start of the Damage Step and
   before damage calculation only; Honest, Castle of Dragon Souls, Rainbow Dragon's boost), `'calc'` for effects that
   say "during damage calculation" (Crystal Keeper, Advanced Dark's no-damage effect), `'untilCalc'` for battle-damage
   modifiers (Rainbow Ruins' halve; up to and including damage calculation) and `'any'` (Counter Traps, Damage
   Condenser, Crystal Miracle/Pair, Ultimate Crystal Magic, hand traps). Once damage calculation has begun, Honest and
   the other ATK/DEF modifiers are no longer offered, with a beginner-friendly explanation.
3. **Normal response priority.** After an action at an open game state the turn player is offered their own fast
   effects first, then the opponent (`afterAction`). Chains already alternated correctly (opponent first, then the
   activating player may chain to their own card). Castle of Dragon Souls targeting your own Maiden with Eyes of Blue
   now lets you chain Maiden's Quick Effect and Summon Blue-Eyes. In hot-seat play this means the turn player may see
   a RESPONSE AVAILABLE panel after their own action when they hold a usable Quick Effect or Set Trap; declining is
   always allowed.
4. **"Send to the GY" costs are validated.** `Game.canBeSentToGraveyard(uid)` is false for Tokens, for Pendulum
   Monsters on the field (they go to the Extra Deck face-up instead) and while Dimension Shifter's effect applies;
   `whyCannotBeSentToGraveyard()` explains which. Every "send ... to the GY" cost filters its choices and its
   activation condition with it (Darkstorm Dragon, White Elephant's Gift, Rainbow Ruins' negate, Crystal Abundance,
   Rainbow Dragon's boost, Advanced Dark's no-damage effect, Hamon's Summon condition, Honest, Dimension Shifter
   itself), and `sendToGraveyard(uid, 'cost')` refuses an unsendable card as a safety net for any script that forgets.
   So Crystal Master / Crystal Keeper in a Pendulum Zone cannot pay Darkstorm Dragon's cost, though Darkstorm's effect
   still destroys them (to the Extra Deck).

Related issues found while fixing these:
* Three discard costs (Trade-In, Cards of Consonance, Herald of Creation / Divine Dragon Apocralyph) sent the card
  with the generic `'cost'` reason; they now use `'discard'`, so they remain payable under Dimension Shifter
  (discarding is allowed there; the card is banished instead), as the rulings say.
* Card uids used to embed the card's passcode (fixed for online play; the Duel shuffle now consumes one extra RNG
  step, so seeded browser scenarios were re-seeded).
* Not changed, worth knowing: Kunai with Chain is scripted as not activatable during the Damage Step at all; the
  ATK/DEF-modifier windows (`'beforeCalc'`) are applied only to effects whose text is purely an ATK/DEF change.
  Rainbow Ruins' damage-halving keeps the wider `'untilCalc'` window (its text gives no timing). There is no
  Summon-negating card in these two decks, so the negated-Summon path is covered by an engine-level test only.

## Known gaps / simplifications
* Summon negation (Champion's Vigilance) is offered only to the opponent of the summoning player.
* Crystal Conclave's "cannot activate these effects in the same Chain" clause is not enforced.
* Ultimate Crystal Magic's Graveyard effect detects "left the field because of an opponent's card effect" by the
  resolving chain link's controller only.
* Contact "C"'s material restriction is enforced for Synchro Summons (the only Extra Deck summons in these decks
  that use field materials).
* Effects that "shuffle all cards on the field into the Deck" place cards at the bottom and then shuffle.
* "Once per turn" / effect-use counters reset at the start of each turn (correct) but are keyed per player.
* Response windows: the turn player is not asked to respond to their *own* actions in Main Phases
  (they can act freely instead). This matches practical play but means the turn player cannot chain
  to their own Normal Summon with a Quick-Play; rarely relevant.
* Perspective auto-follows whoever must decide; on a shared screen the other player's hand is hidden unless
  "Reveal all" is on.
* Card artwork is a clean generated frame (no copyrighted art), by design.
* Fusion, Synchro and Xyz Monsters are placed in Main Monster Zones; only Link Monsters use the Extra Monster Zones
  (the Master Rule 2020 change that lets other Extra Deck monsters use Main Monster Zones makes this legal play).
* Traptrix Sera and other "when a card is activated" triggers resolve after the chain they respond to instead of
  chaining to it; Sera's Summon therefore happens right after the Trap resolves.
* Hot Red Dragon Archfiend King Calamity's rest-of-turn lock on the opponent's field cards is enforced, but the
  clause "your opponent cannot activate cards or effects in response to this effect's activation" is not (they may
  still chain to it). Kaiju Counters never come into play (no card in these decks places them).
* Trap Trick needs a second copy of the chosen Trap in the Deck (as printed) and Evenly Matched is offered only at the
  end of the Battle Phase, as its text requires, so it never fires on the first turn.
* Traptrix Pudica's "during the next Standby Phase, your opponent can Special Summon 1 of their banished monsters" is a
  scheduled Standby Phase prompt. Traptrix Rafflesia's applied "Hole" Trap uses that Trap's own activation conditions
  and targets.
* Danger! monsters discard a random card using the seeded random generator, so Undo replays the same result.

## Suggested next steps
1. Play-testing feedback: wording of explanations, prompts that feel noisy, any rule that seems wrong; how the
   computer opponent feels at each level (its evaluation weights live at the top of `src/ai/player.ts`).
2. Save/load of a Duel (state is plain JSON; add localStorage or file export), and a "replay" viewer.
3. More decks: the card data pipeline (`scripts/extract-cards.py`) and script registry make this straightforward;
   each new card needs a script and tests. Xyz, Link, Synchro, Fusion, Pendulum and Gemini mechanics all exist now, so
   most structure decks need only card scripts.
4. Mobile polish: a bottom-sheet inspector instead of the jump-to-details bar, landscape-specific layout, larger tap
   targets for the zoomed board.
5. Online play improvements: a chat line, a "spectator" third connection, and an optional relay server for
   networks where WebRTC cannot connect directly (the transport interface makes this a drop-in).
6. Save/load for hot-seat Duels (the replayable save format already exists in the store).
