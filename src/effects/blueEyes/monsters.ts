import { registerScript } from '../../engine/scripts';
import { battlingMonsters, isLight } from '../helpers';

// ---------------------------------------------------------------------------
// Honest
// ---------------------------------------------------------------------------
registerScript({
  name: 'Honest',
  effects: [
    {
      id: 'return',
      label: 'Return Honest from the field to your hand',
      description: 'During your Main Phase: You can return this face-up card from the field to the hand.',
      kind: 'ignition',
      spellSpeed: 1,
      from: ['monster'],
      condition: (g, card) => (card.faceUp ? null : 'Honest must be face-up.'),
      resolve: function* (g, card) {
        if (g.isMonsterOnField(card) && card.faceUp) {
          g.log('Honest returns to the hand.', 'effect');
          g.toHand(card.uid);
        }
      },
    },
    {
      id: 'boost',
      label: 'Send Honest from your hand to the GY: your LIGHT monster gains ATK equal to the opposing monster\'s ATK',
      description:
        "During the Damage Step, when a LIGHT monster you control battles (Quick Effect): You can send this card from your hand to the GY; that monster gains ATK equal to the ATK of the opponent's monster it is battling, until the end of this turn.",
      kind: 'quick',
      spellSpeed: 2,
      from: ['hand'],
      damageStep: 'calc',
      hidden: true,
      condition: (g, card, ctx) => {
        if (!ctx.damageStepStage) return "Honest's effect can only be activated during the Damage Step, when a LIGHT monster you control is battling an opponent's monster.";
        const b = battlingMonsters(g, ctx.player);
        if (!b || !b.theirs) return "Honest requires a monster you control to be battling an opponent's monster (not a direct attack).";
        if (!isLight(g, b.mine)) return `${g.name(b.mine)} is not a LIGHT monster.`;
        if (!g.card(b.mine).faceUp) return 'Your battling monster must be face-up.';
        return null;
      },
      cost: function* (g, card, ctx) {
        const b = battlingMonsters(g, ctx.player)!;
        ctx.data['mine'] = b.mine;
        ctx.data['theirs'] = b.theirs;
        g.log('Honest is sent from the hand to the Graveyard (cost).', 'effect');
        g.sendToGraveyard(card.uid, 'cost');
      },
      resolve: function* (g, card, ctx) {
        const mine = ctx.data['mine'] as string;
        const theirs = ctx.data['theirs'] as string;
        const m = g.state.cards[mine];
        const t = g.state.cards[theirs];
        if (!m || !g.isMonsterOnField(m) || !t || !g.isMonsterOnField(t)) {
          g.log('The battling monsters are no longer on the field, so Honest does nothing.', 'rule');
          return;
        }
        const gain = g.stats(theirs).atk;
        g.addStatMod(mine, gain, 0, 'endOfTurn', 'Honest');
        g.log(`${g.name(mine)} gains ${gain} ATK (the ATK of ${g.name(theirs)}) until the end of the turn. Its ATK is now ${g.stats(mine).atk}.`, 'effect');
      },
    },
  ],
});
