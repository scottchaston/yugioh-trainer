/**
 * Link Summon: send monsters from the field to the GY as Link Material; the Link Monster is placed in an
 * Extra Monster Zone or a Main Monster Zone that a Link Monster points to. A Link Monster used as material
 * may count as 1 material or as many as its Link Rating.
 */
import type { Game } from './game';
import type { LinkRequirement, Process, SpecialSummonProcedure } from './scripts';
import type { CardInstance, PlayerId } from './types';

interface LinkCombo {
  uids: string[];
}

export function linkCombos(g: Game, linkUid: string, player: PlayerId, req: LinkRequirement): LinkCombo[] {
  const rating = g.def(linkUid).linkRating ?? 0;
  const monsters = g.fieldMonsters(player).filter((m) => m.faceUp && (!req.material || req.material(g, m)));
  const out: LinkCombo[] = [];
  const n = monsters.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const chosen: CardInstance[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) chosen.push(monsters[i]);
    if (req.including && !chosen.some((m) => req.including!(g, m))) continue;
    // Each material counts as 1, or a Link Monster as its Link Rating: find a counting that reaches the rating.
    const options = chosen.map((m) => (g.isLinkMonster(m.uid) && (g.def(m.uid).linkRating ?? 1) > 1 ? [1, g.def(m.uid).linkRating!] : [1]));
    let found = false;
    const walk = (i: number, sum: number, count: number) => {
      if (found) return;
      if (i === options.length) {
        if (sum === rating && count >= req.count[0] && count <= req.count[1]) found = true;
        return;
      }
      for (const v of options[i]) walk(i + 1, sum + v, count + v);
    };
    walk(0, 0, 0);
    if (found) out.push({ uids: chosen.map((m) => m.uid) });
  }
  return out;
}

export function* performLinkSummon(g: Game, card: CardInstance, player: PlayerId, req: LinkRequirement): Process<boolean> {
  const combos = linkCombos(g, card.uid, player, req);
  if (combos.length === 0) return false;
  const rating = g.def(card.uid).linkRating ?? 0;
  const pool = [...new Set(combos.flatMap((c) => c.uids))];
  const minN = Math.min(...combos.map((c) => c.uids.length));
  const maxN = Math.max(...combos.map((c) => c.uids.length));
  let materials: string[];
  if (combos.length === 1) materials = combos[0].uids;
  else {
    materials = yield* g.selectCards(player, `Choose the Link Materials for ${g.name(card.uid)} (${req.text})`, pool, minN, maxN, `Link Summon: send ${req.text} from your field to the Graveyard. ${g.name(card.uid)} is Link-${rating}, so the materials must add up to ${rating} (a Link Monster can count as its own Link Rating).`, true);
    if (!combos.some((c) => c.uids.length === materials.length && c.uids.every((u) => materials.includes(u)))) throw new Error('Those monsters are not a legal set of Link Materials.');
  }
  g.log(`${g.playerName(player)} Link Summons ${g.name(card.uid)} using ${materials.map((u) => g.name(u)).join(' + ')}.`, 'action');
  for (const m of materials) {
    g.log(`${g.name(m)} is sent to the Graveyard as Link Material.`, 'rule');
    g.sendToGraveyard(m, 'material', card.uid);
  }
  const ok = yield* g.specialSummon(card.uid, player, { position: 'ATK', how: 'link', proper: true });
  if (ok) g.card(card.uid).flags['linkSummoned'] = true;
  return ok;
}

export function linkProcedure(req: LinkRequirement): SpecialSummonProcedure {
  return {
    id: 'link',
    label: 'Link Summon',
    description: `Link Summon: send ${req.text} from your field to the Graveyard. The Link Monster goes to an Extra Monster Zone, or to a Main Monster Zone that a Link Monster's arrow points to. Link Monsters have no DEF and cannot be in Defense Position.`,
    from: ['extra'],
    condition: (g, card, player) => {
      if (linkCombos(g, card.uid, player, req).length === 0) return `To Link Summon ${g.name(card.uid)} you need ${req.text} on your field, adding up to Link-${g.def(card.uid).linkRating}.`;
      return null;
    },
    perform: function* (g, card, player) {
      return yield* performLinkSummon(g, card, player, req);
    },
  };
}
