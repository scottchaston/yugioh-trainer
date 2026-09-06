/**
 * Mutable wrapper around GameState used while executing an action. All rules
 * helpers (moving cards, damage, prompts) live here so that card scripts stay small.
 */
import { getCard, isExtraDeckMonster, type CardDefinition } from '../cards';
import { getScript } from './scripts';
import { summonWindow } from './flow';
import type { Process } from './scripts';
import { shuffleWithState } from './rng';
import type {
  Answer,
  CardInstance,
  FxBody,
  FxEvent,
  GameEvent,
  GameState,
  LogKind,
  PlayerId,
  PlayerState,
  Position,
  Prompt,
  SendReason,
  Zone,
  ZoneRef,
} from './types';

export class GameOver extends Error {
  constructor(public winner: PlayerId | null, public reason: string) {
    super(`Game over: ${reason}`);
  }
}

export class Game {
  logIndent = 0;

  constructor(public state: GameState) {}

  // ----------------------------------------------------------------- basics
  card(uid: string): CardInstance {
    const c = this.state.cards[uid];
    if (!c) throw new Error(`No card instance ${uid}`);
    return c;
  }
  def(uid: string): CardDefinition {
    return getCard(this.card(uid).cardId);
  }
  name(uid: string): string {
    return this.def(uid).name;
  }
  script(uid: string) {
    return getScript(this.name(uid));
  }
  player(p: PlayerId): PlayerState {
    return this.state.players[p];
  }
  opponent(p: PlayerId): PlayerId {
    return p === 0 ? 1 : 0;
  }
  playerName(p: PlayerId): string {
    return this.player(p).name;
  }
  get turnPlayer(): PlayerId {
    return this.state.turnPlayer;
  }

  // -------------------------------------------------------------------- log
  log(text: string, kind: LogKind = 'action'): void {
    this.state.log.push({
      id: this.state.nextLogId++,
      turn: this.state.turn,
      phase: this.state.phase,
      kind,
      text,
      indent: this.logIndent,
    });
  }
  indent<T>(fn: () => T): T {
    this.logIndent++;
    try {
      return fn();
    } finally {
      this.logIndent--;
    }
  }

  emit(e: GameEvent): void {
    if (this.state.resolvingChain) e.linkIndex = this.state.resolvingLinkIndex;
    this.state.pendingEvents.push(e);
    this.state.recentEvents.push(e);
  }

  /** Record a visual effect for the interface (never affects rules). */
  fx(e: FxBody): void {
    const ev = { ...e, id: this.state.nextFxId++ } as FxEvent;
    this.state.fx.push(ev);
    if (this.state.fx.length > 60) this.state.fx.splice(0, this.state.fx.length - 60);
  }

