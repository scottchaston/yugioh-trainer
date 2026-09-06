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
| 5 | Interface polish, animations, adding more decks | Shaded card art with scene backdrops, creature battle animations, particles, screen shake, per-creature voices and per-card Spell/Trap sounds, optional procedural duel music; adding decks still needs scripts |

## What works now (Phase 1)
* Two players, deck lists for both Structure Decks with official TCG text (86 cards),
  Extra Deck correctly separated (Azure-Eyes; Rainbow Overdragon; Ultimate Crystal Rainbow Dragon Overdrive).
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
* Teaching (Phase 4): `src/ui/TeachPanels.tsx` (chain stack with resolution order, per-turn checklist, Rules help
  modal) and `src/strategy/suggest.ts` (heuristic suggestions labelled STRATEGY; never used for legality). Board
  orientation defaults to "turn player at the bottom" so highlighted zones stay on the owner's side; highlighted
  zones are labelled with the deciding player's name and rows carry "Player X's side" tags.
* Sound (`src/ui/sound.ts`): a small Web Audio synth toolkit (tones with slides/vibrato/FM/distortion, filtered
  noise, chimes, swooshes, thuds) builds every sound at runtime, so there are no audio files. `playCreature(archetype,
  'attack' | 'call')` gives each of the 15 creature archetypes a voice (dragon roar, feline roar, tortoise thud, bird
  screech, pegasus whinny and hooves, mammoth trumpet, carbuncle chirp, angel chimes, sword swing and ring, mage zap,
  serpent hiss, insect buzz, ghost wail, titan thunder, stone rumble). `playMotif(kind, isTrap)` gives each of the 45
  Spell/Trap emblems its own sound (chain rattle for Kunai with Chain / Fiendish Chain / Crystal Release, sword
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
  mammoth, carbuncle, angel, warrior, mage, serpent, insect, ghost, titan, stone) with a per-card palette and
  features; every Spell/Trap has its own emblem. Used on card faces, in the attack animation (attacker charges the
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
`npm test` → 101 Vitest tests in `tests/` (setup, turns, summons, battle, Spell/Trap timing, legality listing,
Blue-Eyes interactions in `phase2-blueeyes.test.ts`, Crystal Beast placement in `crystal-beasts-base.test.ts`,
the Crystal Beast deck in `phase3-crystal-beasts.test.ts`). The harness deals neutral hands by default
(`keepHands: true` to keep the dealt cards) and matches answers to prompt types.
Helpers in `tests/harness.ts` (`makeGame`, `put`, `start`, `endTurn`, answer builders `A`).
Browser smoke tests: `e2e/` (needs `npm run dev` running).

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

## Suggested next steps
1. Play-testing feedback: wording of explanations, prompts that feel noisy, any rule that seems wrong.
2. Save/load of a Duel (state is plain JSON; add localStorage or file export), and a "replay" viewer.
3. More decks: the card data pipeline (`scripts/extract-cards.py`) and script registry make this straightforward;
   each new card needs a script and tests.
4. Mobile/tablet layout (the board is designed for a laptop screen or larger).
5. Online play between two private players: the engine is deterministic and the whole Duel is plain JSON with a
   replayable action/answer log, so a small relay server (WebSocket, room code) that holds the authoritative state
   and sends each player a redacted view (hidden hands/face-down cards) is the natural design. See README's
   "Online play" note for the outline.
