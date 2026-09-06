import { useEffect, useRef } from 'react';
import type { GameState } from '../engine';

export function LogPanel({ view }: { view: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.log.length]);
  return (
    <div className="panel log-panel">
      <h3>Game log</h3>
      <div className="log-list" ref={ref}>
        {view.log.map((e) => (
          <div key={e.id} className={`log-entry log-${e.kind}`} style={{ paddingLeft: 8 + e.indent * 14 }}>
            {e.text}
          </div>
        ))}
      </div>
    </div>
  );
}
