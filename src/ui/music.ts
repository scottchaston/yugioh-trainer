/**
 * Procedural background music in the spirit of dueling-anime soundtracks: a driving beat, a pulsing bass,
 * brassy synth chords and a heroic lead line, all generated with the Web Audio API (no recordings).
 * Two intensities: 'calm' (main phases) and 'battle' (Battle Phase adds hats, fills and a higher lead).
 */
import { audioContext, masterBus } from './sound';

type Intensity = 'calm' | 'battle';

const BPM = 150;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const LOOP_BARS = 8;

// Note helpers (MIDI numbers): E minor.
const N = { E2: 40, G2: 43, A2: 45, B2: 47, C3: 48, D3: 50, E3: 52, F3s: 54, G3: 55, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, F4s: 66, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, G5: 79 };
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Chord progression (one chord per bar): Em C G D | Em C D Bm-ish (B minor -> use B2 root with D/F#)
const CHORDS: number[][] = [
  [N.E3, N.G3, N.B3],
  [N.C3, N.E3, N.G3],
  [N.G3, N.B3, N.D4],
  [N.D3, N.F3s, N.A3],
  [N.E3, N.G3, N.B3],
  [N.C3, N.E3, N.G3],
  [N.D3, N.F3s, N.A3],
  [N.B2, N.D3, N.F3s],
];
const ROOTS = [N.E2, N.C3 - 12, N.G2, N.D3 - 12, N.E2, N.C3 - 12, N.D3 - 12, N.B2 - 12];

// Lead melody: [midi, startBeat, lengthBeats] over 8 bars (32 beats). 0 = rest.
const LEAD: [number, number, number][] = [
  [N.E4, 0, 0.5], [N.G4, 0.5, 0.5], [N.B4, 1, 1], [N.A4, 2, 0.5], [N.G4, 2.5, 0.5], [N.E4, 3, 1],
  [N.G4, 4, 0.5], [N.A4, 4.5, 0.5], [N.B4, 5, 1.5], [N.C5, 6.5, 0.5], [N.B4, 7, 1],
  [N.D5, 8, 0.5], [N.B4, 8.5, 0.5], [N.G4, 9, 1], [N.A4, 10, 0.5], [N.B4, 10.5, 0.5], [N.D5, 11, 1],
  [N.A4, 12, 0.5], [N.F4s, 12.5, 0.5], [N.A4, 13, 1], [N.D5, 14, 1.5], [N.B4, 15.5, 0.5],
  [N.E5, 16, 0.75], [N.D5, 16.75, 0.75], [N.B4, 17.5, 0.5], [N.G4, 18, 1], [N.A4, 19, 1],
  [N.G4, 20, 0.5], [N.E4, 20.5, 0.5], [N.G4, 21, 1], [N.C5, 22, 1], [N.B4, 23, 1],
  [N.A4, 24, 0.5], [N.B4, 24.5, 0.5], [N.D5, 25, 1], [N.F4s, 26, 0.5], [N.A4, 26.5, 0.5], [N.D5, 27, 1],
  [N.B4, 28, 1.5], [N.G4, 29.5, 0.5], [N.F4s, 30, 1], [N.E4, 31, 1],
];

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let timer: number | null = null;
let nextBeat = 0; // absolute beat index scheduled next
let startTime = 0;
let intensity: Intensity = 'calm';
let running = false;
let volume = 0.22;

function node(): { c: AudioContext; out: GainNode } | null {
  const c = audioContext();
  const m = masterBus();
  if (!c || !m) return null;
  if (!bus) {
    bus = c.createGain();
    bus.gain.value = volume;
    bus.connect(m);
  }
  ctx = c;
  return { c, out: bus };
}

function kick(t: number, out: GainNode, c: AudioContext, gain = 0.9): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.32);
}
function snare(t: number, out: GainNode, c: AudioContext, gain = 0.5): void {
  const len = Math.floor(c.sampleRate * 0.2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1800;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  s.connect(f).connect(g).connect(out);
  s.start(t);
  const o = c.createOscillator();
  const og = c.createGain();
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
  og.gain.setValueAtTime(gain * 0.6, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.14);
}
function hat(t: number, out: GainNode, c: AudioContext, gain = 0.18, open = false): void {
  const len = Math.floor(c.sampleRate * (open ? 0.25 : 0.06));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.22 : 0.05));
  s.connect(f).connect(g).connect(out);
  s.start(t);
}
function bass(midi: number, t: number, dur: number, out: GainNode, c: AudioContext): void {
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = hz(midi);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(250, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function pad(chord: number[], t: number, dur: number, out: GainNode, c: AudioContext, gain = 0.09): void {
  for (const m of chord) {
    for (const det of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = det;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.08);
      g.gain.setValueAtTime(gain, t + dur - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }
}
function lead(midi: number, t: number, dur: number, out: GainNode, c: AudioContext, gain = 0.2): void {
  for (const [type, det] of [['sawtooth', -5], ['square', 5]] as [OscillatorType, number][]) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    o.detune.value = det;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = c.createGain();
    lg.gain.value = 3;
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.setValueAtTime(gain, t + Math.max(0.03, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
}
function arp(chord: number[], beatStart: number, t: number, out: GainNode, c: AudioContext): void {
  const notes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 24];
  for (let i = 0; i < 4; i++) {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz(notes[i]);
    const g = c.createGain();
    const ts = t + i * (BEAT / 4);
    g.gain.setValueAtTime(0.0001, ts);
    g.gain.exponentialRampToValueAtTime(0.12, ts + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ts + BEAT / 4);
    o.connect(g).connect(out);
    o.start(ts);
    o.stop(ts + BEAT / 4 + 0.02);
  }
  void beatStart;
}

function scheduleBeat(beat: number, t: number, out: GainNode, c: AudioContext): void {
  const loopBeat = beat % (LOOP_BARS * 4);
  const bar = Math.floor(loopBeat / 4);
  const inBar = loopBeat % 4;
  const battle = intensity === 'battle';
  // Drums
  if (inBar === 0 || inBar === 2) kick(t, out, c);
  if (battle && (inBar === 1 || inBar === 3)) kick(t + BEAT * 0.5, out, c, 0.6);
  if (inBar === 1 || inBar === 3) snare(t, out, c);
  if (battle && bar === 7 && inBar === 3) {
    snare(t + BEAT * 0.25, out, c, 0.35);
    snare(t + BEAT * 0.5, out, c, 0.4);
    snare(t + BEAT * 0.75, out, c, 0.45);
  }
  hat(t, out, c, 0.16);
  hat(t + BEAT / 2, out, c, 0.1, inBar === 3);
  if (battle) {
    hat(t + BEAT / 4, out, c, 0.07);
    hat(t + (BEAT * 3) / 4, out, c, 0.07);
  }
  // Bass: 8th notes on the root, octave jumps on the off-beats in battle
  bass(ROOTS[bar], t, BEAT * 0.45, out, c);
  bass(battle && inBar % 2 === 1 ? ROOTS[bar] + 12 : ROOTS[bar], t + BEAT / 2, BEAT * 0.4, out, c);
  // Pads once per bar
  if (inBar === 0) pad(CHORDS[bar], t, BAR, out, c, battle ? 0.11 : 0.08);
  if (battle && inBar === 2) arp(CHORDS[bar], loopBeat, t, out, c);
  // Lead
  for (const [m, start, len] of LEAD) {
    if (start >= loopBeat && start < loopBeat + 1) {
      lead(battle ? m + 12 : m, t + (start - loopBeat) * BEAT, len * BEAT * 0.9, out, c, battle ? 0.17 : 0.15);
    }
  }
}

function tick(): void {
  const n = node();
  if (!n || !running) return;
  const { c, out } = n;
  const lookahead = 0.35;
  while (startTime + nextBeat * BEAT < c.currentTime + lookahead) {
    const t = startTime + nextBeat * BEAT;
    if (t >= c.currentTime - 0.05) scheduleBeat(nextBeat, Math.max(t, c.currentTime + 0.01), out, c);
    nextBeat++;
  }
}

export function startMusic(): void {
  const n = node();
  if (!n) return;
  if (running) return;
  running = true;
  startTime = n.c.currentTime + 0.1;
  nextBeat = 0;
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(tick, 100);
  tick();
}

export function stopMusic(): void {
  running = false;
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  if (bus && ctx) {
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    const old = bus;
    window.setTimeout(() => {
      try {
        old.disconnect();
      } catch {
        /* ignore */
      }
    }, 600);
    bus = null;
  }
}

export function setMusicIntensity(i: Intensity): void {
  intensity = i;
}

export function setMusicVolume(v: number): void {
  volume = v;
  if (bus && ctx) bus.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
}

export function isMusicRunning(): boolean {
  return running;
}
