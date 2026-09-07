/**
 * Xyz Summon: stack monsters of the same Level (usually 2) as material under the Xyz Monster.
 * Materials are not on the field; they are detached (sent to the GY) as costs for the Xyz Monster's effects.
 */
import type { Game } from './game';
import type { Process, SpecialSummonProcedure, XyzRequirement } from './scripts';
import type { CardInstance, PlayerId } from './types';

export function xyzMaterials(g: Game, player: PlayerId, req: XyzRequirement): CardInstance[] {
  return g.fieldMonsters(player).filter((m) => m.faceUp && !g.isLinkMonster(m.uid) && !g.isXyzMonster(m.uid) && g.levelOf(m.uid) === req.level && (!req.material || req.material(g, m)));
}

/** Perform the material selection + Summon (used by the procedure and by cards that Xyz Summon mid-effect). */
export function* performXyzSummon(g: Game, card: CardInstance, player: PlayerId, req: XyzRequirement): Process<boolean> {
  const pool = xyzMaterials(g, player, req);
  if (pool.length < req.count[0]) return false;
  const materials = yield* g.selectCards(
    player,
    `Choose the Xyz Materials for ${g.name(card.uid)} (${req.text})`,
    pool.map((m) => m.uid),
    req.count[0],
    Math.min(req.count[1], pool.length),
    `Xyz Summon: stack ${req.text} from your field under ${g.name(card.uid)}. They become its material.`,
    true,
  );
  g.log(`${g.playerName(player)} Xyz Summons ${g.name(card.uid)} using ${materials.map((u) => `${g.name(u)} (Level ${g.levelOf(u)})`).join(' + ')}.`, 'action');
  for (const m of materials) {
    g.log(`${g.name(m)} becomes Xyz Material of ${g.name(card.uid)}.`, 'rule');
    g.attachMaterial(card.uid, m);
  }
  const ok = yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'xyz', proper: true });
  if (!ok) {
    // The Summon failed: the materials go to the Graveyard.
    for (const m of g.card(card.uid).materials.slice()) g.sendToGraveyard(m, 'rule');
  }
  return ok;
}

export function xyzProcedure(req: XyzRequirement): SpecialSummonProcedure {
  return {
    id: 'xyz',
    label: 'Xyz Summon',
    description: `Xyz Summon: stack ${req.text} you control under this card as material. Xyz Monsters have a Rank instead of a Level; their effects usually cost "detaching" a material (sending it to the Graveyard).`,
    from: ['extra'],
    condition: (g, card, player) => {
      const pool = xyzMaterials(g, player, req);
      if (pool.length < req.count[0]) return `To Xyz Summon ${g.name(card.uid)} you need ${req.text} on your field (you control ${pool.length}).`;
      return null;
    },
    perform: function* (g, card, player) {
      return yield* performXyzSummon(g, card, player, req);
    },
  };
}
