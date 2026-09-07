/**
 * Synthesised sound effects (Web Audio). No audio files are used: every sound is generated from
 * oscillators, FM, filtered noise and envelopes, so nothing copyrighted is involved.
 */
import type { Archetype } from './art/creatures';
import type { MotifKind } from './art/motifs';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function audioContext(): AudioContext | null {
  return ensure();
}
export function masterBus(): GainNode | null {
  ensure();
  return master;
}

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.4;
      sfxBus.connect(master);
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

// ---------------------------------------------------------------------------
// Synth toolkit
// ---------------------------------------------------------------------------

function softClip(): WaveShaperNode | null {
  const c = ensure();
  if (!c) return null;
  const ws = c.createWaveShaper();
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.5 * x);
  }
  ws.curve = curve;
  return ws;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  /** Frequency at the end (exponential slide). */
  slideTo?: number;
  /** Intermediate frequency (reached at 40% of the duration). */
  via?: number;
  vibratoHz?: number;
  vibratoDepth?: number;
  /** FM growl: modulator frequency and index (Hz of deviation). */
  fmHz?: number;
  fmIndex?: number;
  distort?: boolean;
  lowpass?: number;
  attack?: number;
  detune?: number;
}

function tone(freq: number, start: number, dur: number, o: ToneOpts = {}): void {
  const c = ensure();
  if (!c || !sfxBus || !enabled) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  if (o.detune) osc.detune.value = o.detune;
  osc.frequency.setValueAtTime(freq, t0);
  if (o.via) {
    osc.frequency.exponentialRampToValueAtTime(o.via, t0 + dur * 0.4);
    osc.frequency.exponentialRampToValueAtTime(o.slideTo ?? freq, t0 + dur);
  } else if (o.slideTo) {
    osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
  }
  let node: AudioNode = osc;
  if (o.vibratoHz) {
    const lfo = c.createOscillator();
    lfo.frequency.value = o.vibratoHz;
    const lg = c.createGain();
    lg.gain.value = o.vibratoDepth ?? freq * 0.04;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.1);
  }
  if (o.fmHz) {
    const mod = c.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = o.fmHz;
    const mg = c.createGain();
    mg.gain.value = o.fmIndex ?? freq;
    mod.connect(mg).connect(osc.frequency);
    mod.start(t0);
    mod.stop(t0 + dur + 0.1);
  }
  if (o.distort) {
    const ws = softClip();
    if (ws) {
      node.connect(ws);
      node = ws;
    }
  }
  if (o.lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    node.connect(f);
    node = f;
  }
  const g = c.createGain();
  const peak = o.gain ?? 0.4;
  const a = o.attack ?? 0.02;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g).connect(sfxBus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

interface NoiseOpts {
  gain?: number;
  filter?: number;
  /** Filter frequency at the end (sweep). */
  filterTo?: number;
  type?: BiquadFilterType;
  q?: number;
  attack?: number;
}

function noise(start: number, dur: number, o: NoiseOpts = {}): void {
  const c = ensure();
  if (!c || !sfxBus || !enabled) return;
  const t0 = c.currentTime + start;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(o.filter ?? 1200, t0);
  if (o.filterTo) f.frequency.exponentialRampToValueAtTime(o.filterTo, t0 + dur);
  if (o.q) f.Q.value = o.q;
  const g = c.createGain();
  const a = o.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.4, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t0);
}

/** Short metallic hit (FM). */
function clink(freq: number, start: number, dur = 0.12, gain = 0.25): void {
  tone(freq, start, dur, { type: 'sine', fmHz: freq * 2.37, fmIndex: freq * 1.5, gain, attack: 0.003 });
}

function swoosh(start = 0, dur = 0.35, gain = 0.4): void {
  noise(start, dur, { type: 'bandpass', filter: 400, filterTo: 3200, q: 1.2, gain, attack: 0.06 });
}

function chime(freq: number, start: number, dur = 0.8, gain = 0.2): void {
  tone(freq, start, dur, { type: 'sine', gain, attack: 0.005 });
  tone(freq * 2.01, start, dur * 0.7, { type: 'sine', gain: gain * 0.4, attack: 0.005 });
  tone(freq * 3.03, start, dur * 0.5, { type: 'sine', gain: gain * 0.2, attack: 0.005 });
}

