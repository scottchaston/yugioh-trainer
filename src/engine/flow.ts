/**
 * Chains, fast-effect (response) windows and trigger effects.
 */
import { Game } from './game';
import { getScript, getScheduledHandler, type ActivationContext, type EffectDef, type Process } from './scripts';
import type { ActivationOption, CardInstance, ChainLink, GameEvent, PlayerId, WindowKind, Zone } from './types';
import { PHASE_LABEL } from './types';

export type DamageStage = 'start' | 'beforeCalc' | 'calc' | 'afterCalc' | 'end' | null;

export interface WindowContext {
  /** Text shown to the player: what is being responded to. */
  description: string;
  kind?: WindowKind;
  damageStepStage?: DamageStage;
  /** Chain building: the player must respond with a card of sufficient Spell Speed. */
  chaining?: boolean;
  /** A summon is being performed: only effects that can negate a Summon may be used. */
  summonNegation?: boolean;
}

// ---------------------------------------------------------------------------
// Activation legality
// ---------------------------------------------------------------------------

export function isSpellOrTrap(g: Game, c: CardInstance): boolean {
  const d = g.def(c.uid);
  return d.cardType === 'Spell' || d.cardType === 'Trap';
}

/**
 * Generic timing rules for activating `effect` of `card` by `player`.
 * Returns null if legal, otherwise a beginner-friendly explanation.
 */
