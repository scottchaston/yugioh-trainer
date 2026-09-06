/**
 * Synthesised sound effects (Web Audio). No audio files are used: every sound is generated from
 * oscillators and filtered noise, so nothing copyrighted is involved.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function ensure(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture (click) so the browser lets audio play. */
export function unlockAudio(): void {
  ensure();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.5, slideTo?: number): void {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(master);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

function noise(start: number, dur: number, gain = 0.4, filterFreq = 1200, type: BiquadFilterType = 'lowpass'): void {
  const c = ensure();
  if (!c || !master) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  src.connect(f).connect(g).connect(master);
  src.start(c.currentTime + start);
}

export type SoundName = 'draw' | 'summon' | 'specialSummon' | 'attack' | 'impact' | 'damage' | 'heal' | 'spell' | 'trap' | 'monsterEffect' | 'destroy' | 'negate' | 'flip' | 'crystal' | 'boost' | 'click';

export function playSound(name: SoundName): void {
  if (!enabled) return;
  switch (name) {
    case 'draw':
      noise(0, 0.12, 0.25, 3000, 'highpass');
      tone(900, 0.02, 0.08, 'triangle', 0.15, 1400);
      break;
    case 'summon':
      tone(330, 0, 0.25, 'sawtooth', 0.25, 660);
      tone(660, 0.12, 0.35, 'triangle', 0.3, 990);
      noise(0.1, 0.3, 0.15, 800);
      break;
    case 'specialSummon':
      tone(440, 0, 0.3, 'sine', 0.3, 880);
      tone(880, 0.15, 0.4, 'sine', 0.3, 1760);
      tone(1320, 0.3, 0.5, 'triangle', 0.2);
      noise(0.2, 0.4, 0.12, 2000);
      break;
    case 'attack':
      noise(0, 0.35, 0.5, 2500, 'bandpass');
      tone(200, 0, 0.35, 'sawtooth', 0.2, 60);
      break;
    case 'impact':
      noise(0, 0.25, 0.7, 500);
      tone(120, 0, 0.3, 'square', 0.35, 40);
      break;
    case 'damage':
      tone(220, 0, 0.35, 'square', 0.3, 110);
      noise(0, 0.2, 0.3, 700);
      break;
    case 'heal':
      tone(523, 0, 0.2, 'sine', 0.25);
      tone(659, 0.12, 0.2, 'sine', 0.25);
      tone(784, 0.24, 0.35, 'sine', 0.25);
      break;
    case 'spell':
      tone(660, 0, 0.18, 'sine', 0.25);
      tone(880, 0.1, 0.18, 'sine', 0.25);
      tone(1320, 0.2, 0.4, 'triangle', 0.25);
      noise(0, 0.5, 0.08, 4000, 'highpass');
      break;
    case 'trap':
      tone(880, 0, 0.12, 'square', 0.25, 440);
      tone(440, 0.1, 0.25, 'sawtooth', 0.25, 220);
      noise(0.05, 0.3, 0.2, 1500, 'bandpass');
      break;
    case 'monsterEffect':
      tone(392, 0, 0.2, 'triangle', 0.25, 784);
      tone(784, 0.15, 0.3, 'sine', 0.2);
      break;
    case 'destroy':
      noise(0, 0.45, 0.6, 3500, 'highpass');
      noise(0.05, 0.4, 0.4, 400);
      tone(90, 0, 0.4, 'sawtooth', 0.2, 30);
      break;
    case 'negate':
      tone(500, 0, 0.12, 'square', 0.3, 250);
      tone(250, 0.12, 0.25, 'square', 0.3, 120);
      break;
    case 'flip':
      noise(0, 0.15, 0.2, 2500, 'bandpass');
      tone(600, 0.05, 0.1, 'triangle', 0.15, 900);
      break;
    case 'crystal':
      tone(1046, 0, 0.3, 'sine', 0.22);
      tone(1568, 0.08, 0.35, 'sine', 0.18);
      tone(2093, 0.16, 0.5, 'sine', 0.14);
      break;
    case 'boost':
      tone(300, 0, 0.3, 'sawtooth', 0.2, 1200);
      break;
    case 'click':
      tone(1200, 0, 0.04, 'square', 0.08);
      break;
  }
}
