/**
 * Generic Synchro Summon procedure: 1 Tuner + 1 or more non-Tuner monsters whose total Level equals
 * the Synchro Monster's Level. Materials are sent from the field to the Graveyard.
 */
import { hasType } from '../cards';
import { getScript } from './scripts';
import type { Game } from './game';
import type { Process, SpecialSummonProcedure, SynchroRequirement } from './scripts';
import type { CardInstance, PlayerId } from './types';

interface Combo {
  tuners: string[];
  nonTuners: string[];
}

function levelOf(g: Game, uid: string): number {
  return g.levelOf(uid);
}

function subsets<T>(items: T[], min: number, max: number): T[][] {
  const out: T[][] = [];
  const n = items.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const chosen: T[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) chosen.push(items[i]);
    if (chosen.length >= min && chosen.length <= max) out.push(chosen);
  }
  return out;
}

/** All legal material combinations for a Synchro Summon. */
export function synchroCombos(g: Game, synchroUid: string, player: PlayerId, req: SynchroRequirement): Combo[] {
  const target = levelOf(g, synchroUid);
  const monsters = g.fieldMonsters(player).filter((m) => m.faceUp && !m.flags['cannotBeSynchroMaterial'] && !g.isLinkMonster(m.uid) && !g.isXyzMonster(m.uid));
  const usable = monsters.filter((m) => !getScript(g.name(m.uid))?.synchroMaterialRestriction?.(g, m, synchroUid));
  const isTuner = (m: CardInstance) => hasType(g.def(m.uid), 'Tuner');
  const tuners = usable.filter((m) => isTuner(m) && (!req.tuner || req.tuner(g, m)));
  // Phantom King Hydride may be treated as a non-Tuner.
  const nonTuners = usable.filter((m) => (!isTuner(m) || getScript(g.name(m.uid))?.synchroAsNonTuner) && (!req.nonTuner || req.nonTuner(g, m)));
  const nTuners = req.tuners ?? 1;
  const [minNon, maxNon] = req.nonTuners ?? [1, 99];
  const combos: Combo[] = [];
  const mustUse = monsters.find((m) => g.name(m.uid) === 'Contact "C"')?.uid;
  for (const ts of subsets(tuners, nTuners, nTuners)) {
    const others = nonTuners.filter((m) => !ts.some((t) => t.uid === m.uid));
    for (const chosen of subsets(others, minNon, Math.min(maxNon, others.length))) {
      const all = [...ts, ...chosen];
      const sum = all.reduce((a, m) => a + levelOf(g, m.uid), 0);
      if (mustUse && !all.some((m) => m.uid === mustUse)) continue;
      if (sum === target) combos.push({ tuners: ts.map((m) => m.uid), nonTuners: chosen.map((m) => m.uid) });
    }
  }
  return combos;
}

/** Perform the material selection + Summon for a given Synchro Monster (used by the procedure and by cards that Synchro Summon mid-effect). */
export function* performSynchroSummon(g: Game, card: CardInstance, player: PlayerId, req: SynchroRequirement): Process<boolean> {
  const combos = synchroCombos(g, card.uid, player, req);
  if (combos.length === 0) return false;
  const level = g.levelOf(card.uid);
  const nTuners = req.tuners ?? 1;
  // Choose the Tuner(s), then the non-Tuners among combos that use them.
  const tunerOptions = [...new Set(combos.flatMap((c) => c.tuners))];
  let tuners: string[];
  if (nTuners === 1) {
    tuners = yield* g.selectCards(player, `Choose the Tuner monster for ${g.name(card.uid)}`, tunerOptions, 1, 1, `Synchro materials: ${req.text}. Total Level must be exactly ${level}.`, true);
  } else {
    tuners = yield* g.selectCards(player, `Choose the ${nTuners} Tuner monsters for ${g.name(card.uid)}`, tunerOptions, nTuners, nTuners, `Synchro materials: ${req.text}. Total Level must be exactly ${level}.`, true);
    if (!combos.some((c) => c.tuners.length === tuners.length && c.tuners.every((u) => tuners.includes(u)))) throw new Error('Those Tuners cannot be used together for this Synchro Summon.');
  }
  const withTuner = combos.filter((c) => c.tuners.length === tuners.length && c.tuners.every((u) => tuners.includes(u)));
  const pool = [...new Set(withTuner.flatMap((c) => c.nonTuners))];
  const minN = Math.min(...withTuner.map((c) => c.nonTuners.length));
  const maxN = Math.max(...withTuner.map((c) => c.nonTuners.length));
  const tunerLevels = tuners.reduce((a, u) => a + levelOf(g, u), 0);
  let nonTuners: string[];
  if (withTuner.length === 1) {
    nonTuners = withTuner[0].nonTuners;
  } else {
    nonTuners = yield* g.selectCards(
      player,
      `Choose the non-Tuner material(s) (Levels must total ${level - tunerLevels})`,
      pool,
      minN,
      maxN,
      `The Tuner${tuners.length > 1 ? 's add' : ' adds'} up to Level ${tunerLevels}; the non-Tuner monsters must add up to Level ${level - tunerLevels}.`,
      true,
    );
    const ok = withTuner.some((c) => c.nonTuners.length === nonTuners.length && c.nonTuners.every((u) => nonTuners.includes(u)));
    if (!ok) throw new Error(`Those materials do not add up to Level ${level}.`);
  }
  const materials = [...tuners, ...nonTuners];
  g.log(`${g.playerName(player)} Synchro Summons ${g.name(card.uid)} using ${materials.map((u) => `${g.name(u)} (Level ${levelOf(g, u)})`).join(' + ')}.`, 'action');
  for (const m of materials) {
    g.log(`${g.name(m)} is sent to the Graveyard as Synchro Material.`, 'rule');
    g.sendToGraveyard(m, 'material', card.uid);
    g.card(m).flags['usedAsSynchroMaterialFor'] = card.uid;
  }
  return yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'synchro', proper: true });
}

export function synchroProcedure(req: SynchroRequirement): SpecialSummonProcedure {
  return {
    id: 'synchro',
    label: 'Synchro Summon',
    description: `Synchro Summon: send ${req.text} from your field to the Graveyard, with total Levels exactly equal to this monster's Level.`,
    from: ['extra'],
    condition: (g, card, player) => {
      const level = g.def(card.uid).level ?? 0;
      if (synchroCombos(g, card.uid, player, req).length === 0) {
        return `To Synchro Summon ${g.name(card.uid)} you need ${req.text} on your field whose Levels add up to exactly ${level}. You do not control such monsters right now.`;
      }
      return null;
    },
    perform: function* (g, card, player): Process<boolean> {
      return yield* performSynchroSummon(g, card, player, req);
    },
  };
}
