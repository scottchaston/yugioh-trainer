/**
 * Beware of Traptrix (SDBT): Xyz and Link Monsters.
 */
import { registerScript, type EffectDef } from '../../engine/scripts';
import { xyzProcedure } from '../../engine/xyz';
import { linkProcedure } from '../../engine/link';
import type { Game } from '../../engine/game';
import type { CardInstance, PlayerId } from '../../engine/types';
import { def, graveyardCards, validTargets } from '../helpers';
import { addToHand, isNormalTrap, targetableCards, targetableMonstersOf } from '../shared';
import { controlledNames, holeTrapsIn, isHoleTrap, isInsectOrPlant, isTraptrixMonster, linkSummonedUnaffectedByTraps, normalTrapsIn, traptrixIn } from './common';

const hasMaterial = (c: CardInstance) => c.materials.length > 0;
const isTrapSource = (g: Game, src: CardInstance) => def(g, src.uid).cardType === 'Trap' && !src.treatedAsMonster;

// ---------------------------------------------------------------------------
// Traptrix Rafflesia (Xyz, Rank 4)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Rafflesia',
  specialSummon: [xyzProcedure({ level: 4, count: [2, 2], text: '2 Level 4 monsters' })],
  unaffectedBy: (g, self, src) => hasMaterial(self) && isTrapSource(g, src),
  preventEffectDestruction: (g, self, target) => (self.faceUp && g.isMonsterOnField(self) && !self.flags['effectsNegated'] && target.uid !== self.uid && target.controller === self.controller && g.isMonsterOnField(target) && isTraptrixMonster(g, target.uid) ? 'Traptrix Rafflesia: your other "Traptrix" monsters cannot be destroyed by card effects.' : null),
  preventBattleDestruction: (g, self, target) => (self.faceUp && g.isMonsterOnField(self) && !self.flags['effectsNegated'] && target.uid !== self.uid && target.controller === self.controller && isTraptrixMonster(g, target.uid) ? 'Traptrix Rafflesia: your other "Traptrix" monsters cannot be destroyed by battle.' : null),
  preventTargeting: (g, self, target, sourcePlayer) => (self.faceUp && g.isMonsterOnField(self) && !self.flags['effectsNegated'] && sourcePlayer !== self.controller && target.uid !== self.uid && target.controller === self.controller && g.isMonsterOnField(target) && isTraptrixMonster(g, target.uid) ? 'Traptrix Rafflesia: your opponent cannot target your other "Traptrix" monsters with card effects.' : null),
  effects: [
    {
      id: 'hole',
      label: 'Detach 1 material; apply the effect of a "Hole" Normal Trap from your Deck',
      description: 'Once per turn (Quick Effect): You can detach 1 material from this card and send 1 "Hole" Normal Trap that meets its activation conditions from your Deck to the GY; this effect becomes that Trap Card\'s effect when that card is activated.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['monster'],
      oncePerTurn: true,
      tags: ['sendFromDeck'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Traptrix Rafflesia must be face-up.';
        if (card.materials.length === 0) return 'Traptrix Rafflesia has no material to detach.';
        if (rafflesiaChoices(g, card, ctx.player).length === 0) return 'No "Hole" Normal Trap in your Deck could be activated right now (its activation conditions are not met).';
        return null;
      },
      cost: function* (g, card, ctx) {
        yield* g.detachMaterials(card.uid, 1, ctx.player);
      },
      targets: function* (g, card, ctx) {
        const choices = rafflesiaChoices(g, card, ctx.player);
        const [trap] = yield* g.selectCards(ctx.player, 'Send 1 "Hole" Normal Trap from your Deck to the GY; its effect becomes this effect', choices, 1, 1);
        ctx.data['trap'] = trap;
        g.log(`${g.name(trap)} is sent from the Deck to the Graveyard; Traptrix Rafflesia's effect becomes its effect.`, 'effect');
        g.sendToGraveyard(trap, 'sent', card.uid);
        g.shuffleDeck(ctx.player);
        const eff = trapEffect(g, trap);
        if (eff.targets) return yield* eff.targets(g, g.card(trap), ctx);
        return [];
      },
      resolve: function* (g, card, ctx) {
        const trap = ctx.data['trap'] as string | undefined;
        if (!trap) return;
        const eff = trapEffect(g, trap);
        yield* eff.resolve(g, g.card(trap), ctx);
      },
    },
  ],
});
function trapEffect(g: Game, uid: string): EffectDef {
  const eff = g.script(uid)?.effects.find((e) => e.id === 'activate');
  if (!eff) throw new Error(`${g.name(uid)} has no activation effect scripted.`);
  return eff;
}
function rafflesiaChoices(g: Game, card: CardInstance, player: PlayerId): string[] {
  return holeTrapsIn(g, player, 'deck').filter((u) => {
    const eff = g.script(u)?.effects.find((e) => e.id === 'activate');
    if (!eff) return false;
    const r = eff.condition?.(g, g.card(u), { player, chainLength: g.state.chain.length, damageStepStage: g.state.battle?.damageStepStage ?? null, data: {}, targets: [] });
    return !r;
  });
}

