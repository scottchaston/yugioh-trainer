/**
 * Core rules-engine types. The whole game state is plain JSON so that it can be
 * cloned (for Undo / replay) and serialised.
 */

export type PlayerId = 0 | 1;

export type Phase = 'DRAW' | 'STANDBY' | 'MAIN1' | 'BATTLE' | 'MAIN2' | 'END';

export const PHASE_LABEL: Record<Phase, string> = {
  DRAW: 'Draw Phase',
  STANDBY: 'Standby Phase',
  MAIN1: 'Main Phase 1',
  BATTLE: 'Battle Phase',
  MAIN2: 'Main Phase 2',
  END: 'End Phase',
};

export type BattleStep = 'START' | 'BATTLE' | 'DAMAGE' | 'END';

/** Where a card is. `monster`/`spellTrap` use `index` 0-4; `extraMonster` uses 0-1 (shared zones). */
export type Zone =
  | 'deck'
  | 'hand'
  | 'monster'
  | 'spellTrap'
  | 'field'
  | 'graveyard'
  | 'banished'
  | 'extra'
  | 'extraMonster'
  /** Attached to an Xyz Monster as material (not on the field). */
  | 'material';

export type Position = 'ATK' | 'DEF';

export interface TempStatMod {
  atk: number;
  def: number;
  /** When the modifier expires. */
  until: 'endOfTurn' | 'endOfDamageStep' | 'permanent';
  source: string;
}

export interface CardInstance {
  uid: string;
  cardId: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  /** Zone index for monster / spellTrap / extraMonster zones. */
  index: number;
  faceUp: boolean;
  /** Battle position for monsters on the field. */
  position: Position | null;
  /** Turn number on which the card arrived in its current on-field zone. */
  turnEnteredField: number;
  /** The card was Normal/Special/Flip Summoned this turn (cannot change position). */
  summonedThisTurn: boolean;
  /** Monster Set this turn (cannot be Flip Summoned) / Spell-Trap Set this turn (Trap & Quick-Play timing). */
  setThisTurn: boolean;
  positionChangedThisTurn: boolean;
  attacksDeclaredThisTurn: number;
  /** For Gemini monsters: has been Gemini Summoned (gained its effect). */
  geminiEffectActive: boolean;
  /**
   * A monster card placed in the Spell & Trap Zone that is treated as a Spell Card there
   * (Crystal Beasts become Continuous Spells; Rider of the Storm Winds becomes an Equip Spell).
   */
  treatedAsSpell: 'continuous' | 'equip' | 'pendulum' | 'artifact' | null;
  /** A Trap Card Special Summoned as a Normal Monster (The Phantom Knights of Shade Brigandine, Traptrix Holeutea). */
  treatedAsMonster: { race: string; attribute: string; level: number; atk: number; def: number } | null;
  /** Xyz Monsters: the cards attached as material (uids). */
  materials: string[];
  /** For a card in the 'material' zone: the Xyz Monster it is attached to. */
  attachedTo: string | null;
  /** Token stats (tokens are created during the Duel and removed when they leave the field). */
  token: { name: string; race: string; attribute: string; level: number; atk: number; def: number } | null;
  /** This monster was Fusion Summoned (relevant for effects that require it). */
  fusionSummoned: boolean;
  /** For Equip Spells: uid of the monster this is equipped to. */
  equippedTo: string | null;
  /** Special Summoned properly (relevant for reviving Extra Deck monsters). */
  properlySummoned: boolean;
  /** Permanent (until leaves field) and temporary stat changes. */
  statMods: TempStatMod[];
  counters: Record<string, number>;
  /** Free-form script state (e.g. "cannotAttackThisTurn"). Cleared when the card leaves the field. */
  flags: Record<string, unknown>;
}

