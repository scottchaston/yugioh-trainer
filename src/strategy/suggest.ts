/**
 * OPTIONAL strategy helper. Produces suggestions with reasons from simple heuristics.
 * This is advice, never a rule: legality always comes from the rules engine (src/engine).
 */
import { hasType } from '../cards';
import { Game, getLegalActions, type GameState, type LegalActionInfo, type PlayerId, type Prompt } from '../engine';
import { getScript } from '../engine/scripts';

export interface Suggestion {
  title: string;
  reason: string;
  /** A legal action the suggestion corresponds to (optional). */
  action?: LegalActionInfo['action'];
  /** For response windows: the option to activate. */
  activation?: { uid: string; effectId: string };
  /** 'do' = a recommended action, 'hold' = advice to keep/avoid something, 'info' = situational note. */
  kind: 'do' | 'hold' | 'info';
}

function bestOpposing(g: Game, player: PlayerId): { atk: number; def: number; name: string } | null {
  const opp = g.fieldMonsters(g.opponent(player));
  if (opp.length === 0) return null;
  let best = { atk: -1, def: -1, name: '' };
  for (const m of opp) {
    if (!m.faceUp) continue;
    const st = g.stats(m.uid);
    const v = m.position === 'ATK' ? st.atk : st.def;
    if (v > Math.max(best.atk, best.def)) best = { atk: st.atk, def: st.def, name: g.name(m.uid) };
  }
  return best.name ? best : { atk: 0, def: 0, name: 'a face-down monster' };
}

