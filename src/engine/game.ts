/**
 * Mutable wrapper around GameState used while executing an action. All rules
 * helpers (moving cards, damage, prompts) live here so that card scripts stay small.
 */
import { getCard, isExtraDeckMonster, type CardDefinition } from '../cards';
import { isUltimateCrystalName } from '../cards/archetypes';
import { getScript } from './scripts';
import { summonWindow } from './flow';
import type { Process } from './scripts';
import { nextRandom, shuffleWithState } from './rng';
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

export function tokenDefinition(t: NonNullable<CardInstance['token']>): CardDefinition {
  return {
    id: 'TOKEN',
    name: t.name,
    cardType: 'Monster',
    text: 'This card can be used as a Token.',
    setNumbers: [],
    race: t.race,
    monsterTypes: ['Normal'],
    attribute: t.attribute as CardDefinition['attribute'],
    level: t.level,
    atk: t.atk,
    def: t.def,
  };
}

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
    const c = this.card(uid);
    if (c.token) return tokenDefinition(c.token);
    const d = getCard(c.cardId);
    if (c.treatedAsMonster) {
      // A Trap Card Special Summoned as a Normal Monster (it is not treated as a Trap while on the field).
      return { ...d, cardType: 'Monster', monsterTypes: ['Normal'], race: c.treatedAsMonster.race, attribute: c.treatedAsMonster.attribute as CardDefinition['attribute'], level: c.treatedAsMonster.level, atk: c.treatedAsMonster.atk, def: c.treatedAsMonster.def, property: undefined };
    }
    return d;
  }
  /** Does the card count as having this name right now (Scarlight / Scarred Dragon Archfiend become "Red Dragon Archfiend")? */
  isNamed(uid: string, name: string): boolean {
    if (this.name(uid) === name) return true;
    const c = this.card(uid);
    const s = getScript(this.name(uid));
    return !!s?.treatedAsName && s.treatedAsName(this, c) === name;
  }
  /** Does the card's text mention another card by name (e.g. "a card that mentions Red Dragon Archfiend")? */
  mentions(uid: string, name: string): boolean {
    const d = this.def(uid);
    return d.name !== name && d.text.includes(`"${name}"`);
  }
  /** A number in [0, n) from the Duel's seeded random generator (random discards, Pot of Extravagance ...). */
  random(n: number): number {
    const r = nextRandom(this.state.rngState);
    this.state.rngState = r.state;
    return Math.min(n - 1, Math.floor(r.value * n));
  }
  name(uid: string): string {
    const c = this.card(uid);
    return c.token ? c.token.name : getCard(c.cardId).name;
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
  /** Current Attribute (continuous effects such as Advanced Dark can change it). */
  attributeOf(uid: string): string {
    const c = this.card(uid);
    let attr = c.token ? c.token.attribute : (this.def(uid).attribute ?? '');
    for (const src of this.activeFieldCards()) {
      const s = getScript(this.name(src.uid));
      const r = s?.modifyAttribute?.(this, src, c);
      if (r) attr = r;
    }
    return attr;
  }
  /** Level of a monster (tokens carry their own; card effects can raise, lower or set it). Xyz and Link Monsters have no Level (0). */
  levelOf(uid: string): number {
    const c = this.card(uid);
    if (this.isOnField(c)) {
      if (typeof c.flags['levelSet'] === 'number') return c.flags['levelSet'] as number;
      const base = c.token ? c.token.level : (this.def(uid).level ?? 0);
      if (base === 0) return 0; // Xyz / Link Monsters have no Level
      return Math.max(1, base + ((c.flags['levelMod'] as number | undefined) ?? 0));
    }
    return c.token ? c.token.level : (this.def(uid).level ?? 0);
  }
  /** Rank of an Xyz Monster (0 for other monsters). */
  rankOf(uid: string): number {
    return this.def(uid).rank ?? 0;
  }
  isLinkMonster(uid: string): boolean {
    return !!this.def(uid).monsterTypes?.includes('Link');
  }
  isXyzMonster(uid: string): boolean {
    return !!this.def(uid).monsterTypes?.includes('Xyz');
  }
  isSynchroMonster(uid: string): boolean {
    return !!this.def(uid).monsterTypes?.includes('Synchro');
  }
  /** Column (0-4, seen from Player 1's side) of a card on the field; null for Field Zone / off-field cards. */
  columnOf(c: CardInstance): number | null {
    if (c.zone === 'monster' || c.zone === 'spellTrap') return c.controller === 0 ? c.index : 4 - c.index;
    if (c.zone === 'extraMonster') return c.index === 0 ? 1 : 3;
    return null;
  }
  /** All cards on the field (both players) in a column. */
  cardsInColumn(col: number): CardInstance[] {
    const out: CardInstance[] = [];
    for (const p of [0, 1] as PlayerId[]) {
      for (const c of [...this.fieldMonsters(p), ...this.spellTrapCards(p)]) if (this.columnOf(c) === col) out.push(c);
    }
    return out;
  }
  /** Main Monster Zone index of `player` that lies in `col`. */
  mainZoneInColumn(player: PlayerId, col: number): number {
    return player === 0 ? col : 4 - col;
  }
  /** The zones a Link Monster's arrows point to (as { player, zone, index } refs). */
  linkArrowTargets(uid: string): ZoneRef[] {
    const c = this.card(uid);
    const d = this.def(uid);
    if (!this.isMonsterOnField(c) || !d.linkArrows) return [];
    const col = this.columnOf(c)!;
    // Rows: 0 = Player 1's Main Monster Zones, 1 = Extra Monster Zones, 2 = Player 2's Main Monster Zones.
    const row = c.zone === 'extraMonster' ? 1 : c.controller === 0 ? 0 : 2;
    const s = c.controller === 0 ? 1 : -1; // "top" = towards the opponent
    const out: ZoneRef[] = [];
    for (const a of d.linkArrows) {
      const dr = a.startsWith('T') ? s : a.startsWith('B') ? -s : 0;
      const dc = a.endsWith('L') ? -s : a.endsWith('R') ? s : 0;
      const r = row + dr;
      const cc = col + dc;
      if (cc < 0 || cc > 4) continue;
      if (r === 0) out.push({ player: 0, zone: 'monster', index: cc });
      else if (r === 2) out.push({ player: 1, zone: 'monster', index: 4 - cc });
      else if (r === 1 && (cc === 1 || cc === 3)) out.push({ player: 0, zone: 'extraMonster', index: cc === 1 ? 0 : 1 });
    }
    return out;
  }
  /** Main Monster Zone indexes of `player` that a Link Monster (anyone's) points to. */
  linkedMainZones(player: PlayerId): number[] {
    const out = new Set<number>();
    for (const p of [0, 1] as PlayerId[]) {
      for (const m of this.fieldMonsters(p)) {
        if (!m.faceUp || !this.isLinkMonster(m.uid)) continue;
        for (const z of this.linkArrowTargets(m.uid)) if (z.zone === 'monster' && z.player === player) out.add(z.index);
      }
    }
    return [...out].sort();
  }
  /** Zones where `player` may place a monster Summoned from the Extra Deck that needs a linked zone (Link Monsters, Pendulum Monsters from the Extra Deck). */
  usableLinkZones(player: PlayerId): ZoneRef[] {
    const out: ZoneRef[] = this.usableExtraMonsterZones(player).map((index) => ({ player, zone: 'extraMonster' as const, index }));
    const free = this.freeMonsterZones(player);
    for (const i of this.linkedMainZones(player)) if (free.includes(i)) out.push({ player, zone: 'monster', index: i });
    return out;
  }
  /** Reason why `uid` cannot be Special Summoned from the Extra Deck right now because of a "for the rest of this turn" restriction. */
  extraDeckSummonProblem(player: PlayerId, uid: string): string | null {
    const codes = (this.player(player).turnFlags['extraDeckOnly'] as string[] | undefined) ?? [];
    const d = this.def(uid);
    const attr = d.attribute;
    const race = d.race;
    for (const code of codes) {
      switch (code) {
        case 'darkSynchro':
          if (!(attr === 'DARK' && this.isSynchroMonster(uid))) return 'This turn you can only Special Summon DARK Synchro Monsters from the Extra Deck (Soul Resonator).';
          break;
        case 'darkDragonSynchro':
          if (!(attr === 'DARK' && race === 'Dragon' && this.isSynchroMonster(uid))) return 'This turn you can only Special Summon DARK Dragon Synchro Monsters from the Extra Deck (a card effect you used this turn).';
          break;
        case 'synchro':
          if (!this.isSynchroMonster(uid)) return 'This turn you can only Special Summon Synchro Monsters from the Extra Deck (a card effect you used this turn).';
          break;
        case 'insectPlant':
          if (!(race === 'Insect' || race === 'Plant')) return 'This turn you can only Special Summon Insect or Plant monsters from the Extra Deck (Traptrix Arachnocampa).';
          break;
      }
    }
    return null;
  }
  /** Add a "for the rest of this turn" Extra Deck restriction for a player. */
  restrictExtraDeck(player: PlayerId, code: string): void {
    const pl = this.player(player);
    const codes = (pl.turnFlags['extraDeckOnly'] as string[] | undefined) ?? [];
    if (!codes.includes(code)) pl.turnFlags['extraDeckOnly'] = [...codes, code];
  }
  /** Is `target` unaffected by the effect of `source` (Traptrix monsters vs "Hole" Traps, Link Summoned Traptrix vs Traps ...)? */
  isUnaffected(targetUid: string, sourceUid: string | null): boolean {
    if (!sourceUid) return false;
    const t = this.state.cards[targetUid];
    const src = this.state.cards[sourceUid];
    if (!t || !src || !this.isOnField(t) || !t.faceUp || t.flags['effectsNegated']) return false;
    if (typeof t.flags['unaffectedByOtherEffectsUntil'] === 'number' && this.state.turn <= (t.flags['unaffectedByOtherEffectsUntil'] as number) && sourceUid !== targetUid) return true;
    if (t.flags['unaffectedByOpponentTrapsThisTurn'] && this.def(sourceUid).cardType === 'Trap' && !src.treatedAsMonster && src.controller !== t.controller) return true;
    const s = getScript(this.name(targetUid));
    return !!s?.unaffectedBy && s.unaffectedBy(this, t, src);
  }
  /** Turn a face-up monster face-down in Defense Position by a card effect (Floodgate Trap Hole, Crimson Gaia). */
  setFaceDownDefense(uid: string, source: string, lock?: string): boolean {
    const c = this.card(uid);
    if (!this.isMonsterOnField(c)) return false;
    if (this.isLinkMonster(uid)) {
      this.log(`${this.name(uid)} is a Link Monster, so it cannot be turned face-down.`, 'rule');
      return false;
    }
    if (this.isUnaffected(uid, source)) {
      this.log(`${this.name(uid)} is unaffected by ${this.name(source)}.`, 'rule');
      return false;
    }
    c.faceUp = false;
    c.position = 'DEF';
    // A face-down monster loses its face-up state (stat changes, negation ...).
    c.statMods = [];
    delete c.flags['effectsNegated'];
    delete c.flags['negatedBy'];
    if (lock) c.flags['cannotChangePosition'] = lock;
    this.log(`${this.name(uid)} is changed to face-down Defense Position by ${this.name(source)}.`, 'effect');
    this.fx({ type: 'position', uid });
    this.emit({ type: 'positionChanged', uid });
    return true;
  }
  /** Negate a monster's effects while it is on the field (optionally only until the end of this turn). */
  negateMonsterEffects(uid: string, source: string, untilEndOfTurn = false): void {
    const c = this.card(uid);
    if (!this.isMonsterOnField(c)) return;
    if (this.isUnaffected(uid, source)) {
      this.log(`${this.name(uid)} is unaffected by ${this.name(source)}, so its effects are not negated.`, 'rule');
      return;
    }
    c.flags['effectsNegated'] = true;
    c.flags['negatedBy'] = this.name(source);
    if (untilEndOfTurn) c.flags['effectsNegatedThisTurn'] = true;
    this.fx({ type: 'negate', uid });
    this.log(`${this.name(uid)}'s effects are negated${untilEndOfTurn ? ' until the end of this turn' : ' while it is on the field'} (${this.name(source)}).`, 'effect');
  }
  raceOf(uid: string): string {
    const c = this.card(uid);
    return c.token ? c.token.race : (this.def(uid).race ?? '');
  }
  /** Create a Token monster (not yet on the field). */
  createToken(owner: PlayerId, token: NonNullable<CardInstance['token']>): string {
    const uid = `token-${this.state.nextTokenId++}`;
    this.state.cards[uid] = {
      uid,
      cardId: 'TOKEN',
      owner,
      controller: owner,
      zone: 'banished',
      index: -1,
      faceUp: true,
      position: null,
      turnEnteredField: -1,
      summonedThisTurn: false,
      setThisTurn: false,
      positionChangedThisTurn: false,
      attacksDeclaredThisTurn: 0,
      geminiEffectActive: false,
      treatedAsSpell: null,
      token,
      fusionSummoned: false,
      equippedTo: null,
      treatedAsMonster: null,
    materials: [],
    attachedTo: null,
    properlySummoned: true,
      statMods: [],
      counters: {},
      flags: {},
    };
    return uid;
  }
  private removeToken(c: CardInstance): void {
    delete this.state.cards[c.uid];
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
    const d = c.token ? null : this.def(uid);
    let atk = c.token ? c.token.atk : (d?.atk ?? 0);
    let def = c.token ? c.token.def : (d?.def ?? 0);
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

  addStatMod(uid: string, atk: number, def: number, until: 'endOfTurn' | 'endOfDamageStep' | 'permanent' | 'endOfNextTurn', source: string): void {
    this.card(uid).statMods.push({ atk, def, until, source });
    this.fx({ type: 'boost', uid, atk, def });
  }

  /** Place a monster card in the Spell & Trap Zone, treated as a Spell Card there. */
  *placeMonsterAsSpell(uid: string, player: PlayerId, kind: 'continuous' | 'equip' | 'artifact'): Process<boolean> {
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
    this.placeSpellTrap(uid, player, zone, kind !== 'artifact');
    c.treatedAsSpell = kind;
    if (kind === 'artifact') c.setThisTurn = true;
    this.fx({ type: kind === 'artifact' ? 'set' : 'toSpellZone', uid });
    this.emit({ type: 'placedInSpellTrapZone', uid, player });
    return true;
  }

  expireStatMods(until: 'endOfTurn' | 'endOfDamageStep'): void {
    for (const c of Object.values(this.state.cards)) {
      if (!c.statMods.length) continue;
      c.statMods = c.statMods.filter((m) => m.until !== until);
      // "until the end of the next turn" becomes "until the end of the turn" once a turn has ended.
      if (until === 'endOfTurn') for (const m of c.statMods) if (m.until === 'endOfNextTurn') m.until = 'endOfTurn';
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
      case 'material': {
        const host = c.attachedTo ? this.state.cards[c.attachedTo] : undefined;
        if (host) host.materials = host.materials.filter((u) => u !== c.uid);
        c.attachedTo = null;
        break;
      }
    }
    return from;
  }

  // ------------------------------------------------------------ Xyz material
  /** Attach a card to an Xyz Monster as material (it leaves wherever it was). */
  attachMaterial(xyzUid: string, uid: string): void {
    const c = this.card(uid);
    if (c.token) {
      this.detach(c);
      this.leaveFieldCleanup(c, 'material');
      this.removeToken(c);
      return;
    }
    // A monster used as material takes its own materials to the Graveyard.
    for (const m of c.materials.slice()) this.sendToGraveyard(m, 'rule');
    this.detach(c);
    this.leaveFieldCleanup(c, 'material');
    c.zone = 'material';
    c.index = -1;
    c.faceUp = false;
    c.position = null;
    c.attachedTo = xyzUid;
    c.controller = c.owner;
    this.card(xyzUid).materials.push(uid);
    this.emit({ type: 'attached', uid, to: xyzUid });
  }
  /** Detach `n` materials from an Xyz Monster (a cost); they go to the Graveyard. Returns the detached uids. */
  *detachMaterials(xyzUid: string, n: number, player: PlayerId, title?: string): Process<string[]> {
    const host = this.card(xyzUid);
    if (host.materials.length < n) throw new Error(`${this.name(xyzUid)} does not have ${n} material${n > 1 ? 's' : ''} to detach.`);
    const chosen = yield* this.selectCards(player, title ?? `Detach ${n} material${n > 1 ? 's' : ''} from ${this.name(xyzUid)}`, host.materials.slice(), n, n);
    for (const u of chosen) {
      this.log(`${this.name(u)} is detached from ${this.name(xyzUid)} and sent to the Graveyard.`, 'effect');
      this.emit({ type: 'detached', uid: u, from: xyzUid });
      this.sendToGraveyard(u, 'detached', xyzUid);
    }
    return chosen;
  }

  /** Set a Spell/Trap face-down from anywhere (Deck, GY, hand) to `player`'s field. Returns false without a free zone. */
  *setSpellTrapFromAnywhere(uid: string, player: PlayerId, opts: { canActivateThisTurn?: boolean; banishWhenLeaves?: boolean } = {}): Process<boolean> {
    const free = this.freeSpellTrapZones(player);
    if (free.length === 0) {
      this.log(`${this.playerName(player)} has no free Spell & Trap Zone to Set ${this.name(uid)}.`, 'rule');
      return false;
    }
    const zone = yield* this.chooseSpellTrapZone(player, `Choose a Spell & Trap Zone to Set ${this.name(uid)}`);
    const c = this.card(uid);
    const shuffle = c.zone === 'deck';
    this.detach(c);
    this.leaveFieldCleanup(c, 'spellTrap');
    this.placeSpellTrap(uid, player, zone, false);
    c.setThisTurn = true;
    if (opts.canActivateThisTurn) c.flags['canActivateThisTurn'] = true;
    if (opts.banishWhenLeaves) c.flags['banishWhenLeavesField'] = true;
    this.log(`${this.name(uid)} is Set to ${this.playerName(player)}'s field${opts.canActivateThisTurn ? ' (it can be activated this turn)' : ''}.`, 'effect');
    this.fx({ type: 'set', uid });
    if (shuffle) this.shuffleDeck(c.owner);
    return true;
  }

  /** Special Summon a Trap Card as a Normal Monster (it stops being a Trap while on the field). */
  *specialSummonTrapAsMonster(uid: string, player: PlayerId, stats: NonNullable<CardInstance['treatedAsMonster']>, how: string): Process<boolean> {
    const c = this.card(uid);
    if (this.freeMonsterZones(player).length === 0) {
      this.log(`${this.playerName(player)} has no free Monster Zone for ${this.name(uid)}.`, 'rule');
      return false;
    }
    if (this.isOnField(c)) {
      this.detach(c);
      this.leaveFieldCleanup(c, 'monster');
    }
    c.treatedAsMonster = stats;
    const ok = yield* this.specialSummon(uid, player, { position: 'DEF', how });
    if (!ok) c.treatedAsMonster = null;
    return ok;
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
    // Xyz materials go to the Graveyard when the Xyz Monster leaves the field.
    for (const m of c.materials.slice()) {
      this.log(`${this.name(m)} (material of ${this.name(c.uid)}) is sent to the Graveyard.`, 'rule');
      this.sendToGraveyard(m, 'rule');
    }
    c.materials = [];
    c.treatedAsMonster = null;
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

  /**
   * Can this card actually be sent to the Graveyard right now? Costs that say "send ... to the GY" can only
   * be paid with such cards: Tokens cease to exist, a Pendulum Monster on the field goes to the Extra Deck
   * instead, and while Dimension Shifter's effect applies everything is banished instead.
   */
  /** Name of the effect that currently banishes cards instead of sending them to the GY, if any. */
  banishInsteadSource(): string | null {
    if (this.state.banishInsteadUntilTurn !== null && this.state.turn <= this.state.banishInsteadUntilTurn) return 'Dimension Shifter';
    for (const src of this.activeFieldCards()) {
      if (getScript(this.name(src.uid))?.banishInsteadOfGraveyard?.(this, src)) return this.name(src.uid);
    }
    return null;
  }

  canBeSentToGraveyard(uid: string): boolean {
    const c = this.card(uid);
    if (c.token) return false;
    if (this.banishInsteadSource()) return false;
    if (this.isOnField(c) && !!this.def(uid).monsterTypes?.includes('Pendulum')) return false;
    return true;
  }

  whyCannotBeSentToGraveyard(uid: string): string {
    const c = this.card(uid);
    if (c.token) return `${this.name(uid)} is a Token; Tokens cannot be sent to the Graveyard, so they cannot pay a "send to the GY" cost.`;
    const macro = this.banishInsteadSource();
    if (macro) return `${macro}'s effect banishes cards instead of sending them to the Graveyard, so a cost that sends a card to the Graveyard cannot be paid right now.`;
    return `${this.name(uid)} is a Pendulum Monster on the field: it would go to the Extra Deck instead of the Graveyard, so it cannot pay a "send to the GY" cost.`;
  }

  sendToGraveyard(uid: string, reason: SendReason, source?: string): void {
    const c = this.card(uid);
    if (reason === 'cost' && !this.canBeSentToGraveyard(uid)) throw new Error(this.whyCannotBeSentToGraveyard(uid));
    if (c.flags['banishWhenLeavesField'] && this.isOnField(c) && !c.token) {
      this.log(`${this.name(uid)} is banished instead of going to the Graveyard (it must be banished when it leaves the field).`, 'rule');
      this.banish(uid, true, source);
      return;
    }
    const wasFaceUp = c.faceUp;
    if (c.token) {
      this.detach(c);
      this.leaveFieldCleanup(c, 'graveyard');
      this.log(`${this.name(uid)} (a Token) leaves the field and disappears.`, 'rule');
      this.removeToken(c);
      return;
    }
    // Dimension Shifter / Retaliating "C": cards that would be sent to the GY are banished instead.
    const macro = this.banishInsteadSource();
    if (macro) {
      this.log(`${this.name(uid)} would be sent to the Graveyard, but it is banished instead (${macro}).`, 'rule');
      this.banish(uid);
      return;
    }
    // Pendulum Monsters that would go from the field to the GY are placed face-up in the Extra Deck instead.
    if (this.isOnField(c) && this.def(uid).monsterTypes?.includes('Pendulum')) {
      const from = this.detach(c);
      this.leaveFieldCleanup(c, 'extra');
      c.zone = 'extra';
      c.index = -1;
      c.faceUp = true;
      c.properlySummoned = false;
      this.player(c.owner).extra.push(uid);
      this.log(`${this.name(uid)} is a Pendulum Monster, so it goes to the Extra Deck face-up instead of the Graveyard.`, 'rule');
      this.emit({ type: 'toGraveyard', uid, from, reason, source, wasFaceUp });
      return;
    }
    const from = this.detach(c);
    this.leaveFieldCleanup(c, 'graveyard');
    c.zone = 'graveyard';
    c.index = -1;
    c.faceUp = true;
    c.flags['sentToGYTurn'] = this.state.turn;
    // A properly Special Summoned Extra Deck monster keeps that status in the GY (it may be revived from there).
    this.player(c.owner).graveyard.push(uid);
    this.emit({ type: 'toGraveyard', uid, from, reason, source, wasFaceUp });
  }

  banish(uid: string, faceUp = true, source?: string): void {
    const c = this.card(uid);
    if (c.token) {
      this.detach(c);
      this.leaveFieldCleanup(c, 'banished');
      this.removeToken(c);
      return;
    }
    const byPlayer = source ? this.state.cards[source]?.controller : undefined;
    const from = this.detach(c);
    this.leaveFieldCleanup(c, 'banished');
    c.zone = 'banished';
    c.index = -1;
    c.faceUp = faceUp;
    // Proper-Summon status is kept while banished too (only returning to the Extra Deck/hand/Deck resets it).
    this.player(c.owner).banished.push(uid);
    this.fx({ type: 'banish', uid });
    this.emit({ type: 'banished', uid, from, source, byPlayer });
  }

  toHand(uid: string): void {
    const c = this.card(uid);
    if (c.token) {
      this.detach(c);
      this.leaveFieldCleanup(c, 'hand');
      this.removeToken(c);
      return;
    }
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
    this.fx({ type: 'position', uid });
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
  /** Shuffle every card on the field into its owner's Deck (Extra Deck monsters return to the Extra Deck, Tokens vanish). */
  shuffleFieldIntoDecks(except: string[] = []): number {
    const all: string[] = [];
    for (const p of [0, 1] as PlayerId[]) {
      all.push(...this.fieldMonsters(p).map((m) => m.uid), ...this.spellTrapCards(p).map((c) => c.uid));
      const f = this.fieldSpell(p);
      if (f) all.push(f.uid);
    }
    let n = 0;
    for (const uid of all) {
      if (except.includes(uid)) continue;
      const c = this.state.cards[uid];
      if (!c) continue;
      this.toDeck(uid, 'bottom');
      n++;
    }
    for (const p of [0, 1] as PlayerId[]) this.shuffleDeck(p);
    this.log(`${n} card${n === 1 ? '' : 's'} on the field ${n === 1 ? 'is' : 'are'} shuffled into the Deck.`, 'effect');
    return n;
  }

  *specialSummon(
    uid: string,
    player: PlayerId,
    opts: { position?: Position | 'choose'; faceUp?: boolean; how: string; proper?: boolean },
  ): Process<boolean> {
    const c = this.card(uid);
    const d = this.def(uid);
    const isLink = this.isLinkMonster(uid);
    const linkZones = isLink ? this.usableLinkZones(player) : [];
    if (isLink ? linkZones.length === 0 : this.freeMonsterZones(player).length === 0) {
      this.log(`${d.name} cannot be Special Summoned because ${this.playerName(player)} has no free ${isLink ? 'Extra Monster Zone or linked Monster Zone' : 'Monster Zone'}.`, 'rule');
      return false;
    }
    if (isExtraDeckMonster(d) && (c.zone === 'graveyard' || c.zone === 'banished') && !c.properlySummoned) {
      this.log(`${d.name} cannot be Special Summoned from the ${c.zone === 'graveyard' ? 'Graveyard' : 'banished cards'} because it was not properly Special Summoned first.`, 'rule');
      return false;
    }
    if (c.zone === 'extra') {
      const problem = this.extraDeckSummonProblem(player, uid);
      if (problem) {
        this.log(`${d.name} cannot be Special Summoned: ${problem}`, 'rule');
        return false;
      }
    }
    if (this.player(player).turnFlags['onlySynchroSummon'] && opts.how !== 'synchro') {
      this.log(`${d.name} cannot be Special Summoned: this turn ${this.playerName(player)} can only Special Summon by Synchro Summon (${this.player(player).turnFlags['onlySynchroSummon']}).`, 'rule');
      return false;
    }
    let position: Position = 'ATK';
    if (isLink) {
      position = 'ATK'; // Link Monsters have no DEF and are always in Attack Position
    } else if (opts.position === 'choose') {
      const choice = yield* this.selectOption(player, `Special Summon ${d.name} in which position?`, [
        { id: 'ATK', label: 'Attack Position' },
        { id: 'DEF', label: 'Defense Position' },
      ]);
      position = choice as Position;
    } else if (opts.position) {
      position = opts.position;
    }
    const faceUp = opts.faceUp ?? true;
    const wasTrap = !!c.treatedAsMonster;
    if (isLink) {
      let z = linkZones[0];
      if (linkZones.length > 1) z = yield* this.selectZone(player, `Choose a zone for ${d.name} (an Extra Monster Zone, or a Main Monster Zone a Link Monster points to)`, linkZones);
      if (z.zone === 'extraMonster') this.placeInExtraMonsterZone(uid, player, z.index, 'ATK');
      else this.placeMonster(uid, player, z.index, 'ATK', true);
    } else {
      const zone = yield* this.chooseMonsterZone(player, `Choose a Monster Zone for ${d.name}`);
      this.placeMonster(uid, player, zone, position, faceUp);
    }
    c.summonedThisTurn = true;
    c.flags['specialSummoned'] = true;
    c.flags['specialSummonedThisTurn'] = true;
    if (wasTrap) c.flags['summonedAsMonsterFromTrap'] = true;
    this.player(player).turnFlags['specialSummonedThisTurn'] = true;
    if (opts.proper) c.properlySummoned = true;
    const st = this.stats(uid);
    const howText = opts.how === 'synchro' ? 'by Synchro Summon' : opts.how === 'xyz' ? 'by Xyz Summon' : opts.how === 'link' ? 'by Link Summon' : opts.how;
    this.log(`${d.name} is Special Summoned ${howText} (ATK ${st.atk}${isLink ? '' : ` / DEF ${st.def}`}) in ${faceUp ? '' : 'face-down '}${position === 'ATK' ? 'Attack' : 'Defense'} Position.`, 'effect');
    this.fx({ type: 'summon', uid, method: 'special' });
    if (faceUp) {
      const ok = yield* summonWindow(this, uid, player, 'special', opts.how);
      if (!ok) return false;
    }
    if (isUltimateCrystalName(d.name) && c.owner === player) this.player(player).duelFlags['summonedUltimateCrystal'] = true;
    this.emit({ type: 'summon', uid, player, method: 'special', how: opts.how });
    return true;
  }

  addCounter(uid: string, counter: string, amount = 1): void {
    const c = this.card(uid);
    c.counters[counter] = (c.counters[counter] ?? 0) + amount;
    this.log(`${this.name(uid)} gets ${amount} ${counter}${amount > 1 ? 's' : ''} (now ${c.counters[counter]}).`, 'effect');
    this.emit({ type: 'counterAdded', uid, counter, amount });
  }

  /** Face-up Extra Deck cards (Pendulum Monsters) of a player. */
  faceUpExtra(p: PlayerId): CardInstance[] {
    return this.player(p).extra.map((u) => this.card(u)).filter((c) => c.faceUp);
  }
  /** Pendulum Zones are the leftmost and rightmost Spell & Trap Zones (indexes 0 and 4). */
  pendulumCards(p: PlayerId): CardInstance[] {
    return this.spellTrapCards(p).filter((c) => c.treatedAsSpell === 'pendulum');
  }
  /** Extra Monster Zone a player may use (the one they already occupy, or any free one). */
  usableExtraMonsterZones(p: PlayerId): number[] {
    const zones = this.state.extraMonsterZones;
    const mine = zones.findIndex((u) => u && this.card(u).controller === p);
    const theirs = zones.findIndex((u) => u && this.card(u).controller !== p);
    if (mine >= 0) return [];
    const out: number[] = [];
    zones.forEach((u, i) => {
      if (!u && i !== theirs) out.push(i);
    });
    return out;
  }
  placeInExtraMonsterZone(uid: string, controller: PlayerId, index: number, position: Position): void {
    const c = this.card(uid);
    this.detach(c);
    c.zone = 'extraMonster';
    c.index = index;
    c.controller = controller;
    c.faceUp = true;
    c.position = position;
    c.turnEnteredField = this.state.turn;
    c.summonedThisTurn = true;
    c.setThisTurn = false;
    c.positionChangedThisTurn = false;
    c.attacksDeclaredThisTurn = 0;
    c.treatedAsSpell = null;
    c.statMods = [];
    c.flags = {};
    c.counters = {};
    c.equippedTo = null;
    this.state.extraMonsterZones[index] = uid;
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
    if (c.token) {
      this.detach(c);
      this.leaveFieldCleanup(c, 'deck');
      this.removeToken(c);
      return;
    }
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
    if (reason !== 'draws' && this.player(p).turnFlags['noEffectDraws']) {
      this.log(`${this.playerName(p)} cannot draw cards by card effects this turn (${this.player(p).turnFlags['noEffectDraws']}).`, 'rule');
      return drawn;
    }
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
    c.flags = {};
    c.counters = {};
    c.geminiEffectActive = false;
    c.equippedTo = null;
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
      if (this.isUnaffected(uid, source)) {
        this.log(`${this.name(uid)} is unaffected by ${this.name(source!)}, so it is not destroyed.`, 'rule');
        continue;
      }
      const byPlayer = source ? this.state.cards[source]?.controller : undefined;
      const protection = this.effectDestructionProtection(c);
      if (protection) {
        this.log(`${this.name(uid)} is not destroyed: ${protection}`, 'rule');
        continue;
      }
      if (c.faceUp && !c.flags['effectsNegated'] && byPlayer !== undefined && byPlayer !== c.controller && getScript(this.name(uid))?.immuneToOpponentEffectDestruction) {
        this.log(`${this.name(uid)} cannot be destroyed by an opponent's card effects.`, 'rule');
        continue;
      }
      const replaced = yield* this.tryDestructionReplacement(c, 'effect');
      if (replaced) continue;
      this.log(`${this.name(uid)} is destroyed${source ? ` by ${this.name(source)}` : ''} and sent to the Graveyard.`, 'effect');
      this.fx({ type: 'destroy', uid, by: 'effect' });
      this.emit({ type: 'destroyed', uid, reason: 'effect', source: source ?? undefined, byPlayer });
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
    this.emit({ type: 'destroyed', uid, reason: 'battle', source: attacker, byPlayer: this.state.cards[attacker]?.controller });
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
    // Cards in the Graveyard that can replace the destruction (Soul Resonator).
    for (const u of this.player(c.controller).graveyard.slice()) {
      const s = getScript(this.name(u));
      if (s?.replaceDestructionFromGraveyard && (yield* s.replaceDestructionFromGraveyard(this, this.card(u), c, reason))) return true;
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
  targetingProtection(target: CardInstance, sourcePlayer: PlayerId, sourceUid?: string): string | null {
    if (sourceUid && this.isUnaffected(target.uid, sourceUid)) return `it is unaffected by ${this.name(sourceUid)}.`;
    if (this.player(sourcePlayer).turnFlags['cannotTargetSynchros'] && this.isOnField(target) && this.isSynchroMonster(target.uid) && target.controller !== sourcePlayer) return 'Synchro Monsters cannot be targeted by your card effects this turn (Burning Soul).';
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
    if (delta < 0 && pl.turnFlags['halveDamage']) {
      const halved = -Math.floor(-delta / 2);
      this.log(`The damage is halved (${pl.turnFlags['halveDamage']}): ${-delta} → ${-halved}.`, 'rule');
      delta = halved;
    }
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
