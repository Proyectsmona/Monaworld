import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import {
  DEFAULT_BOX,
  WIDGET_KINDS,
  clampBox,
  type OverlayWidget,
  type WidgetKind,
} from '@monaworld/domain';
import { api } from '../api';
import { ConfirmDialog, Empty } from './bits';

/**
 * Overlay Studio: editor visual del lienzo que se pinta en OBS.
 *
 * El lienzo trabaja en porcentaje, no en píxeles. Un layout hecho aquí sirve
 * igual a 1080p que a 1440p, y el editor puede ocupar el ancho que le quede sin
 * que eso cambie el resultado. Por eso todo el arrastre se convierte a
 * porcentaje contra el rectángulo real del lienzo en el momento de moverlo.
 *
 * El recorte usa el `clampBox` del dominio, el mismo que aplica el Worker al
 * guardar. Si el editor y el servidor recortaran distinto, un widget podría
 * verse en un sitio en el panel y en otro en OBS.
 */

const KIND_LABEL: Record<WidgetKind, string> = {
  alert: 'Alerta',
  chat: 'Chat',
  goal: 'Meta',
  timer: 'Temporizador',
  label: 'Texto',
  image: 'Imagen',
};

const KIND_HINT: Record<WidgetKind, string> = {
  alert: 'Donde salen las alertas de la cola.',
  chat: 'Mensajes de las cuatro plataformas.',
  goal: 'Barra de progreso de un contador.',
  timer: 'Cuenta del MonaTimer.',
  label: 'Texto fijo.',
  image: 'Imagen por URL.',
};

type Drag =
  | { mode: 'move'; id: string; grabX: number; grabY: number }
  | { mode: 'resize'; id: string };