export function suggestMoves(state: GameState, player: PlayerId, prompt: Prompt | null): Suggestion[] {
  const g = new Game(state);
  const out: Suggestion[] = [];
  const opp = g.opponent(player);

  // ------------------------------------------------------------ response windows
  if (prompt && prompt.type === 'fastEffects' && prompt.player === player) {
    const b = state.battle;
    for (const o of prompt.options) {
      const name = g.name(o.uid);
      if (b?.attacker && g.card(b.attacker).controller !== player) {
        const attackerAtk = g.stats(b.attacker).atk;
        const myTarget = b.target ? g.card(b.target) : null;
        const threatened = !myTarget ? attackerAtk : (myTarget.position === 'ATK' ? attackerAtk > g.stats(myTarget.uid).atk : attackerAtk > g.stats(myTarget.uid).def) ? attackerAtk : 0;
        if (name === 'Kunai with Chain' && threatened) out.push({ kind: 'do', title: `Consider Kunai with Chain`, reason: `${g.name(b.attacker)} (${attackerAtk} ATK) is attacking${myTarget ? ` ${g.name(myTarget.uid)}` : ' you directly'}. Changing it to Defense Position cancels the attack, and you can also equip Kunai for +500 ATK.`, activation: { uid: o.uid, effectId: o.effectId } });
        if (name === 'Honest' && myTarget && myTarget.faceUp) out.push({ kind: 'do', title: 'Honest can win this battle', reason: `${g.name(myTarget.uid)} is a LIGHT monster. Honest gives it ATK equal to ${g.name(b.attacker)}'s ATK (${attackerAtk}) for this battle, so it will beat the attacker.`, activation: { uid: o.uid, effectId: o.effectId } });
        if (name === 'Compulsory Evacuation Device' && threatened) out.push({ kind: 'do', title: 'Compulsory Evacuation Device stops the attack', reason: `Returning ${g.name(b.attacker)} to the hand cancels its attack. If it was Tribute or Special Summoned, your opponent loses their investment.`, activation: { uid: o.uid, effectId: o.effectId } });
        if (name === 'Crystal Keeper') out.push({ kind: 'do', title: 'Crystal Keeper doubles your Crystal Beast', reason: 'Its ATK/DEF are doubled for this damage calculation, so a weaker Crystal Beast can destroy the attacker. Your Crystal Beast is destroyed afterwards, but it can go to your Spell & Trap Zone.', activation: { uid: o.uid, effectId: o.effectId } });
        if (name === 'Ancient City - Rainbow Ruins' && o.effectId === 'halve') out.push({ kind: 'do', title: 'Halve the battle damage', reason: 'Rainbow Ruins (2+ Crystal Beasts) can halve the battle damage you take, once per turn.', activation: { uid: o.uid, effectId: o.effectId } });
      }
      if (name === 'Ash Blossom & Joyous Spring' || name === 'Ghost Belle & Haunted Mansion') {
        const last = state.chain[state.chain.length - 1];
        if (last) out.push({ kind: 'do', title: `${name.split(' &')[0]} can stop ${g.name(last.uid)}`, reason: `${g.name(last.uid)}'s effect can be negated by discarding ${name.split(' &')[0]}. Search and Special Summon effects are usually worth negating.`, activation: { uid: o.uid, effectId: o.effectId } });
      }
      if (name === "Champion's Vigilance") out.push({ kind: 'do', title: "Champion's Vigilance negates this", reason: 'Counter Traps are Spell Speed 3: nothing except another Counter Trap can be chained to it, so the negation is almost guaranteed.', activation: { uid: o.uid, effectId: o.effectId } });
    }
    if (out.length === 0) out.push({ kind: 'info', title: 'Declining is fine', reason: 'None of your available cards changes this situation much. Save them for a bigger threat, such as an attack on your best monster or a Special Summon.' });
    return out.slice(0, 4);
  }

  if (state.turnPlayer !== player || prompt) return out;
  const legal = getLegalActions(state, player).filter((a) => a.legal);
  const best = bestOpposing(g, player);
  const myMonsters = g.fieldMonsters(player);
  const hand = g.hand(player);

  // ------------------------------------------------------------ main phase
  if (state.phase === 'MAIN1' || state.phase === 'MAIN2') {
    // Searchers first
    for (const name of ['Crystal Bond', 'Rainbow Bridge', 'Dragon Shrine', 'The Melody of Awakening Dragon', 'Cards of Consonance', 'Trade-In']) {
      const a = legal.find((x) => x.action.type === 'ACTIVATE' && x.uid && g.name(x.uid) === name);
      if (a) out.push({ kind: 'do', title: `Activate ${name} first`, reason: `Card advantage: ${name} adds resources before you commit your Normal Summon, so you can make a better choice afterwards.`, action: a.action });
    }
    // Sapphire Pegasus
    const pegasus = legal.find((x) => x.action.type === 'NORMAL_SUMMON' && x.uid && g.name(x.uid) === 'Crystal Beast Sapphire Pegasus');
    if (pegasus) out.push({ kind: 'do', title: 'Normal Summon Crystal Beast Sapphire Pegasus', reason: 'Its Summon places another Crystal Beast in your Spell & Trap Zone for free: that builds toward Rainbow Ruins, Crystal Beacon and Rainbow Dragon.', action: pegasus.action });
    // Best Normal Summon
    const summons = legal.filter((x) => x.action.type === 'NORMAL_SUMMON' && x.uid && !(pegasus && x.uid === pegasus.uid));
    if (summons.length) {
      const ranked = summons.map((x) => ({ x, atk: g.def(x.uid!).atk ?? 0 })).sort((a, b) => b.atk - a.atk);
      const top = ranked[0];
      const beats = !best || top.atk > Math.max(best.atk, best.def);
      out.push({
        kind: beats ? 'do' : 'hold',
        title: beats ? `Normal Summon ${g.name(top.x.uid!)}` : `${g.name(top.x.uid!)} would not beat ${best?.name}`,
        reason: beats
          ? `${top.atk} ATK ${best ? `beats ${best.name} (${best.atk} ATK / ${best.def} DEF)` : 'and your opponent has no monsters, so it can attack directly next Battle Phase'}.`
          : `${best?.name} has ${Math.max(best?.atk ?? 0, best?.def ?? 0)}. Consider Setting a monster in Defense Position instead, or keep building your hand.`,
        action: beats ? top.x.action : undefined,
      });
    }
    // Set traps
    const setTraps = legal.filter((x) => x.action.type === 'SET_SPELL_TRAP' && x.uid && g.def(x.uid).cardType === 'Trap');
    if (setTraps.length) out.push({ kind: 'do', title: `Set your Trap Card${setTraps.length > 1 ? 's' : ''} (${setTraps.map((x) => g.name(x.uid!)).join(', ')})`, reason: 'Traps cannot be activated the turn they are Set, so Setting them now means they are ready during your opponent\'s turn.', action: setTraps[0].action });
    // Quick-plays: set for the opponent's turn
    const qp = legal.filter((x) => x.action.type === 'SET_SPELL_TRAP' && x.uid && g.def(x.uid).property === 'Quick-Play');
    if (qp.length) out.push({ kind: 'hold', title: `Keep or Set ${g.name(qp[0].uid!)}`, reason: 'A Quick-Play Spell in your hand can only be used on your own turn. Set it if you want to use it during your opponent\'s turn (from next turn on).' });
    // Honest
    if (hand.some((c) => g.name(c.uid) === 'Honest') && myMonsters.some((m) => m.faceUp && g.attributeOf(m.uid) === 'LIGHT')) {
      out.push({ kind: 'hold', title: 'Keep Honest in your hand', reason: 'Its hand effect makes a LIGHT monster you control gain ATK equal to the opposing monster\'s ATK during battle, which usually wins the fight. Do not Normal Summon it.' });
    }
    // Swords
    const swords = legal.find((x) => x.action.type === 'ACTIVATE' && x.uid && g.name(x.uid) === 'Swords of Revealing Light');
    if (swords && best && best.atk > Math.max(0, ...myMonsters.map((m) => g.stats(m.uid).atk))) out.push({ kind: 'do', title: 'Swords of Revealing Light buys three turns', reason: `${best.name} out-muscles your field. Swords stops all of your opponent's attacks for their next three turns.`, action: swords.action });
    // Rainbow Dragon progress (Crystal Beast player)
    const rd = hand.find((c) => g.name(c.uid) === 'Rainbow Dragon');
    if (rd) {
      const names = new Set<string>();
      for (const m of myMonsters) if (g.name(m.uid).startsWith('Crystal Beast')) names.add(g.name(m.uid));
      for (const c of g.spellTrapCards(player)) if (g.name(c.uid).startsWith('Crystal Beast')) names.add(g.name(c.uid));
      for (const u of g.player(player).graveyard) if (g.name(u).startsWith('Crystal Beast')) names.add(g.name(u));
      out.push({ kind: 'info', title: `Rainbow Dragon: ${names.size}/7 different Crystal Beasts`, reason: 'Rainbow Dragon needs 7 Crystal Beasts with different names on your field and/or in your Graveyard. Placed Crystal Beasts in your Spell & Trap Zone count. Remember it cannot use its effects the turn it is Summoned, but it can attack.' });
    }
    // Battle available?
    const bp = legal.find((x) => x.action.type === 'TO_BATTLE_PHASE');
    if (bp && state.phase === 'MAIN1') {
      const attackers = myMonsters.filter((m) => m.faceUp && m.position === 'ATK');
      const good = attackers.filter((m) => !best || g.stats(m.uid).atk > Math.max(best.atk, best.def));
      if (good.length) out.push({ kind: 'do', title: 'Go to the Battle Phase', reason: `${good.map((m) => g.name(m.uid)).join(', ')} can attack ${best ? `${best.name} profitably` : 'directly'}. Summon and Set first: after the Battle Phase you can still use Main Phase 2.`, action: bp.action });
    }
    if (out.length === 0) {
      const end = legal.find((x) => x.action.type === 'END_TURN');
      if (end) out.push({ kind: 'info', title: 'Nothing strong to do: End Turn', reason: 'Set any Spells/Traps you want ready for your opponent\'s turn, keep your hand at 6 or fewer cards, then end the turn.', action: end.action });
    }
  }

  // ------------------------------------------------------------ battle phase
  if (state.phase === 'BATTLE') {
    const attacks = legal.filter((x) => x.action.type === 'DECLARE_ATTACK' && x.uid);
    const oppSet = g.spellTrapCards(opp).filter((c) => !c.faceUp).length;
    for (const a of attacks) {
      const atk = g.stats(a.uid!).atk;
      const oppMonsters = g.fieldMonsters(opp);
      if (oppMonsters.length === 0) out.push({ kind: 'do', title: `Attack directly with ${g.name(a.uid!)}`, reason: `Your opponent has no monsters: ${atk} damage straight to their Life Points.`, action: a.action });
      else {
        const targets = oppMonsters.filter((m) => m.faceUp && (m.position === 'ATK' ? g.stats(m.uid).atk < atk : g.stats(m.uid).def < atk));
        const faceDown = oppMonsters.filter((m) => !m.faceUp);
        if (targets.length) out.push({ kind: 'do', title: `${g.name(a.uid!)} can destroy ${targets.map((m) => g.name(m.uid)).join(' or ')}`, reason: `${atk} ATK beats ${targets.map((m) => `${g.name(m.uid)} (${m.position === 'ATK' ? `${g.stats(m.uid).atk} ATK` : `${g.stats(m.uid).def} DEF`})`).join(', ')}.${oppSet ? ` Careful: your opponent has ${oppSet} Set card${oppSet > 1 ? 's' : ''} that could be a Trap.` : ''}`, action: a.action });
        else if (faceDown.length && atk >= 2000) out.push({ kind: 'info', title: `${g.name(a.uid!)} could attack the face-down monster`, reason: `You do not know its DEF. With ${atk} ATK the risk is small (Emerald Tortoise has 2000 DEF, Rabidragon 2900), but Flip effects may trigger.`, action: a.action });
        else out.push({ kind: 'hold', title: `Do not attack with ${g.name(a.uid!)}`, reason: `${atk} ATK does not beat any opposing monster. Attacking a stronger monster costs you the monster and Life Points.` });
      }
    }
    if (attacks.length === 0) {
      const m2 = legal.find((x) => x.action.type === 'TO_MAIN2');
      if (m2) out.push({ kind: 'info', title: 'No more attacks: go to Main Phase 2', reason: 'You can still Set cards and change positions in Main Phase 2 before ending your turn.', action: m2.action });
    }
  }

  return out.slice(0, 5);
}

void hasType;
void getScript;