  // ------------------------------------------------------------- queries
  fieldMonsters(p: PlayerId): CardInstance[] {
    const out: CardInstance[] = [];
    for (const uid of this.player(p).monsterZones) if (uid) out.push(this.card(uid));
    for (const uid of this.state.extraMonsterZones) {
      if (uid && this.card(uid).controller === p) out.push(this.card(uid));
    }
    return out;
  }
  /** Cards in the Spell & Trap Zone (5 zones), not the Field Zone. */
  spellTrapCards(p: PlayerId): CardInstance[] {
    const out: CardInstance[] = [];
    for (const uid of this.player(p).spellTrapZones) if (uid) out.push(this.card(uid));
    return out;
  }
  fieldSpell(p: PlayerId): CardInstance | null {
    const uid = this.player(p).fieldZone;
    return uid ? this.card(uid) : null;
  }
  /** All face-up cards on the field for both players (for continuous effects). */
  faceUpFieldCards(): CardInstance[] {
    const out: CardInstance[] = [];
    for (const p of [0, 1] as PlayerId[]) {
      for (const c of this.fieldMonsters(p)) if (c.faceUp) out.push(c);
      for (const c of this.spellTrapCards(p)) if (c.faceUp) out.push(c);
      const f = this.fieldSpell(p);
      if (f && f.faceUp) out.push(f);
    }
    return out;
  }
  /** Face-up field cards whose effects are not negated (sources of continuous effects). */
  activeFieldCards(): CardInstance[] {
    return this.faceUpFieldCards().filter((c) => !c.flags['effectsNegated']);
  }
  /**
   * Is this card currently a Normal Monster? True for Normal Monsters, and for Gemini monsters
   * that are on the field without their effect, or in the Graveyard.
   */
  isNormalMonster(uid: string): boolean {
    const c = this.card(uid);
    const d = this.def(uid);
    if (d.cardType !== 'Monster') return false;
    if (d.monsterTypes?.includes('Normal')) return true;
    if (d.monsterTypes?.includes('Gemini')) {
      if (this.isMonsterOnField(c)) return !c.geminiEffectActive;
      if (c.zone === 'graveyard') return true;
    }
    return false;
  }
  hand(p: PlayerId): CardInstance[] {
    return this.player(p).hand.map((u) => this.card(u));
  }
  graveyard(p: PlayerId): CardInstance[] {
    return this.player(p).graveyard.map((u) => this.card(u));
  }
  freeMonsterZones(p: PlayerId): number[] {
    const out: number[] = [];
    this.player(p).monsterZones.forEach((u, i) => {
      if (!u) out.push(i);
    });
    return out;
  }
  freeSpellTrapZones(p: PlayerId): number[] {
    const out: number[] = [];
    this.player(p).spellTrapZones.forEach((u, i) => {
      if (!u) out.push(i);
    });
    return out;
  }
  isOnField(c: CardInstance): boolean {
    return c.zone === 'monster' || c.zone === 'spellTrap' || c.zone === 'field' || c.zone === 'extraMonster';
  }
  isMonsterOnField(c: CardInstance): boolean {
    return c.zone === 'monster' || c.zone === 'extraMonster';
  }
  /** A "Crystal Beast" card in the S/T zone counts as a Continuous Spell, not a monster. */
  isMonsterCard(c: CardInstance): boolean {
    return this.def(c.uid).cardType === 'Monster';
  }

  // ---------------------------------------------------------------- stats
  /** Current ATK/DEF including continuous effects and temporary modifiers. */
  stats(uid: string): { atk: number; def: number; originalAtk: number; originalDef: number } {
    const c = this.card(uid);
    const d = this.def(uid);
    let atk = d.atk ?? 0;
    let def = d.def ?? 0;
    const originalAtk = atk;
    const originalDef = def;
    for (const m of c.statMods) {
      atk += m.atk;
      def += m.def;
    }
    if (this.isMonsterOnField(c)) {
      for (const src of this.activeFieldCards()) {
        const s = getScript(this.name(src.uid));
        if (s?.modifyStats) {
          const m = s.modifyStats(this, src, c);
          if (m) {
            atk += m.atk ?? 0;
            def += m.def ?? 0;
          }
        }
      }
    }
    return { atk: Math.max(0, atk), def: Math.max(0, def), originalAtk, originalDef };
  }

  addStatMod(uid: string, atk: number, def: number, until: 'endOfTurn' | 'endOfDamageStep' | 'permanent', source: string): void {
    this.card(uid).statMods.push({ atk, def, until, source });
    this.fx({ type: 'boost', uid, atk, def });
  }

  /** Place a monster card in the Spell & Trap Zone, treated as a Spell Card there. */
  *placeMonsterAsSpell(uid: string, player: PlayerId, kind: 'continuous' | 'equip'): Process<boolean> {
    const free = this.freeSpellTrapZones(player);
    if (free.length === 0) {
      this.log(`${this.playerName(player)} has no free Spell & Trap Zone for ${this.name(uid)}.`, 'rule');
      return false;
    }
    const zone = yield* this.chooseSpellTrapZone(player, `Choose a Spell & Trap Zone for ${this.name(uid)}`);
    const c = this.card(uid);
    if (this.isOnField(c)) {
      // Leaving the Monster Zone: clean up equips etc. but keep the card on the field.
      this.detach(c);
      this.leaveFieldCleanup(c, 'spellTrap');
    } else {
      this.detach(c);
    }
    this.placeSpellTrap(uid, player, zone, true);
    c.treatedAsSpell = kind;
    this.fx({ type: 'toSpellZone', uid });
    this.emit({ type: 'placedInSpellTrapZone', uid, player });
    return true;
  }