export function canActivateEffect(
  g: Game,
  player: PlayerId,
  card: CardInstance,
  effect: EffectDef,
  ctx: { openState: boolean; chainSpeed: 0 | 1 | 2 | 3; damageStepStage?: DamageStage; event?: GameEvent; summonNegation?: boolean },
): string | null {
  const d = g.def(card.uid);
  const st = g.state;
  if (st.winner !== null) return 'The Duel is over.';
  if (ctx.summonNegation && !effect.respondsToSummon) return 'Only effects that can negate a Summon can be used at this moment.';
  if (!ctx.summonNegation && effect.respondsToSummon && !effect.condition) return 'This effect can only be used while a monster is being Summoned.';
  if (g.isOnField(card) && card.flags['effectsNegated'] && d.cardType === 'Monster') {
    return `${d.name}'s effects are negated (${card.flags['negatedBy'] ?? 'card effect'}), so they cannot be activated.`;
  }
  const controller = card.zone === 'hand' || card.zone === 'graveyard' || card.zone === 'banished' || card.zone === 'deck' ? card.owner : card.controller;
  if (controller !== player) return `You do not control ${d.name}.`;
  const baseCtx: ActivationContext = { player, chainLength: st.chain.length, event: ctx.event, damageStepStage: ctx.damageStepStage ?? null, data: {}, targets: [] };
  // Traps from the hand: only with a card effect that allows it (Traptrix Atrax) or the Trap's own condition (Evenly Matched).
  let trapFromHand = false;
  if (d.cardType === 'Trap' && effect.kind === 'activate' && card.zone === 'hand') {
    trapFromHand = !!effect.fromHand?.(g, card, baseCtx) || g.activeFieldCards().some((src) => src.controller === player && getScript(g.name(src.uid))?.allowTrapActivationFromHand?.(g, src, card));
    if (!trapFromHand) return `${d.name} is a Trap Card. Trap Cards must be Set on the field first, and cannot be activated until the next turn.`;
  }
  if (!effect.from.includes(card.zone) && !trapFromHand) return `${d.name} is not in a place where this effect can be used.`;
  // "Cannot activate cards or effects" restrictions placed on this player (King Calamity, Absolute Powerforce).
  const block = g.player(player).turnFlags['cannotActivate'] as { scope: 'field' | 'all'; reason: string; battleOf?: string } | undefined;
  if (block && (block.scope === 'all' || g.isOnField(card)) && (!block.battleOf || st.battle?.attacker === block.battleOf)) {
    return `You cannot activate ${block.scope === 'field' ? 'cards or effects on the field' : 'cards or effects'} right now (${block.reason}).`;
  }
  const forbidden = g.player(player).turnFlags['forbiddenNames'] as string[] | undefined;
  if (forbidden?.includes(d.name)) return `You cannot activate "${d.name}" or its effects for the rest of this turn (Witch of the Black Forest).`;
  if (d.cardType === 'Trap' && effect.kind === 'activate' && g.player(player).turnFlags['trapActivationsLeft'] === 0) {
    return 'You can only activate 1 more Trap Card this turn after Trap Trick resolved, and you already did.';
  }

  // Monster cards in the Spell & Trap Zone are Spell Cards there, not monsters; their monster effects cannot be used.
  if (card.treatedAsSpell && effect.kind !== 'continuousIgnition' && effect.kind !== 'activate' && d.cardType === 'Monster') {
    return `${d.name} is currently treated as ${card.treatedAsSpell === 'equip' ? 'an Equip Spell' : 'a Continuous Spell'} in the Spell & Trap Zone, so its monster effects cannot be used.`;
  }
  if (!card.treatedAsSpell && effect.kind === 'continuousIgnition' && d.cardType === 'Monster') {
    return `${d.name} is not in the Spell & Trap Zone right now.`;
  }
  // Continuous effects of other cards that forbid this activation (e.g. Mirage Dragon).
  for (const src of g.activeFieldCards()) {
    const r = getScript(g.name(src.uid))?.preventActivation?.(g, src, card, effect, player);
    if (r) return r;
  }

  // Spell speed 1 (Normal Spells, ignition effects) can only be used at an open game state in your own Main Phase.
  // (Trigger effects are Spell Speed 1 too, but they activate in response to their trigger instead.)
  if (effect.spellSpeed === 1 && effect.kind !== 'trigger') {
    if (!ctx.openState || ctx.chainSpeed > 0) {
      return `${d.name}'s effect is Spell Speed 1, which cannot be activated in response to something or during a chain. Spell Speed 1 effects (Normal Spells and most monster effects) can only be activated at an open moment in your own Main Phase.`;
    }
    if (st.turnPlayer !== player) return `Spell Speed 1 effects such as ${d.name} can only be activated during your own turn.`;
    if (st.phase !== 'MAIN1' && st.phase !== 'MAIN2') return `${d.name} can only be activated during your Main Phase 1 or Main Phase 2 (it is currently the ${PHASE_LABEL[st.phase]}).`;
  }
  // Chain speed rule
  if (ctx.chainSpeed > 0 && effect.spellSpeed < ctx.chainSpeed) {
    return `${d.name} is Spell Speed ${effect.spellSpeed}, but the last card on the chain is Spell Speed ${ctx.chainSpeed}. You can only chain a card with equal or higher Spell Speed.`;
  }
  if (ctx.chainSpeed === 3 && effect.spellSpeed < 3) {
    return 'Only Counter Traps (Spell Speed 3) can be chained to a Counter Trap.';
  }

  // Damage Step restriction
  if (ctx.damageStepStage) {
    const r = damageStepTimingProblem(d.name, effect.damageStep, ctx.damageStepStage);
    if (r) return r;
  }

  if (d.cardType === 'Spell' && effect.kind === 'activate') {
    if (card.zone === 'hand') {
      if (d.property === 'Quick-Play' && st.turnPlayer !== player) {
        return `${d.name} is a Quick-Play Spell. You can activate it from your hand only during your own turn. To use it on your opponent's turn, Set it first (and wait a turn).`;
      }
      if (d.property !== 'Quick-Play' && ctx.chainSpeed > 0) {
        return `${d.name} is a Normal Spell (Spell Speed 1) and cannot be chained.`;
      }
      if (d.property === 'Field') {
        // always has a zone (replaces the old one)
      } else if (g.freeSpellTrapZones(player).length === 0) {
        return 'All five of your Spell & Trap Zones are full. You need an empty Spell & Trap Zone to activate a Spell Card from your hand.';
      }
    } else if (card.zone === 'spellTrap' || card.zone === 'field') {
      if (card.faceUp) return `${d.name} is already face-up on the field.`;
      if (d.property === 'Quick-Play' && card.setThisTurn && !card.flags['canActivateThisTurn']) {
        return `${d.name} is a Quick-Play Spell that was Set this turn. A Set Quick-Play Spell cannot be activated during the same turn it was Set. Starting next turn it can be activated at fast-effect timing (even during your opponent's turn).`;
      }
    }
  }
  if (d.cardType === 'Trap' && effect.kind === 'activate' && !trapFromHand) {
    if (card.faceUp) return `${d.name} is already face-up on the field.`;
    if (card.setThisTurn && !card.flags['canActivateThisTurn'] && !effect.canActivateTurnSet?.(g, card, baseCtx)) {
      return `You cannot activate ${d.name} yet because you Set it during this turn. Trap Cards cannot be activated during the same turn they are Set. Beginning next turn, it can be activated when its timing is correct.`;
    }
  }

  // Once per turn limits
  if (effect.hardOncePerTurn && g.effectUses(player, g.effectUseKey(card.uid, effect.id, true)) > 0) {
    return `You can only activate 1 "${d.name}" per turn, and you already did this turn.`;
  }
  if (effect.oncePerTurn && g.effectUses(player, g.effectUseKey(card.uid, effect.id, false)) > 0) {
    return `This effect of ${d.name} can only be used once per turn, and it was already used this turn.`;
  }
  if (effect.oncePerTurnGroup && g.effectUses(player, `group:${d.name}:${effect.oncePerTurnGroup}`) > 0) {
    return `You can only use 1 effect of "${d.name}" per turn, and you already did this turn.`;
  }

  if (effect.condition) {
    const r = effect.condition(g, card, {
      player,
      chainLength: st.chain.length,
      event: ctx.event,
      damageStepStage: ctx.damageStepStage ?? null,
      data: {},
      targets: [],
    });
    if (r) return r;
  }
  return null;
}

