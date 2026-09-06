/** Spell Cards of the Legend of the Crystal Beasts deck. */
import { registerScript } from '../../engine/scripts';
import { negateChainLink } from '../../engine/flow';
import { expectedBattleDamage } from '../../engine/battle';
import type { Game } from '../../engine/game';
import type { PlayerId } from '../../engine/types';
import { FIELD_SPELL_FROM, SPELL_FROM, battlingMonsters, deckCards, def, handCards, validTargets } from '../helpers';
import { cbCandidates, cbInDeck, cbInGY, cbInSTZone, cbMonstersOnField, isCB, isCBMonsterCard, isCrystalSpellTrap, isUltimateCrystal, placeCB, summonFromST } from './common';

// ---------------------------------------------------------------------------
// Ancient City - Rainbow Ruins (Field Spell)
// ---------------------------------------------------------------------------
export function ruinsCount(g: Game, player: PlayerId): number {
  return cbInSTZone(g, player).length;
}

registerScript({
  name: 'Ancient City - Rainbow Ruins',
  effects: [
    {
      id: 'activate',
      label: 'Activate Field Spell',
      description: 'Gains effects based on the number of "Crystal Beast" cards in your Spell & Trap Zone: 1+ cannot be destroyed by card effects; 2+ halve battle damage once per turn; 3+ negate a Spell/Trap activation by sending a Crystal Beast monster to the GY; 4+ draw 1 card once per turn; 5: Special Summon a Crystal Beast from your Spell & Trap Zone once per turn.',
      kind: 'activate',
      spellSpeed: 1,
      from: FIELD_SPELL_FROM,
      resolve: function* (g, card, ctx) {
        g.log(`Ancient City - Rainbow Ruins is active. ${g.playerName(ctx.player)} has ${ruinsCount(g, ctx.player)} Crystal Beast card(s) in the Spell & Trap Zone.`, 'rule');
      },
    },
    {
      id: 'halve',
      label: 'Halve the battle damage you take (2+ Crystal Beasts)',
      description: '● 2+: Once per turn (including the opponent\'s turn) you can halve the battle damage you take.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['field'],
      oncePerTurn: true,
      damageStep: 'untilCalc',
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Rainbow Ruins must be face-up.';
        const n = ruinsCount(g, ctx.player);
        if (n < 2) return `You need at least 2 Crystal Beast cards in your Spell & Trap Zone (you have ${n}).`;
        if (!ctx.damageStepStage || ctx.damageStepStage === 'afterCalc' || ctx.damageStepStage === 'end') return 'This effect is used during damage calculation, when you would take battle damage.';
        if (expectedBattleDamage(g, ctx.player) <= 0) return 'You would not take battle damage from this battle.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        if (ruinsCount(g, ctx.player) < 2) {
          g.log('Fewer than 2 Crystal Beast cards remain in the Spell & Trap Zone, so the damage is not halved.', 'rule');
          return;
        }
        const b = g.state.battle;
        if (b) b.damageModifier[String(ctx.player)] = 'half';
        g.log(`The battle damage ${g.playerName(ctx.player)} takes from this battle will be halved.`, 'effect');
      },
    },
    {
      id: 'negate',
      label: 'Send 1 Crystal Beast monster you control to the GY; negate a Spell/Trap activation and destroy it (3+)',
      description: '● 3+: When a Spell/Trap Card is activated: You can send 1 "Crystal Beast" monster you control to the GY; negate the activation, and if you do, destroy it.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['field'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Rainbow Ruins must be face-up.';
        const n = ruinsCount(g, ctx.player);
        if (n < 3) return `You need at least 3 Crystal Beast cards in your Spell & Trap Zone (you have ${n}).`;
        const chain = g.state.chain;
        const last = chain[chain.length - 1];
        if (!last || last.negated || last.effectId !== 'activate' || def(g, last.uid).cardType === 'Monster') return 'This effect responds to the activation of a Spell or Trap Card.';
        if (cbMonstersOnField(g, ctx.player).filter((m) => g.canBeSentToGraveyard(m.uid)).length === 0) return 'You control no Crystal Beast monster that can be sent to the Graveyard as the cost.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['linkIndex'] = g.state.chain.length - 1;
        const [u] = yield* g.selectCards(ctx.player, 'Send 1 Crystal Beast monster you control to the Graveyard (cost)', cbMonstersOnField(g, ctx.player).filter((m) => g.canBeSentToGraveyard(m.uid)).map((m) => m.uid), 1, 1);
        g.log(`${g.name(u)} is sent to the Graveyard.`, 'effect');
        g.sendToGraveyard(u, 'cost', card.uid);
      },
      resolve: function* (g, card, ctx) {
        if (ruinsCount(g, ctx.player) < 3) {
          g.log('Fewer than 3 Crystal Beast cards remain in the Spell & Trap Zone, so nothing is negated.', 'rule');
          return;
        }
        yield* negateChainLink(g, ctx.data['linkIndex'] as number, card.uid, 'destroy');
      },
    },
    {
      id: 'draw',
      label: 'Draw 1 card (4+ Crystal Beasts)',
      description: '● 4+: Once per turn, during your Main Phase: You can draw 1 card.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['field'],
      oncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Rainbow Ruins must be face-up.';
        const n = ruinsCount(g, ctx.player);
        if (n < 4) return `You need at least 4 Crystal Beast cards in your Spell & Trap Zone (you have ${n}).`;
        return null;
      },
      resolve: function* (g, card, ctx) {
        if (ruinsCount(g, ctx.player) < 4) {
          g.log('Fewer than 4 Crystal Beast cards remain, so no card is drawn.', 'rule');
          return;
        }
        g.draw(ctx.player, 1, 'draws');
      },
    },
    {
      id: 'summon',
      label: 'Special Summon 1 Crystal Beast card from your Spell & Trap Zone (5 Crystal Beasts)',
      description: '● 5: Once per turn, during your Main Phase: You can target 1 "Crystal Beast" card in your Spell & Trap Zone; Special Summon that target.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['field'],
      oncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Rainbow Ruins must be face-up.';
        const n = ruinsCount(g, ctx.player);
        if (n < 5) return `You need all 5 of your Spell & Trap Zones filled with Crystal Beast cards (you have ${n}).`;
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Crystal Beast card in your Spell & Trap Zone', cbCandidates(g, ctx.player, ['spellTrap']), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        if (ruinsCount(g, ctx.player) < 5) {
          g.log('Fewer than 5 Crystal Beast cards remain, so nothing is Special Summoned.', 'rule');
          return;
        }
        const [t] = validTargets(g, ctx, ['spellTrap']);
        if (t) yield* summonFromST(g, t, ctx.player, 'by Ancient City - Rainbow Ruins');
      },
    },
  ],
  preventEffectDestruction: (g, self, target) => (target.uid === self.uid && self.zone === 'field' && self.faceUp && ruinsCount(g, self.controller) >= 1 ? 'Ancient City - Rainbow Ruins cannot be destroyed by card effects while at least 1 Crystal Beast card is in its controller\'s Spell & Trap Zone.' : null),
});

