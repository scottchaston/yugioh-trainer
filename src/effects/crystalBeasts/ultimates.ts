/** Ultimate Crystal monsters and the other monsters of the Legend of the Crystal Beasts deck. */
import { registerScript } from '../../engine/scripts';
import { getScript } from '../../engine/scripts';
import { negateChainLink } from '../../engine/flow';
import { expectedBattleDamage } from '../../engine/battle';
import type { Game } from '../../engine/game';
import type { PlayerId } from '../../engine/types';
import { def, battlingMonsters } from '../helpers';
import { cbInGY, cbInSTZone, cbMonstersOnField, differentNames, isCB, isCBMonsterCard, isCrystalSpellTrap, isUltimateCrystal, placeCB } from './common';

/** All "Crystal Beast" cards a player has on the field and in the GY. */
function cbFieldAndGY(g: Game, player: PlayerId): string[] {
  return [...cbMonstersOnField(g, player).map((m) => m.uid), ...cbInSTZone(g, player).map((c) => c.uid), ...g.player(player).graveyard.filter((u) => isCB(g, u))];
}

function markUltimateEffect(g: Game, player: PlayerId): void {
  g.player(player).turnFlags['rainbowEffectActivated'] = true;
}

// ---------------------------------------------------------------------------
// Rainbow Dragon
// ---------------------------------------------------------------------------
registerScript({
  name: 'Rainbow Dragon',
  cannotNormalSummon: 'It must be Special Summoned from your hand by having 7 "Crystal Beast" cards with different names on your field and/or in your Graveyard.',
  specialSummon: [
    {
      id: 'rainbow',
      label: 'Special Summon (7 Crystal Beasts with different names on your field and/or GY)',
      description: 'Rainbow Dragon can be Special Summoned from your hand if you have 7 "Crystal Beast" cards with different names on your field and/or in your Graveyard. Crystal Beasts in your Spell & Trap Zone count.',
      from: ['hand'],
      condition: (g, card, player) => {
        const n = differentNames(g, cbFieldAndGY(g, player));
        if (n < 7) return `You need 7 "Crystal Beast" cards with different names on your field and/or in your Graveyard (you have ${n}).`;
        return null;
      },
      perform: function* (g, card, player) {
        g.log(`${g.playerName(player)} has 7 Crystal Beasts with different names on the field and in the Graveyard.`, 'rule');
        return yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'by its own condition', proper: true });
      },
    },
  ],
  effects: [
    {
      id: 'boost',
      label: 'Send all Crystal Beast monsters you control to the GY; gain 1000 ATK for each',
      description: '(Quick Effect): You can send all "Crystal Beast" monsters you control to the GY; this card gains 1000 ATK for each monster sent to the GY. Cannot be activated the turn Rainbow Dragon is Special Summoned.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['monster'],
      damageStep: 'calc',
      condition: (g, card) => {
        if (card.summonedThisTurn) return 'Rainbow Dragon cannot activate its effects during the turn it was Special Summoned.';
        if (!card.faceUp) return 'Rainbow Dragon must be face-up.';
        if (cbMonstersOnField(g, card.controller).length === 0) return 'You control no Crystal Beast monster to send to the Graveyard.';
        return null;
      },
      cost: function* (g, card, ctx) {
        markUltimateEffect(g, ctx.player);
        const beasts = cbMonstersOnField(g, ctx.player).map((m) => m.uid);
        ctx.data['count'] = beasts.length;
        for (const u of beasts) {
          g.log(`${g.name(u)} is sent to the Graveyard.`, 'effect');
          g.sendToGraveyard(u, 'cost', card.uid);
        }
      },
      resolve: function* (g, card, ctx) {
        if (!g.isMonsterOnField(card)) return;
        const n = ctx.data['count'] as number;
        g.addStatMod(card.uid, 1000 * n, 0, 'permanent', 'Rainbow Dragon');
        g.log(`Rainbow Dragon gains ${1000 * n} ATK (now ${g.stats(card.uid).atk}).`, 'effect');
      },
    },
    {
      id: 'reset',
      label: 'Banish all Crystal Beast monsters from your GY; shuffle all cards on the field into the Deck',
      description: 'You can banish all "Crystal Beast" monsters from your GY; shuffle all cards on the field into the Deck. Cannot be activated the turn Rainbow Dragon is Special Summoned.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      tags: ['banishFromGY'],
      condition: (g, card, ctx) => {
        if (card.summonedThisTurn) return 'Rainbow Dragon cannot activate its effects during the turn it was Special Summoned.';
        if (!card.faceUp) return 'Rainbow Dragon must be face-up.';
        if (cbInGY(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Graveyard to banish.';
        return null;
      },
      cost: function* (g, card, ctx) {
        markUltimateEffect(g, ctx.player);
        for (const u of cbInGY(g, ctx.player)) {
          g.log(`${g.name(u)} is banished.`, 'effect');
          g.banish(u);
        }
      },
      resolve: function* (g) {
        g.shuffleFieldIntoDecks();
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Rainbow Dark Dragon
// ---------------------------------------------------------------------------
registerScript({
  name: 'Rainbow Dark Dragon',
  cannotNormalSummon: 'It must be Special Summoned from your hand by banishing 7 DARK monsters with different names from your Graveyard.',
  specialSummon: [
    {
      id: 'dark',
      label: 'Special Summon (banish 7 DARK monsters with different names from your GY)',
      description: 'Rainbow Dark Dragon can be Special Summoned from your hand by banishing 7 DARK monsters with different names from your Graveyard (with Advanced Dark, Crystal Beasts are DARK).',
      from: ['hand'],
      condition: (g, card, player) => {
        const darks = g.player(player).graveyard.filter((u) => def(g, u).cardType === 'Monster' && g.attributeOf(u) === 'DARK');
        const n = differentNames(g, darks);
        if (n < 7) return `You need 7 DARK monsters with different names in your Graveyard to banish (you have ${n}).`;
        return null;
      },
      perform: function* (g, card, player) {
        const darks = g.player(player).graveyard.filter((u) => def(g, u).cardType === 'Monster' && g.attributeOf(u) === 'DARK');
        const seen = new Set<string>();
        const chosen: string[] = [];
        for (const u of darks) {
          if (seen.has(g.name(u))) continue;
          seen.add(g.name(u));
          chosen.push(u);
          if (chosen.length === 7) break;
        }
        for (const u of chosen) {
          g.log(`${g.name(u)} is banished from the Graveyard.`, 'effect');
          g.banish(u);
        }
        return yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'by its own condition', proper: true });
      },
    },
  ],
  effects: [
    {
      id: 'banishDark',
      label: 'Banish all other DARK monsters from your field and GY; gain 500 ATK each',
      description: 'You can banish all other DARK monsters from your field and GY; this card gains 500 ATK for each card banished this way.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      tags: ['banishFromGY'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Rainbow Dark Dragon must be face-up.';
        const pool = darkOthers(g, ctx.player, card.uid);
        if (pool.length === 0) return 'There is no other DARK monster on your field or in your Graveyard.';
        return null;
      },
      cost: function* (g, card, ctx) {
        markUltimateEffect(g, ctx.player);
        const pool = darkOthers(g, ctx.player, card.uid);
        ctx.data['count'] = pool.length;
        for (const u of pool) {
          g.log(`${g.name(u)} is banished.`, 'effect');
          g.banish(u);
        }
      },
      resolve: function* (g, card, ctx) {
        if (!g.isMonsterOnField(card)) return;
        const n = ctx.data['count'] as number;
        g.addStatMod(card.uid, 500 * n, 0, 'permanent', 'Rainbow Dark Dragon');
        g.log(`Rainbow Dark Dragon gains ${500 * n} ATK (now ${g.stats(card.uid).atk}).`, 'effect');
      },
    },
  ],
});

function darkOthers(g: Game, player: PlayerId, self: string): string[] {
  const field = g.fieldMonsters(player).filter((m) => m.uid !== self && m.faceUp && g.attributeOf(m.uid) === 'DARK').map((m) => m.uid);
  const gy = g.player(player).graveyard.filter((u) => def(g, u).cardType === 'Monster' && g.attributeOf(u) === 'DARK');
  return [...field, ...gy];
}

// ---------------------------------------------------------------------------
// Rainbow Overdragon (Fusion)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Rainbow Overdragon',
  specialSummon: [
    {
      id: 'tributeUltimate',
      label: 'Special Summon by Tributing 1 Level 10 Ultimate Crystal monster',
      description: 'Rainbow Overdragon can be Special Summoned from the Extra Deck by Tributing 1 Level 10 "Ultimate Crystal" monster you control (Rainbow Dragon or Rainbow Dark Dragon). It can also be Fusion Summoned with Ultimate Crystal Magic.',
      from: ['extra'],
      condition: (g, card, player) => (g.fieldMonsters(player).some((m) => m.faceUp && isUltimateCrystal(g, m.uid) && g.levelOf(m.uid) === 10) ? null : 'You need to control a face-up Level 10 "Ultimate Crystal" monster (Rainbow Dragon or Rainbow Dark Dragon) to Tribute.'),
      perform: function* (g, card, player) {
        const pool = g.fieldMonsters(player).filter((m) => m.faceUp && isUltimateCrystal(g, m.uid) && g.levelOf(m.uid) === 10).map((m) => m.uid);
        const [t] = yield* g.selectCards(player, 'Tribute 1 Level 10 Ultimate Crystal monster', pool, 1, 1, undefined, true);
        g.log(`${g.name(t)} is Tributed.`, 'action');
        g.sendToGraveyard(t, 'tribute', card.uid);
        return yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'by Tributing a Level 10 Ultimate Crystal monster', proper: true });
      },
    },
  ],
  effects: [
    {
      id: 'gainAtk',
      label: "Banish 1 Crystal Beast from your GY; gain its ATK until the end of this turn",
      description: "Once per turn: You can banish 1 \"Crystal Beast\" monster from your GY; this card gains ATK equal to the banished monster's, until the end of this turn.",
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      oncePerTurn: true,
      tags: ['banishFromGY'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Rainbow Overdragon must be face-up.';
        if (cbInGY(g, ctx.player).length === 0) return 'There is no Crystal Beast monster in your Graveyard.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const [u] = yield* g.selectCards(ctx.player, 'Banish 1 Crystal Beast monster from your Graveyard (cost)', cbInGY(g, ctx.player), 1, 1);
        ctx.data['atk'] = def(g, u).atk ?? 0;
        g.log(`${g.name(u)} is banished.`, 'effect');
        g.banish(u);
      },
      resolve: function* (g, card, ctx) {
        if (!g.isMonsterOnField(card)) return;
        const atk = ctx.data['atk'] as number;
        g.addStatMod(card.uid, atk, 0, 'endOfTurn', 'Rainbow Overdragon');
        g.log(`Rainbow Overdragon gains ${atk} ATK until the end of this turn (now ${g.stats(card.uid).atk}).`, 'effect');
      },
    },
    {
      id: 'shuffleAll',
      label: 'Tribute this Fusion Summoned card; shuffle all cards on the field into the Deck',
      description: '(Quick Effect): You can Tribute this Fusion Summoned card; shuffle all cards on the field into the Deck.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['monster'],
      condition: (g, card) => {
        if (!card.faceUp) return 'Rainbow Overdragon must be face-up.';
        if (!card.fusionSummoned) return 'This effect can only be used if Rainbow Overdragon was Fusion Summoned (e.g. with Ultimate Crystal Magic).';
        return null;
      },
      cost: function* (g, card) {
        g.log('Rainbow Overdragon is Tributed (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'tribute', card.uid);
      },
      resolve: function* (g) {
        g.shuffleFieldIntoDecks();
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Ultimate Crystal Rainbow Dragon Overdrive (Fusion)
// ---------------------------------------------------------------------------
function overdriveMaterials(g: Game, player: PlayerId): { ultimates: string[]; beasts: string[] } {
  const pool = [...g.fieldMonsters(player).filter((m) => m.faceUp).map((m) => m.uid), ...g.player(player).graveyard.filter((u) => def(g, u).cardType === 'Monster')];
  return { ultimates: pool.filter((u) => isUltimateCrystal(g, u)), beasts: pool.filter((u) => isCBMonsterCard(g, u)) };
}

registerScript({
  name: 'Ultimate Crystal Rainbow Dragon Overdrive',
  specialSummon: [
    {
      id: 'overdrive',
      label: 'Special Summon by banishing 1 Ultimate Crystal monster + 7 Crystal Beast monsters',
      description: 'Can only be Special Summoned from the Extra Deck during a Duel in which you Special Summoned an "Ultimate Crystal" monster, by banishing 1 "Ultimate Crystal" monster and 7 "Crystal Beast" monsters from your field and/or Graveyard.',
      from: ['extra'],
      condition: (g, card, player) => {
        if (!g.player(player).duelFlags['summonedUltimateCrystal']) return 'You have not Special Summoned an "Ultimate Crystal" monster during this Duel yet.';
        const m = overdriveMaterials(g, player);
        if (m.ultimates.length === 0) return 'You need an "Ultimate Crystal" monster on your field or in your Graveyard to banish.';
        if (m.beasts.length < 7) return `You need 7 "Crystal Beast" monsters on your field and/or in your Graveyard to banish (you have ${m.beasts.length}).`;
        return null;
      },
      perform: function* (g, card, player) {
        const m = overdriveMaterials(g, player);
        const [ult] = yield* g.selectCards(player, 'Banish 1 Ultimate Crystal monster (from your field or Graveyard)', m.ultimates, 1, 1, undefined, true);
        const beasts = yield* g.selectCards(player, 'Banish 7 Crystal Beast monsters (from your field and/or Graveyard)', m.beasts.filter((u) => u !== ult), 7, 7, undefined, true);
        for (const u of [ult, ...beasts]) {
          g.log(`${g.name(u)} is banished.`, 'effect');
          g.banish(u);
        }
        return yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'by banishing its materials', proper: true });
      },
    },
  ],
  effects: [
    {
      id: 'reset',
      label: 'Tribute this card; shuffle all cards on the field into the Deck, then Special Summon your banished Crystal Beasts',
      description: 'If this card has not battled this turn (Quick Effect): You can Tribute this card; shuffle as many cards on the field as possible into the Deck, and if you do, Special Summon any number of your banished "Crystal Beast" monsters.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['monster'],
      condition: (g, card) => {
        if (!card.faceUp) return 'Overdrive must be face-up.';
        if (card.flags['battledThisTurn']) return 'Overdrive has already battled this turn.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Ultimate Crystal Rainbow Dragon Overdrive is Tributed (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'tribute', card.uid);
      },
      resolve: function* (g, card, ctx) {
        g.shuffleFieldIntoDecks();
        const pool = g.player(ctx.player).banished.filter((u) => isCBMonsterCard(g, u));
        const max = Math.min(pool.length, g.freeMonsterZones(ctx.player).length);
        if (max === 0) return;
        const chosen = yield* g.selectCards(ctx.player, 'Special Summon any number of your banished Crystal Beast monsters', pool, 0, max);
        for (const u of chosen) yield* g.specialSummon(u, ctx.player, { position: 'choose', how: 'by Overdrive' });
      },
    },
  ],
  modifyStats: (g, self, target) => {
    if (target.uid !== self.uid) return null;
    const banished = g.player(self.controller).banished.filter((u) => isCBMonsterCard(g, u));
    return differentNames(g, banished) >= 7 ? { atk: 7000 } : null;
  },
});

// ---------------------------------------------------------------------------
// Hamon, Lord of Striking Thunder
// ---------------------------------------------------------------------------
registerScript({
  name: 'Hamon, Lord of Striking Thunder',
  cannotNormalSummon: 'It must be Special Summoned from your hand by sending 3 face-up Continuous Spells you control to the Graveyard (Crystal Beasts in your Spell & Trap Zone count).',
  specialSummon: [
    {
      id: 'hamon',
      label: 'Special Summon by sending 3 face-up Continuous Spells you control to the GY',
      description: 'Hamon can be Special Summoned from your hand by sending 3 face-up Continuous Spells you control to the Graveyard. Crystal Beasts placed in your Spell & Trap Zone are Continuous Spells.',
      from: ['hand'],
      condition: (g, card, player) => (continuousSpells(g, player).length < 3 ? `You need 3 face-up Continuous Spells you control (you have ${continuousSpells(g, player).length}).` : null),
      perform: function* (g, card, player) {
        const chosen = yield* g.selectCards(player, 'Send 3 face-up Continuous Spells you control to the Graveyard', continuousSpells(g, player), 3, 3, undefined, true);
        for (const u of chosen) {
          g.log(`${g.name(u)} is sent to the Graveyard.`, 'effect');
          g.sendToGraveyard(u, 'cost', card.uid);
        }
        return yield* g.specialSummon(card.uid, player, { position: 'choose', how: 'by its own condition', proper: true });
      },
    },
  ],
  effects: [
    {
      id: 'burn',
      label: 'Inflict 1000 damage (destroyed a monster by battle)',
      description: "If this card destroys an opponent's monster by battle and sends it to the GY: Inflict 1000 damage to your opponent.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['monster'],
      mandatory: true,
      trigger: (g, card, ev) => ev.type === 'toGraveyard' && ev.reason === 'destroyedBattle' && ev.source === card.uid && g.state.cards[ev.uid]?.owner !== card.controller,
      resolve: function* (g, card, ctx) {
        g.changeLP(g.opponent(ctx.player), -1000, 'Hamon, Lord of Striking Thunder');
      },
    },
  ],
  restrictAttack: (g, self, attacker, target) => {
    if (!g.isMonsterOnField(self) || !self.faceUp || self.position !== 'DEF') return null;
    if (attacker.controller === self.controller) return null;
    if (target && target.uid !== self.uid) return `While Hamon, Lord of Striking Thunder is in face-up Defense Position, your monsters can only attack Hamon.`;
    return null;
  },
});

function continuousSpells(g: Game, player: PlayerId): string[] {
  return g.spellTrapCards(player).filter((c) => c.faceUp && (c.treatedAsSpell === 'continuous' || (def(g, c.uid).cardType === 'Spell' && def(g, c.uid).property === 'Continuous'))).map((c) => c.uid);
}

// ---------------------------------------------------------------------------
// Crystal Master (Pendulum)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crystal Master',
  effects: [
    {
      id: 'search',
      label: 'Tribute Crystal Master; add an Ultimate Crystal monster, Crystal Beast monster, or "Crystal" Spell/Trap from your Deck',
      description: 'You can Tribute this card; add 1 "Ultimate Crystal" monster, "Crystal Beast" monster, or "Crystal" Spell/Trap from your Deck to your hand.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      tags: ['searchDeck'],
      condition: (g, card, ctx) => {
        if (!card.faceUp) return 'Crystal Master must be face-up.';
        if (masterTargets(g, ctx.player).length === 0) return 'There is nothing in your Deck to add.';
        return null;
      },
      cost: function* (g, card) {
        g.log('Crystal Master is Tributed (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'tribute', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const pool = masterTargets(g, ctx.player);
        if (pool.length === 0) return;
        const [u] = yield* g.selectCards(ctx.player, 'Add 1 card from your Deck to your hand', pool, 1, 1);
        g.log(`${g.name(u)} is added from the Deck to the hand.`, 'effect');
        g.toHand(u);
        g.shuffleDeck(ctx.player);
      },
    },
  ],
  preventTargeting: (g, self, target, sourcePlayer) => {
    if (self.zone !== 'spellTrap' || self.treatedAsSpell !== 'pendulum' || !self.faceUp) return null;
    if (sourcePlayer === self.controller || target.controller !== self.controller) return null;
    if ((g.isMonsterOnField(target) && isUltimateCrystal(g, target.uid)) || isCB(g, target.uid)) return `Crystal Master's Pendulum Effect: your opponent cannot target "Ultimate Crystal" monsters or "Crystal Beast" cards you control.`;
    return null;
  },
});

function masterTargets(g: Game, player: PlayerId): string[] {
  return g.player(player).deck.filter((u) => isUltimateCrystal(g, u) || isCBMonsterCard(g, u) || isCrystalSpellTrap(g, u));
}

// ---------------------------------------------------------------------------
// Crystal Keeper (Pendulum)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Crystal Keeper',
  effects: [
    {
      id: 'double',
      label: "Tribute Crystal Keeper: your battling Crystal Beast's ATK/DEF are doubled for this damage calculation",
      description:
        "If a \"Crystal Beast\" monster you control battles an opponent's monster, during damage calculation (Quick Effect): You can Tribute this card from your hand or face-up field; your battling monster's ATK/DEF become double its original ATK/DEF during that damage calculation only, but it is destroyed at the end of this Damage Step.",
      kind: 'quick',
      spellSpeed: 2,
      from: ['hand', 'monster'],
      damageStep: 'calc',
      hidden: true,
      condition: (g, card, ctx) => {
        if (!ctx.damageStepStage) return 'This effect can only be activated during damage calculation.';
        const b = battlingMonsters(g, ctx.player);
        if (!b || !b.theirs) return "A Crystal Beast monster you control must be battling an opponent's monster.";
        if (!isCB(g, b.mine)) return `${g.name(b.mine)} is not a Crystal Beast monster.`;
        if (card.zone === 'monster' && !card.faceUp) return 'Crystal Keeper must be face-up to be Tributed from the field.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const b = battlingMonsters(g, ctx.player)!;
        ctx.data['mine'] = b.mine;
        g.log('Crystal Keeper is Tributed (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'tribute', card.uid);
      },
      resolve: function* (g, card, ctx) {
        const mine = ctx.data['mine'] as string;
        const m = g.state.cards[mine];
        if (!m || !g.isMonsterOnField(m)) return;
        const st = g.stats(mine);
        g.addStatMod(mine, st.originalAtk, st.originalDef, 'endOfDamageStep', 'Crystal Keeper');
        m.flags['destroyAtEndOfDamageStep'] = true;
        m.flags['destroyAtEndReason'] = 'Crystal Keeper';
        g.log(`${g.name(mine)}'s ATK/DEF are doubled for this damage calculation (ATK ${g.stats(mine).atk} / DEF ${g.stats(mine).def}). It will be destroyed at the end of the Damage Step.`, 'effect');
      },
    },
  ],
  preventEffectDestruction: (g, self, target) => {
    if (self.zone !== 'spellTrap' || self.treatedAsSpell !== 'pendulum' || !self.faceUp) return null;
    if (target.controller !== self.controller) return null;
    if (!((g.isMonsterOnField(target) && isUltimateCrystal(g, target.uid)) || isCB(g, target.uid))) return null;
    const key = `keeper:${self.uid}`;
    if (g.effectUses(self.controller, key) > 0) return null;
    g.recordEffectUse(self.controller, key);
    return "Crystal Keeper's Pendulum Effect: the first time each turn your Ultimate Crystal / Crystal Beast cards would be destroyed by a card effect, they are not destroyed.";
  },
});

