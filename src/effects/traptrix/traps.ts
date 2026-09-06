/**
 * Beware of Traptrix (SDBT): Trap Cards ("Hole" Traps respond to the opponent's Summons in the window that follows).
 */
import { registerScript } from '../../engine/scripts';
import { negateChainLink } from '../../engine/flow';
import type { Game } from '../../engine/game';
import type { PlayerId } from '../../engine/types';
import { TRAP_FROM, def, deckCards, graveyardCards, validTargets } from '../helpers';
import { addToHand, banishByEffect, controlledCards, discardCards, isNormalTrap, lastChainLink, sendByEffect, summonCard, summonedMonstersInWindow, targetableCards, targetableMonstersOf } from '../shared';
import { holeTrapsIn, isTraptrixMonster, normalTrapsIn, traptrixIn } from './common';

const CARD_NOT_THERE = 'The targeted card is no longer where it was, so nothing happens.';

/** Opponent's monsters Summoned in the current response window (still on the field) that pass `filter`. */
function summonedOpponentMonsters(g: Game, player: PlayerId, methods: ('normal' | 'special' | 'flip')[] | undefined, source: string, filter?: (uid: string) => boolean): string[] {
  return summonedMonstersInWindow(g, g.opponent(player), methods).filter((u) => (!filter || filter(u)) && !g.isUnaffected(u, source));
}