export function OverlayStudio() {
  const [name, setName] = useState('Principal');
  const [widgets, setWidgets] = useState<OverlayWidget[]>([]);
  const [saved, setSaved] = useState('[]');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OverlayWidget | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    api
      .overlays()
      .then((r) => {
        const layout = r.overlays[0];
        if (!layout) return;
        setName(layout.name);
        setWidgets([...layout.widgets]);
        setSaved(JSON.stringify(layout.widgets));
      })
      .catch(() => setError('No se pudieron cargar los layouts'))
      .finally(() => setLoaded(true));
  }, []);

  const dirty = JSON.stringify(widgets) !== saved;
  const selected = widgets.find((w) => w.id === selectedId) ?? null;

  const patch = useCallback((id: string, next: Partial<OverlayWidget>) => {
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...next } : w)));
  }, []);

  // --------------------------------------------------------------- arrastre

  /** Posición del puntero en porcentaje del lienzo. */
  const toPercent = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const widget = widgets.find((w) => w.id === drag.id);
    if (!widget) return;

    const { x, y } = toPercent(e.clientX, e.clientY);

    const box =
      drag.mode === 'move'
        ? { ...widget.box, xPercent: x - drag.grabX, yPercent: y - drag.grabY }
        : {
            ...widget.box,
            widthPercent: x - widget.box.xPercent,
            heightPercent: y - widget.box.yPercent,
          };

    patch(drag.id, { box: clampBox(box) });
  };

  const startMove = (e: React.PointerEvent, widget: OverlayWidget) => {
    e.preventDefault();
    const { x, y } = toPercent(e.clientX, e.clientY);
    // Se guarda dónde se agarró dentro del widget para que no salte bajo el
    // cursor al empezar a mover: sin esto, el widget se recoloca de golpe.
    dragRef.current = {
      mode: 'move',
      id: widget.id,
      grabX: x - widget.box.xPercent,
      grabY: y - widget.box.yPercent,
    };
    setSelectedId(widget.id);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const startResize = (e: React.PointerEvent, widget: OverlayWidget) => {
    e.preventDefault();
    // Sin esto, el arrastre de la esquina también movería el widget entero.
    e.stopPropagation();
    dragRef.current = { mode: 'resize', id: widget.id };
    setSelectedId(widget.id);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // ---------------------------------------------------------------- acciones

  const add = (kind: WidgetKind) => {
    const widget: OverlayWidget = {
      id: crypto.randomUUID(),
      kind,
      box: { ...DEFAULT_BOX },
      visible: true,
      ...(kind === 'label' ? { text: 'Texto' } : {}),
      ...(kind === 'goal' ? { binding: 'monacoins' } : {}),
    };
    setWidgets((ws) => [...ws, widget]);
    setSelectedId(widget.id);
  };

  const remove = (widget: OverlayWidget) => {
    setWidgets((ws) => ws.filter((w) => w.id !== widget.id));
    if (selectedId === widget.id) setSelectedId(null);
    setPendingDelete(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await api.saveOverlay('default', { name, widgets });
      setSaved(JSON.stringify(widgets));
      setNote('Guardado. Las fuentes abiertas en OBS ya muestran la versión ' + res.version + '.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="mw-label">Nombre del layout</span>
              <InputText
                className="mw-field max-w-xs"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              />
            </label>

            <div className="flex items-center gap-3">
              {dirty && <span className="text-sm text-mw-dim">Cambios sin guardar.</span>}
              {note && !dirty && <span className="text-sm text-mw-muted">{note}</span>}
              <Button className="mw-submit" loading={busy} disabled={!dirty} onClick={() => void save()}>
                Guardar y publicar
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mw-label">Añadir</span>
            {WIDGET_KINDS.map((kind) => (
              <button key={kind} type="button" className="mw-btn" onClick={() => add(kind)}>
                {KIND_LABEL[kind]}
              </button>
            ))}
          </div>

          {error && (
            <Message.Root severity="error" className="mt-3">
              <Message.Content>
                <Message.Text>{error}</Message.Text>
              </Message.Content>
            </Message.Root>
          )}
        </Card.Body>
      </Card.Root>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card.Root className="mw-panel">
          <Card.Body className="p-5">
            <h2 className="font-display text-lg font-bold">Lienzo</h2>
            <p className="mt-1 text-sm text-mw-muted">
              Arrastra para mover, tira de la esquina para redimensionar. Las medidas son
              porcentajes, así que el layout escala a cualquier resolución.
            </p>

            <div
              ref={canvasRef}
              className="mw-canvas mt-4"
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) setSelectedId(null);
              }}
            >
              {loaded && widgets.length === 0 && (
                <div className="grid h-full place-items-center text-sm text-mw-dim">
                  Lienzo vacío. Añade un widget arriba.
                </div>
              )}

              {widgets.map((w) => (
                <div
                  key={w.id}
                  className="mw-canvas-widget"
                  data-selected={w.id === selectedId}
                  data-hidden={!w.visible}
                  style={{
                    left: w.box.xPercent + '%',
                    top: w.box.yPercent + '%',
                    width: w.box.widthPercent + '%',
                    height: w.box.heightPercent + '%',
                  }}
                  onPointerDown={(e) => startMove(e, w)}
                >
                  <span className="mw-canvas-tag">{KIND_LABEL[w.kind]}</span>
                  {w.kind === 'label' && <span className="truncate px-2 text-sm">{w.text}</span>}
                  <span className="mw-canvas-grip" onPointerDown={(e) => startResize(e, w)} />
                </div>
              ))}
            </div>
          </Card.Body>
        </Card.Root>

        <Card.Root className="mw-panel">
          <Card.Body className="p-5">
            <h2 className="font-display text-lg font-bold">Propiedades</h2>

            {!selected ? (
              <div className="mt-4">
                <Empty>Selecciona un widget del lienzo.</Empty>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <div className="mw-label">{KIND_LABEL[selected.kind]}</div>
                  <p className="mt-1 text-xs text-mw-dim">{KIND_HINT[selected.kind]}</p>
                </div>

                {selected.kind === 'goal' && (
                  <label className="flex flex-col gap-1.5">
                    <span className="mw-label">Contador</span>
                    <InputText
                      className="mw-field"
                      value={selected.binding ?? ''}
                      placeholder="monacoins"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        patch(selected.id, { binding: e.target.value })
                      }
                    />
                  </label>
                )}

                {(selected.kind === 'label' || selected.kind === 'goal') && (
                  <label className="flex flex-col gap-1.5">
                    <span className="mw-label">Texto</span>
                    <InputText
                      className="mw-field"
                      value={selected.text ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        patch(selected.id, { text: e.target.value })
                      }
                    />
                  </label>
                )}

                {selected.kind === 'image' && (
                  <label className="flex flex-col gap-1.5">
                    <span className="mw-label">URL de la imagen</span>
                    <InputText
                      className="mw-field"
                      value={selected.imageUrl ?? ''}
                      placeholder="https://…"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        patch(selected.id, { imageUrl: e.target.value })
                      }
                    />
                  </label>
                )}

                <label className="flex flex-col gap-1.5">
                  <span className="mw-label">Color de acento</span>
                  <InputText
                    className="mw-field"
                    value={selected.style?.accentColor ?? ''}
                    placeholder="#ff35b8"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      patch(selected.id, {
                        style: { ...selected.style, accentColor: e.target.value },
                      })
                    }
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="mw-label">Tamaño de letra (px)</span>
                  <InputText
                    className="mw-field"
                    value={selected.style?.fontSizePx ? String(selected.style.fontSizePx) : ''}
                    placeholder="32"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const n = Number.parseInt(e.target.value, 10);
                      patch(selected.id, {
                        style: {
                          ...selected.style,
                          fontSizePx: Number.isFinite(n) ? n : undefined,
                        },
                      });
                    }}
                  />
                </label>

                <div className="flex flex-col gap-1.5">
                  <span className="mw-label">Alineación</span>
                  <div className="flex gap-2">
                    {(['start', 'center', 'end'] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        className="mw-btn flex-1"
                        data-active={selected.style?.align === align}
                        onClick={() => patch(selected.id, { style: { ...selected.style, align } })}
                      >
                        {align === 'start' ? 'Izq' : align === 'center' ? 'Centro' : 'Der'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-mw-line pt-4">
                  <button
                    type="button"
                    className="mw-btn"
                    onClick={() => patch(selected.id, { visible: !selected.visible })}
                  >
                    {selected.visible ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button
                    type="button"
                    className="mw-btn mw-btn-danger"
                    onClick={() => setPendingDelete(selected)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </Card.Body>
        </Card.Root>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="¿Eliminar este widget?"
        detail={
          'Se quitará del lienzo. El cambio no llega a OBS hasta que pulses Guardar y publicar.'
        }
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
