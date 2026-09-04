import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { api } from '../api';

/**
 * Portada y acceso. La primera vez no hay cuenta: se crea aquí en vez de dejar
 * credenciales escritas en el repositorio, como hacía el prototipo.
 */
export function Auth({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .status()
      .then((s) => setNeedsBootstrap(s.needsBootstrap))
      .catch(() => setNeedsBootstrap(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (needsBootstrap) await api.bootstrap(username, password);
      else await api.login(username, password);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  const FEATURES = [
    'Twitch', 'YouTube', 'Kick', 'TikTok LIVE',
    'Alertas editables', 'Motor de reglas', 'Cola serial',
    'MonaCoins', 'MonaTimer', 'Multi Chat', 'Fuentes OBS', 'Simulador',
  ];

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="self-center">
          <div className="font-display text-6xl font-bold tracking-tight">
            Mona<span className="mw-glow text-mw-pink">World</span>
          </div>
          <p className="mt-4 max-w-prose text-lg text-mw-muted">
            Centro de control para directos multiplataforma. Cada plataforma entra por el
            método que permite; a partir de ahí, todos son el mismo evento.
          </p>
          <ul className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f}
                className="rounded-lg border border-mw-line bg-white/[0.03] px-3 py-2 text-sm text-mw-muted"
              >
                <span className="text-mw-pink">✦</span> {f}
              </li>
            ))}
          </ul>
        </section>

        <section className="mw-panel self-center p-7">
          <h2 className="font-display text-xl font-bold">
            {needsBootstrap ? 'Crea tu cuenta' : 'Iniciar sesión'}
          </h2>
          <p className="mt-1 text-sm text-mw-muted">
            {needsBootstrap
              ? 'No hay ninguna cuenta todavía. Esta será la única.'
              : 'Acceso al centro de control.'}
          </p>

          <form className="mt-5 flex flex-col gap-4" onSubmit={submit}>
            <label className="flex flex-col gap-1.5">
              <span className="mw-label">Usuario</span>
              <InputText
                className="mw-field"
                value={username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="mw-label">Contraseña</span>
              <InputText
                className="mw-field"
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
                required
              />
              {needsBootstrap && (
                <span className="text-xs text-mw-dim">Mínimo 10 caracteres.</span>
              )}
            </label>

            {error && (
              <Message.Root severity="error">
                <Message.Content>
                  <Message.Text>{error}</Message.Text>
                </Message.Content>
              </Message.Root>
            )}

            <Button type="submit" loading={busy} className="mw-submit w-full">
              {needsBootstrap ? 'Crear cuenta y entrar' : 'Entrar'}
            </Button>
          </form>

          <p className="mt-4 text-xs text-mw-dim">
            La contraseña se guarda como hash PBKDF2 en D1 y la sesión es una cookie
            HttpOnly revocable.
          </p>
        </section>
      </div>
    </div>
  );
}
