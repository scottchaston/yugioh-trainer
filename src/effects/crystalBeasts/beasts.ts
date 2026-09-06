/**
 * Crystal Beast monsters. All share: "If this face-up card is destroyed in a Monster Zone, you can place it
 * face-up in your Spell & Trap Zone as a Continuous Spell, instead of sending it to the GY."
 */
import { hasType } from '../../cards';
import { registerScript, type CardScript, type EffectDef } from '../../engine/scripts';
import type { Game } from '../../engine/game';
import type { CardInstance } from '../../engine/types';
import { def, targetableMonsters, validTargets } from '../helpers';
import { cbCandidates, cbInSTZone, isCB, isCBMonsterCard, isUltimateCrystal, placeCB, summonFromST, zoneWord } from './common';

function* placeInsteadOfDestruction(g: Game, self: CardInstance, reason: 'battle' | 'effect'): Generator<any, boolean, any> {
  const name = g.name(self.uid);
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
  return yield* g.placeMonsterAsSpell(self.uid, player, 'continuous');
}

export function crystalBeastBase(name: string, effects: EffectDef[] = [], extra: Partial<CardScript> = {}): CardScript {
  return {
    name,
    effects,
    onWouldBeDestroyedInMonsterZone: placeInsteadOfDestruction,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Crystal Beast Ruby Carbuncle
// ---------------------------------------------------------------------------
registerScript(
  crystalBeastBase('Crystal Beast Ruby Carbuncle', [
    {
      id: 'summonAll',
      label: 'Special Summon as many Crystal Beast Monster Cards as possible from your Spell & Trap Zones',
      description: 'When this card is Special Summoned: You can Special Summon as many "Crystal Beast" Monster Cards as possible from your Spell & Trap Zones.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      trigger: (g, card, ev) => ev.type === 'summon' && ev.uid === card.uid && ev.method === 'special',
      condition: (g, card, ctx) => {
        if (cbCandidates(g, ctx.player, ['spellTrap']).length === 0) return 'You have no Crystal Beast Monster Card in your Spell & Trap Zone.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbCandidates(g, ctx.player, ['spellTrap']);
        const n = Math.min(pool.length, g.freeMonsterZones(ctx.player).length);
        if (n === 0) return;
        const chosen = n === pool.length ? pool : yield* g.selectCards(ctx.player, `Special Summon ${n} Crystal Beast Monster Card${n > 1 ? 's' : ''} from your Spell & Trap Zone`, pool, n, n);
        for (const u of chosen) yield* summonFromST(g, u, ctx.player, 'by Crystal Beast Ruby Carbuncle');
      },
    },
  ]),
);

// ---------------------------------------------------------------------------
// Crystal Beast Amethyst Cat — direct attack, damage halved
// ---------------------------------------------------------------------------
registerScript(
  crystalBeastBase('Crystal Beast Amethyst Cat', [], {
    canAttackDirectly: (g, self) => g.isMonsterOnField(self) && self.faceUp,
  }),
);

// ---------------------------------------------------------------------------
// Crystal Beast Emerald Tortoise
// ---------------------------------------------------------------------------
registerScript(
  crystalBeastBase('Crystal Beast Emerald Tortoise', [
    {
      id: 'toDefense',
      label: 'Change 1 monster you control that attacked this turn to Defense Position',
      description: 'Once per turn: You can target 1 monster you control that attacked this turn; change that target to Defense Position.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Emerald Tortoise must be face-up.';
        if (targetableMonsters(g, ctx.player, 'own', (c) => c.attacksDeclaredThisTurn > 0 && c.position === 'ATK').length === 0) return 'You control no monster in Attack Position that attacked this turn.';
        return null;
      },
      targets: function* (g, card, ctx) {
        const pool = targetableMonsters(g, ctx.player, 'own', (c) => c.attacksDeclaredThisTurn > 0 && c.position === 'ATK');
        return yield* g.selectCards(ctx.player, 'Target 1 monster you control that attacked this turn', pool, 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (t) g.changePositionByEffect(t, 'DEF');
      },
    },
  ]),
);

// ---------------------------------------------------------------------------
// Crystal Beast Topaz Tiger — +400 ATK during the Damage Step when attacking a monster
// ---------------------------------------------------------------------------
registerScript(
  crystalBeastBase('Crystal Beast Topaz Tiger', [], {
    onDamageStepStart: (g, self, role) => {
      const b = g.state.battle;
      if (role !== 'attacker' || !b || !b.target) return;
      g.addStatMod(self.uid, 400, 0, 'endOfDamageStep', 'Crystal Beast Topaz Tiger');
      g.log(`Crystal Beast Topaz Tiger gains 400 ATK during the Damage Step (now ${g.stats(self.uid).atk}).`, 'effect');
    },
  }),
);

// ---------------------------------------------------------------------------
// Crystal Beast Amber Mammoth — redirect attacks on other Crystal Beasts to itself
// ---------------------------------------------------------------------------
registerScript(
  crystalBeastBase('Crystal Beast Amber Mammoth', [
    {
      id: 'redirect',
      label: 'Change the attack target to Amber Mammoth',
      description: 'When another "Crystal Beast" monster you control is targeted for an attack: You can change the attack target to this card.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      trigger: (g, card, ev) => ev.type === 'attackDeclared' && !!ev.target && ev.target !== card.uid && g.state.cards[ev.target]?.controller === card.controller && isCB(g, ev.target),
      condition: (g, card) => {
        const b = g.state.battle;
        if (!b || !b.attacker || !b.target || b.target === card.uid) return 'The attack is no longer happening.';
        if (!card.faceUp) return 'Amber Mammoth must be face-up.';
        return null;
      },
      resolve: function* (g, card) {
        const b = g.state.battle;
        if (!b || !b.attacker || !b.target || !g.isMonsterOnField(card)) return;
        b.target = card.uid;
        g.log(`The attack target is changed to Crystal Beast Amber Mammoth.`, 'effect');
        g.fx({ type: 'attack', attacker: b.attacker, target: card.uid, defender: card.controller });
      },
    },
  ]),
);

// ---------------------------------------------------------------------------
// Crystal Beast Cobalt Eagle
// ---------------------------------------------------------------------------
registerScript(
  crystalBeastBase('Crystal Beast Cobalt Eagle', [
    {
      id: 'toTop',
      label: 'Place 1 Crystal Beast card you control on top of the Deck',
      description: 'Once per turn: You can target 1 "Crystal Beast" card you control; place that target on top of the Deck.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Cobalt Eagle must be face-up.';
        if (cbCardsYouControl(g, ctx.player).length === 0) return 'You control no Crystal Beast card.';
        return null;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Crystal Beast card you control (Monster Zone or Spell & Trap Zone)', cbCardsYouControl(g, ctx.player), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster', 'spellTrap']);
        if (!t) return;
        g.log(`${g.name(t)} is placed on top of the Deck.`, 'effect');
        g.toDeck(t, 'top');
      },
    },
  ]),
);

