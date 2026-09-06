/**
 * The Crimson King (SDCK): Spell Cards.
 */
import { registerScript } from '../../engine/scripts';
import { performSynchroSummon } from '../../engine/synchro';
import type { Game } from '../../engine/game';
import type { PlayerId } from '../../engine/types';
import { SPELL_FROM, def, deckCards, graveyardCards, handCards, validTargets } from '../helpers';
import { addToHand, discardCards, searchAndAdd, summonCard } from '../shared';
import { RDA, isRDA, isResonator, synchrosOnField } from './common';

// ---------------------------------------------------------------------------
// Absolute Powerforce (Quick-Play)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Absolute Powerforce',
  effects: [
    {
      id: 'activate',
      label: 'Your "Red Dragon Archfiend" gains 1000 ATK, pierces, doubles damage and silences the opponent while it battles this turn',
      description: 'Target 1 "Red Dragon Archfiend" you control; if that monster battles an opponent\'s monster this turn, it gains 1000 ATK, your opponent cannot activate cards or effects, it inflicts piercing damage, and the battle damage is doubled (until the end of the Damage Step).',
      kind: 'activate',
      spellSpeed: 2,
      from: SPELL_FROM,
      condition: (g, card, ctx) => (g.fieldMonsters(ctx.player).some((m) => m.faceUp && isRDA(g, m.uid)) ? null : 'You do not control "Red Dragon Archfiend".'),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Red Dragon Archfiend" you control', g.fieldMonsters(ctx.player).filter((m) => m.faceUp && isRDA(g, m.uid)).map((m) => m.uid), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) return;
        const c = g.card(t);
        c.flags['atkBoostInBattleThisTurn'] = { atk: 1000, source: 'Absolute Powerforce' };
        c.flags['piercingThisTurn'] = true;
        c.flags['doubleBattleDamageThisTurn'] = 'Absolute Powerforce';
        c.flags['lockOpponentActivationsThisTurn'] = true;
        g.log(`${g.name(t)} is empowered by Absolute Powerforce for this turn's battles: +1000 ATK, piercing, doubled damage, and the opponent cannot activate cards or effects while it battles.`, 'effect');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Crimson Gaia (Continuous)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crimson Gaia',
  effects: [
    {
      id: 'activate',
      label: 'Activate Crimson Gaia',
      description: 'Continuous Spell: search "Red Dragon Archfiend" or cards that mention it, flip the opponent\'s monsters face-down when your Red Dragon Archfiend attacks, and revive Red Dragon Archfiend when a monster is destroyed.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      resolve: function* () {},
    },
    {
      id: 'search',
      label: 'Add "Red Dragon Archfiend" or a card that mentions it from your Deck or GY to your hand',
      description: 'During your Main Phase: You can add 1 "Red Dragon Archfiend" or 1 card that mentions it from your Deck or GY to your hand, except "Crimson Gaia".',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['spellTrap'],
      hardOncePerTurn: true,
      tags: ['searchDeck', 'addFromGY'],
      condition: (g, card, ctx) => (!card.faceUp ? 'Crimson Gaia must be face-up.' : gaiaPool(g, ctx.player).length ? null : 'There is no "Red Dragon Archfiend" or card that mentions it in your Deck or Graveyard.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add "Red Dragon Archfiend" or a card that mentions it', gaiaPool(g, ctx.player), 'Crimson Gaia');
      },
    },
    {
      id: 'flip',
      label: "Change all monsters your opponent controls to face-down Defense Position (your Red Dragon Archfiend attacks)",
      description: 'When your "Red Dragon Archfiend" declares an attack: You can change all monsters your opponent controls to face-down Defense Position.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['spellTrap'],
      whenYouCan: true,
      hardOncePerTurn: true,
      trigger: (g, card, ev) => ev.type === 'attackDeclared' && g.state.cards[ev.attacker]?.controller === card.controller && isRDA(g, ev.attacker),
      condition: (g, card, ctx) => (card.faceUp && g.fieldMonsters(g.opponent(ctx.player)).some((m) => m.faceUp && !g.isLinkMonster(m.uid)) ? null : 'Your opponent controls no face-up monster that can be turned face-down.'),
      resolve: function* (g, card, ctx) {
        for (const m of g.fieldMonsters(g.opponent(ctx.player))) if (m.faceUp) g.setFaceDownDefense(m.uid, card.uid);
      },
    },
    {
      id: 'revive',
      label: 'Special Summon 1 "Red Dragon Archfiend" from your GY (a monster was destroyed)',
      description: 'If a monster(s) on the field is destroyed by battle or card effect: You can Special Summon 1 "Red Dragon Archfiend" from your GY.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['spellTrap'],
      hardOncePerTurn: true,
      tags: ['summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'destroyed' && def(g, ev.uid).cardType === 'Monster',
      condition: (g, card, ctx) => (!card.faceUp ? 'Crimson Gaia must be face-up.' : graveyardCards(g, ctx.player).filter((u) => isRDA(g, u) && g.card(u).properlySummoned).length === 0 ? 'There is no "Red Dragon Archfiend" (that was properly Summoned) in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      resolve: function* (g, card, ctx) {
        const pool = graveyardCards(g, ctx.player).filter((u) => isRDA(g, u) && g.card(u).properlySummoned);
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 "Red Dragon Archfiend" from your Graveyard', pool, 1, 1);
        yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Crimson Gaia' });
      },
    },
  ],
});
function gaiaPool(g: Game, player: PlayerId): string[] {
  return [...g.player(player).deck, ...g.player(player).graveyard].filter((u) => (g.name(u) === RDA || g.mentions(u, RDA)) && g.name(u) !== 'Crimson Gaia');
}