/**
 * Which Damage Step windows an effect may be activated in.
 *  - 'beforeCalc': ATK/DEF modifiers and effects that say "during the Damage Step" (Honest): only at the
 *    start of the Damage Step and before damage calculation. Once damage calculation has begun they are too late.
 *  - 'calc': effects that say "during damage calculation" (Crystal Keeper): only in that window.
 *  - 'untilCalc': battle-damage modifiers ("halve the battle damage"): start, before and during damage calculation.
 *  - 'any': Counter Traps and effects that explicitly work at any point of the Damage Step.
 *  - false/undefined: not during the Damage Step at all.
 */
export const DAMAGE_STEP_WINDOWS: Record<'beforeCalc' | 'calc' | 'untilCalc' | 'any', readonly DamageStage[]> = {
  beforeCalc: ['start', 'beforeCalc'],
  calc: ['calc'],
  untilCalc: ['start', 'beforeCalc', 'calc'],
  any: ['start', 'beforeCalc', 'calc', 'afterCalc', 'end'],
};

export function damageStepTimingProblem(name: string, allowed: EffectDef['damageStep'], stage: DamageStage): string | null {
  if (!allowed) {
    return `${name} cannot be activated during the Damage Step. During the Damage Step only Counter Traps, effects that change ATK/DEF, and effects that say they work in the Damage Step can be activated.`;
  }
  if (DAMAGE_STEP_WINDOWS[allowed].includes(stage)) return null;
  switch (allowed) {
    case 'beforeCalc':
      return stage === 'calc'
        ? `${name} can no longer be activated: damage calculation has already begun. Effects that change ATK/DEF (and effects that say "during the Damage Step") must be activated at the start of the Damage Step or before damage calculation.`
        : `${name} can only be activated at the start of the Damage Step or before damage calculation; damage calculation is already over.`;
    case 'calc':
      return `${name} can only be activated during damage calculation itself.`;
    case 'untilCalc':
      return `${name} can only be activated before or during damage calculation.`;
    default:
      return null;
  }
  return null;
}

function chainSpeed(g: Game): 0 | 1 | 2 | 3 {
  const chain = g.state.chain;
  if (chain.length === 0) return 0;
  return chain[chain.length - 1].spellSpeed;
}

function candidateCards(g: Game, player: PlayerId): CardInstance[] {
  const pl = g.player(player);
  const uids: string[] = [...pl.hand, ...pl.graveyard, ...pl.banished, ...pl.extra];
  for (const u of pl.monsterZones) if (u) uids.push(u);
  for (const u of pl.spellTrapZones) if (u) uids.push(u);
  if (pl.fieldZone) uids.push(pl.fieldZone);
  for (const u of g.state.extraMonsterZones) if (u && g.card(u).controller === player) uids.push(u);
  return uids.map((u) => g.card(u));
}

/** Fast effects (Spell Speed 2+) `player` could activate right now. */
export function activatableFastEffects(g: Game, player: PlayerId, ctx: WindowContext): ActivationOption[] {
  const out: ActivationOption[] = [];
  for (const card of candidateCards(g, player)) {
    const script = getScript(g.name(card.uid));
    if (!script) continue;
    for (const effect of script.effects) {
      if (effect.spellSpeed < 2) continue;
      if (effect.kind === 'trigger' || effect.kind === 'ignition') continue;
      const reason = canActivateEffect(g, player, card, effect, {
        openState: false,
        chainSpeed: chainSpeed(g),
        damageStepStage: ctx.damageStepStage,
        summonNegation: ctx.summonNegation,
      });
      if (reason) continue;
      out.push({
        uid: card.uid,
        effectId: effect.id,
        label: effect.label,
        description: effect.description,
        why: activationWhy(g, card, effect),
      });
    }
  }
  return out;
}

