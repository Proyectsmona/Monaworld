import { useState } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { api, type Settings as SettingsValue } from '../api';

/**
 * Ajustes del panel.
 *
 * Solo entra aquí lo que cambia cómo se *muestran* las cosas. Nada de lo que
 * afecta a la seguridad —tokens del agente, secretos de plataforma— es editable
 * desde el navegador: vive en los secretos del Worker, que ni siquiera se
 * pueden volver a leer una vez puestos. Que el panel no pueda tocarlos es la
 * propiedad, no una carencia.
 */
export function Settings({
  settings,
  onSaved,
}: {
  settings: SettingsValue;
  onSaved: (next: SettingsValue) => void;
}) {
  const [draft, setDraft] = useState<SettingsValue>(settings);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await api.saveSettings(draft);
      onSaved(res.settings);
      setNote('Guardado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof SettingsValue, label: string, hint: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="mw-label">{label}</span>
      <InputText
        className="mw-field"
        value={draft[key]}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setDraft((d) => ({ ...d, [key]: e.target.value }))
        }
      />
      <span className="text-xs text-mw-dim">{hint}</span>
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <h2 className="font-display text-lg font-bold">Nombres y formato</h2>
          <p className="mt-1 text-sm text-mw-muted">
            Cambian cómo se muestran las cosas en el panel y en el overlay. No tocan ningún
            dato guardado.
          </p>

          <form className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={save}>
            {field('coinsLabel', 'Moneda principal', 'Cómo se llama tu MonaCoins.')}
            {field('pointsLabel', 'Puntos', 'Cómo se llaman tus MonaPoints.')}
            {field(
              'timezone',
              'Zona horaria',
              'Zona IANA, por ejemplo Europe/Madrid. Solo afecta a las fechas que se muestran.',
            )}

            <div className="sm:col-span-2">
              {error && (
                <Message.Root severity="error" className="mb-3">
                  <Message.Content>
                    <Message.Text>{error}</Message.Text>
                  </Message.Content>
                </Message.Root>
              )}
              <div className="flex items-center gap-3">
                <Button type="submit" className="mw-submit" loading={busy} disabled={!dirty}>
                  Guardar cambios
                </Button>
                {note && <span className="text-sm text-mw-muted">{note}</span>}
                {dirty && !note && (
                  <span className="text-sm text-mw-dim">Hay cambios sin guardar.</span>
                )}
              </div>
            </div>
          </form>
        </Card.Body>
      </Card.Root>

      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <h2 className="font-display text-lg font-bold">Token del agente local</h2>
          <p className="mt-2 max-w-prose text-sm text-mw-muted">
            El agente que lee YouTube y TikTok se autentica con <code>AGENT_TOKEN</code>, un
            secreto del Worker. No se muestra aquí porque una vez puesto no se puede volver a
            leer, ni siquiera desde el panel de Cloudflare: esa es justamente la garantía que
            lo hace un secreto.
          </p>
          <p className="mt-2 max-w-prose text-sm text-mw-muted">
            Para rotarlo, ejecuta <code>wrangler secret put AGENT_TOKEN</code> y copia el mismo
            valor en <code>apps/agent/.env</code>. Es distinto de tu sesión a propósito: puedes
            rotar uno sin cerrar el otro.
          </p>
        </Card.Body>
      </Card.Root>
    </div>
  );
}