// ---------------------------------------------------------------------------
// Resonator Engine / Call / Command
// ---------------------------------------------------------------------------
registerScript({
  name: 'Resonator Engine',
  effects: [
    {
      id: 'activate',
      label: 'Return 2 "Resonator" monsters from your GY to the Deck; add 1 Level 4 monster from your Deck',
      description: 'Target 2 "Resonator" monsters in your GY; add 1 Level 4 monster from your Deck to your hand, and if you do, return those targets to the Deck.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => (graveyardCards(g, ctx.player).filter((u) => isResonator(g, u)).length < 2 ? 'You need 2 "Resonator" monsters in your Graveyard to target.' : deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 4).length === 0 ? 'There is no Level 4 monster in your Deck.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 2 "Resonator" monsters in your Graveyard', graveyardCards(g, ctx.player).filter((u) => isResonator(g, u)), 2, 2);
      },
      resolve: function* (g, card, ctx) {
        const ts = validTargets(g, ctx, ['graveyard']);
        if (ts.length < 2) return;
        const u = yield* searchAndAdd(g, ctx.player, 'Add 1 Level 4 monster from your Deck to your hand', deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 4), 'Resonator Engine');
        if (!u) return;
        for (const t of ts) {
          g.log(`${g.name(t)} returns to the Deck.`, 'effect');
          g.toDeck(t, 'shuffle');
        }
      },
    },
  ],
});
registerScript({
  name: 'Resonator Call',
  effects: [
    {
      id: 'activate',
      label: 'Add 1 "Resonator" monster from your Deck to your hand',
      description: 'Add 1 "Resonator" monster from your Deck to your hand.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => (g.player(ctx.player).deck.some((u) => isResonator(g, u)) ? null : 'There is no "Resonator" monster in your Deck.'),
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add 1 "Resonator" monster to your hand', g.player(ctx.player).deck.filter((u) => isResonator(g, u)), 'Resonator Call');
      },
    },
  ],
});
registerScript({
  name: 'Resonator Command',
  effects: [
    {
      id: 'activate',
      label: 'Discard 1 "Resonator" monster; add 1 Level 4 or lower Fiend monster from your Deck',
      description: 'Discard 1 "Resonator" monster; add 1 Level 4 or lower Fiend monster from your Deck to your hand.',
      kind: 'activate',
      spellSpeed: 2,
      from: SPELL_FROM,
      hardOncePerTurn: true,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => (!handCards(g, ctx.player).some((u) => isResonator(g, u)) ? 'You need a "Resonator" monster in your hand to discard.' : deckCards(g, ctx.player, (d) => d.race === 'Fiend' && (d.level ?? 0) <= 4).length === 0 ? 'There is no Level 4 or lower Fiend monster in your Deck.' : null),
      cost: function* (g, card, ctx) {
        yield* discardCards(g, ctx.player, 1, 'Discard 1 "Resonator" monster (cost)', handCards(g, ctx.player).filter((u) => isResonator(g, u)));
      },
      resolve: function* (g, card, ctx) {
        yield* searchAndAdd(g, ctx.player, 'Add 1 Level 4 or lower Fiend monster to your hand', deckCards(g, ctx.player, (d) => d.race === 'Fiend' && (d.level ?? 0) <= 4), 'Resonator Command');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Burning Soul (Quick-Play)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Burning Soul',
  effects: [
    {
      id: 'activate',
      label: 'Add 1 card from your GY to your hand, then Synchro Summon immediately',
      description: 'If you control a Level 8 or higher Synchro Monster: Add 1 card from your GY to your hand, except "Burning Soul", then, immediately after this effect resolves, Synchro Summon using monsters you control as material. For the rest of this turn, your opponent cannot target Synchro Monsters on the field with card effects.',
      kind: 'activate',
      spellSpeed: 2,
      from: SPELL_FROM,
      hardOncePerTurn: true,
      tags: ['addFromGY'],
      condition: (g, card, ctx) => (synchrosOnField(g, ctx.player, 8).length === 0 ? 'You do not control a Level 8 or higher Synchro Monster.' : g.player(ctx.player).graveyard.filter((u) => g.name(u) !== 'Burning Soul').length === 0 ? 'Your Graveyard is empty.' : null),
      resolve: function* (g, card, ctx) {
        const pool = g.player(ctx.player).graveyard.filter((u) => g.name(u) !== 'Burning Soul');
        if (pool.length) {
          const [u] = yield* g.selectCards(ctx.player, 'Add 1 card from your Graveyard to your hand', pool, 1, 1);
          addToHand(g, u, 'Burning Soul');
        }
        // Immediately Synchro Summon with monsters you control.
        const options = g.player(ctx.player).extra.filter((u) => {
          const req = g.script(u)?.synchro ?? (g.isSynchroMonster(u) ? undefined : undefined);
          void req;
          const proc = g.script(u)?.specialSummon?.find((p) => p.id === 'synchro');
          return !!proc && !g.extraDeckSummonProblem(ctx.player, u) && !proc.condition(g, g.card(u), ctx.player);
        });
        if (options.length === 0 || g.freeMonsterZones(ctx.player).length === 0) {
          g.log('No Synchro Summon is possible right now, so that part does nothing.', 'rule');
        } else {
          const [s] = yield* g.selectCards(ctx.player, 'Synchro Summon which monster from your Extra Deck?', options, 1, 1);
          const proc = g.script(s)!.specialSummon!.find((p) => p.id === 'synchro')!;
          yield* proc.perform(g, g.card(s), ctx.player);
        }
        g.player(g.opponent(ctx.player)).turnFlags['cannotTargetSynchros'] = true;
        g.log(`${g.playerName(g.opponent(ctx.player))} cannot target Synchro Monsters on the field with card effects for the rest of this turn.`, 'effect');
      },
    },
  ],
});
void performSynchroSummon;

// ---------------------------------------------------------------------------
// Pot of Extravagance
// ---------------------------------------------------------------------------
registerScript({
  name: 'Pot of Extravagance',
  effects: [
    {
      id: 'activate',
      label: 'Banish 3 or 6 random face-down Extra Deck cards; draw 1 for every 3',
      description: 'At the start of your Main Phase 1: Banish 3 or 6 random face-down cards from your Extra Deck, face-down; draw 1 card for every 3 cards banished. For the rest of this turn after this card resolves, you cannot draw any cards by card effects.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (g.state.phase !== 'MAIN1') return 'Pot of Extravagance can only be activated at the start of your Main Phase 1.';
        if (g.player(ctx.player).turnFlags['acted']) return 'Pot of Extravagance must be the first thing you do in your Main Phase 1 (it says "at the start of your Main Phase 1").';
        if (g.player(ctx.player).extra.filter((u) => !g.card(u).faceUp).length < 3) return 'You need at least 3 face-down cards in your Extra Deck.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const faceDown = () => g.player(ctx.player).extra.filter((u) => !g.card(u).faceUp);
        const canSix = faceDown().length >= 6;
        const n = canSix ? Number(yield* g.selectOption(ctx.player, 'Banish how many random Extra Deck cards?', [{ id: '3', label: '3 (draw 1)' }, { id: '6', label: '6 (draw 2)' }])) : 3;
        const banished: string[] = [];
        for (let i = 0; i < n; i++) {
          const pool = faceDown();
          if (pool.length === 0) break;
          const u = pool[g.random(pool.length)];
          g.banish(u, false, card.uid);
          banished.push(u);
        }
        g.log(`${banished.length} random Extra Deck card${banished.length === 1 ? '' : 's'} banished face-down (${banished.map((u) => g.name(u)).join(', ')}).`, 'effect');
        g.draw(ctx.player, Math.floor(banished.length / 3), 'draws (Pot of Extravagance)');
        g.player(ctx.player).turnFlags['noEffectDraws'] = 'Pot of Extravagance';
      },
    },
  ],
});
void summonCard;
