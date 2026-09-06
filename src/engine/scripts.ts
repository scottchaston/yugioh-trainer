/**
 * Card-effect script interface. Card effects live in src/effects and register
 * themselves here. The rules engine calls into scripts; scripts never touch the UI.
 */
import type { Game } from './game';
import type { CardInstance, GameEvent, PlayerId, Prompt, Answer, Zone } from './types';

/** A resumable step-by-step procedure that may pause to ask a player a question. */
export type Process<T = void> = Generator<Prompt, T, Answer>;

export type EffectKind =
  /** Activating a Spell/Trap card itself (from hand or Set). */
  | 'activate'
  /** Ignition effect: monster effect activated manually in your Main Phase. */
  | 'ignition'
  /** Quick effect: can be activated at fast-effect timing. */
  | 'quick'
  /** Trigger effect: activates in response to an event. */
  | 'trigger'
  /** Ignition-like effect of a face-up Continuous Spell/Trap (e.g. Rainbow Ruins draw). */
  | 'continuousIgnition';

export interface ActivationContext {
  player: PlayerId;
  /** Whether this activation is chained to something (chain length before this link). */
  chainLength: number;
  /** The event that triggered this (trigger effects only). */
  event?: GameEvent;
  /** Damage step stage if activating during the Damage Step. */
  damageStepStage?: 'start' | 'beforeCalc' | 'calc' | 'afterCalc' | 'end' | null;
  /** Free-form data stored on the chain link (targets, chosen options ...). */
  data: Record<string, unknown>;
  targets: string[];
}

export interface EffectDef {
  id: string;
  /** Menu label, e.g. "Activate", "Special Summon 1 Dragon Normal Monster". */
  label: string;
  /** Plain-language description of what the effect does. */
  description: string;
  kind: EffectKind;
  spellSpeed: 1 | 2 | 3;
  /** Zones the card must be in for this effect to be usable. */
  from: Zone[];
  /** For trigger effects: does `event` trigger this card? */
  trigger?: (g: Game, card: CardInstance, event: GameEvent) => boolean;
  /** Trigger effects: mandatory (activates automatically) or optional ("you can"). */
  mandatory?: boolean;
  /** Optional trigger effects that use "When ... you can" miss the timing if the event was not the last thing to happen. */
  whenYouCan?: boolean;
  /** Can this effect be activated during the Damage Step? 'calc' = only during damage calculation window (ATK/DEF modifiers), 'any' = any damage step window. */
  damageStep?: 'any' | 'calc' | false;
  /** Extra activation requirements. Return null if OK, otherwise a beginner-friendly reason. */
  condition?: (g: Game, card: CardInstance, ctx: ActivationContext) => string | null;
  /** Activation cost, paid before the effect goes on the chain. */
  cost?: (g: Game, card: CardInstance, ctx: ActivationContext) => Process<void>;
  /** Choose targets at activation. Return the chosen uids (may be empty). */
  targets?: (g: Game, card: CardInstance, ctx: ActivationContext) => Process<string[]>;
  /** Effect resolution. */
  resolve: (g: Game, card: CardInstance, ctx: ActivationContext) => Process<void>;
  /** "You can only activate 1 X per turn" (counts by card name). */
  hardOncePerTurn?: boolean;
  /** "Once per turn" (counts by this card instance). */
  oncePerTurn?: boolean;
  /** Effects like Honest that are activated from the hand by revealing/sending it. */
  hidden?: boolean;
  /** Several effects of one card that share a single "once per turn" (e.g. Maiden with Eyes of Blue). */
  oncePerTurnGroup?: string;
  /** Can be activated in the special window that opens while a monster is being Summoned (to negate the Summon). */
  respondsToSummon?: boolean;
}

export interface StatModification {
  atk?: number;
  def?: number;
}