function thud(start = 0, gain = 0.5): void {
  tone(90, start, 0.35, { type: 'sine', slideTo: 35, gain, attack: 0.005 });
  noise(start, 0.2, { filter: 300, gain: gain * 0.6 });
}

// ---------------------------------------------------------------------------
// Creature voices
// ---------------------------------------------------------------------------

export function playCreature(archetype: Archetype, mode: 'attack' | 'call' = 'attack'): void {
  if (!enabled) return;
  const long = mode === 'attack';
  switch (archetype) {
    case 'dragon':
      // Deep roar: growling FM sawtooth with a rising-then-falling sweep plus breath noise.
      tone(70, 0, long ? 1.1 : 0.6, { type: 'sawtooth', via: 150, slideTo: 55, fmHz: 28, fmIndex: 60, distort: true, lowpass: 900, gain: 0.55, attack: 0.08 });
      tone(140, 0.05, long ? 1.0 : 0.5, { type: 'square', via: 260, slideTo: 90, fmHz: 31, fmIndex: 90, distort: true, lowpass: 1400, gain: 0.25, attack: 0.1 });
      noise(0.1, long ? 0.9 : 0.4, { type: 'bandpass', filter: 500, filterTo: 250, q: 0.8, gain: 0.35, attack: 0.15 });
      break;
    case 'feline':
      // Big-cat roar/snarl: higher growl with a rasp.
      tone(160, 0, long ? 0.7 : 0.4, { type: 'sawtooth', via: 300, slideTo: 120, fmHz: 45, fmIndex: 120, distort: true, lowpass: 2200, gain: 0.45, attack: 0.04 });
      noise(0, long ? 0.6 : 0.35, { type: 'bandpass', filter: 1400, filterTo: 600, q: 1.5, gain: 0.4, attack: 0.03 });
      break;
    case 'tortoise':
      thud(0, 0.5);
      tone(120, 0.05, 0.6, { type: 'triangle', slideTo: 70, gain: 0.3, lowpass: 500 });
      break;
    case 'bird':
      // Eagle screech: piercing sweep with vibrato.
      tone(1800, 0, long ? 0.55 : 0.3, { type: 'sawtooth', via: 2600, slideTo: 1100, vibratoHz: 24, vibratoDepth: 120, lowpass: 5000, gain: 0.25, attack: 0.01 });
      noise(0, 0.3, { type: 'highpass', filter: 3000, gain: 0.12 });
      break;
    case 'pegasus':
      // Whinny with wobble, then hoof beats.
      tone(700, 0, long ? 0.6 : 0.35, { type: 'sawtooth', via: 1200, slideTo: 500, vibratoHz: 14, vibratoDepth: 90, lowpass: 3000, gain: 0.28, attack: 0.03 });
      if (long) {
        thud(0.55, 0.25);
        thud(0.72, 0.25);
        thud(0.86, 0.3);
      }
      break;
    case 'mammoth':
      // Trumpeting blast.
      tone(240, 0, long ? 0.9 : 0.5, { type: 'sawtooth', via: 520, slideTo: 300, vibratoHz: 8, vibratoDepth: 25, distort: true, lowpass: 1800, gain: 0.45, attack: 0.06 });
      thud(long ? 0.8 : 0.4, 0.4);
      break;
    case 'carbuncle':
      // Cheerful double chirp.
      tone(1200, 0, 0.12, { type: 'sine', slideTo: 2100, gain: 0.25, attack: 0.005 });
      tone(1400, 0.16, 0.14, { type: 'sine', slideTo: 2400, gain: 0.25, attack: 0.005 });
      break;
    case 'angel':
      chime(880, 0, 0.9, 0.22);
      chime(1318, 0.12, 0.8, 0.16);
      chime(1760, 0.24, 1.0, 0.14);
      break;
    case 'warrior':
      // Sword swing and steel ring.
      swoosh(0, 0.3, 0.5);
      clink(2600, 0.22, 0.25, 0.3);
      if (long) {
        swoosh(0.4, 0.28, 0.45);
        clink(2100, 0.6, 0.3, 0.3);
      }
      break;
    case 'mage':
      // Magic zap: rising tone with sparkle.
      tone(400, 0, 0.5, { type: 'sine', slideTo: 2400, gain: 0.25, attack: 0.02 });
      tone(800, 0.1, 0.5, { type: 'triangle', slideTo: 3200, gain: 0.15, attack: 0.02 });
      noise(0.2, 0.4, { type: 'highpass', filter: 5000, gain: 0.1 });
      break;
    case 'serpent':
      // Hiss and splash.
      noise(0, long ? 0.8 : 0.4, { type: 'highpass', filter: 2500, gain: 0.3, attack: 0.05 });
      noise(0.3, 0.5, { type: 'lowpass', filter: 900, filterTo: 300, gain: 0.3, attack: 0.02 });
      break;
    case 'insect':
      // Buzzing.
      tone(180, 0, long ? 0.7 : 0.4, { type: 'sawtooth', fmHz: 34, fmIndex: 40, lowpass: 2500, gain: 0.3, attack: 0.03 });
      tone(362, 0, long ? 0.7 : 0.4, { type: 'square', fmHz: 34, fmIndex: 20, lowpass: 2000, gain: 0.12, attack: 0.03 });
      break;
    case 'ghost':
      // Eerie wail.
      tone(420, 0, long ? 1.2 : 0.6, { type: 'sine', via: 330, slideTo: 480, vibratoHz: 5, vibratoDepth: 18, gain: 0.3, attack: 0.15 });
      tone(630, 0.1, long ? 1.0 : 0.5, { type: 'triangle', via: 500, slideTo: 700, vibratoHz: 6, vibratoDepth: 20, gain: 0.12, attack: 0.2 });
      break;
    case 'titan':
      // Thunder crack and rumble.
      noise(0, 0.15, { type: 'highpass', filter: 1500, gain: 0.6, attack: 0.002 });
      noise(0.05, long ? 1.3 : 0.7, { type: 'lowpass', filter: 400, filterTo: 90, gain: 0.7, attack: 0.02 });
      tone(55, 0.05, 1.0, { type: 'sawtooth', slideTo: 30, lowpass: 200, gain: 0.35, attack: 0.05 });
      break;
    case 'stone':
      noise(0, 0.9, { type: 'lowpass', filter: 300, filterTo: 120, gain: 0.5, attack: 0.05 });
      tone(60, 0, 0.8, { type: 'triangle', slideTo: 40, gain: 0.3 });
      break;
    case 'traptrix':
      // A sweet call, then the snap of a trap closing.
      tone(880, 0, long ? 0.25 : 0.2, { type: 'triangle', slideTo: 1320, gain: 0.2, attack: 0.02 });
      tone(1320, 0.22, 0.2, { type: 'triangle', slideTo: 1100, gain: 0.16 });
      if (long) {
        noise(0.5, 0.08, { type: 'highpass', filter: 2500, gain: 0.5, attack: 0.002 });
        thud(0.52, 0.5);
        clink(2400, 0.55, 0.15, 0.25);
      }
      break;
    case 'plant':
      // Leaves rustling and a soft pop.
      noise(0, long ? 0.6 : 0.35, { type: 'bandpass', filter: 1800, filterTo: 900, q: 0.7, gain: 0.35, attack: 0.05 });
      tone(520, 0.2, 0.15, { type: 'sine', slideTo: 780, gain: 0.15 });
      break;
    case 'kaiju':
      // Colossal roar and stomping footsteps.
      tone(50, 0, long ? 1.4 : 0.7, { type: 'sawtooth', via: 110, slideTo: 40, fmHz: 18, fmIndex: 80, distort: true, lowpass: 700, gain: 0.6, attack: 0.1 });
      noise(0.05, long ? 1.2 : 0.5, { type: 'lowpass', filter: 600, filterTo: 200, gain: 0.4, attack: 0.1 });
      thud(0.3, 0.9);
      if (long) thud(0.75, 0.9);
      break;
    case 'fiend':
      // Cackle plus a tuning-fork ring.
      for (let i = 0; i < 4; i++) tone(700 - i * 60, i * 0.09, 0.08, { type: 'square', slideTo: 900 - i * 60, gain: 0.14, lowpass: 3000 });
      chime(1760, 0.3, long ? 0.9 : 0.5, 0.18);
      chime(2637, 0.32, long ? 0.8 : 0.4, 0.1);
      break;
    case 'archfiend':
      // A hellish dragon roar: lower and harsher than a dragon, with crackling fire.
      tone(55, 0, long ? 1.3 : 0.7, { type: 'sawtooth', via: 130, slideTo: 45, fmHz: 22, fmIndex: 90, distort: true, lowpass: 800, gain: 0.6, attack: 0.06 });
      tone(110, 0.05, long ? 1.1 : 0.5, { type: 'square', via: 220, slideTo: 70, fmHz: 27, fmIndex: 110, distort: true, lowpass: 1200, gain: 0.3, attack: 0.1 });
      noise(0.15, long ? 1.0 : 0.5, { type: 'bandpass', filter: 900, filterTo: 300, q: 0.6, gain: 0.4, attack: 0.1 });
      for (let i = 0; i < 6; i++) clink(300 + Math.random() * 500, 0.3 + i * 0.09, 0.05, 0.12);
      break;
    case 'knight':
      // Armour clank, a resonant hum and a blade swing.
      clink(1200, 0, 0.2, 0.3);
      tone(220, 0.05, long ? 0.8 : 0.4, { type: 'sine', fmHz: 4, fmIndex: 10, gain: 0.22, attack: 0.1 });
      if (long) {
        swoosh(0.4, 0.3, 0.6);
        clink(3200, 0.7, 0.4, 0.3);
      }
      break;
    case 'hand':
      // Elemental crackle and a slap.
      noise(0, long ? 0.6 : 0.3, { type: 'highpass', filter: 1500, gain: 0.35, attack: 0.02 });
      tone(180, 0.1, 0.3, { type: 'sawtooth', slideTo: 90, distort: true, lowpass: 900, gain: 0.25 });
      thud(0.3, 0.6);
      break;
    case 'relic':
      // A holy sword drawn from its sheath.
      swoosh(0, 0.25, 0.4);
      clink(4200, 0.2, 0.9, 0.35);
      chime(1568, 0.25, 1.0, 0.16);
      chime(2093, 0.3, 1.0, 0.12);
      break;
    case 'psychic':
      // Warbling telekinetic hum.
      tone(330, 0, long ? 0.9 : 0.5, { type: 'sine', vibratoHz: 9, vibratoDepth: 40, gain: 0.22, attack: 0.1 });
      tone(660, 0.1, long ? 0.8 : 0.4, { type: 'triangle', slideTo: 990, vibratoHz: 6, vibratoDepth: 30, gain: 0.12, attack: 0.1 });
      break;
  }
}

