/**
 * Enumerates what a player can do right now (and why other things are not allowed).
 * Used by the UI card menus and the "What can I do?" teaching button.
 */
import { isExtraDeckMonster } from '../cards';
import { Game } from './game';
import { getScript } from './scripts';
import {
  checkChangePosition,
  checkDeclareAttack,
  checkEndTurn,
  checkFlipSummon,
  checkNormalSummon,
  checkSetSpellTrap,
  checkSpecialSummonProcedure,
  checkToBattlePhase,
  checkToMain2,
} from './actions';
import { canActivateEffect, activationWhy } from './flow';
import { tributesRequired } from './battle';
import type { GameState, LegalActionInfo, PlayerId } from './types';

export function getLegalActions(state: GameState, player: PlayerId): LegalActionInfo[] {
  const g = new Game(state);
  const out: LegalActionInfo[] = [];
  if (!state.started || state.winner !== null) return out;
  const pl = g.player(player);

  // Hand cards
  for (const uid of pl.hand) {
    const d = g.def(uid);
    if (d.cardType === 'Monster') {
      if (!isExtraDeckMonster(d)) {
        const level = d.level ?? 0;
        const tributes = tributesRequired(level);
        const r1 = checkNormalSummon(g, player, uid, false);
        out.push({
          action: { type: 'NORMAL_SUMMON', player, uid },
          label: tributes > 0 ? `Tribute Summon (${tributes} Tribute${tributes > 1 ? 's' : ''})` : 'Normal Summon',
          legal: !r1,
          reason: r1 ?? undefined,
          rule: tributes > 0
            ? `${d.name} is Level ${level}. Level ${level >= 7 ? '7 or higher' : '5-6'} monsters must be Tribute Summoned by Tributing ${tributes} monster${tributes > 1 ? 's' : ''} you control. This uses your one Normal Summon for the turn.`
            : `${d.name} is Level ${level}. Level 4 or lower monsters can be Normal Summoned in face-up Attack Position without Tributes. You get one Normal Summon or Set per turn.`,
          uid,
        });
        const r2 = checkNormalSummon(g, player, uid, true);
        out.push({
          action: { type: 'SET_MONSTER', player, uid },
          label: tributes > 0 ? `Tribute Set (${tributes} Tribute${tributes > 1 ? 's' : ''})` : 'Set',
          legal: !r2,
          reason: r2 ?? undefined,
          rule: 'Setting places the monster face-down in Defense Position. It uses your one Normal Summon/Set for the turn, and the monster cannot be Flip Summoned until your next turn.',
          uid,
        });
      }
      const script = getScript(d.name);
      for (const proc of script?.specialSummon ?? []) {
        if (!proc.from.includes('hand')) continue;
        const r = checkSpecialSummonProcedure(g, player, uid, proc.id);
        out.push({ action: { type: 'SPECIAL_SUMMON', player, uid, procId: proc.id }, label: proc.label, legal: !r, reason: r ?? undefined, rule: proc.description, uid });
      }
      pushEffectActivations(g, player, uid, out);
    } else {
      // Spell / Trap
      const rs = checkSetSpellTrap(g, player, uid);
      out.push({
        action: { type: 'SET_SPELL_TRAP', player, uid },
        label: 'Set',
        legal: !rs,
        reason: rs ?? undefined,
        rule: d.cardType === 'Trap'
          ? 'Trap Cards must be Set face-down first. They cannot be activated during the turn they are Set, but from the next turn on they can be activated at the right timing, even during your opponent\'s turn.'
          : d.property === 'Quick-Play'
            ? 'A Quick-Play Spell can be Set face-down. Once Set, it cannot be activated during the same turn, but from the next turn on it can be activated even during your opponent\'s turn.'
            : 'Spell Cards can be Set face-down to hide them. A Set Spell can be activated later during your own Main Phase.',
        uid,
      });
      pushEffectActivations(g, player, uid, out);
    }
  }

  // Extra Deck monsters
  for (const uid of pl.extra) {
    const script = getScript(g.name(uid));
    for (const proc of script?.specialSummon ?? []) {
      if (!proc.from.includes('extra')) continue;
      const r = checkSpecialSummonProcedure(g, player, uid, proc.id);
      out.push({ action: { type: 'SPECIAL_SUMMON', player, uid, procId: proc.id }, label: proc.label, legal: !r, reason: r ?? undefined, rule: proc.description, uid });
    }
  }

  // Graveyard cards with special summon procedures / effects
  for (const uid of pl.graveyard) {
    const script = getScript(g.name(uid));
    for (const proc of script?.specialSummon ?? []) {
      if (!proc.from.includes('graveyard')) continue;
      const r = checkSpecialSummonProcedure(g, player, uid, proc.id);
      out.push({ action: { type: 'SPECIAL_SUMMON', player, uid, procId: proc.id }, label: proc.label, legal: !r, reason: r ?? undefined, rule: proc.description, uid });
    }
    pushEffectActivations(g, player, uid, out);
  }

  // Field monsters
  for (const m of g.fieldMonsters(player)) {
    const d = g.def(m.uid);
    if (m.faceUp) {
      const r = checkChangePosition(g, player, m.uid);
      out.push({
        action: { type: 'CHANGE_POSITION', player, uid: m.uid },
        label: m.position === 'ATK' ? 'Change to Defense Position' : 'Change to Attack Position',
        legal: !r,
        reason: r ?? undefined,
        rule: 'Once per turn during your Main Phase, a face-up monster can switch between Attack and Defense Position, unless it was Summoned/Set this turn or already attacked this turn.',
        uid: m.uid,
      });
    } else {
      const r = checkFlipSummon(g, player, m.uid);
      out.push({
        action: { type: 'FLIP_SUMMON', player, uid: m.uid },
        label: 'Flip Summon',
        legal: !r,
        reason: r ?? undefined,
        rule: 'A face-down monster that was Set on a previous turn can be Flip Summoned: turned face-up into Attack Position. This does not use your Normal Summon.',
        uid: m.uid,
      });
    }
    const ra = checkDeclareAttack(g, player, m.uid);
    out.push({
      action: { type: 'DECLARE_ATTACK', player, uid: m.uid },
      label: 'Attack',
      legal: !ra,
      reason: ra ?? undefined,
      rule: `During your Battle Phase, each face-up Attack Position monster can attack once. ${d.name} attacks an opposing monster, or attacks directly if your opponent controls no monsters.`,
      uid: m.uid,
    });
    pushEffectActivations(g, player, m.uid, out);
    const script = getScript(d.name);
    for (const proc of script?.specialSummon ?? []) {
      if (!proc.from.includes('monster')) continue;
      const r = checkSpecialSummonProcedure(g, player, m.uid, proc.id);
      out.push({ action: { type: 'SPECIAL_SUMMON', player, uid: m.uid, procId: proc.id }, label: proc.label, legal: !r, reason: r ?? undefined, rule: proc.description, uid: m.uid });
    }
  }

  // Spell/Trap zone + field zone
  for (const c of [...g.spellTrapCards(player), ...(g.fieldSpell(player) ? [g.fieldSpell(player)!] : [])]) {
    pushEffectActivations(g, player, c.uid, out);
  }

  // Phase actions
  const rb = checkToBattlePhase(g, player);
  out.push({ action: { type: 'TO_BATTLE_PHASE', player }, label: 'Enter Battle Phase', legal: !rb, reason: rb ?? undefined, rule: 'After Main Phase 1 you may enter the Battle Phase to attack with your monsters.' });
  const rm = checkToMain2(g, player);
  out.push({ action: { type: 'TO_MAIN2', player }, label: 'Go to Main Phase 2', legal: !rm, reason: rm ?? undefined, rule: 'After the Battle Phase you get a second Main Phase where you can still Summon (if you have not yet), Set and activate cards.' });
  const re = checkEndTurn(g, player);
  out.push({ action: { type: 'END_TURN', player }, label: 'End Turn', legal: !re, reason: re ?? undefined, rule: 'Ends your turn (End Phase). If you hold more than 6 cards you must discard down to 6. Then your opponent draws and starts their turn.' });

  return out;
}

