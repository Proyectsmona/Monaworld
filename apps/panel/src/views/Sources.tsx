import { useState } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';

/**
 * URLs de las fuentes del navegador para OBS.
 *
 * El prototipo copiaba `/overlay.html`, pero los ficheros servidos se llamaban
 * `overlay` sin extensión, así que todo lo que ofrecía esta pantalla daba 404.
 * Además la URL lleva token: acaba visible al configurar OBS y en cualquier
 * clip de «mi setup».
 */
const WIDGETS = [
  {
    id: 'layout',
    name: 'Lienzo completo',
    size: '1920 × 1080',
    note: 'Todo lo que compongas en Overlay Studio, en una sola fuente.',
  },
  { id: 'alert', name: 'Alertas', size: '800 × 400', note: 'Follows, subs, gifts y raids.' },
  { id: 'chat', name: 'Multi Chat', size: '420 × 720', note: 'Las cuatro plataformas juntas.' },
  { id: 'goal', name: 'Metas', size: '600 × 140', note: 'Barras de progreso de contadores.' },
  { id: 'timer', name: 'MonaTimer', size: '400 × 160', note: 'Cuenta atrás del subatón.' },
];

export function Sources() {
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const urlFor = (widget: string) => {
    const base = `${location.origin}/overlay/?widget=${widget}`;
    return token ? `${base}&t=${encodeURIComponent(token)}` : base;
  };

  const copy = async (widget: string) => {
    try {
      await navigator.clipboard.writeText(urlFor(widget));
      setCopied(widget);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <h2 className="font-display text-lg font-bold">Token de overlay</h2>
          <p className="mt-1 max-w-prose text-sm text-mw-muted">
            Pégalo aquí para generar las URLs completas. Es el mismo valor que configuraste
            con <code className="font-mono text-mw-violet">wrangler secret put OVERLAY_TOKEN</code>.
            No se guarda en el navegador.
          </p>
          <div className="mt-3 max-w-md">
            <InputText
              className="w-full"
              type="password"
              value={token}
              placeholder="token de overlay"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
            />
          </div>
        </Card.Body>
      </Card.Root>

      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <h2 className="font-display text-lg font-bold">Fuentes del navegador</h2>
          <p className="mt-1 text-sm text-mw-muted">
            En OBS: Fuentes → + → Navegador. Marca «Apagar la fuente cuando no esté visible»
            desactivado para que la conexión se mantenga.
          </p>

          <ul className="mt-4 flex flex-col divide-y divide-mw-line-soft">
            {WIDGETS.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-3.5">
                <div className="min-w-52 flex-1">
                  <div className="font-display font-semibold">{w.name}</div>
                  <div className="text-sm text-mw-muted">{w.note}</div>
                </div>
                <span className="mw-label">{w.size}</span>
                <code className="min-w-0 flex-1 truncate rounded border border-mw-line bg-black/30 px-2 py-1.5 font-mono text-xs text-mw-muted">
                  {urlFor(w.id)}
                </code>
                <Button severity="secondary" size="small" onClick={() => copy(w.id)}>
                  {copied === w.id ? 'Copiado' : 'Copiar'}
                </Button>
              </li>
            ))}
          </ul>
        </Card.Body>
      </Card.Root>
    </div>
  );
}
