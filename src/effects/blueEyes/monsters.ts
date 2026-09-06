import { hasType } from '../../cards';
import { registerScript } from '../../engine/scripts';
import { synchroProcedure } from '../../engine/synchro';
import type { Game } from '../../engine/game';
import type { Process } from '../../engine/scripts';
import type { PlayerId, Zone } from '../../engine/types';
import { battlingMonsters, deckCards, def, graveyardCards, handCards, isDragon, isLight, targetableMonsters, validTargets } from '../helpers';

/** Special Summon a card by name from the chosen zones (hand / Deck / Graveyard). Returns true if summoned. */
export function* summonByName(g: Game, player: PlayerId, name: string, zones: Zone[], how: string): Process<boolean> {
  const pool: string[] = [];
  const pl = g.player(player);
  if (zones.includes('hand')) pool.push(...pl.hand.filter((u) => g.name(u) === name));
  if (zones.includes('deck')) pool.push(...pl.deck.filter((u) => g.name(u) === name));
  if (zones.includes('graveyard')) pool.push(...pl.graveyard.filter((u) => g.name(u) === name));
  if (pool.length === 0) {
    g.log(`There is no "${name}" in the ${zones.map((z) => (z === 'graveyard' ? 'Graveyard' : z === 'deck' ? 'Deck' : 'hand')).join(', ')}, so nothing is Special Summoned.`, 'rule');
    return false;
  }
  if (g.freeMonsterZones(player).length === 0) {
    g.log('No free Monster Zone, so nothing is Special Summoned.', 'rule');
    return false;
  }
  const [chosen] = yield* g.selectCards(player, `Choose the "${name}" to Special Summon`, pool, 1, 1, 'Cards shown may come from your hand, Deck or Graveyard.');
  const from = g.card(chosen).zone;
  const ok = yield* g.specialSummon(chosen, player, { position: 'choose', how: `${how} (from the ${from === 'graveyard' ? 'Graveyard' : from === 'deck' ? 'Deck' : 'hand'})` });
  if (from === 'deck' || pl.deck.includes(chosen)) g.shuffleDeck(player);
  return ok;
}

