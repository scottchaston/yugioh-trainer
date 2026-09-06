/**
 * The Crimson King (SDCK): Trap Cards. (Fiendish Chain is shared with the Blue-Eyes deck.)
 */
import { registerScript, registerScheduledHandler } from '../../engine/scripts';
import { negateChainLink } from '../../engine/flow';
import type { Game } from '../../engine/game';
import type { PlayerId } from '../../engine/types';
import { TRAP_FROM, def, deckCards, graveyardCards, validTargets } from '../helpers';
import { addToHand, banishByEffect, lastChainLink, sendByEffect, summonCard, targetableCards, targetableMonstersOf } from '../shared';
import { RDA, controlsRDA, isDarkDragonSynchro, isRDA, isResonator, isTuner, synchrosOnField } from './common';

// ---------------------------------------------------------------------------
// Fiendish Golem
// ---------------------------------------------------------------------------
registerScript({
  name: 'Fiendish Golem',
  effects: [
    {
      id: 'activate',
      label: 'Banish 1 monster with 2000+ ATK until the End Phase of the next turn (then you can Set Fiendish Chain)',
      description: 'Target 1 monster on the field with 2000 or more ATK; banish it (until the End Phase of the next turn), then if you activated this card while you controlled "Red Dragon Archfiend" or a Synchro Monster that mentions it, you can Set 1 "Fiendish Chain" directly from your Deck or GY.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      condition: (g, card, ctx) => (targetableMonstersOf(g, ctx.player, 'any', card.uid, (c) => c.faceUp && g.stats(c.uid).atk >= 2000).length ? null : 'There is no face-up monster with 2000 or more ATK to target.'),
      cost: function* (g, card, ctx) {
        ctx.data['hadRDA'] = controlsRDA(g, ctx.player);
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 monster on the field with 2000 or more ATK', targetableMonstersOf(g, ctx.player, 'any', card.uid, (c) => c.faceUp && g.stats(c.uid).atk >= 2000), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) return;
        const owner = g.card(t).controller;
        if (banishByEffect(g, t, card.uid)) {
          g.schedule('END', g.state.turn + 1, 'returnBanished', `End Phase: ${g.name(t)} returns to the field (Fiendish Golem).`, t, { player: owner });
        }
        if (!ctx.data['hadRDA']) return;
        const pool = [...deckCards(g, ctx.player, (d) => d.name === 'Fiendish Chain'), ...graveyardCards(g, ctx.player, (d) => d.name === 'Fiendish Chain')];
        if (pool.length === 0 || g.freeSpellTrapZones(ctx.player).length === 0) return;
        const yes = yield* g.confirm(ctx.player, 'Set 1 "Fiendish Chain" from your Deck or GY?');
        if (!yes) return;
        const [u] = yield* g.selectCards(ctx.player, 'Choose the Fiendish Chain to Set', pool, 1, 1);
        yield* g.setSpellTrapFromAnywhere(u, ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Red Zone (Continuous)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Red Zone',
  effects: [
    {
      id: 'activate',
      label: 'Activate (stays on the field)',
      description: 'Continuous Trap: destroy a card when your opponent activates a card or effect while you control "Red Dragon Archfiend" or a Synchro that mentions it; revive a banished DARK Dragon Synchro Monster.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      resolve: function* () {},
    },
    {
      id: 'destroy',
      label: 'Destroy 1 card on the field (your opponent activated a card or effect)',
      description: 'When your opponent activates a card or effect while you control "Red Dragon Archfiend" or a Synchro Monster that mentions it: You can target 1 card on the field; destroy it.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['spellTrap'],
      hardOncePerTurn: true,
      damageStep: 'any',
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Red Zone must be face-up.';
        const last = lastChainLink(g);
        if (!last || last.player === ctx.player) return 'This effect responds to your opponent activating a card or effect.';
        if (!controlsRDA(g, ctx.player)) return 'You must control "Red Dragon Archfiend" or a Synchro Monster that mentions it.';
        if (targetableCards(g, ctx.player, 'any', card.uid).length === 0) return 'There is no card on the field to target.';
        return null;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 card on the field', targetableCards(g, ctx.player, 'any', card.uid), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster', 'spellTrap', 'field']);
        if (t) yield* g.destroyByEffect([t], card.uid);
      },
    },
    {
      id: 'revive',
      label: 'Special Summon 1 of your banished DARK Dragon Synchro Monsters',
      description: 'You can target 1 of your banished DARK Dragon Synchro Monsters; Special Summon it.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['spellTrap'],
      hardOncePerTurn: true,
      condition: (g, card, ctx) => (!card.faceUp ? 'Red Zone must be face-up.' : g.player(ctx.player).banished.filter((u) => isDarkDragonSynchro(g, u) && g.card(u).properlySummoned).length === 0 ? 'You have no banished DARK Dragon Synchro Monster (that was properly Summoned).' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 of your banished DARK Dragon Synchro Monsters', g.player(ctx.player).banished.filter((u) => isDarkDragonSynchro(g, u) && g.card(u).properlySummoned), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['banished']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Red Zone' });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// King's Synchro
// ---------------------------------------------------------------------------
registerScript({
  name: "King's Synchro",
  effects: [
    {
      id: 'activate',
      label: 'Negate the attack on your Synchro Monster, then you can Synchro Summon a bigger Synchro from banished materials',
      description: "When your opponent's monster declares an attack on a Synchro Monster you control: Negate the attack, then you can banish that Synchro Monster and 1 Tuner from your GY, and if you do, Special Summon from your Extra Deck 1 Synchro Monster whose Level equals the total Levels the banished monsters had. (This is treated as a Synchro Summon.)",
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      condition: (g, card, ctx) => {
        const b = g.state.battle;
        if (!b || !b.attacker || !b.target || b.damageStepStage || g.card(b.attacker).controller === ctx.player) return "This card responds to an opponent's monster attacking a Synchro Monster you control.";
        if (!g.isSynchroMonster(b.target) || g.card(b.target).controller !== ctx.player) return 'The attacked monster is not a Synchro Monster you control.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['target'] = g.state.battle?.target;
      },
      resolve: function* (g, card, ctx) {
        const b = g.state.battle;
        const mine = ctx.data['target'] as string | undefined;
        if (!b || !b.attacker || b.target !== mine) return g.log('The attack is no longer happening.', 'rule');
        b.attackNegated = true;
        g.log(`The attack of ${g.name(b.attacker)} is negated.`, 'effect');
        const tuners = g.player(ctx.player).graveyard.filter((u) => isTuner(g, u));
        const synchro = mine && g.state.cards[mine] && g.isMonsterOnField(g.card(mine)) ? mine : null;
        if (!synchro || tuners.length === 0) return;
        const options: { tuner: string; target: string }[] = [];
        for (const t of tuners) {
          const total = g.levelOf(synchro) + g.levelOf(t);
          for (const e of g.player(ctx.player).extra) if (g.isSynchroMonster(e) && g.levelOf(e) === total && !g.extraDeckSummonProblem(ctx.player, e)) options.push({ tuner: t, target: e });
        }
        if (options.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return g.log('No Synchro Monster in the Extra Deck matches the total Levels, so nothing more happens.', 'rule');
        const yes = yield* g.confirm(ctx.player, `Banish ${g.name(synchro)} and 1 Tuner from your GY to Special Summon a Synchro Monster with their total Level?`);
        if (!yes) return;
        const [tuner] = yield* g.selectCards(ctx.player, 'Banish 1 Tuner from your Graveyard', [...new Set(options.map((o) => o.tuner))], 1, 1);
        const targets = options.filter((o) => o.tuner === tuner).map((o) => o.target);
        const [e] = yield* g.selectCards(ctx.player, `Special Summon which Level ${g.levelOf(synchro) + g.levelOf(tuner)} Synchro Monster?`, [...new Set(targets)], 1, 1);
        g.log(`${g.name(synchro)} and ${g.name(tuner)} are banished.`, 'effect');
        g.banish(synchro, true, card.uid);
        g.banish(tuner, true, card.uid);
        yield* g.specialSummon(e, ctx.player, { position: 'choose', how: 'synchro', proper: true });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Red Reign
// ---------------------------------------------------------------------------
registerScript({
  name: 'Red Reign',
  effects: [
    {
      id: 'activate',
      label: 'Banish all monsters except those with the highest Level; the rest are unaffected by other effects this turn',
      description: 'If you control a Level 8 or higher Synchro Monster: Banish all monsters on the field, except the monster(s) with the highest Level, also the remaining face-up monsters on the field are unaffected by other card effects, except their own, until the end of this turn.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      condition: (g, card, ctx) => (synchrosOnField(g, ctx.player, 8).length === 0 ? 'You do not control a Level 8 or higher Synchro Monster.' : null),
      resolve: function* (g, card) {
        const all = ([0, 1] as PlayerId[]).flatMap((p) => g.fieldMonsters(p));
        const max = Math.max(...all.map((m) => g.levelOf(m.uid)));
        for (const m of all) if (g.levelOf(m.uid) < max) banishByEffect(g, m.uid, card.uid);
        for (const m of all) {
          if (g.isMonsterOnField(m) && m.faceUp) {
            m.flags['unaffectedByOtherEffectsUntil'] = g.state.turn;
            g.log(`${g.name(m.uid)} is unaffected by other card effects until the end of this turn.`, 'effect');
          }
        }
      },
    },
    {
      id: 'recover',
      label: 'Add this card from your GY to your hand (a DARK Dragon Synchro was Synchro Summoned)',
      description: 'If a DARK Dragon Synchro Monster is Synchro Summoned to your field while this card is in your GY: You can add this card to your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      hardOncePerTurn: true,
      tags: ['addFromGY'],
      trigger: (g, card, ev) => ev.type === 'summon' && ev.how === 'synchro' && ev.player === card.owner && isDarkDragonSynchro(g, ev.uid),
      resolve: function* (g, card) {
        if (card.zone === 'graveyard') addToHand(g, card.uid, 'Red Reign');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Time to Stand Up
// ---------------------------------------------------------------------------
registerScript({
  name: 'Time to Stand Up',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon up to 2 Resonators and/or Level 1 Dragons from your Deck',
      description: 'If a Dragon Synchro Monster is on the field: Special Summon up to 2 monsters, that are "Resonator" monsters and/or Level 1 Dragon monsters, from your Deck.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      hardOncePerTurn: true,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => {
        if (!([0, 1] as PlayerId[]).some((p) => g.fieldMonsters(p).some((m) => m.faceUp && g.isSynchroMonster(m.uid) && g.raceOf(m.uid) === 'Dragon'))) return 'There is no Dragon Synchro Monster on the field.';
        if (standUpPool(g, ctx.player).length === 0) return 'There is no "Resonator" monster or Level 1 Dragon in your Deck.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = standUpPool(g, ctx.player);
        const n = Math.min(2, pool.length, g.freeMonsterZones(ctx.player).length);
        if (n === 0) return;
        const chosen = yield* g.selectCards(ctx.player, `Special Summon up to ${n} "Resonator" monsters and/or Level 1 Dragons from your Deck`, pool, 1, n);
        for (const u of chosen) yield* summonCard(g, u, ctx.player, 'by Time to Stand Up');
      },
    },
    {
      id: 'negate',
      label: 'Banish this card from your GY; negate a monster effect and give a Synchro Monster 2000 ATK until the end of the next turn',
      description: 'When a monster effect is activated, while you control a Level 10 or higher DARK Dragon Synchro Monster: You can banish this card from your GY; negate that effect, and if you do, 1 Synchro Monster you control gains 2000 ATK until the end of the next turn.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['graveyard'],
      hardOncePerTurn: true,
      damageStep: 'any',
      tags: ['banishFromGY'],
      condition: (g, card, ctx) => {
        const last = lastChainLink(g);
        if (!last || last.negated || def(g, last.uid).cardType !== 'Monster' || last.effectId === 'activate') return 'This effect responds to the activation of a monster effect.';
        if (!g.fieldMonsters(ctx.player).some((m) => m.faceUp && isDarkDragonSynchro(g, m.uid) && g.levelOf(m.uid) >= 10)) return 'You must control a Level 10 or higher DARK Dragon Synchro Monster.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['linkIndex'] = g.state.chain.length - 1;
        g.log('Time to Stand Up is banished from the Graveyard (cost).', 'effect');
        g.banish(card.uid);
      },
      resolve: function* (g, card, ctx) {
        const idx = ctx.data['linkIndex'] as number;
        const link = g.state.chain[idx];
        if (!link || link.negated) return;
        yield* negateChainLink(g, idx, card.uid, 'effect');
        if (!link.negated) return;
        const pool = synchrosOnField(g, ctx.player).map((m) => m.uid);
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Choose 1 Synchro Monster you control to gain 2000 ATK until the end of the next turn', pool, 1, 1);
        g.addStatMod(u, 2000, 0, 'endOfNextTurn', 'Time to Stand Up');
        g.log(`${g.name(u)} gains 2000 ATK until the end of the next turn (now ${g.stats(u).atk}).`, 'effect');
      },
    },
  ],
});
function standUpPool(g: Game, player: PlayerId): string[] {
  return g.player(player).deck.filter((u) => isResonator(g, u) || (def(g, u).cardType === 'Monster' && def(g, u).race === 'Dragon' && def(g, u).level === 1));
}

// ---------------------------------------------------------------------------
// Powerful Rebirth (Continuous)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Powerful Rebirth',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon 1 Level 4 or lower monster from your GY (+1 Level, +100 ATK/DEF)',
      description: 'Activate this card by targeting 1 Level 4 or lower monster in your GY; Special Summon that target. Increase its Level by 1 and ATK/DEF by 100. When that monster is destroyed, destroy this card.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      tags: ['summonFromGY'],
      condition: (g, card, ctx) => (rebirthPool(g, ctx.player).length === 0 ? 'There is no Level 4 or lower monster in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 Level 4 or lower monster in your Graveyard', rebirthPool(g, ctx.player), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (!t) {
          if (card.zone === 'spellTrap') g.sendToGraveyard(card.uid, 'rule');
          return;
        }
        const ok = yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Powerful Rebirth' });
        if (!ok) {
          if (card.zone === 'spellTrap') g.sendToGraveyard(card.uid, 'rule');
          return;
        }
        g.card(t).flags['levelMod'] = 1;
        g.addStatMod(t, 100, 100, 'permanent', 'Powerful Rebirth');
        g.log(`${g.name(t)} is now Level ${g.levelOf(t)} with ${g.stats(t).atk} ATK / ${g.stats(t).def} DEF.`, 'effect');
        if (card.zone === 'spellTrap') g.link(card.uid, t);
      },
    },
    {
      id: 'selfDestroy',
      label: 'Powerful Rebirth is destroyed (its monster was destroyed)',
      description: 'When that monster is destroyed, destroy this card.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['spellTrap'],
      mandatory: true,
      trigger: (g, card, ev) => (ev.type === 'destroyed' || ev.type === 'leftField') && ev.uid === g.linkedMonster(card.uid),
      resolve: function* (g, card) {
        g.unlink(card.uid);
        if (card.zone === 'spellTrap') yield* g.destroyByEffect([card.uid], card.uid);
      },
    },
  ],
});
function rebirthPool(g: Game, player: PlayerId): string[] {
  return graveyardCards(g, player, (d, c) => d.cardType === 'Monster' && (d.level ?? 0) <= 4 && (d.level ?? 0) > 0 && (!g.isSynchroMonster(c.uid) || c.properlySummoned));
}

// ---------------------------------------------------------------------------
// Assault Mode Activate
// ---------------------------------------------------------------------------
registerScript({
  name: 'Assault Mode Activate',
  effects: [
    {
      id: 'activate',
      label: 'Tribute 1 Synchro Monster; Special Summon its "/Assault Mode" form from your Deck',
      description: 'Tribute 1 Synchro Monster; Special Summon 1 "/Assault Mode" monster, whose name includes the Tributed monster\'s name, from your Deck in Attack Position.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => (assaultPairs(g, ctx.player).length === 0 ? 'You need a Synchro Monster to Tribute whose "/Assault Mode" form is in your Deck (e.g. Red Dragon Archfiend).' : null),
      cost: function* (g, card, ctx) {
        const pairs = assaultPairs(g, ctx.player);
        const [s] = yield* g.selectCards(ctx.player, 'Tribute 1 Synchro Monster (cost)', [...new Set(pairs.map((p) => p.synchro))], 1, 1);
        ctx.data['name'] = g.isNamed(s, RDA) ? RDA : g.name(s);
        g.log(`${g.name(s)} is Tributed (cost).`, 'effect');
        g.sendToGraveyard(s, 'tribute', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const name = ctx.data['name'] as string;
        const pool = deckCards(g, ctx.player, (d) => d.name.includes('/Assault Mode') && d.name.includes(name));
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        yield* summonCard(g, pool[0], ctx.player, 'by Assault Mode Activate', 'ATK');
      },
    },
  ],
});
function assaultPairs(g: Game, player: PlayerId): { synchro: string; name: string }[] {
  const out: { synchro: string; name: string }[] = [];
  for (const m of g.fieldMonsters(player)) {
    if (!m.faceUp || !g.isSynchroMonster(m.uid)) continue;
    const names = [g.name(m.uid), ...(g.isNamed(m.uid, RDA) ? [RDA] : [])];
    for (const n of names) if (deckCards(g, player, (d) => d.name.includes('/Assault Mode') && d.name.includes(n)).length) out.push({ synchro: m.uid, name: n });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Terrors of the Overroot
// ---------------------------------------------------------------------------
registerScript({
  name: 'Terrors of the Overroot',
  effects: [
    {
      id: 'activate',
      label: "Send 1 card your opponent controls to the GY, then Set a card from their GY to their field",
      description: "Target 1 card your opponent controls and 1 card in their GY; send that card on the field to the GY, and if you do, Set the other card from the GY to your opponent's field.",
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      hardOncePerTurn: true,
      condition: (g, card, ctx) => (targetableCards(g, ctx.player, 'opponent', card.uid).length === 0 ? 'Your opponent controls no card to target.' : g.player(g.opponent(ctx.player)).graveyard.filter((u) => canBeSet(g, u)).length === 0 ? "Your opponent's Graveyard has no card that could be Set." : null),
      targets: function* (g, card, ctx) {
        const opp = g.opponent(ctx.player);
        const [a] = yield* g.selectCards(ctx.player, 'Target 1 card your opponent controls', targetableCards(g, ctx.player, 'opponent', card.uid), 1, 1);
        const [b] = yield* g.selectCards(ctx.player, "Target 1 card in your opponent's Graveyard to Set to their field", g.player(opp).graveyard.filter((u) => canBeSet(g, u)), 1, 1);
        return [a, b];
      },
      resolve: function* (g, card, ctx) {
        const [a, b] = ctx.targets;
        const opp = g.opponent(ctx.player);
        const ca = g.state.cards[a];
        if (!ca || !g.isOnField(ca)) return g.log('The targeted card is no longer on the field.', 'rule');
        if (!sendByEffect(g, a, card.uid)) return;
        const cb = g.state.cards[b];
        if (!cb || cb.zone !== 'graveyard') return;
        if (def(g, b).cardType === 'Monster') {
          if (g.freeMonsterZones(opp).length === 0) return g.log('Your opponent has no free Monster Zone, so the monster is not Set.', 'rule');
          const zone = yield* g.chooseMonsterZone(opp, `Choose a Monster Zone to Set ${g.name(b)}`);
          g.placeMonster(b, opp, zone, 'DEF', false);
          g.log(`${g.name(b)} is Set face-down in ${g.playerName(opp)}'s Monster Zone.`, 'effect');
        } else {
          yield* g.setSpellTrapFromAnywhere(b, opp);
        }
      },
    },
  ],
});
function canBeSet(g: Game, uid: string): boolean {
  const d = def(g, uid);
  if (d.cardType === 'Monster') return !g.isLinkMonster(uid) && !g.isSynchroMonster(uid) && !g.isXyzMonster(uid) && !d.monsterTypes?.includes('Fusion');
  return d.property !== 'Field';
}
void isRDA;