// ---------------------------------------------------------------------------
// Advanced Dark (Field Spell)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Advanced Dark',
  effects: [
    {
      id: 'activate',
      label: 'Activate Field Spell',
      description: 'All "Crystal Beast" monsters on the field and in the GY become DARK. If an "Ultimate Crystal" monster attacks, negate the effects of the attack target during that Battle Phase. During damage calculation, if a "Crystal Beast" monster you control battles and you would take damage: You can send 1 "Crystal Beast" monster from your Deck to the GY; you take no battle damage from that battle.',
      kind: 'activate',
      spellSpeed: 1,
      from: FIELD_SPELL_FROM,
      resolve: function* (g) {
        g.log('Advanced Dark is active: all Crystal Beast monsters on the field and in the Graveyard are DARK.', 'rule');
      },
    },
    {
      id: 'negateTarget',
      label: "Negate the attack target's effects (Ultimate Crystal attacks)",
      description: 'If an "Ultimate Crystal" monster attacks, negate the effects of the attack target during that Battle Phase.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['field'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'attackDeclared' && !!ev.target && isUltimateCrystal(g, ev.attacker) && g.state.cards[ev.attacker]?.controller === card.controller,
      resolve: function* (g, card, ctx) {
        const b = g.state.battle;
        const t = b?.target ? g.state.cards[b.target] : undefined;
        if (!t || !g.isMonsterOnField(t)) return;
        t.flags['effectsNegated'] = true;
        t.flags['negatedBy'] = 'Advanced Dark';
        t.flags['effectsNegatedBattlePhase'] = true;
        g.fx({ type: 'negate', uid: t.uid });
        g.log(`${g.name(t.uid)}'s effects are negated during this Battle Phase (Advanced Dark).`, 'effect');
        void ctx;
      },
    },
    {
      id: 'noDamage',
      label: 'Send 1 Crystal Beast from your Deck to the GY; take no battle damage from this battle',
      description: 'During damage calculation, if a "Crystal Beast" monster you control battles and you would take damage: You can send 1 "Crystal Beast" monster from your Deck to the GY; you take no battle damage from that battle.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['field'],
      damageStep: 'calc',
      tags: ['sendFromDeck'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Advanced Dark must be face-up.';
        if (ctx.damageStepStage !== 'calc') return 'This effect is used during damage calculation.';
        const b = battlingMonsters(g, ctx.player);
        if (!b || !isCB(g, b.mine)) return 'A Crystal Beast monster you control must be battling.';
        if (expectedBattleDamage(g, ctx.player) <= 0) return 'You would not take battle damage from this battle.';
        if (cbInDeck(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Deck to send.';
        if (!g.canBeSentToGraveyard(cbInDeck(g, ctx.player)[0])) return g.whyCannotBeSentToGraveyard(cbInDeck(g, ctx.player)[0]);
        return null;
      },
      cost: function* (g, card, ctx) {
        const [u] = yield* g.selectCards(ctx.player, 'Send 1 Crystal Beast monster from your Deck to the Graveyard (cost)', cbInDeck(g, ctx.player), 1, 1);
        g.log(`${g.name(u)} is sent from the Deck to the Graveyard.`, 'effect');
        g.sendToGraveyard(u, 'cost', card.uid);
        g.shuffleDeck(ctx.player);
      },
      resolve: function* (g, card, ctx) {
        const b = g.state.battle;
        if (b) b.damageModifier[String(ctx.player)] = 'none';
        g.log(`${g.playerName(ctx.player)} takes no battle damage from this battle.`, 'effect');
      },
    },
  ],
  modifyAttribute: (g, self, target) => (self.zone === 'field' && self.faceUp && isCBMonsterCard(g, target.uid) && (g.isMonsterOnField(target) || target.zone === 'graveyard') ? 'DARK' : null),
});