export function activationWhy(g: Game, card: CardInstance, effect: EffectDef): string {
  const d = g.def(card.uid);
  if (d.cardType === 'Trap') {
    return `${d.name} is a Set Trap Card that was Set on a previous turn, so it can be activated now that its timing is correct.`;
  }
  if (d.cardType === 'Spell' && d.property === 'Quick-Play') {
    if (card.zone === 'hand') return `${d.name} is a Quick-Play Spell in your hand, and it is your turn, so it can be activated at fast-effect timing.`;
    return `${d.name} is a Set Quick-Play Spell that was Set on a previous turn, so it can be activated at fast-effect timing.`;
  }
  if (effect.kind === 'quick') return `${d.name} has a Quick Effect (Spell Speed 2), which can be activated at fast-effect timing.`;
  return effect.description;
}

// ---------------------------------------------------------------------------
// Activation & chains
// ---------------------------------------------------------------------------

function findEffect(g: Game, uid: string, effectId: string): EffectDef {
  const script = getScript(g.name(uid));
  const e = script?.effects.find((x) => x.id === effectId);
  if (!e) throw new Error(`No effect ${effectId} on ${g.name(uid)}`);
  return e;
}

/**
 * Activate an effect: place the card if needed, pay costs, choose targets and add a chain link.
 * Does not resolve the chain.
 */
export function* activateEffect(
  g: Game,
  player: PlayerId,
  uid: string,
  effectId: string,
  extra: { event?: GameEvent; damageStepStage?: DamageStage; openState: boolean; summonNegation?: boolean },
): Process<ChainLink> {
  const card = g.card(uid);
  const d = g.def(uid);
  const effect = findEffect(g, uid, effectId);
  const reason = canActivateEffect(g, player, card, effect, {
    openState: extra.openState,
    chainSpeed: chainSpeed(g),
    damageStepStage: extra.damageStepStage,
    event: extra.event,
    summonNegation: extra.summonNegation,
  });
  if (reason) throw new Error(reason);

  const linkNo = g.state.chain.length + 1;
  let sendToGYAfter = false;
  const fromZone = card.zone;
  if (d.cardType === 'Trap' && effect.kind === 'activate' && typeof g.player(player).turnFlags['trapActivationsLeft'] === 'number') {
    g.player(player).turnFlags['trapActivationsLeft'] = (g.player(player).turnFlags['trapActivationsLeft'] as number) - 1;
  }

  if (effect.kind === 'activate' && isSpellOrTrap(g, card)) {
    // Place the card on the field face-up.
    if (card.zone === 'hand') {
      if (d.property === 'Field') {
        const old = g.fieldSpell(player);
        if (old) {
          g.log(`${g.name(old.uid)} is sent to the Graveyard to make room for the new Field Spell.`, 'rule');
          g.sendToGraveyard(old.uid, 'rule');
        }
        g.placeFieldSpell(uid, player, true);
      } else {
        const zone = yield* g.chooseSpellTrapZone(player, `Choose a Spell & Trap Zone for ${d.name}`);
        g.placeSpellTrap(uid, player, zone, true);
      }
    } else {
      card.faceUp = true;
    }
    if (d.cardType === 'Spell' && (d.property === 'Normal' || d.property === 'Quick-Play' || d.property === 'Ritual')) sendToGYAfter = true;
    if (d.cardType === 'Trap' && d.property !== 'Continuous') sendToGYAfter = true;
    delete card.flags['canActivateThisTurn'];
    g.log(`${g.playerName(player)} activates ${d.name}${linkNo > 1 ? ` (Chain Link ${linkNo})` : ''}.`, linkNo > 1 ? 'chain' : 'action');
    g.fx({ type: 'activate', uid, player, what: d.cardType === 'Trap' ? 'trap' : 'spell' });
  } else {
    g.log(
      `${g.playerName(player)} activates the effect of ${d.name}${card.zone === 'hand' ? ' from the hand' : card.zone === 'graveyard' ? ' in the Graveyard' : ''}${linkNo > 1 ? ` (Chain Link ${linkNo})` : ''}.`,
      linkNo > 1 ? 'chain' : 'effect',
    );
    g.fx({ type: 'activate', uid, player, what: d.cardType === 'Monster' ? 'monster' : d.cardType === 'Trap' ? 'trap' : 'spell' });
  }

  const ctx: ActivationContext = {
    player,
    chainLength: g.state.chain.length,
    event: extra.event,
    damageStepStage: extra.damageStepStage ?? null,
    data: {},
    targets: [],
  };

  if (effect.hardOncePerTurn) g.recordEffectUse(player, g.effectUseKey(uid, effect.id, true));
  if (effect.oncePerTurn) g.recordEffectUse(player, g.effectUseKey(uid, effect.id, false));
  if (effect.oncePerTurnGroup) g.recordEffectUse(player, `group:${d.name}:${effect.oncePerTurnGroup}`);

  g.logIndent++;
  try {
    if (effect.cost) yield* effect.cost(g, card, ctx);
    if (effect.targets) {
      ctx.targets = yield* effect.targets(g, card, ctx);
      if (ctx.targets.length) g.log(`Target${ctx.targets.length > 1 ? 's' : ''}: ${ctx.targets.map((t) => g.name(t)).join(', ')}.`, 'effect');
      for (const t of ctx.targets) g.emit({ type: 'targeted', uid: t, source: uid, player });
    }
  } finally {
    g.logIndent--;
  }

  if (ctx.data['keepOnField']) sendToGYAfter = false;
  if (extra.event) ctx.data['__event'] = extra.event;
  const link: ChainLink = {
    uid,
    effectId,
    player,
    spellSpeed: effect.spellSpeed,
    targets: ctx.targets,
    data: ctx.data,
    sendToGYAfter,
    negated: false,
    label: `${d.name}: ${effect.label}`,
    zone: fromZone,
  };
  g.state.chain.push(link);
  g.emit({ type: 'activated', uid, effectId, player, zone: fromZone });
  return link;
}

