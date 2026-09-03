import { useEffect, useRef, useState } from 'react';
import type { StreamEvent } from '@monaworld/domain';
import type { ServerMessage } from '@monaworld/contracts';

export interface RealtimeState {
  connected: boolean;
  counters: Record<string, number>;
  timerSeconds: number;
  /** Últimos eventos recibidos en vivo, más recientes primero. */
  live: StreamEvent[];
}

const MAX_LIVE = 60;

/**
 * Conexión del panel con la sala. Reconecta con retroceso exponencial: durante
 * un directo la pestaña puede dormirse o la red parpadear, y el panel tiene que
 * volver solo sin que nadie lo recargue.
 */
export function useRealtime(enabled: boolean): RealtimeState {
  const [state, setState] = useState<RealtimeState>({
    connected: false,
    counters: {},
    timerSeconds: 0,
    live: [],
  });
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/room/default/ws?role=panel`);
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setState((s) => ({ ...s, connected: true }));
        ws.send(JSON.stringify({ t: 'hello', role: 'panel' }));
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (msg.t === 'state') {
          setState((s) => ({
            ...s,
            counters: msg.counters,
            timerSeconds: msg.timerSeconds,
          }));
        } else if (msg.t === 'event') {
          setState((s) => ({ ...s, live: [msg.event, ...s.live].slice(0, MAX_LIVE) }));
        } else if (msg.t === 'clear') {
          setState((s) => ({ ...s, live: [], counters: {} }));
        }
      };

      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        if (closed) return;
        const delay = Math.min(1000 * 2 ** attempt++, 15_000);
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
    };
  }, [enabled]);

  return state;
}