export interface PlayerState {
  name: string;
  deckId: string;
  lp: number;
  deck: string[]; // top of deck is index 0
  hand: string[];
  graveyard: string[]; // last element = top of graveyard
  banished: string[];
  extra: string[];
  monsterZones: (string | null)[];
  spellTrapZones: (string | null)[];
  fieldZone: string | null;
  /** Normal Summon / Set used this turn. */
  normalSummonsUsed: number;
  normalSummonsAllowed: number;
  /** Per-turn effect activation counts: key -> count. */
  effectUses: Record<string, number>;
  /** Restrictions that last for the current turn (e.g. "cannot conduct your Battle Phase"). Cleared each turn. */
  turnFlags: Record<string, unknown>;
  /** Facts that last the whole Duel (e.g. "Special Summoned an Ultimate Crystal monster this Duel"). */
  duelFlags: Record<string, unknown>;
  /** Pendulum Summon already performed this turn. */
  pendulumSummonUsed: boolean;
}

export interface ChainLink {
  uid: string;
  effectId: string;
  player: PlayerId;
  spellSpeed: 1 | 2 | 3;
  targets: string[];
  /** Script-provided data captured at activation (e.g. chosen option). */
  data: Record<string, unknown>;
  /** Whether this link's card should be sent to GY after resolution (Normal Spell/Trap). */
  sendToGYAfter: boolean;
  /** Where the card was when it was activated (hand, Graveyard, field ...). */
  zone: Zone;
  negated: boolean;
  label: string;
}

export interface BattleState {
  step: BattleStep;
  attacker: string | null;
  target: string | null; // null = direct attack
  /** Number of opponent monsters when the attack was declared (replay detection). */
  targetCountAtDeclaration: number;
  damageStepStage: 'start' | 'beforeCalc' | 'calc' | 'afterCalc' | 'end' | null;
  attackNegated: boolean;
  /** The attack is a direct attack allowed by a card effect (e.g. Amethyst Cat) even though monsters are present. */
  directAttackByEffect: boolean;
  /** Battle damage modifiers chosen during this battle, per player: 'half' or 'none'. */
  damageModifier: Record<string, 'half' | 'none' | undefined>;
}

export type LogKind = 'action' | 'effect' | 'rule' | 'battle' | 'lp' | 'phase' | 'system' | 'chain';

export interface LogEntry {
  id: number;
  turn: number;
  phase: Phase;
  kind: LogKind;
  text: string;
  indent: number;
}

export type GameEvent = GameEventBody & {
  /** Set when the event happened while resolving a chain link (0 = the last link to resolve). */
  linkIndex?: number;
};

export type GameEventBody =
  | { type: 'summon'; uid: string; player: PlayerId; method: 'normal' | 'special' | 'flip'; how?: string }
  | { type: 'set'; uid: string; player: PlayerId }
  | { type: 'attackDeclared'; attacker: string; target: string | null }
  | { type: 'toGraveyard'; uid: string; from: Zone; reason: SendReason; source?: string; wasFaceUp: boolean }
  | { type: 'destroyed'; uid: string; reason: 'battle' | 'effect'; source?: string; byPlayer?: PlayerId }
  | { type: 'banished'; uid: string; from: Zone; source?: string; byPlayer?: PlayerId }
  | { type: 'detached'; uid: string; from: string }
  | { type: 'attached'; uid: string; to: string }
  | { type: 'excavated'; uid: string; player: PlayerId }
  | { type: 'leftField'; uid: string; to: Zone }
  | { type: 'phaseStart'; phase: Phase; player: PlayerId }
  | { type: 'activated'; uid: string; effectId: string; player: PlayerId; zone?: Zone }
  | { type: 'chainResolved' }
  | { type: 'lpChange'; player: PlayerId; amount: number; reason: string }
  | { type: 'battleDamage'; player: PlayerId; amount: number; attacker: string }
  | { type: 'positionChanged'; uid: string }
  | { type: 'placedInSpellTrapZone'; uid: string; player: PlayerId }
  | { type: 'drew'; player: PlayerId; uids: string[] }
  | { type: 'cardToHand'; uid: string; player: PlayerId }
  | { type: 'damageCalculated'; attacker: string; target: string | null }
  | { type: 'flipped'; uid: string; how: 'battle' | 'effect' }
  | { type: 'controlChanged'; uid: string; to: PlayerId }
  | { type: 'targeted'; uid: string; source: string; player: PlayerId }
  | { type: 'summonNegated'; uid: string }
  | { type: 'summonAttempt'; uid: string; player: PlayerId; method: 'normal' | 'special' | 'flip' }
  | { type: 'counterAdded'; uid: string; counter: string; amount: number }
  | { type: 'pendulumPlaced'; uid: string; player: PlayerId };

