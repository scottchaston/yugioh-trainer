import { hasType } from '../../cards';
import { registerScript } from '../../engine/scripts';
import { negateChainLink } from '../../engine/flow';
import type { PlayerId } from '../../engine/types';
import { TRAP_FROM, def, deckCards, graveyardCards, isDragon, respondingToOpponentAttack, targetableMonsters, validTargets } from '../helpers';

// ---------------------------------------------------------------------------
// Compulsory Evacuation Device — Normal Trap
// ---------------------------------------------------------------------------
registerScript({
  name: 'Compulsory Evacuation Device',
  effects: [
    {
      id: 'activate',
      label: 'Return 1 monster on the field to the hand',
      description: 'Target 1 monster on the field; return that target to the hand.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: false,
      condition: (g, card, ctx) => (targetableMonsters(g, ctx.player, 'any').length === 0 ? 'There is no monster on the field to target.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 monster on the field', targetableMonsters(g, ctx.player, 'any'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) {
          g.log('The targeted monster is no longer on the field, so Compulsory Evacuation Device does nothing.', 'rule');
          return;
        }
        g.log(`${g.name(t)} is returned to the hand.`, 'effect');
        g.toHand(t);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Kunai with Chain — Normal Trap (1 or both effects)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Kunai with Chain',
  effects: [
    {
      id: 'activate',
      label: 'Change the attacking monster to Defense Position and/or equip (+500 ATK)',
      description:
        'Activate 1 or both of these effects (simultaneously); ● When an opponent\'s monster declares an attack: Target the attacking monster; change that target to Defense Position. ● Target 1 face-up monster you control; equip this card to that target. It gains 500 ATK.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: false,
      condition: (g, card, ctx) => {
        const canDef = respondingToOpponentAttack(g, ctx.player);
        const canEquip = targetableMonsters(g, ctx.player, 'own', (c) => c.faceUp).length > 0;
        if (!canDef && !canEquip) return 'Kunai with Chain needs either an attacking opponent\'s monster to target (right after the attack is declared) or a face-up monster you control to equip.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const canDef = respondingToOpponentAttack(g, ctx.player);
        const canEquip = targetableMonsters(g, ctx.player, 'own', (c) => c.faceUp).length > 0;
        const attacker = g.state.battle?.attacker;
        const options = [];
        if (canDef) options.push({ id: 'defense', label: `Change the attacking ${g.name(attacker!)} to Defense Position`, description: 'The attack is cancelled because the monster is no longer in Attack Position.' });
        if (canEquip) options.push({ id: 'equip', label: 'Equip Kunai with Chain to one of your monsters (+500 ATK)' });
        if (canDef && canEquip) options.push({ id: 'both', label: 'Activate both effects' });
        const choice = options.length === 1 ? options[0].id : yield* g.selectOption(ctx.player, 'Kunai with Chain: choose which effect(s) to activate', options);
        ctx.data['mode'] = choice;
        if (choice !== 'defense') ctx.data['keepOnField'] = true;
      },
      targets: function* (g, card, ctx) {
        const mode = ctx.data['mode'] as string;
        const targets: string[] = [];
        if (mode === 'defense' || mode === 'both') {
          const attacker = g.state.battle!.attacker!;
          if (g.targetingProtection(g.card(attacker), ctx.player)) throw new Error('The attacking monster cannot be targeted.');
          targets.push(attacker);
          ctx.data['attackerTarget'] = attacker;
        }
        if (mode === 'equip' || mode === 'both') {
          const pool = targetableMonsters(g, ctx.player, 'own', (c) => c.faceUp);
          const [m] = yield* g.selectCards(ctx.player, 'Target 1 face-up monster you control to equip', pool, 1, 1);
          targets.push(m);
          ctx.data['equipTarget'] = m;
        }
        return targets;
      },
      resolve: function* (g, card, ctx) {
        const mode = ctx.data['mode'] as string;
        if (mode === 'defense' || mode === 'both') {
          const a = ctx.data['attackerTarget'] as string;
          const c = g.state.cards[a];
          if (c && g.isMonsterOnField(c)) g.changePositionByEffect(a, 'DEF');
          else g.log('The attacking monster is no longer on the field.', 'rule');
        }
        if (mode === 'equip' || mode === 'both') {
          const m = ctx.data['equipTarget'] as string;
          const c = g.state.cards[m];
          if (c && g.isMonsterOnField(c) && c.faceUp && card.zone === 'spellTrap') {
            card.equippedTo = m;
            g.log(`Kunai with Chain is equipped to ${g.name(m)}, which gains 500 ATK.`, 'effect');
          } else {
            g.log('The equip target is no longer valid, so Kunai with Chain is sent to the Graveyard.', 'rule');
            if (card.zone === 'spellTrap') g.sendToGraveyard(card.uid, 'resolved');
          }
        }
      },
    },
  ],
  modifyStats: (g, self, target) => (self.zone === 'spellTrap' && self.faceUp && self.equippedTo === target.uid ? { atk: 500 } : null),
});

// ---------------------------------------------------------------------------
// Castle of Dragon Souls — Continuous Trap
// ---------------------------------------------------------------------------
registerScript({
  name: 'Castle of Dragon Souls',
  effects: [
    {
      id: 'activate',
      label: 'Activate (stays on the field)',
      description: 'Continuous Trap. Once per turn: banish 1 Dragon from your GY, then target 1 monster you control; it gains 700 ATK until the end of this turn. When this face-up card is sent to the GY: you can Special Summon 1 of your banished Dragons. You can only control 1 "Castle of Dragon Souls".',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      condition: (g, card, ctx) => (g.spellTrapCards(ctx.player).some((c) => c.uid !== card.uid && c.faceUp && g.name(c.uid) === 'Castle of Dragon Souls') ? 'You can only control 1 "Castle of Dragon Souls".' : null),
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      resolve: function* () {
        /* nothing happens on activation itself */
      },
    },
    {
      id: 'boost',
      label: 'Banish 1 Dragon from your GY; 1 monster you control gains 700 ATK this turn',
      description: 'Once per turn: You can banish 1 Dragon monster from your GY, then target 1 monster you control; it gains 700 ATK until the end of this turn (even if this card leaves the field).',
      kind: 'quick',
      spellSpeed: 2,
      from: TRAP_FROM,
      oncePerTurn: true,
      damageStep: 'calc',
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Castle of Dragon Souls must be face-up (activated) first.';
        if (graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon').length === 0) return 'There is no Dragon monster in your Graveyard to banish.';
        if (targetableMonsters(g, ctx.player, 'own').length === 0) return 'You control no monster to target.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon');
        const [c] = yield* g.selectCards(ctx.player, 'Banish 1 Dragon monster from your Graveyard (cost)', pool, 1, 1);
        g.log(`${g.name(c)} is banished as the cost.`, 'effect');
        g.banish(c);
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 monster you control', targetableMonsters(g, ctx.player, 'own'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) {
          g.log('The target is no longer on the field.', 'rule');
          return;
        }
        g.addStatMod(t, 700, 0, 'endOfTurn', 'Castle of Dragon Souls');
        g.log(`${g.name(t)} gains 700 ATK until the end of this turn (now ${g.stats(t).atk}).`, 'effect');
      },
    },
    {
      id: 'revive',
      label: 'Special Summon 1 of your banished Dragon monsters',
      description: 'When this face-up card on the field is sent to the GY: You can target 1 of your banished Dragon monsters; Special Summon that target.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      whenYouCan: true,
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && ev.from === 'spellTrap' && ev.wasFaceUp,
      condition: (g, card, ctx) => {
        const pool = g.player(ctx.player).banished.filter((u) => def(g, u).cardType === 'Monster' && isDragon(g, u));
        if (pool.length === 0) return 'You have no banished Dragon monster to target.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      targets: function* (g, card, ctx) {
        const pool = g.player(ctx.player).banished.filter((u) => def(g, u).cardType === 'Monster' && isDragon(g, u));
        return yield* g.selectCards(ctx.player, 'Target 1 of your banished Dragon monsters', pool, 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['banished']);
        if (!t) return;
        yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Castle of Dragon Souls' });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Fiendish Chain — Continuous Trap
// ---------------------------------------------------------------------------
registerScript({
  name: 'Fiendish Chain',
  effects: [
    {
      id: 'activate',
      label: "Negate an Effect Monster's effects; it cannot attack",
      description: 'Activate this card by targeting 1 Effect Monster on the field; negate the effects of that face-up monster while it is on the field, also that face-up monster cannot attack. When it is destroyed, destroy this card.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      condition: (g, card, ctx) => (targetableMonsters(g, ctx.player, 'any', (c) => c.faceUp && hasType(def(g, c.uid), 'Effect') && !g.isNormalMonster(c.uid)).length === 0 ? 'There is no face-up Effect Monster on the field to target.' : null),
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      targets: function* (g, card, ctx) {
        const pool = targetableMonsters(g, ctx.player, 'any', (c) => c.faceUp && hasType(def(g, c.uid), 'Effect') && !g.isNormalMonster(c.uid));
        return yield* g.selectCards(ctx.player, 'Target 1 face-up Effect Monster on the field', pool, 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t || !g.card(t).faceUp) {
          g.log('The target is no longer face-up on the field, so Fiendish Chain does nothing.', 'rule');
          return;
        }
        const m = g.card(t);
        m.flags['effectsNegated'] = true;
        m.flags['negatedBy'] = 'Fiendish Chain';
        m.flags['cannotAttack'] = true;
        m.flags['cannotAttackReason'] = 'Fiendish Chain';
        g.link(card.uid, t);
        g.fx({ type: 'negate', uid: t });
        g.log(`${g.name(t)}'s effects are negated and it cannot attack while Fiendish Chain remains on the field.`, 'effect');
      },
    },
    {
      id: 'release',
      label: 'Fiendish Chain left the field: its target is freed',
      description: 'When Fiendish Chain leaves the field, the monster it was negating regains its effects.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard', 'hand', 'deck', 'banished'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'leftField' && ev.uid === card.uid && !!g.linkedMonster(card.uid),
      resolve: function* (g, card) {
        const t = g.linkedMonster(card.uid);
        g.unlink(card.uid);
        if (!t) return;
        const m = g.state.cards[t];
        if (m && g.isMonsterOnField(m)) {
          delete m.flags['effectsNegated'];
          delete m.flags['negatedBy'];
          delete m.flags['cannotAttack'];
          delete m.flags['cannotAttackReason'];
          g.log(`${g.name(t)} regains its effects because Fiendish Chain left the field.`, 'rule');
        }
      },
    },
    {
      id: 'selfDestroy',
      label: 'Destroy Fiendish Chain (its target was destroyed)',
      description: 'When the negated monster is destroyed, destroy this card.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['spellTrap'],
      mandatory: true,
      trigger: (g, card, ev) => (ev.type === 'destroyed' && ev.uid === g.linkedMonster(card.uid)) || (ev.type === 'leftField' && ev.uid === g.linkedMonster(card.uid)),
      resolve: function* (g, card, ctx) {
        const t = g.linkedMonster(card.uid);
        g.unlink(card.uid);
        const wasDestroyed = ctx.event?.type === 'destroyed';
        if (wasDestroyed && card.zone === 'spellTrap') yield* g.destroyByEffect([card.uid], card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Damage Condenser — Normal Trap
// ---------------------------------------------------------------------------
registerScript({
  name: 'Damage Condenser',
  effects: [
    {
      id: 'activate',
      label: 'Discard 1 card; Special Summon a monster from your Deck with ATK ≤ the battle damage you took',
      description: 'When you take battle damage: Discard 1 card; Special Summon 1 monster from your Deck with ATK less than or equal to the battle damage you took, in Attack Position.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: 'any',
      condition: (g, card, ctx) => {
        const ev = g.state.windowEvents.find((e) => e.type === 'battleDamage' && e.player === ctx.player);
        if (!ev) return 'Damage Condenser can only be activated right after you take battle damage.';
        if (g.player(ctx.player).hand.length === 0) return 'You need a card in your hand to discard as the cost.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const ev = g.state.windowEvents.find((e) => e.type === 'battleDamage' && e.player === ctx.player);
        ctx.data['damage'] = ev && ev.type === 'battleDamage' ? ev.amount : 0;
        const [c] = yield* g.selectCards(ctx.player, 'Discard 1 card (cost)', g.player(ctx.player).hand.slice(), 1, 1);
        g.log(`${g.playerName(ctx.player)} discards ${g.name(c)} as the cost.`, 'effect');
        g.sendToGraveyard(c, 'discard', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const dmg = ctx.data['damage'] as number;
        const pool = deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && (d.atk ?? 0) <= dmg && !hasType(d, 'Fusion') && !hasType(d, 'Synchro'));
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) {
          g.log(`There is no monster with ${dmg} or less ATK in the Deck (or no free zone), so nothing is Special Summoned.`, 'rule');
          return;
        }
        const [chosen] = yield* g.selectCards(ctx.player, `Special Summon 1 monster with ${dmg} or less ATK from your Deck`, pool, 1, 1);
        yield* g.specialSummon(chosen, ctx.player, { position: 'ATK', how: 'by Damage Condenser' });
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Call of the Haunted — Continuous Trap
// ---------------------------------------------------------------------------
registerScript({
  name: 'Call of the Haunted',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon 1 monster from your Graveyard in Attack Position',
      description: 'Activate this card by targeting 1 monster in your GY; Special Summon that target in Attack Position. When this card leaves the field, destroy that monster. When that monster is destroyed, destroy this card.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      condition: (g, card, ctx) => {
        if (cothTargets(g, ctx.player).length === 0) return 'There is no monster in your Graveyard that can be Special Summoned.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 monster in your Graveyard', cothTargets(g, ctx.player), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (!t) {
          g.log('The target is no longer in the Graveyard, so nothing is Special Summoned.', 'rule');
          return;
        }
        const ok = yield* g.specialSummon(t, ctx.player, { position: 'ATK', how: 'by Call of the Haunted' });
        if (ok && card.zone === 'spellTrap') g.link(card.uid, t);
      },
    },
    {
      id: 'destroyMonster',
      label: 'Call of the Haunted left the field: destroy its monster',
      description: 'When this card leaves the field, destroy that monster.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard', 'hand', 'deck', 'banished'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'leftField' && ev.uid === card.uid && !!g.linkedMonster(card.uid),
      resolve: function* (g, card) {
        const t = g.linkedMonster(card.uid);
        g.unlink(card.uid);
        if (!t) return;
        const m = g.state.cards[t];
        if (m && g.isMonsterOnField(m)) {
          g.log(`Call of the Haunted left the field, so ${g.name(t)} is destroyed.`, 'effect');
          yield* g.destroyByEffect([t], card.uid);
        }
      },
    },
    {
      id: 'selfDestroy',
      label: 'Destroy Call of the Haunted (its monster was destroyed)',
      description: 'When that monster is destroyed, destroy this card.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['spellTrap'],
      mandatory: true,
      trigger: (g, card, ev) => (ev.type === 'destroyed' && ev.uid === g.linkedMonster(card.uid)) || (ev.type === 'leftField' && ev.uid === g.linkedMonster(card.uid)),
      resolve: function* (g, card, ctx) {
        g.unlink(card.uid);
        if (ctx.event?.type === 'destroyed' && card.zone === 'spellTrap') {
          g.log(`The monster Summoned by Call of the Haunted was destroyed, so Call of the Haunted is destroyed.`, 'effect');
          yield* g.destroyByEffect([card.uid], card.uid);
        }
      },
    },
  ],
});

function cothTargets(g: Parameters<typeof deckCards>[0], player: PlayerId): string[] {
  return graveyardCards(g, player, (d) => d.cardType === 'Monster').filter((u) => {
    const c = g.card(u);
    const d = def(g, u);
    const extra = hasType(d, 'Fusion') || hasType(d, 'Synchro') || hasType(d, 'Xyz') || hasType(d, 'Link');
    if (extra && !c.properlySummoned) return false;
    if (g.targetingProtection(c, player)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Champion's Vigilance — Counter Trap
// ---------------------------------------------------------------------------
registerScript({
  name: "Champion's Vigilance",
  effects: [
    {
      id: 'activate',
      label: 'Negate a Summon or a Spell/Trap activation, and destroy that card',
      description: 'If you control a Level 7 or higher Normal Monster, when a monster would be Summoned OR a Spell/Trap Card is activated: Negate the Summon or activation, and if you do, destroy that card. (Counter Trap, Spell Speed 3.)',
      kind: 'activate',
      spellSpeed: 3,
      from: TRAP_FROM,
      respondsToSummon: true,
      damageStep: 'any',
      condition: (g, card, ctx) => {
        if (!g.fieldMonsters(ctx.player).some((m) => m.faceUp && (def(g, m.uid).level ?? 0) >= 7 && g.isNormalMonster(m.uid))) {
          return "You must control a face-up Level 7 or higher Normal Monster to activate Champion's Vigilance.";
        }
        const attempt = g.state.summonAttempt;
        if (attempt && !attempt.negated) return null;
        const chain = g.state.chain;
        const last = chain[chain.length - 1];
        if (last && !last.negated && last.effectId === 'activate' && def(g, last.uid).cardType !== 'Monster') return null;
        return "Champion's Vigilance can only be activated when a monster is being Summoned or a Spell/Trap Card is activated.";
      },
      cost: function* (g, card, ctx) {
        const attempt = g.state.summonAttempt;
        if (attempt && !attempt.negated) {
          ctx.data['mode'] = 'summon';
          ctx.data['summonUid'] = attempt.uid;
        } else {
          ctx.data['mode'] = 'chain';
          ctx.data['linkIndex'] = g.state.chain.length - 1;
        }
      },
      resolve: function* (g, card, ctx) {
        if (ctx.data['mode'] === 'summon') {
          const attempt = g.state.summonAttempt;
          if (attempt && attempt.uid === ctx.data['summonUid']) {
            attempt.negated = true;
            g.fx({ type: 'negate', uid: attempt.uid });
            g.log(`The Summon of ${g.name(attempt.uid)} is negated by Champion's Vigilance.`, 'effect');
          }
        } else {
          yield* negateChainLink(g, ctx.data['linkIndex'] as number, card.uid, true);
        }
      },
    },
  ],
});