// ---------------------------------------------------------------------------
// Traptrix Allomerus (Xyz, Rank 4)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Allomerus',
  specialSummon: [xyzProcedure({ level: 4, count: [2, 5], text: '2 or more Level 4 monsters' })],
  unaffectedBy: (g, self, src) => hasMaterial(self) && isTrapSource(g, src),
  effects: [
    {
      id: 'revive',
      label: 'Detach 2 materials; Special Summon 1 Level 4 Insect or Plant monster from your GY',
      description: 'You can detach 2 materials from this card; Special Summon 1 Level 4 Insect or Plant monster from your GY.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['summonFromGY'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Traptrix Allomerus must be face-up.';
        if (card.materials.length < 2) return 'Traptrix Allomerus needs 2 materials to detach.';
        if (graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 4 && (d.race === 'Insect' || d.race === 'Plant')).length === 0) return 'There is no Level 4 Insect or Plant monster in your Graveyard.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card, ctx) {
        yield* g.detachMaterials(card.uid, 2, ctx.player);
      },
      resolve: function* (g, card, ctx) {
        const pool = graveyardCards(g, ctx.player, (d) => d.cardType === 'Monster' && d.level === 4 && (d.race === 'Insect' || d.race === 'Plant'));
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 Level 4 Insect or Plant monster from your Graveyard', pool, 1, 1);
        yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Traptrix Allomerus' });
      },
    },
    {
      id: 'steal',
      label: "Detach 1 material; Special Summon an opponent's monster your effect just removed",
      description: "If an opponent's monster(s) leaves the field because of your card effect, and is now in the GY or banished (except during the Damage Step): You can detach 1 material from this card, then target 1 of them; Special Summon it to your field.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      trigger: (g, card, ev) => {
        if (g.state.battle?.damageStepStage) return false;
        if (ev.type === 'toGraveyard' && (ev.from === 'monster' || ev.from === 'extraMonster') && ev.source) {
          const c = g.state.cards[ev.uid];
          return !!c && c.owner !== card.controller && (ev.reason === 'destroyedEffect' || ev.reason === 'sent') && g.state.cards[ev.source]?.controller === card.controller;
        }
        if (ev.type === 'banished' && (ev.from === 'monster' || ev.from === 'extraMonster') && ev.byPlayer === card.controller) {
          const c = g.state.cards[ev.uid];
          return !!c && c.owner !== card.controller;
        }
        return false;
      },
      condition: (g, card, ctx) => {
        if (card.materials.length < 1) return 'Traptrix Allomerus has no material to detach.';
        if (!ctx.event || !('uid' in ctx.event)) return 'Nothing to target.';
        const c = g.state.cards[ctx.event.uid as string];
        if (!c || (c.zone !== 'graveyard' && c.zone !== 'banished') || def(g, c.uid).cardType !== 'Monster') return 'That monster is no longer in the Graveyard or banished.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      cost: function* (g, card, ctx) {
        yield* g.detachMaterials(card.uid, 1, ctx.player);
      },
      targets: function* (g, card, ctx) {
        const uid = (ctx.event as { uid: string }).uid;
        return [uid];
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard', 'banished']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'choose', how: 'to your field by Traptrix Allomerus' });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Cularia (Link-2)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Cularia',
  specialSummon: [linkProcedure({ count: [2, 2], material: (g, c) => isInsectOrPlant(g, c.uid), text: '2 Insect and/or Plant monsters' })],
  unaffectedBy: linkSummonedUnaffectedByTraps,
  afterTrapResolves: function* (g, self, trap) {
    if (!self.faceUp || self.flags['effectsNegated'] || !isHoleTrap(g, trap.uid) || trap.controller !== self.controller) return false;
    if (g.effectUses(self.controller, `uid:${self.uid}:reset`) > 0) return false;
    if (g.freeSpellTrapZones(self.controller).length === 0 && trap.zone !== 'spellTrap') return false;
    const yes = yield* g.confirm(self.controller, `Traptrix Cularia: Set ${g.name(trap.uid)} again instead of sending it to the Graveyard?`);
    if (!yes) return false;
    g.recordEffectUse(self.controller, `uid:${self.uid}:reset`);
    trap.faceUp = false;
    trap.setThisTurn = true;
    g.log(`${g.name(trap.uid)} is Set again (Traptrix Cularia).`, 'effect');
    g.fx({ type: 'set', uid: trap.uid });
    return true;
  },
  effects: [
    {
      id: 'revive',
      label: 'Special Summon 1 Traptrix monster from your GY in Defense Position (End Phase)',
      description: 'During your End Phase: You can target 1 "Traptrix" monster in your GY; Special Summon it in Defense Position.',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      tags: ['summonFromGY'],
      trigger: (g, card, ev) => ev.type === 'phaseStart' && ev.phase === 'END' && ev.player === card.controller,
      condition: (g, card, ctx) => (traptrixIn(g, ctx.player, 'graveyard').length === 0 ? 'There is no "Traptrix" monster in your Graveyard.' : g.freeMonsterZones(ctx.player).length === 0 ? 'No free Monster Zone.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 "Traptrix" monster in your Graveyard', traptrixIn(g, ctx.player, 'graveyard'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['graveyard']);
        if (t) yield* g.specialSummon(t, ctx.player, { position: 'DEF', how: 'by Traptrix Cularia' });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Pinguicula (Xyz, Rank 4)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Pinguicula',
  specialSummon: [xyzProcedure({ level: 4, count: [2, 2], text: '2 Level 4 monsters' })],
  unaffectedBy: (g, self, src) => {
    if (!hasMaterial(self)) return false;
    if (isTrapSource(g, src)) return true;
    // ... and the activated effects of other monsters with the same Type as this card's material.
    if (def(g, src.uid).cardType !== 'Monster' || src.uid === self.uid) return false;
    const types = new Set(self.materials.map((m) => g.raceOf(m)));
    return types.has(g.raceOf(src.uid));
  },
  effects: [
    {
      id: 'search',
      label: 'Detach 1 material; add 1 "Traptrix" monster from your Deck to your hand',
      description: 'You can detach 1 material from this card; add 1 "Traptrix" monster from your Deck to your hand.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      tags: ['searchDeck'],
      condition: (g, card, ctx) => (!card.faceUp ? 'Traptrix Pinguicula must be face-up.' : card.materials.length === 0 ? 'No material to detach.' : traptrixIn(g, ctx.player, 'deck').length === 0 ? 'There is no "Traptrix" monster in your Deck.' : null),
      cost: function* (g, card, ctx) {
        yield* g.detachMaterials(card.uid, 1, ctx.player);
      },
      resolve: function* (g, card, ctx) {
        const pool = traptrixIn(g, ctx.player, 'deck');
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Add 1 "Traptrix" monster to your hand', pool, 1, 1);
        addToHand(g, u, 'Traptrix Pinguicula');
      },
    },
    {
      id: 'attach',
      label: "Attach an opponent's monster that was just sent to the GY / banished as material",
      description: "If a monster(s) owned by your opponent is sent to the GY, or banished, by a card effect (except during the Damage Step): You can attach 1 of those monsters to this card as material.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      hardOncePerTurn: true,
      trigger: (g, card, ev) => {
        if (g.state.battle?.damageStepStage) return false;
        const c = ev.type === 'toGraveyard' || ev.type === 'banished' ? g.state.cards[ev.uid] : undefined;
        if (!c || c.owner === card.controller || def(g, c.uid).cardType !== 'Monster') return false;
        if (ev.type === 'toGraveyard') return ev.reason === 'destroyedEffect' || ev.reason === 'sent' || ev.reason === 'discard' || ev.reason === 'cost';
        return ev.type === 'banished' && !!ev.source;
      },
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Traptrix Pinguicula must be face-up.';
        const uid = ctx.event && 'uid' in ctx.event ? (ctx.event.uid as string) : undefined;
        const c = uid ? g.state.cards[uid] : undefined;
        return c && (c.zone === 'graveyard' || c.zone === 'banished') ? null : 'That monster is no longer there.';
      },
      resolve: function* (g, card, ctx) {
        const uid = (ctx.event as { uid: string }).uid;
        const c = g.state.cards[uid];
        if (!c || (c.zone !== 'graveyard' && c.zone !== 'banished') || !g.isMonsterOnField(card)) return;
        g.log(`${g.name(uid)} is attached to Traptrix Pinguicula as material.`, 'effect');
        g.attachMaterial(card.uid, uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Atypus (Link-3)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Atypus',
  specialSummon: [linkProcedure({ count: [2, 5], including: (g, c) => isInsectOrPlant(g, c.uid), text: '2 or more monsters, including an Insect or Plant monster' })],
  unaffectedBy: linkSummonedUnaffectedByTraps,
  modifyStats: (g, self, target) => (self.faceUp && !self.flags['effectsNegated'] && target.controller === self.controller && isTraptrixMonster(g, target.uid) && normalTrapsIn(g, self.controller, 'graveyard').length > 0 ? { atk: 1000 } : null),
  effects: [
    {
      id: 'negate',
      label: "Negate the effects of face-up cards your opponent controls (up to your Insect/Plant count), then you can destroy 1",
      description: "Once per turn: You can target face-up cards your opponent controls, up to the number of Insect and Plant monsters you control; negate their effects (until the end of this turn), then you can banish 1 Normal Trap from your GY, and if you do, destroy 1 of those targeted face-up cards.",
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Traptrix Atypus must be face-up.';
        const n = g.fieldMonsters(ctx.player).filter((m) => m.faceUp && isInsectOrPlant(g, m.uid)).length;
        if (n === 0) return 'You control no Insect or Plant monster.';
        if (targetableCards(g, ctx.player, 'opponent', card.uid, (c) => c.faceUp).length === 0) return 'Your opponent controls no face-up card to target.';
        return null;
      },
      targets: function* (g, card, ctx) {
        const n = g.fieldMonsters(ctx.player).filter((m) => m.faceUp && isInsectOrPlant(g, m.uid)).length;
        const pool = targetableCards(g, ctx.player, 'opponent', card.uid, (c) => c.faceUp);
        return yield* g.selectCards(ctx.player, `Target up to ${n} face-up card${n > 1 ? 's' : ''} your opponent controls`, pool, 1, Math.min(n, pool.length));
      },
      resolve: function* (g, card, ctx) {
        const ts = validTargets(g, ctx, ['monster', 'extraMonster', 'spellTrap', 'field']).filter((u) => g.card(u).faceUp);
        for (const t of ts) {
          if (g.isMonsterOnField(g.card(t))) g.negateMonsterEffects(t, card.uid, true);
          else if (!g.isUnaffected(t, card.uid)) {
            g.card(t).flags['effectsNegated'] = true;
            g.card(t).flags['negatedBy'] = 'Traptrix Atypus';
            g.card(t).flags['effectsNegatedThisTurn'] = true;
            g.fx({ type: 'negate', uid: t });
            g.log(`${g.name(t)}'s effects are negated until the end of this turn.`, 'effect');
          }
        }
        const traps = normalTrapsIn(g, ctx.player, 'graveyard');
        if (ts.length === 0 || traps.length === 0) return;
        const yes = yield* g.confirm(ctx.player, 'Banish 1 Normal Trap from your GY to destroy 1 of the targeted cards?');
        if (!yes) return;
        const [trap] = yield* g.selectCards(ctx.player, 'Banish 1 Normal Trap from your Graveyard', traps, 1, 1);
        g.log(`${g.name(trap)} is banished.`, 'effect');
        g.banish(trap, true, card.uid);
        const [victim] = yield* g.selectCards(ctx.player, 'Destroy 1 of the targeted cards', ts.filter((u) => g.isOnField(g.card(u))), 1, 1);
        yield* g.destroyByEffect([victim], card.uid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Traptrix Sera (Link-1)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Traptrix Sera',
  specialSummon: [linkProcedure({ count: [1, 1], material: (g, c) => isTraptrixMonster(g, c.uid) && !g.isLinkMonster(c.uid), text: '1 non-Link "Traptrix" monster' })],
  unaffectedBy: linkSummonedUnaffectedByTraps,
  effects: [
    {
      id: 'onTrap',
      label: 'Special Summon 1 Traptrix monster from your Deck (a Normal Trap was activated)',
      description: 'If a Normal Trap Card is activated: You can Special Summon 1 "Traptrix" monster from your Deck with a different name than the cards you control. (Once per turn, not during the Damage Step.)',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      tags: ['summonFromDeck'],
      trigger: (g, card, ev) => ev.type === 'activated' && ev.effectId === 'activate' && isNormalTrap(def(g, ev.uid)) && !g.state.battle?.damageStepStage,
      condition: (g, card, ctx) => {
        const names = controlledNames(g, ctx.player);
        if (traptrixIn(g, ctx.player, 'deck', (c) => !names.has(g.name(c.uid))).length === 0) return 'There is no "Traptrix" monster in your Deck with a different name than the cards you control.';
        if (g.freeMonsterZones(ctx.player).length === 0) return 'No free Monster Zone.';
        return null;
      },
      resolve: function* (g, card, ctx) {
        const names = controlledNames(g, ctx.player);
        const pool = traptrixIn(g, ctx.player, 'deck', (c) => !names.has(g.name(c.uid)));
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Special Summon 1 "Traptrix" monster from your Deck', pool, 1, 1);
        const ok = yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Traptrix Sera' });
        g.shuffleDeck(ctx.player);
        void ok;
      },
    },
    {
      id: 'setHole',
      label: 'Set 1 "Hole" Normal Trap from your Deck (another Traptrix effect was activated)',
      description: 'If your other "Traptrix" monster\'s effect is activated: You can Set 1 "Hole" Normal Trap directly from the Deck. (Once per turn, not during the Damage Step.)',
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      trigger: (g, card, ev) => ev.type === 'activated' && ev.uid !== card.uid && ev.player === card.controller && isTraptrixMonster(g, ev.uid) && !g.state.battle?.damageStepStage,
      condition: (g, card, ctx) => (holeTrapsIn(g, ctx.player, 'deck').length === 0 ? 'There is no "Hole" Normal Trap in your Deck.' : g.freeSpellTrapZones(ctx.player).length === 0 ? 'No free Spell & Trap Zone.' : null),
      resolve: function* (g, card, ctx) {
        const pool = holeTrapsIn(g, ctx.player, 'deck');
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Set 1 "Hole" Normal Trap from your Deck', pool, 1, 1);
        yield* g.setSpellTrapFromAnywhere(u, ctx.player);
      },
    },
  ],
});
void targetableMonstersOf;
