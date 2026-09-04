import { useEffect, useMemo, useRef } from 'react';
import { Card } from 'primereact/card';
import type { RealtimeState } from '../useRealtime';
import { Empty, platformLabel, platformStyle } from './bits';

/**
 * Multi Chat: los mensajes de las cuatro plataformas en una sola columna.
 *
 * No pide nada al servidor: se apoya en los eventos en crudo que la sala ya
 * difunde al panel. Por eso arranca vacío y se llena en directo — el historial
 * completo vive en la vista de Eventos, que sí consulta la base.
 *
 * Solo lectura, como todo MonaWorld: aquí no hay caja para responder porque
 * el producto no publica en ninguna plataforma.
 */
export function Chat({ realtime }: { realtime: RealtimeState }) {
  const messages = useMemo(
    // `live` llega con el más reciente primero; el chat se lee al revés.
    () => realtime.live.filter((e) => e.type === 'chat' && e.message).reverse(),
    [realtime.live],
  );

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex flex-col gap-5">
      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Multi Chat</h2>
              <p className="mt-1 text-sm text-mw-muted">
                Twitch, YouTube, Kick y TikTok en una sola columna. Solo lectura.
              </p>
            </div>
            <span className="mw-label">
              {realtime.connected ? `${messages.length} en vivo` : 'sin conexión'}
            </span>
          </div>

          {messages.length === 0 ? (
            <div className="mt-4">
              <Empty>
                {realtime.connected
                  ? 'Esperando mensajes. Aparecerán aquí en cuanto alguien escriba.'
                  : 'Sin conexión con la sala.'}
              </Empty>
            </div>
          ) : (
            <div className="mt-4 flex max-h-[62vh] flex-col gap-1.5 overflow-y-auto pr-1">
              {messages.map((event) => {
                const { accent, fill } = platformStyle(event.platform);
                return (
                  <div
                    key={event.id}
                    className="rounded-lg border-l-[3px] bg-white/[0.03] px-3 py-2 text-sm"
                    style={{ borderLeftColor: accent }}
                  >
                    <span
                      className="mr-2 rounded px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider"
                      style={{ color: accent, background: fill ?? 'transparent' }}
                      title={platformLabel(event.platform)}
                    >
                      {platformLabel(event.platform)}
                    </span>
                    <span className="font-semibold" style={{ color: accent }}>
                      {event.actor.isMod && <span className="mr-1 opacity-70">MOD</span>}
                      {event.actor.displayName}
                    </span>
                    {/* Texto plano: el mensaje viene de una plataforma. */}
                    <span className="ml-2 text-mw-text">{event.message}</span>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </Card.Body>
      </Card.Root>
    </div>
  );
}