  expireStatMods(until: 'endOfTurn' | 'endOfDamageStep'): void {
    for (const c of Object.values(this.state.cards)) {
      if (c.statMods.length) c.statMods = c.statMods.filter((m) => m.until !== until);
    }
  }

  // --------------------------------------------------------------- prompts
  *selectCards(
    player: PlayerId,
    title: string,
    cards: string[],
    min: number,
    max: number,
    description?: string,
    cancellable = false,
  ): Process<string[]> {
    if (cards.length === 0 && min === 0) return [];
    if (cards.length < min) throw new Error(`Cannot select ${min} cards from ${cards.length}`);
    // A forced choice (exactly the required number available) is made automatically.
    if (cards.length === min && max >= min && min > 0) return cards.slice();
    const answer: Answer = yield { type: 'selectCards', player, title, description, cards, min, max, cancellable };
    if (answer.cancel && cancellable) throw new ActionCancelled();
    const chosen = answer.cards ?? [];
    for (const u of chosen) if (!cards.includes(u)) throw new Error(`Invalid selection ${u}`);
    if (chosen.length < min || chosen.length > max) throw new Error(`Must select between ${min} and ${max} cards`);
    return chosen;
  }

  *selectOption(
    player: PlayerId,
    title: string,
    options: { id: string; label: string; description?: string }[],
    description?: string,
    cancellable = false,
  ): Process<string> {
    const answer: Answer = yield { type: 'selectOption', player, title, description, options, cancellable };
    if (answer.cancel && cancellable) throw new ActionCancelled();
    const id = answer.option;
    if (!id || !options.some((o) => o.id === id)) throw new Error(`Invalid option ${id}`);
    return id;
  }