// ---------------------------------------------------------------------------
// Spell / Trap sounds by motif
// ---------------------------------------------------------------------------

function chainRattle(start = 0): void {
  for (let i = 0; i < 7; i++) clink(1400 + Math.random() * 1400, start + i * 0.07, 0.1, 0.22);
  noise(start, 0.5, { type: 'highpass', filter: 4000, gain: 0.12 });
}

function crystalChimes(start = 0): void {
  chime(1046, start, 0.5, 0.18);
  chime(1568, start + 0.09, 0.55, 0.15);
  chime(2093, start + 0.18, 0.7, 0.12);
  chime(2637, start + 0.27, 0.8, 0.1);
}

export function playMotif(kind: MotifKind, isTrap: boolean): void {
  if (!enabled) return;
  switch (kind) {
    case 'chain':
    case 'fiendish':
    case 'release':
      chainRattle();
      if (isTrap) tone(880, 0, 0.12, { type: 'square', slideTo: 440, gain: 0.2 });
      break;
    case 'swords':
      swoosh(0, 0.3, 0.5);
      swoosh(0.25, 0.3, 0.5);
      swoosh(0.5, 0.3, 0.5);
      clink(3000, 0.75, 0.5, 0.3);
      chime(1760, 0.8, 0.9, 0.15);
      break;
    case 'burst':
      tone(200, 0, 0.6, { type: 'sine', slideTo: 1600, gain: 0.3, attack: 0.05 });
      noise(0.55, 0.7, { type: 'lowpass', filter: 6000, filterTo: 300, gain: 0.7, attack: 0.005 });
      tone(90, 0.55, 0.6, { type: 'sawtooth', slideTo: 40, distort: true, lowpass: 400, gain: 0.4 });
      break;
    case 'stomp':
      thud(0, 0.7);
      thud(0.25, 0.9);
      noise(0.25, 0.5, { filter: 200, gain: 0.5 });
      break;
    case 'wings':
      for (let i = 0; i < 3; i++) noise(i * 0.22, 0.2, { type: 'bandpass', filter: 300, filterTo: 900, q: 0.8, gain: 0.45, attack: 0.05 });
      swoosh(0.7, 0.5, 0.4);
      break;
    case 'cards':
    case 'shovel':
      for (let i = 0; i < 4; i++) noise(i * 0.09, 0.08, { type: 'highpass', filter: 2500, gain: 0.3 });
      if (kind === 'shovel') thud(0.4, 0.4);
      break;
    case 'ankh':
    case 'blessing':
    case 'shrine':
    case 'promise':
      chime(660, 0, 1.0, 0.22);
      chime(880, 0.15, 1.0, 0.18);
      chime(1320, 0.3, 1.2, 0.14);
      break;
    case 'cry':
      playCreature('dragon', 'call');
      break;
    case 'tactics':
    case 'castle':
      tone(220, 0, 0.5, { type: 'sawtooth', lowpass: 1500, gain: 0.3, attack: 0.05 });
      tone(330, 0.3, 0.6, { type: 'sawtooth', lowpass: 1800, gain: 0.3, attack: 0.05 });
      tone(440, 0.6, 0.8, { type: 'sawtooth', lowpass: 2200, gain: 0.3, attack: 0.05 });
      break;
    case 'soul':
      playCreature('ghost', 'call');
      swoosh(0.3, 0.5, 0.3);
      break;
    case 'controller':
      tone(880, 0, 0.08, { type: 'square', gain: 0.18 });
      tone(660, 0.1, 0.08, { type: 'square', gain: 0.18 });
      tone(1100, 0.2, 0.15, { type: 'square', gain: 0.18 });
      swoosh(0.3, 0.35, 0.35);
      break;
    case 'condenser':
      tone(60, 0, 0.5, { type: 'square', fmHz: 120, fmIndex: 80, distort: true, lowpass: 1200, gain: 0.3 });
      for (let i = 0; i < 5; i++) noise(0.05 + i * 0.08, 0.05, { type: 'highpass', filter: 3000, gain: 0.35 });
      break;
    case 'tomb':
      tone(80, 0, 0.9, { type: 'sawtooth', slideTo: 60, lowpass: 400, gain: 0.3, attack: 0.1 });
      noise(0.2, 0.7, { type: 'lowpass', filter: 500, gain: 0.3, attack: 0.1 });
      playCreature('ghost', 'call');
      break;
    case 'ejector':
      tone(200, 0, 0.25, { type: 'sine', slideTo: 900, gain: 0.3, attack: 0.005 });
      swoosh(0.15, 0.4, 0.5);
      break;
    case 'shield':
    case 'aegis':
      clink(900, 0, 0.4, 0.4);
      tone(300, 0, 0.5, { type: 'triangle', slideTo: 250, gain: 0.25 });
      if (kind === 'aegis') crystalChimes(0.2);
      break;
    case 'crystal':
    case 'beacon':
    case 'abundance':
    case 'miracle':
    case 'brilliance':
    case 'pair':
    case 'conclave':
    case 'bond':
    case 'wand':
    case 'counter':
    case 'boon':
      crystalChimes();
      if (kind === 'brilliance' || kind === 'miracle') tone(500, 0.3, 0.6, { type: 'sine', slideTo: 3000, gain: 0.15 });
      if (kind === 'boon') for (let i = 0; i < 4; i++) clink(2400 + i * 300, 0.3 + i * 0.09, 0.2, 0.2);
      break;
    case 'tree':
      noise(0, 0.5, { type: 'highpass', filter: 3500, gain: 0.25, attack: 0.1 });
      crystalChimes(0.25);
      break;
    case 'prism':
    case 'bridge':
    case 'heartbridge':
    case 'ruins':
      for (let i = 0; i < 6; i++) tone(523 * Math.pow(2, i / 6), i * 0.07, 0.5, { type: 'sine', gain: 0.16, attack: 0.01 });
      if (kind === 'ruins') noise(0, 0.8, { type: 'lowpass', filter: 300, gain: 0.35, attack: 0.1 });
      break;
    case 'darkOrb':
      tone(55, 0, 1.2, { type: 'sawtooth', fmHz: 3, fmIndex: 10, lowpass: 500, gain: 0.35, attack: 0.2 });
      tone(82, 0, 1.2, { type: 'sine', gain: 0.2, attack: 0.3 });
      break;
    case 'awakening':
      chime(880, 0, 0.6, 0.15);
      playCreature('dragon', 'call');
      break;
    case 'ferret':
      noise(0, 0.8, { type: 'bandpass', filter: 1800, q: 0.7, gain: 0.35, attack: 0.05 });
      for (let i = 0; i < 6; i++) noise(0.1 + i * 0.11, 0.04, { type: 'highpass', filter: 4000, gain: 0.3 });
      break;
    case 'globe':
      tone(220, 0, 0.8, { type: 'sine', fmHz: 6, fmIndex: 12, gain: 0.25, attack: 0.1 });
      tone(440, 0.2, 0.7, { type: 'triangle', slideTo: 660, gain: 0.15, attack: 0.1 });
      break;
    case 'cyclone':
      noise(0, 1.0, { type: 'bandpass', filter: 300, filterTo: 2500, q: 1, gain: 0.5, attack: 0.2 });
      tone(300, 0, 1.0, { type: 'sine', slideTo: 1200, vibratoHz: 7, vibratoDepth: 40, gain: 0.15, attack: 0.2 });
      break;
    case 'melody':
      tone(659, 0, 0.25, { type: 'triangle', gain: 0.22 });
      tone(784, 0.25, 0.25, { type: 'triangle', gain: 0.22 });
      tone(988, 0.5, 0.5, { type: 'triangle', gain: 0.22 });
      break;
    case 'hole':
      // A trapdoor drops open, the victim falls with a whoosh, then a distant thud.
      clink(900, 0, 0.1, 0.3);
      tone(600, 0.05, 0.6, { type: 'sine', slideTo: 120, gain: 0.25 });
      noise(0.05, 0.6, { type: 'bandpass', filter: 2000, filterTo: 300, q: 0.8, gain: 0.35 });
      thud(0.7, 0.8);
      break;
    case 'garden':
      noise(0, 0.6, { type: 'bandpass', filter: 1600, filterTo: 800, q: 0.8, gain: 0.3, attack: 0.1 });
      chime(1046, 0.1, 0.6, 0.14);
      chime(1318, 0.3, 0.6, 0.12);
      chime(1568, 0.5, 0.8, 0.1);
      break;
    case 'tune':
      tone(523, 0, 0.18, { type: 'triangle', gain: 0.22 });
      tone(659, 0.18, 0.18, { type: 'triangle', gain: 0.22 });
      tone(784, 0.36, 0.18, { type: 'triangle', gain: 0.22 });
      tone(1046, 0.54, 0.4, { type: 'triangle', gain: 0.22 });
      break;
    case 'lightning':
      noise(0, 0.08, { type: 'highpass', filter: 3000, gain: 0.9, attack: 0.001 });
      tone(2200, 0, 0.12, { type: 'sawtooth', slideTo: 200, distort: true, gain: 0.35 });
      noise(0.08, 0.9, { type: 'lowpass', filter: 3000, filterTo: 150, gain: 0.7, attack: 0.005 });
      tone(60, 0.1, 0.9, { type: 'sawtooth', slideTo: 35, distort: true, lowpass: 300, gain: 0.4 });
      break;
    case 'feather':
      swoosh(0, 0.35, 0.35);
      swoosh(0.3, 0.35, 0.3);
      noise(0.6, 0.5, { type: 'highpass', filter: 2500, gain: 0.2, attack: 0.1 });
      break;
    case 'armor':
      clink(800, 0, 0.25, 0.4);
      clink(1100, 0.12, 0.25, 0.35);
      thud(0.25, 0.5);
      tone(160, 0.3, 0.5, { type: 'sine', gain: 0.2, attack: 0.05 });
      break;
    case 'sanctum':
      chime(784, 0, 1.0, 0.16);
      chime(1046, 0.15, 1.0, 0.14);
      chime(1318, 0.3, 1.2, 0.12);
      tone(196, 0, 1.2, { type: 'sine', gain: 0.15, attack: 0.2 });
      break;
    case 'scales':
      clink(1500, 0, 0.3, 0.3);
      tone(440, 0.1, 0.5, { type: 'triangle', slideTo: 330, gain: 0.18 });
      clink(1500, 0.55, 0.3, 0.3);
      break;
    case 'flame':
      noise(0, 0.9, { type: 'bandpass', filter: 800, filterTo: 2000, q: 0.5, gain: 0.45, attack: 0.05 });
      tone(120, 0, 0.8, { type: 'sawtooth', slideTo: 240, distort: true, lowpass: 900, gain: 0.3, attack: 0.1 });
      for (let i = 0; i < 5; i++) clink(400 + Math.random() * 600, 0.2 + i * 0.1, 0.05, 0.12);
      break;
    case 'crimson':
      tone(110, 0, 1.0, { type: 'sawtooth', fmHz: 3, fmIndex: 20, lowpass: 600, gain: 0.3, attack: 0.15 });
      tone(165, 0.2, 0.8, { type: 'sine', vibratoHz: 5, vibratoDepth: 8, gain: 0.2, attack: 0.1 });
      noise(0.3, 0.6, { type: 'lowpass', filter: 500, gain: 0.25, attack: 0.1 });
      break;
    case 'gear':
      for (let i = 0; i < 6; i++) clink(700 + (i % 2) * 300, i * 0.1, 0.08, 0.25);
      tone(90, 0, 0.7, { type: 'square', fmHz: 12, fmIndex: 8, lowpass: 500, gain: 0.2, attack: 0.05 });
      break;
    case 'horn':
      tone(330, 0, 0.5, { type: 'sawtooth', slideTo: 440, lowpass: 2000, gain: 0.3, attack: 0.05 });
      tone(440, 0.45, 0.6, { type: 'sawtooth', lowpass: 2200, vibratoHz: 6, vibratoDepth: 6, gain: 0.3, attack: 0.02 });
      break;
    case 'pot':
      clink(600, 0, 0.3, 0.35);
      tone(300, 0.1, 0.4, { type: 'sine', slideTo: 500, gain: 0.2 });
      for (let i = 0; i < 3; i++) chime(1300 + i * 200, 0.4 + i * 0.1, 0.5, 0.12);
      break;
    case 'golem':
      thud(0, 1.0);
      thud(0.3, 1.0);
      tone(70, 0, 0.8, { type: 'sawtooth', slideTo: 50, distort: true, lowpass: 300, gain: 0.35 });
      clink(500, 0.35, 0.2, 0.3);
      break;
    case 'zone':
      tone(220, 0, 0.5, { type: 'square', slideTo: 330, lowpass: 1500, gain: 0.2, attack: 0.02 });
      tone(330, 0.3, 0.5, { type: 'square', slideTo: 220, lowpass: 1500, gain: 0.2 });
      noise(0.1, 0.5, { type: 'bandpass', filter: 1200, q: 2, gain: 0.2 });
      break;
    case 'crown':
      chime(1046, 0, 0.6, 0.18);
      chime(1318, 0.12, 0.6, 0.16);
      chime(1568, 0.24, 0.9, 0.16);
      tone(261, 0.3, 0.8, { type: 'sawtooth', lowpass: 1500, gain: 0.18, attack: 0.1 });
      break;
    case 'fist':
      swoosh(0, 0.2, 0.6);
      thud(0.2, 1.0);
      noise(0.2, 0.3, { type: 'lowpass', filter: 1500, filterTo: 200, gain: 0.5, attack: 0.002 });
      break;
    case 'roots':
      noise(0, 0.8, { type: 'lowpass', filter: 900, filterTo: 300, gain: 0.4, attack: 0.1 });
      for (let i = 0; i < 5; i++) clink(200 + i * 60, i * 0.12, 0.1, 0.2);
      tone(80, 0.2, 0.6, { type: 'sawtooth', slideTo: 60, lowpass: 400, gain: 0.25 });
      break;
    case 'value':
      for (let i = 0; i < 5; i++) clink(2200 + Math.random() * 800, i * 0.08, 0.2, 0.2);
      break;
  }
}