/** A summon that is happening right now (cards like Champion's Vigilance can negate it). */
export interface SummonAttempt {
  uid: string;
  player: PlayerId;
  method: 'normal' | 'special' | 'flip';
  how: string;
  negated: boolean;
}

/** Visual-effect events for the interface (the engine never depends on them). */
export type FxEvent = { id: number } & FxBody;
export type FxBody = (
  | { type: 'attack'; attacker: string; target: string | null; defender: PlayerId }
  | { type: 'activate'; uid: string; player: PlayerId; what: 'spell' | 'trap' | 'monster' }
  | { type: 'destroy'; uid: string; by: 'battle' | 'effect' }
  | { type: 'damage'; player: PlayerId; amount: number }
  | { type: 'heal'; player: PlayerId; amount: number }
  | { type: 'summon'; uid: string; method: 'normal' | 'special' | 'flip' }
  | { type: 'negate'; uid: string }
  | { type: 'flip'; uid: string }
  | { type: 'bounce'; uid: string }
  | { type: 'banish'; uid: string }
  | { type: 'boost'; uid: string; atk: number; def: number }
  | { type: 'control'; uid: string }
  | { type: 'draw'; player: PlayerId; count: number }
  | { type: 'toSpellZone'; uid: string }
  | { type: 'position'; uid: string }
  | { type: 'set'; uid: string }
);

/** Something that must happen later (e.g. "until the End Phase", "destroy during the End Phase of your opponent's 3rd turn"). */
export interface ScheduledEffect {
  id: number;
  /** Phase at which to run. */
  at: 'END' | 'STANDBY';
  /** Turn number at which to run (matches GameState.turn). */
  turn: number;
  kind: string;
  uid?: string;
  data: Record<string, unknown>;
  description: string;
}

export type SendReason = 'destroyedBattle' | 'destroyedEffect' | 'sent' | 'cost' | 'tribute' | 'discard' | 'resolved' | 'material' | 'rule' | 'detached';

export interface GameState {
  turn: number;
  turnPlayer: PlayerId;
  phase: Phase;
  players: [PlayerState, PlayerState];
  cards: Record<string, CardInstance>;
  extraMonsterZones: (string | null)[];
  battle: BattleState | null;
  /** Chain being built/resolved. Empty when no chain. */
  chain: ChainLink[];
  /** Whether we are currently resolving a chain (vs building it). */
  resolvingChain: boolean;
  /** Index of the chain link being resolved (when resolvingChain). */
  resolvingLinkIndex: number;
  /** True while a fast-effect window / chain is open (no Spell Speed 1 actions allowed). */
  windowOpen: boolean;
  /** Events that have happened since the last trigger check. */
  pendingEvents: GameEvent[];
  /** Depth of nested chain resolution (for "last thing to happen" timing). */
  log: LogEntry[];
  nextLogId: number;
  rngState: number;
  winner: PlayerId | null;
  winReason: string | null;
  started: boolean;
  scheduled: ScheduledEffect[];
  nextScheduledId: number;
  /** Continuous Trap <-> monster links (Call of the Haunted, Fiendish Chain): trap uid -> monster uid. */
  links: Record<string, string>;
  /** Summon currently being performed (for summon-negation windows). */
  summonAttempt: SummonAttempt | null;
  /** Events that happened just before the current fast-effect window opened (e.g. battle damage). */
  windowEvents: GameEvent[];
  /** Events since the last window (collected into windowEvents when a window opens). */
  recentEvents: GameEvent[];
  fx: FxEvent[];
  nextFxId: number;
  /** While set (turn number), cards that would be sent to the GY are banished instead (Dimension Shifter). */
  banishInsteadUntilTurn: number | null;
  nextTokenId: number;
}