/**
 * Negate chain link `index` (0-based). `mode`:
 *  - 'destroy': negate the activation and destroy the card (Champion's Vigilance)
 *  - 'activation': negate the activation; a Continuous/Field/Equip card is sent to the GY (Ghost Belle)
 *  - 'effect': negate only the effect; the card stays as it is (Ash Blossom)
 */
export function* negateChainLink(g: Game, index: number, source: string, mode: boolean | 'destroy' | 'activation' | 'effect'): Process<void> {
  const link = g.state.chain[index];
  if (!link) return;
  const m = mode === true ? 'destroy' : mode === false ? 'activation' : mode;
  for (const src of g.activeFieldCards()) {
    if (src.controller !== link.player) continue;
    const r = getScript(g.name(src.uid))?.preventNegation?.(g, src, link);
    if (r) {
      g.log(`${g.name(link.uid)} cannot be negated: ${r}`, 'rule');
      return;
    }
  }
  link.negated = true;
  g.log(`The ${m === 'effect' ? 'effect' : 'activation'} of ${g.name(link.uid)} (Chain Link ${index + 1}) is negated by ${g.name(source)}.`, 'effect');
  g.fx({ type: 'negate', uid: link.uid });
  const c = g.card(link.uid);
  if (m === 'destroy') {
    if (g.isOnField(c)) yield* g.destroyByEffect([link.uid], source);
  } else if (m === 'activation') {
    const d = g.def(link.uid);
    if ((c.zone === 'spellTrap' || c.zone === 'field') && d.cardType !== 'Monster' && link.effectId === 'activate' && (d.property === 'Continuous' || d.property === 'Field' || d.property === 'Equip')) {
      g.log(`${d.name}'s activation was negated, so it is sent to the Graveyard.`, 'rule');
      g.sendToGraveyard(link.uid, 'rule');
    }
  }
}

/**
 * Window that opens while a monster is being Summoned, in which cards like Champion's Vigilance can negate the Summon.
 * Returns false if the Summon was negated (the monster has been destroyed).
 */
