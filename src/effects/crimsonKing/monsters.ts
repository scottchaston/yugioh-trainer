/**
 * The Crimson King (SDCK): Main Deck monsters.
 */
import { registerScript, registerScheduledHandler } from '../../engine/scripts';
import type { Game } from '../../engine/game';
import type { CardInstance, PlayerId } from '../../engine/types';
import { def, deckCards, graveyardCards, handCards, validTargets } from '../helpers';
import { addToHand, discardCards, isNormalTrap, searchAndAdd, summonCard, targetableMonstersOf } from '../shared';
import { RDA, controlsRDA, isFiendTuner, isRDA, isResonator, isTuner } from './common';

const summonedSelf = (method?: 'normal' | 'special') => (g: Game, card: CardInstance, ev: { type: string; uid?: string; method?: string }) =>
  ev.type === 'summon' && ev.uid === card.uid && (!method || ev.method === method);

/** "You can Special Summon this card (from your hand)" style procedure. */
function handSummon(id: string, label: string, description: string, condition: (g: Game, card: CardInstance, player: PlayerId) => string | null, after?: (g: Game, card: CardInstance, player: PlayerId) => void, oncePerTurnName?: string) {
  return {
    id,
    label,
    description,
    from: ['hand' as const],
    condition: (g: Game, card: CardInstance, player: PlayerId) => {
      if (oncePerTurnName && g.player(player).turnFlags[`handSummon:${oncePerTurnName}`]) return `You already Special Summoned "${oncePerTurnName}" this way this turn.`;
      return condition(g, card, player);
    },
    perform: function* (g: Game, card: CardInstance, player: PlayerId) {
      const ok = yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'by its own condition' });
      if (ok) {
        if (oncePerTurnName) g.player(player).turnFlags[`handSummon:${oncePerTurnName}`] = true;
        after?.(g, card, player);
      }
      return ok;
    },
  };
}

// ---------------------------------------------------------------------------
// Resonators
// ---------------------------------------------------------------------------
registerScript({
  name: 'Soul Resonator',
  replaceDestructionFromGraveyard: function* (g, self, target, reason) {
    if (reason !== 'effect' || target.controller !== self.owner || !controlsRDA(g, self.owner)) return false;
    if (g.effectUses(self.owner, g.effectUseKey(self.uid, 'protect', true)) > 0) return false;
    const yes = yield* g.confirm(self.owner, `Banish Soul Resonator from your GY instead of ${g.name(target.uid)} being destroyed?`);
    if (!yes) return false;
    g.recordEffectUse(self.owner, g.effectUseKey(self.uid, 'protect', true));
    g.log(`Soul Resonator is banished from the Graveyard instead; ${g.name(target.uid)} is not destroyed.`, 'effect');
    g.banish(self.uid);
    return true;
  },
  effects: [
    {
      id: 'search',
      label: 'Add 1 Level 4 or lower Fiend monster from your Deck to your hand (only DARK Synchros from the Extra Deck this turn)',
      description: 'If this card is Normal or Special Summoned: You can add 1 Level 4 or lower Fiend monster from your Deck to your hand, except "Soul Resonator", also you cannot Special Summon monsters from the Extra Deck for the rest of this turn, except DARK Synchro Monsters.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['searchDeck'],
      trigger: summonedSelf(),
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.race === 'Fiend' && (d.level ?? 0) <= 4 && d.name !== 'Soul Resonator').length ? null : 'There is no other Level 4 or lower Fiend monster in your Deck.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add 1 Level 4 or lower Fiend monster to your hand', deckCards(g, ctx.player, (d) => d.race === 'Fiend' && (d.level ?? 0) <= 4 && d.name !== 'Soul Resonator'), 'Soul Resonator');
        g.restrictExtraDeck(ctx.player, 'darkSynchro');
        g.log(`${g.playerName(ctx.player)} can only Special Summon DARK Synchro Monsters from the Extra Deck for the rest of this turn.`, 'rule');
      },
    },
  ],
});

registerScript({
  name: 'Vision Resonator',
  specialSummon: [handSummon('vision', 'Special Summon this card (a Level 5 or higher DARK monster is on the field)', 'If a Level 5 or higher DARK monster is on the field, you can Special Summon this card (from your hand). Once per turn.', (g) => ([0, 1] as PlayerId[]).some((p) => g.fieldMonsters(p).some((m) => m.faceUp && g.levelOf(m.uid) >= 5 && g.attributeOf(m.uid) === 'DARK')) ? null : 'There is no Level 5 or higher DARK monster on the field.', undefined, 'Vision Resonator')],
  effects: [
    {
      id: 'search',
      label: 'Add 1 Spell/Trap that mentions "Red Dragon Archfiend" from your Deck to your hand',
      description: 'If this card is sent to the GY: You can add 1 Spell/Trap that mentions "Red Dragon Archfiend" from your Deck to your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      tags: ['searchDeck'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid,
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d, c) => d.cardType !== 'Monster' && g.mentions(c.uid, RDA)).length ? null : 'There is no Spell/Trap that mentions "Red Dragon Archfiend" in your Deck.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add 1 Spell/Trap that mentions "Red Dragon Archfiend"', deckCards(g, ctx.player, (d, c) => d.cardType !== 'Monster' && g.mentions(c.uid, RDA)), 'Vision Resonator');
      },
    },
  ],
});

