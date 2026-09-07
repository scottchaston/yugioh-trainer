/**
 * Lightweight canvas particle system for impacts, destruction and summons.
 */
import { useEffect, useRef, type RefObject } from 'react';

export interface Burst {
  x: number;
  y: number;
  color: string;
  kind: 'impact' | 'shatter' | 'sparkle' | 'crystal';
  at: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shape: 'dot' | 'shard' | 'star';
  rot: number;
  vr: number;
}

const queue: Burst[] = [];
export function emitBurst(b: Omit<Burst, 'at'>): void {
  queue.push({ ...b, at: performance.now() });
}

export function ParticleCanvas({ container, enabled }: { container: RefObject<HTMLDivElement | null>; enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const host = container.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let particles: Particle[] = [];
    let raf = 0;
    let last = performance.now();
    // Measure the host with the canvas hidden: otherwise the canvas's own size keeps the host's scroll
    // size from shrinking (on phones that pushed the page wider than the screen).
    const measure = (): [number, number] => {
      canvas.style.display = 'none';
      const size: [number, number] = [host.scrollWidth, host.scrollHeight];
      canvas.style.display = '';
      return size;
    };
    const resize = () => {
      const [w, h] = measure();
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
    ro?.observe(host);
    const spawn = (b: Burst) => {
      const n = b.kind === 'impact' ? 34 : b.kind === 'shatter' ? 26 : b.kind === 'crystal' ? 18 : 22;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = b.kind === 'sparkle' ? 40 + Math.random() * 90 : 120 + Math.random() * 260;
        particles.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (b.kind === 'sparkle' ? 120 : 40),
          life: 0,
          maxLife: 0.5 + Math.random() * 0.6,
          size: b.kind === 'shatter' ? 4 + Math.random() * 6 : 2 + Math.random() * 3,
          color: i % 3 === 0 ? '#ffffff' : b.color,
          gravity: b.kind === 'sparkle' ? 60 : 420,
          shape: b.kind === 'shatter' ? 'shard' : b.kind === 'crystal' ? 'star' : 'dot',
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 12,
        });
      }
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      while (queue.length) spawn(queue.shift()!);
      if (canvas.width < host.clientWidth || canvas.height < host.clientHeight) resize();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles = particles.filter((p) => p.life < p.maxLife);
      for (const p of particles) {
        p.life += dt;
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const t = 1 - p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, t);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === 'shard') {
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.7, 0);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.5, 0);
          ctx.closePath();
          ctx.fill();
        } else if (p.shape === 'star') {
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            ctx.lineTo(Math.cos(a) * p.size * 2, Math.sin(a) * p.size * 2);
            ctx.lineTo(Math.cos(a + Math.PI / 4) * p.size * 0.6, Math.sin(a + Math.PI / 4) * p.size * 0.6);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.5 + t), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [container, enabled]);
  if (!enabled) return null;
  return <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" />;
}
