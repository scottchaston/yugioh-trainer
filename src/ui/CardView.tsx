import type { CSSProperties } from 'react';
import { getCard, hasType, type CardDefinition } from '../cards';
import type { CardInstance } from '../engine';

export function frameClass(d: CardDefinition): string {
  if (d.cardType === 'Spell') return 'frame-spell';
  if (d.cardType === 'Trap') return 'frame-trap';
  if (hasType(d, 'Fusion')) return 'frame-fusion';
  if (hasType(d, 'Synchro')) return 'frame-synchro';
  if (hasType(d, 'Pendulum')) return 'frame-pendulum';
  if (hasType(d, 'Effect')) return 'frame-effect';
  return 'frame-normal';
}

export function attributeIcon(attr?: string): string {
  switch (attr) {
    case 'LIGHT':
      return '☀';
    case 'DARK':
      return '☾';
    case 'EARTH':
      return '⛰';
    case 'WATER':
      return '💧';
    case 'FIRE':
      return '🔥';
    case 'WIND':
      return '🌪';
    default:
      return '';
  }
}

export function typeLine(d: CardDefinition): string {
  if (d.cardType !== 'Monster') return `${d.property ?? 'Normal'} ${d.cardType}`;
  return [d.race, ...(d.monsterTypes ?? [])].filter(Boolean).join(' / ');
}

export function propertyIcon(d: CardDefinition): string {
  switch (d.property) {
    case 'Quick-Play':
      return '⚡';
    case 'Continuous':
      return '∞';
    case 'Equip':
      return '✚';
    case 'Field':
      return '⌂';
    case 'Counter':
      return '↩';
    default:
      return '';
  }
}

interface Props {
  card?: CardInstance;
  def?: CardDefinition;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  stats?: { atk: number; def: number } | null;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  anim?: string;
  onClick?: () => void;
  style?: CSSProperties;
  title?: string;
  badge?: string;
}

export function CardView({ card, def, faceDown, size = 'md', stats, selected, highlighted, dimmed, anim, onClick, style, title, badge }: Props) {
  const d = def ?? (card ? getCard(card.cardId) : undefined);
  const classes = ['card', `card-${size}`];
  if (faceDown || !d) classes.push('facedown');
  else classes.push(frameClass(d));
  if (selected) classes.push('selected');
  if (highlighted) classes.push('highlighted');
  if (dimmed) classes.push('dimmed');
  if (anim) classes.push(anim);
  if (card?.position === 'DEF' && (card.zone === 'monster' || card.zone === 'extraMonster')) classes.push('defense');
  if (card?.asContinuousSpell) classes.push('as-spell');
  const boosted = d && stats && d.cardType === 'Monster' && (stats.atk !== d.atk || stats.def !== d.def);
  return (
    <div className={classes.join(' ')} onClick={onClick} style={style} title={title ?? (faceDown ? 'Face-down card' : d?.name)} role={onClick ? 'button' : undefined}>
      {faceDown || !d ? (
        <div className="card-back">
          <div className="card-back-inner" />
        </div>
      ) : (
        <>
          <div className="card-head">
            <span className="card-name">{d.name}</span>
            {d.cardType === 'Monster' ? <span className="card-attr">{attributeIcon(d.attribute)}</span> : <span className="card-attr">{propertyIcon(d)}</span>}
          </div>
          {d.cardType === 'Monster' && (
            <div className="card-stars" title={`Level ${d.level}`}>
              {'★'.repeat(Math.min(d.level ?? 0, 12))}
            </div>
          )}
          <div className="card-art">
            <span className="card-art-glyph">{d.cardType === 'Monster' ? (d.race ?? '').slice(0, 1) : d.cardType === 'Spell' ? 'S' : 'T'}</span>
          </div>
          <div className="card-type">{typeLine(d)}</div>
          {d.cardType === 'Monster' && (
            <div className={`card-stats${boosted ? ' boosted' : ''}`}>
              <span>ATK {stats ? stats.atk : d.atk}</span>
              <span>DEF {stats ? stats.def : d.def}</span>
            </div>
          )}
          {badge && <div className="card-badge">{badge}</div>}
        </>
      )}
    </div>
  );
}
