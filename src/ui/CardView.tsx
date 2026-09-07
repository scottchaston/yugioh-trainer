import type { CSSProperties } from 'react';
import { getCard, hasType, type CardDefinition } from '../cards';
import { CardArt } from './art';
import { tokenDefinition } from '../engine/game';
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

const ARROW_GLYPH: Record<string, string> = { TL: '↖', T: '↑', TR: '↗', L: '←', R: '→', BL: '↙', B: '↓', BR: '↘' };
export function linkArrowText(d: CardDefinition): string {
  return (d.linkArrows ?? []).map((a) => ARROW_GLYPH[a] ?? a).join('');
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
  const d = def ?? (card ? (card.token ? tokenDefinition(card.token) : getCard(card.cardId)) : undefined);
  const classes = ['card', `card-${size}`];
  if (faceDown || !d) classes.push('facedown');
  else classes.push(frameClass(d));
  if (selected) classes.push('selected');
  if (highlighted) classes.push('highlighted');
  if (dimmed) classes.push('dimmed');
  if (anim) classes.push(anim);
  if (card?.position === 'DEF' && (card.zone === 'monster' || card.zone === 'extraMonster')) classes.push('defense');
  if (card?.treatedAsSpell) classes.push('as-spell');
  const boosted = d && stats && d.cardType === 'Monster' && (stats.atk !== d.atk || stats.def !== d.def);
  return (
    <div className={classes.join(' ')} onClick={onClick} style={style} title={title ?? (faceDown ? 'Face-down card' : d?.name)} role={onClick ? 'button' : undefined} data-uid={card?.uid}>
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
            <div className="card-stars" title={d.linkRating ? `Link-${d.linkRating}` : d.rank ? `Rank ${d.rank}` : `Level ${d.level}`}>
              {d.linkRating ? `LINK-${d.linkRating} ${linkArrowText(d)}` : d.rank ? '◆'.repeat(Math.min(d.rank, 12)) : '★'.repeat(Math.min(d.level ?? 0, 12))}
            </div>
          )}
          <div className="card-art">
            <CardArt def={d} className="card-art-svg" />
          </div>
          <div className="card-type">{typeLine(d)}</div>
          {d.cardType === 'Monster' && (
            <div className={`card-stats${boosted ? ' boosted' : ''}`}>
              <span>ATK {stats ? stats.atk : d.atk}</span>
              {d.linkRating ? <span>LINK {d.linkRating}</span> : <span>DEF {stats ? stats.def : d.def}</span>}
            </div>
          )}
          {badge && <div className="card-badge">{badge}</div>}
          {card && card.materials.length > 0 && <div className="card-materials" title={`${card.materials.length} Xyz material${card.materials.length > 1 ? 's' : ''} attached`}>{'◉'.repeat(Math.min(card.materials.length, 5))}</div>}
        </>
      )}
    </div>
  );
}
