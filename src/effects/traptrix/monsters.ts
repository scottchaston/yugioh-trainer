/**
 * Beware of Traptrix (SDBT): Main Deck monsters.
 */
import { registerScript, registerScheduledHandler } from '../../engine/scripts';
import type { Game } from '../../engine/game';
import type { CardInstance, PlayerId } from '../../engine/types';
import { def, deckCards, graveyardCards, handCards, validTargets } from '../helpers';
import { addToHand, banishByEffect, discardCards, isNormalTrap, lastChainLink, searchAndAdd, summonCard, targetableCards, targetableMonstersOf } from '../shared';
import { holeTrapsIn, isHoleTrap, isInsectOrPlant, isTraptrix, isTraptrixMonster, traptrixIn, unaffectedByHoleTraps } from './common';

const summonedSelf = (method?: 'normal' | 'special') => (g: Game, card: CardInstance, ev: { type: string; uid?: string; method?: string }) =>
  ev.type === 'summon' && ev.uid === card.uid && (!method || ev.method === method);

// ---------------------------------------------------------------------------
// Traptrix Pudica
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Pudica',
  unaffectedBy: unaffectedByHoleTraps,
  effects: [
    {
      id: 'garden',
      label: 'Add 1 "Traptrip Garden" from your Deck to your hand',
      description: 'When this card is Normal Summoned: You can add 1 "Traptrip Garden" from your Deck to your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      oncePerTurn: true,
      tags: ['searchDeck'],
      trigger: summonedSelf('normal'),
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.name === 'Traptrip Garden').length ? null : 'There is no Traptrip Garden in your Deck.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add Traptrip Garden to your hand', deckCards(g, ctx.player, (d) => d.name === 'Traptrip Garden'), 'Traptrix Pudica');
      },
    },
    {
      id: 'banish',
      label: "Banish 1 Special Summoned monster your opponent controls (they can return it next Standby Phase)",
      description: "If this card is Special Summoned: You can target 1 Special Summoned monster your opponent controls; banish it, also during the next Standby Phase, your opponent can Special Summon 1 of their banished monsters.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      trigger: summonedSelf('special'),
      condition: (g, card, ctx) => (targetableMonstersOf(g, ctx.player, 'opponent', card.uid, (c) => !!c.flags['specialSummoned']).length ? null : 'Your opponent controls no Special Summoned monster to target.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, "Target 1 Special Summoned monster your opponent controls", targetableMonstersOf(g, ctx.player, 'opponent', card.uid, (c) => !!c.flags['specialSummoned']), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) return;
        if (banishByEffect(g, t, card.uid)) {
          g.schedule('STANDBY', g.state.turn + 1, 'pudicaReturn', `Standby Phase: ${g.playerName(g.opponent(ctx.player))} may Special Summon 1 of their banished monsters (Traptrix Pudica).`, card.uid, { player: g.opponent(ctx.player) });
        }
      },
    },
  ],
});
registerScheduledHandler('pudicaReturn', function* (g, s) {
  const p = s.data['player'] as PlayerId;
  const pool = g.player(p).banished.filter((u) => def(g, u).cardType === 'Monster' && g.card(u).faceUp);
  if (pool.length === 0 || g.freeMonsterZones(p).length === 0) return;
  const yes = yield* g.confirm(p, 'Special Summon 1 of your banished monsters (Traptrix Pudica)?');
  if (!yes) return;
  const [u] = yield* g.selectCards(p, 'Choose a banished monster to Special Summon', pool, 1, 1);
  yield* g.specialSummon(u, p, { position: 'choose', how: "by Traptrix Pudica's effect" });
});

