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
| 3 | Legend of the Crystal Beasts incl. Crystal Beasts as Continuous Spells, Rainbow Ruins, Rainbow Dragon, Fusion | Started: shared "place in S/T Zone instead of destruction" mechanic done; individual effects pending |
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
* **All Saga of Blue-Eyes cards are implemented** (`src/effects/blueEyes`): Synchro Summon of Azure-Eyes (with its
  protection and Standby revival), Gemini Summon of Darkstorm Dragon, Maiden with Eyes of Blue (attack negation and
  targeting response), Rider of the Storm Winds (becomes an Equip Card, piercing, destroyed instead), Kaiser Glider,
  Hieratic Dragon of Tefnuit, Mirage Dragon, Divine Dragon Apocralyph, Herald of Creation, The White Stone of Legend,
  Kaibaman, Kaiser Sea Horse (2 Tributes for LIGHT), Shining Angel, Honest, and all Spells/Traps incl. Champion's
  Vigilance (Summon/activation negation), Fiendish Chain (effect negation), Call of the Haunted (linked), Damage
  Condenser, Castle of Dragon Souls, Soul Exchange (forced Tribute), Burst Stream, Stamping Destruction, Wingbeat,
  White Elephant's Gift, One for One, Dragonic Tactics, Trade-In, Cards of Consonance, Dragon Shrine, Silver's Cry,
  Monster Reborn, Swords of Revealing Light, Enemy Controller, Compulsory Evacuation Device, Kunai with Chain.
* Crystal Beasts (all 7 + Crystal Beast Rainbow Dragon): when destroyed face-up in a Monster Zone their controller may
  place them face-up in the Spell & Trap Zone as a Continuous Spell (`src/effects/crystalBeasts/beasts.ts`). Rainbow
  Dragon / Rainbow Dark Dragon cannot be Normal Summoned. Other Crystal Beast deck effects show "not implemented yet".
* Visual effects layer (`src/ui/FxLayer.tsx`): attack beam + impact, spotlight reveal for Spell/Trap/monster effect
  activations, destruction shatter, floating LP damage, summon glow, NEGATED stamp, ATK/DEF boosts, "Continuous Spell"
  placement. Driven by the engine's `state.fx` event stream (Settings → Animations turns it off).
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
`npm test` → 71 Vitest tests in `tests/` (setup, turns, summons, battle, Spell/Trap timing, legality listing,
all Blue-Eyes card interactions in `phase2-blueeyes.test.ts`, Crystal Beast placement in `crystal-beasts-base.test.ts`).
Helpers in `tests/harness.ts` (`makeGame`, `put`, `start`, `endTurn`, answer builders `A`).
Browser smoke tests: `e2e/` (needs `npm run dev` running).

## Known gaps / bugs
* Legend of the Crystal Beasts effects other than the shared placement mechanic are not implemented yet (Phase 3):
  Sapphire Pegasus, Rainbow Ruins, Rainbow Dragon's Special Summon, Fusion Summoning (Rainbow Overdragon, Overdrive),
  Pendulum Zones (Crystal Master / Keeper), Crystal Spells/Traps, hand traps (Ash Blossom, Ghost Belle, Dimension
  Shifter, Contact "C"), Cosmic Cyclone, Foolish Burial Goods, Metaverse, Rare Value, Hamon.
* Summon negation (Champion's Vigilance) is offered only to the opponent of the summoning player.
* "Once per turn" / effect-use counters reset at the start of each turn (correct) but are keyed per player.
* Response windows: the turn player is not asked to respond to their *own* actions in Main Phases
  (they can act freely instead). This matches practical play but means the turn player cannot chain
  to their own Normal Summon with a Quick-Play; rarely relevant.
* Perspective auto-follows whoever must decide; on a shared screen the other player's hand is hidden unless
  "Reveal all" is on.
* Card artwork is a clean generated frame (no copyrighted art), by design.

## Suggested next steps
1. Phase 3: Crystal Beast effects (Sapphire Pegasus placement, Ruby Carbuncle, Amethyst Cat direct attack, Emerald
   Tortoise, Topaz Tiger, Amber Mammoth attack redirect, Cobalt Eagle), Ancient City - Rainbow Ruins (count Crystal
   Beast cards in the S/T Zone; cumulative effects), Rainbow Dragon Special Summon + effects, Rainbow Bridge cards,
   Crystal Beacon/Boon/Promise/Tree/Release/Abundance/Blessing/Miracle/Brilliance/Pair/Conclave/Aegis/Bond,
   Ultimate Crystal Magic, Awakening of the Crystal Ultimates, Advanced Dark, Crystal Master/Keeper (Pendulum Zones),
   Fusion Summoning (Rainbow Overdragon, Ultimate Crystal Rainbow Dragon Overdrive), generic staples
   (Ash Blossom, Ghost Belle, Cosmic Cyclone, Metaverse, Foolish Burial Goods, Rare Value, Melody of Awakening Dragon).
2. Phase 4/5 per plan.
