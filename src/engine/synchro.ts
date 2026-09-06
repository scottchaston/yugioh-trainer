/**
 * Generic Synchro Summon procedure: 1 Tuner + 1 or more non-Tuner monsters whose total Level equals
 * the Synchro Monster's Level. Materials are sent from the field to the Graveyard.
 */
import { hasType } from '../cards';
import type { Game } from './game';
import type { Process, SpecialSummonProcedure, SynchroRequirement } from './scripts';
import type { CardInstance, PlayerId } from './types';

interface Combo {
  tuner: string;
  nonTuners: string[];
}

function levelOf(g: Game, uid: string): number {
  return g.def(uid).level ?? 0;
}

/** All legal material combinations for a Synchro Summon. */
export function synchroCombos(g: Game, synchroUid: string, player: PlayerId, req: SynchroRequirement): Combo[] {
  const target = levelOf(g, synchroUid);
  const monsters = g.fieldMonsters(player).filter((m) => m.faceUp);
  const tuners = monsters.filter((m) => hasType(g.def(m.uid), 'Tuner') && (!req.tuner || req.tuner(g, m)));
  const nonTuners = monsters.filter((m) => !hasType(g.def(m.uid), 'Tuner') && (!req.nonTuner || req.nonTuner(g, m)));
  const combos: Combo[] = [];
  for (const t of tuners) {
    const others = nonTuners.filter((m) => m.uid !== t.uid);
    const n = others.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const chosen: CardInstance[] = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) chosen.push(others[i]);
      const sum = levelOf(g, t.uid) + chosen.reduce((a, m) => a + levelOf(g, m.uid), 0);
      if (sum === target) combos.push({ tuner: t.uid, nonTuners: chosen.map((m) => m.uid) });
    }
  }
  return combos;
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
      const combos = synchroCombos(g, card.uid, player, req);
      const level = g.def(card.uid).level ?? 0;
      // Choose the Tuner, then the non-Tuners among combos that use it.
      const tunerOptions = [...new Set(combos.map((c) => c.tuner))];
      const [tuner] = yield* g.selectCards(player, `Choose the Tuner monster for ${g.name(card.uid)}`, tunerOptions, 1, 1, `Synchro materials: ${req.text}. Total Level must be exactly ${level}.`, true);
      const withTuner = combos.filter((c) => c.tuner === tuner);
      const pool = [...new Set(withTuner.flatMap((c) => c.nonTuners))];
      const minN = Math.min(...withTuner.map((c) => c.nonTuners.length));
      const maxN = Math.max(...withTuner.map((c) => c.nonTuners.length));
      let nonTuners: string[];
      if (withTuner.length === 1) {
        nonTuners = withTuner[0].nonTuners;
      } else {
        nonTuners = yield* g.selectCards(
          player,
          `Choose the non-Tuner material(s) (Levels must total ${level - levelOf(g, tuner)})`,
          pool,
          minN,
          maxN,
          `${g.name(tuner)} is Level ${levelOf(g, tuner)}; the non-Tuner monsters must add up to Level ${level - levelOf(g, tuner)}.`,
          true,
        );
        const ok = withTuner.some((c) => c.nonTuners.length === nonTuners.length && c.nonTuners.every((u) => nonTuners.includes(u)));
        if (!ok) throw new Error(`Those materials do not add up to Level ${level}.`);
      }
      const materials = [tuner, ...nonTuners];
      g.log(`${g.playerName(player)} Synchro Summons ${g.name(card.uid)} using ${materials.map((u) => `${g.name(u)} (Level ${levelOf(g, u)})`).join(' + ')}.`, 'action');
      for (const m of materials) {
        g.log(`${g.name(m)} is sent to the Graveyard as Synchro Material.`, 'rule');
        g.sendToGraveyard(m, 'material', card.uid);
      }
      return yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'by Synchro Summon', proper: true });
    },
  };
}
