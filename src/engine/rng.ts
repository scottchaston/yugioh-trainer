/** Small deterministic PRNG (mulberry32) so that shuffles are reproducible from the state. */
export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, state: t };
}

export function shuffleWithState<T>(arr: T[], rngState: number): { result: T[]; state: number } {
  const a = arr.slice();
  let s = rngState;
  for (let i = a.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return { result: a, state: s };
}