export function* summonWindow(g: Game, uid: string, player: PlayerId, method: 'normal' | 'special' | 'flip', how: string): Process<boolean> {
  // A Summon performed while a chain is resolving (e.g. by Monster Reborn) cannot be negated by
  // "when a monster would be Summoned" cards, so no window opens.
  if (g.state.resolvingChain) return true;
  g.state.summonAttempt = { uid, player, method, how, negated: false };
  g.emit({ type: 'summonAttempt', uid, player, method });
  // Only negation effects are allowed here, so no triggers are processed yet.
  const opponent = g.opponent(player);
  const options = activatableFastEffects(g, opponent, { description: 'summon', summonNegation: true });
  if (options.length > 0) {
    g.state.windowOpen = true;
    const answer = yield {
      type: 'fastEffects',
      player: opponent,
      title: `Negate the Summon of ${g.name(uid)}?`,
      description: `${g.playerName(player)} is ${method === 'normal' ? 'Normal Summoning' : method === 'flip' ? 'Flip Summoning' : 'Special Summoning'} ${g.name(uid)}. You can negate the Summon now, before it is completed.`,
      options,
      context: `${g.name(uid)} is being Summoned`,
      windowKind: 'summon',
    };
    if (answer.activation) {
      const opt = options.find((o) => o.uid === answer.activation!.uid && o.effectId === answer.activation!.effectId);
      if (!opt) throw new Error('Invalid response choice');
      yield* activateEffect(g, opponent, opt.uid, opt.effectId, { openState: false, summonNegation: true });
      yield* buildAndResolveChain(g, { description: `${g.name(uid)} is being Summoned`, kind: 'chain' });
    }
    g.state.windowOpen = false;
  }
  const attempt = g.state.summonAttempt;
  g.state.summonAttempt = null;
  if (attempt?.negated) {
    const c = g.state.cards[uid];
    if (c && g.isMonsterOnField(c)) {
      c.properlySummoned = false; // a negated Special Summon is not a proper Special Summon
      g.log(`The Summon of ${g.name(uid)} is negated, and ${g.name(uid)} is destroyed.`, 'rule');
      g.fx({ type: 'destroy', uid, by: 'effect' });
      g.emit({ type: 'destroyed', uid, reason: 'effect' });
      g.sendToGraveyard(uid, 'destroyedEffect');
    }
    g.emit({ type: 'summonNegated', uid });
    return false;
  }
  return true;
}

/** After a chain link was added: let players respond until both pass, then resolve the chain. */
export function* buildAndResolveChain(g: Game, ctx: WindowContext): Process<void> {
  g.state.windowOpen = true;
  let passes = 0;
  let responder: PlayerId = g.opponent(g.state.chain[g.state.chain.length - 1].player);
  while (passes < 2) {
    const last = g.state.chain[g.state.chain.length - 1];
    const options = activatableFastEffects(g, responder, ctx);
    if (options.length === 0) {
      passes++;
      responder = g.opponent(responder);
      continue;
    }
    const own = last.player === responder;
    const answer = yield {
      type: 'fastEffects',
      player: responder,
      title: own ? `Chain to your own ${g.name(last.uid)}?` : `Respond to ${g.name(last.uid)}?`,
      description: own
        ? `Your opponent did not respond to ${g.name(last.uid)} (Chain Link ${g.state.chain.length}). You may add another card or effect to the chain, or let it resolve.`
        : `${g.playerName(last.player)} activated ${g.name(last.uid)} (Chain Link ${g.state.chain.length}). You may chain a card or effect, or let it resolve.`,
      options,
      context: ctx.description,
      windowKind: 'chain',
    };
    if (!answer.activation) {
      g.log(`${g.playerName(responder)} does not respond.`, 'chain');
      passes++;
      responder = g.opponent(responder);
      continue;
    }
    const opt = options.find((o) => o.uid === answer.activation!.uid && o.effectId === answer.activation!.effectId);
    if (!opt) throw new Error('Invalid response choice');
    yield* activateEffect(g, responder, opt.uid, opt.effectId, { openState: false, damageStepStage: ctx.damageStepStage });
    passes = 0;
    responder = g.opponent(responder);
  }
  yield* resolveChain(g);
  g.state.windowOpen = false;
}