function cbCardsYouControl(g: Game, player: import('../../engine/types').PlayerId): string[] {
  return [...g.fieldMonsters(player).filter((m) => isCB(g, m.uid) && !g.targetingProtection(m, player)), ...cbInSTZone(g, player)].map((c) => c.uid);
}

// ---------------------------------------------------------------------------
// Crystal Beast Sapphire Pegasus
// ---------------------------------------------------------------------------
registerScript(
  crystalBeastBase('Crystal Beast Sapphire Pegasus', [
    {
      id: 'place',
      label: 'Place 1 Crystal Beast from your hand, Deck or GY in your Spell & Trap Zone',
      description: 'When this card is Summoned: You can place 1 "Crystal Beast" monster from your hand, Deck, or GY, face-up in your Spell & Trap Zone as a Continuous Spell.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      trigger: (g, card, ev) => ev.type === 'summon' && ev.uid === card.uid,
      condition: (g, card, ctx) => {
        if (cbCandidates(g, ctx.player, ['hand', 'deck', 'graveyard']).filter((u) => u !== card.uid).length === 0) return 'There is no Crystal Beast monster in your hand, Deck or Graveyard.';
        if (g.freeSpellTrapZones(ctx.player).length === 0) return 'You have no free Spell & Trap Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbCandidates(g, ctx.player, ['hand', 'deck', 'graveyard']).filter((u) => u !== card.uid);
        if (pool.length === 0 || g.freeSpellTrapZones(ctx.player).length === 0) {
          g.log('No Crystal Beast can be placed.', 'rule');
          return;
        }
        const [chosen] = yield* g.selectCards(ctx.player, 'Place 1 Crystal Beast monster face-up in your Spell & Trap Zone', pool, 1, 1, 'Cards shown come from your hand, Deck and Graveyard.');
        yield* placeCB(g, chosen, ctx.player);
      },
    },
  ]),
);

