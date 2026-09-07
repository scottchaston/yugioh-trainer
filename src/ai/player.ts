/**
 * Computer opponent. It never touches the rules: it only picks among the legal actions the engine
 * lists and answers the engine's prompts, exactly like a human clicking buttons. Three levels:
 *
 *  - easy:   mostly random legal moves; rarely responds with Traps; happily attacks into bigger monsters.
 *  - medium: tries every legal move in a private copy of the Duel (the engine is deterministic), scores
 *            the result with a simple board evaluation and picks a good one, with some randomness.
 *  - hard:   the same look-ahead without randomness, a sharper evaluation that fears the opponent's
 *            attackers, sets monsters when outclassed, and never wastes a response.
 *
 * It does not cheat: when it looks ahead it assumes the human declines every response window, it never
 * "sees" the identity of the human's face-down cards (attacks into face-down monsters are estimated), and
 * the evaluation counts the human's hand and Set cards only by number.
 */
import { Game, execute, getLegalActions } from '../engine';
import type { Action, Answer, GameState, LegalActionInfo, PlayerId, Prompt } from '../engine';
import { getCard, hasType, isExtraDeckMonster } from '../cards';

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: { id: Difficulty; label: string; description: string }[] = [
  { id: 'easy', label: 'Easy', description: 'Plays loosely: random Summons, attacks without much thought, rarely uses Traps. Good for learning the flow of a turn.' },
  { id: 'medium', label: 'Medium', description: 'Looks one move ahead, Summons its best monsters, attacks when it wins the battle, and uses Traps and Quick-Plays when they clearly help.' },
  { id: 'hard', label: 'Hard', description: 'Careful and consistent: sets monsters when outclassed, keeps back-row cards for real threats, and squeezes value out of every effect.' },
];

export interface PendingLike {
  action: Action;
  answers: Answer[];
  prompt: Prompt;
}

export type AiDecision = { kind: 'action'; action: Action; label: string } | { kind: 'answer'; answer: Answer; label: string };

export interface AiOptions {
  /** Random source (tests pass a seeded one). */
  rng?: () => number;
  /** Action signatures the engine rejected for the current state (never retried). */
  exclude?: Set<string>;
  /** How many actions the computer has already taken this turn (safety net against loops). */
  actionsThisTurn?: number;
}