export function* resolveChain(g: Game): Process<void> {
  const chain = g.state.chain;
  if (chain.length === 0) return;
  g.state.resolvingChain = true;
  if (chain.length > 1) g.log(`The chain resolves backwards, starting with Chain Link ${chain.length}.`, 'chain');
  for (let i = chain.length - 1; i >= 0; i--) {
    const link = chain[i];
    g.state.resolvingLinkIndex = i;
    const card = g.card(link.uid);
    const effect = findEffect(g, link.uid, link.effectId);
    g.log(`${chain.length > 1 ? `Chain Link ${i + 1}: ` : ''}${g.name(link.uid)} resolves.`, 'chain');
    g.logIndent++;
    try {
      if (link.negated) {
        g.log(`The effect of ${g.name(link.uid)} was negated, so nothing happens.`, 'effect');
      } else {
        // Targets that left the field / changed zones are no longer valid.
        const ctx: ActivationContext = {
          player: link.player,
          chainLength: i,
          data: link.data,
          targets: link.targets,
          damageStepStage: null,
          event: link.data['__event'] as GameEvent | undefined,
        };
        yield* effect.resolve(g, card, ctx);
      }
    } finally {
      g.logIndent--;
    }
    if (link.sendToGYAfter) {
      const c = g.card(link.uid);
      if ((c.zone === 'spellTrap' || c.zone === 'field') && c.faceUp) {
        let kept = false;
        if (g.def(link.uid).cardType === 'Trap') {
          for (const src of g.activeFieldCards()) {
            if (src.controller !== link.player) continue;
            const hook = getScript(g.name(src.uid))?.afterTrapResolves;
            if (hook && (yield* hook(g, src, c))) {
              kept = true;
              break;
            }
          }
        }
        if (!kept) {
          g.log(`${g.name(link.uid)} finishes resolving and is sent to the Graveyard.`, 'rule');
          g.sendToGraveyard(link.uid, 'resolved');
        }
      }
    }
  }
  g.state.chain = [];
  g.state.resolvingChain = false;
  g.state.resolvingLinkIndex = -1;
  g.emit({ type: 'chainResolved' });
  yield* processTriggers(g);
}

// ---------------------------------------------------------------------------
// Trigger effects
// ---------------------------------------------------------------------------

interface TriggerCandidate {
  uid: string;
  effectId: string;
  player: PlayerId;
  mandatory: boolean;
  event: GameEvent;
  label: string;
  description: string;
}

function collectTriggers(g: Game, events: GameEvent[]): TriggerCandidate[] {
  const out: TriggerCandidate[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    for (const card of candidateCards(g, p)) {
      const script = getScript(g.name(card.uid));
      if (!script) continue;
      for (const effect of script.effects) {
        if (effect.kind !== 'trigger' || !effect.trigger) continue;
        if (!effect.from.includes(card.zone)) continue;
        if (card.treatedAsSpell && g.def(card.uid).cardType === 'Monster') continue;
        if (g.isOnField(card) && card.flags['effectsNegated'] && g.def(card.uid).cardType === 'Monster') continue;
        for (const ev of events) {
          if (!effect.trigger(g, card, ev)) continue;
          // "When ... you can" optional effects miss the timing if the event was not the last thing to happen.
          if (effect.whenYouCan && !effect.mandatory && ev.linkIndex !== undefined && ev.linkIndex > 0) {
            g.log(`${g.name(card.uid)}'s optional "when" effect missed its timing (its trigger was not the last thing to happen in the chain).`, 'rule');
            continue;
          }
          const reason = canActivateEffect(g, p, card, effect, { openState: false, chainSpeed: 0, event: ev });
          if (reason) continue;
          if (out.some((o) => o.uid === card.uid && o.effectId === effect.id)) continue;
          out.push({ uid: card.uid, effectId: effect.id, player: p, mandatory: !!effect.mandatory, event: ev, label: effect.label, description: effect.description });
        }
      }
    }
  }
  return out;
}

/** Process trigger effects for pending events (repeatedly, since resolutions cause new events). */
export function* processTriggers(g: Game): Process<void> {
  let guard = 0;
  while (g.state.pendingEvents.length > 0 && guard++ < 50) {
    const events = g.state.pendingEvents;
    g.state.pendingEvents = [];
    const candidates = collectTriggers(g, events);
    if (candidates.length === 0) continue;
    const tp = g.state.turnPlayer;
    const order = [
      ...candidates.filter((c) => c.mandatory && c.player === tp),
      ...candidates.filter((c) => c.mandatory && c.player !== tp),
      ...candidates.filter((c) => !c.mandatory && c.player === tp),
      ...candidates.filter((c) => !c.mandatory && c.player !== tp),
    ];
    let activatedAny = false;
    for (const cand of order) {
      // re-check (an earlier activation may have changed things)
      const card = g.card(cand.uid);
      const effect = findEffect(g, cand.uid, cand.effectId);
      if (canActivateEffect(g, cand.player, card, effect, { openState: false, chainSpeed: 0, event: cand.event })) continue;
      if (!cand.mandatory) {
        const yes = yield* g.selectOption(
          cand.player,
          `Activate ${g.name(cand.uid)}?`,
          [
            { id: 'yes', label: `Activate: ${cand.label}`, description: cand.description },
            { id: 'no', label: 'Do not activate' },
          ],
          `${g.name(cand.uid)}'s optional trigger effect can be activated now. ${cand.description}`,
        );
        if (yes !== 'yes') {
          g.log(`${g.playerName(cand.player)} chooses not to activate ${g.name(cand.uid)}.`, 'effect');
          continue;
        }
      } else {
        g.log(`${g.name(cand.uid)}'s effect activates (mandatory trigger effect).`, 'effect');
      }
      yield* activateEffect(g, cand.player, cand.uid, cand.effectId, { openState: false, event: cand.event });
      activatedAny = true;
    }
    if (activatedAny && g.state.chain.length > 0) {
      yield* buildAndResolveChain(g, { description: 'trigger effects', kind: 'trigger' });
    }
  }
}