registerScript({
  name: 'Bone Archfiend',
  effects: [
    {
      id: 'summon',
      label: 'Send 1 other card from your hand or field to the GY; Special Summon this card',
      description: 'If this card is in your hand or GY: You can send 1 other card from your hand or field to the GY; Special Summon this card, also you cannot Special Summon monsters from the Extra Deck for the rest of this turn, except DARK Dragon Synchro Monsters.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['hand', 'graveyard'],
      hardOncePerTurn: true,
      tags: ['summonFromGY'],
      condition: (g, card, ctx) => {
        const pool = boneCostPool(g, card, ctx.player);
        if (pool.length === 0) return 'You need another card in your hand or on your field to send to the Graveyard.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const [u] = yield* g.selectCards(ctx.player, 'Send 1 other card from your hand or field to the Graveyard (cost)', boneCostPool(g, card, ctx.player), 1, 1);
        g.log(`${g.name(u)} is sent to the Graveyard (cost).`, 'effect');
        g.sendToGraveyard(u, 'cost', card.uid);
      },
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand' && card.zone !== 'graveyard') return;
        yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
        g.restrictExtraDeck(ctx.player, 'darkDragonSynchro');
      },
    },
    {
      id: 'level',
      label: "Send 1 Fiend Tuner from your hand or Deck to the GY; raise or lower a monster's Level by 1",
      description: "You can target 1 face-up monster you control that has a Level; send 1 Fiend Tuner from your hand or Deck to the GY, and if you do, increase or decrease that monster's Level by 1.",
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['sendFromDeck'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Bone Archfiend must be face-up.';
        if (!g.fieldMonsters(ctx.player).some((m) => m.faceUp && g.levelOf(m.uid) > 0)) return 'You control no face-up monster with a Level.';
        if ([...handCards(g, ctx.player), ...g.player(ctx.player).deck].filter((u) => isFiendTuner(g, u)).length === 0) return 'There is no Fiend Tuner in your hand or Deck.';
        return null;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 face-up monster you control that has a Level', g.fieldMonsters(ctx.player).filter((m) => m.faceUp && g.levelOf(m.uid) > 0).map((m) => m.uid), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) return;
        const pool = [...handCards(g, ctx.player), ...g.player(ctx.player).deck].filter((u) => isFiendTuner(g, u));
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Send 1 Fiend Tuner from your hand or Deck to the Graveyard', pool, 1, 1);
        const fromDeck = g.card(u).zone === 'deck';
        g.log(`${g.name(u)} is sent to the Graveyard.`, 'effect');
        g.sendToGraveyard(u, 'sent', card.uid);
        if (fromDeck) g.shuffleDeck(ctx.player);
        const dir = yield* g.selectOption(ctx.player, `${g.name(t)}: increase or decrease its Level by 1?`, [{ id: 'up', label: `Increase (Level ${g.levelOf(t) + 1})` }, { id: 'down', label: `Decrease (Level ${Math.max(1, g.levelOf(t) - 1)})` }]);
        const tc = g.card(t);
        tc.flags['levelMod'] = ((tc.flags['levelMod'] as number | undefined) ?? 0) + (dir === 'up' ? 1 : -1);
        g.log(`${g.name(t)}'s Level is now ${g.levelOf(t)}.`, 'effect');
      },
    },
  ],
});
function boneCostPool(g: Game, card: CardInstance, player: PlayerId): string[] {
  const field = [...g.fieldMonsters(player), ...g.spellTrapCards(player), ...(g.fieldSpell(player) ? [g.fieldSpell(player)!] : [])].map((c) => c.uid);
  return [...g.player(player).hand, ...field].filter((u) => u !== card.uid && g.canBeSentToGraveyard(u));
}

registerScript({
  name: 'Dark Resonator',
  onWouldBeDestroyedInMonsterZone: function* (g, self, reason) {
    if (reason !== 'battle' || self.flags['darkResonatorSavedTurn'] === g.state.turn) return false;
    self.flags['darkResonatorSavedTurn'] = g.state.turn;
    g.log('Dark Resonator is not destroyed by battle (the first time each turn).', 'rule');
    return true;
  },
  effects: [],
});

registerScript({
  name: 'Creation Resonator',
  specialSummon: [handSummon('creation', 'Special Summon this card (you control a Level 8 or higher Synchro Monster)', 'If you control a Level 8 or higher Synchro Monster, you can Special Summon this card (from your hand).', (g, card, player) => (g.fieldMonsters(player).some((m) => m.faceUp && g.isSynchroMonster(m.uid) && g.levelOf(m.uid) >= 8) ? null : 'You do not control a Level 8 or higher Synchro Monster.'))],
  effects: [],
});

