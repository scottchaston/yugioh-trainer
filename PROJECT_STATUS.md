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
| 2 | All Saga of Blue-Eyes card effects (Synchro, Gemini, Azure-Eyes, Honest, Kaiser Glider, traps…) + tests | Partially started (10 cards) |
| 3 | Legend of the Crystal Beasts incl. Crystal Beasts as Continuous Spells, Rainbow Ruins, Rainbow Dragon, Fusion | Not started (engine has hooks: `asContinuousSpell`, `onWouldBeDestroyedInMonsterZone`) |
| 4 | Chains/timing refinement, teaching explanations, "What can I do?" polish, strategy suggestions | Foundations exist |
| 5 | Interface polish, animations, adding more decks | Basic animations exist |

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
* Card scripts implemented so far: Silver's Cry, Monster Reborn, Dragon Shrine, Trade-In, Cards of Consonance,
  Swords of Revealing Light, Enemy Controller, Compulsory Evacuation Device, Kunai with Chain, Honest.
  Every other Spell/Trap shows "not implemented yet" as the reason it cannot be activated (it can still be Set).
  Monsters without scripts work as vanilla monsters (their effects do nothing yet).
* Interface: board with all zones incl. Extra Monster Zones, hands, piles (click to inspect), LP, turn/phase track,
  card inspector with legal/illegal actions and Why?/Why not?, "What can I do?", RESPONSE AVAILABLE panel,
  decision prompts (targets, zones, options), game log, Undo (per step, incl. choices inside an action),
  Rewind to any earlier point, settings (reveal all, phase-window pauses, perspective, animations), winner screen.
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
`npm test` → 38 Vitest tests in `tests/` (setup, turns, summons, battle, Spell/Trap timing, legality listing).
Helpers in `tests/harness.ts` (`makeGame`, `put`, `start`, `endTurn`, answer builders `A`).
Browser smoke tests: `e2e/` (needs `npm run dev` running).

## Known gaps / bugs
* Most card effects are not implemented yet (see Phase 2/3). Rainbow Dragon etc. can currently be Normal
  Summoned like a vanilla monster because its script (with `cannotNormalSummon`) does not exist yet.
* No Synchro/Fusion/Gemini/Pendulum summoning procedures yet (engine hook `specialSummon` exists).
* Kaiser Sea Horse's "2 Tributes" rule: hook (`tributeValue`) exists but the card script is missing.
* "Once per turn" / effect-use counters reset at the start of each turn (correct) but are keyed per player.
* Response windows: the turn player is not asked to respond to their *own* actions in Main Phases
  (they can act freely instead). This matches practical play but means the turn player cannot chain
  to their own Normal Summon with a Quick-Play; rarely relevant.
* Perspective auto-follows whoever must decide; on a shared screen the other player's hand is hidden unless
  "Reveal all" is on.
* Card artwork is a clean generated frame (no copyrighted art), by design.

## Suggested next steps
1. Phase 2: remaining Blue-Eyes scripts — The White Stone of Legend, Maiden with Eyes of Blue, Rider of the
   Storm Winds, Darkstorm Dragon (Gemini), Kaiser Glider, Hieratic Dragon of Tefnuit, Mirage Dragon,
   Divine Dragon Apocralyph, Kaibaman, Herald of Creation, Kaiser Sea Horse, Shining Angel, Azure-Eyes Silver
   Dragon (+ Synchro Summon procedure), Burst Stream of Destruction, Stamping Destruction, A Wingbeat of Giant
   Dragon, White Elephant's Gift, One for One, Dragonic Tactics, Soul Exchange, Castle of Dragon Souls,
   Fiendish Chain, Damage Condenser, Call of the Haunted, Champion's Vigilance. Tests for each listed scenario.
2. Phase 3: Crystal Beasts.
3. Phase 4/5 per plan.