// ---------------------------------------------------------------------------
// Traptrix Arachnocampa
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Arachnocampa',
  unaffectedBy: unaffectedByHoleTraps,
  replaceDestruction: function* (g, self, target, reason) {
    if (reason !== 'effect' || !self.faceUp || !g.isMonsterOnField(self)) return false;
    if (target.zone !== 'spellTrap' || target.faceUp || target.controller !== self.controller) return false;
    if (target.flags['arachnocampaSavedTurn'] === g.state.turn) return false;
    target.flags['arachnocampaSavedTurn'] = g.state.turn;
    g.log(`${g.name(target.uid)} (Set) is not destroyed: Traptrix Arachnocampa protects each Set card the first time each turn.`, 'rule');
    return true;
  },
  effects: [
    {
      id: 'summon',
      label: 'Special Summon this card from your hand (you control a Traptrix monster)',
      description: 'During the Main Phase, if you control a "Traptrix" monster (Quick Effect): You can Special Summon this card from your hand, also you cannot Special Summon monsters from the Extra Deck for the rest of this turn, except Insect or Plant monsters.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['hand'],
      hardOncePerTurn: true,
      hidden: true,
      condition: (g, card, ctx) => {
        if (g.state.phase !== 'MAIN1' && g.state.phase !== 'MAIN2') return 'This effect can only be used during a Main Phase.';
        if (!g.fieldMonsters(ctx.player).some((m) => m.faceUp && isTraptrixMonster(g, m.uid))) return 'You need to control a face-up "Traptrix" monster.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'You have no free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand') return;
        yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
        g.restrictExtraDeck(ctx.player, 'insectPlant');
        g.log(`${g.playerName(ctx.player)} cannot Special Summon monsters from the Extra Deck for the rest of this turn, except Insect or Plant monsters.`, 'rule');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Atrax
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Atrax',
  unaffectedBy: unaffectedByHoleTraps,
  allowTrapActivationFromHand: (g, self, trap) => self.faceUp && g.isMonsterOnField(self) && !self.flags['effectsNegated'] && trap.owner === self.controller && isHoleTrap(g, trap.uid),
  preventNegation: (g, self, link) => (self.faceUp && !self.flags['effectsNegated'] && link.player === self.controller && (link.zone === 'spellTrap' || link.zone === 'hand') && isNormalTrap(def(g, link.uid)) ? 'Traptrix Atrax: the activation and effects of Normal Traps activated on your field cannot be negated.' : null),
  effects: [],
});

// ---------------------------------------------------------------------------
// Traptrix Myrmeleo
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Myrmeleo',
  unaffectedBy: unaffectedByHoleTraps,
  effects: [
    {
      id: 'search',
      label: 'Add 1 "Hole" Normal Trap from your Deck to your hand',
      description: 'When this card is Normal Summoned: You can add 1 "Hole" Normal Trap from your Deck to your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      tags: ['searchDeck'],
      trigger: summonedSelf('normal'),
      condition: (g, card, ctx) => (holeTrapsIn(g, ctx.player, 'deck').length ? null : 'There is no "Hole" Normal Trap in your Deck.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add 1 "Hole" Normal Trap to your hand', holeTrapsIn(g, ctx.player, 'deck'), 'Traptrix Myrmeleo');
      },
    },
    {
      id: 'destroy',
      label: "Destroy 1 Spell/Trap your opponent controls",
      description: 'If this card is Special Summoned: Target 1 Spell/Trap your opponent controls; destroy that target.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      mandatory: true,
      trigger: summonedSelf('special'),
      condition: (g, card, ctx) => (targetableCards(g, ctx.player, 'opponent', card.uid, (c) => !g.isMonsterOnField(c)).length ? null : 'Your opponent controls no Spell or Trap to target.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, "Target 1 Spell/Trap your opponent controls", targetableCards(g, ctx.player, 'opponent', card.uid, (c) => !g.isMonsterOnField(c)), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['spellTrap', 'field']);
        if (t) yield* g.destroyByEffect([t], card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Nepenthes
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Nepenthes',
  unaffectedBy: unaffectedByHoleTraps,
  effects: [
    {
      id: 'onHole',
      label: 'Add to your hand, or Special Summon, 1 Traptrix monster from your Deck',
      description: 'If you activate a "Hole" Normal Trap Card (except during the Damage Step): You can add to your hand, or Special Summon, 1 "Traptrix" monster from your Deck, except "Traptrix Nepenthes".',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      tags: ['searchDeck', 'summonFromDeck'],
      trigger: (g, card, ev) => ev.type === 'activated' && ev.effectId === 'activate' && ev.player === card.controller && isHoleTrap(g, ev.uid) && !g.state.battle?.damageStepStage,
      condition: (g, card, ctx) => (traptrixIn(g, ctx.player, 'deck', (c) => g.name(c.uid) !== 'Traptrix Nepenthes').length ? null : 'There is no other "Traptrix" monster in your Deck.'),
      resolve: function* (g, card, ctx) {
        const pool = traptrixIn(g, ctx.player, 'deck', (c) => g.name(c.uid) !== 'Traptrix Nepenthes');
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Choose 1 "Traptrix" monster from your Deck', pool, 1, 1);
        const canSummon = g.freeMonsterZones(ctx.player).length > 0;
        const choice = canSummon ? yield* g.selectOption(ctx.player, `${g.name(u)}: add it to your hand, or Special Summon it?`, [{ id: 'hand', label: 'Add to hand' }, { id: 'summon', label: 'Special Summon' }]) : 'hand';
        if (choice === 'summon') yield* summonCard(g, u, ctx.player, 'by Traptrix Nepenthes');
        else addToHand(g, u, 'Traptrix Nepenthes');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Dionaea
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Dionaea',
  unaffectedBy: unaffectedByHoleTraps,
  effects: [
    {
      id: 'revive',
      label: 'Special Summon 1 Traptrix monster from your GY in Defense Position',
      description: 'When this card is Normal Summoned: You can target 1 "Traptrix" monster in your GY; Special Summon that target in Defense Position.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      tags: ['summonFromGY'],
      trigger: summonedSelf('normal'),
      condition: (g, card, ctx) => (traptrixIn(g, ctx.player, 'graveyard').length === 0 ? 'There is no "Traptrix" monster in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Traptrix" monster in your Graveyard', traptrixIn(g, ctx.player, 'graveyard'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'DEF', how: 'by Traptrix Dionaea' });
      },
    },
    {
      id: 'setHole',
      label: 'Set 1 "Hole" Normal Trap from your GY (banished in the End Phase of your next turn)',
      description: 'When this card is Special Summoned: You can target 1 "Hole" Normal Trap in your GY; Set that target, but banish it during the End Phase of your next turn if it is still on the field.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      oncePerTurn: true,
      trigger: summonedSelf('special'),
      condition: (g, card, ctx) => (holeTrapsIn(g, ctx.player, 'graveyard').length === 0 ? 'There is no "Hole" Normal Trap in your Graveyard.' : g.freeSpellTrapZones(ctx.player).length === 0 ? 'No free Spell & Trap Zone.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Hole" Normal Trap in your Graveyard', holeTrapsIn(g, ctx.player, 'graveyard'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (!t) return;
        if (yield* g.setSpellTrapFromAnywhere(t, ctx.player)) {
          const turn = g.state.turnPlayer === ctx.player ? g.state.turn + 2 : g.state.turn + 1;
          g.schedule('END', turn, 'banishIfOnField', `End Phase: ${g.name(t)} is banished if it is still on the field (Traptrix Dionaea).`, t, {});
        }
      },
    },
  ],
});
registerScheduledHandler('banishIfOnField', function* (g, s) {
  const c = s.uid ? g.state.cards[s.uid] : undefined;
  if (c && g.isOnField(c)) {
    g.log(`${g.name(c.uid)} is banished.`, 'effect');
    g.banish(c.uid);
  }
});

// ---------------------------------------------------------------------------
// Traptrix Genlisea
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Genlisea',
  unaffectedBy: unaffectedByHoleTraps,
  effects: [
    {
      id: 'setTwo',
      label: 'Tribute this card; Set 2 "Hole" Normal Traps (1 from Deck, 1 from GY)',
      description: 'You can Tribute this card; Set 2 "Hole" Normal Traps with different names, 1 from your Deck and 1 from your GY, but banish them when they leave the field.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Traptrix Genlisea must be face-up.';
        const deck = holeTrapsIn(g, ctx.player, 'deck');
        const gy = holeTrapsIn(g, ctx.player, 'graveyard');
        if (deck.length === 0 || gy.length === 0) return 'You need a "Hole" Normal Trap in your Deck and another in your Graveyard.';
        if (!deck.some((d) => gy.some((y) => g.name(y) !== g.name(d)))) return 'The two "Hole" Normal Traps must have different names.';
        if (g.freeSpellTrapZones(ctx.player).length < 2) return 'You need 2 free Spell & Trap Zones.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Traptrix Genlisea is Tributed (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'tribute', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const deck = holeTrapsIn(g, ctx.player, 'deck');
        if (deck.length === 0) return;
        const [a] = yield* g.selectCards(ctx.player, 'Choose 1 "Hole" Normal Trap from your Deck to Set', deck, 1, 1);
        const gy = holeTrapsIn(g, ctx.player, 'graveyard').filter((u) => g.name(u) !== g.name(a));
        if (gy.length === 0) {
          g.log('There is no "Hole" Normal Trap with a different name in the Graveyard, so nothing is Set.', 'rule');
          return;
        }
        const [b] = yield* g.selectCards(ctx.player, 'Choose 1 "Hole" Normal Trap with a different name from your Graveyard to Set', gy, 1, 1);
        yield* g.setSpellTrapFromAnywhere(a, ctx.player, { banishWhenLeaves: true });
        yield* g.setSpellTrapFromAnywhere(b, ctx.player, { banishWhenLeaves: true });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Vesiculo
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Vesiculo',
  unaffectedBy: unaffectedByHoleTraps,
  effects: [
    {
      id: 'summon',
      label: 'Send 1 Set Trap you control to the GY; Special Summon this card from your hand',
      description: 'You can send 1 Set Trap you control to the GY; Special Summon this card from your hand.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['hand'],
      oncePerTurnGroup: 'vesiculo',
      condition: (g, card, ctx) => {
        if (!g.spellTrapCards(ctx.player).some((c) => !c.faceUp && def(g, c.uid).cardType === 'Trap' && g.canBeSentToGraveyard(c.uid))) return 'You need a Set Trap Card you control to send to the Graveyard.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = g.spellTrapCards(ctx.player).filter((c) => !c.faceUp && def(g, c.uid).cardType === 'Trap' && g.canBeSentToGraveyard(c.uid)).map((c) => c.uid);
        const [u] = yield* g.selectCards(ctx.player, 'Send 1 Set Trap you control to the Graveyard (cost)', pool, 1, 1);
        g.log(`${g.name(u)} is sent to the Graveyard (cost).`, 'effect');
        g.sendToGraveyard(u, 'cost', card.uid);
      },
      resolve: function* (g, card, ctx) {
        if (card.zone === 'hand') yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
      },
    },
    {
      id: 'gySet',
      label: 'Banish this card from your GY; Set 1 "Hole" Normal Trap from your GY',
      description: 'If you control no cards in your Spell & Trap Zone: You can banish this card from your GY, then target 1 "Hole" Normal Trap in your GY; Set it to your field.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['graveyard'],
      oncePerTurnGroup: 'vesiculo',
      tags: ['banishFromGY'],
      condition: (g, card, ctx) => {
        if (g.spellTrapCards(ctx.player).length > 0) return 'You must control no cards in your Spell & Trap Zone.';
        if (holeTrapsIn(g, ctx.player, 'graveyard').length === 0) return 'There is no "Hole" Normal Trap in your Graveyard.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Traptrix Vesiculo is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Hole" Normal Trap in your Graveyard', holeTrapsIn(g, ctx.player, 'graveyard'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) yield* g.setSpellTrapFromAnywhere(t, ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Mantis
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Mantis',
  unaffectedBy: unaffectedByHoleTraps,
  effects: [
    {
      id: 'search',
      label: 'Add 1 "Traptrix" monster from your Deck to your hand',
      description: 'When this card is Normal Summoned: You can add 1 "Traptrix" monster from your Deck to your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      tags: ['searchDeck'],
      trigger: summonedSelf('normal'),
      condition: (g, card, ctx) => (traptrixIn(g, ctx.player, 'deck').length ? null : 'There is no "Traptrix" monster in your Deck.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add 1 "Traptrix" monster to your hand', traptrixIn(g, ctx.player, 'deck'), 'Traptrix Mantis');
      },
    },
    {
      id: 'reset',
      label: 'Return 1 Set Spell/Trap you control to the hand, then you can Set 1 Spell/Trap from your hand',
      description: 'Once per turn (Quick Effect): You can target 1 Set Spell/Trap you control; return that target to the hand, then you can Set 1 Spell/Trap from your hand.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['monster'],
      oncePerTurn: true,
      condition: (g, card, ctx) => (card.faceUp && g.spellTrapCards(ctx.player).some((c) => !c.faceUp) ? null : 'You need a Set Spell/Trap you control to target.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Set Spell/Trap you control', g.spellTrapCards(ctx.player).filter((c) => !c.faceUp).map((c) => c.uid), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['spellTrap']);
        if (!t) return;
        g.log(`${g.name(t)} is returned to the hand.`, 'effect');
        g.toHand(t);
        const pool = handCards(g, ctx.player, (d) => d.cardType === 'Spell' || d.cardType === 'Trap').filter((u) => def(g, u).property !== 'Field');
        if (pool.length === 0 || g.freeSpellTrapZones(ctx.player).length === 0) return;
        const yes = yield* g.confirm(ctx.player, 'Set 1 Spell/Trap from your hand?');
        if (!yes) return;
        const [u] = yield* g.selectCards(ctx.player, 'Choose a Spell/Trap to Set', pool, 1, 1);
        yield* g.setSpellTrapFromAnywhere(u, ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Kaiju monsters (Gadarla, Kumongous)
// ---------------------------------------------------------------------------
function kaijuCounters(g: Game): number {
  let n = 0;
  for (const p of [0, 1] as PlayerId[]) for (const m of g.fieldMonsters(p)) n += m.counters['Kaiju Counter'] ?? 0;
  return n;
}
function isKaiju(g: Game, uid: string): boolean {
  return g.name(uid).includes('Kaiju');
}
function kaijuScript(name: string, effect: Parameters<typeof registerScript>[0]['effects'][number]) {
  registerScript({
    name,
    specialSummon: [
      {
        id: 'kaijuToOpponent',
        label: "Special Summon to your opponent's field by Tributing 1 of their monsters",
        description: "You can Special Summon this card (from your hand) to your opponent's field in Attack Position, by Tributing 1 monster they control. A player can only control 1 \"Kaiju\" monster.",
        from: ['hand'],
        condition: (g, card, player) => {
          const opp = g.opponent(player);
          if (g.fieldMonsters(opp).length === 0) return 'Your opponent controls no monster to Tribute.';
          if (g.fieldMonsters(opp).some((m) => isKaiju(g, m.uid))) return 'Your opponent already controls a "Kaiju" monster (a player can only control 1).';
          return null;
        },
        perform: function* (g, card, player) {
          const opp = g.opponent(player);
          const [t] = yield* g.selectCards(player, "Tribute 1 monster your opponent controls", g.fieldMonsters(opp).map((m) => m.uid), 1, 1, undefined, true);
          g.log(`${g.name(t)} is Tributed for ${g.name(card.uid)}.`, 'action');
          g.sendToGraveyard(t, 'tribute', card.uid);
          return yield* g.specialSummon(card.uid, opp, { position: 'ATK', how: `to ${g.playerName(opp)}'s field by its Kaiju effect` });
        },
      },
      {
        id: 'kaijuToSelf',
        label: 'Special Summon to your field (your opponent controls a Kaiju)',
        description: 'If your opponent controls a "Kaiju" monster, you can Special Summon this card (from your hand) in Attack Position.',
        from: ['hand'],
        condition: (g, card, player) => {
          if (!g.fieldMonsters(g.opponent(player)).some((m) => isKaiju(g, m.uid))) return 'Your opponent does not control a "Kaiju" monster.';
          if (g.fieldMonsters(player).some((m) => isKaiju(g, m.uid))) return 'You already control a "Kaiju" monster.';
          return null;
        },
        perform: function* (g, card, player) {
          return yield* g.specialSummon(card.uid, player, { position: 'ATK', how: 'by its Kaiju condition' });
        },
      },
    ],
    effects: [effect],
  });
}
kaijuScript('Gadarla, the Mystery Dust Kaiju', {
  id: 'halve',
  label: 'Remove 3 Kaiju Counters; halve the ATK/DEF of all other monsters',
  description: 'Once per turn (Quick Effect): You can remove 3 Kaiju Counters from anywhere on the field; the ATK/DEF of all other monsters on the field become halved.',
  kind: 'quick',
  spellSpeed: 2,
  from: ['monster'],
  oncePerTurn: true,
  condition: (g) => (kaijuCounters(g) < 3 ? 'There are not 3 Kaiju Counters on the field (no card in these decks places Kaiju Counters).' : null),
  resolve: function* (g, card) {
    for (const p of [0, 1] as PlayerId[]) {
      for (const m of g.fieldMonsters(p)) {
        if (m.uid === card.uid || !m.faceUp) continue;
        const st = g.stats(m.uid);
        g.addStatMod(m.uid, -Math.floor(st.atk / 2), -Math.floor(st.def / 2), 'permanent', 'Gadarla');
      }
    }
  },
});
kaijuScript('Kumongous, the Sticky String Kaiju', {
  id: 'bind',
  label: 'Remove 2 Kaiju Counters; the Summoned monsters cannot attack and their effects are negated',
  description: "When your opponent Normal or Special Summons a monster(s) (except during the Damage Step): You can remove 2 Kaiju Counters from anywhere on the field; until the end of the next turn, that monster(s) cannot attack and its effects are negated.",
  kind: 'quick',
  spellSpeed: 2,
  from: ['monster'],
  condition: (g) => (kaijuCounters(g) < 2 ? 'There are not 2 Kaiju Counters on the field (no card in these decks places Kaiju Counters).' : null),
  resolve: function* () {
    /* unreachable in these decks */
  },
});

// ---------------------------------------------------------------------------
// Retaliating "C"
// ---------------------------------------------------------------------------
registerScript({
  name: 'Retaliating "C"',
  banishInsteadOfGraveyard: (g, self) => !!self.flags['retaliating'] && self.faceUp && g.isMonsterOnField(self),
  effects: [
    {
      id: 'summon',
      label: 'Special Summon this card from your hand (opponent activated a Spell that Special Summons)',
      description: 'When your opponent activates a Spell Card that includes an effect that Special Summons a monster(s) (Quick Effect): You can Special Summon this card from your hand. If Summoned this way, while this card is face-up on the field, any card sent to the GY is banished instead.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['hand'],
      hidden: true,
      condition: (g, card, ctx) => {
        const last = lastChainLink(g);
        if (!last || last.player === ctx.player || last.effectId !== 'activate' || def(g, last.uid).cardType !== 'Spell') return "This effect responds to your opponent activating a Spell Card that Special Summons.";
        const eff = g.script(last.uid)?.effects.find((e) => e.id === last.effectId);
        if (!eff?.tags?.some((t) => t === 'summonFromDeck' || t === 'summonFromGY' || t === 'specialSummon')) return 'That Spell Card does not Special Summon a monster.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand') return;
        const ok = yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
        if (ok) {
          card.flags['retaliating'] = true;
          g.log('While Retaliating "C" is face-up on the field, any card sent to the Graveyard is banished instead.', 'effect');
        }
      },
    },
    {
      id: 'search',
      label: 'Add 1 EARTH Insect monster with 1500 or less ATK from your Deck to your hand',
      description: 'If this card is sent from the field to the GY: You can add 1 EARTH Insect monster with 1500 or less ATK from your Deck to your hand, except "Retaliating "C"".',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard', 'banished'],
      tags: ['searchDeck'],
      trigger: (g, card, ev) => (ev.type === 'toGraveyard' || ev.type === 'banished') && ev.uid === card.uid && (ev.from === 'monster' || ev.from === 'extraMonster'),
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.attribute === 'EARTH' && d.race === 'Insect' && (d.atk ?? 0) <= 1500 && d.name !== 'Retaliating "C"').length ? null : 'There is no such Insect in your Deck.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add 1 EARTH Insect monster with 1500 or less ATK', deckCards(g, ctx.player, (d) => d.attribute === 'EARTH' && d.race === 'Insect' && (d.atk ?? 0) <= 1500 && d.name !== 'Retaliating "C"'), 'Retaliating "C"');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Resonance Insect
// ---------------------------------------------------------------------------
registerScript({
  name: 'Resonance Insect',
  effects: [
    {
      id: 'search',
      label: 'Add 1 Level 5 or higher Insect monster from your Deck to your hand',
      description: 'If this card is sent from the field to the GY: You can add 1 Level 5 or higher Insect monster from your Deck to your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      tags: ['searchDeck'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && (ev.from === 'monster' || ev.from === 'extraMonster'),
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.race === 'Insect' && (d.level ?? 0) >= 5).length ? null : 'There is no Level 5 or higher Insect monster in your Deck.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add 1 Level 5 or higher Insect monster', deckCards(g, ctx.player, (d) => d.race === 'Insect' && (d.level ?? 0) >= 5), 'Resonance Insect');
      },
    },
    {
      id: 'mill',
      label: 'Send 1 Insect monster from your Deck to the GY',
      description: 'If this card is banished: You can send 1 Insect monster from your Deck to the GY, except "Resonance Insect".',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['banished'],
      tags: ['sendFromDeck'],
      trigger: (g, card, ev) => ev.type === 'banished' && ev.uid === card.uid,
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.race === 'Insect' && d.name !== 'Resonance Insect').length ? null : 'There is no other Insect monster in your Deck.'),
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.race === 'Insect' && d.name !== 'Resonance Insect');
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Send 1 Insect monster from your Deck to the Graveyard', pool, 1, 1);
        g.log(`${g.name(u)} is sent from the Deck to the Graveyard.`, 'effect');
        g.sendToGraveyard(u, 'sent', card.uid);
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Lonefire Blossom
// ---------------------------------------------------------------------------
registerScript({
  name: 'Lonefire Blossom',
  effects: [
    {
      id: 'bloom',
      label: 'Tribute 1 face-up Plant monster; Special Summon 1 Plant monster from your Deck',
      description: 'Once per turn: You can Tribute 1 face-up Plant monster; Special Summon 1 Plant monster from your Deck.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Lonefire Blossom must be face-up.';
        if (!g.fieldMonsters(ctx.player).some((m) => m.faceUp && g.raceOf(m.uid) === 'Plant')) return 'You need a face-up Plant monster to Tribute.';
        if (deckCards(g, ctx.player, (d) => d.race === 'Plant').length === 0) return 'There is no Plant monster in your Deck.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = g.fieldMonsters(ctx.player).filter((m) => m.faceUp && g.raceOf(m.uid) === 'Plant').map((m) => m.uid);
        const [u] = yield* g.selectCards(ctx.player, 'Tribute 1 face-up Plant monster (cost)', pool, 1, 1);
        g.log(`${g.name(u)} is Tributed (cost).`, 'effect');
        g.sendToGraveyard(u, 'tribute', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.race === 'Plant');
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Plant monster from your Deck', pool, 1, 1);
        yield* summonCard(g, u, ctx.player, 'by Lonefire Blossom');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Rose Lover
// ---------------------------------------------------------------------------
registerScript({
  name: 'Rose Lover',
  effects: [
    {
      id: 'bloom',
      label: 'Banish this card from your GY; Special Summon 1 Plant monster from your hand',
      description: "You can banish this card from your GY; Special Summon 1 Plant monster from your hand, and if you do, it is unaffected by your opponent's Trap effects this turn.",
      kind: 'ignition',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      tags: ['banishFromGY'],
      condition: (g, card, ctx) => (handCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Plant').length === 0 ? 'There is no Plant monster in your hand.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      cost: function* (g, card) {
        g.log('Rose Lover is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = handCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Plant');
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Plant monster from your hand', pool, 1, 1);
        const ok = yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Rose Lover' });
        if (ok) {
          g.card(u).flags['unaffectedByOpponentTrapsThisTurn'] = true;
          g.log(`${g.name(u)} is unaffected by the opponent's Trap effects this turn.`, 'effect');
        }
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Sauge de Fleur
// ---------------------------------------------------------------------------
registerScript({
  name: 'Sauge de Fleur',
  effects: [
    {
      id: 'summon',
      label: 'Special Summon this card from your hand; destroy 1 monster you control and 1 card on the field',
      description: 'You can target 1 monster you control and 1 card on the field; Special Summon this card from your hand, and if you do, destroy them.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['hand'],
      hardOncePerTurn: true,
      condition: (g, card, ctx) => {
        if (targetableMonstersOf(g, ctx.player, 'own', card.uid).length === 0) return 'You need a monster you control to target.';
        if (targetableCards(g, ctx.player, 'any', card.uid).length < 2) return 'You need another card on the field to target.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      targets: function* (g, card, ctx) {
        const [a] = yield* g.selectCards(ctx.player, 'Target 1 monster you control', targetableMonstersOf(g, ctx.player, 'own', card.uid), 1, 1);
        const [b] = yield* g.selectCards(ctx.player, 'Target 1 other card on the field', targetableCards(g, ctx.player, 'any', card.uid).filter((u) => u !== a), 1, 1);
        return [a, b];
      },
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand') return;
        const ok = yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
        if (!ok) return;
        const ts = validTargets(g, ctx, ['monster', 'extraMonster', 'spellTrap', 'field']);
        if (ts.length) yield* g.destroyByEffect(ts, card.uid);
      },
    },
    {
      id: 'recycle',
      label: 'Shuffle 1 other monster from your GY into the Deck, then add 1 Level 1 Plant monster to your hand',
      description: 'If this card is sent from the field to your GY: You can target 1 other monster in your GY; shuffle it into the Deck, then add 1 Level 1 Plant monster from your Deck or GY to your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      tags: ['searchDeck', 'addFromGY'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && (ev.from === 'monster' || ev.from === 'extraMonster'),
      condition: (g, card, ctx) => (graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster').filter((u) => u !== card.uid).length ? null : 'There is no other monster in your Graveyard.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 other monster in your Graveyard', graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster').filter((u) => u !== card.uid), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (!t) return;
        g.log(`${g.name(t)} is shuffled into the Deck.`, 'effect');
        g.toDeck(t, 'shuffle');
        const pool = [...deckCards(g, ctx.player, (d) => d.race === 'Plant' && d.level === 1), ...graveyardCards(g, ctx.player, (d) => d.race === 'Plant' && d.level === 1)];
        yield* searchAndAdd(g, ctx.player, 'Add 1 Level 1 Plant monster (from Deck or Graveyard)', pool, 'Sauge de Fleur');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Mekk-Knights
// ---------------------------------------------------------------------------
function mekkColumns(g: Game, player: PlayerId): number[] {
  const out: number[] = [];
  for (let col = 0; col < 5; col++) {
    if (g.cardsInColumn(col).length >= 2 && !g.player(player).monsterZones[g.mainZoneInColumn(player, col)]) out.push(col);
  }
  return out;
}
function mekkSummon(name: string) {
  return {
    id: 'column',
    label: 'Special Summon this card to a column with 2 or more cards',
    description: 'If 2 or more cards are in the same column, you can Special Summon this card (from your hand) in that column. (Columns are the vertical lines of zones; both players\' cards count.) Once per turn.',
    from: ['hand' as const],
    condition: (g: Game, card: CardInstance, player: PlayerId) => {
      if (g.player(player).turnFlags[`mekk:${name}`]) return `You already Special Summoned "${name}" this way this turn.`;
      if (mekkColumns(g, player).length === 0) return 'No column holds 2 or more cards with your Monster Zone in that column free.';
      return null;
    },
    perform: function* (g: Game, card: CardInstance, player: PlayerId) {
      const cols = mekkColumns(g, player);
      let col = cols[0];
      if (cols.length > 1) {
        const z = yield* g.selectZone(player, `Choose the column for ${name}`, cols.map((c) => ({ player, zone: 'monster' as const, index: g.mainZoneInColumn(player, c) })), 'Only columns that already hold 2 or more cards are offered.', true);
        col = player === 0 ? z.index : 4 - z.index;
      }
      const index = g.mainZoneInColumn(player, col);
      const pos = yield* g.selectOption(player, `${name}: which position?`, [{ id: 'ATK', label: 'Attack Position' }, { id: 'DEF', label: 'Defense Position' }]);
      g.placeMonster(card.uid, player, index, pos as 'ATK' | 'DEF', true);
      g.card(card.uid).summonedThisTurn = true;
      g.card(card.uid).flags['specialSummoned'] = true;
      g.card(card.uid).flags['specialSummonedThisTurn'] = true;
      g.card(card.uid).flags['summonedFromHand'] = true;
      g.player(player).turnFlags[`mekk:${name}`] = true;
      g.player(player).turnFlags['specialSummonedThisTurn'] = true;
      g.log(`${name} is Special Summoned to the column with 2 or more cards.`, 'effect');
      g.fx({ type: 'summon', uid: card.uid, method: 'special' });
      g.emit({ type: 'summon', uid: card.uid, player, method: 'special', how: 'column' });
      return true;
    },
  };
}
registerScript({
  name: 'Mekk-Knight Purple Nightfall',
  specialSummon: [mekkSummon('Mekk-Knight Purple Nightfall')],
  effects: [
    {
      id: 'banish',
      label: 'Banish 1 Mekk-Knight you control until your next Standby Phase; add 1 Mekk-Knight from your Deck',
      description: '(Quick Effect): You can target 1 "Mekk-Knight" monster you control; banish it (until the Standby Phase of your next turn), and if you do, add 1 "Mekk-Knight" monster from your Deck to your hand, except "Mekk-Knight Purple Nightfall".',
      kind: 'quick',
      spellSpeed: 2,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => (card.faceUp && targetableMonstersOf(g, ctx.player, 'own', card.uid, (c) => g.name(c.uid).startsWith('Mekk-Knight')).length ? null : 'You need a face-up "Mekk-Knight" monster to target.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Mekk-Knight" monster you control', targetableMonstersOf(g, ctx.player, 'own', card.uid, (c) => g.name(c.uid).startsWith('Mekk-Knight')), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) return;
        if (!banishByEffect(g, t, card.uid)) return;
        const turn = g.state.turnPlayer === ctx.player ? g.state.turn + 2 : g.state.turn + 1;
        g.schedule('STANDBY', turn, 'returnBanished', `Standby Phase: ${g.name(t)} returns to the field (Mekk-Knight Purple Nightfall).`, t, { player: ctx.player });
        yield* searchAndAdd(g, ctx.player, 'Add 1 "Mekk-Knight" monster to your hand', deckCards(g, ctx.player, (d) => d.name.startsWith('Mekk-Knight') && d.name !== 'Mekk-Knight Purple Nightfall'), 'Mekk-Knight Purple Nightfall');
      },
    },
  ],
});
registerScheduledHandler('returnBanished', function* (g, s) {
  const c = s.uid ? g.state.cards[s.uid] : undefined;
  const p = s.data['player'] as PlayerId;
  if (!c || c.zone !== 'banished') return;
  yield* g.specialSummon(c.uid, p, { position: 'choose', how: 'returning from being banished' });
});
registerScript({
  name: 'Mekk-Knight Blue Sky',
  specialSummon: [mekkSummon('Mekk-Knight Blue Sky')],
  effects: [
    {
      id: 'search',
      label: "Add Mekk-Knights from your Deck equal to the opponent's cards in this column",
      description: "If this card is Normal or Special Summoned from the hand: You can add \"Mekk-Knight\" monsters with different names, except \"Mekk-Knight Blue Sky\", from your Deck to your hand, equal to the number of your opponent's cards in this card's column.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['searchDeck'],
      trigger: (g, card, ev) => ev.type === 'summon' && ev.uid === card.uid && (ev.method === 'normal' || !!card.flags['summonedFromHand']),
      condition: (g, card, ctx) => {
        const col = g.columnOf(card);
        const n = col === null ? 0 : g.cardsInColumn(col).filter((c) => c.controller !== ctx.player).length;
        if (n === 0) return "Your opponent has no cards in this card's column.";
        if (deckCards(g, ctx.player, (d) => d.name.startsWith('Mekk-Knight') && d.name !== 'Mekk-Knight Blue Sky').length === 0) return 'There is no other "Mekk-Knight" monster in your Deck.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const col = g.columnOf(card);
        const n = col === null ? 0 : g.cardsInColumn(col).filter((c) => c.controller !== ctx.player).length;
        const pool = deckCards(g, ctx.player, (d) => d.name.startsWith('Mekk-Knight') && d.name !== 'Mekk-Knight Blue Sky');
        const chosen: string[] = [];
        for (let i = 0; i < n; i++) {
          const rest = pool.filter((u) => !chosen.some((c) => g.name(c) === g.name(u)));
          if (rest.length === 0) break;
          const [u] = yield* g.selectCards(ctx.player, `Add "Mekk-Knight" monster ${i + 1} of ${n} (different names)`, rest, 1, 1);
          chosen.push(u);
        }
        for (const u of chosen) addToHand(g, u, 'Mekk-Knight Blue Sky');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Artifact Moralltach
// ---------------------------------------------------------------------------
registerScript({
  name: 'Artifact Moralltach',
  procedureIsNotSummon: true,
  specialSummon: [
    {
      id: 'setAsSpell',
      label: 'Set this card in your Spell & Trap Zone as a Spell',
      description: 'You can Set this card from your hand to your Spell & Trap Zone as a Spell. If it is destroyed there during your opponent\'s turn, it is Special Summoned.',
      from: ['hand'],
      condition: (g, card, player) => (g.freeSpellTrapZones(player).length === 0 ? 'All your Spell & Trap Zones are full.' : null),
      perform: function* (g, card, player) {
        const ok = yield* g.placeMonsterAsSpell(card.uid, player, 'artifact');
        if (ok) g.log('Artifact Moralltach is Set in the Spell & Trap Zone as a Spell Card.', 'action');
        return ok;
      },
    },
  ],
  effects: [
    {
      id: 'rise',
      label: 'Special Summon this card (it was destroyed while Set during the opponent\'s turn)',
      description: "During your opponent's turn, if this Set card in the Spell & Trap Zone is destroyed and sent to your GY: Special Summon it.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && ev.from === 'spellTrap' && !ev.wasFaceUp && (ev.reason === 'destroyedEffect' || ev.reason === 'destroyedBattle') && g.state.turnPlayer !== card.owner,
      condition: (g, card, ctx) => (g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      resolve: function* (g, card, ctx) {
        if (card.zone === 'graveyard') yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
      },
    },
    {
      id: 'destroy',
      label: 'Destroy 1 face-up card your opponent controls',
      description: "If this card is Special Summoned during your opponent's turn: You can destroy 1 face-up card your opponent controls.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      trigger: (g, card, ev) => ev.type === 'summon' && ev.uid === card.uid && ev.method === 'special' && g.state.turnPlayer !== card.controller,
      condition: (g, card, ctx) => (g.fieldMonsters(g.opponent(ctx.player)).concat(g.spellTrapCards(g.opponent(ctx.player))).some((c) => c.faceUp) || g.fieldSpell(g.opponent(ctx.player))?.faceUp ? null : 'Your opponent controls no face-up card.'),
      resolve: function* (g, card, ctx) {
        const opp = g.opponent(ctx.player);
        const pool = [...g.fieldMonsters(opp), ...g.spellTrapCards(opp), ...(g.fieldSpell(opp) ? [g.fieldSpell(opp)!] : [])].filter((c) => c.faceUp).map((c) => c.uid);
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Choose 1 face-up card your opponent controls to destroy', pool, 1, 1);
        yield* g.destroyByEffect([u], card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Fire Hand / Ice Hand / Thunder Hand
// ---------------------------------------------------------------------------
function handScript(name: string, targetKind: 'monster' | 'spellTrap', partner: string) {
  registerScript({
    name,
    effects: [
      {
        id: 'retaliate',
        label: targetKind === 'monster' ? `Destroy 1 monster your opponent controls, then you can Special Summon ${partner} from your Deck` : `Destroy 1 Spell/Trap your opponent controls, then you can Special Summon ${partner} from your Deck`,
        description: `When this card in your possession is destroyed by your opponent's card and sent to your GY: You can target 1 ${targetKind === 'monster' ? 'monster' : 'Spell/Trap'} they control; destroy that target, then you can Special Summon 1 "${partner}" from your Deck.`,
        kind: 'trigger',
        spellSpeed: 1,
        from: ['graveyard'],
        whenYouCan: true,
        tags: ['summonFromDeck'],
        trigger: (g, card, ev) => ev.type === 'destroyed' && ev.uid === card.uid && ev.byPlayer !== undefined && ev.byPlayer !== card.owner,
        condition: (g, card, ctx) => (targetableCards(g, ctx.player, 'opponent', card.uid, (c) => (targetKind === 'monster' ? g.isMonsterOnField(c) : !g.isMonsterOnField(c))).length ? null : `Your opponent controls no ${targetKind === 'monster' ? 'monster' : 'Spell/Trap'} to target.`),
        targets: function* (g, card, ctx) {
          return yield* g.selectCards(ctx.player, `Target 1 ${targetKind === 'monster' ? 'monster' : 'Spell/Trap'} your opponent controls`, targetableCards(g, ctx.player, 'opponent', card.uid, (c) => (targetKind === 'monster' ? g.isMonsterOnField(c) : !g.isMonsterOnField(c))), 1, 1);
        },
        resolve: function* (g, card, ctx) {
          const [t] = validTargets(g, ctx, ['monster', 'extraMonster', 'spellTrap', 'field']);
          if (!t) return;
          const destroyed = yield* g.destroyByEffect([t], card.uid);
          if (destroyed.length === 0) return;
          const pool = deckCards(g, ctx.player, (d) => d.name === partner);
          if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
          const yes = yield* g.confirm(ctx.player, `Special Summon ${partner} from your Deck?`);
          if (yes) yield* summonCard(g, pool[0], ctx.player, `by ${name}`);
        },
      },
    ],
  });
}
handScript('Fire Hand', 'monster', 'Ice Hand');
handScript('Ice Hand', 'spellTrap', 'Fire Hand');
registerScript({
  name: 'Thunder Hand',
  effects: [
    {
      id: 'strike',
      label: 'Special Summon this card (banished when it leaves), and destroy 1 card your opponent controls',
      description: "If a face-up monster(s) you control with 1600 original ATK or DEF is destroyed by battle or an opponent's card effect and sent to the GY, while this card is in your hand or GY: You can Special Summon this card (but banish it when it leaves the field), and if you do, destroy 1 card your opponent controls.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['hand', 'graveyard'],
      hardOncePerTurn: true,
      trigger: (g, card, ev) => {
        if (ev.type !== 'destroyed' || ev.uid === card.uid) return false;
        const c = g.state.cards[ev.uid];
        if (!c || c.owner !== card.owner || c.zone !== 'graveyard') return false;
        const d = def(g, ev.uid);
        if (d.atk !== 1600 && d.def !== 1600) return false;
        return ev.reason === 'battle' || (ev.reason === 'effect' && ev.byPlayer !== undefined && ev.byPlayer !== card.owner);
      },
      condition: (g, card, ctx) => (g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand' && card.zone !== 'graveyard') return;
        const ok = yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
        if (!ok) return;
        card.flags['banishWhenLeavesField'] = true;
        const opp = g.opponent(ctx.player);
        const pool = [...g.fieldMonsters(opp), ...g.spellTrapCards(opp), ...(g.fieldSpell(opp) ? [g.fieldSpell(opp)!] : [])].map((c) => c.uid);
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Choose 1 card your opponent controls to destroy', pool, 1, 1);
        yield* g.destroyByEffect([u], card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Ash Blossom is already scripted (Crystal Beasts deck). Traptrix Pinguicula etc. live in extra.ts.
// ---------------------------------------------------------------------------
export { isTraptrix, isInsectOrPlant };
export const traptrixDiscardPool = (g: Game, player: PlayerId) => g.player(player).hand;
void discardCards;
