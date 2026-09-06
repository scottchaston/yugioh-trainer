/**
 * Shared Crystal Beast mechanic: "If this face-up card is destroyed in a Monster Zone, you can place it
 * face-up in your Spell & Trap Zone as a Continuous Spell, instead of sending it to the GY."
 * Individual Crystal Beast effects are added in Phase 3.
 */
import { registerScript, type CardScript } from '../../engine/scripts';

const CRYSTAL_BEASTS = [
  'Crystal Beast Ruby Carbuncle',
  'Crystal Beast Amethyst Cat',
  'Crystal Beast Emerald Tortoise',
  'Crystal Beast Topaz Tiger',
  'Crystal Beast Amber Mammoth',
  'Crystal Beast Cobalt Eagle',
  'Crystal Beast Sapphire Pegasus',
  'Crystal Beast Rainbow Dragon',
];

export function crystalBeastBase(name: string): CardScript {
  return {
    name,
    effects: [],
    onWouldBeDestroyedInMonsterZone: function* (g, self, reason) {
      if (!self.faceUp) return false;
      const player = self.controller;
      if (g.freeSpellTrapZones(player).length === 0) {
        g.log(`${name} would be placed in the Spell & Trap Zone, but ${g.playerName(player)} has no free Spell & Trap Zone.`, 'rule');
        return false;
      }
      const yes = yield* g.confirm(
        player,
        `${name} is being destroyed. Place it in your Spell & Trap Zone as a Continuous Spell instead of sending it to the Graveyard?`,
        'Crystal Beasts destroyed face-up in a Monster Zone can become Continuous Spells in your Spell & Trap Zone. There they are not monsters: they cannot attack or use their monster effects, but Crystal Beast support cards can use them.',
      );
      if (!yes) return false;
      g.log(`${name} is destroyed${reason === 'battle' ? ' by battle' : ''}, but instead of going to the Graveyard it is placed face-up in the Spell & Trap Zone as a Continuous Spell.`, 'effect');
      g.emit({ type: 'destroyed', uid: self.uid, reason });
      const ok = yield* g.placeMonsterAsSpell(self.uid, player, 'continuous');
      return ok;
    },
  };
}

for (const name of CRYSTAL_BEASTS) registerScript(crystalBeastBase(name));

// Ultimate Crystal monsters cannot be Normal Summoned/Set (their Special Summon procedures come in Phase 3).
registerScript({
  name: 'Rainbow Dragon',
  effects: [],
  cannotNormalSummon: 'It must be Special Summoned from your hand by having 7 "Crystal Beast" cards with different names on your field and/or in your Graveyard.',
});
registerScript({
  name: 'Rainbow Dark Dragon',
  effects: [],
  cannotNormalSummon: 'It must be Special Summoned from your hand by banishing 7 DARK monsters with different names from your Graveyard.',
});