// ---------------------------------------------------------------------------
// Crystal Beast Rainbow Dragon
// ---------------------------------------------------------------------------
registerScript(
  crystalBeastBase('Crystal Beast Rainbow Dragon', [
    {
      id: 'summonSelf',
      label: 'Special Summon Crystal Beast Rainbow Dragon from your hand',
      description: 'When an attack is declared involving a "Crystal Beast" monster: You can Special Summon this card from your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['hand'],
      whenYouCan: true,
      hardOncePerTurn: true,
      trigger: (g, card, ev) => ev.type === 'attackDeclared' && (isCB(g, ev.attacker) || (!!ev.target && isCB(g, ev.target))),
      condition: (g, card, ctx) => (g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand') return;
        yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
      },
    },
    {
      id: 'banishSelf',
      label: 'Banish this Continuous Spell: Special Summon a Level 4 or lower Crystal Beast from the Deck (effects negated) and add an Ultimate Crystal monster',
      description:
        'You can banish this card treated as a Continuous Spell; Special Summon 1 Level 4 or lower "Crystal Beast" monster from your Deck, but negate its effects, and if you do, add 1 "Ultimate Crystal" monster from your Deck to your hand.',
      kind: 'continuousIgnition',
      spellSpeed: 1,
      from: ['spellTrap'],
      hardOncePerTurn: true,
      tags: ['summonFromDeck', 'searchDeck'],
      condition: (g, card, ctx) => {
        if (card.treatedAsSpell !== 'continuous') return 'Crystal Beast Rainbow Dragon must be in your Spell & Trap Zone as a Continuous Spell.';
        if (g.player(ctx.player).deck.filter((u) => isCBMonsterCard(g, u) && (def(g, u).level ?? 0) <= 4).length === 0) return 'There is no Level 4 or lower Crystal Beast in your Deck.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Crystal Beast Rainbow Dragon is banished from the Spell & Trap Zone (cost).', 'effect');
        g.banish(card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = g.player(ctx.player).deck.filter((u) => isCBMonsterCard(g, u) && (def(g, u).level ?? 0) <= 4);
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const [chosen] = yield* g.selectCards(ctx.player, 'Special Summon 1 Level 4 or lower Crystal Beast from your Deck (its effects are negated)', pool, 1, 1);
        const ok = yield* g.specialSummon(chosen, ctx.player, { position: 'choose', how: 'by Crystal Beast Rainbow Dragon' });
        g.shuffleDeck(ctx.player);
        if (!ok) return;
        const m = g.card(chosen);
        m.flags['effectsNegated'] = true;
        m.flags['negatedBy'] = 'Crystal Beast Rainbow Dragon';
        g.log(`${g.name(chosen)}'s effects are negated.`, 'effect');
        const ults = g.player(ctx.player).deck.filter((u) => isUltimateCrystal(g, u));
        if (ults.length === 0) {
          g.log('There is no Ultimate Crystal monster in the Deck to add.', 'rule');
          return;
        }
        const [ult] = yield* g.selectCards(ctx.player, 'Add 1 Ultimate Crystal monster from your Deck to your hand', ults, 1, 1);
        g.log(`${g.name(ult)} is added from the Deck to the hand.`, 'effect');
        g.toHand(ult);
        g.shuffleDeck(ctx.player);
      },
    },
  ]),
);

void hasType;
void zoneWord;