registerScript({
  name: 'Synkron Resonator',
  specialSummon: [handSummon('synkron', 'Special Summon this card (a Synchro Monster is on the field)', 'If a Synchro Monster is on the field, you can Special Summon this card (from your hand). Once per turn.', (g) => (([0, 1] as PlayerId[]).some((p) => g.fieldMonsters(p).some((m) => m.faceUp && g.isSynchroMonster(m.uid))) ? null : 'There is no Synchro Monster on the field.'), undefined, 'Synkron Resonator')],
  effects: [
    {
      id: 'recover',
      label: 'Add 1 other "Resonator" monster from your GY to your hand',
      description: 'If this card is sent from the field to the GY: You can target 1 "Resonator" monster in your GY, except "Synkron Resonator"; add it to your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      tags: ['addFromGY'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && (ev.from === 'monster' || ev.from === 'extraMonster'),
      condition: (g, card, ctx) => (graveyardCards(g, ctx.player).filter((u) => isResonator(g, u) && g.name(u) !== 'Synkron Resonator').length ? null : 'There is no other "Resonator" monster in your Graveyard.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 other "Resonator" monster in your Graveyard', graveyardCards(g, ctx.player).filter((u) => isResonator(g, u) && g.name(u) !== 'Synkron Resonator'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) addToHand(g, t, 'Synkron Resonator');
      },
    },
  ],
});

registerScript({
  name: 'Red Resonator',
  effects: [
    {
      id: 'summon',
      label: 'Special Summon 1 Level 4 or lower monster from your hand',
      description: 'When this card is Normal Summoned: You can Special Summon 1 Level 4 or lower monster from your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      trigger: summonedSelf('normal'),
      condition: (g, card, ctx) => (handCards(g, ctx.player, (d) => d.cardType === 'Monster' && (d.level ?? 0) <= 4).length === 0 ? 'There is no Level 4 or lower monster in your hand.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      resolve: function* (g, card, ctx) {
        const pool = handCards(g, ctx.player, (d) => d.cardType === 'Monster' && (d.level ?? 0) <= 4);
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Level 4 or lower monster from your hand', pool, 1, 1);
        yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Red Resonator' });
      },
    },
    {
      id: 'gain',
      label: "Gain LP equal to a face-up monster's ATK",
      description: 'When this card is Special Summoned: You can target 1 face-up monster on the field; gain LP equal to its ATK.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      hardOncePerTurn: true,
      trigger: summonedSelf('special'),
      condition: (g, card, ctx) => (targetableMonstersOf(g, ctx.player, 'any', card.uid, (c) => c.faceUp).length ? null : 'There is no face-up monster to target.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 face-up monster on the field', targetableMonstersOf(g, ctx.player, 'any', card.uid, (c) => c.faceUp), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (t && g.card(t).faceUp) g.changeLP(ctx.player, g.stats(t).atk, 'Red Resonator');
      },
    },
  ],
});

registerScript({
  name: 'Crimson Resonator',
  specialSummon: [
    handSummon('crimson', 'Special Summon this card (you control no monsters)', 'If you control no monsters: You can Special Summon this card from your hand. (This turn you can only Special Summon DARK Dragon Synchro Monsters from the Extra Deck.)', (g, card, player) => (g.fieldMonsters(player).length === 0 ? null : 'You must control no monsters.'), (g, card, player) => g.restrictExtraDeck(player, 'darkDragonSynchro'), 'Crimson Resonator'),
  ],
  effects: [
    {
      id: 'call',
      label: 'Special Summon up to 2 "Resonator" monsters from your hand or Deck (only a DARK Dragon Synchro beside this card)',
      description: 'If the only other monster you control is exactly 1 DARK Dragon Synchro Monster: You can Special Summon up to 2 "Resonator" monsters from your hand or Deck, except "Crimson Resonator". You cannot Special Summon monsters from the Extra Deck, except DARK Dragon Synchro Monsters, the turn you activate this effect.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => {
        const others = g.fieldMonsters(ctx.player).filter((m) => m.uid !== card.uid);
        if (others.length !== 1 || !others[0].faceUp || !(g.isSynchroMonster(others[0].uid) && g.attributeOf(others[0].uid) === 'DARK' && g.raceOf(others[0].uid) === 'Dragon')) return 'The only other monster you control must be exactly 1 DARK Dragon Synchro Monster.';
        if (crimsonPool(g, ctx.player).length === 0) return 'There is no other "Resonator" monster in your hand or Deck.';
        return null;
      },
      cost: function* (g, card, ctx) {
        g.restrictExtraDeck(ctx.player, 'darkDragonSynchro');
      },
      resolve: function* (g, card, ctx) {
        const pool = crimsonPool(g, ctx.player);
        const n = Math.min(2, pool.length, g.freeMonsterZones(ctx.player).length);
        if (n === 0) return;
        const chosen = yield* g.selectCards(ctx.player, `Special Summon up to ${n} "Resonator" monsters from your hand or Deck`, pool, 1, n);
        for (const u of chosen) yield* summonCard(g, u, ctx.player, 'by Crimson Resonator');
      },
    },
  ],
});
function crimsonPool(g: Game, player: PlayerId): string[] {
  return [...g.player(player).hand, ...g.player(player).deck].filter((u) => isResonator(g, u) && g.name(u) !== 'Crimson Resonator');
}