// ---------------------------------------------------------------------------
// Player prompts (questions the engine asks a player) and answers.
// ---------------------------------------------------------------------------

export interface ActivationOption {
  uid: string;
  effectId: string;
  label: string;
  description: string;
  /** Explanation of the rule that makes this legal now. */
  why?: string;
}

export type Prompt =
  | {
      type: 'selectCards';
      player: PlayerId;
      title: string;
      description?: string;
      cards: string[];
      min: number;
      max: number;
      /** Optional flag to allow cancelling the whole action (only at the start of an action). */
      cancellable?: boolean;
    }
  | {
      type: 'selectOption';
      player: PlayerId;
      title: string;
      description?: string;
      options: { id: string; label: string; description?: string }[];
      cancellable?: boolean;
    }
  | {
      type: 'selectZone';
      player: PlayerId;
      title: string;
      description?: string;
      zones: ZoneRef[];
      cancellable?: boolean;
    }
  | {
      type: 'fastEffects';
      player: PlayerId;
      title: string;
      description: string;
      options: ActivationOption[];
      /** The thing being responded to (for the UI). */
      context: string;
      /** What kind of moment this is (lets the UI offer "don't pause at phase changes"). */
      windowKind: WindowKind;
    };

export type WindowKind = 'phase' | 'endPhase' | 'action' | 'attack' | 'damage' | 'chain' | 'trigger' | 'summon';

export interface ZoneRef {
  player: PlayerId;
  zone: 'monster' | 'spellTrap' | 'field' | 'extraMonster';
  index: number;
}

export interface Answer {
  cards?: string[];
  option?: string;
  zone?: ZoneRef;
  /** For fastEffects prompts: chosen activation, or null to pass. */
  activation?: { uid: string; effectId: string } | null;
  cancel?: boolean;
}

// ---------------------------------------------------------------------------
// Player actions (top-level things a player can do from an open game state)
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'NORMAL_SUMMON'; player: PlayerId; uid: string }
  | { type: 'SET_MONSTER'; player: PlayerId; uid: string }
  | { type: 'FLIP_SUMMON'; player: PlayerId; uid: string }
  | { type: 'CHANGE_POSITION'; player: PlayerId; uid: string }
  | { type: 'SET_SPELL_TRAP'; player: PlayerId; uid: string }
  | { type: 'ACTIVATE'; player: PlayerId; uid: string; effectId: string }
  | { type: 'SPECIAL_SUMMON'; player: PlayerId; uid: string; procId: string }
  | { type: 'GEMINI_SUMMON'; player: PlayerId; uid: string }
  | { type: 'PLACE_PENDULUM'; player: PlayerId; uid: string }
  | { type: 'PENDULUM_SUMMON'; player: PlayerId }
  | { type: 'DECLARE_ATTACK'; player: PlayerId; uid: string }
  | { type: 'TO_BATTLE_PHASE'; player: PlayerId }
  | { type: 'TO_MAIN2'; player: PlayerId }
  | { type: 'TO_END_PHASE'; player: PlayerId }
  | { type: 'END_TURN'; player: PlayerId }
  | { type: 'START_GAME' };

export interface LegalActionInfo {
  action: Action;
  /** Short label for a button, e.g. "Normal Summon". */
  label: string;
  legal: boolean;
  /** Why this is not legal right now (beginner-friendly). */
  reason?: string;
  /** The rule that makes it legal (beginner-friendly). */
  rule?: string;
  /** Card the action belongs to (if any). */
  uid?: string;
}
