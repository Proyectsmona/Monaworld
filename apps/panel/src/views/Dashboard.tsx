import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { api, type AccountStatus, type CounterRow, type EventRow } from '../api';
import type { RealtimeState } from '../useRealtime';
import type { ViewId } from '../App';
import { PlatformChip, StatusChip } from './bits';

export function Dashboard({
  realtime,
  onGoTo,
}: {
  realtime: RealtimeState;
  onGoTo: (v: ViewId) => void;
}) {
  const [counters, setCounters] = useState<CounterRow[]>([]);
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    void api.counters().then((r) => setCounters(r.counters)).catch(() => {});
    void api.accounts().then((r) => setAccounts(r.accounts)).catch(() => {});
    void api.events(8).then((r) => setEvents(r.events)).catch(() => {});
  }, []);

  // El valor en vivo de la sala manda sobre el que se leyó de la base.
  const valueOf = (key: string) =>
    realtime.counters[key] ?? counters.find((c) => c.key === key)?.value ?? 0;

  const STATS = [
    { key: 'monacoins', label: 'MonaCoins' },
    { key: 'monopoints', label: 'MonaPoints' },
    { key: 'timer', label: 'MonaTimer', suffix: 's' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STATS.map((s) => (
          <Card.Root key={s.key} className="mw-panel">
            <Card.Body className="p-5">
              <div className="mw-label">{s.label}</div>
              <div className="mw-stat mt-1 text-mw-pink">
                {Math.round(valueOf(s.key)).toLocaleString('es-ES')}
                {s.suffix ?? ''}
              </div>
            </Card.Body>
          </Card.Root>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card.Root className="mw-panel">
          <Card.Body className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-bold">Conectores</h2>
              <Button variant="text" size="small" onClick={() => onGoTo('platforms')}>
                Gestionar
              </Button>
            </div>
            <p className="mt-1 text-sm text-mw-muted">
              Twitch y Kick llegan por webhook y funcionan sin el agente. YouTube y TikTok
              necesitan el proceso local.
            </p>
            <ul className="mt-4 flex flex-col divide-y divide-mw-line-soft">
              {accounts.map((a) => (
                <li key={a.platform} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <PlatformChip platform={a.platform} />
                    <span className="mw-label">
                      {a.via === 'webhook' ? 'Worker' : 'Agente'}
                    </span>
                  </div>
                  <StatusChip status={a.status} />
                </li>
              ))}
              {accounts.length === 0 && (
                <li className="py-3 text-sm text-mw-dim">Cargando conectores…</li>
              )}
            </ul>
          </Card.Body>
        </Card.Root>

        <Card.Root className="mw-panel">
          <Card.Body className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-bold">Últimos eventos</h2>
              <Button variant="text" size="small" onClick={() => onGoTo('events')}>
                Ver todo
              </Button>
            </div>

            <ul className="mt-4 flex flex-col gap-2">
              {realtime.live.slice(0, 6).map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-mw-pink/30 bg-mw-pink/[0.06] px-3 py-2 text-sm"
                >
                  <span className="mw-label mr-2">{e.platform}</span>
                  <b>{e.actor.displayName}</b>
                  <span className="text-mw-muted"> · {e.type}</span>
                </li>
              ))}

              {realtime.live.length === 0 &&
                events.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-lg border border-mw-line bg-black/20 px-3 py-2 text-sm"
                  >
                    <span className="mw-label mr-2">{e.platform}</span>
                    <b>{e.username ?? 'anónimo'}</b>
                    <span className="text-mw-muted"> · {e.eventType}</span>
                  </li>
                ))}

              {realtime.live.length === 0 && events.length === 0 && (
                <li className="text-sm text-mw-dim">
                  Sin eventos todavía. Dispara uno desde el simulador.
                </li>
              )}
            </ul>
          </Card.Body>
        </Card.Root>
      </div>
    </div>
  );
}
