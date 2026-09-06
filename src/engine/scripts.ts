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
  /**
   * Can this effect be activated during the Damage Step, and when? See DAMAGE_STEP_WINDOWS in flow.ts.
   * 'beforeCalc' = ATK/DEF modifiers and "during the Damage Step" effects (start / before damage calculation only),
   * 'calc' = "during damage calculation" effects only, 'untilCalc' = battle-damage modifiers (up to and including
   * damage calculation), 'any' = every Damage Step window (Counter Traps), false/undefined = never.
   */
  damageStep?: 'any' | 'beforeCalc' | 'calc' | 'untilCalc' | false;
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
  /** What the effect does, for cards that respond to kinds of effects (Ash Blossom, Ghost Belle). */
  tags?: EffectTag[];
  /** Can be activated in the special window that opens while a monster is being Summoned (to negate the Summon). */
  respondsToSummon?: boolean;
  /** A Trap that may be activated from the hand under a condition (Evenly Matched when you control no cards). */
  fromHand?: (g: Game, card: CardInstance, ctx: ActivationContext) => boolean;
  /** A Set Trap that may be activated the turn it was Set under a condition (Shade Brigandine with no Traps in the GY). */
  canActivateTurnSet?: (g: Game, card: CardInstance, ctx: ActivationContext) => boolean;
}

export type EffectTag = 'searchDeck' | 'summonFromDeck' | 'sendFromDeck' | 'addFromGY' | 'summonFromGY' | 'banishFromGY' | 'specialSummon';

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
  /** Continuous: change a monster's Attribute (e.g. Advanced Dark). */
  modifyAttribute?: (g: Game, self: CardInstance, target: CardInstance) => string | null;
  /** Can this monster attack directly even though the opponent controls monsters? */
  canAttackDirectly?: (g: Game, self: CardInstance) => boolean;
  /** Called at the start of the Damage Step for the attacking and defending monsters (e.g. Topaz Tiger's ATK bonus). */
  onDamageStepStart?: (g: Game, self: CardInstance, role: 'attacker' | 'target') => void;
  /** Continuous: extra Normal Summons of certain monsters (Rainbow Bridge of the Heart). Return a reason if `card` cannot use it. */
  extraNormalSummon?: (g: Game, self: CardInstance, card: CardInstance) => string | null;
  /** Special Summon procedures the card offers from a given zone (e.g. Rainbow Dragon from hand, Gemini Summon). */
  specialSummon?: SpecialSummonProcedure[];
  /** Called when the card leaves the field, to clean up related state (equips etc.). */
  onLeaveField?: (g: Game, self: CardInstance) => void;
  /** Name the card is treated as having while on the field / in the GY (Scarlight Red Dragon Archfiend). */
  treatedAsName?: (g: Game, self: CardInstance) => string | null;
  /** Continuous: is this card unaffected by the effects of `source` (Traptrix monsters vs "Hole" Normal Traps)? */
  unaffectedBy?: (g: Game, self: CardInstance, source: CardInstance) => boolean;
  /** Continuous: may the controller activate `trap` from the hand (Traptrix Atrax: "Hole" Normal Traps)? */
  allowTrapActivationFromHand?: (g: Game, self: CardInstance, trap: CardInstance) => boolean;
  /** Continuous: the activation/effect of `link`'s card cannot be negated (Traptrix Atrax: Normal Traps on your field). */
  preventNegation?: (g: Game, self: CardInstance, link: { uid: string; player: PlayerId; zone: Zone }) => string | null;
  /** After a Trap the controller activated finishes resolving: return true to keep it on the field instead of sending it to the GY (Traptrix Cularia Sets it again). */
  afterTrapResolves?: (g: Game, self: CardInstance, trap: CardInstance) => Process<boolean>;
  /** Synchro material rules for this monster: it may be used as a non-Tuner (Phantom King Hydride), or only for certain Synchro Monsters (Magical King Moonstar). */
  synchroAsNonTuner?: boolean;
  synchroMaterialRestriction?: (g: Game, self: CardInstance, synchroUid: string) => string | null;
  /** Xyz Summon requirements (for Xyz Monsters). */
  xyz?: XyzRequirement;
  /** Link Summon requirements (for Link Monsters). */
  link?: LinkRequirement;
  /** Special Summon procedures that are not Summons (Artifact Moralltach: Set as a Spell) use this label after they complete. */
  procedureIsNotSummon?: boolean;
  /** Continuous: while this card is face-up, any card sent to the GY is banished instead (Retaliating "C"). */
  banishInsteadOfGraveyard?: (g: Game, self: CardInstance) => boolean;
  /** From the Graveyard: replace the destruction of `target` (Soul Resonator banishes itself instead). Return true if replaced. */
  replaceDestructionFromGraveyard?: (g: Game, self: CardInstance, target: CardInstance, reason: 'battle' | 'effect') => Process<boolean>;
  /** "Cannot be destroyed by an opponent's card effects." */
  immuneToOpponentEffectDestruction?: boolean;
}

export interface SynchroRequirement {
  /** Does this monster qualify as the Tuner? (default: any Tuner) */
  tuner?: (g: Game, card: CardInstance) => boolean;
  /** Does this monster qualify as a non-Tuner material? (default: any non-Tuner) */
  nonTuner?: (g: Game, card: CardInstance) => boolean;
  /** Number of Tuners required (default 1; Red Nova Dragon needs 2, Red Supernova Dragon 3). */
  tuners?: number;
  /** Number of non-Tuner materials allowed [min, max] (default [1, any]). */
  nonTuners?: [number, number];
  /** Human-readable material text. */
  text: string;
}

export interface XyzRequirement {
  /** Level the materials must have. */
  level: number;
  /** Number of materials [min, max]. */
  count: [number, number];
  /** Extra material filter (default: any face-up monster of that Level). */
  material?: (g: Game, card: CardInstance) => boolean;
  text: string;
}

export interface LinkRequirement {
  /** Number of materials [min, max] (Link Monsters may count as 1 or as their Link Rating). */
  count: [number, number];
  /** Material filter (default: any face-up monster). */
  material?: (g: Game, card: CardInstance) => boolean;
  /** At least one material must satisfy this (Traptrix Atypus: "including an Insect or Plant monster"). */
  including?: (g: Game, card: CardInstance) => boolean;
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