// ---------------------------------------------------------------------------
// Simple Normal Spells
// ---------------------------------------------------------------------------
registerScript({
  name: 'Rainbow Bridge',
  effects: [
    {
      id: 'activate',
      label: 'Add 1 "Crystal" Spell/Trap from your Deck to your hand',
      description: 'Add 1 "Crystal" Spell/Trap from your Deck to your hand.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => (g.player(ctx.player).deck.filter((u) => isCrystalSpellTrap(g, u)).length === 0 ? 'There is no "Crystal" Spell or Trap Card in your Deck.' : null),
      resolve: function* (g, card, ctx) {
        const pool = g.player(ctx.player).deck.filter((u) => isCrystalSpellTrap(g, u));
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Add 1 "Crystal" Spell/Trap from your Deck to your hand', pool, 1, 1);
        g.log(`${g.name(u)} is added from the Deck to the hand.`, 'effect');
        g.toHand(u);
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

registerScript({
  name: 'Crystal Beacon',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon 1 Crystal Beast from your Deck (needs 2+ Crystal Beasts in your Spell & Trap Zone)',
      description: 'Special Summon 1 "Crystal Beast" monster from your Deck. You must have 2 or more "Crystal Beast" cards in your Spell & Trap Zone to activate and to resolve this effect.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => {
        const n = cbInSTZone(g, ctx.player).length;
        if (n < 2) return `You need 2 or more Crystal Beast cards in your Spell & Trap Zone (you have ${n}).`;
        if (cbInDeck(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Deck.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        if (cbInSTZone(g, ctx.player).length < 2) {
          g.log('Fewer than 2 Crystal Beast cards are in the Spell & Trap Zone, so Crystal Beacon does nothing.', 'rule');
          return;
        }
        const pool = cbInDeck(g, ctx.player);
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Crystal Beast monster from your Deck', pool, 1, 1);
        yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Crystal Beacon' });
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

registerScript({
  name: 'Crystal Blessing',
  effects: [
    {
      id: 'activate',
      label: 'Place up to 2 Crystal Beast monsters from your GY in your Spell & Trap Zone',
      description: 'Target up to 2 "Crystal Beast" monsters in your GY; place those targets face-up in your Spell & Trap Zone as Continuous Spells.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (cbInGY(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Graveyard.';
        if (g.freeSpellTrapZones(ctx.player).length <= (card.zone === 'hand' ? 1 : 0)) return 'You need a free Spell & Trap Zone to place a Crystal Beast (besides the one this card uses).';
        return null;
      },
      targets: function* (g, card, ctx) {
        const max = Math.min(2, cbInGY(g, ctx.player).length);
        return yield* g.selectCards(ctx.player, 'Target up to 2 Crystal Beast monsters in your Graveyard', cbInGY(g, ctx.player), 1, max);
      },
      resolve: function* (g, card, ctx) {
        for (const t of validTargets(g, ctx, ['graveyard'])) {
          if (g.freeSpellTrapZones(ctx.player).length === 0) break;
          yield* placeCB(g, t, ctx.player);
        }
      },
    },
  ],
});

registerScript({
  name: 'Crystal Promise',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon 1 Crystal Beast card from your Spell & Trap Zone',
      description: 'Target 1 "Crystal Beast" card in your Spell & Trap Zone; Special Summon that target.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (cbCandidates(g, ctx.player, ['spellTrap']).length === 0) return 'There is no Crystal Beast card in your Spell & Trap Zone.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Crystal Beast card in your Spell & Trap Zone', cbCandidates(g, ctx.player, ['spellTrap']), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['spellTrap']);
        if (t) yield* summonFromST(g, t, ctx.player, 'by Crystal Promise');
      },
    },
  ],
});

registerScript({
  name: 'Crystal Abundance',
  effects: [
    {
      id: 'activate',
      label: 'Send 4 Crystal Beasts from your Spell & Trap Zone to the GY; clear the field; revive Crystal Beasts',
      description: 'Send 4 "Crystal Beast" cards from your Spell & Trap Zone to the GY; send as many cards on the field as possible to the GY, then Special Summon as many "Crystal Beast" monsters as possible from your GY, up to the number of cards sent from your opponent\'s field to the GY by this card\'s effect.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      tags: ['summonFromGY'],
      condition: (g, card, ctx) => {
        const pool = cbInSTZone(g, ctx.player).filter((c) => g.canBeSentToGraveyard(c.uid));
        if (pool.length < 4) return `You need 4 Crystal Beast cards in your Spell & Trap Zone that can be sent to the Graveyard (you have ${pool.length}).`;
        return null;
      },
      cost: function* (g, card, ctx) {
        const chosen = yield* g.selectCards(ctx.player, 'Send 4 Crystal Beast cards from your Spell & Trap Zone to the Graveyard (cost)', cbInSTZone(g, ctx.player).filter((c) => g.canBeSentToGraveyard(c.uid)).map((c) => c.uid), 4, 4);
        for (const u of chosen) {
          g.log(`${g.name(u)} is sent to the Graveyard.`, 'effect');
          g.sendToGraveyard(u, 'cost', card.uid);
        }
      },
      resolve: function* (g, card, ctx) {
        const opp = g.opponent(ctx.player);
        let oppCount = 0;
        for (const p of [0, 1] as PlayerId[]) {
          const all = [...g.fieldMonsters(p).map((m) => m.uid), ...g.spellTrapCards(p).map((c) => c.uid), ...(g.fieldSpell(p) ? [g.fieldSpell(p)!.uid] : [])].filter((u) => u !== card.uid);
          for (const u of all) {
            g.log(`${g.name(u)} is sent to the Graveyard.`, 'effect');
            g.sendToGraveyard(u, 'sent', card.uid);
            if (p === opp) oppCount++;
          }
        }
        const pool = cbInGY(g, ctx.player);
        const max = Math.min(oppCount, pool.length, g.freeMonsterZones(ctx.player).length);
        g.log(`${oppCount} card${oppCount === 1 ? '' : 's'} were sent from the opponent's field; up to ${max} Crystal Beast monster${max === 1 ? '' : 's'} can be Special Summoned.`, 'rule');
        if (max === 0) return;
        const chosen = yield* g.selectCards(ctx.player, `Special Summon up to ${max} Crystal Beast monsters from your Graveyard`, pool, max, max);
        for (const u of chosen) yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Crystal Abundance' });
      },
    },
  ],
});

registerScript({
  name: 'Crystal Bond',
  effects: [
    {
      id: 'activate',
      label: 'Add 1 Crystal Beast from your Deck to your hand and place another in your Spell & Trap Zone',
      description: 'Add 1 "Crystal Beast" monster from your Deck to your hand, and place 1 "Crystal Beast" monster with a different name from your Deck face-up in your Spell & Trap Zone as a Continuous Spell. You can only activate 1 "Crystal Bond" per turn.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      hardOncePerTurn: true,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => {
        const pool = cbInDeck(g, ctx.player);
        if (new Set(pool.map((u) => g.name(u))).size < 2) return 'You need 2 Crystal Beast monsters with different names in your Deck.';
        if (g.freeSpellTrapZones(ctx.player).length <= (card.zone === 'hand' ? 1 : 0)) return 'You need a free Spell & Trap Zone for the placed Crystal Beast.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbInDeck(g, ctx.player);
        if (pool.length === 0) return;
        const [a] = yield* g.selectCards(ctx.player, 'Add 1 Crystal Beast monster from your Deck to your hand', pool, 1, 1);
        g.log(`${g.name(a)} is added from the Deck to the hand.`, 'effect');
        g.toHand(a);
        const pool2 = cbInDeck(g, ctx.player).filter((u) => g.name(u) !== g.name(a));
        if (pool2.length === 0 || g.freeSpellTrapZones(ctx.player).length === 0) {
          g.log('No Crystal Beast with a different name can be placed.', 'rule');
          g.shuffleDeck(ctx.player);
          return;
        }
        const [b] = yield* g.selectCards(ctx.player, 'Place 1 Crystal Beast monster with a different name face-up in your Spell & Trap Zone', pool2, 1, 1);
        yield* placeCB(g, b, ctx.player);
      },
    },
  ],
});

registerScript({
  name: 'Rare Value',
  effects: [
    {
      id: 'activate',
      label: 'Opponent chooses 1 of your Crystal Beast cards in the Spell & Trap Zone to send to the GY; draw 2',
      description: 'If you control 2 or more "Crystal Beast" cards in your Spell & Trap Zone: Your opponent chooses 1 "Crystal Beast" card in your Spell & Trap Zone, you send it to the GY, and if you do, you draw 2 cards.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (cbInSTZone(g, ctx.player).length < 2) return 'You need 2 or more Crystal Beast cards in your Spell & Trap Zone.';
        if (g.player(ctx.player).deck.length < 2) return 'You need at least 2 cards in your Deck.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbInSTZone(g, ctx.player).map((c) => c.uid);
        if (pool.length === 0) return;
        const opp = g.opponent(ctx.player);
        const [u] = yield* g.selectCards(opp, `Choose 1 of ${g.playerName(ctx.player)}'s Crystal Beast cards to send to the Graveyard (Rare Value)`, pool, 1, 1);
        g.log(`${g.playerName(opp)} chooses ${g.name(u)}, which is sent to the Graveyard.`, 'effect');
        g.sendToGraveyard(u, 'sent', card.uid);
        g.draw(ctx.player, 2, 'draws');
      },
    },
  ],
});

registerScript({
  name: 'Rainbow Refraction',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon any number of Crystal Beasts with different names from your Deck',
      description: 'If a monster(s) you control whose original name is "Rainbow Dragon" or "Rainbow Dark Dragon" activated its effect this turn: Special Summon any number of "Crystal Beast" monsters with different names from your Deck.',
      kind: 'activate',
      spellSpeed: 2,
      from: SPELL_FROM,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => {
        if (!g.player(ctx.player).turnFlags['rainbowEffectActivated']) return 'Rainbow Dragon or Rainbow Dark Dragon must have activated its effect this turn.';
        if (cbInDeck(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Deck.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbInDeck(g, ctx.player);
        const max = Math.min(pool.length, g.freeMonsterZones(ctx.player).length);
        if (max === 0) return;
        const chosen = yield* g.selectCards(ctx.player, 'Special Summon any number of Crystal Beast monsters with different names from your Deck', pool, 1, max, 'Each chosen monster must have a different name.');
        if (new Set(chosen.map((u) => g.name(u))).size !== chosen.length) throw new Error('The chosen Crystal Beasts must have different names.');
        for (const u of chosen) yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Rainbow Refraction' });
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

registerScript({
  name: 'The Melody of Awakening Dragon',
  effects: [
    {
      id: 'activate',
      label: 'Discard 1 card; add up to 2 Dragons with 3000+ ATK and 2500 or less DEF from your Deck',
      description: 'Discard 1 card; add up to 2 Dragon monsters with 3000 or more ATK and 2500 or less DEF from your Deck to your hand.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => {
        if (g.player(ctx.player).hand.filter((u) => u !== card.uid).length === 0) return 'You need another card in your hand to discard as the cost.';
        if (melodyTargets(g, ctx.player).length === 0) return 'There is no Dragon with 3000 or more ATK and 2500 or less DEF in your Deck.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = g.player(ctx.player).hand.filter((u) => u !== card.uid);
        const [u] = yield* g.selectCards(ctx.player, 'Discard 1 card (cost)', pool, 1, 1);
        g.log(`${g.playerName(ctx.player)} discards ${g.name(u)} as the cost.`, 'effect');
        g.sendToGraveyard(u, 'discard', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = melodyTargets(g, ctx.player);
        if (pool.length === 0) return;
        const chosen = yield* g.selectCards(ctx.player, 'Add up to 2 Dragon monsters (ATK 3000+, DEF 2500 or less) from your Deck to your hand', pool, 1, Math.min(2, pool.length));
        for (const u of chosen) {
          g.log(`${g.name(u)} is added from the Deck to the hand.`, 'effect');
          g.toHand(u);
        }
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});
function melodyTargets(g: Game, player: PlayerId): string[] {
  return deckCards(g, player, (d) => d.cardType === 'Monster' && d.race === 'Dragon' && (d.atk ?? 0) >= 3000 && (d.def ?? 0) <= 2500);
}

registerScript({
  name: 'Foolish Burial Goods',
  effects: [
    {
      id: 'activate',
      label: 'Send 1 Spell/Trap from your Deck to the GY',
      description: 'Send 1 Spell/Trap from your Deck to the GY. You can only activate 1 "Foolish Burial Goods" per turn.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      hardOncePerTurn: true,
      tags: ['sendFromDeck'],
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.cardType !== 'Monster').length === 0 ? 'There is no Spell or Trap Card in your Deck.' : null),
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.cardType !== 'Monster');
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Send 1 Spell/Trap from your Deck to the Graveyard', pool, 1, 1);
        g.log(`${g.name(u)} is sent from the Deck to the Graveyard.`, 'effect');
        g.sendToGraveyard(u, 'sent', card.uid);
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

registerScript({
  name: 'Cosmic Cyclone',
  effects: [
    {
      id: 'activate',
      label: 'Pay 1000 LP; banish 1 Spell/Trap on the field',
      description: 'Pay 1000 LP, then target 1 Spell/Trap on the field; banish it.',
      kind: 'activate',
      spellSpeed: 2,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (g.player(ctx.player).lp <= 1000) return 'You need more than 1000 LP to pay the cost.';
        if (spellTrapsOnField(g, card.uid, ctx.player).length === 0) return 'There is no other Spell or Trap Card on the field to target.';
        return null;
      },
      cost: function* (g, card, ctx) {
        g.payLP(ctx.player, 1000, 'Cosmic Cyclone');
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Spell/Trap Card on the field to banish', spellTrapsOnField(g, card.uid, ctx.player), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['spellTrap', 'field']);
        if (!t) return;
        g.log(`${g.name(t)} is banished.`, 'effect');
        g.banish(t);
      },
    },
  ],
});
function spellTrapsOnField(g: Game, self: string, player: PlayerId): string[] {
  const out: string[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    out.push(...g.spellTrapCards(p).map((c) => c.uid));
    const f = g.fieldSpell(p);
    if (f) out.push(f.uid);
  }
  return out.filter((u) => u !== self && !g.targetingProtection(g.card(u), player));
}

// ---------------------------------------------------------------------------
// Crystal Aegis
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crystal Aegis',
  effects: [
    {
      id: 'activate',
      label: 'Destroy 1 Crystal Beast monster you control; Special Summon a Crystal Beast Token with its stats',
      description: "Target 1 \"Crystal Beast\" Monster Card you control; destroy it, then Special Summon 1 \"Crystal Beast Token\" with the destroyed monster's original Type, Attribute, Level, and ATK/DEF.",
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => (cbMonstersOnField(g, ctx.player).filter((m) => m.faceUp && !g.targetingProtection(m, ctx.player)).length === 0 ? 'You control no face-up Crystal Beast monster to target.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Crystal Beast monster you control', cbMonstersOnField(g, ctx.player).filter((m) => m.faceUp).map((m) => m.uid), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) return;
        const d = def(g, t);
        const stats = { name: 'Crystal Beast Token', race: d.race ?? 'Beast', attribute: d.attribute ?? 'EARTH', level: d.level ?? 1, atk: d.atk ?? 0, def: d.def ?? 0 };
        const before = g.state.cards[t]?.zone;
        const destroyed = yield* g.destroyByEffect([t], card.uid);
        const wasDestroyed = destroyed.length > 0 || g.state.cards[t]?.zone !== before;
        if (!wasDestroyed) {
          g.log('The monster was not destroyed, so no Token is Summoned.', 'rule');
          return;
        }
        if (g.freeMonsterZones(ctx.player).length === 0) return;
        const token = g.createToken(ctx.player, stats);
        yield* g.specialSummon(token, ctx.player, { position: 'choose', how: 'by Crystal Aegis' });
      },
    },
    {
      id: 'gy',
      label: 'Banish Crystal Aegis from your GY; Special Summon 1 Crystal Beast Monster Card from your Spell & Trap Zone',
      description: 'If a "Crystal Beast" card(s) is placed in your Spell & Trap Zone while this card is in your GY, even during the Damage Step: You can banish this card; Special Summon 1 "Crystal Beast" Monster Card from your Spell & Trap Zone. Once per turn.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      trigger: (g, card, ev) => ev.type === 'placedInSpellTrapZone' && ev.player === card.owner,
      condition: (g, card, ctx) => {
        if (cbCandidates(g, ctx.player, ['spellTrap']).length === 0) return 'No Crystal Beast Monster Card in your Spell & Trap Zone.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Crystal Aegis is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = cbCandidates(g, ctx.player, ['spellTrap']);
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Crystal Beast Monster Card from your Spell & Trap Zone', pool, 1, 1);
        yield* summonFromST(g, u, ctx.player, 'by Crystal Aegis');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Crystal Tree (Continuous Spell)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crystal Tree',
  effects: [
    {
      id: 'activate',
      label: 'Activate (gains Crystal Counters when Crystal Beasts are placed)',
      description: 'Each time a "Crystal Beast" monster(s) is placed in either player\'s Spell & Trap Zone, place 1 Crystal Counter on this card. You can send this card to the GY; take a number of "Crystal Beast" monsters from your Deck equal to the number of Crystal Counters that were on this card, and place them face-up in your Spell & Trap Zone as Continuous Spells.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      resolve: function* () {},
    },
    {
      id: 'counter',
      label: 'Place a Crystal Counter',
      description: 'Each time a Crystal Beast monster is placed in either player\'s Spell & Trap Zone, Crystal Tree gets 1 Crystal Counter.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['spellTrap'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'placedInSpellTrapZone' && card.faceUp && isCBMonsterCard(g, ev.uid),
      resolve: function* (g, card) {
        if (card.zone === 'spellTrap' && card.faceUp) g.addCounter(card.uid, 'Crystal Counter', 1);
      },
    },
    {
      id: 'harvest',
      label: 'Send Crystal Tree to the GY; place Crystal Beasts from your Deck (one per Crystal Counter)',
      description: 'You can send this card to the GY; take a number of "Crystal Beast" monsters from your Deck equal to the number of Crystal Counters that were on this card, and place them face-up in your Spell & Trap Zone as Continuous Spells.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['spellTrap'],
      condition: (g, card) => {
        if (!card.faceUp) return 'Crystal Tree must be face-up.';
        if ((card.counters['Crystal Counter'] ?? 0) === 0) return 'Crystal Tree has no Crystal Counters yet.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['n'] = card.counters['Crystal Counter'] ?? 0;
        g.log(`Crystal Tree (with ${ctx.data['n']} Crystal Counter(s)) is sent to the Graveyard (cost).`, 'effect');
        g.sendToGraveyard(card.uid, 'cost', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const n = Math.min(ctx.data['n'] as number, cbInDeck(g, ctx.player).length, g.freeSpellTrapZones(ctx.player).length);
        if (n === 0) {
          g.log('No Crystal Beast can be placed.', 'rule');
          return;
        }
        const chosen = yield* g.selectCards(ctx.player, `Place ${n} Crystal Beast monster${n > 1 ? 's' : ''} from your Deck face-up in your Spell & Trap Zone`, cbInDeck(g, ctx.player), n, n);
        for (const u of chosen) yield* placeCB(g, u, ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Crystal Release (Equip Spell)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crystal Release',
  effects: [
    {
      id: 'activate',
      label: 'Equip to a Crystal Beast monster: +800 ATK',
      description: 'Equip only to a "Crystal Beast" monster. It gains 800 ATK. When this card is sent from the field to the GY: You can place 1 "Crystal Beast" monster from your Deck face-up in your Spell & Trap Zone as a Continuous Spell.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => (cbMonstersOnField(g, ctx.player).filter((m) => m.faceUp && !g.targetingProtection(m, ctx.player)).length === 0 ? 'You control no face-up Crystal Beast monster to equip.' : null),
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Equip Crystal Release to 1 Crystal Beast monster you control', cbMonstersOnField(g, ctx.player).filter((m) => m.faceUp).map((m) => m.uid), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t || !g.card(t).faceUp) {
          g.log('The target is gone, so Crystal Release is sent to the Graveyard.', 'rule');
          if (card.zone === 'spellTrap') g.sendToGraveyard(card.uid, 'resolved');
          return;
        }
        card.equippedTo = t;
        g.log(`Crystal Release is equipped to ${g.name(t)}, which gains 800 ATK.`, 'effect');
      },
    },
    {
      id: 'place',
      label: 'Place 1 Crystal Beast from your Deck in your Spell & Trap Zone',
      description: 'When this card is sent from the field to the GY: You can place 1 "Crystal Beast" monster from your Deck face-up in your Spell & Trap Zone as a Continuous Spell.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      whenYouCan: true,
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && (ev.from === 'spellTrap' || ev.from === 'field'),
      condition: (g, card, ctx) => {
        if (cbInDeck(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Deck.';
        if (g.freeSpellTrapZones(ctx.player).length === 0) return 'No free Spell & Trap Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbInDeck(g, ctx.player);
        if (pool.length === 0 || g.freeSpellTrapZones(ctx.player).length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Place 1 Crystal Beast monster from your Deck face-up in your Spell & Trap Zone', pool, 1, 1);
        yield* placeCB(g, u, ctx.player);
      },
    },
  ],
  modifyStats: (g, self, target) => (self.zone === 'spellTrap' && self.faceUp && self.equippedTo === target.uid ? { atk: 800 } : null),
});

// ---------------------------------------------------------------------------
// Rainbow Bridge of the Heart (Continuous Spell)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Rainbow Bridge of the Heart',
  effects: [
    {
      id: 'activate',
      label: 'Activate (extra Normal Summon of a Crystal Beast each turn)',
      description: 'During your Main Phase, you can Normal Summon 1 "Crystal Beast" monster, in addition to your Normal Summon/Set (once per turn). Once per turn: destroy 1 Crystal Beast card you control or in your hand to add a "Crystal" Spell/Trap from your Deck. Once per turn, when a Crystal Beast is placed in your Spell & Trap Zone: return 1 card your opponent controls and this card to the hand.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      resolve: function* () {},
    },
    {
      id: 'search',
      label: 'Destroy 1 Crystal Beast card you control or in your hand; add 1 "Crystal" Spell/Trap from your Deck',
      description: 'During your Main Phase: You can destroy 1 "Crystal Beast" card you control or in your hand, and if you do, add 1 "Crystal" Spell/Trap from your Deck to your hand. Once per turn.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['spellTrap'],
      oncePerTurn: true,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Rainbow Bridge of the Heart must be face-up.';
        if (bridgeDestroyPool(g, ctx.player).length === 0) return 'You have no Crystal Beast card on your field or in your hand to destroy.';
        if (g.player(ctx.player).deck.filter((u) => isCrystalSpellTrap(g, u)).length === 0) return 'There is no "Crystal" Spell or Trap Card in your Deck.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = bridgeDestroyPool(g, ctx.player);
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Destroy 1 Crystal Beast card you control or in your hand', pool, 1, 1, 'Cards shown come from your field (Monster Zone and Spell & Trap Zone) and your hand.');
        let destroyed = false;
        if (g.card(u).zone === 'hand') {
          g.log(`${g.name(u)} is destroyed (from the hand) and sent to the Graveyard.`, 'effect');
          g.emit({ type: 'destroyed', uid: u, reason: 'effect', source: card.uid });
          g.sendToGraveyard(u, 'destroyedEffect', card.uid);
          destroyed = true;
        } else {
          const before = g.card(u).zone;
          const res = yield* g.destroyByEffect([u], card.uid);
          destroyed = res.length > 0 || g.state.cards[u]?.zone !== before;
        }
        if (!destroyed) return;
        const st = g.player(ctx.player).deck.filter((x) => isCrystalSpellTrap(g, x));
        if (st.length === 0) return;
        const [s] = yield* g.selectCards(ctx.player, 'Add 1 "Crystal" Spell/Trap from your Deck to your hand', st, 1, 1);
        g.log(`${g.name(s)} is added from the Deck to the hand.`, 'effect');
        g.toHand(s);
        g.shuffleDeck(ctx.player);
      },
    },
    {
      id: 'bounce',
      label: "Return 1 card your opponent controls and Rainbow Bridge of the Heart to the hand",
      description: 'If a "Crystal Beast" card(s) is placed in your Spell & Trap Zone, even during the Damage Step: You can target 1 card your opponent controls; return both that card and this card to the hand. Once per turn.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['spellTrap'],
      oncePerTurn: true,
      trigger: (g, card, ev) => ev.type === 'placedInSpellTrapZone' && ev.player === card.controller && card.faceUp,
      condition: (g, card, ctx) => (oppCards(g, ctx.player).length === 0 ? 'Your opponent controls no card to target.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 card your opponent controls', oppCards(g, ctx.player), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster', 'spellTrap', 'field']);
        if (!t) return;
        g.log(`${g.name(t)} and Rainbow Bridge of the Heart are returned to the hand.`, 'effect');
        g.toHand(t);
        if (g.isOnField(card)) g.toHand(card.uid);
      },
    },
  ],
  extraNormalSummon: (g, self, card) => (self.zone === 'spellTrap' && self.faceUp && g.state.turnPlayer === self.controller && isCBMonsterCard(g, card.uid) ? null : 'Only a Crystal Beast monster can use the extra Normal Summon of Rainbow Bridge of the Heart.'),
});
function bridgeDestroyPool(g: Game, player: PlayerId): string[] {
  return [...cbMonstersOnField(g, player).map((m) => m.uid), ...cbInSTZone(g, player).map((c) => c.uid), ...handCards(g, player).filter((u) => isCB(g, u))];
}
function oppCards(g: Game, player: PlayerId): string[] {
  const opp = g.opponent(player);
  return [...g.fieldMonsters(opp).map((m) => m.uid), ...g.spellTrapCards(opp).map((c) => c.uid), ...(g.fieldSpell(opp) ? [g.fieldSpell(opp)!.uid] : [])].filter((u) => !g.targetingProtection(g.card(u), player));
}

// ---------------------------------------------------------------------------
// Awakening of the Crystal Ultimates (Quick-Play)
// ---------------------------------------------------------------------------
function rainbowCards(g: Game, player: PlayerId): string[] {
  return g.player(player).deck.filter((u) => ['Rainbow Bridge', 'Rainbow Bridge of the Heart', 'Rainbow Refraction'].includes(g.name(u)));
}

registerScript({
  name: 'Awakening of the Crystal Ultimates',
  effects: [
    {
      id: 'activate',
      label: 'Reveal an Ultimate Crystal monster: search a Rainbow Bridge card and/or Special Summon a Crystal Beast',
      description: 'Reveal 1 "Ultimate Crystal" monster in your hand, then activate 1 of these effects. If you control an "Ultimate Crystal" monster, you can activate 1 or 2 of these effects in sequence instead (and do not have to reveal a monster). ● Take 1 "Rainbow Bridge" card or 1 "Rainbow Refraction" from your Deck, and either add it to your hand or send it to the GY. ● Special Summon 1 "Crystal Beast" Monster Card from your hand, Deck, GY, or Spell & Trap Zone.',
      kind: 'activate',
      spellSpeed: 2,
      from: SPELL_FROM,
      hardOncePerTurn: true,
      tags: ['searchDeck', 'sendFromDeck', 'summonFromDeck'],
      condition: (g, card, ctx) => {
        const controlUlt = g.fieldMonsters(ctx.player).some((m) => m.faceUp && isUltimateCrystal(g, m.uid));
        const handUlt = g.player(ctx.player).hand.some((u) => u !== card.uid && isUltimateCrystal(g, u));
        if (!controlUlt && !handUlt) return 'You need an "Ultimate Crystal" monster in your hand to reveal (or one you control).';
        return null;
      },
      cost: function* (g, card, ctx) {
        const controlUlt = g.fieldMonsters(ctx.player).some((m) => m.faceUp && isUltimateCrystal(g, m.uid));
        const options = [
          { id: 'search', label: 'Take a Rainbow Bridge card or Rainbow Refraction from your Deck (to hand or GY)' },
          { id: 'summon', label: 'Special Summon 1 Crystal Beast Monster Card from your hand, Deck, GY or Spell & Trap Zone' },
        ];
        if (controlUlt) {
          g.log(`${g.playerName(ctx.player)} controls an Ultimate Crystal monster, so no reveal is needed and both effects may be used.`, 'rule');
          const first = yield* g.selectOption(ctx.player, 'Awakening of the Crystal Ultimates: first effect', options);
          const second = yield* g.selectOption(ctx.player, 'Use the other effect as well?', [
            { id: first === 'search' ? 'summon' : 'search', label: first === 'search' ? options[1].label : options[0].label },
            { id: 'none', label: 'No, only the first effect' },
          ]);
          ctx.data['modes'] = second === 'none' ? [first] : [first, second];
        } else {
          const ults = g.player(ctx.player).hand.filter((u) => u !== card.uid && isUltimateCrystal(g, u));
          const [rev] = yield* g.selectCards(ctx.player, 'Reveal 1 Ultimate Crystal monster in your hand', ults, 1, 1);
          g.log(`${g.playerName(ctx.player)} reveals ${g.name(rev)}.`, 'effect');
          const mode = yield* g.selectOption(ctx.player, 'Awakening of the Crystal Ultimates: choose an effect', options);
          ctx.data['modes'] = [mode];
        }
      },
      resolve: function* (g, card, ctx) {
        for (const mode of ctx.data['modes'] as string[]) {
          if (mode === 'search') {
            const pool = rainbowCards(g, ctx.player);
            if (pool.length === 0) {
              g.log('There is no Rainbow Bridge card or Rainbow Refraction in the Deck.', 'rule');
              continue;
            }
            const [u] = yield* g.selectCards(ctx.player, 'Take 1 Rainbow Bridge card or Rainbow Refraction from your Deck', pool, 1, 1);
            const where = yield* g.selectOption(ctx.player, `${g.name(u)}: add it to your hand or send it to the Graveyard?`, [
              { id: 'hand', label: 'Add to hand' },
              { id: 'gy', label: 'Send to the Graveyard' },
            ]);
            if (where === 'hand') {
              g.log(`${g.name(u)} is added from the Deck to the hand.`, 'effect');
              g.toHand(u);
            } else {
              g.log(`${g.name(u)} is sent from the Deck to the Graveyard.`, 'effect');
              g.sendToGraveyard(u, 'sent', card.uid);
            }
            g.shuffleDeck(ctx.player);
          } else {
            const pool = cbCandidates(g, ctx.player, ['hand', 'deck', 'graveyard', 'spellTrap']);
            if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) {
              g.log('No Crystal Beast Monster Card can be Special Summoned.', 'rule');
              continue;
            }
            const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Crystal Beast Monster Card', pool, 1, 1, 'Cards shown come from your hand, Deck, Graveyard and Spell & Trap Zone.');
            const fromDeck = g.card(u).zone === 'deck';
            yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Awakening of the Crystal Ultimates' });
            if (fromDeck) g.shuffleDeck(ctx.player);
          }
        }
      },
    },
  ],
});