// ---------------------------------------------------------------------------
// Dimension Shifter
// ---------------------------------------------------------------------------
registerScript({
  name: 'Dimension Shifter',
  effects: [
    {
      id: 'shift',
      label: 'Send this card to the GY: until the end of the next turn, cards sent to the GY are banished instead',
      description: 'If you have no cards in your GY (Quick Effect): You can send this card from your hand to the GY; until the end of the next turn, any card sent to the GY is banished instead.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['hand'],
      hidden: true,
      condition: (g, card, ctx) => (g.player(ctx.player).graveyard.length > 0 ? 'You must have no cards in your Graveyard.' : null),
      cost: function* (g, card) {
        g.log('Dimension Shifter is sent from the hand to the Graveyard (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'cost');
      },
      resolve: function* (g) {
        g.state.banishInsteadUntilTurn = g.state.turn + 1;
        g.log('Until the end of the next turn, any card that would be sent to the Graveyard is banished instead.', 'effect');
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Contact "C"
// ---------------------------------------------------------------------------
registerScript({
  name: 'Contact "C"',
  effects: [
    {
      id: 'contact',
      label: "Special Summon Contact \"C\" to your opponent's field in Defense Position",
      description: "When your opponent Normal or Special Summons a monster(s) (except during the Damage Step): You can Special Summon this card from your hand to the opponent's field in Defense Position. Its controller cannot Fusion, Synchro, Xyz, or Link Summon unless they use it as material.",
      kind: 'trigger',
      spellSpeed: 1,
      from: ['hand'],
      whenYouCan: true,
      trigger: (g, card, ev) => ev.type === 'summon' && ev.player !== card.owner && (ev.method === 'normal' || ev.method === 'special') && !g.state.battle?.damageStepStage,
      condition: (g, card, ctx) => (g.freeMonsterZones(g.opponent(ctx.player)).length === 0 ? 'Your opponent has no free Monster Zone.' : null),
      resolve: function* (g, card, ctx) {
        if (card.zone !== 'hand') return;
        yield* g.specialSummon(card.uid, g.opponent(ctx.player), { position: 'DEF', how: "by Contact \"C\"'s effect (to the opponent's field)" });
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Ash Blossom & Joyous Spring / Ghost Belle & Haunted Mansion (hand traps)
// ---------------------------------------------------------------------------
function lastLinkTags(g: Game): { index: number; tags: string[] } | null {
  const chain = g.state.chain;
  const last = chain[chain.length - 1];
  if (!last || last.negated) return null;
  const eff = getScript(g.name(last.uid))?.effects.find((e) => e.id === last.effectId);
  return { index: chain.length - 1, tags: eff?.tags ?? [] };
}

registerScript({
  name: 'Ash Blossom & Joyous Spring',
  effects: [
    {
      id: 'negate',
      label: 'Discard Ash Blossom; negate that effect (search / Special Summon from Deck / send from Deck)',
      description: 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect. ● Add a card from the Deck to the hand. ● Special Summon from the Deck. ● Send a card from the Deck to the GY.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['hand'],
      hidden: true,
      hardOncePerTurn: true,
      damageStep: 'any',
      condition: (g) => {
        const l = lastLinkTags(g);
        if (!l) return 'Ash Blossom can only respond to a card or effect that was just activated.';
        if (!l.tags.some((t) => t === 'searchDeck' || t === 'summonFromDeck' || t === 'sendFromDeck')) return 'The last activated effect does not add a card from the Deck to the hand, Special Summon from the Deck, or send a card from the Deck to the Graveyard.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['linkIndex'] = lastLinkTags(g)!.index;
        g.log('Ash Blossom & Joyous Spring is discarded (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'discard');
      },
      resolve: function* (g, card, ctx) {
        yield* negateChainLink(g, ctx.data['linkIndex'] as number, card.uid, 'effect');
      },
    },
  ],
});

registerScript({
  name: 'Ghost Belle & Haunted Mansion',
  effects: [
    {
      id: 'negate',
      label: 'Discard Ghost Belle; negate that activation (effects that use the Graveyard)',
      description: 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that activation. ● Add a card(s) from the GY to the hand, Deck, and/or Extra Deck. ● Special Summon a Monster Card(s) from the GY. ● Banish a card(s) from the GY.',
      kind: 'quick',
      spellSpeed: 2,
      from: ['hand'],
      hidden: true,
      hardOncePerTurn: true,
      damageStep: 'any',
      condition: (g) => {
        const l = lastLinkTags(g);
        if (!l) return 'Ghost Belle can only respond to a card or effect that was just activated.';
        if (!l.tags.some((t) => t === 'addFromGY' || t === 'summonFromGY' || t === 'banishFromGY')) return 'The last activated effect does not add from the Graveyard, Special Summon from the Graveyard, or banish from the Graveyard.';
        return null;
      },
      cost: function* (g, card, ctx) {
        ctx.data['linkIndex'] = lastLinkTags(g)!.index;
        g.log('Ghost Belle & Haunted Mansion is discarded (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'discard');
      },
      resolve: function* (g, card, ctx) {
        yield* negateChainLink(g, ctx.data['linkIndex'] as number, card.uid, 'activation');
      },
    },
  ],
});

void expectedBattleDamage;
void placeCB;
