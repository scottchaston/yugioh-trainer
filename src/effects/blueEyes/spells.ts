import { hasType } from '../../cards';
import { registerScript, registerScheduledHandler } from '../../engine/scripts';
import type { PlayerId } from '../../engine/types';
import { SPELL_FROM, def, deckCards, graveyardCards, handCards, isDragon, targetableMonsters, validTargets } from '../helpers';

// ---------------------------------------------------------------------------
// Silver's Cry — Quick-Play Spell
// ---------------------------------------------------------------------------
registerScript({
  name: "Silver's Cry",
  effects: [
    {
      id: 'activate',
      label: 'Special Summon 1 Dragon Normal Monster from your Graveyard',
      description: 'Target 1 Dragon Normal Monster in your GY; Special Summon that target. You can only activate 1 "Silver\'s Cry" per turn.',
      kind: 'activate',
      spellSpeed: 2,
      from: SPELL_FROM,
      hardOncePerTurn: true,
      tags: ['summonFromGY'],
      condition: (g, card, ctx) => {
        const targets = graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon').filter((u) => g.isNormalMonster(u));
        if (targets.length === 0) return 'There is no Dragon Normal Monster in your Graveyard to target.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'You have no empty Monster Zone to Special Summon into.';
        return null;
      },
      targets: function* (g, card, ctx) {
        const pool = graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon').filter((u) => g.isNormalMonster(u));
        return yield* g.selectCards(ctx.player, 'Target 1 Dragon Normal Monster in your Graveyard', pool, 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (!t) {
          g.log("Silver's Cry's target is no longer in the Graveyard, so it does nothing.", 'rule');
          return;
        }
        yield* g.specialSummon(t, ctx.player, { position: 'choose', how: "by Silver's Cry" });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Monster Reborn — Normal Spell
// ---------------------------------------------------------------------------
registerScript({
  name: 'Monster Reborn',
  effects: [
    {
      id: 'activate',
      label: 'Special Summon 1 monster from either Graveyard',
      description: 'Target 1 monster in either GY; Special Summon it.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      tags: ['summonFromGY'],
      condition: (g, card, ctx) => {
        if (rebornTargets(g, ctx.player).length === 0) return 'There is no monster in either Graveyard that can be Special Summoned.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'You have no empty Monster Zone to Special Summon into.';
        return null;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 monster in either Graveyard', rebornTargets(g, ctx.player), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (!t) {
          g.log("Monster Reborn's target is no longer in the Graveyard, so it does nothing.", 'rule');
          return;
        }
        yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Monster Reborn' });
      },
    },
  ],
});

function rebornTargets(g: Parameters<typeof graveyardCards>[0], player: PlayerId): string[] {
  const out: string[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    for (const u of graveyardCards(g, p, (d) => d.cardType === 'Monster')) {
      const c = g.card(u);
      const d = def(g, u);
      const extra = hasType(d, 'Fusion') || hasType(d, 'Synchro') || hasType(d, 'Xyz') || hasType(d, 'Link');
      if (extra && !c.properlySummoned) continue;
      if (g.script(u)?.cannotNormalSummon && (g.script(u) as { cannotBeRevived?: boolean }).cannotBeRevived) continue;
      out.push(u);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dragon Shrine — Normal Spell
// ---------------------------------------------------------------------------
registerScript({
  name: 'Dragon Shrine',
  effects: [
    {
      id: 'activate',
      label: 'Send 1 Dragon from your Deck to the Graveyard',
      description:
        'Send 1 Dragon monster from your Deck to the GY, then, if that monster in your GY is a Dragon Normal Monster, you can send 1 more Dragon monster from your Deck to the GY. You can only activate 1 "Dragon Shrine" per turn.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      hardOncePerTurn: true,
      tags: ['sendFromDeck'],
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon').length === 0 ? 'There is no Dragon monster in your Deck.' : null),
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon');
        if (pool.length === 0) {
          g.log('There is no Dragon monster in the Deck, so Dragon Shrine does nothing.', 'rule');
          return;
        }
        const [first] = yield* g.selectCards(ctx.player, 'Send 1 Dragon monster from your Deck to the Graveyard', pool, 1, 1);
        g.log(`${g.name(first)} is sent from the Deck to the Graveyard.`, 'effect');
        g.sendToGraveyard(first, 'sent', card.uid);
        if (g.isNormalMonster(first) && isDragon(g, first)) {
          const pool2 = deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon');
          if (pool2.length === 0) {
            g.log(`${g.name(first)} is a Dragon Normal Monster, but there is no other Dragon in the Deck to send.`, 'rule');
          } else {
            g.log(`Because ${g.name(first)} is a Dragon Normal Monster, Dragon Shrine permits ${g.playerName(ctx.player)} to send another Dragon monster from the Deck to the Graveyard.`, 'rule');
            const yes = yield* g.confirm(ctx.player, 'Send 1 more Dragon monster from your Deck to the Graveyard?');
            if (yes) {
              const [second] = yield* g.selectCards(ctx.player, 'Send 1 more Dragon monster from your Deck to the Graveyard', pool2, 1, 1);
              g.log(`${g.name(second)} is sent from the Deck to the Graveyard.`, 'effect');
              g.sendToGraveyard(second, 'sent', card.uid);
            }
          }
        } else {
          g.log(`${g.name(first)} is not a Normal Monster, so no second Dragon can be sent.`, 'rule');
        }
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Trade-In / Cards of Consonance — discard as cost, draw 2
// ---------------------------------------------------------------------------
registerScript({
  name: 'Trade-In',
  effects: [
    {
      id: 'activate',
      label: 'Discard 1 Level 8 monster; draw 2 cards',
      description: 'Discard 1 Level 8 monster; draw 2 cards. (The discard is a cost, paid when you activate the card.)',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (handCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 8).length === 0) return 'You need a Level 8 monster in your hand to discard as the cost.';
        if (g.player(ctx.player).deck.length < 2) return 'You need at least 2 cards in your Deck to draw.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = handCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 8);
        const [c] = yield* g.selectCards(ctx.player, 'Discard 1 Level 8 monster (cost)', pool, 1, 1);
        g.log(`${g.playerName(ctx.player)} discards ${g.name(c)} as the cost.`, 'effect');
        g.sendToGraveyard(c, 'discard', card.uid);
      },
      resolve: function* (g, card, ctx) {
        g.draw(ctx.player, 2, 'draws');
      },
    },
  ],
});

registerScript({
  name: 'Cards of Consonance',
  effects: [
    {
      id: 'activate',
      label: 'Discard 1 Dragon Tuner with 1000 or less ATK; draw 2 cards',
      description: 'Discard 1 Dragon Tuner with 1000 or less ATK; draw 2 cards. (The discard is a cost.)',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (handCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon' && hasType(d, 'Tuner') && (d.atk ?? 0) <= 1000).length === 0) {
          return 'You need a Dragon Tuner monster with 1000 or less ATK in your hand to discard as the cost.';
        }
        if (g.player(ctx.player).deck.length < 2) return 'You need at least 2 cards in your Deck to draw.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = handCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon' && hasType(d, 'Tuner') && (d.atk ?? 0) <= 1000);
        const [c] = yield* g.selectCards(ctx.player, 'Discard 1 Dragon Tuner with 1000 or less ATK (cost)', pool, 1, 1);
        g.log(`${g.playerName(ctx.player)} discards ${g.name(c)} as the cost.`, 'effect');
        g.sendToGraveyard(c, 'discard', card.uid);
      },
      resolve: function* (g, card, ctx) {
        g.draw(ctx.player, 2, 'draws');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Swords of Revealing Light — Normal Spell that stays on the field
// ---------------------------------------------------------------------------
registerScript({
  name: 'Swords of Revealing Light',
  effects: [
    {
      id: 'activate',
      label: 'Activate (opponent cannot attack for 3 turns)',
      description:
        "After this card's activation, it remains on the field, but you must destroy it during the End Phase of your opponent's 3rd turn. When this card is activated: If your opponent controls a face-down monster, flip all monsters they control face-up. While this card is face-up on the field, your opponent's monsters cannot declare an attack.",
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      cost: function* (g, card, ctx) {
        ctx.data['keepOnField'] = true;
      },
      resolve: function* (g, card, ctx) {
        const opp = g.opponent(ctx.player);
        const monsters = g.fieldMonsters(opp);
        if (monsters.some((m) => !m.faceUp)) {
          for (const m of monsters) if (!m.faceUp) g.flipFaceUp(m.uid);
        }
        // Opponent's 3rd turn from now: turns +1, +3, +5.
        const destroyTurn = g.state.turn + (g.state.turnPlayer === ctx.player ? 5 : 4);
        g.schedule('END', destroyTurn, 'swordsDestroy', "Swords of Revealing Light is destroyed during the End Phase of the opponent's 3rd turn.", card.uid);
        g.log(`Swords of Revealing Light remains on the field. ${g.playerName(opp)}'s monsters cannot declare an attack while it is face-up. It will be destroyed during the End Phase of ${g.playerName(opp)}'s 3rd turn (turn ${destroyTurn}).`, 'rule');
      },
    },
  ],
  restrictAttack: (g, self, attacker) => {
    if (self.zone !== 'spellTrap' || !self.faceUp) return null;
    if (attacker.controller !== self.controller) return `${g.name(attacker.uid)} cannot declare an attack while Swords of Revealing Light is face-up on the field.`;
    return null;
  },
});
registerScheduledHandler('swordsDestroy', function* (g, s) {
  const c = s.uid ? g.state.cards[s.uid] : undefined;
  if (c && c.zone === 'spellTrap' && c.faceUp) yield* g.destroyByEffect([c.uid], null);
});

// ---------------------------------------------------------------------------
// Enemy Controller — Quick-Play Spell
// ---------------------------------------------------------------------------
registerScript({
  name: 'Enemy Controller',
  effects: [
    {
      id: 'activate',
      label: 'Change position / take control of an opponent\'s monster',
      description:
        "Activate 1 of these effects; ● Target 1 face-up monster your opponent controls; change that target's battle position. ● Tribute 1 monster, then target 1 face-up monster your opponent controls; take control of that target until the End Phase.",
      kind: 'activate',
      spellSpeed: 2,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        const targets = targetableMonsters(g, ctx.player, 'opponent', (c) => c.faceUp);
        if (targets.length === 0) return 'Your opponent controls no face-up monster to target.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const canTribute = g.fieldMonsters(ctx.player).length > 0 && g.freeMonsterZones(ctx.player).length + 1 > 0;
        const options = [
          { id: 'position', label: "Change an opponent's monster's battle position", description: 'Target 1 face-up monster your opponent controls; change its battle position.' },
          ...(canTribute ? [{ id: 'control', label: "Tribute 1 monster; take control of an opponent's monster until the End Phase", description: 'Tribute 1 monster (cost), then target 1 face-up monster your opponent controls; take control of it until the End Phase.' }] : []),
        ];
        const choice = yield* g.selectOption(ctx.player, 'Enemy Controller: choose an effect', options);
        ctx.data['mode'] = choice;
        if (choice === 'control') {
          const pool = g.fieldMonsters(ctx.player).map((m) => m.uid);
          const [t] = yield* g.selectCards(ctx.player, 'Tribute 1 monster (cost)', pool, 1, 1);
          g.log(`${g.name(t)} is Tributed as the cost of Enemy Controller.`, 'effect');
          g.sendToGraveyard(t, 'tribute', card.uid);
        }
      },
      targets: function* (g, card, ctx) {
        const pool = targetableMonsters(g, ctx.player, 'opponent', (c) => c.faceUp);
        return yield* g.selectCards(ctx.player, "Target 1 face-up monster your opponent controls", pool, 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t || !g.card(t).faceUp) {
          g.log("Enemy Controller's target is no longer face-up on the field, so nothing happens.", 'rule');
          return;
        }
        if (ctx.data['mode'] === 'position') {
          const c = g.card(t);
          g.changePositionByEffect(t, c.position === 'ATK' ? 'DEF' : 'ATK');
        } else {
          const original = g.card(t).controller;
          const ok = yield* g.changeControl(t, ctx.player);
          if (ok) {
            g.schedule('END', g.state.turn, 'returnControl', `Enemy Controller's effect ends: control of ${g.name(t)} returns to ${g.playerName(original)}.`, t, { to: original });
          }
        }
      },
    },
  ],
});
registerScheduledHandler('returnControl', function* (g, s) {
  const c = s.uid ? g.state.cards[s.uid] : undefined;
  const to = s.data['to'] as PlayerId;
  if (c && g.isMonsterOnField(c) && c.controller !== to) {
    const ok = yield* g.changeControl(c.uid, to);
    if (!ok) g.log(`${g.name(c.uid)} stays where it is because ${g.playerName(to)} has no free Monster Zone.`, 'rule');
  }
});

// ---------------------------------------------------------------------------
// Burst Stream of Destruction
// ---------------------------------------------------------------------------
registerScript({
  name: 'Burst Stream of Destruction',
  effects: [
    {
      id: 'activate',
      label: "Destroy all monsters your opponent controls (needs Blue-Eyes White Dragon)",
      description: 'If you control "Blue-Eyes White Dragon": Destroy all monsters your opponent controls. "Blue-Eyes White Dragon" you control cannot attack the turn you activate this card.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (!g.fieldMonsters(ctx.player).some((m) => m.faceUp && g.name(m.uid) === 'Blue-Eyes White Dragon')) return 'You must control a face-up "Blue-Eyes White Dragon" to activate Burst Stream of Destruction.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        g.player(ctx.player).turnFlags['cannotAttack:Blue-Eyes White Dragon'] = 'Burst Stream of Destruction was activated this turn';
        const targets = g.fieldMonsters(g.opponent(ctx.player)).map((m) => m.uid);
        if (targets.length === 0) {
          g.log('Your opponent controls no monsters, so nothing is destroyed.', 'rule');
        } else {
          yield* g.destroyByEffect(targets, card.uid);
        }
        g.log('"Blue-Eyes White Dragon" you control cannot attack this turn.', 'rule');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Stamping Destruction
// ---------------------------------------------------------------------------
function spellTrapsOnField(g: Parameters<typeof deckCards>[0]): string[] {
  const out: string[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    out.push(...g.spellTrapCards(p).map((c) => c.uid));
    const f = g.fieldSpell(p);
    if (f) out.push(f.uid);
  }
  return out;
}

registerScript({
  name: 'Stamping Destruction',
  effects: [
    {
      id: 'activate',
      label: 'Destroy 1 Spell/Trap on the field and inflict 500 damage (needs a Dragon)',
      description: 'If you control a Dragon monster: Target 1 Spell/Trap on the field; destroy that target, and if you do, inflict 500 damage to its controller.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (!g.fieldMonsters(ctx.player).some((m) => m.faceUp && isDragon(g, m.uid))) return 'You must control a face-up Dragon monster to activate Stamping Destruction.';
        if (spellTrapsOnField(g).filter((u) => u !== card.uid && !g.targetingProtection(g.card(u), ctx.player)).length === 0) return 'There is no other Spell or Trap Card on the field to target.';
        return null;
      },
      targets: function* (g, card, ctx) {
        const pool = spellTrapsOnField(g).filter((u) => u !== card.uid && !g.targetingProtection(g.card(u), ctx.player));
        return yield* g.selectCards(ctx.player, 'Target 1 Spell/Trap Card on the field', pool, 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['spellTrap', 'field']);
        if (!t) {
          g.log('The targeted card is no longer on the field.', 'rule');
          return;
        }
        const controller = g.card(t).controller;
        const destroyed = yield* g.destroyByEffect([t], card.uid);
        if (destroyed.length) g.changeLP(controller, -500, 'Stamping Destruction');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// A Wingbeat of Giant Dragon
// ---------------------------------------------------------------------------
registerScript({
  name: 'A Wingbeat of Giant Dragon',
  effects: [
    {
      id: 'activate',
      label: 'Return 1 Level 5+ Dragon you control to the hand; destroy all Spells and Traps on the field',
      description: 'Return 1 Level 5 or higher Dragon-Type monster you control to the hand, and if you do, destroy all Spell and Trap Cards on the field.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => (g.fieldMonsters(ctx.player).some((m) => m.faceUp && isDragon(g, m.uid) && (def(g, m.uid).level ?? 0) >= 5) ? null : 'You must control a face-up Level 5 or higher Dragon monster to return to the hand.'),
      resolve: function* (g, card, ctx) {
        const pool = g.fieldMonsters(ctx.player).filter((m) => m.faceUp && isDragon(g, m.uid) && (def(g, m.uid).level ?? 0) >= 5).map((m) => m.uid);
        if (pool.length === 0) {
          g.log('There is no Level 5 or higher Dragon to return, so nothing happens.', 'rule');
          return;
        }
        const [chosen] = yield* g.selectCards(ctx.player, 'Return 1 Level 5 or higher Dragon you control to the hand', pool, 1, 1);
        g.log(`${g.name(chosen)} returns to the hand.`, 'effect');
        g.toHand(chosen);
        const all = spellTrapsOnField(g);
        if (all.length) yield* g.destroyByEffect(all, card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// White Elephant's Gift
// ---------------------------------------------------------------------------
registerScript({
  name: "White Elephant's Gift",
  effects: [
    {
      id: 'activate',
      label: 'Send 1 face-up non-Effect Monster you control to the GY; draw 2 cards',
      description: 'Send 1 face-up non-Effect Monster you control to the GY; draw 2 cards. (Sending the monster is a cost.)',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (!g.fieldMonsters(ctx.player).some((m) => m.faceUp && g.isNormalMonster(m.uid) && g.canBeSentToGraveyard(m.uid))) return 'You need a face-up non-Effect Monster (a Normal Monster, or a Gemini monster without its effect) that can be sent to the Graveyard as the cost.';
        if (g.player(ctx.player).deck.length < 2) return 'You need at least 2 cards in your Deck to draw.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = g.fieldMonsters(ctx.player).filter((m) => m.faceUp && g.isNormalMonster(m.uid) && g.canBeSentToGraveyard(m.uid)).map((m) => m.uid);
        const [c] = yield* g.selectCards(ctx.player, 'Send 1 face-up non-Effect Monster you control to the Graveyard (cost)', pool, 1, 1);
        g.log(`${g.name(c)} is sent to the Graveyard as the cost.`, 'effect');
        g.sendToGraveyard(c, 'cost', card.uid);
      },
      resolve: function* (g, card, ctx) {
        g.draw(ctx.player, 2, 'draws');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// One for One
// ---------------------------------------------------------------------------
registerScript({
  name: 'One for One',
  effects: [
    {
      id: 'activate',
      label: 'Send 1 monster from your hand to the GY; Special Summon 1 Level 1 monster from your hand or Deck',
      description: 'Send 1 monster from your hand to the GY; Special Summon 1 Level 1 monster from your hand or Deck.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => {
        const monsters = handCards(g, ctx.player, (d) => d.cardType === 'Monster');
        if (monsters.length === 0) return 'You need a monster in your hand to send to the Graveyard as the cost.';
        const level1 = [...handCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 1), ...deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 1)];
        if (level1.length === 0 || (level1.length === 1 && monsters.length === 1 && level1[0] === monsters[0])) return 'You need a Level 1 monster in your hand or Deck to Special Summon.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = handCards(g, ctx.player, (d) => d.cardType === 'Monster');
        const [c] = yield* g.selectCards(ctx.player, 'Send 1 monster from your hand to the Graveyard (cost)', pool, 1, 1);
        g.log(`${g.name(c)} is sent from the hand to the Graveyard as the cost.`, 'effect');
        g.sendToGraveyard(c, 'cost', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = [...handCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 1), ...deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 1)];
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) {
          g.log('There is no Level 1 monster to Special Summon.', 'rule');
          return;
        }
        const [chosen] = yield* g.selectCards(ctx.player, 'Special Summon 1 Level 1 monster from your hand or Deck', pool, 1, 1, 'Cards shown come from your hand and your Deck.');
        const fromDeck = g.player(ctx.player).deck.includes(chosen);
        yield* g.specialSummon(chosen, ctx.player, { position: 'choose', how: 'by One for One' });
        if (fromDeck) g.shuffleDeck(ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Dragonic Tactics
// ---------------------------------------------------------------------------
registerScript({
  name: 'Dragonic Tactics',
  effects: [
    {
      id: 'activate',
      label: 'Tribute 2 Dragons; Special Summon 1 Level 8 Dragon from your Deck',
      description: 'Tribute 2 Dragon monsters; Special Summon 1 Level 8 Dragon monster from your Deck.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      tags: ['summonFromDeck'],
      condition: (g, card, ctx) => {
        if (g.fieldMonsters(ctx.player).filter((m) => isDragon(g, m.uid)).length < 2) return 'You need 2 Dragon monsters you control to Tribute as the cost.';
        if (deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon' && d.level === 8).length === 0) return 'There is no Level 8 Dragon monster in your Deck.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = g.fieldMonsters(ctx.player).filter((m) => isDragon(g, m.uid)).map((m) => m.uid);
        const chosen = yield* g.selectCards(ctx.player, 'Tribute 2 Dragon monsters (cost)', pool, 2, 2);
        for (const c of chosen) {
          g.log(`${g.name(c)} is Tributed as the cost.`, 'effect');
          g.sendToGraveyard(c, 'tribute', card.uid);
        }
      },
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon' && d.level === 8);
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) {
          g.log('There is no Level 8 Dragon to Special Summon.', 'rule');
          return;
        }
        const [chosen] = yield* g.selectCards(ctx.player, 'Special Summon 1 Level 8 Dragon monster from your Deck', pool, 1, 1);
        yield* g.specialSummon(chosen, ctx.player, { position: 'choose', how: 'by Dragonic Tactics' });
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Soul Exchange
// ---------------------------------------------------------------------------
registerScript({
  name: 'Soul Exchange',
  effects: [
    {
      id: 'activate',
      label: "Use 1 opponent's monster as your Tribute this turn (no Battle Phase)",
      description: 'Target 1 monster your opponent controls; this turn, if you Tribute a monster, you must Tribute that target, as if you controlled it. You cannot conduct your Battle Phase the turn you activate this card.',
      kind: 'activate',
      spellSpeed: 1,
      from: SPELL_FROM,
      condition: (g, card, ctx) => {
        if (targetableMonsters(g, ctx.player, 'opponent').length === 0) return 'Your opponent controls no monster to target.';
        if (g.state.phase === 'MAIN2') return 'Soul Exchange can only be used before your Battle Phase, because you cannot conduct your Battle Phase the turn you activate it.';
        return null;
      },
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, "Target 1 monster your opponent controls", targetableMonsters(g, ctx.player, 'opponent'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        g.player(ctx.player).turnFlags['skipBattlePhase'] = 'Soul Exchange was activated this turn';
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) {
          g.log('The target is no longer on the field, but you still cannot conduct your Battle Phase this turn.', 'rule');
          return;
        }
        g.player(ctx.player).turnFlags['mustTribute'] = t;
        g.log(`This turn, if ${g.playerName(ctx.player)} Tributes a monster, ${g.name(t)} must be Tributed as if they controlled it. ${g.playerName(ctx.player)} cannot conduct their Battle Phase this turn.`, 'effect');
      },
    },
  ],
});
