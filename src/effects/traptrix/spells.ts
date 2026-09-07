/**
 * Beware of Traptrix (SDBT): Spell Cards.
 */
import { registerScript } from '../../engine/scripts';
import { FIELD_SPELL_FROM, SPELL_FROM, def, handCards, validTargets } from '../helpers';
import { isNormalTrap, summonCard } from '../shared';
import { isInsectOrPlant, isTraptrixMonster, traptrixIn } from './common';

// ---------------------------------------------------------------------------
// Traptrip Garden (Field)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrip Garden',
  extraNormalSummon: (g, self, card) => (self.zone === 'field' && self.faceUp && !self.flags['effectsNegated'] && g.state.turnPlayer === self.controller && card.owner === self.controller && isTraptrixMonster(g, card.uid) ? null : 'Only a "Traptrix" monster can use the additional Normal Summon of Traptrip Garden.'),
  replaceDestruction: function* (g, self, target, reason) {
    if (reason !== 'battle' || !self.faceUp || self.zone !== 'field' || self.flags['effectsNegated']) return false;
    if (target.controller !== self.controller || !g.isMonsterOnField(target) || !isInsectOrPlant(g, target.uid)) return false;
    if (target.flags['gardenSavedTurn'] === g.state.turn) return false;
    target.flags['gardenSavedTurn'] = g.state.turn;
    g.log(`${g.name(target.uid)} is not destroyed by battle: Traptrip Garden protects each Insect and Plant monster the first time each turn.`, 'rule');
    return true;
  },
  effects: [
    {
      id: 'activate',
      label: 'Activate Traptrip Garden',
      description: 'Field Spell: an extra Normal Summon of a "Traptrix" monster each turn; your Insect and Plant monsters survive battle once per turn; banish 1 monster you control to Special Summon a "Traptrix" from your hand or GY.',
      kind: 'activate',
      spellSpeed: 1,
      from: FIELD_SPELL_FROM,
      resolve: function* () {},
    },
    {
      id: 'summon',
      label: 'Banish 1 monster you control; Special Summon 1 Traptrix monster from your hand or GY',
      description: 'You can banish 1 monster you control; Special Summon 1 "Traptrix" monster from your hand or GY. You can only use this effect of "Traptrip Garden" once per turn.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['field'],
      hardOncePerTurn: true,
      tags: ['summonFromGY'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Traptrip Garden must be face-up.';
        if (g.fieldMonsters(ctx.player).length === 0) return 'You control no monster to banish.';
        if ([...traptrixIn(g, ctx.player, 'hand'), ...traptrixIn(g, ctx.player, 'graveyard')].length === 0) return 'There is no "Traptrix" monster in your hand or Graveyard.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const [u] = yield* g.selectCards(ctx.player, 'Banish 1 monster you control (cost)', g.fieldMonsters(ctx.player).map((m) => m.uid), 1, 1);
        g.log(`${g.name(u)} is banished (cost).`, 'effect');
        g.banish(u, true, card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = [...traptrixIn(g, ctx.player, 'hand'), ...traptrixIn(g, ctx.player, 'graveyard')];
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 "Traptrix" monster from your hand or Graveyard', pool, 1, 1);
        yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Traptrip Garden' });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptantalizing Tune
// ---------------------------------------------------------------------------
const tuneFilter = (g: Parameters<typeof def>[0], u: string) => {
  const d = def(g, u);
  return (d.cardType === 'Monster' && d.level === 4 && (d.race === 'Insect' || d.race === 'Plant')) || isNormalTrap(d);
};
registerScript({
  name: 'Traptantalizing Tune',
  effects: [
    {
      id: 'activate',
      label: 'Discard 1 Level 4 Insect/Plant monster or 1 Normal Trap; draw 2 cards',
      description: 'Discard 1 Level 4 Insect or Plant monster, or 1 Normal Trap; draw 2 cards.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      hardOncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!handCards(g, ctx.player).some((u) => u !== card.uid && tuneFilter(g, u))) return 'You need a Level 4 Insect or Plant monster, or a Normal Trap, in your hand to discard.';
        if (g.player(ctx.player).deck.length < 2) return 'You need at least 2 cards in your Deck to draw.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = handCards(g, ctx.player).filter((u) => u !== card.uid && tuneFilter(g, u));
        const [u] = yield* g.selectCards(ctx.player, 'Discard 1 Level 4 Insect/Plant monster or 1 Normal Trap (cost)', pool, 1, 1);
        g.log(`${g.name(u)} is discarded (cost).`, 'effect');
        g.sendToGraveyard(u, 'discard', card.uid);
      },
      resolve: function* (g, card, ctx) {
        g.draw(ctx.player, 2, 'draws (Traptantalizing Tune)');
      },
    },
    {
      id: 'recycle',
      label: 'Banish this card from your GY; place 1 of your banished Level 4 Insect/Plant monsters or Normal Traps on the bottom of the Deck',
      description: 'You can banish this card from your GY, then target 1 of your banished Level 4 Insect or Plant monsters, or Normal Traps; place it on the bottom of the Deck.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      tags: ['banishFromGY'],
      condition: (g, card, ctx) => (g.player(ctx.player).banished.some((u) => tuneFilter(g, u)) ? null : 'You have no banished Level 4 Insect/Plant monster or Normal Trap.'),
      cost: function* (g, card) {
        g.log('Traptantalizing Tune is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 of your banished Level 4 Insect/Plant monsters or Normal Traps', g.player(ctx.player).banished.filter((u) => tuneFilter(g, u)), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['banished']);
        if (!t) return;
        g.log(`${g.name(t)} is placed on the bottom of the Deck.`, 'effect');
        g.toDeck(t, 'bottom');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Raigeki / Harpie's Feather Duster
// ---------------------------------------------------------------------------
registerScript({
  name: 'Raigeki',
  effects: [
    {
      id: 'activate',
      label: 'Destroy all monsters your opponent controls',
      description: 'Destroy all monsters your opponent controls.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => (g.fieldMonsters(g.opponent(ctx.player)).length === 0 ? 'Your opponent controls no monsters.' : null),
      resolve: function* (g, card, ctx) {
        yield* g.destroyByEffect(g.fieldMonsters(g.opponent(ctx.player)).map((m) => m.uid), card.uid);
      },
    },
  ],
});
registerScript({
  name: "Harpie's Feather Duster",
  effects: [
    {
      id: 'activate',
      label: 'Destroy all Spells and Traps your opponent controls',
      description: 'Destroy all Spells and Traps your opponent controls.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => (g.spellTrapCards(g.opponent(ctx.player)).length === 0 && !g.fieldSpell(g.opponent(ctx.player)) ? 'Your opponent controls no Spells or Traps.' : null),
      resolve: function* (g, card, ctx) {
        const opp = g.opponent(ctx.player);
        const all = [...g.spellTrapCards(opp).map((c) => c.uid), ...(g.fieldSpell(opp) ? [g.fieldSpell(opp)!.uid] : [])];
        yield* g.destroyByEffect(all, card.uid);
      },
    },
  ],
});
void summonCard;
