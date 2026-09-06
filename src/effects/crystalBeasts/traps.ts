/** Trap Cards of the Legend of the Crystal Beasts deck. */
import { registerScript } from '../../engine/scripts';
import { negateChainLink } from '../../engine/flow';
import type { Game } from '../../engine/game';
import type { PlayerId } from '../../engine/types';
import { TRAP_FROM, def, deckCards, validTargets } from '../helpers';
import { cbCandidates, cbInDeck, cbInGY, cbInSTZone, cbMonstersOnField, isCB, isCBMonsterCard, isUltimateCrystal, placeCB, summonFromST } from './common';

/** Trigger for "If a Crystal Beast card(s) is placed in your Spell & Trap Zone while this card is in your GY". */
const placedInMyZone = (g: Game, cardOwner: PlayerId, ev: { type: string; player?: PlayerId }) => ev.type === 'placedInSpellTrapZone' && ev.player === cardOwner;

// ---------------------------------------------------------------------------
// Crystal Boon
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crystal Boon',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon up to 2 Crystal Beast Monster Cards from your Spell & Trap Zone; gain LP equal to their ATK',
      description: 'Special Summon up to 2 "Crystal Beast" Monster Cards from your Spell & Trap Zone, and if you do, gain LP equal to their combined original ATK.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      condition: (g, card, ctx) => {
        if (cbCandidates(g, ctx.player, ['spellTrap']).length === 0) return 'You have no Crystal Beast Monster Card in your Spell & Trap Zone.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbCandidates(g, ctx.player, ['spellTrap']);
        const max = Math.min(2, pool.length, g.freeMonsterZones(ctx.player).length);
        if (max === 0) return;
        const chosen = yield* g.selectCards(ctx.player, `Special Summon up to ${max} Crystal Beast Monster Card${max > 1 ? 's' : ''} from your Spell & Trap Zone`, pool, 1, max);
        let gain = 0;
        for (const u of chosen) {
          const ok = yield* summonFromST(g, u, ctx.player, 'by Crystal Boon');
          if (ok) gain += def(g, u).atk ?? 0;
        }
        if (gain > 0) g.changeLP(ctx.player, gain, 'Crystal Boon');
      },
    },
    {
      id: 'gy',
      label: 'Banish Crystal Boon from your GY; excavate the top card of your Deck',
      description: 'If a "Crystal Beast" card(s) is placed in your Spell & Trap Zone while this card is in your GY, even during the Damage Step: You can banish this card; excavate the top card of your Deck, and if it is a "Crystal Beast" monster, either add it to your hand or Special Summon it. Otherwise, send that card to the GY. Once per turn.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      trigger: (g, card, ev) => placedInMyZone(g, card.owner, ev),
      condition: (g, card, ctx) => (g.player(ctx.player).deck.length === 0 ? 'Your Deck is empty.' : null),
      cost: function* (g, card) {
        g.log('Crystal Boon is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      resolve: function* (g, card, ctx) {
        const top = g.player(ctx.player).deck[0];
        if (!top) return;
        g.log(`${g.playerName(ctx.player)} excavates the top card of the Deck: ${g.name(top)}.`, 'effect');
        if (isCBMonsterCard(g, top)) {
          const choice = yield* g.selectOption(ctx.player, `${g.name(top)} is a Crystal Beast monster`, [
            { id: 'hand', label: 'Add it to your hand' },
            { id: 'summon', label: 'Special Summon it' },
          ]);
          if (choice === 'hand' || g.freeMonsterZones(ctx.player).length === 0) {
            g.toHand(top);
            g.log(`${g.name(top)} is added to the hand.`, 'effect');
          } else {
            yield* g.specialSummon(top, ctx.player, { position: 'choose', how: 'by Crystal Boon' });
          }
        } else {
          g.log(`${g.name(top)} is not a Crystal Beast monster, so it is sent to the Graveyard.`, 'effect');
          g.sendToGraveyard(top, 'sent', card.uid);
        }
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Crystal Miracle (Counter Trap)
// ---------------------------------------------------------------------------
function cbCardsYouControl(g: Game, player: PlayerId): string[] {
  return [...cbMonstersOnField(g, player).map((m) => m.uid), ...cbInSTZone(g, player).map((c) => c.uid)];
}

registerScript({
  name: 'Crystal Miracle',
  effects: [
    {
      id: 'activate',
      label: 'Destroy 1 Crystal Beast card you control; negate a Spell/Trap or monster effect activation and destroy that card',
      description: 'When a Spell/Trap Card, or monster effect, is activated: Destroy 1 "Crystal Beast" card you control, and if you do, negate that activation, and if you do that, destroy that card. (Counter Trap.)',
      kind: 'activate',
      spellSpeed: 3,
      from: TRAP_FROM,
      damageStep: 'any',
      condition: (g, card, ctx) => {
        const chain = g.state.chain;
        const last = chain[chain.length - 1];
        if (!last || last.negated) return 'Crystal Miracle responds to the activation of a Spell/Trap Card or monster effect.';
        if (cbCardsYouControl(g, ctx.player).length === 0) return 'You control no Crystal Beast card to destroy.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['linkIndex'] = g.state.chain.length - 1;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbCardsYouControl(g, ctx.player);
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Destroy 1 Crystal Beast card you control', pool, 1, 1);
        const before = g.card(u).zone;
        const res = yield* g.destroyByEffect([u], card.uid);
        const destroyed = res.length > 0 || g.state.cards[u]?.zone !== before;
        if (!destroyed) {
          g.log('The Crystal Beast was not destroyed, so nothing is negated.', 'rule');
          return;
        }
        yield* negateChainLink(g, ctx.data['linkIndex'] as number, card.uid, 'destroy');
      },
    },
    {
      id: 'gy',
      label: 'Banish Crystal Miracle from your GY; place 1 Crystal Beast from your hand, Deck or GY in your Spell & Trap Zone',
      description: 'If a "Crystal Beast" card(s) is placed in your Spell & Trap Zone while this card is in your GY, even during the Damage Step: You can banish this card; place 1 "Crystal Beast" monster from your hand, Deck, or GY, face-up in your Spell & Trap Zone as a Continuous Spell. Once per turn.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      trigger: (g, card, ev) => placedInMyZone(g, card.owner, ev),
      condition: (g, card, ctx) => {
        if (cbCandidates(g, ctx.player, ['hand', 'deck', 'graveyard']).length === 0) return 'No Crystal Beast monster is available.';
        if (g.freeSpellTrapZones(ctx.player).length === 0) return 'No free Spell & Trap Zone.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Crystal Miracle is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = cbCandidates(g, ctx.player, ['hand', 'deck', 'graveyard']);
        if (pool.length === 0 || g.freeSpellTrapZones(ctx.player).length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Place 1 Crystal Beast monster face-up in your Spell & Trap Zone', pool, 1, 1, 'Cards shown come from your hand, Deck and Graveyard.');
        yield* placeCB(g, u, ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Crystal Brilliance (Continuous Trap)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crystal Brilliance',
  effects: [
    {
      id: 'activate',
      label: 'Activate (Crystal Beasts gain ATK equal to their original DEF)',
      description: 'You can only control 1 "Crystal Brilliance". Each "Crystal Beast" monster you control gains ATK equal to its original DEF.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      condition: (g, card, ctx) => (g.spellTrapCards(ctx.player).some((c) => c.uid !== card.uid && c.faceUp && g.name(c.uid) === 'Crystal Brilliance') ? 'You can only control 1 "Crystal Brilliance".' : null),
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      resolve: function* () {},
    },
    {
      id: 'summon',
      label: 'Send Crystal Brilliance to the GY; Special Summon 1 Crystal Beast from your hand or GY (damage halved this turn)',
      description: 'If a "Crystal Beast" card(s) is placed in your Spell & Trap Zone, even during the Damage Step: You can send this face-up card to the GY; Special Summon 1 "Crystal Beast" monster from your hand or GY, also any damage you take this turn is halved.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['spellTrap'],
      trigger: (g, card, ev) => card.faceUp && placedInMyZone(g, card.controller, ev),
      condition: (g, card, ctx) => {
        if (cbCandidates(g, ctx.player, ['hand', 'graveyard']).length === 0) return 'No Crystal Beast monster in your hand or Graveyard.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Crystal Brilliance is sent to the Graveyard (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'cost', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = cbCandidates(g, ctx.player, ['hand', 'graveyard']);
        if (pool.length > 0 && g.freeMonsterZones(ctx.player).length > 0) {
          const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Crystal Beast monster from your hand or Graveyard', pool, 1, 1);
          yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Crystal Brilliance' });
        }
        g.player(ctx.player).turnFlags['halveDamage'] = 'Crystal Brilliance';
        g.log(`Any damage ${g.playerName(ctx.player)} takes this turn is halved.`, 'effect');
      },
    },
  ],
  modifyStats: (g, self, target) => (self.zone === 'spellTrap' && self.faceUp && target.controller === self.controller && isCBMonsterCard(g, target.uid) ? { atk: g.stats(target.uid).originalDef } : null),
});

// ---------------------------------------------------------------------------
// Crystal Pair
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crystal Pair',
  effects: [
    {
      id: 'activate',
      label: 'Place 1 Crystal Beast from your Deck in your Spell & Trap Zone; no battle damage this turn',
      description: 'When a "Crystal Beast" monster you control is destroyed by battle and sent to the GY: Place 1 "Crystal Beast" monster from your Deck face-up in your Spell & Trap Zone as a Continuous Spell, and if you do, you take no battle damage for the rest of this turn.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: 'any',
      condition: (g, card, ctx) => {
        const ev = g.state.windowEvents.find((e) => e.type === 'toGraveyard' && e.reason === 'destroyedBattle' && isCBMonsterCard(g, e.uid) && g.state.cards[e.uid]?.owner === ctx.player);
        if (!ev) return 'Crystal Pair can only be activated right after a Crystal Beast monster you control was destroyed by battle and sent to the Graveyard.';
        if (cbInDeck(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Deck.';
        if (g.freeSpellTrapZones(ctx.player).length === 0) return 'No free Spell & Trap Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbInDeck(g, ctx.player);
        if (pool.length === 0 || g.freeSpellTrapZones(ctx.player).length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Place 1 Crystal Beast monster from your Deck face-up in your Spell & Trap Zone', pool, 1, 1);
        const ok = yield* placeCB(g, u, ctx.player);
        if (ok) {
          g.player(ctx.player).turnFlags['noBattleDamage'] = true;
          g.log(`${g.playerName(ctx.player)} takes no battle damage for the rest of this turn.`, 'effect');
        }
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Crystal Conclave (Continuous Trap)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crystal Conclave',
  effects: [
    {
      id: 'activate',
      label: 'Activate (stays on the field)',
      description: 'Once per turn, if a face-up "Crystal Beast" monster(s) you control is destroyed by battle or card effect: You can Special Summon 1 "Crystal Beast" monster from your Deck. You can send this face-up card from the field to the GY, then target 1 "Crystal Beast" card you control and 1 card on the field; return them to the hand.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      resolve: function* () {},
    },
    {
      id: 'recruit',
      label: 'Special Summon 1 Crystal Beast from your Deck (a Crystal Beast was destroyed)',
      description: 'Once per turn, if a face-up "Crystal Beast" monster(s) you control is destroyed by battle or card effect: You can Special Summon 1 "Crystal Beast" monster from your Deck.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['spellTrap'],
      oncePerTurn: true,
      tags: ['summonFromDeck'],
      trigger: (g, card, ev) => card.faceUp && ev.type === 'destroyed' && isCBMonsterCard(g, ev.uid) && g.state.cards[ev.uid]?.owner === card.controller,
      condition: (g, card, ctx) => {
        if (cbInDeck(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Deck.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = cbInDeck(g, ctx.player);
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Crystal Beast monster from your Deck', pool, 1, 1);
        yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Crystal Conclave' });
        g.shuffleDeck(ctx.player);
      },
    },
    {
      id: 'bounce',
      label: 'Send Crystal Conclave to the GY; return 1 Crystal Beast card you control and 1 card on the field to the hand',
      description: 'You can send this face-up card from the field to the GY, then target 1 "Crystal Beast" card you control and 1 card on the field; return them to the hand.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['spellTrap'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Crystal Conclave must be face-up.';
        if (cbCardsYouControl(g, ctx.player).length === 0) return 'You control no Crystal Beast card.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Crystal Conclave is sent to the Graveyard (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'cost', card.uid);
      },
      targets: function* (g, card, ctx) {
        const [a] = yield* g.selectCards(ctx.player, 'Target 1 Crystal Beast card you control', cbCardsYouControl(g, ctx.player), 1, 1);
        const others = allFieldCards(g).filter((u) => u !== a && !g.targetingProtection(g.card(u), ctx.player));
        const [b] = yield* g.selectCards(ctx.player, 'Target 1 other card on the field', others, 1, 1);
        return [a, b];
      },
      resolve: function* (g, card, ctx) {
        for (const t of validTargets(g, ctx, ['monster', 'extraMonster', 'spellTrap', 'field'])) {
          g.log(`${g.name(t)} is returned to the hand.`, 'effect');
          g.toHand(t);
        }
      },
    },
  ],
});
function allFieldCards(g: Game): string[] {
  const out: string[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    out.push(...g.fieldMonsters(p).map((m) => m.uid), ...g.spellTrapCards(p).map((c) => c.uid));
    const f = g.fieldSpell(p);
    if (f) out.push(f.uid);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ultimate Crystal Magic
// ---------------------------------------------------------------------------
function magicMaterials(g: Game, player: PlayerId): string[] {
  const pl = g.player(player);
  return [...pl.hand.filter((u) => isCBMonsterCard(g, u)), ...pl.deck.filter((u) => isCBMonsterCard(g, u)), ...cbMonstersOnField(g, player).filter((m) => m.faceUp).map((m) => m.uid), ...cbInSTZone(g, player).map((c) => c.uid)];
}

registerScript({
  name: 'Ultimate Crystal Magic',
  effects: [
    {
      id: 'activate',
      label: 'Send 7 different Crystal Beasts to the GY; Fusion Summon an Ultimate Crystal Fusion Monster',
      description: 'When your "Crystal Beast" monster is destroyed by battle: You can send 7 "Crystal Beast" cards with different names from your hand, Deck, and/or face-up field to the GY; Special Summon 1 "Ultimate Crystal" Fusion Monster from your Extra Deck. (This is treated as a Fusion Summon.)',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: 'any',
      tags: ['sendFromDeck'],
      condition: (g, card, ctx) => {
        const ev = g.state.windowEvents.find((e) => e.type === 'destroyed' && e.reason === 'battle' && isCBMonsterCard(g, e.uid) && g.state.cards[e.uid]?.owner === ctx.player);
        if (!ev) return 'Ultimate Crystal Magic can only be activated right after your Crystal Beast monster was destroyed by battle.';
        const names = new Set(magicMaterials(g, ctx.player).map((u) => g.name(u)));
        if (names.size < 7) return `You need 7 Crystal Beast cards with different names in your hand, Deck and face-up field (you have ${names.size}).`;
        const fusions = g.player(ctx.player).extra.filter((u) => isUltimateCrystal(g, u) && def(g, u).monsterTypes?.includes('Fusion'));
        if (fusions.length === 0) return 'There is no "Ultimate Crystal" Fusion Monster in your Extra Deck.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = magicMaterials(g, ctx.player);
        const chosen = yield* g.selectCards(ctx.player, 'Send 7 Crystal Beast cards with different names to the Graveyard', pool, 7, 7, 'Cards shown come from your hand, Deck and face-up field. All 7 must have different names.');
        if (new Set(chosen.map((u) => g.name(u))).size !== 7) throw new Error('The 7 Crystal Beast cards must all have different names.');
        for (const u of chosen) {
          g.log(`${g.name(u)} is sent to the Graveyard.`, 'effect');
          g.sendToGraveyard(u, 'material', card.uid);
        }
        g.shuffleDeck(ctx.player);
        const fusions = g.player(ctx.player).extra.filter((u) => isUltimateCrystal(g, u) && def(g, u).monsterTypes?.includes('Fusion'));
        if (fusions.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const [f] = yield* g.selectCards(ctx.player, 'Special Summon 1 Ultimate Crystal Fusion Monster from your Extra Deck', fusions, 1, 1);
        const ok = yield* g.specialSummon(f, ctx.player, { position: 'choose', how: 'by Ultimate Crystal Magic (treated as a Fusion Summon)', proper: true });
        if (ok) g.card(f).fusionSummoned = true;
      },
    },
    {
      id: 'gy',
      label: 'Banish Ultimate Crystal Magic from your GY; place any number of Crystal Beasts from your GY in your Spell & Trap Zone',
      description: 'If a face-up "Ultimate Crystal" monster you control leaves the field because of an opponent\'s card effect: You can banish this card from your GY; place any number of "Crystal Beast" monsters from your GY, face-up in your Spell & Trap Zone as Continuous Spells.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      trigger: (g, card, ev) => {
        if (ev.type !== 'leftField' || ev.linkIndex === undefined) return false;
        const link = g.state.chain[ev.linkIndex];
        const c = g.state.cards[ev.uid];
        return !!link && link.player !== card.owner && !!c && c.owner === card.owner && isUltimateCrystal(g, ev.uid);
      },
      condition: (g, card, ctx) => {
        if (cbInGY(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Graveyard.';
        if (g.freeSpellTrapZones(ctx.player).length === 0) return 'No free Spell & Trap Zone.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Ultimate Crystal Magic is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = cbInGY(g, ctx.player);
        const max = Math.min(pool.length, g.freeSpellTrapZones(ctx.player).length);
        if (max === 0) return;
        const chosen = yield* g.selectCards(ctx.player, 'Place any number of Crystal Beast monsters from your Graveyard in your Spell & Trap Zone', pool, 1, max);
        for (const u of chosen) yield* placeCB(g, u, ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Counter Gem
// ---------------------------------------------------------------------------
registerScript({
  name: 'Counter Gem',
  effects: [
    {
      id: 'activate',
      label: 'Send all cards in your Spell & Trap Zone to the GY; refill it with Crystal Beasts from your GY',
      description: 'Send all cards in your Spell & Trap Zone to the GY. Place as many "Crystal Beast" monsters as possible from your GY face-up in your Spell & Trap Zone as Continuous Spells. During the End Phase of this turn, destroy all "Crystal Beast" cards you control.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      resolve: function* (g, card, ctx) {
        for (const c of g.spellTrapCards(ctx.player)) {
          g.log(`${g.name(c.uid)} is sent to the Graveyard.`, 'effect');
          g.sendToGraveyard(c.uid, 'sent', card.uid);
        }
        const pool = cbInGY(g, ctx.player);
        const n = Math.min(pool.length, g.freeSpellTrapZones(ctx.player).length);
        if (n > 0) {
          const chosen = n === pool.length ? pool : yield* g.selectCards(ctx.player, `Place ${n} Crystal Beast monsters from your Graveyard in your Spell & Trap Zone`, pool, n, n);
          for (const u of chosen) yield* placeCB(g, u, ctx.player);
        }
        g.schedule('END', g.state.turn, 'counterGemDestroy', 'Counter Gem: all Crystal Beast cards its activator controls are destroyed during the End Phase.', card.uid, { player: ctx.player });
      },
    },
  ],
});
import { registerScheduledHandler } from '../../engine/scripts';
registerScheduledHandler('counterGemDestroy', function* (g, s) {
  const player = s.data['player'] as PlayerId;
  const all = cbCardsYouControl(g, player);
  if (all.length) yield* g.destroyByEffect(all, s.uid ?? null);
});

// ---------------------------------------------------------------------------
// Ferret Flames
// ---------------------------------------------------------------------------
registerScript({
  name: 'Ferret Flames',
  effects: [
    {
      id: 'activate',
      label: "Opponent shuffles monsters into the Deck until their total ATK is not above your LP",
      description: "If the combined ATK of all face-up monsters your opponent controls is higher than your LP: Make your opponent shuffle face-up monsters they control into the Deck (their choice), except monsters with 0 ATK, so that the combined ATK of the remaining monsters they control becomes less than or equal to your LP.",
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      condition: (g, card, ctx) => {
        const opp = g.opponent(ctx.player);
        const total = g.fieldMonsters(opp).filter((m) => m.faceUp).reduce((n, m) => n + g.stats(m.uid).atk, 0);
        if (total <= g.player(ctx.player).lp) return `The combined ATK of your opponent's face-up monsters (${total}) is not higher than your LP (${g.player(ctx.player).lp}).`;
        return null;
      },
      resolve: function* (g, card, ctx) {
        const opp = g.opponent(ctx.player);
        const lp = g.player(ctx.player).lp;
        let guard = 0;
        while (guard++ < 10) {
          const faceUp = g.fieldMonsters(opp).filter((m) => m.faceUp);
          const total = faceUp.reduce((n, m) => n + g.stats(m.uid).atk, 0);
          if (total <= lp) break;
          const pool = faceUp.filter((m) => g.stats(m.uid).atk > 0).map((m) => m.uid);
          if (pool.length === 0) break;
          const [u] = yield* g.selectCards(opp, `Ferret Flames: choose a monster to shuffle into your Deck (total ATK ${total} must become ${lp} or less)`, pool, 1, 1);
          g.log(`${g.name(u)} is shuffled into the Deck.`, 'effect');
          g.toDeck(u, 'shuffle');
        }
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Metaverse
// ---------------------------------------------------------------------------
registerScript({
  name: 'Metaverse',
  effects: [
    {
      id: 'activate',
      label: 'Take 1 Field Spell from your Deck: activate it or add it to your hand',
      description: 'Take 1 Field Spell from your Deck, and either activate it or add it to your hand.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.cardType === 'Spell' && d.property === 'Field').length === 0 ? 'There is no Field Spell in your Deck.' : null),
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.cardType === 'Spell' && d.property === 'Field');
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Take 1 Field Spell from your Deck', pool, 1, 1);
        const choice = yield* g.selectOption(ctx.player, `${g.name(u)}: activate it or add it to your hand?`, [
          { id: 'activate', label: 'Activate it (place it face-up in your Field Zone)' },
          { id: 'hand', label: 'Add it to your hand' },
        ]);
        if (choice === 'hand') {
          g.log(`${g.name(u)} is added from the Deck to the hand.`, 'effect');
          g.toHand(u);
        } else {
          const old = g.fieldSpell(ctx.player);
          if (old) {
            g.log(`${g.name(old.uid)} is sent to the Graveyard to make room for the new Field Spell.`, 'rule');
            g.sendToGraveyard(old.uid, 'rule');
          }
          g.placeFieldSpell(u, ctx.player, true);
          g.log(`${g.name(u)} is activated from the Deck by Metaverse.`, 'effect');
          g.fx({ type: 'activate', uid: u, player: ctx.player, what: 'spell' });
        }
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

void isCB;