// ---------------------------------------------------------------------------
// Other Main Deck monsters
// ---------------------------------------------------------------------------
registerScript({
  name: 'Vice Dragon',
  specialSummon: [
    {
      id: 'vice',
      label: 'Special Summon this card with halved ATK/DEF (only your opponent controls a monster)',
      description: 'If only your opponent controls a monster, you can Special Summon this card (from your hand), but its original ATK/DEF become halved.',
      from: ['hand'],
      condition: (g, card, player) => (g.fieldMonsters(player).length === 0 && g.fieldMonsters(g.opponent(player)).length > 0 ? null : 'Only your opponent may control a monster.'),
      perform: function* (g, card, player) {
        const ok = yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'by its own condition' });
        if (ok) {
          g.addStatMod(card.uid, -1000, -1200, 'permanent', 'Vice Dragon (halved)');
          g.log(`Vice Dragon's ATK/DEF are halved (${g.stats(card.uid).atk}/${g.stats(card.uid).def}).`, 'effect');
        }
        return ok;
      },
    },
  ],
  effects: [],
});

registerScript({
  name: 'Battle Fader',
  effects: [
    {
      id: 'fade',
      label: 'Special Summon this card from your hand, then end the Battle Phase',
      description: "When an opponent's monster declares a direct attack: You can Special Summon this card from your hand, then end the Battle Phase. If Summoned this way, banish it when it leaves the field.",
      kind: 'quick',
      spellSpeed: 2,
      from: ['hand'],
      hidden: true,
      condition: (g, card, ctx) => {
        const b = g.state.battle;
        if (!b || !b.attacker || b.target !== null || b.damageStepStage || g.card(b.attacker).controller === ctx.player) return "This effect responds to an opponent's monster declaring a direct attack.";
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand') return;
        const ok = yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
        if (!ok) return;
        card.flags['banishWhenLeavesField'] = true;
        if (g.state.battle?.attacker) {
          g.state.battle.attackNegated = true;
          g.player(g.state.turnPlayer).turnFlags['endBattlePhaseNow'] = true;
          g.log('The attack stops and the Battle Phase will end (Battle Fader).', 'effect');
        }
      },
    },
  ],
});

registerScript({
  name: 'Red Sprinter',
  effects: [
    {
      id: 'call',
      label: 'Special Summon 1 Level 3 or lower Fiend Tuner from your hand or GY',
      description: 'When this card is Normal or Special Summoned while you control no other monsters: You can Special Summon 1 Level 3 or lower Fiend Tuner from your hand or GY.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      hardOncePerTurn: true,
      tags: ['summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'summon' && ev.uid === card.uid && g.fieldMonsters(card.controller).every((m) => m.uid === card.uid),
      condition: (g, card, ctx) => (sprinterPool(g, ctx.player).length === 0 ? 'There is no Level 3 or lower Fiend Tuner in your hand or Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      resolve: function* (g, card, ctx) {
        const pool = sprinterPool(g, ctx.player);
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Level 3 or lower Fiend Tuner', pool, 1, 1);
        yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Red Sprinter' });
      },
    },
  ],
});
function sprinterPool(g: Game, player: PlayerId): string[] {
  return [...g.player(player).hand, ...g.player(player).graveyard].filter((u) => isFiendTuner(g, u) && (def(g, u).level ?? 0) <= 3);
}

registerScript({
  name: 'Red Warg',
  effects: [
    {
      id: 'summon',
      label: 'Special Summon this card from your hand with halved ATK (you Normal Summoned a Resonator)',
      description: 'When you Normal Summon a "Resonator" monster: You can Special Summon this card from your hand, but its ATK becomes halved.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['hand'],
      whenYouCan: true,
      trigger: (g, card, ev) => ev.type === 'summon' && ev.method === 'normal' && ev.player === card.owner && isResonator(g, ev.uid),
      condition: (g, card, ctx) => (g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand') return;
        const ok = yield* g.specialSummon(card.uid, ctx.player, { position: 'choose', how: 'by its own effect' });
        if (ok) g.addStatMod(card.uid, -700, 0, 'permanent', 'Red Warg (halved ATK)');
      },
    },
  ],
});

registerScript({
  name: 'Wandering King Wildwind',
  specialSummon: [handSummon('wildwind', 'Special Summon this card (you control a Fiend Tuner with 1500 or less ATK)', 'If you control a Fiend Tuner with 1500 or less ATK, you can Special Summon this card (from your hand). If Summoned this way, you can only Special Summon Synchro Monsters from the Extra Deck this turn.', (g, card, player) => (g.fieldMonsters(player).some((m) => m.faceUp && isFiendTuner(g, m.uid) && g.stats(m.uid).atk <= 1500) ? null : 'You do not control a Fiend Tuner with 1500 or less ATK.'), (g, card, player) => g.restrictExtraDeck(player, 'synchro'))],
  effects: [
    {
      id: 'search',
      label: 'Banish this card from your GY; add 1 Fiend Tuner with 1500 or less ATK from your Deck',
      description: 'During your Main Phase, except the turn this card was sent to the GY: You can banish this card from your GY; add 1 Fiend Tuner with 1500 or less ATK from your Deck to your hand.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['graveyard'],
      tags: ['searchDeck', 'banishFromGY'],
      condition: (g, card, ctx) => {
        if (card.flags['sentToGYTurn'] === g.state.turn) return 'This effect cannot be used during the turn Wildwind was sent to the Graveyard.';
        if (deckCards(g, ctx.player, (d) => d.race === 'Fiend' && !!d.monsterTypes?.includes('Tuner') && (d.atk ?? 0) <= 1500).length === 0) return 'There is no Fiend Tuner with 1500 or less ATK in your Deck.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Wandering King Wildwind is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add 1 Fiend Tuner with 1500 or less ATK', deckCards(g, ctx.player, (d) => d.race === 'Fiend' && !!d.monsterTypes?.includes('Tuner') && (d.atk ?? 0) <= 1500), 'Wandering King Wildwind');
      },
    },
  ],
});