  *confirm(player: PlayerId, title: string, description?: string): Process<boolean> {
    const id = yield* this.selectOption(
      player,
      title,
      [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      description,
    );
    return id === 'yes';
  }

  *selectZone(player: PlayerId, title: string, zones: ZoneRef[], description?: string, cancellable = false): Process<ZoneRef> {
    if (zones.length === 0) throw new Error('No zone available');
    const answer: Answer = yield { type: 'selectZone', player, title, description, zones, cancellable };
    if (answer.cancel && cancellable) throw new ActionCancelled();
    const z = answer.zone;
    if (!z || !zones.some((x) => x.player === z.player && x.zone === z.zone && x.index === z.index)) {
      throw new Error('Invalid zone');
    }
    return z;
  }

  /** Ask the player to pick a free Monster Zone (or auto-pick if only one). */
  *chooseMonsterZone(player: PlayerId, title: string): Process<number> {
    const free = this.freeMonsterZones(player);
    if (free.length === 0) throw new Error('No free Monster Zone');
    if (free.length === 1) return free[0];
    const z = yield* this.selectZone(
      player,
      title,
      free.map((index) => ({ player, zone: 'monster' as const, index })),
    );
    return z.index;
  }

  *chooseSpellTrapZone(player: PlayerId, title: string): Process<number> {
    const free = this.freeSpellTrapZones(player);
    if (free.length === 0) throw new Error('No free Spell & Trap Zone');
    if (free.length === 1) return free[0];
    const z = yield* this.selectZone(
      player,
      title,
      free.map((index) => ({ player, zone: 'spellTrap' as const, index })),
    );
    return z.index;
  }

  // ---------------------------------------------------------- card movement
  private detach(c: CardInstance): Zone {
    const from = c.zone;
    const owner = this.player(c.owner);
    const ctrl = this.player(c.controller);
    switch (c.zone) {
      case 'deck':
        owner.deck = owner.deck.filter((u) => u !== c.uid);
        break;
      case 'hand':
        owner.hand = owner.hand.filter((u) => u !== c.uid);
        break;
      case 'graveyard':
        owner.graveyard = owner.graveyard.filter((u) => u !== c.uid);
        break;
      case 'banished':
        owner.banished = owner.banished.filter((u) => u !== c.uid);
        break;
      case 'extra':
        owner.extra = owner.extra.filter((u) => u !== c.uid);
        break;
      case 'monster':
        if (ctrl.monsterZones[c.index] === c.uid) ctrl.monsterZones[c.index] = null;
        break;
      case 'spellTrap':
        if (ctrl.spellTrapZones[c.index] === c.uid) ctrl.spellTrapZones[c.index] = null;
        break;
      case 'field':
        if (ctrl.fieldZone === c.uid) ctrl.fieldZone = null;
        break;
      case 'extraMonster':
        if (this.state.extraMonsterZones[c.index] === c.uid) this.state.extraMonsterZones[c.index] = null;
        break;
    }
    return from;
  }

  private leaveFieldCleanup(c: CardInstance, to: Zone): void {
    const wasOnField = this.isOnField(c);
    if (!wasOnField) return;
    // Equip cards attached to this monster are destroyed (handled by rule: sent to GY).
    const script = getScript(this.name(c.uid));
    script?.onLeaveField?.(this, c);
    if (this.isMonsterOnField(c)) {
      for (const other of Object.values(this.state.cards)) {
        if (other.equippedTo === c.uid && other.zone === 'spellTrap') {
          this.log(`${this.name(other.uid)} is sent to the Graveyard because the monster it was equipped to left the field.`, 'rule');
          this.sendToGraveyard(other.uid, 'rule');
        }
      }
    }
    c.position = null;
    c.faceUp = to === 'graveyard' || to === 'banished';
    c.summonedThisTurn = false;
    c.setThisTurn = false;
    c.positionChangedThisTurn = false;
    c.attacksDeclaredThisTurn = 0;
    c.geminiEffectActive = false;
    c.treatedAsSpell = null;
    c.equippedTo = null;
    c.statMods = [];
    c.counters = {};
    c.flags = {};
    c.controller = c.owner;
    // Links to Continuous Traps are resolved by the trap scripts (they see the leftField event).
    this.emit({ type: 'leftField', uid: c.uid, to });
    if (this.state.battle) {
      const b = this.state.battle;
      if (b.attacker === c.uid) b.attacker = null;
      if (b.target === c.uid) b.target = null;
    }
  }

  sendToGraveyard(uid: string, reason: SendReason, source?: string): void {
    const c = this.card(uid);
    const wasFaceUp = c.faceUp;
    const from = this.detach(c);
    this.leaveFieldCleanup(c, 'graveyard');
    c.zone = 'graveyard';
    c.index = -1;
    c.faceUp = true;
    c.properlySummoned = false;
    this.player(c.owner).graveyard.push(uid);
    this.emit({ type: 'toGraveyard', uid, from, reason, source, wasFaceUp });
  }

  banish(uid: string, faceUp = true): void {
    const c = this.card(uid);
    const from = this.detach(c);
    this.leaveFieldCleanup(c, 'banished');
    c.zone = 'banished';
    c.index = -1;
    c.faceUp = faceUp;
    c.properlySummoned = false;
    this.player(c.owner).banished.push(uid);
    this.fx({ type: 'banish', uid });
    this.emit({ type: 'banished', uid, from });
  }

  toHand(uid: string): void {
    const c = this.card(uid);
    if (isExtraDeckMonster(this.def(uid))) {
      this.log(`${this.name(uid)} is an Extra Deck monster, so it returns to the Extra Deck instead of the hand.`, 'rule');
      this.toDeck(uid, 'top');
      return;
    }
    if (this.isOnField(c)) this.fx({ type: 'bounce', uid });
    this.detach(c);
    this.leaveFieldCleanup(c, 'hand');
    c.zone = 'hand';
    c.index = -1;
    c.faceUp = false;
    c.properlySummoned = false;
    this.player(c.owner).hand.push(uid);
    this.emit({ type: 'cardToHand', uid, player: c.owner });
  }

  /** Flip a face-down monster face-up by a card effect. */
  flipFaceUp(uid: string): void {
    const c = this.card(uid);
    if (c.faceUp) return;
    c.faceUp = true;
    const st = this.stats(uid);
    this.log(`${this.name(uid)} is flipped face-up (ATK ${st.atk} / DEF ${st.def}).`, 'effect');
    this.fx({ type: 'flip', uid });
    this.emit({ type: 'flipped', uid, how: 'effect' });
  }

  /** Change the battle position of a monster by a card effect (does not use up the manual position change). */
  changePositionByEffect(uid: string, position: Position): void {
    const c = this.card(uid);
    if (!this.isMonsterOnField(c)) return;
    if (!c.faceUp) c.faceUp = true;
    c.position = position;
    this.log(`${this.name(uid)} is changed to ${position === 'ATK' ? 'Attack' : 'Defense'} Position.`, 'effect');
    this.emit({ type: 'positionChanged', uid });
  }

  /** Move a monster to `to`'s side of the field. Returns false if they have no free zone. */
  *changeControl(uid: string, to: PlayerId): Process<boolean> {
    const c = this.card(uid);
    if (!this.isMonsterOnField(c) || c.controller === to) return false;
    const free = this.freeMonsterZones(to);
    if (free.length === 0) {
      this.log(`${this.playerName(to)} has no free Monster Zone, so control of ${this.name(uid)} cannot change.`, 'rule');
      return false;
    }
    const zone = yield* this.chooseMonsterZone(to, `Choose a Monster Zone for ${this.name(uid)}`);
    const keep = { faceUp: c.faceUp, position: c.position, turnEnteredField: c.turnEnteredField, attacks: c.attacksDeclaredThisTurn, statMods: c.statMods, flags: c.flags, counters: c.counters, gemini: c.geminiEffectActive, proper: c.properlySummoned };
    this.detach(c);
    c.zone = 'monster';
    c.index = zone;
    c.controller = to;
    c.faceUp = keep.faceUp;
    c.position = keep.position;
    c.turnEnteredField = this.state.turn; // cannot change position the turn control changes
    c.attacksDeclaredThisTurn = keep.attacks;
    c.statMods = keep.statMods;
    c.flags = keep.flags;
    c.counters = keep.counters;
    c.geminiEffectActive = keep.gemini;
    c.properlySummoned = keep.proper;
    this.player(to).monsterZones[zone] = uid;
    this.log(`${this.playerName(to)} takes control of ${this.name(uid)}.`, 'effect');
    this.fx({ type: 'control', uid });
    this.emit({ type: 'controlChanged', uid, to });
    return true;
  }

  /**
   * Special Summon a monster to `player`'s field. Returns false if it could not be summoned.
   * `how` is a short description for the log (e.g. "by Monster Reborn").
   */
  *specialSummon(
    uid: string,
    player: PlayerId,
    opts: { position?: Position | 'choose'; faceUp?: boolean; how: string; proper?: boolean },
  ): Process<boolean> {
    const c = this.card(uid);
    const d = this.def(uid);
    if (this.freeMonsterZones(player).length === 0) {
      this.log(`${d.name} cannot be Special Summoned because ${this.playerName(player)} has no free Monster Zone.`, 'rule');
      return false;
    }
    if (isExtraDeckMonster(d) && (c.zone === 'graveyard' || c.zone === 'banished') && !c.properlySummoned) {
      this.log(`${d.name} cannot be Special Summoned from the ${c.zone === 'graveyard' ? 'Graveyard' : 'banished cards'} because it was not properly Special Summoned first.`, 'rule');
      return false;
    }
    let position: Position = 'ATK';
    if (opts.position === 'choose') {
      const choice = yield* this.selectOption(player, `Special Summon ${d.name} in which position?`, [
        { id: 'ATK', label: 'Attack Position' },
        { id: 'DEF', label: 'Defense Position' },
      ]);
      position = choice as Position;
    } else if (opts.position) {
      position = opts.position;
    }
    const zone = yield* this.chooseMonsterZone(player, `Choose a Monster Zone for ${d.name}`);
    const faceUp = opts.faceUp ?? true;
    this.placeMonster(uid, player, zone, position, faceUp);
    c.summonedThisTurn = true;
    if (opts.proper) c.properlySummoned = true;
    const st = this.stats(uid);
    this.log(`${d.name} is Special Summoned ${opts.how} (ATK ${st.atk} / DEF ${st.def}) in ${faceUp ? '' : 'face-down '}${position === 'ATK' ? 'Attack' : 'Defense'} Position.`, 'effect');
    this.fx({ type: 'summon', uid, method: 'special' });
    if (faceUp) {
      const ok = yield* summonWindow(this, uid, player, 'special', opts.how);
      if (!ok) return false;
    }
    this.emit({ type: 'summon', uid, player, method: 'special', how: opts.how });
    return true;
  }

  // ------------------------------------------------------------------ links
  /** Link a Continuous Trap to the monster it summoned/affects. */
  link(trapUid: string, monsterUid: string): void {
    this.state.links[trapUid] = monsterUid;
  }
  linkedMonster(trapUid: string): string | null {
    return this.state.links[trapUid] ?? null;
  }
  unlink(trapUid: string): void {
    delete this.state.links[trapUid];
  }

  // ------------------------------------------------------------- scheduling
  schedule(at: 'END' | 'STANDBY', turn: number, kind: string, description: string, uid?: string, data: Record<string, unknown> = {}): void {
    this.state.scheduled.push({ id: this.state.nextScheduledId++, at, turn, kind, uid, data, description });
  }

  toDeck(uid: string, where: 'top' | 'bottom' | 'shuffle'): void {
    const c = this.card(uid);
    this.detach(c);
    this.leaveFieldCleanup(c, 'deck');
    const d = this.def(uid);
    c.zone = isExtraDeckMonster(d) ? 'extra' : 'deck';
    c.index = -1;
    c.faceUp = false;
    c.properlySummoned = false;
    const owner = this.player(c.owner);
    if (c.zone === 'extra') {
      owner.extra.push(uid);
      return;
    }
    if (where === 'top') owner.deck.unshift(uid);
    else owner.deck.push(uid);
    if (where === 'shuffle') this.shuffleDeck(c.owner);
  }

  shuffleDeck(p: PlayerId): void {
    const r = shuffleWithState(this.player(p).deck, this.state.rngState);
    this.player(p).deck = r.result;
    this.state.rngState = r.state;
  }

  draw(p: PlayerId, n: number, reason = 'draws'): string[] {
    const drawn: string[] = [];
    for (let i = 0; i < n; i++) {
      const pl = this.player(p);
      if (pl.deck.length === 0) {
        this.log(`${this.playerName(p)} cannot draw a card because their Deck is empty. ${this.playerName(p)} loses the Duel.`, 'system');
        throw new GameOver(this.opponent(p), `${this.playerName(p)} could not draw a card.`);
      }
      const uid = pl.deck.shift()!;
      const c = this.card(uid);
      c.zone = 'hand';
      c.index = -1;
      c.faceUp = false;
      pl.hand.push(uid);
      drawn.push(uid);
    }
    this.log(`${this.playerName(p)} ${reason} ${n} card${n === 1 ? '' : 's'}.`, 'action');
    this.fx({ type: 'draw', player: p, count: n });
    this.emit({ type: 'drew', player: p, uids: drawn });
    return drawn;
  }

  /** Place a card in a Monster Zone. Does not emit summon events (callers do). */
  placeMonster(uid: string, controller: PlayerId, index: number, position: Position, faceUp: boolean): void {
    const c = this.card(uid);
    this.detach(c);
    c.zone = 'monster';
    c.index = index;
    c.controller = controller;
    c.faceUp = faceUp;
    c.position = position;
    c.turnEnteredField = this.state.turn;
    c.summonedThisTurn = false;
    c.setThisTurn = false;
    c.positionChangedThisTurn = false;
    c.attacksDeclaredThisTurn = 0;
    c.statMods = [];
    c.treatedAsSpell = null;
    this.player(controller).monsterZones[index] = uid;
  }

  /** Place a card in a Spell & Trap Zone (face-up = activated / placed, face-down = Set). */
  placeSpellTrap(uid: string, controller: PlayerId, index: number, faceUp: boolean): void {
    const c = this.card(uid);
    this.detach(c);
    c.zone = 'spellTrap';
    c.index = index;
    c.controller = controller;
    c.faceUp = faceUp;
    c.position = null;
    c.turnEnteredField = this.state.turn;
    c.summonedThisTurn = false;
    c.setThisTurn = false;
    c.statMods = [];
    this.player(controller).spellTrapZones[index] = uid;
  }

  placeFieldSpell(uid: string, controller: PlayerId, faceUp: boolean): void {
    const c = this.card(uid);
    this.detach(c);
    c.zone = 'field';
    c.index = 0;
    c.controller = controller;
    c.faceUp = faceUp;
    c.position = null;
    c.turnEnteredField = this.state.turn;
    c.setThisTurn = false;
    c.statMods = [];
    this.player(controller).fieldZone = uid;
  }

  // ------------------------------------------------------------ destruction
  /** Destroy cards by a card effect. Applies protection; returns uids actually destroyed. */
  *destroyByEffect(uids: string[], source: string | null): Process<string[]> {
    const destroyed: string[] = [];
    for (const uid of uids) {
      const c = this.state.cards[uid];
      if (!c || !this.isOnField(c)) continue;
      const protection = this.effectDestructionProtection(c);
      if (protection) {
        this.log(`${this.name(uid)} is not destroyed: ${protection}`, 'rule');
        continue;
      }
      const replaced = yield* this.tryDestructionReplacement(c, 'effect');
      if (replaced) continue;
      this.log(`${this.name(uid)} is destroyed${source ? ` by ${this.name(source)}` : ''} and sent to the Graveyard.`, 'effect');
      this.fx({ type: 'destroy', uid, by: 'effect' });
      this.emit({ type: 'destroyed', uid, reason: 'effect', source: source ?? undefined });
      this.sendToGraveyard(uid, 'destroyedEffect', source ?? undefined);
      destroyed.push(uid);
    }
    return destroyed;
  }

  *destroyByBattle(uid: string, attacker: string): Process<boolean> {
    const c = this.card(uid);
    const protection = this.battleDestructionProtection(c);
    if (protection) {
      this.log(`${this.name(uid)} is not destroyed by battle: ${protection}`, 'rule');
      return false;
    }
    const replaced = yield* this.tryDestructionReplacement(c, 'battle');
    if (replaced) return true;
    this.log(`${this.name(uid)} is destroyed by battle and sent to the Graveyard.`, 'battle');
    this.fx({ type: 'destroy', uid, by: 'battle' });
    this.emit({ type: 'destroyed', uid, reason: 'battle', source: attacker });
    this.sendToGraveyard(uid, 'destroyedBattle', attacker);
    return true;
  }

  private *tryDestructionReplacement(c: CardInstance, reason: 'battle' | 'effect'): Process<boolean> {
    for (const src of this.activeFieldCards()) {
      const s = getScript(this.name(src.uid));
      if (s?.replaceDestruction && src.uid !== c.uid) {
        if (yield* s.replaceDestruction(this, src, c, reason)) return true;
      }
    }
    if (!this.isMonsterOnField(c) || c.flags['effectsNegated']) return false;
    const s = getScript(this.name(c.uid));
    if (s?.onWouldBeDestroyedInMonsterZone) {
      return yield* s.onWouldBeDestroyedInMonsterZone(this, c, reason);
    }
    return false;
  }

  effectDestructionProtection(c: CardInstance): string | null {
    for (const src of this.activeFieldCards()) {
      const s = getScript(this.name(src.uid));
      const r = s?.preventEffectDestruction?.(this, src, c);
      if (r) return r;
    }
    const flag = c.flags['cannotBeDestroyedByEffectsUntil'] as number | undefined;
    if (flag !== undefined && this.state.turn <= flag) return `it is protected from destruction by card effects (${c.flags['protectionSource']}).`;
    return null;
  }

  battleDestructionProtection(c: CardInstance): string | null {
    for (const src of this.activeFieldCards()) {
      const s = getScript(this.name(src.uid));
      const r = s?.preventBattleDestruction?.(this, src, c);
      if (r) return r;
    }
    return null;
  }

  /** Can `target` be targeted by an effect controlled by `sourcePlayer`? */
  targetingProtection(target: CardInstance, sourcePlayer: PlayerId): string | null {
    for (const src of this.activeFieldCards()) {
      const s = getScript(this.name(src.uid));
      const r = s?.preventTargeting?.(this, src, target, sourcePlayer);
      if (r) return r;
    }
    const flag = target.flags['cannotBeTargetedUntil'] as number | undefined;
    if (flag !== undefined && this.state.turn <= flag) return `it cannot be targeted by card effects (${target.flags['protectionSource']}).`;
    return null;
  }

  // ------------------------------------------------------------- life points
  changeLP(p: PlayerId, delta: number, reason: string): void {
    const pl = this.player(p);
    const before = pl.lp;
    pl.lp = Math.max(0, pl.lp + delta);
    if (delta < 0) this.log(`${this.playerName(p)} takes ${-delta} damage (${reason}). LP: ${before} → ${pl.lp}`, 'lp');
    else this.log(`${this.playerName(p)} gains ${delta} LP (${reason}). LP: ${before} → ${pl.lp}`, 'lp');
    if (delta < 0) this.fx({ type: 'damage', player: p, amount: -delta });
    else this.fx({ type: 'heal', player: p, amount: delta });
    this.emit({ type: 'lpChange', player: p, amount: delta, reason });
    if (pl.lp <= 0) {
      this.log(`${this.playerName(p)}'s Life Points reached 0. ${this.playerName(this.opponent(p))} wins the Duel!`, 'system');
      throw new GameOver(this.opponent(p), `${this.playerName(p)}'s Life Points reached 0.`);
    }
  }

  payLP(p: PlayerId, amount: number, reason: string): void {
    const pl = this.player(p);
    const before = pl.lp;
    pl.lp = Math.max(0, pl.lp - amount);
    this.log(`${this.playerName(p)} pays ${amount} LP (${reason}). LP: ${before} → ${pl.lp}`, 'lp');
    this.fx({ type: 'damage', player: p, amount });
    this.emit({ type: 'lpChange', player: p, amount: -amount, reason });
    if (pl.lp <= 0) {
      throw new GameOver(this.opponent(p), `${this.playerName(p)}'s Life Points reached 0.`);
    }
  }

  // ----------------------------------------------------- effect use tracking
  effectUseKey(uid: string, effectId: string, hard: boolean): string {
    return hard ? `name:${this.name(uid)}:${effectId}` : `uid:${uid}:${effectId}`;
  }
  effectUses(p: PlayerId, key: string): number {
    return this.player(p).effectUses[key] ?? 0;
  }
  recordEffectUse(p: PlayerId, key: string): void {
    this.player(p).effectUses[key] = (this.player(p).effectUses[key] ?? 0) + 1;
  }

  // ------------------------------------------------------------ describing
  describeCard(uid: string, forPlayer?: PlayerId): string {
    const c = this.card(uid);
    if (!c.faceUp && this.isOnField(c) && forPlayer !== undefined && c.controller !== forPlayer) return 'a face-down card';
    return this.name(uid);
  }

  positionLabel(c: CardInstance): string {
    if (!c.faceUp) return 'face-down Defense Position';
    return c.position === 'ATK' ? 'Attack Position' : 'Defense Position';
  }
}

/** Thrown by prompts when the player cancels an action before anything irreversible happened. */
export class ActionCancelled extends Error {
  constructor() {
    super('Action cancelled');
  }
}
