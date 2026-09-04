import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { api, type CounterRow } from '../api';
import type { RealtimeState } from '../useRealtime';
import { Empty } from './bits';

/**
 * Economía: MonaCoins, MonaPoints y el MonaTimer.
 *
 * Dos fuentes que se combinan a propósito. La sala tiene el valor en vivo, que
 * cambia en el mismo instante en que una regla otorga algo; D1 tiene el valor
 * persistido, que es el que sobrevive a que la sala hiberne. Se muestra el de
 * la sala cuando hay conexión porque es el que va por delante.
 */

/** Contadores con nombre propio. El resto son los que cree el streamer. */
const RESERVED: Record<string, { label: string; hint: string }> = {
  monacoins: { label: 'MonaCoins', hint: 'Moneda que otorgan las reglas' },
  monopoints: { label: 'MonaPoints', hint: 'Puntos de participación' },
  timer: { label: 'MonaTimer', hint: 'Segundos acumulados del subatón' },
};

export function Economy({ realtime }: { realtime: RealtimeState }) {
  const [stored, setStored] = useState<CounterRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .counters()
      .then((r) => setStored(r.counters))
      .catch(() => setStored([]))
      .finally(() => setLoaded(true));
  }, []);

  // La unión de ambas fuentes: un contador puede existir solo en una de ellas.
  const keys = [...new Set([...Object.keys(realtime.counters), ...stored.map((c) => c.key)])];
  const valueOf = (key: string) =>
    realtime.connected && key in realtime.counters
      ? realtime.counters[key]!
      : (stored.find((c) => c.key === key)?.value ?? 0);

  const ordered = [
    ...Object.keys(RESERVED).filter((k) => keys.includes(k)),
    ...keys.filter((k) => !(k in RESERVED)).sort(),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Contadores</h2>
              <p className="mt-1 text-sm text-mw-muted">
                Los otorgan las reglas al procesar un evento. Nunca bajan de cero.
              </p>
            </div>
            <span className="mw-label">{realtime.connected ? 'en vivo' : 'valor guardado'}</span>
          </div>

          {!loaded && <p className="mt-4 text-sm text-mw-dim">Cargando…</p>}

          {loaded && ordered.length === 0 && (
            <div className="mt-4">
              <Empty>
                Todavía no hay contadores. Se crean solos cuando una regla otorga algo por
                primera vez.
              </Empty>
            </div>
          )}

          {ordered.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((key) => (
                <div key={key} className="rounded-xl border border-mw-line bg-white/[0.03] p-4">
                  <div className="mw-label">{RESERVED[key]?.label ?? key}</div>
                  <div className="mw-stat mt-1">
                    {key === 'timer'
                      ? formatDuration(valueOf(key))
                      : Math.round(valueOf(key)).toLocaleString('es-ES')}
                  </div>
                  <p className="mt-1 text-xs text-mw-dim">
                    {RESERVED[key]?.hint ?? 'Contador propio'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card.Body>
      </Card.Root>

      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <h2 className="font-display text-lg font-bold">Cómo se otorgan</h2>
          <p className="mt-2 max-w-prose text-sm text-mw-muted">
            Un contador no se edita a mano: lo mueve una regla. En{' '}
            <b className="text-mw-text">Alertas y reglas</b> añade una acción de tipo contador
            a la regla que quieras, y cada evento que case sumará lo que indiques.
          </p>
          <p className="mt-2 max-w-prose text-sm text-mw-muted">
            El valor se guarda en unidades nativas: cinco rosas de TikTok son cinco rosas, no
            su equivalente en euros. Cuánto vale cada cosa lo decides tú en la regla.
          </p>
        </Card.Body>
      </Card.Root>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}