registerScript({ name: 'Phantom King Hydride', synchroAsNonTuner: true, effects: [] });

registerScript({
  name: 'Magical King Moonstar',
  synchroMaterialRestriction: (g, self, synchroUid) => (g.attributeOf(synchroUid) === 'DARK' ? null : 'Magical King Moonstar can only be used for the Synchro Summon of a DARK Synchro Monster.'),
  specialSummon: [handSummon('moonstar', 'Special Summon this card (you control a Tuner)', 'If you control a Tuner, you can Special Summon this card (from your hand).', (g, card, player) => (g.fieldMonsters(player).some((m) => m.faceUp && isTuner(g, m.uid)) ? null : 'You do not control a Tuner.'))],
  effects: [
    {
      id: 'copyLevel',
      label: "Make this card's Level the same as another monster's until the end of the turn",
      description: "If this card is Normal or Special Summoned: You can target 1 other face-up monster you control or in your GY; until the end of this turn, this card's Level becomes the same as that monster's, also you cannot Special Summon, except by Synchro Summon.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      trigger: summonedSelf(),
      condition: (g, card, ctx) => (moonstarPool(g, card, ctx.player).length ? null : 'There is no other monster with a Level to target.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 other face-up monster you control or in your Graveyard', moonstarPool(g, card, ctx.player), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster', 'graveyard']);
        if (!t || !g.isMonsterOnField(card)) return;
        card.flags['levelSet'] = g.levelOf(t);
        card.flags['levelSetThisTurn'] = true;
        g.player(ctx.player).turnFlags['onlySynchroSummon'] = 'Magical King Moonstar';
        g.log(`Magical King Moonstar's Level becomes ${g.levelOf(card.uid)} until the end of the turn; ${g.playerName(ctx.player)} can only Special Summon by Synchro Summon this turn.`, 'effect');
      },
    },
  ],
});
function moonstarPool(g: Game, card: CardInstance, player: PlayerId): string[] {
  return [...g.fieldMonsters(player).filter((m) => m.faceUp).map((m) => m.uid), ...graveyardCards(g, player, (d) => d.cardType === 'Monster')].filter((u) => u !== card.uid && g.levelOf(u) > 0);
}

