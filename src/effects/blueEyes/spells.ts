import { hasType } from '../../cards';
import { registerScript, registerScheduledHandler } from '../../engine/scripts';
import type { PlayerId } from '../../engine/types';
import { SPELL_FROM, def, deckCards, graveyardCards, handCards, isDragon, isNormalMonster, targetableMonsters, validTargets } from '../helpers';

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
      condition: (g, card, ctx) => {
        const targets = graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon' && hasType(d, 'Normal'));
        if (targets.length === 0) return 'There is no Dragon Normal Monster in your Graveyard to target.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'You have no empty Monster Zone to Special Summon into.';
        return null;
      },
      targets: function* (g, card, ctx) {
        const pool = graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.race === 'Dragon' && hasType(d, 'Normal'));
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
        if (isNormalMonster(g, first) && isDragon(g, first)) {
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
        g.sendToGraveyard(c, 'cost', card.uid);
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
        g.sendToGraveyard(c, 'cost', card.uid);
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