function pushEffectActivations(g: Game, player: PlayerId, uid: string, out: LegalActionInfo[]): void {
  const card = g.card(uid);
  const d = g.def(uid);
  const script = getScript(d.name);
  if (!script) {
    if (d.cardType !== 'Monster' || card.zone === 'hand') {
      // Unimplemented spell/trap: show as not yet supported so the player understands.
      if (d.cardType !== 'Monster' && (card.zone === 'hand' || (card.zone === 'spellTrap' && !card.faceUp) || card.zone === 'field')) {
        out.push({
          action: { type: 'ACTIVATE', player, uid, effectId: 'activate' },
          label: 'Activate',
          legal: false,
          reason: `${d.name}'s effect is not implemented in this trainer yet, so it cannot be activated. You can still Set it.`,
          uid,
        });
      }
    }
    return;
  }
  const isTurnPlayerOpen = g.state.turnPlayer === player && !g.state.windowOpen;
  for (const effect of script.effects) {
    if (effect.kind === 'trigger') continue;
    if (!effect.from.includes(card.zone)) continue;
    const r = canActivateEffect(g, player, card, effect, { openState: isTurnPlayerOpen, chainSpeed: 0 });
    out.push({
      action: { type: 'ACTIVATE', player, uid, effectId: effect.id },
      label: effect.kind === 'activate' ? `Activate${card.zone === 'hand' && d.cardType === 'Spell' ? '' : ''}` : effect.label,
      legal: !r,
      reason: r ?? undefined,
      rule: r ? effect.description : `${activationWhy(g, card, effect)} ${effect.description}`,
      uid,
    });
  }
}

/** Legal actions for the given card only. */
export function actionsForCard(state: GameState, player: PlayerId, uid: string): LegalActionInfo[] {
  return getLegalActions(state, player).filter((a) => a.uid === uid);
}
