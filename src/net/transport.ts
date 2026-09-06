/** A two-way message channel. The session layer never sees how messages travel. */
export interface Transport<Out, In> {
  send(msg: Out): void;
  onMessage(cb: (msg: In) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTransport = Transport<any, any>;

/** Two transports wired to each other in memory (tests, and a "same screen" fallback). */
export function loopbackPair<A, B>(): [Transport<A, B>, Transport<B, A>] {
  let aMsg: ((m: B) => void) | null = null;
  let bMsg: ((m: A) => void) | null = null;
  let aClose: (() => void) | null = null;
  let bClose: (() => void) | null = null;
  let open = true;
  const a: Transport<A, B> = {
    send: (m) => {
      if (open) bMsg?.(structuredClone(m));
    },
    onMessage: (cb) => {
      aMsg = cb;
    },
    onClose: (cb) => {
      aClose = cb;
    },
    close: () => {
      if (!open) return;
      open = false;
      bClose?.();
    },
  };
  const b: Transport<B, A> = {
    send: (m) => {
      if (open) aMsg?.(structuredClone(m));
    },
    onMessage: (cb) => {
      bMsg = cb;
    },
    onClose: (cb) => {
      bClose = cb;
    },
    close: () => {
      if (!open) return;
      open = false;
      aClose?.();
    },
  };
  return [a, b];
}