export interface CardScript {
  /** Card name this script implements. */
  name: string;
  effects: EffectDef[];
  /** Continuous stat modification applied by this card (while face-up on the field) to `target`. */
  modifyStats?: (g: Game, self: CardInstance, target: CardInstance) => StatModification | null;
  /** Continuous: can `target` be targeted by `source` effect? Return a reason if not. */
  preventTargeting?: (g: Game, self: CardInstance, target: CardInstance, sourcePlayer: PlayerId) => string | null;
  /** Continuous: can `target` be destroyed by a card effect? Return a reason if not. */
  preventEffectDestruction?: (g: Game, self: CardInstance, target: CardInstance) => string | null;
  /** Continuous: can `target` be destroyed by battle? Return a reason if not. */
  preventBattleDestruction?: (g: Game, self: CardInstance, target: CardInstance) => string | null;
  /** Continuous: can `attacker` attack `target` (null = direct attack)? Return a reason if not. */
  restrictAttack?: (g: Game, self: CardInstance, attacker: CardInstance, target: CardInstance | null) => string | null;
  /** Continuous: extra attacks allowed for `monster` (e.g. "can make a second attack"). */
  extraAttacks?: (g: Game, self: CardInstance, monster: CardInstance) => number;
  /** Continuous: does `monster` inflict piercing battle damage? */
  piercing?: (g: Game, self: CardInstance, monster: CardInstance) => boolean;
  /** Summoning condition: can this card be Normal Summoned/Set? Return reason if not. */
  cannotNormalSummon?: string;
  /** Instead of being destroyed / sent to GY from a Monster Zone, run this (Crystal Beasts). Return true if replaced. */
  onWouldBeDestroyedInMonsterZone?: (g: Game, self: CardInstance, reason: 'battle' | 'effect') => Process<boolean>;
  /** Continuous: replace the destruction of another card (e.g. an Equip that is destroyed instead). Return true if replaced. */
  replaceDestruction?: (g: Game, self: CardInstance, target: CardInstance, reason: 'battle' | 'effect') => Process<boolean>;
  /** Continuous: prevent `card`'s effect from being activated by `player`. Return a reason if prevented. */
  preventActivation?: (g: Game, self: CardInstance, card: CardInstance, effect: EffectDef, player: PlayerId) => string | null;
  /** How many Tributes this monster counts as when Tributed for `forUid` (Kaiser Sea Horse). */
  tributeValue?: (g: Game, self: CardInstance, forUid: string) => number;
  /** Synchro Summon requirements (for Synchro Monsters). */
  synchro?: SynchroRequirement;
  /** Special Summon procedures the card offers from a given zone (e.g. Rainbow Dragon from hand, Gemini Summon). */
  specialSummon?: SpecialSummonProcedure[];
  /** Called when the card leaves the field, to clean up related state (equips etc.). */
  onLeaveField?: (g: Game, self: CardInstance) => void;
}

export interface SynchroRequirement {
  /** Does this monster qualify as the Tuner? (default: any Tuner) */
  tuner?: (g: Game, card: CardInstance) => boolean;
  /** Does this monster qualify as a non-Tuner material? (default: any non-Tuner) */
  nonTuner?: (g: Game, card: CardInstance) => boolean;
  /** Human-readable material text. */
  text: string;
}

export interface SpecialSummonProcedure {
  id: string;
  label: string;
  description: string;
  from: Zone[];
  /** null = OK, otherwise reason. */
  condition: (g: Game, card: CardInstance, player: PlayerId) => string | null;
  /** Perform the procedure (choose materials, etc.) and return true if the summon happened. */
  perform: (g: Game, card: CardInstance, player: PlayerId) => Process<boolean>;
}

const registry = new Map<string, CardScript>();

export function registerScript(script: CardScript): void {
  registry.set(script.name, script);
}

export function getScript(name: string): CardScript | undefined {
  return registry.get(name);
}

export function allScripts(): CardScript[] {
  return [...registry.values()];
}

// ---------------------------------------------------------------------------
// Scheduled effects ("until the End Phase", "during your next Standby Phase" ...)
// ---------------------------------------------------------------------------
import type { ScheduledEffect } from './types';

export type ScheduledHandler = (g: Game, s: ScheduledEffect) => Process<void>;
const scheduledHandlers = new Map<string, ScheduledHandler>();

export function registerScheduledHandler(kind: string, handler: ScheduledHandler): void {
  scheduledHandlers.set(kind, handler);
}
export function getScheduledHandler(kind: string): ScheduledHandler | undefined {
  return scheduledHandlers.get(kind);
}
