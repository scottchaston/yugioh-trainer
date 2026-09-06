/**
 * The Crimson King (SDCK): Synchro Monsters.
 */
import { registerScript, registerScheduledHandler } from '../../engine/scripts';
import { synchroProcedure } from '../../engine/synchro';
import type { Game } from '../../engine/game';
import type { PlayerId } from '../../engine/types';
import { def, graveyardCards, validTargets } from '../helpers';
import { lastChainLink, targetableCards, targetableMonstersOf } from '../shared';
import { RDA, isDarkDragonSynchro, isRDA, isResonator, isTuner, tunersInGY } from './common';

const darkDragonSynchro = (g: Game, c: { uid: string }) => isDarkDragonSynchro(g, c.uid);

// ---------------------------------------------------------------------------
// Red Dragon Archfiend
// ---------------------------------------------------------------------------
registerScript({
  name: 'Red Dragon Archfiend',
  specialSummon: [synchroProcedure({ text: '1 Tuner + 1 or more non-Tuner monsters' })],
  effects: [
    {
      id: 'crush',
      label: 'Destroy all Defense Position monsters your opponent controls (after attacking a Defense Position monster)',
      description: "After damage calculation, if this card attacked an opponent's Defense Position monster: Destroy all Defense Position monsters your opponent controls.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'damageCalculated' && ev.attacker === card.uid && !!ev.target && g.state.cards[ev.target]?.position === 'DEF',
      resolve: function* (g, card) {
        if (!g.isMonsterOnField(card)) return;
        const pool = g.fieldMonsters(g.opponent(card.controller)).filter((m) => m.position === 'DEF').map((m) => m.uid);
        if (pool.length) yield* g.destroyByEffect(pool, card.uid);
      },
    },
    {
      id: 'endPhase',
      label: 'Destroy all your other monsters that did not attack this turn (End Phase)',
      description: 'Once per turn, during your End Phase: Destroy all other monsters you control that did not declare an attack this turn.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      mandatory: true,
      oncePerTurn: true,
      trigger: (g, card, ev) => ev.type === 'phaseStart' && ev.phase === 'END' && ev.player === card.controller,
      resolve: function* (g, card) {
        if (!g.isMonsterOnField(card) || !card.faceUp) return;
        const pool = g.fieldMonsters(card.controller).filter((m) => m.uid !== card.uid && m.attacksDeclaredThisTurn === 0).map((m) => m.uid);
        if (pool.length === 0) return g.log('Red Dragon Archfiend: all your other monsters attacked this turn, so none is destroyed.', 'rule');
        yield* g.destroyByEffect(pool, card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Scarlight Red Dragon Archfiend
// ---------------------------------------------------------------------------
registerScript({
  name: 'Scarlight Red Dragon Archfiend',
  treatedAsName: (g, self) => (g.isOnField(self) || self.zone === 'graveyard' ? RDA : null),
  specialSummon: [synchroProcedure({ text: '1 Tuner + 1 or more non-Tuner monsters' })],
  effects: [
    {
      id: 'purge',
      label: 'Destroy all other Special Summoned Effect Monsters with ATK ≤ this card\'s; 500 damage each',
      description: "Once per turn: You can destroy as many other Special Summoned Effect Monsters on the field as possible with ATK less than or equal to this card's, then inflict 500 damage to your opponent for each monster destroyed.",
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      condition: (g, card) => (card.faceUp ? null : 'Scarlight must be face-up.'),
      resolve: function* (g, card) {
        if (!g.isMonsterOnField(card)) return;
        const atk = g.stats(card.uid).atk;
        const pool = ([0, 1] as PlayerId[]).flatMap((p) => g.fieldMonsters(p)).filter((m) => m.uid !== card.uid && m.faceUp && m.flags['specialSummoned'] && !!def(g, m.uid).monsterTypes?.includes('Effect') && g.stats(m.uid).atk <= atk).map((m) => m.uid);
        const destroyed = yield* g.destroyByEffect(pool, card.uid);
        if (destroyed.length) g.changeLP(g.opponent(card.controller), -500 * destroyed.length, `Scarlight Red Dragon Archfiend (${destroyed.length} destroyed)`);
        else g.log('No monster was destroyed, so no damage is inflicted.', 'rule');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Hot Red Dragon Archfiend Abyss / Bane
// ---------------------------------------------------------------------------
registerScript({
  name: 'Hot Red Dragon Archfiend Abyss',
  specialSummon: [synchroProcedure({ text: '1 Tuner + 1 non-Tuner DARK Dragon Synchro Monster', nonTuner: darkDragonSynchro, nonTuners: [1, 1] })],
  effects: [
    {
      id: 'negate',
      label: "Negate the effects of 1 face-up card your opponent controls until the end of this turn",
      description: '(Quick Effect): You can target 1 face-up card your opponent controls; negate its effects until the end of this turn.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['monster'],
      hardOncePerTurn: true,
      condition: (g, card, ctx) => (card.faceUp && targetableCards(g, ctx.player, 'opponent', card.uid, (c) => c.faceUp).length ? null : 'Your opponent controls no face-up card to target.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 face-up card your opponent controls', targetableCards(g, ctx.player, 'opponent', card.uid, (c) => c.faceUp), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster', 'spellTrap', 'field']);
        if (!t || !g.card(t).faceUp) return;
        if (g.isMonsterOnField(g.card(t))) g.negateMonsterEffects(t, card.uid, true);
        else if (!g.isUnaffected(t, card.uid)) {
          g.card(t).flags['effectsNegated'] = true;
          g.card(t).flags['negatedBy'] = 'Hot Red Dragon Archfiend Abyss';
          g.card(t).flags['effectsNegatedThisTurn'] = true;
          g.fx({ type: 'negate', uid: t });
          g.log(`${g.name(t)}'s effects are negated until the end of this turn.`, 'effect');
        }
      },
    },
    {
      id: 'tuner',
      label: 'Special Summon 1 Tuner from your GY in Defense Position (inflicted battle damage)',
      description: 'When this card inflicts battle damage to your opponent: You can target 1 Tuner in your GY; Special Summon it in Defense Position.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      hardOncePerTurn: true,
      tags: ['summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'battleDamage' && ev.attacker === card.uid && ev.player !== card.controller,
      condition: (g, card, ctx) => (tunersInGY(g, ctx.player).length === 0 ? 'There is no Tuner in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Tuner in your Graveyard', tunersInGY(g, ctx.player), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'DEF', how: 'by Hot Red Dragon Archfiend Abyss' });
      },
    },
  ],
});

registerScript({
  name: 'Hot Red Dragon Archfiend Bane',
  specialSummon: [synchroProcedure({ text: '1 Tuner + 1 non-Tuner DARK Dragon Synchro Monster', nonTuner: darkDragonSynchro, nonTuners: [1, 1] })],
  effects: [
    {
      id: 'revive',
      label: 'Tribute 1 monster; Special Summon 1 "Red Dragon Archfiend" monster from your GY',
      description: 'You can Tribute 1 monster, then target 1 "Red Dragon Archfiend" monster in your GY; Special Summon it.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['summonFromGY'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Bane must be face-up.';
        if (g.fieldMonsters(ctx.player).length === 0) return 'You control no monster to Tribute.';
        if (graveyardCards(g, ctx.player).filter((u) => g.name(u).includes(RDA) || isRDA(g, u)).length === 0) return 'There is no "Red Dragon Archfiend" monster in your Graveyard.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const [u] = yield* g.selectCards(ctx.player, 'Tribute 1 monster (cost)', g.fieldMonsters(ctx.player).map((m) => m.uid), 1, 1);
        g.log(`${g.name(u)} is Tributed (cost).`, 'effect');
        g.sendToGraveyard(u, 'tribute', card.uid);
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Red Dragon Archfiend" monster in your Graveyard', graveyardCards(g, ctx.player).filter((u) => g.name(u).includes(RDA) || isRDA(g, u)), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Hot Red Dragon Archfiend Bane' });
      },
    },
    {
      id: 'tuners',
      label: 'Special Summon 2 Tuners with the same Level (1 from Deck, 1 from GY) in Defense Position',
      description: 'When this card inflicts battle damage to your opponent: You can Special Summon 2 Tuners with the same Level (1 from your Deck and 1 from your GY) in Defense Position.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      hardOncePerTurn: true,
      tags: ['summonFromDeck', 'summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'battleDamage' && ev.attacker === card.uid && ev.player !== card.controller,
      condition: (g, card, ctx) => (banePairs(g, ctx.player).length === 0 ? 'You need a Tuner in your Deck and a Tuner with the same Level in your GY.' : g.freeMonsterZones(ctx.player).length < 2 ? 'You need 2 free Monster Zones.' : null),
      resolve: function* (g, card, ctx) {
        const pairs = banePairs(g, ctx.player);
        if (pairs.length === 0 || g.freeMonsterZones(ctx.player).length < 2) return;
        const [fromDeck] = yield* g.selectCards(ctx.player, 'Special Summon 1 Tuner from your Deck', [...new Set(pairs.map((p) => p.deck))], 1, 1);
        const gyPool = pairs.filter((p) => p.deck === fromDeck).map((p) => p.gy);
        const [fromGY] = yield* g.selectCards(ctx.player, `Special Summon 1 Tuner from your GY with the same Level (${g.levelOf(fromDeck)})`, gyPool, 1, 1);
        yield* g.specialSummon(fromDeck, ctx.player, { position: 'DEF', how: 'by Hot Red Dragon Archfiend Bane (from the Deck)' });
        g.shuffleDeck(ctx.player);
        yield* g.specialSummon(fromGY, ctx.player, { position: 'DEF', how: 'by Hot Red Dragon Archfiend Bane (from the Graveyard)' });
      },
    },
  ],
});
function banePairs(g: Game, player: PlayerId): { deck: string; gy: string }[] {
  const deck = g.player(player).deck.filter((u) => isTuner(g, u));
  const gy = tunersInGY(g, player);
  const out: { deck: string; gy: string }[] = [];
  for (const d of deck) for (const y of gy) if (g.levelOf(d) === g.levelOf(y)) out.push({ deck: d, gy: y });
  return out;
}

// ---------------------------------------------------------------------------
// Red Nova Dragon / Red Supernova Dragon
// ---------------------------------------------------------------------------
registerScript({
  name: 'Red Nova Dragon',
  specialSummon: [synchroProcedure({ text: '2 Tuners + "Red Dragon Archfiend"', tuners: 2, nonTuner: (g, c) => isRDA(g, c.uid), nonTuners: [1, 1] })],
  immuneToOpponentEffectDestruction: true,
  modifyStats: (g, self, target) => (target.uid === self.uid && self.faceUp ? { atk: 500 * tunersInGY(g, self.controller).length } : null),
  effects: [
    {
      id: 'guard',
      label: "Banish this card to negate an opponent's attack",
      description: "When an opponent's monster declares an attack: You can target the attacking monster; banish this card, and if you do, negate that attack. During the End Phase, if this card was banished by its effect this turn, it is Special Summoned back.",
      kind: 'trigger',
      spellSpeed: 2,
      from: ['monster'],
      whenYouCan: true,
      trigger: (g, card, ev) => ev.type === 'attackDeclared' && g.state.cards[ev.attacker]?.controller !== card.controller,
      condition: (g, card) => (card.faceUp && g.state.battle?.attacker ? null : 'There is no attack to respond to.'),
      targets: function* (g) {
        return [g.state.battle!.attacker!];
      },
      resolve: function* (g, card, ctx) {
        const b = g.state.battle;
        if (!b || !b.attacker || !ctx.targets.includes(b.attacker) || !g.isMonsterOnField(card)) return;
        g.log('Red Nova Dragon banishes itself; the attack is negated.', 'effect');
        g.banish(card.uid, true, card.uid);
        b.attackNegated = true;
        g.schedule('END', g.state.turn, 'returnBanishedSelf', 'End Phase: Red Nova Dragon returns from being banished.', card.uid, { player: ctx.player });
      },
    },
  ],
});
registerScheduledHandler('returnBanishedSelf', function* (g, s) {
  const c = s.uid ? g.state.cards[s.uid] : undefined;
  if (!c || c.zone !== 'banished') return;
  yield* g.specialSummon(c.uid, s.data['player'] as PlayerId, { position: 'choose', how: 'returning from being banished by its own effect' });
});

registerScript({
  name: 'Red Supernova Dragon',
  specialSummon: [synchroProcedure({ text: '3 Tuners + 1 or more non-Tuner Synchro Monsters', tuners: 3, nonTuner: (g, c) => g.isSynchroMonster(c.uid), nonTuners: [1, 99] })],
  immuneToOpponentEffectDestruction: true,
  modifyStats: (g, self, target) => (target.uid === self.uid && self.faceUp ? { atk: 500 * tunersInGY(g, self.controller).length } : null),
  effects: [
    {
      id: 'nova',
      label: "Banish this card and all cards your opponent controls (opponent's monster effect or attack)",
      description: "Once per turn, when your opponent's monster effect is activated, or when an opponent's monster declares an attack (Quick Effect): You can banish this card, also banish all cards your opponent controls. During your next End Phase, this card is Special Summoned back.",
      kind: 'quick',
      spellSpeed: 2,
      from: ['monster'],
      oncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Red Supernova Dragon must be face-up.';
        const last = lastChainLink(g);
        const oppEffect = !!last && last.player !== ctx.player && def(g, last.uid).cardType === 'Monster' && last.effectId !== 'activate';
        const b = g.state.battle;
        const oppAttack = !!b && !!b.attacker && g.card(b.attacker).controller !== ctx.player && !b.damageStepStage;
        return oppEffect || oppAttack ? null : "This effect responds to an opponent's monster effect or attack.";
      },
      resolve: function* (g, card, ctx) {
        if (!g.isMonsterOnField(card)) return;
        const opp = g.opponent(ctx.player);
        g.log('Red Supernova Dragon banishes itself and all cards its opponent controls.', 'effect');
        g.banish(card.uid, true, card.uid);
        const all = [...g.fieldMonsters(opp), ...g.spellTrapCards(opp), ...(g.fieldSpell(opp) ? [g.fieldSpell(opp)!] : [])].map((c) => c.uid);
        for (const u of all) if (!g.isUnaffected(u, card.uid)) g.banish(u, true, card.uid);
        const turn = g.state.turnPlayer === ctx.player ? g.state.turn : g.state.turn + 1;
        g.schedule('END', turn, 'returnBanishedSelf', 'End Phase: Red Supernova Dragon returns from being banished.', card.uid, { player: ctx.player });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Hot Red Dragon Archfiend King Calamity
// ---------------------------------------------------------------------------
registerScript({
  name: 'Hot Red Dragon Archfiend King Calamity',
  specialSummon: [synchroProcedure({ text: '2 Tuners + 1 non-Tuner DARK Dragon Synchro Monster', tuners: 2, nonTuner: darkDragonSynchro, nonTuners: [1, 1] })],
  effects: [
    {
      id: 'lock',
      label: 'Your opponent cannot activate cards or effects on the field for the rest of this turn',
      description: "When this card is Synchro Summoned: You can activate this effect; for the rest of this turn, your opponent cannot activate cards or effects on the field. (The opponent cannot respond to this activation.)",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      trigger: (g, card, ev) => ev.type === 'summon' && ev.uid === card.uid && ev.how === 'synchro',
      resolve: function* (g, card, ctx) {
        g.player(g.opponent(ctx.player)).turnFlags['cannotActivate'] = { scope: 'field', reason: 'Hot Red Dragon Archfiend King Calamity' };
        g.log(`${g.playerName(g.opponent(ctx.player))} cannot activate cards or effects on the field for the rest of this turn.`, 'effect');
      },
    },
    {
      id: 'burn',
      label: "Inflict damage equal to the destroyed monster's original ATK",
      description: "If this card destroys a monster by battle: Inflict damage to your opponent equal to that monster's original ATK.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'destroyed' && ev.reason === 'battle' && ev.source === card.uid,
      resolve: function* (g, card, ctx) {
        const ev = ctx.event as { uid: string } | undefined;
        if (!ev) return;
        const atk = def(g, ev.uid).atk ?? 0;
        if (atk > 0) g.changeLP(g.opponent(ctx.player), -atk, 'Hot Red Dragon Archfiend King Calamity');
      },
    },
    {
      id: 'revive',
      label: 'Special Summon 1 Level 8 or lower DARK Dragon Synchro Monster from your GY (destroyed by an opponent\'s card)',
      description: "If this card in its owner's possession is destroyed by an opponent's card: You can target 1 Level 8 or lower DARK Dragon Synchro Monster in your GY; Special Summon it.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      tags: ['summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'destroyed' && ev.uid === card.uid && ev.byPlayer !== undefined && ev.byPlayer !== card.owner,
      condition: (g, card, ctx) => (calamityPool(g, ctx.player, card.uid).length === 0 ? 'There is no Level 8 or lower DARK Dragon Synchro Monster in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Level 8 or lower DARK Dragon Synchro Monster in your Graveyard', calamityPool(g, ctx.player, card.uid), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Hot Red Dragon Archfiend King Calamity' });
      },
    },
  ],
});
function calamityPool(g: Game, player: PlayerId, self: string): string[] {
  return g.player(player).graveyard.filter((u) => u !== self && isDarkDragonSynchro(g, u) && g.levelOf(u) <= 8 && g.card(u).properlySummoned);
}

// ---------------------------------------------------------------------------
// Red Rising Dragon
// ---------------------------------------------------------------------------
registerScript({
  name: 'Red Rising Dragon',
  specialSummon: [synchroProcedure({ text: '1 Fiend Tuner + 1 or more non-Tuner monsters', tuner: (g, c) => g.raceOf(c.uid) === 'Fiend' })],
  effects: [
    {
      id: 'revive',
      label: 'Special Summon 1 "Resonator" monster from your GY (Synchro Summoned)',
      description: 'When this card is Synchro Summoned: You can target 1 "Resonator" monster in your GY; Special Summon it. You cannot Special Summon monsters from the Extra Deck the turn you activate this effect, except DARK Dragon Synchro Monsters.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      whenYouCan: true,
      tags: ['summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'summon' && ev.uid === card.uid && ev.how === 'synchro',
      condition: (g, card, ctx) => (graveyardCards(g, ctx.player).filter((u) => isResonator(g, u)).length === 0 ? 'There is no "Resonator" monster in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      cost: function* (g, card, ctx) {
        g.restrictExtraDeck(ctx.player, 'darkDragonSynchro');
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Resonator" monster in your Graveyard', graveyardCards(g, ctx.player).filter((u) => isResonator(g, u)), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Red Rising Dragon' });
      },
    },
    {
      id: 'double',
      label: 'Banish this card from your GY; Special Summon 2 Level 1 "Resonator" monsters from your GY',
      description: 'During your Main Phase, except the turn this card was sent to the GY: You can banish this card from your GY, then target 2 Level 1 "Resonator" monsters in your GY; Special Summon both.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['graveyard'],
      tags: ['summonFromGY', 'banishFromGY'],
      condition: (g, card, ctx) => {
        if (card.flags['sentToGYTurn'] === g.state.turn) return 'This effect cannot be used during the turn Red Rising Dragon was sent to the Graveyard.';
        if (graveyardCards(g, ctx.player).filter((u) => isResonator(g, u) && g.levelOf(u) === 1).length < 2) return 'You need 2 Level 1 "Resonator" monsters in your Graveyard.';
        if (g.freeMonsterZones(ctx.player).length < 2) return 'You need 2 free Monster Zones.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Red Rising Dragon is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 2 Level 1 "Resonator" monsters in your Graveyard', graveyardCards(g, ctx.player).filter((u) => isResonator(g, u) && g.levelOf(u) === 1), 2, 2);
      },
      resolve: function* (g, card, ctx) {
        for (const t of validTargets(g, ctx, ['graveyard'])) yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Red Rising Dragon' });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Scarred Dragon Archfiend
// ---------------------------------------------------------------------------
registerScript({
  name: 'Scarred Dragon Archfiend',
  treatedAsName: (g, self) => (g.isOnField(self) || self.zone === 'graveyard' ? RDA : null),
  specialSummon: [synchroProcedure({ text: '1 Tuner + 1 or more non-Tuner DARK monsters', nonTuner: (g, c) => g.attributeOf(c.uid) === 'DARK' })],
  effects: [
    {
      id: 'rebirth',
      label: 'Special Summon "Red Dragon Archfiend" from your Extra Deck (treated as a Synchro Summon)',
      description: 'If this card is sent from the Monster Zone to the GY: You can Special Summon 1 "Red Dragon Archfiend" from your Extra Deck (this is treated as a Synchro Summon), then, if this card was sent to the GY as Synchro Material for a DARK Dragon Synchro Monster, you can destroy all Attack Position monsters your opponent controls.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && (ev.from === 'monster' || ev.from === 'extraMonster'),
      condition: (g, card, ctx) => (g.player(ctx.player).extra.filter((u) => g.name(u) === RDA).length === 0 ? 'There is no "Red Dragon Archfiend" in your Extra Deck.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      resolve: function* (g, card, ctx) {
        const rda = g.player(ctx.player).extra.find((u) => g.name(u) === RDA);
        if (!rda) return;
        const ok = yield* g.specialSummon(rda, ctx.player, { position: 'choose', how: 'synchro', proper: true });
        if (!ok) return;
        const usedFor = card.flags['usedAsSynchroMaterialFor'] as string | undefined;
        if (usedFor && isDarkDragonSynchro(g, usedFor)) {
          const pool = g.fieldMonsters(g.opponent(ctx.player)).filter((m) => m.position === 'ATK').map((m) => m.uid);
          if (pool.length === 0) return;
          const yes = yield* g.confirm(ctx.player, 'Destroy all Attack Position monsters your opponent controls?');
          if (yes) yield* g.destroyByEffect(pool, card.uid);
        }
      },
    },
  ],
});
void targetableMonstersOf;
