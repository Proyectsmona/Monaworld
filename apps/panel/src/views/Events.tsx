import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { api, type EventRow } from '../api';
import type { Settings } from '../api';
import type { RealtimeState } from '../useRealtime';
import { Empty, PlatformChip } from './bits';

/**
 * Simulador e historial. El simulador es lo que permite tener el producto
 * funcionando de punta a punta sin ninguna plataforma conectada: recorre
 * exactamente el mismo camino que un evento real.
 */
const PRESETS = [
  { label: 'Follow', platform: 'twitch', type: 'follow', amount: 0 },
  { label: 'Suscripción', platform: 'twitch', type: 'subscribe', amount: 1 },
  { label: '500 bits', platform: 'twitch', type: 'cheer', amount: 500 },
  { label: 'Raid ×42', platform: 'twitch', type: 'raid', amount: 42 },
  { label: 'Super Chat', platform: 'youtube', type: 'superchat', amount: 5 },
  { label: 'Miembro', platform: 'youtube', type: 'member', amount: 1 },
  { label: 'Chat Kick', platform: 'kick', type: 'chat', amount: 0 },
  { label: 'Rosa ×5', platform: 'tiktok', type: 'gift', amount: 5, giftName: 'Rose' },
  { label: 'Galaxy', platform: 'tiktok', type: 'gift', amount: 1, giftName: 'Galaxy' },
  { label: 'Me gusta ×20', platform: 'tiktok', type: 'like', amount: 20 },
] as const;

export function Events({
  realtime,
  settings,
}: {
  realtime: RealtimeState;
  settings: Settings;
}) {
  const [history, setHistory] = useState<EventRow[]>([]);
  const [name, setName] = useState('usuario_demo');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(() => {
    void api.events(50).then((r) => setHistory(r.events)).catch(() => {});
  }, []);

  useEffect(reload, [reload]);
  // Cuando llega un evento en vivo, el historial persistido se queda corto.
  useEffect(() => {
    if (realtime.live.length) reload();
  }, [realtime.live.length, reload]);

  const fire = async (preset: (typeof PRESETS)[number]) => {
    setBusy(preset.label);
    setNote(null);
    try {
      const res = await api.simulate({
        platform: preset.platform,
        type: preset.type,
        amount: preset.amount,
        giftName: 'giftName' in preset ? preset.giftName : undefined,
        displayName: name.trim() || 'usuario_demo',
      });
      setNote(res.accepted ? `Evento enviado: ${preset.label}` : `Descartado: ${res.reason}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Error al simular');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <h2 className="font-display text-lg font-bold">Simulador</h2>
          <p className="mt-1 text-sm text-mw-muted">
            Dispara un evento real por el mismo tubo: reglas, contadores, cola de alertas y
            overlay. Queda marcado como simulado en el historial.
          </p>

          <label className="mt-4 flex max-w-xs flex-col gap-1.5">
            <span className="mw-label">Nombre del espectador</span>
            <InputText value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                severity="secondary"
                size="small"
                loading={busy === p.label}
                onClick={() => fire(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {note && <p className="mt-3 text-sm text-mw-muted">{note}</p>}
        </Card.Body>
      </Card.Root>

      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <h2 className="font-display text-lg font-bold">Historial</h2>

          {history.length === 0 ? (
            <div className="mt-4">
              <Empty>Todavía no hay eventos guardados.</Empty>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-mw-line text-left">
                    <th className="mw-label py-2 pr-4 font-medium">Plataforma</th>
                    <th className="mw-label py-2 pr-4 font-medium">Tipo</th>
                    <th className="mw-label py-2 pr-4 font-medium">Espectador</th>
                    <th className="mw-label py-2 pr-4 text-right font-medium">Cantidad</th>
                    <th className="mw-label py-2 font-medium">Cuándo</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((e) => (
                    <tr key={e.id} className="border-b border-mw-line-soft last:border-0">
                      <td className="py-2.5 pr-4">
                        <PlatformChip platform={e.platform} />
                      </td>
                      <td className="py-2.5 pr-4">
                        {e.eventType}
                        {e.giftName && <span className="text-mw-muted"> · {e.giftName}</span>}
                        {e.simulated && <span className="mw-label ml-2">simulado</span>}
                      </td>
                      <td className="py-2.5 pr-4">{e.username ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                        {e.amount ? e.amount.toLocaleString('es-ES') : '—'}
                      </td>
                      <td className="py-2.5 text-mw-dim">
                        {new Date(e.createdAt + 'Z').toLocaleString('es-ES', {
                          timeZone: settings.timezone,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Body>
      </Card.Root>
    </div>
  );
}