registerScript({
  name: 'Absolute King Back Jack',
  effects: [
    {
      id: 'excavate',
      label: "Banish this card from your GY; excavate the top card of your Deck (Set it if it is a Normal Trap)",
      description: "During your opponent's turn (Quick Effect): You can banish this card from the GY; excavate the top card of your Deck, and if it is a Normal Trap, Set it to your field. Otherwise, send it to the GY. That Set card can be activated during this turn.",
      kind: 'quick',
      spellSpeed: 2,
      from: ['graveyard'],
      hardOncePerTurn: true,
      tags: ['banishFromGY'],
      condition: (g, card, ctx) => (g.state.turnPlayer === ctx.player ? "This effect can only be used during your opponent's turn." : g.player(ctx.player).deck.length === 0 ? 'Your Deck is empty.' : null),
      cost: function* (g, card) {
        g.log('Absolute King Back Jack is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      resolve: function* (g, card, ctx) {
        const top = g.player(ctx.player).deck[0];
        if (!top) return;
        g.log(`${g.playerName(ctx.player)} excavates ${g.name(top)}.`, 'effect');
        g.emit({ type: 'excavated', uid: top, player: ctx.player });
        if (isNormalTrap(def(g, top)) && g.freeSpellTrapZones(ctx.player).length > 0) {
          yield* g.setSpellTrapFromAnywhere(top, ctx.player, { canActivateThisTurn: true });
        } else {
          g.log(`${g.name(top)} is sent to the Graveyard.`, 'effect');
          g.sendToGraveyard(top, 'sent', card.uid);
        }
      },
    },
    {
      id: 'peek',
      label: 'Look at the top 3 cards of your Deck and put them back in any order',
      description: 'If this card is sent to the GY: You can look at 3 cards from the top of your Deck, then place them on the top of the Deck in any order.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid,
      condition: (g, card, ctx) => (g.player(ctx.player).deck.length === 0 ? 'Your Deck is empty.' : null),
      resolve: function* (g, card, ctx) {
        const pl = g.player(ctx.player);
        const top = pl.deck.slice(0, 3);
        const order: string[] = [];
        let rest = top.slice();
        while (rest.length > 1) {
          const [u] = yield* g.selectCards(ctx.player, `Choose the card to place on top (${order.length + 1} of ${top.length}; remaining cards stay below)`, rest, 1, 1, 'You looked at the top cards of your Deck: pick their new order from the top down.');
          order.push(u);
          rest = rest.filter((x) => x !== u);
        }
        order.push(...rest);
        pl.deck = [...order, ...pl.deck.slice(top.length)];
        g.log(`${g.playerName(ctx.player)} looked at the top ${top.length} cards of the Deck and put them back in a chosen order.`, 'effect');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Assault Mode
// ---------------------------------------------------------------------------
registerScript({
  name: 'Red Dragon Archfiend/Assault Mode',
  cannotNormalSummon: 'Red Dragon Archfiend/Assault Mode cannot be Normal Summoned or Set. It must be Special Summoned with "Assault Mode Activate".',
  effects: [
    {
      id: 'wipe',
      label: 'Destroy all other monsters on the field (after this card attacked)',
      description: 'After damage calculation, if this card attacked: Destroy all other monsters on the field.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'damageCalculated' && ev.attacker === card.uid,
      resolve: function* (g, card) {
        if (!g.isMonsterOnField(card)) return;
        const all = ([0, 1] as PlayerId[]).flatMap((p) => g.fieldMonsters(p).map((m) => m.uid)).filter((u) => u !== card.uid);
        if (all.length) yield* g.destroyByEffect(all, card.uid);
      },
    },
    {
      id: 'revive',
      label: 'Special Summon 1 "Red Dragon Archfiend" from your GY',
      description: 'When this card on the field is destroyed: You can target 1 "Red Dragon Archfiend" in your GY; Special Summon that target.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      whenYouCan: true,
      tags: ['summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'destroyed' && ev.uid === card.uid,
      condition: (g, card, ctx) => (graveyardCards(g, ctx.player).filter((u) => isRDA(g, u)).length === 0 ? 'There is no "Red Dragon Archfiend" in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Red Dragon Archfiend" in your Graveyard', graveyardCards(g, ctx.player).filter((u) => isRDA(g, u)), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Red Dragon Archfiend/Assault Mode' });
      },
    },
  ],
});

registerScript({
  name: 'Assault Beast',
  effects: [
    {
      id: 'search',
      label: 'Discard this card; add 1 "Assault Mode Activate" from your Deck to your hand',
      description: 'You can discard this card to the GY; add 1 "Assault Mode Activate" from your Deck to your hand.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['hand'],
      tags: ['searchDeck'],
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.name === 'Assault Mode Activate').length ? null : 'There is no "Assault Mode Activate" in your Deck.'),
      cost: function* (g, card) {
        g.log('Assault Beast is discarded (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'discard');
      },
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add Assault Mode Activate to your hand', deckCards(g, ctx.player, (d) => d.name === 'Assault Mode Activate'), 'Assault Beast');
      },
    },
  ],
});

registerScript({
  name: 'Psi-Reflector',
  effects: [
    {
      id: 'search',
      label: 'Add 1 "Assault Mode Activate" or a card that mentions it from your Deck',
      description: 'If this card is Normal or Special Summoned: You can add 1 "Assault Mode Activate" or 1 card that mentions it from your Deck to your hand, except "Psi-Reflector".',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['searchDeck'],
      trigger: summonedSelf(),
      condition: (g, card, ctx) => (amaPool(g, ctx.player).length ? null : 'There is no "Assault Mode Activate" or card that mentions it in your Deck.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add "Assault Mode Activate" or a card that mentions it', amaPool(g, ctx.player), 'Psi-Reflector');
      },
    },
    {
      id: 'revive',
      label: 'Reveal "Assault Mode Activate"; Special Summon a monster from your GY that mentions it and raise its Level by up to 4',
      description: 'You can reveal 1 "Assault Mode Activate" in your hand, then target 1 monster in your GY that mentions it, except "Psi-Reflector"; Special Summon it, and if you do, increase its Level by up to 4.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['summonFromGY'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Psi-Reflector must be face-up.';
        if (!handCards(g, ctx.player, (d) => d.name === 'Assault Mode Activate').length) return 'You need "Assault Mode Activate" in your hand to reveal.';
        if (graveyardCards(g, ctx.player, (d, c) => d.cardType === 'Monster' && g.mentions(c.uid, 'Assault Mode Activate') && d.name !== 'Psi-Reflector').length === 0) return 'There is no monster in your Graveyard that mentions "Assault Mode Activate".';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card, ctx) {
        g.log(`${g.playerName(ctx.player)} reveals Assault Mode Activate.`, 'effect');
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 monster in your Graveyard that mentions "Assault Mode Activate"', graveyardCards(g, ctx.player, (d, c) => d.cardType === 'Monster' && g.mentions(c.uid, 'Assault Mode Activate') && d.name !== 'Psi-Reflector'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (!t) return;
        const ok = yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Psi-Reflector' });
        if (!ok) return;
        const n = yield* g.selectOption(ctx.player, `Increase ${g.name(t)}'s Level by how much?`, [0, 1, 2, 3, 4].map((i) => ({ id: String(i), label: `+${i} (Level ${g.levelOf(t) + i})` })));
        g.card(t).flags['levelMod'] = Number(n);
        g.log(`${g.name(t)}'s Level is now ${g.levelOf(t)}.`, 'effect');
      },
    },
  ],
});
function amaPool(g: Game, player: PlayerId): string[] {
  return deckCards(g, player, (d, c) => (d.name === 'Assault Mode Activate' || g.mentions(c.uid, 'Assault Mode Activate')) && d.name !== 'Psi-Reflector');
}

registerScript({
  name: 'Fire Ant Ascator',
  effects: [
    {
      id: 'revive',
      label: 'Special Summon 1 Level 5 monster from your GY (effects negated, sent to the GY in the End Phase)',
      description: 'When this card is destroyed by battle and sent to the GY: You can target 1 Level 5 monster in your GY; Special Summon that target, but its effects are negated, also send it to the GY during the End Phase of this turn.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      whenYouCan: true,
      tags: ['summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && ev.reason === 'destroyedBattle',
      condition: (g, card, ctx) => (graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 5).length === 0 ? 'There is no Level 5 monster in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Level 5 monster in your Graveyard', graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 5), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (!t) return;
        const ok = yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Fire Ant Ascator' });
        if (!ok) return;
        g.negateMonsterEffects(t, card.uid);
        g.schedule('END', g.state.turn, 'sendToGYIfOnField', `End Phase: ${g.name(t)} is sent to the Graveyard (Fire Ant Ascator).`, t, {});
      },
    },
  ],
});
registerScheduledHandler('sendToGYIfOnField', function* (g, s) {
  const c = s.uid ? g.state.cards[s.uid] : undefined;
  if (c && g.isOnField(c)) g.sendToGraveyard(c.uid, 'sent');
});

registerScript({
  name: 'Ascator, Dawnwalker',
  effects: [
    {
      id: 'summon',
      label: 'Discard 1 card; Special Summon this card in Defense Position, then you can Special Summon Fire Ant Ascator',
      description: 'You can discard 1 card; Special Summon this card from your hand in Defense Position, then you can Special Summon 1 "Fire Ant Ascator" from your hand or Deck. You cannot Special Summon monsters from the Extra Deck the turn you activate this effect, except Synchro Monsters.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['hand'],
      hardOncePerTurn: true,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => (g.player(ctx.player).hand.length < 2 ? 'You need another card in your hand to discard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      cost: function* (g, card, ctx) {
        yield* discardCards(g, ctx.player, 1, 'Discard 1 card (cost)', g.player(ctx.player).hand.filter((u) => u !== card.uid));
        g.restrictExtraDeck(ctx.player, 'synchro');
      },
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand') return;
        const ok = yield* g.specialSummon(card.uid, ctx.player, { position: 'DEF', how: 'by its own effect' });
        if (!ok) return;
        const pool = [...g.player(ctx.player).hand, ...g.player(ctx.player).deck].filter((u) => g.name(u) === 'Fire Ant Ascator');
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const yes = yield* g.confirm(ctx.player, 'Special Summon Fire Ant Ascator from your hand or Deck?');
        if (yes) yield* summonCard(g, pool[0], ctx.player, 'by Ascator, Dawnwalker');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Danger! monsters
// ---------------------------------------------------------------------------
function dangerScript(name: string, afterDiscard: Parameters<typeof registerScript>[0]['effects'][number]) {
  registerScript({
    name,
    effects: [
      {
        id: 'reveal',
        label: `Reveal ${name}; your opponent randomly discards 1 card from your hand (Summon + draw if it was not this card)`,
        description: `You can reveal this card in your hand; your opponent randomly chooses 1 card from your entire hand, then you discard the chosen card. Then, if the discarded card was not "${name}", Special Summon 1 "${name}" from your hand, and if you do, draw 1 card.`,
        kind: 'ignition',
        spellSpeed: 1,
        from: ['hand'],
        hardOncePerTurn: true,
        resolve: function* (g, card, ctx) {
          const hand = g.player(ctx.player).hand;
          if (hand.length === 0) return;
          const pick = hand[g.random(hand.length)];
          const wasSelf = g.name(pick) === name;
          g.log(`${g.playerName(g.opponent(ctx.player))} randomly chooses ${g.name(pick)} from ${g.playerName(ctx.player)}'s hand; it is discarded.`, 'effect');
          g.sendToGraveyard(pick, 'discard', card.uid);
          if (wasSelf) return;
          const copies = g.player(ctx.player).hand.filter((u) => g.name(u) === name);
          if (copies.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
          const ok = yield* g.specialSummon(copies[0], ctx.player, { position: 'choose', how: 'by its own effect' });
          if (ok) g.draw(ctx.player, 1, `draws (${name})`);
        },
      },
      afterDiscard,
    ],
  });
}
dangerScript('Danger! Nessie!', {
  id: 'search',
  label: 'Add 1 "Danger!" card from your Deck to your hand (this card was discarded)',
  description: 'If this card is discarded: You can add 1 "Danger!" card from your Deck to your hand, except "Danger! Nessie!".',
  kind: 'trigger',
  spellSpeed: 1,
  from: ['graveyard'],
  hardOncePerTurn: true,
  tags: ['searchDeck'],
  trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && ev.reason === 'discard',
  condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.name.startsWith('Danger!') && d.name !== 'Danger! Nessie!').length ? null : 'There is no other "Danger!" card in your Deck.'),
  resolve: function* (g, card, ctx) {
    yield* searchAndAdd(g, ctx.player, 'Add 1 "Danger!" card to your hand', deckCards(g, ctx.player, (d) => d.name.startsWith('Danger!') && d.name !== 'Danger! Nessie!'), 'Danger! Nessie!');
  },
});
dangerScript('Danger! Chupacabra!', {
  id: 'revive',
  label: 'Special Summon 1 other "Danger!" monster from your GY (this card was discarded)',
  description: 'If this card is discarded: You can target 1 "Danger!" monster in your GY, except "Danger! Chupacabra!"; Special Summon it.',
  kind: 'trigger',
  spellSpeed: 1,
  from: ['graveyard'],
  hardOncePerTurn: true,
  tags: ['summonFromGY'],
  trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && ev.reason === 'discard',
  condition: (g, card, ctx) => (graveyardCards(g, ctx.player, (d) => d.name.startsWith('Danger!') && d.cardType === 'Monster' && d.name !== 'Danger! Chupacabra!').length === 0 ? 'There is no other "Danger!" monster in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
  targets: function* (g, card, ctx) {
    return yield* g.selectCards(ctx.player, 'Target 1 other "Danger!" monster in your Graveyard', graveyardCards(g, ctx.player, (d) => d.name.startsWith('Danger!') && d.cardType === 'Monster' && d.name !== 'Danger! Chupacabra!'), 1, 1);
  },
  resolve: function* (g, card, ctx) {
    const [t] = validTargets(g, ctx, ['graveyard']);
    if (t) yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Danger! Chupacabra!' });
  },
});

registerScript({
  name: 'Witch of the Black Forest',
  effects: [
    {
      id: 'search',
      label: 'Add 1 monster with 1500 or less DEF from your Deck to your hand',
      description: 'If this card is sent from the field to the GY: Add 1 monster with 1500 or less DEF from your Deck to your hand, but you cannot activate cards, or the effects of cards, with that name for the rest of this turn.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      mandatory: true,
      hardOncePerTurn: true,
      tags: ['searchDeck'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && (ev.from === 'monster' || ev.from === 'extraMonster'),
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && (d.def ?? 0) <= 1500).length ? null : 'There is no monster with 1500 or less DEF in your Deck.'),
      resolve: function* (g, card, ctx) {
        const u = yield* searchAndAdd(g, ctx.player, 'Add 1 monster with 1500 or less DEF to your hand', deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && (d.def ?? 0) <= 1500), 'Witch of the Black Forest');
        if (!u) return;
        const pl = g.player(ctx.player);
        pl.turnFlags['forbiddenNames'] = [...((pl.turnFlags['forbiddenNames'] as string[] | undefined) ?? []), g.name(u)];
        g.log(`${g.playerName(ctx.player)} cannot activate "${g.name(u)}" or its effects for the rest of this turn.`, 'rule');
      },
    },
  ],
});