// ---------------------------------------------------------------------------
// Fast-effect windows
// ---------------------------------------------------------------------------

/**
 * Open a fast-effect window: players (in priority order) may activate Spell Speed 2+ cards.
 * Any activation builds a chain which is resolved before the window continues.
 */
export function* fastEffectWindow(g: Game, ctx: WindowContext, order: PlayerId[] = [g.state.turnPlayer, g.opponent(g.state.turnPlayer)]): Process<void> {
  yield* processTriggers(g);
  // Cards that respond to "when X happens" (e.g. Damage Condenser) look at the events of this moment.
  g.state.windowEvents = g.state.recentEvents;
  g.state.recentEvents = [];
  let guard = 0;
  while (guard++ < 30) {
    let activated = false;
    for (const p of order) {
      const options = activatableFastEffects(g, p, ctx);
      if (options.length === 0) continue;
      g.state.windowOpen = true;
      const answer = yield {
        type: 'fastEffects',
        player: p,
        title: 'Response available',
        description: ctx.description,
        options,
        context: ctx.description,
        windowKind: ctx.kind ?? (ctx.damageStepStage ? 'damage' : 'action'),
      };
      if (!answer.activation) {
        g.state.windowOpen = false;
        continue;
      }
      const opt = options.find((o) => o.uid === answer.activation!.uid && o.effectId === answer.activation!.effectId);
      if (!opt) throw new Error('Invalid response choice');
      yield* activateEffect(g, p, opt.uid, opt.effectId, { openState: false, damageStepStage: ctx.damageStepStage });
      yield* buildAndResolveChain(g, ctx);
      activated = true;
      break;
    }
    g.state.windowOpen = false;
    if (!activated) return;
  }
}

/**
 * Standard bookkeeping after an action completes at an open game state: triggers, then a response window.
 * Normal priority: the turn player may respond to their own action first, then the opponent.
 */
export function* afterAction(g: Game, description: string, order?: PlayerId[]): Process<void> {
  yield* fastEffectWindow(g, { description, kind: 'action' }, order ?? [g.state.turnPlayer, g.opponent(g.state.turnPlayer)]);
}

/** Activate an effect from an open game state (turn player's action), then build & resolve the chain. */
export function* activateFromOpenState(g: Game, player: PlayerId, uid: string, effectId: string): Process<void> {
  yield* activateEffect(g, player, uid, effectId, { openState: true });
  yield* buildAndResolveChain(g, { description: `${g.name(uid)} was activated` });
  yield* afterAction(g, `${g.name(uid)} finished resolving`);
}

export function zoneLabel(z: Zone): string {
  switch (z) {
    case 'deck':
      return 'Deck';
    case 'hand':
      return 'hand';
    case 'monster':
      return 'Monster Zone';
    case 'spellTrap':
      return 'Spell & Trap Zone';
    case 'field':
      return 'Field Zone';
    case 'graveyard':
      return 'Graveyard';
    case 'banished':
      return 'banished cards';
    case 'extra':
      return 'Extra Deck';
    case 'extraMonster':
      return 'Extra Monster Zone';
    case 'material':
      return 'Xyz material';
  }
}

/** Run scheduled effects due now (e.g. at the End Phase of this turn). */
export function* runScheduled(g: Game, at: 'END' | 'STANDBY'): Process<void> {
  const due = g.state.scheduled.filter((s) => s.at === at && s.turn <= g.state.turn);
  if (due.length === 0) return;
  g.state.scheduled = g.state.scheduled.filter((s) => !due.includes(s));
  for (const s of due) {
    const h = getScheduledHandler(s.kind);
    if (!h) continue;
    g.log(s.description, 'rule');
    yield* h(g, s);
  }
  yield* processTriggers(g);
}
