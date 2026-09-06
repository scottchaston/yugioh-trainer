import { registerScript } from '../../engine/scripts';
import { TRAP_FROM, respondingToOpponentAttack, targetableMonsters, validTargets } from '../helpers';

// ---------------------------------------------------------------------------
// Compulsory Evacuation Device — Normal Trap
// ---------------------------------------------------------------------------
registerScript({
  name: 'Compulsory Evacuation Device',
  effects: [
    {
      id: 'activate',
      label: 'Return 1 monster on the field to the hand',
      description: 'Target 1 monster on the field; return that target to the hand.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: false,
      condition: (g, card, ctx) => (targetableMonsters(g, ctx.player, 'any').length === 0 ? 'There is no monster on the field to target.' : null),
      targets: function* (g, card, ctx) {
        return yield* g.selectCards(ctx.player, 'Target 1 monster on the field', targetableMonsters(g, ctx.player, 'any'), 1, 1);
      },
      resolve: function* (g, card, ctx) {
        const [t] = validTargets(g, ctx, ['monster', 'extraMonster']);
        if (!t) {
          g.log('The targeted monster is no longer on the field, so Compulsory Evacuation Device does nothing.', 'rule');
          return;
        }
        g.log(`${g.name(t)} is returned to the hand.`, 'effect');
        g.toHand(t);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Kunai with Chain — Normal Trap (1 or both effects)
// ---------------------------------------------------------------------------
registerScript({
  name: 'Kunai with Chain',
  effects: [
    {
      id: 'activate',
      label: 'Change the attacking monster to Defense Position and/or equip (+500 ATK)',
      description:
        'Activate 1 or both of these effects (simultaneously); ● When an opponent\'s monster declares an attack: Target the attacking monster; change that target to Defense Position. ● Target 1 face-up monster you control; equip this card to that target. It gains 500 ATK.',
      kind: 'activate',
      spellSpeed: 2,
      from: TRAP_FROM,
      damageStep: false,
      condition: (g, card, ctx) => {
        const canDef = respondingToOpponentAttack(g, ctx.player);
        const canEquip = targetableMonsters(g, ctx.player, 'own', (c) => c.faceUp).length > 0;
        if (!canDef && !canEquip) return 'Kunai with Chain needs either an attacking opponent\'s monster to target (right after the attack is declared) or a face-up monster you control to equip.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const canDef = respondingToOpponentAttack(g, ctx.player);
        const canEquip = targetableMonsters(g, ctx.player, 'own', (c) => c.faceUp).length > 0;
        const attacker = g.state.battle?.attacker;
        const options = [];
        if (canDef) options.push({ id: 'defense', label: `Change the attacking ${g.name(attacker!)} to Defense Position`, description: 'The attack is cancelled because the monster is no longer in Attack Position.' });
        if (canEquip) options.push({ id: 'equip', label: 'Equip Kunai with Chain to one of your monsters (+500 ATK)' });
        if (canDef && canEquip) options.push({ id: 'both', label: 'Activate both effects' });
        const choice = options.length === 1 ? options[0].id : yield* g.selectOption(ctx.player, 'Kunai with Chain: choose which effect(s) to activate', options);
        ctx.data['mode'] = choice;
        if (choice !== 'defense') ctx.data['keepOnField'] = true;
      },
      targets: function* (g, card, ctx) {
        const mode = ctx.data['mode'] as string;
        const targets: string[] = [];
        if (mode === 'defense' || mode === 'both') {
          const attacker = g.state.battle!.attacker!;
          if (g.targetingProtection(g.card(attacker), ctx.player)) throw new Error('The attacking monster cannot be targeted.');
          targets.push(attacker);
          ctx.data['attackerTarget'] = attacker;
        }
        if (mode === 'equip' || mode === 'both') {
          const pool = targetableMonsters(g, ctx.player, 'own', (c) => c.faceUp);
          const [m] = yield* g.selectCards(ctx.player, 'Target 1 face-up monster you control to equip', pool, 1, 1);
          targets.push(m);
          ctx.data['equipTarget'] = m;
        }
        return targets;
      },
      resolve: function* (g, card, ctx) {
        const mode = ctx.data['mode'] as string;
        if (mode === 'defense' || mode === 'both') {
          const a = ctx.data['attackerTarget'] as string;
          const c = g.state.cards[a];
          if (c && g.isMonsterOnField(c)) g.changePositionByEffect(a, 'DEF');
          else g.log('The attacking monster is no longer on the field.', 'rule');
        }
        if (mode === 'equip' || mode === 'both') {
          const m = ctx.data['equipTarget'] as string;
          const c = g.state.cards[m];
          if (c && g.isMonsterOnField(c) && c.faceUp && card.zone === 'spellTrap') {
            card.equippedTo = m;
            g.log(`Kunai with Chain is equipped to ${g.name(m)}, which gains 500 ATK.`, 'effect');
          } else {
            g.log('The equip target is no longer valid, so Kunai with Chain is sent to the Graveyard.', 'rule');
            if (card.zone === 'spellTrap') g.sendToGraveyard(card.uid, 'resolved');
          }
        }
      },
    },
  ],
  modifyStats: (g, self, target) => (self.zone === 'spellTrap' && self.faceUp && self.equippedTo === target.uid ? { atk: 500 } : null),
});