// ---------------------------------------------------------------------------
// Honest
// ---------------------------------------------------------------------------
registerScript({
  name: 'Honest',
  effects: [
    {
      id: 'return',
      label: 'Return Honest from the field to your hand',
      description: 'During your Main Phase: You can return this face-up card from the field to the hand.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      condition: (g, card) => (card.faceUp ? null : 'Honest must be face-up.'),
      resolve: function* (g, card) {
        if (g.isMonsterOnField(card) && card.faceUp) {
          g.log('Honest returns to the hand.', 'effect');
          g.toHand(card.uid);
        }
      },
    },
    {
      id: 'boost',
      label: "Send Honest from your hand to the GY: your LIGHT monster gains ATK equal to the opposing monster's ATK",
      description:
        "During the Damage Step, when a LIGHT monster you control battles (Quick Effect): You can send this card from your hand to the GY; that monster gains ATK equal to the ATK of the opponent's monster it is battling, until the end of this turn.",
      kind: 'quick',
      spellSpeed: 2,
      from: ['hand'],
      damageStep: 'beforeCalc',
      hidden: true,
      condition: (g, card, ctx) => {
        if (!ctx.damageStepStage) return "Honest's effect can only be activated during the Damage Step, when a LIGHT monster you control is battling an opponent's monster.";
        if (!g.canBeSentToGraveyard(card.uid)) return g.whyCannotBeSentToGraveyard(card.uid);
        const b = battlingMonsters(g, ctx.player);
        if (!b || !b.theirs) return "Honest requires a monster you control to be battling an opponent's monster (not a direct attack).";
        if (!isLight(g, b.mine)) return `${g.name(b.mine)} is not a LIGHT monster.`;
        if (!g.card(b.mine).faceUp) return 'Your battling monster must be face-up.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const b = battlingMonsters(g, ctx.player)!;
        ctx.data['mine'] = b.mine;
        ctx.data['theirs'] = b.theirs;
        g.log('Honest is sent from the hand to the Graveyard (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'cost');
      },
      resolve: function* (g, card, ctx) {
        const mine = ctx.data['mine'] as string;
        const theirs = ctx.data['theirs'] as string;
        const m = g.state.cards[mine];
        const t = g.state.cards[theirs];
        if (!m || !g.isMonsterOnField(m) || !t || !g.isMonsterOnField(t)) {
          g.log('The battling monsters are no longer on the field, so Honest does nothing.', 'rule');
          return;
        }
        const gain = g.stats(theirs).atk;
        g.addStatMod(mine, gain, 0, 'endOfTurn', 'Honest');
        g.log(`${g.name(mine)} gains ${gain} ATK (the ATK of ${g.name(theirs)}) until the end of the turn. Its ATK is now ${g.stats(mine).atk}.`, 'effect');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Maiden with Eyes of Blue
// ---------------------------------------------------------------------------
registerScript({
  name: 'Maiden with Eyes of Blue',
  effects: [
    {
      id: 'targeted',
      label: 'Special Summon 1 "Blue-Eyes White Dragon" (Maiden was targeted)',
      description: 'When a card or effect is activated that targets this card (Quick Effect): You can Special Summon 1 "Blue-Eyes White Dragon" from your hand, Deck, or GY.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['monster'],
      oncePerTurnGroup: 'maiden',
      tags: ['summonFromDeck', 'summonFromGY'],
      condition: (g, card, ctx) => {
        const chain = g.state.chain;
        const last = chain[chain.length - 1];
        if (!last || !last.targets.includes(card.uid)) return 'Maiden with Eyes of Blue can only use this effect in response to a card or effect that targets it.';
        if (!card.faceUp) return 'Maiden must be face-up.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        yield* summonByName(g, ctx.player, 'Blue-Eyes White Dragon', ['hand', 'deck', 'graveyard'], 'by Maiden with Eyes of Blue');
      },
    },
    {
      id: 'attacked',
      label: 'Negate the attack, change position, then Special Summon "Blue-Eyes White Dragon"',
      description:
        'When this card is targeted for an attack: You can negate the attack, and if you do, change the battle position of this card, then you can Special Summon 1 "Blue-Eyes White Dragon" from your hand, Deck, or GY.',
      kind: 'trigger',
      spellSpeed: 2,
      from: ['monster'],
      whenYouCan: true,
      oncePerTurnGroup: 'maiden',
      tags: ['summonFromDeck', 'summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'attackDeclared' && ev.target === card.uid,
      condition: (g, card) => {
        const b = g.state.battle;
        if (!b || b.target !== card.uid || b.attackNegated) return 'The attack on Maiden with Eyes of Blue is no longer happening.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const b = g.state.battle;
        if (!b || b.target !== card.uid || !b.attacker) {
          g.log('The attack is no longer happening, so nothing is negated.', 'rule');
          return;
        }
        b.attackNegated = true;
        g.log(`The attack of ${g.name(b.attacker)} is negated.`, 'effect');
        g.changePositionByEffect(card.uid, card.position === 'ATK' ? 'DEF' : 'ATK');
        const yes = yield* g.confirm(ctx.player, 'Special Summon 1 "Blue-Eyes White Dragon" from your hand, Deck, or Graveyard?');
        if (yes) yield* summonByName(g, ctx.player, 'Blue-Eyes White Dragon', ['hand', 'deck', 'graveyard'], 'by Maiden with Eyes of Blue');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Rider of the Storm Winds
// ---------------------------------------------------------------------------
registerScript({
  name: 'Rider of the Storm Winds',
  effects: [
    {
      id: 'equip',
      label: 'Equip Rider of the Storm Winds to a Dragon Normal Monster you control',
      description:
        'You can target 1 Dragon Normal Monster you control; equip this monster from your hand or field to that target. If a monster equipped with this card attacks a Defense Position monster, inflict piercing battle damage to your opponent. If a monster equipped with this card would be destroyed, destroy this card instead.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['hand', 'monster'],
      condition: (g, card, ctx) => {
        if (card.zone === 'monster' && !card.faceUp) return 'Rider of the Storm Winds must be face-up to use this effect from the field.';
        if (targetableMonsters(g, ctx.player, 'own', (c) => c.faceUp && isDragon(g, c.uid) && g.isNormalMonster(c.uid) && c.uid !== card.uid).length === 0) return 'You need a face-up Dragon Normal Monster to equip Rider of the Storm Winds to.';
        if (g.freeSpellTrapZones(ctx.player).length === 0) return 'You need an empty Spell & Trap Zone for Rider of the Storm Winds to become an Equip Card.';
        return null;
      },
      targets: function* (g, card, ctx) {
        const pool = targetableMonsters(g, ctx.player, 'own', (c) => c.faceUp && isDragon(g, c.uid) && g.isNormalMonster(c.uid) && c.uid !== card.uid);
        return yield* g.selectCards(ctx.player, 'Target 1 Dragon Normal Monster you control', pool, 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t || !g.card(t).faceUp) {
          g.log('The target is no longer on the field, so Rider of the Storm Winds is not equipped.', 'rule');
          return;
        }
        if (card.zone !== 'hand' && !g.isMonsterOnField(card)) {
          g.log('Rider of the Storm Winds is no longer available to equip.', 'rule');
          return;
        }
        const ok = yield* g.placeMonsterAsSpell(card.uid, ctx.player, 'equip');
        if (ok) {
          card.equippedTo = t;
          g.log(`Rider of the Storm Winds is equipped to ${g.name(t)} as an Equip Card.`, 'effect');
        }
      },
    },
  ],
  piercing: (g, self, monster) => self.zone === 'spellTrap' && self.treatedAsSpell === 'equip' && self.equippedTo === monster.uid,
  replaceDestruction: function* (g, self, target) {
    if (self.zone !== 'spellTrap' || self.treatedAsSpell !== 'equip' || self.equippedTo !== target.uid) return false;
    g.log(`${g.name(target.uid)} would be destroyed, but Rider of the Storm Winds is destroyed instead.`, 'effect');
    g.fx({ type: 'destroy', uid: self.uid, by: 'effect' });
    g.emit({ type: 'destroyed', uid: self.uid, reason: 'effect' });
    g.sendToGraveyard(self.uid, 'destroyedEffect');
    return true;
  },
});

// ---------------------------------------------------------------------------
// Darkstorm Dragon (Gemini)
// ---------------------------------------------------------------------------
/** Face-up Spells/Traps the player controls that can really be sent to the GY (the cost says "send ... to the GY"). */
function darkstormCostPool(g: Game, player: PlayerId): string[] {
  return [...g.spellTrapCards(player), ...(g.fieldSpell(player) ? [g.fieldSpell(player)!] : [])].filter((c) => c.faceUp && g.canBeSentToGraveyard(c.uid)).map((c) => c.uid);
}

registerScript({
  name: 'Darkstorm Dragon',
  effects: [
    {
      id: 'destroyAll',
      label: 'Send 1 face-up Spell/Trap you control to the GY; destroy all Spells and Traps on the field',
      description:
        'While this card is an Effect Monster (after its Gemini Summon), once per turn: You can send 1 face-up Spell/Trap Card you control to the Graveyard; destroy all Spell and Trap Cards on the field.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!card.geminiEffectActive) return 'Darkstorm Dragon is a Normal Monster right now. Gemini Summon it (use your Normal Summon on it while it is face-up) to give it its effect.';
        const pool = darkstormCostPool(g, ctx.player);
        if (pool.length === 0) {
          const faceUp = [...g.spellTrapCards(ctx.player), ...(g.fieldSpell(ctx.player) ? [g.fieldSpell(ctx.player)!] : [])].find((c) => c.faceUp);
          if (faceUp) return `The cost is to send 1 face-up Spell/Trap you control to the Graveyard, and none of yours can be sent there right now: ${g.whyCannotBeSentToGraveyard(faceUp.uid)}`;
          return 'You need a face-up Spell or Trap Card you control to send to the Graveyard as the cost.';
        }
        return null;
      },
      cost: function* (g, card, ctx) {
        const pool = darkstormCostPool(g, ctx.player);
        const [c] = yield* g.selectCards(ctx.player, 'Send 1 face-up Spell/Trap you control to the Graveyard (cost)', pool, 1, 1);
        g.log(`${g.name(c)} is sent to the Graveyard as the cost.`, 'effect');
        g.sendToGraveyard(c, 'cost', card.uid);
      },
      resolve: function* (g, card) {
        const all: string[] = [];
        for (const p of [0, 1] as PlayerId[]) {
          all.push(...g.spellTrapCards(p).map((c) => c.uid));
          const f = g.fieldSpell(p);
          if (f) all.push(f.uid);
        }
        if (all.length === 0) {
          g.log('There are no Spell or Trap Cards on the field to destroy.', 'rule');
          return;
        }
        yield* g.destroyByEffect(all, card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Kaiser Glider
// ---------------------------------------------------------------------------
registerScript({
  name: 'Kaiser Glider',
  effects: [
    {
      id: 'bounce',
      label: 'Return 1 monster on the field to the hand',
      description: 'If this card is destroyed and sent to the GY: Target 1 monster on the field; return that target to the hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && (ev.reason === 'destroyedBattle' || ev.reason === 'destroyedEffect'),
      condition: (g, card, ctx) => (targetableMonsters(g, ctx.player, 'any').length === 0 ? 'There is no monster on the field to target.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 monster on the field to return to the hand', targetableMonsters(g, ctx.player, 'any'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) {
          g.log('The target is no longer on the field.', 'rule');
          return;
        }
        g.log(`${g.name(t)} is returned to the hand by Kaiser Glider.`, 'effect');
        g.toHand(t);
      },
    },
  ],
  preventBattleDestruction: (g, self, target) => {
    if (target.uid !== self.uid) return null;
    const b = g.state.battle;
    if (!b || !b.attacker) return null;
    const other = b.attacker === self.uid ? b.target : b.attacker;
    if (!other) return null;
    if (g.stats(other).atk === g.stats(self.uid).atk) return 'Kaiser Glider cannot be destroyed by battle with a monster that has the same ATK.';
    return null;
  },
});

// ---------------------------------------------------------------------------
// Hieratic Dragon of Tefnuit
// ---------------------------------------------------------------------------
registerScript({
  name: 'Hieratic Dragon of Tefnuit',
  specialSummon: [
    {
      id: 'tefnuit',
      label: 'Special Summon (only your opponent controls a monster)',
      description: 'If only your opponent controls a monster, you can Special Summon this card (from your hand). It cannot attack during the turn it is Special Summoned this way.',
      from: ['hand'],
      condition: (g, card, player) => {
        if (g.fieldMonsters(player).length > 0) return 'You control a monster, so Hieratic Dragon of Tefnuit cannot be Special Summoned this way (only your opponent may control monsters).';
        if (g.fieldMonsters(g.opponent(player)).length === 0) return 'Your opponent must control at least one monster.';
        return null;
      },
      perform: function* (g, card, player) {
        const ok = yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'by its own effect' });
        if (ok) {
          card.flags['cannotAttackThisTurn'] = true;
          card.flags['cannotAttackReason'] = 'it was Special Summoned by its own effect this turn';
        }
        return ok;
      },
    },
  ],
  effects: [
    {
      id: 'tributed',
      label: 'Special Summon 1 Dragon Normal Monster with 0 ATK/DEF',
      description: 'When this card is Tributed: Special Summon 1 Dragon Normal Monster from your hand, Deck, or GY, and make its ATK/DEF 0.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      mandatory: true,
      tags: ['summonFromDeck', 'summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && ev.reason === 'tribute',
      condition: (g, card, ctx) => {
        const pl = g.player(ctx.player);
        const pool = [...pl.hand, ...pl.deck, ...pl.graveyard].filter((u) => u !== card.uid && isDragon(g, u) && g.isNormalMonster(u));
        if (pool.length === 0) return 'There is no Dragon Normal Monster to Special Summon.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pl = g.player(ctx.player);
        const pool = [...pl.hand, ...pl.deck, ...pl.graveyard].filter((u) => u !== card.uid && isDragon(g, u) && g.isNormalMonster(u));
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const [chosen] = yield* g.selectCards(ctx.player, 'Special Summon 1 Dragon Normal Monster (its ATK/DEF become 0)', pool, 1, 1, 'Cards shown come from your hand, Deck and Graveyard.');
        const fromDeck = pl.deck.includes(chosen);
        const ok = yield* g.specialSummon(chosen, ctx.player, { position: 'choose', how: 'by Hieratic Dragon of Tefnuit' });
        if (ok) {
          const st = g.stats(chosen);
          g.addStatMod(chosen, -st.originalAtk, -st.originalDef, 'permanent', 'Hieratic Dragon of Tefnuit');
          g.log(`${g.name(chosen)}'s ATK and DEF become 0.`, 'effect');
        }
        if (fromDeck) g.shuffleDeck(ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Mirage Dragon
// ---------------------------------------------------------------------------
registerScript({
  name: 'Mirage Dragon',
  effects: [],
  preventActivation: (g, self, card, effect, player) => {
    if (!g.isMonsterOnField(self) || !self.faceUp) return null;
    if (player === self.controller) return null;
    if (g.state.phase !== 'BATTLE') return null;
    if (def(g, card.uid).cardType !== 'Trap') return null;
    return `Mirage Dragon prevents you from activating Trap Cards during the Battle Phase.`;
  },
});

// ---------------------------------------------------------------------------
// Divine Dragon Apocralyph / Herald of Creation: discard 1, then add from GY to hand
// ---------------------------------------------------------------------------
function discardThenRecover(name: string, filterLabel: string, filter: (g: Game, uid: string) => boolean, text: string) {
  registerScript({
    name,
    effects: [
      {
        id: 'recover',
        label: `Discard 1 card; add 1 ${filterLabel} from your GY to your hand`,
        description: text,
        kind: 'ignition',
        spellSpeed: 1,
        from: ['monster'],
        oncePerTurn: true,
        tags: ['addFromGY'],
        condition: (g, card, ctx) => {
          if (!card.faceUp) return `${name} must be face-up.`;
          if (g.player(ctx.player).hand.length === 0) return 'You need a card in your hand to discard as the cost.';
          if (graveyardCards(g, ctx.player).filter((u) => filter(g, u)).length === 0 && !g.player(ctx.player).hand.some((u) => filter(g, u))) {
            return `There is no ${filterLabel} in your Graveyard to target.`;
          }
          return null;
        },
        cost: function* (g, card, ctx) {
          const [c] = yield* g.selectCards(ctx.player, 'Discard 1 card (cost)', g.player(ctx.player).hand.slice(), 1, 1);
          g.log(`${g.playerName(ctx.player)} discards ${g.name(c)} as the cost.`, 'effect');
          g.sendToGraveyard(c, 'discard', card.uid);
        },
        targets: function* (g, card, ctx) {
          const pool = graveyardCards(g, ctx.player).filter((u) => filter(g, u));
          if (pool.length === 0) throw new Error(`There is no ${filterLabel} in your Graveyard to target.`);
          return yield* g.selectCards(ctx.player, `Target 1 ${filterLabel} in your Graveyard`, pool, 1, 1);
        },
        resolve: function* (g, card, ctx) {
          const [t] = validTargets(g, ctx, ['graveyard']);
          if (!t) {
            g.log('The target is no longer in the Graveyard.', 'rule');
            return;
          }
          g.log(`${g.name(t)} is added to the hand.`, 'effect');
          g.toHand(t);
        },
      },
    ],
  });
}
discardThenRecover('Divine Dragon Apocralyph', 'Dragon monster', (g, u) => def(g, u).cardType === 'Monster' && isDragon(g, u), 'Once per turn: You can discard 1 card, then target 1 Dragon-Type monster in your Graveyard; add that target to your hand.');
discardThenRecover('Herald of Creation', 'Level 7 or higher monster', (g, u) => def(g, u).cardType === 'Monster' && (def(g, u).level ?? 0) >= 7, 'Once per turn: You can discard 1 card, then target 1 Level 7 or higher monster in your Graveyard; add that target to your hand.');

// ---------------------------------------------------------------------------
// The White Stone of Legend
// ---------------------------------------------------------------------------
registerScript({
  name: 'The White Stone of Legend',
  effects: [
    {
      id: 'search',
      label: 'Add 1 "Blue-Eyes White Dragon" from your Deck to your hand',
      description: 'If this card is sent to the GY: Add 1 "Blue-Eyes White Dragon" from your Deck to your hand.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      mandatory: true,
      tags: ['searchDeck'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid,
      condition: (g, card, ctx) => (deckCards(g, ctx.player, (d) => d.name === 'Blue-Eyes White Dragon').length === 0 ? 'There is no "Blue-Eyes White Dragon" in your Deck.' : null),
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.name === 'Blue-Eyes White Dragon');
        if (pool.length === 0) {
          g.log('There is no "Blue-Eyes White Dragon" in the Deck.', 'rule');
          return;
        }
        g.log(`Blue-Eyes White Dragon is added from the Deck to the hand.`, 'effect');
        g.toHand(pool[0]);
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Kaibaman
// ---------------------------------------------------------------------------
registerScript({
  name: 'Kaibaman',
  effects: [
    {
      id: 'summonBlueEyes',
      label: 'Tribute Kaibaman; Special Summon 1 "Blue-Eyes White Dragon" from your hand',
      description: 'You can Tribute this card; Special Summon 1 "Blue-Eyes White Dragon" from your hand.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Kaibaman must be face-up.';
        if (handCards(g, ctx.player, (d) => d.name === 'Blue-Eyes White Dragon').length === 0) return 'You need a "Blue-Eyes White Dragon" in your hand.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Kaibaman is Tributed (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'tribute', card.uid);
      },
      resolve: function* (g, card, ctx) {
        yield* summonByName(g, ctx.player, 'Blue-Eyes White Dragon', ['hand'], 'by Kaibaman');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Kaiser Sea Horse
// ---------------------------------------------------------------------------
registerScript({
  name: 'Kaiser Sea Horse',
  effects: [],
  tributeValue: (g, self, forUid) => (isLight(g, forUid) ? 2 : 1),
});

// ---------------------------------------------------------------------------
// Shining Angel
// ---------------------------------------------------------------------------
registerScript({
  name: 'Shining Angel',
  effects: [
    {
      id: 'recruit',
      label: 'Special Summon 1 LIGHT monster with 1500 or less ATK from your Deck',
      description: 'When this card is destroyed by battle and sent to the Graveyard: You can Special Summon 1 LIGHT monster with 1500 or less ATK from your Deck, in face-up Attack Position.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['graveyard'],
      whenYouCan: true,
      tags: ['summonFromDeck'],
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.uid === card.uid && ev.reason === 'destroyedBattle',
      condition: (g, card, ctx) => {
        if (deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.attribute === 'LIGHT' && (d.atk ?? 0) <= 1500 && !hasType(d, 'Fusion') && !hasType(d, 'Synchro')).length === 0) return 'There is no LIGHT monster with 1500 or less ATK in your Deck.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const pool = deckCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.attribute === 'LIGHT' && (d.atk ?? 0) <= 1500);
        if (pool.length === 0 || g.freeMonsterZones(ctx.player).length === 0) return;
        const [chosen] = yield* g.selectCards(ctx.player, 'Special Summon 1 LIGHT monster with 1500 or less ATK from your Deck', pool, 1, 1);
        yield* g.specialSummon(chosen, ctx.player, { position: 'ATK', how: 'by Shining Angel' });
        g.shuffleDeck(ctx.player);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Azure-Eyes Silver Dragon (Synchro)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Azure-Eyes Silver Dragon',
  synchro: { nonTuner: (g, c) => g.isNormalMonster(c.uid), text: '1 Tuner + 1 or more non-Tuner Normal Monsters' },
  specialSummon: [synchroProcedure({ nonTuner: (g, c) => g.isNormalMonster(c.uid), text: '1 Tuner + 1 or more non-Tuner Normal Monsters' })],
  effects: [
    {
      id: 'protect',
      label: 'Protect your Dragons until the end of the next turn',
      description: 'If this card is Special Summoned: Until the end of the next turn, neither player can target Dragon monsters you currently control with card effects, also they cannot be destroyed by card effects.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'summon' && ev.uid === card.uid && ev.method === 'special',
      resolve: function* (g, card, ctx) {
        const dragons = g.fieldMonsters(ctx.player).filter((m) => m.faceUp && isDragon(g, m.uid));
        const until = g.state.turn + 1;
        for (const m of dragons) {
          m.flags['cannotBeTargetedUntil'] = until;
          m.flags['cannotBeDestroyedByEffectsUntil'] = until;
          m.flags['protectionSource'] = 'Azure-Eyes Silver Dragon';
        }
        g.log(`Until the end of the next turn, ${dragons.map((m) => g.name(m.uid)).join(', ')} cannot be targeted or destroyed by card effects.`, 'effect');
      },
    },
    {
      id: 'revive',
      label: 'Special Summon 1 Normal Monster from your Graveyard (Standby Phase)',
      description: 'Once per turn, during your Standby Phase: You can target 1 Normal Monster in your GY; Special Summon it.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      tags: ['summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'phaseStart' && ev.phase === 'STANDBY' && ev.player === card.controller,
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Azure-Eyes Silver Dragon must be face-up.';
        if (graveyardCards(g, ctx.player).filter((u) => g.isNormalMonster(u)).length === 0) return 'There is no Normal Monster in your Graveyard.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      targets: function* (g, card, ctx) {
        const pool = graveyardCards(g, ctx.player).filter((u) => g.isNormalMonster(u));
        return yield* g.selectCards(ctx.player, 'Target 1 Normal Monster in your Graveyard', pool, 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (!t) {
          g.log('The target is no longer in the Graveyard.', 'rule');
          return;
        }
        yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'by Azure-Eyes Silver Dragon' });
      },
    },
  ],
});