// ---------------------------------------------------------------------------
// Trap Hole
// ---------------------------------------------------------------------------
registerScript({
  name: 'Trap Hole',
  effects: [
    {
      id: 'activate',
      label: 'Destroy the monster your opponent just Normal/Flip Summoned (1000 or more ATK)',
      description: 'When your opponent Normal or Flip Summons a monster with 1000 or more ATK: Target that monster; destroy that target.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: false,
      condition: (g, card, ctx) => (summonedOpponentMonsters(g, ctx.player, ['normal', 'flip'], card.uid, (u) => g.stats(u).atk >= 1000 && !g.targetingProtection(g.card(u), ctx.player, card.uid)).length ? null : 'Your opponent did not just Normal or Flip Summon a monster with 1000 or more ATK.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target the Summoned monster', summonedOpponentMonsters(g, ctx.player, ['normal', 'flip'], card.uid, (u) => g.stats(u).atk >= 1000 && !g.targetingProtection(g.card(u), ctx.player, card.uid)), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) return g.log(CARD_NOT_THERE, 'rule');
        yield* g.destroyByEffect([t], card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Bottomless Trap Hole
// ---------------------------------------------------------------------------
registerScript({
  name: 'Bottomless Trap Hole',
  effects: [
    {
      id: 'activate',
      label: 'Destroy and banish the monster(s) your opponent just Summoned (1500 or more ATK)',
      description: 'When your opponent Summons a monster(s) with 1500 or more ATK: Destroy that monster(s) with 1500 or more ATK, and if you do, banish it.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: false,
      condition: (g, card, ctx) => (summonedOpponentMonsters(g, ctx.player, undefined, card.uid, (u) => g.stats(u).atk >= 1500).length ? null : 'Your opponent did not just Summon a monster with 1500 or more ATK.'),
      cost: function* (g, card, ctx) {
        ctx.data['victims'] = summonedOpponentMonsters(g, ctx.player, undefined, card.uid, (u) => g.stats(u).atk >= 1500);
      },
      resolve: function* (g, card, ctx) {
        const victims = (ctx.data['victims'] as string[]).filter((u) => g.state.cards[u] && g.isMonsterOnField(g.card(u)) && g.stats(u).atk >= 1500);
        const destroyed = yield* g.destroyByEffect(victims, card.uid);
        for (const u of destroyed) {
          if (g.card(u).zone === 'graveyard') {
            g.log(`${g.name(u)} is banished by Bottomless Trap Hole.`, 'effect');
            g.banish(u, true, card.uid);
          }
        }
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Void Trap Hole
// ---------------------------------------------------------------------------
registerScript({
  name: 'Void Trap Hole',
  effects: [
    {
      id: 'activate',
      label: 'Negate the effects of a monster your opponent just Special Summoned (2000+ ATK) and destroy it',
      description: 'When your opponent Special Summons a monster(s) with 2000 or more ATK: Negate the effects of 1 of those monsters with 2000 or more ATK, and if you do, destroy it.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: false,
      condition: (g, card, ctx) => (summonedOpponentMonsters(g, ctx.player, ['special'], card.uid, (u) => g.stats(u).atk >= 2000).length ? null : 'Your opponent did not just Special Summon a monster with 2000 or more ATK.'),
      cost: function* (g, card, ctx) {
        ctx.data['victims'] = summonedOpponentMonsters(g, ctx.player, ['special'], card.uid, (u) => g.stats(u).atk >= 2000);
      },
      resolve: function* (g, card, ctx) {
        const pool = (ctx.data['victims'] as string[]).filter((u) => g.state.cards[u] && g.isMonsterOnField(g.card(u)) && g.stats(u).atk >= 2000);
        if (pool.length === 0) return g.log(CARD_NOT_THERE, 'rule');
        const [u] = yield* g.selectCards(ctx.player, 'Choose the monster whose effects are negated and which is destroyed', pool, 1, 1);
        if (g.isUnaffected(u, card.uid)) return g.log(`${g.name(u)} is unaffected by Void Trap Hole.`, 'rule');
        g.negateMonsterEffects(u, card.uid);
        yield* g.destroyByEffect([u], card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Floodgate Trap Hole
// ---------------------------------------------------------------------------
registerScript({
  name: 'Floodgate Trap Hole',
  effects: [
    {
      id: 'activate',
      label: 'Change the monster(s) your opponent just Summoned to face-down Defense Position',
      description: 'When your opponent Summons a monster(s): Change that monster(s) to face-down Defense Position. Monsters changed to face-down Defense Position by this effect cannot change their battle positions.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: false,
      condition: (g, card, ctx) => (summonedOpponentMonsters(g, ctx.player, undefined, card.uid, (u) => g.card(u).faceUp && !g.isLinkMonster(u)).length ? null : 'Your opponent did not just Summon a monster that can be turned face-down.'),
      cost: function* (g, card, ctx) {
        ctx.data['victims'] = summonedOpponentMonsters(g, ctx.player, undefined, card.uid, (u) => g.card(u).faceUp);
      },
      resolve: function* (g, card, ctx) {
        for (const u of ctx.data['victims'] as string[]) {
          const c = g.state.cards[u];
          if (c && g.isMonsterOnField(c) && c.faceUp) g.setFaceDownDefense(u, card.uid, 'Floodgate Trap Hole');
        }
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Trap Hole Nightmare
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Trap Hole Nightmare',
  effects: [
    {
      id: 'activate',
      label: "Negate the effect of a monster Special Summoned this turn on your opponent's field, and destroy it",
      description: "When a monster that was Special Summoned this turn activates its effect on your opponent's field: Negate that effect, and if you do, destroy that card.",
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: 'any',
      condition: (g, card, ctx) => {
        const last = lastChainLink(g);
        if (!last || last.negated || last.player === ctx.player) return "This card responds to an effect activated by a monster on your opponent's field.";
        const c = g.state.cards[last.uid];
        if (!c || !g.isMonsterOnField(c) || def(g, c.uid).cardType !== 'Monster' || last.effectId === 'activate') return "The last effect activated was not a monster effect on your opponent's field.";
        if (!c.flags['specialSummonedThisTurn']) return 'That monster was not Special Summoned this turn.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['linkIndex'] = g.state.chain.length - 1;
      },
      resolve: function* (g, card, ctx) {
        const idx = ctx.data['linkIndex'] as number;
        const link = g.state.chain[idx];
        if (!link || link.negated) return;
        yield* negateChainLink(g, idx, card.uid, 'effect');
        if (!link.negated) return;
        const c = g.state.cards[link.uid];
        if (c && g.isOnField(c)) yield* g.destroyByEffect([link.uid], card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Gravedigger's Trap Hole
// ---------------------------------------------------------------------------
registerScript({
  name: "Gravedigger's Trap Hole",
  effects: [
    {
      id: 'activate',
      label: "Negate the opponent's hand/GY/banished monster effect; inflict 2000 damage",
      description: "When your opponent activates a monster effect in their hand or GY, or when your opponent's banished monster effect is activated: Negate its effect, and if you do, inflict 2000 damage to your opponent.",
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: 'any',
      condition: (g, card, ctx) => {
        const last = lastChainLink(g);
        if (!last || last.negated || last.player === ctx.player) return "This card responds to a monster effect your opponent activates from their hand, Graveyard or banished cards.";
        if (def(g, last.uid).cardType !== 'Monster' || !(last.zone === 'hand' || last.zone === 'graveyard' || last.zone === 'banished')) return 'The last effect activated was not a monster effect from the hand, Graveyard or banished cards.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['linkIndex'] = g.state.chain.length - 1;
      },
      resolve: function* (g, card, ctx) {
        const idx = ctx.data['linkIndex'] as number;
        const link = g.state.chain[idx];
        if (!link || link.negated) return;
        yield* negateChainLink(g, idx, card.uid, 'effect');
        if (link.negated) g.changeLP(g.opponent(ctx.player), -2000, "Gravedigger's Trap Hole");
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Terrifying Trap Hole Nightmare
// ---------------------------------------------------------------------------
registerScript({
  name: 'Terrifying Trap Hole Nightmare',
  effects: [
    {
      id: 'activate',
      label: "Destroy 1 monster your opponent controls with 2000+ ATK (they Special Summoned this turn)",
      description: 'If your opponent has Special Summoned a monster(s) this turn: Target 1 monster your opponent controls with 2000 or more ATK; destroy it, then if you have a "Hole" Normal Trap in your GY, you can banish 1 monster from your opponent\'s GY.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: false,
      hardOncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!g.player(g.opponent(ctx.player)).turnFlags['specialSummonedThisTurn']) return 'Your opponent has not Special Summoned a monster this turn.';
        if (targetableMonstersOf(g, ctx.player, 'opponent', card.uid, (c) => c.faceUp && g.stats(c.uid).atk >= 2000).length === 0) return 'Your opponent controls no face-up monster with 2000 or more ATK to target.';
        return null;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 monster your opponent controls with 2000 or more ATK', targetableMonstersOf(g, ctx.player, 'opponent', card.uid, (c) => c.faceUp && g.stats(c.uid).atk >= 2000), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) return g.log(CARD_NOT_THERE, 'rule');
        const destroyed = yield* g.destroyByEffect([t], card.uid);
        if (destroyed.length === 0 || holeTrapsIn(g, ctx.player, 'graveyard').length === 0) return;
        const pool = graveyardCards(g, g.opponent(ctx.player), (d) => d.cardType === 'Monster');
        if (pool.length === 0) return;
        const yes = yield* g.confirm(ctx.player, "Banish 1 monster from your opponent's GY?");
        if (!yes) return;
        const [u] = yield* g.selectCards(ctx.player, "Banish 1 monster from your opponent's Graveyard", pool, 1, 1);
        banishByEffect(g, u, card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Trap Trick
// ---------------------------------------------------------------------------
registerScript({
  name: 'Trap Trick',
  effects: [
    {
      id: 'activate',
      label: 'Banish 1 Normal Trap from your Deck; Set another copy of it from your Deck (usable this turn)',
      description: 'Banish 1 Normal Trap from your Deck, except "Trap Trick", and if you do, Set 1 card with the same name directly from your Deck. It can be activated this turn. You can only activate 1 Trap Card for the rest of this turn after this card resolves.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      hardOncePerTurn: true,
      condition: (g, card, ctx) => {
        const deck = deckCards(g, ctx.player, (d) => isNormalTrap(d) && d.name !== 'Trap Trick');
        const names = deck.map((u) => g.name(u));
        if (!names.some((n) => names.filter((x) => x === n).length >= 2)) return 'Your Deck needs 2 copies of the same Normal Trap (one to banish, one to Set). This Structure Deck has single copies only.';
        if (g.freeSpellTrapZones(ctx.player).length === 0) return 'No free Spell & Trap Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const deck = deckCards(g, ctx.player, (d) => isNormalTrap(d) && d.name !== 'Trap Trick');
        const names = deck.map((u) => g.name(u));
        const pool = deck.filter((u) => names.filter((x) => x === g.name(u)).length >= 2);
        if (pool.length === 0) return;
        const [a] = yield* g.selectCards(ctx.player, 'Banish 1 Normal Trap from your Deck', pool, 1, 1);
        g.log(`${g.name(a)} is banished from the Deck.`, 'effect');
        g.banish(a, true, card.uid);
        const same = deckCards(g, ctx.player, (d) => d.name === g.name(a));
        if (same.length) yield* g.setSpellTrapFromAnywhere(same[0], ctx.player, { canActivateThisTurn: true });
        g.player(ctx.player).turnFlags['trapActivationsLeft'] = 1;
        g.log(`${g.playerName(ctx.player)} can only activate 1 more Trap Card this turn.`, 'rule');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// The Phantom Knights of Shade Brigandine / Traptrix Holeutea (Traps that become monsters)
// ---------------------------------------------------------------------------
registerScript({
  name: 'The Phantom Knights of Shade Brigandine',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon this card as a Normal Monster (Warrior/DARK/Level 4/ATK 0/DEF 300)',
      description: 'Special Summon this card in Defense Position as a Normal Monster (Warrior/DARK/Level 4/ATK 0/DEF 300). (This card is NOT treated as a Trap.) If you have no Traps in your GY, you can activate this card the turn it was Set.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      hardOncePerTurn: true,
      canActivateTurnSet: (g, card, ctx) => !graveyardCards(g, ctx.player, (d) => d.cardType === 'Trap').length,
      condition: (g, card, ctx) => (g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'spellTrap') return;
        yield* g.specialSummonTrapAsMonster(card.uid, ctx.player, { race: 'Warrior', attribute: 'DARK', level: 4, atk: 0, def: 300 }, 'as a Normal Monster by its own effect');
      },
    },
  ],
});
registerScript({
  name: 'Traptrix Holeutea',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon this card as a Normal Monster (Plant/EARTH/Level 4/ATK 400/DEF 2400)',
      description: 'You can activate this card the turn it was Set, by discarding 1 Normal Trap. Special Summon this card in Defense Position as a Normal Monster (Plant/EARTH/Level 4/ATK 400/DEF 2400). (This card is NOT treated as a Trap.)',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      oncePerTurnGroup: 'holeutea',
      canActivateTurnSet: (g, card, ctx) => g.player(ctx.player).hand.some((u) => isNormalTrap(def(g, u))),
      condition: (g, card, ctx) => (g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
        if (card.setThisTurn && !card.flags['canActivateThisTurn']) {
          const pool = g.player(ctx.player).hand.filter((u) => isNormalTrap(def(g, u)));
          yield* discardCards(g, ctx.player, 1, 'Discard 1 Normal Trap to activate Traptrix Holeutea the turn it was Set (cost)', pool);
        }
      },
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'spellTrap') return;
        yield* g.specialSummonTrapAsMonster(card.uid, ctx.player, { race: 'Plant', attribute: 'EARTH', level: 4, atk: 400, def: 2400 }, 'as a Normal Monster by its own effect');
      },
    },
    {
      id: 'revive',
      label: 'Banish this card from your GY; Special Summon 1 Traptrix monster from your GY',
      description: 'You can banish this card from your GY, then target 1 "Traptrix" monster in your GY; Special Summon it.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['graveyard'],
      oncePerTurnGroup: 'holeutea',
      tags: ['summonFromGY', 'banishFromGY'],
      condition: (g, card, ctx) => (traptrixIn(g, ctx.player, 'graveyard').length === 0 ? 'There is no "Traptrix" monster in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      cost: function* (g, card) {
        g.log('Traptrix Holeutea is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Traptrix" monster in your Graveyard', traptrixIn(g, ctx.player, 'graveyard'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Traptrix Holeutea' });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Artifact Sanctum
// ---------------------------------------------------------------------------
registerScript({
  name: 'Artifact Sanctum',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon 1 "Artifact" monster from your Deck (no Battle Phase this turn)',
      description: 'Special Summon 1 "Artifact" monster from your Deck. You can only activate 1 "Artifact Sanctum" per turn. You cannot conduct your Battle Phase the turn you activate this card.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      hardOncePerTurn: true,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.name.startsWith('Artifact ')).length === 0 ? 'There is no "Artifact" monster in your Deck.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      cost: function* (g, card, ctx) {
        g.player(ctx.player).turnFlags['skipBattlePhase'] = 'Artifact Sanctum was activated this turn';
      },
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.name.startsWith('Artifact '));
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 "Artifact" monster from your Deck', pool, 1, 1);
        yield* summonCard(g, u, ctx.player, 'by Artifact Sanctum');
      },
    },
    {
      id: 'retaliate',
      label: 'Destroy 1 card on the field (Sanctum was destroyed by an opponent\'s card)',
      description: "If this card in its owner's possession is destroyed by an opponent's card: You can target 1 card on the field; destroy that target.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      trigger: (g, card, ev) => ev.type === 'destroyed' && ev.uid === card.uid && ev.byPlayer !== undefined && ev.byPlayer !== card.owner,
      condition: (g, card, ctx) => (targetableCards(g, ctx.player, 'any', card.uid).length ? null : 'There is no card on the field to target.'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 card on the field', targetableCards(g, ctx.player, 'any', card.uid), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster', 'spellTrap', 'field']);
        if (t) yield* g.destroyByEffect([t], card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Naturia Sacred Tree (Continuous)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Naturia Sacred Tree',
  effects: [
    {
      id: 'activate',
      label: 'Activate (stays on the field)',
      description: 'Continuous Trap: Tribute an EARTH Insect to Special Summon a Level 4 or lower EARTH Plant from your Deck, or the other way round (one effect per turn).',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      resolve: function* () {},
    },
    {
      id: 'search',
      label: 'Add 1 "Naturia" card from your Deck to your hand',
      description: 'If this card is sent to the GY: Add 1 "Naturia" card from your Deck to your hand, except "Naturia Sacred Tree".',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      mandatory: true,
      tags: ['searchDeck'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid,
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.name.startsWith('Naturia') && d.name !== 'Naturia Sacred Tree').length ? null : 'There is no other "Naturia" card in your Deck.'),
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.name.startsWith('Naturia') && d.name !== 'Naturia Sacred Tree');
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Add 1 "Naturia" card to your hand', pool, 1, 1);
        addToHand(g, u, 'Naturia Sacred Tree');
      },
    },
    ...(['Insect', 'Plant'] as const).map((tributeRace) => {
      const summonRace = tributeRace === 'Insect' ? 'Plant' : 'Insect';
      return {
        id: `tribute${tributeRace}`,
        label: `Tribute 1 EARTH ${tributeRace} monster; Special Summon 1 Level 4 or lower EARTH ${summonRace} monster from your Deck`,
        description: `You can Tribute 1 EARTH ${tributeRace} monster; Special Summon 1 Level 4 or lower EARTH ${summonRace} monster from your Deck.`,
        kind: 'ignition' as const,
        spellSpeed: 1 as const,
        from: ['spellTrap' as const],
        oncePerTurnGroup: 'sacredTree',
        tags: ['summonFromDeck' as const],
        condition: (g: Game, card: { faceUp: boolean }, ctx: { player: PlayerId }) => {
          if (!card.faceUp) return 'Naturia Sacred Tree must be face-up.';
          if (!g.fieldMonsters(ctx.player).some((m) => m.faceUp && g.raceOf(m.uid) === tributeRace && g.attributeOf(m.uid) === 'EARTH')) return `You need an EARTH ${tributeRace} monster to Tribute.`;
          if (deckCards(g, ctx.player, (d) => d.race === summonRace && d.attribute === 'EARTH' && (d.level ?? 0) <= 4).length === 0) return `There is no Level 4 or lower EARTH ${summonRace} monster in your Deck.`;
          return null;
        },
        cost: function* (g: Game, card: { uid: string }, ctx: { player: PlayerId }) {
          const pool = g.fieldMonsters(ctx.player).filter((m) => m.faceUp && g.raceOf(m.uid) === tributeRace && g.attributeOf(m.uid) === 'EARTH').map((m) => m.uid);
          const [u] = yield* g.selectCards(ctx.player, `Tribute 1 EARTH ${tributeRace} monster (cost)`, pool, 1, 1);
          g.log(`${g.name(u)} is Tributed (cost).`, 'effect');
          g.sendToGraveyard(u, 'tribute', card.uid);
        },
        resolve: function* (g: Game, card: { uid: string }, ctx: { player: PlayerId }) {
          const pool = deckCards(g, ctx.player, (d) => d.race === summonRace && d.attribute === 'EARTH' && (d.level ?? 0) <= 4);
          if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
          const [u] = yield* g.selectCards(ctx.player, `Special Summon 1 Level 4 or lower EARTH ${summonRace} monster from your Deck`, pool, 1, 1);
          yield* summonCard(g, u, ctx.player, 'by Naturia Sacred Tree');
        },
      };
    }),
  ],
});

// ---------------------------------------------------------------------------
// Evenly Matched
// ---------------------------------------------------------------------------
registerScript({
  name: 'Evenly Matched',
  effects: [
    {
      id: 'activate',
      label: 'Your opponent banishes cards from their field face-down until they control as many cards as you',
      description: 'At the end of the Battle Phase, if your opponent controls more cards than you do: You can make your opponent banish cards from their field face-down so they control the same number of cards as you do. If you control no cards, you can activate this card from your hand.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      fromHand: (g, card, ctx) => controlledCards(g, ctx.player).length === 0,
      condition: (g, card, ctx) => {
        if (g.state.phase !== 'BATTLE' || g.state.battle?.step !== 'END') return 'Evenly Matched can only be activated at the end of the Battle Phase (its End Step).';
        const mine = controlledCards(g, ctx.player).filter((c) => c.uid !== card.uid).length;
        const theirs = controlledCards(g, g.opponent(ctx.player)).length;
        if (theirs <= mine) return 'Your opponent does not control more cards than you.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const opp = g.opponent(ctx.player);
        const mine = controlledCards(g, ctx.player).filter((c) => c.uid !== card.uid || g.card(card.uid).zone !== 'spellTrap').length;
        const theirs = controlledCards(g, opp);
        const n = theirs.length - mine;
        if (n <= 0) return;
        const chosen = yield* g.selectCards(opp, `Banish ${n} card${n > 1 ? 's' : ''} you control face-down (Evenly Matched)`, theirs.map((c) => c.uid), n, n);
        for (const u of chosen) banishByEffect(g, u, card.uid, false);
      },
    },
  ],
});
void sendByEffect;
void normalTrapsIn;