export function actionSignature(a: Action): string {
  return JSON.stringify(a);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

const UNKNOWN_FACEDOWN_STAT = 1500;

/** A rough worth of a card for choices such as "discard 1" or "add 1 to your hand". */
export function cardValue(g: Game, uid: string): number {
  const c = g.card(uid);
  if (c.token) return 0.5;
  const d = getCard(c.cardId);
  if (d.cardType === 'Monster') {
    const atk = d.atk ?? 0;
    let v = atk / 1000 + (d.level ?? d.rank ?? (d.linkRating ? d.linkRating * 2 : 4)) / 12;
    if (isExtraDeckMonster(d)) v += 0.5;
    if (hasType(d, 'Tuner')) v += 0.3;
    if (/from your hand/.test(d.text)) v += 0.4; // hand traps and quick effects from the hand
    return v;
  }
  const strong = ['Raigeki', "Harpie's Feather Duster", 'Monster Reborn', 'Pot of Extravagance', 'Swords of Revealing Light', 'Evenly Matched', 'Bottomless Trap Hole', 'Floodgate Trap Hole', 'Trap Hole', 'Fiendish Chain'];
  if (strong.includes(d.name)) return 2.4;
  if (d.cardType === 'Trap') return 1.4;
  return 1.2;
}

/** Board score from `me`'s point of view: bigger is better. */
export function evaluate(s: GameState, me: PlayerId, level: Difficulty): number {
  if (s.winner === me) return 1_000_000;
  if (s.winner !== null) return -1_000_000;
  const g = new Game(s);
  const opp = g.opponent(me);
  const threatWeight = level === 'hard' ? 1 : level === 'medium' ? 0.5 : 0;

  interface Side {
    v: number;
    bestAtk: number;
    monsters: { atk: number; def: number; faceUp: boolean; position: 'ATK' | 'DEF' | null; known: boolean }[];
  }
  const side = (p: PlayerId): Side => {
    const pl = s.players[p];
    // Life Points on roughly the same scale as cards: 1000 LP is worth a few cards.
    let v = pl.lp / 300;
    const monsters: Side['monsters'] = [];
    let bestAtk = 0;
    for (const m of g.fieldMonsters(p)) {
      const known = m.faceUp || p === me;
      const st = known ? g.stats(m.uid) : { atk: UNKNOWN_FACEDOWN_STAT, def: UNKNOWN_FACEDOWN_STAT };
      if (!m.faceUp) {
        v += 1.3 + (known ? st.def / 1500 : 0.8);
        monsters.push({ atk: st.atk, def: st.def, faceUp: false, position: m.position, known });
        continue;
      }
      const stat = m.position === 'ATK' ? st.atk : st.def;
      v += 1 + stat / 500 + (m.position === 'ATK' ? st.atk / 2500 : 0);
      if (m.position === 'ATK') bestAtk = Math.max(bestAtk, st.atk);
      monsters.push({ atk: st.atk, def: st.def, faceUp: true, position: m.position, known });
    }
    for (const c of g.spellTrapCards(p)) v += c.faceUp ? 0.7 : 0.9;
    if (g.fieldSpell(p)) v += 0.7;
    v += pl.hand.length * (level === 'hard' ? 0.8 : 0.7);
    v += Math.min(pl.deck.length, 25) * 0.02;
    return { v, bestAtk, monsters };
  };
  const mine = side(me);
  const theirs = side(opp);
  let score = mine.v - theirs.v;

  if (threatWeight > 0) {
    // What the opponent's attackers can do to my board on their next turn.
    let threat = 0;
    if (theirs.bestAtk > 0) {
      if (mine.monsters.length === 0) threat += Math.min(theirs.bestAtk, s.players[me].lp) / 300 + 0.5;
      for (const m of mine.monsters) {
        if (!m.faceUp) threat += m.def < theirs.bestAtk ? 0.5 : 0;
        else if (m.position === 'ATK' && m.atk < theirs.bestAtk) threat += 0.8 + (theirs.bestAtk - m.atk) / 300;
        else if (m.position === 'DEF' && m.def < theirs.bestAtk) threat += 0.5;
      }
    }
    // What my attackers can do to their board.
    let pressure = 0;
    if (mine.bestAtk > 0) {
      if (theirs.monsters.length === 0) pressure += Math.min(mine.bestAtk, s.players[opp].lp) / 300 + 0.5;
      for (const m of theirs.monsters) {
        const stat = m.position === 'ATK' ? m.atk : m.def;
        if (mine.bestAtk > stat) pressure += 0.5 + (m.position === 'ATK' ? (mine.bestAtk - m.atk) / 300 : 0.2);
      }
    }
    score += threatWeight * (pressure - threat);
  }
  return score;
}

// ---------------------------------------------------------------------------
// Quick answers used while looking ahead (cheap, no recursion)
// ---------------------------------------------------------------------------

function optionScore(label: string, outclassed: boolean): number {
  const l = label.toLowerCase();
  if (/do not|don't|^no\b|decline|skip/.test(l)) return -1;
  if (/defense/.test(l)) return outclassed ? 1 : 0;
  if (/attack/.test(l)) return outclassed ? 0 : 1;
  return 0.5;
}

function outclassedOnField(g: Game, me: PlayerId): boolean {
  const opp = g.opponent(me);
  const oppBest = Math.max(0, ...g.fieldMonsters(opp).filter((m) => m.faceUp && m.position === 'ATK').map((m) => g.stats(m.uid).atk));
  const myBest = Math.max(0, ...g.fieldMonsters(me).filter((m) => m.faceUp).map((m) => g.stats(m.uid).atk));
  return oppBest > myBest;
}

/** Whether a card prompt is about giving something up (cost / opponent's effect on my cards). */
function preferLowValue(g: Game, prompt: Extract<Prompt, { type: 'selectCards' }>, me: PlayerId): boolean {
  const text = `${prompt.title} ${prompt.description ?? ''}`.toLowerCase();
  const mineCount = prompt.cards.filter((u) => g.card(u).controller === me).length;
  const mostlyMine = mineCount * 2 >= prompt.cards.length;
  if (/discard|tribute|banish|send .* to the graveyard|as (a )?cost|pay|shuffle|return .* to (the|your) deck|destroy/.test(text)) return mostlyMine;
  return false;
}

/** Rank the cards of a prompt (best choice first) from `me`'s point of view. */
export function rankCards(g: Game, prompt: Extract<Prompt, { type: 'selectCards' }>, me: PlayerId): string[] {
  const low = preferLowValue(g, prompt, me);
  const worth = (u: string) => {
    const c = g.card(u);
    let v = cardValue(g, u);
    // On the field, count the current stats rather than the printed ones.
    if (c.zone === 'monster' || c.zone === 'extraMonster') v = 1 + g.stats(u).atk / 1000;
    // Opponent's cards: the more valuable the better to hit; my own: the reverse when it is a cost.
    if (c.controller !== me) return v;
    return low ? -v : v;
  };
  return prompt.cards.slice().sort((a, b) => worth(b) - worth(a));
}

function quickAnswer(state: GameState, prompt: Prompt, me: PlayerId): Answer {
  const g = new Game(state);
  switch (prompt.type) {
    case 'fastEffects':
      return { activation: null };
    case 'selectOption': {
      const outclassed = outclassedOnField(g, me);
      let best = prompt.options[0];
      let bestScore = -Infinity;
      for (const o of prompt.options) {
        const sc = optionScore(o.label, outclassed);
        if (sc > bestScore) {
          bestScore = sc;
          best = o;
        }
      }
      return { option: best.id };
    }
    case 'selectZone':
      return { zone: prompt.zones[0] };
    case 'selectCards': {
      const ranked = rankCards(g, prompt, me);
      const low = preferLowValue(g, prompt, me);
      const n = low ? prompt.min : Math.min(prompt.max, ranked.length);
      return { cards: ranked.slice(0, n) };
    }
  }
}

/** The opponent's (human's) choices while the computer looks ahead: never respond, otherwise the minimum. */
function opponentDefault(prompt: Prompt): Answer {
  switch (prompt.type) {
    case 'fastEffects':
      return { activation: null };
    case 'selectOption':
      return { option: prompt.options[0].id };
    case 'selectZone':
      return { zone: prompt.zones[0] };
    case 'selectCards':
      return { cards: prompt.cards.slice(0, prompt.min) };
  }
}

/** Play an action (or the rest of a pending one) to its end with quick answers. `null` = illegal / cancelled. */
export function rollout(base: GameState, action: Action, answers: Answer[], me: PlayerId): GameState | null {
  let all = answers.slice();
  for (let guard = 0; guard < 120; guard++) {
    const r = execute(base, action, all);
    if (r.error || r.cancelled) return null;
    if (r.done) return r.state;
    const p = r.prompt!;
    all = [...all, p.player === me ? quickAnswer(r.state, p, me) : opponentDefault(p)];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

const PHASE_MOVES = new Set<Action['type']>(['TO_BATTLE_PHASE', 'TO_MAIN2', 'TO_END_PHASE', 'END_TURN']);
/** After this many actions in one turn the computer simply ends it (safety net against loops). */
const MAX_ACTIONS_PER_TURN = 40;

function noise(level: Difficulty, rng: () => number): number {
  if (level !== 'medium') return 0;
  return (rng() - 0.5) * 1.2;
}

/** Candidate answers worth comparing for a prompt (kept small on purpose). */
function candidateAnswers(state: GameState, prompt: Prompt, me: PlayerId): Answer[] {
  const g = new Game(state);
  switch (prompt.type) {
    case 'fastEffects':
      return [{ activation: null }, ...prompt.options.map((o) => ({ activation: { uid: o.uid, effectId: o.effectId } }))];
    case 'selectOption':
      return prompt.options.map((o) => ({ option: o.id }));
    case 'selectZone': {
      // Zones rarely matter; the middle Main Monster Zone is a fine default, Extra Monster Zones first for Links.
      const zones = prompt.zones.slice().sort((a, b) => Math.abs(a.index - 2) - Math.abs(b.index - 2));
      return [{ zone: zones[0] }];
    }
    case 'selectCards': {
      const ranked = rankCards(g, prompt, me);
      const out: Answer[] = [];
      if (prompt.min === 0) out.push({ cards: [] });
      if (prompt.max === 1) {
        for (const u of ranked.slice(0, 8)) out.push({ cards: [u] });
      } else {
        const lo = Math.max(prompt.min, 1);
        out.push({ cards: ranked.slice(0, Math.min(lo, ranked.length)) });
        if (prompt.max > lo) out.push({ cards: ranked.slice(0, Math.min(prompt.max, ranked.length)) });
      }
      return out;
    }
  }
}

function randomAnswer(state: GameState, prompt: Prompt, me: PlayerId, rng: () => number): Answer {
  const g = new Game(state);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
  switch (prompt.type) {
    case 'fastEffects':
      return rng() < 0.3 && prompt.options.length ? { activation: (() => { const o = pick(prompt.options); return { uid: o.uid, effectId: o.effectId }; })() } : { activation: null };
    case 'selectOption':
      return { option: pick(prompt.options).id };
    case 'selectZone':
      return { zone: pick(prompt.zones) };
    case 'selectCards': {
      const n = prompt.min + (prompt.max > prompt.min && rng() < 0.5 ? 1 : 0);
      const ranked = rankCards(g, prompt, me);
      const pool = ranked.slice();
      const chosen: string[] = [];
      while (chosen.length < Math.min(n, pool.length)) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      return { cards: chosen };
    }
  }
}

function describeAnswer(prompt: Prompt, a: Answer, g: Game): string {
  if (prompt.type === 'fastEffects') return a.activation ? `activates ${g.name(a.activation.uid)}` : 'does not respond';
  if (prompt.type === 'selectOption') return prompt.options.find((o) => o.id === a.option)?.label ?? 'chooses';
  if (prompt.type === 'selectCards') return (a.cards ?? []).map((u) => g.name(u)).join(', ') || 'chooses nothing';
  return 'chooses a zone';
}

/** Answer a prompt that belongs to the computer. */
function decideAnswer(committed: GameState, pending: PendingLike, me: PlayerId, level: Difficulty, rng: () => number): AiDecision {
  const { prompt } = pending;
  const g = new Game(committed);
  if (level === 'easy') {
    const a = randomAnswer(committed, prompt, me, rng);
    return { kind: 'answer', answer: a, label: describeAnswer(prompt, a, g) };
  }
  const cands = candidateAnswers(committed, prompt, me);
  if (cands.length === 1) return { kind: 'answer', answer: cands[0], label: describeAnswer(prompt, cands[0], g) };
  let best = cands[0];
  let bestScore = -Infinity;
  cands.forEach((a, i) => {
    const end = rollout(committed, pending.action, [...pending.answers, a], me);
    if (!end) return;
    let sc = evaluate(end, me, level) + noise(level, rng);
    // Responding costs a card: only do it when it clearly pays (hard) or seems to pay (medium).
    if (prompt.type === 'fastEffects' && i > 0) sc -= level === 'hard' ? 0.35 : 0.15;
    if (sc > bestScore) {
      bestScore = sc;
      best = a;
    }
  });
  return { kind: 'answer', answer: best, label: describeAnswer(prompt, best, g) };
}

interface Scored {
  a: LegalActionInfo;
  delta: number;
}

/** Score every productive legal action by looking ahead. */
function scoreActions(state: GameState, legal: LegalActionInfo[], me: PlayerId, level: Difficulty, rng: () => number): Scored[] {
  const g = new Game(state);
  const opp = g.opponent(me);
  const now = evaluate(state, me, level);
  const out: Scored[] = [];
  for (const a of legal) {
    if (PHASE_MOVES.has(a.action.type)) continue;
    if (a.action.type === 'DECLARE_ATTACK') {
      // Attack targets are a prompt inside the action: branch on each target; face-down targets are estimated.
      const first = execute(state, a.action, []);
      const atk = g.stats(a.action.uid).atk;
      if (first.done) {
        out.push({ a, delta: evaluate(first.state, me, level) - now + noise(level, rng) });
        continue;
      }
      if (first.error || first.cancelled) continue;
      const p = first.prompt!;
      if (p.type === 'selectCards' && p.player === me) {
        let bestDelta = -Infinity;
        for (const target of p.cards) {
          const tc = g.card(target);
          let delta: number;
          if (!tc.faceUp && tc.controller === opp) {
            // Unknown DEF: expect something around 1500; big attackers take the gamble, small ones do not.
            delta = (atk - UNKNOWN_FACEDOWN_STAT) / 500 + (level === 'hard' ? 0.2 : 0.5);
          } else {
            const end = rollout(state, a.action, [{ cards: [target] }], me);
            if (!end) continue;
            delta = evaluate(end, me, level) - now;
          }
          bestDelta = Math.max(bestDelta, delta);
        }
        if (bestDelta > -Infinity) out.push({ a, delta: bestDelta + noise(level, rng) });
      } else {
        const end = rollout(state, a.action, [], me);
        if (end) out.push({ a, delta: evaluate(end, me, level) - now + noise(level, rng) });
      }
      continue;
    }
    const end = rollout(state, a.action, [], me);
    if (!end) continue;
    let delta = evaluate(end, me, level) - now;
    // Setting a Normal Spell face-down only delays it: small penalty so activation is preferred.
    if (a.action.type === 'SET_SPELL_TRAP') {
      const d = getCard(g.card(a.action.uid).cardId);
      if (d.cardType === 'Spell' && d.property !== 'Quick-Play') delta -= 0.5;
    }
    out.push({ a, delta: delta + noise(level, rng) });
  }
  return out.sort((x, y) => y.delta - x.delta);
}

/** Whether any of my monsters could attack usefully this turn (used before entering the Battle Phase). */
function attackWorthwhile(state: GameState, me: PlayerId, level: Difficulty): boolean {
  const g = new Game(state);
  const opp = g.opponent(me);
  const attackers = g.fieldMonsters(me).filter((m) => m.faceUp && m.position === 'ATK' && m.attacksDeclaredThisTurn === 0);
  if (attackers.length === 0) return false;
  const oppMonsters = g.fieldMonsters(opp);
  if (oppMonsters.length === 0) return true;
  for (const a of attackers) {
    const atk = g.stats(a.uid).atk;
    for (const m of oppMonsters) {
      if (!m.faceUp) {
        if (atk >= (level === 'hard' ? 1900 : 1600)) return true;
        continue;
      }
      const st = g.stats(m.uid);
      if (m.position === 'ATK' ? atk > st.atk : atk > st.def) return true;
    }
  }
  return false;
}

/** Choose the computer's next action on its own turn. */
function decideAction(state: GameState, me: PlayerId, level: Difficulty, rng: () => number, exclude: Set<string>, actionsSoFar: number): AiDecision | null {
  const legalAll = getLegalActions(state, me).filter((a) => a.legal && !exclude.has(actionSignature(a.action)));
  const find = (t: Action['type']) => legalAll.find((a) => a.action.type === t);
  const endTurn = find('END_TURN');
  const decision = (a: LegalActionInfo | undefined): AiDecision | null => (a ? { kind: 'action', action: a.action, label: a.label } : null);
  const tooMany = actionsSoFar >= MAX_ACTIONS_PER_TURN;
  if (tooMany) return decision(endTurn) ?? decision(find('TO_MAIN2')) ?? null;

  const productive = legalAll.filter((a) => !PHASE_MOVES.has(a.action.type));
  const phase = state.phase;

  if (level === 'easy') {
    const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
    if (phase === 'BATTLE') {
      const attacks = productive.filter((a) => a.action.type === 'DECLARE_ATTACK');
      if (attacks.length && rng() < 0.9) return decision(pick(attacks));
      return decision(find('TO_MAIN2')) ?? decision(endTurn);
    }
    if (productive.length && rng() < 0.8) return decision(pick(productive));
    if (phase === 'MAIN1' && find('TO_BATTLE_PHASE') && attackWorthwhile(state, me, level) && rng() < 0.9) return decision(find('TO_BATTLE_PHASE'));
    return decision(endTurn) ?? decision(find('TO_BATTLE_PHASE')) ?? decision(pick(productive));
  }

  const scored = scoreActions(state, productive, me, level, rng);
  const threshold = level === 'hard' ? 0.05 : 0;
  if (phase === 'BATTLE') {
    const attack = scored.find((s) => s.a.action.type === 'DECLARE_ATTACK' && s.delta > threshold);
    if (attack) return decision(attack.a);
    const other = scored.find((s) => s.delta > threshold + 0.3);
    if (other) return decision(other.a);
    return decision(find('TO_MAIN2')) ?? decision(endTurn);
  }
  const best = scored.find((s) => s.delta > threshold);
  if (best) return decision(best.a);
  if (phase === 'MAIN1' && find('TO_BATTLE_PHASE') && attackWorthwhile(state, me, level)) return decision(find('TO_BATTLE_PHASE'));
  return decision(endTurn) ?? decision(find('TO_BATTLE_PHASE')) ?? decision(find('TO_MAIN2')) ?? null;
}

/**
 * What the computer wants to do now, or null when it is not its move.
 * `pending` is the action currently waiting for an answer (any player's action).
 */
export function aiDecide(committed: GameState, pending: PendingLike | null, me: PlayerId, level: Difficulty, opts: AiOptions = {}): AiDecision | null {
  const rng = opts.rng ?? Math.random;
  if (committed.winner !== null) return null;
  if (pending) {
    if (pending.prompt.player !== me) return null;
    return decideAnswer(committed, pending, me, level, rng);
  }
  if (!committed.started || committed.turnPlayer !== me) return null;
  return decideAction(committed, me, level, rng, opts.exclude ?? new Set(), opts.actionsThisTurn ?? 0);
}