// ---------------------------------------------------------------------------
// Generic game sounds
// ---------------------------------------------------------------------------

export type SoundName = 'draw' | 'summon' | 'specialSummon' | 'attack' | 'impact' | 'damage' | 'heal' | 'spell' | 'trap' | 'monsterEffect' | 'destroy' | 'negate' | 'flip' | 'crystal' | 'boost' | 'swoosh' | 'click' | 'set';

export function playSound(name: SoundName): void {
  if (!enabled) return;
  switch (name) {
    case 'draw':
      noise(0, 0.12, { type: 'highpass', filter: 3000, gain: 0.25 });
      tone(900, 0.02, 0.08, { type: 'triangle', slideTo: 1400, gain: 0.12 });
      break;
    case 'set':
      noise(0, 0.15, { type: 'lowpass', filter: 1500, gain: 0.25 });
      thud(0.05, 0.2);
      break;
    case 'summon':
      tone(330, 0, 0.25, { type: 'sawtooth', slideTo: 660, gain: 0.22, lowpass: 2500 });
      tone(660, 0.12, 0.35, { type: 'triangle', slideTo: 990, gain: 0.25 });
      noise(0.1, 0.3, { filter: 800, gain: 0.12 });
      break;
    case 'specialSummon':
      tone(440, 0, 0.3, { type: 'sine', slideTo: 880, gain: 0.25 });
      tone(880, 0.15, 0.4, { type: 'sine', slideTo: 1760, gain: 0.25 });
      chime(1320, 0.3, 0.6, 0.18);
      noise(0.2, 0.4, { filter: 2000, gain: 0.1 });
      break;
    case 'attack':
      swoosh(0, 0.35, 0.45);
      tone(200, 0, 0.35, { type: 'sawtooth', slideTo: 60, lowpass: 1200, gain: 0.15 });
      break;
    case 'impact':
      noise(0, 0.25, { filter: 500, gain: 0.7 });
      tone(120, 0, 0.3, { type: 'square', slideTo: 40, gain: 0.3, lowpass: 600 });
      break;
    case 'damage':
      tone(220, 0, 0.35, { type: 'square', slideTo: 110, gain: 0.25, lowpass: 1500 });
      noise(0, 0.2, { filter: 700, gain: 0.3 });
      break;
    case 'heal':
      chime(523, 0, 0.3, 0.18);
      chime(659, 0.12, 0.3, 0.18);
      chime(784, 0.24, 0.5, 0.18);
      break;
    case 'spell':
      chime(660, 0, 0.3, 0.18);
      chime(880, 0.1, 0.3, 0.18);
      chime(1320, 0.2, 0.6, 0.16);
      noise(0, 0.5, { type: 'highpass', filter: 4000, gain: 0.06 });
      break;
    case 'trap':
      tone(880, 0, 0.12, { type: 'square', slideTo: 440, gain: 0.22 });
      tone(440, 0.1, 0.25, { type: 'sawtooth', slideTo: 220, gain: 0.22, lowpass: 2000 });
      noise(0.05, 0.3, { type: 'bandpass', filter: 1500, gain: 0.2 });
      break;
    case 'monsterEffect':
      tone(392, 0, 0.2, { type: 'triangle', slideTo: 784, gain: 0.22 });
      chime(784, 0.15, 0.4, 0.15);
      break;
    case 'destroy':
      noise(0, 0.45, { type: 'highpass', filter: 3500, gain: 0.55 });
      noise(0.05, 0.4, { filter: 400, gain: 0.4 });
      tone(90, 0, 0.4, { type: 'sawtooth', slideTo: 30, gain: 0.2, lowpass: 500 });
      for (let i = 0; i < 4; i++) clink(1800 + Math.random() * 1500, 0.05 + i * 0.06, 0.15, 0.15);
      break;
    case 'negate':
      tone(500, 0, 0.12, { type: 'square', slideTo: 250, gain: 0.28 });
      tone(250, 0.12, 0.25, { type: 'square', slideTo: 120, gain: 0.28, lowpass: 1500 });
      break;
    case 'flip':
      noise(0, 0.15, { type: 'bandpass', filter: 2500, gain: 0.2 });
      tone(600, 0.05, 0.1, { type: 'triangle', slideTo: 900, gain: 0.12 });
      break;
    case 'crystal':
      crystalChimes();
      break;
    case 'boost':
      tone(300, 0, 0.3, { type: 'sawtooth', slideTo: 1200, gain: 0.18, lowpass: 3000 });
      break;
    case 'swoosh':
      swoosh(0, 0.4, 0.45);
      break;
    case 'click':
      tone(1200, 0, 0.04, { type: 'square', gain: 0.06 });
      break;
  }
}
