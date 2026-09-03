import { useEffect, useRef, useState } from 'react';
import type { ServerMessage } from '@monaworld/contracts';

interface ActiveAlert {
  id: string;
  widget: string;
  text: string;
  durationMs: number;
  soundUrl?: string;
  imageUrl?: string;
  platform: string;
  avatarUrl?: string;
}

const PLATFORM_COLOR: Record<string, string> = {
  twitch: '#a970ff',
  youtube: '#ff4e45',
  kick: '#53fc18',
  tiktok: '#25f4ee',
  manual: '#ff35b8',
};

/**
 * Renderer del overlay para OBS.
 *
 * La cola vive en el Durable Object, no aquí: este componente solo pinta la
 * alerta que le mandan y avisa cuando termina, para que salga la siguiente.
 * Así el orden se mantiene aunque OBS recargue la fuente a mitad de directo.
 */
export function Overlay() {
  const params = new URLSearchParams(location.search);
  const widget = params.get('widget') ?? 'alert';
  const token = params.get('t') ?? '';

  const [alert, setAlert] = useState<ActiveAlert | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${location.host}/room/default/ws?role=overlay&t=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        ws.send(JSON.stringify({ t: 'hello', role: 'overlay' }));
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (msg.t === 'alert') {
          setLeaving(false);
          setAlert(msg as ActiveAlert);
        } else if (msg.t === 'state') {
          setCounters(msg.counters);
        } else if (msg.t === 'clear') {
          setAlert(null);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 15_000));
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
    };
  }, [token]);

  // Ciclo de vida de una alerta: entra, se mantiene, sale, y avisa al hub.
  useEffect(() => {
    if (!alert) return;

    if (alert.soundUrl) {
      const audio = new Audio(alert.soundUrl);
      audio.volume = 0.8;
      void audio.play().catch(() => {
        // OBS permite autoplay; un navegador normal puede bloquearlo.
      });
    }

    const outAt = setTimeout(() => setLeaving(true), Math.max(alert.durationMs - 400, 200));
    const doneAt = setTimeout(() => {
      socketRef.current?.send(JSON.stringify({ t: 'alertDone', id: alert.id }));
      setAlert(null);
      setLeaving(false);
    }, alert.durationMs);

    return () => {
      clearTimeout(outAt);
      clearTimeout(doneAt);
    };
  }, [alert]);

  if (widget === 'goal') {
    return <Goals counters={counters} />;
  }

  if (widget === 'timer') {
    return <Timer seconds={counters['timer'] ?? 0} />;
  }

  return (
    <div className="stage">
      {!connected && <div className="offline">MonaWorld · sin conexión</div>}
      {alert && alert.widget !== 'sound' && (
        <div
          className={`alert ${leaving ? 'is-leaving' : 'is-entering'}`}
          style={{ '--accent': PLATFORM_COLOR[alert.platform] ?? '#ff35b8' } as React.CSSProperties}
        >
          {alert.imageUrl && <img className="alert-media" src={alert.imageUrl} alt="" />}
          {alert.avatarUrl && <img className="alert-avatar" src={alert.avatarUrl} alt="" />}
          {/* Texto plano: nunca innerHTML, porque el nombre viene de una plataforma. */}
          <div className="alert-text">{alert.text}</div>
        </div>
      )}
    </div>
  );
}

function Goals({ counters }: { counters: Record<string, number> }) {
  const entries = Object.entries(counters).filter(([k]) => k !== 'timer');
  return (
    <div className="stage stage-goals">
      {entries.map(([key, value]) => (
        <div key={key} className="goal">
          <div className="goal-head">
            <span>{key}</span>
            <b>{Math.round(value).toLocaleString('es-ES')}</b>
          </div>
          <div className="goal-track">
            <div
              className="goal-fill"
              style={{ width: `${Math.min(100, (value % 1000) / 10)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Timer({ seconds }: { seconds: number }) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="stage stage-timer">
      <div className="timer">
        {h > 0 && <>{pad(h)}:</>}
        {pad(m)}:{pad(s)}
      </div>
    </div>
  );
}
