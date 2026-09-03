import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { api, type SessionUser } from './api';
import { useRealtime } from './useRealtime';
import { Auth } from './views/Auth';
import { Dashboard } from './views/Dashboard';
import { Events } from './views/Events';
import { Rules } from './views/Rules';
import { Platforms } from './views/Platforms';
import { Sources } from './views/Sources';
import { Soon } from './views/Soon';

export type ViewId =
  | 'dashboard'
  | 'overlay'
  | 'alerts'
  | 'events'
  | 'commands'
  | 'music'
  | 'chat'
  | 'economy'
  | 'platforms'
  | 'obs'
  | 'store'
  | 'settings';

interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
  group: 'Estudio' | 'Creador' | 'Sistema';
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'pi-th-large', group: 'Estudio' },
  { id: 'overlay', label: 'Overlay Studio', icon: 'pi-clone', group: 'Estudio' },
  { id: 'alerts', label: 'Alertas y reglas', icon: 'pi-bolt', group: 'Estudio' },
  { id: 'events', label: 'Eventos', icon: 'pi-history', group: 'Estudio' },
  { id: 'commands', label: 'Comandos', icon: 'pi-hashtag', group: 'Estudio' },
  { id: 'music', label: 'Música y sonidos', icon: 'pi-volume-up', group: 'Estudio' },
  { id: 'chat', label: 'Multi Chat', icon: 'pi-comments', group: 'Creador' },
  { id: 'economy', label: 'Economía', icon: 'pi-dollar', group: 'Creador' },
  { id: 'platforms', label: 'Plataformas', icon: 'pi-sitemap', group: 'Creador' },
  { id: 'obs', label: 'Fuentes OBS', icon: 'pi-desktop', group: 'Creador' },
  { id: 'store', label: 'Store', icon: 'pi-shopping-bag', group: 'Sistema' },
  { id: 'settings', label: 'Configuración', icon: 'pi-cog', group: 'Sistema' },
];

const GROUPS = ['Estudio', 'Creador', 'Sistema'] as const;

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewId>('dashboard');

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const realtime = useRealtime(Boolean(user));

  if (!ready) {
    return (
      <div className="grid h-full place-items-center text-mw-dim">
        <span className="pi pi-spin pi-spinner text-2xl" aria-label="Cargando" />
      </div>
    );
  }

  if (!user) return <Auth onAuthenticated={refresh} />;

  const current = NAV.find((n) => n.id === view)!;

  return (
    <div className="flex h-full">
      <aside className="mw-rail hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto p-4 md:flex">
        <div className="px-2 pt-2">
          <div className="font-display text-2xl font-bold tracking-tight">
            Mona<span className="mw-glow text-mw-pink">World</span>
          </div>
          <div className="mw-label mt-1">Centro de control</div>
        </div>

        {GROUPS.map((group) => (
          <nav key={group} className="flex flex-col gap-1">
            <div className="mw-label px-2 pb-1">{group}</div>
            {NAV.filter((n) => n.group === group).map((item) => (
              <button
                key={item.id}
                type="button"
                className="mw-navitem"
                data-active={view === item.id}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => setView(item.id)}
              >
                <span className={`pi ${item.icon} text-mw-pink/80`} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </nav>
        ))}

        <div className="mt-auto rounded-xl border border-mw-line p-3">
          <div className="truncate text-sm font-semibold">{user.username}</div>
          <div className="mw-label">{user.role}</div>
          <div
            className="mw-chip mt-2"
            style={{ color: realtime.connected ? 'var(--color-mw-ok)' : 'var(--color-mw-dim)' }}
          >
            <span className="mw-dot" />
            {realtime.connected ? 'En vivo' : 'Sin conexión'}
          </div>
          <Button
            severity="secondary"
            variant="text"
            size="small"
            className="mt-2 w-full"
            onClick={async () => {
              await api.logout();
              setUser(null);
            }}
          >
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 border-b border-mw-line bg-mw-ground/80 px-6 py-4 backdrop-blur">
          <div className="mw-label">MonaWorld / {current.group}</div>
          <h1 className="font-display text-2xl font-bold">{current.label}</h1>
        </header>

        <div className="p-6">
          {view === 'dashboard' && <Dashboard realtime={realtime} onGoTo={setView} />}
          {view === 'events' && <Events realtime={realtime} />}
          {view === 'alerts' && <Rules />}
          {view === 'platforms' && <Platforms />}
          {view === 'obs' && <Sources />}
          {view === 'overlay' && (
            <Soon
              title="Overlay Studio"
              phase="Fase 6"
              detail="Editor visual de widgets sobre el lienzo 1920×1080. El renderer y el protocolo ya funcionan: falta la interfaz de edición."
            />
          )}
          {view === 'commands' && (
            <Soon
              title="Comandos"
              phase="Fase 6"
              detail="Comandos de chat con respuestas y acciones. Se apoyará en el mismo motor de reglas que las alertas."
            />
          )}
          {view === 'music' && (
            <Soon
              title="Música y sonidos"
              phase="Fase 6"
              detail="Biblioteca de sonidos vinculables a reglas y cola de media requests."
            />
          )}
          {view === 'chat' && (
            <Soon
              title="Multi Chat"
              phase="Fase 6"
              detail="Chat unificado de las cuatro plataformas. Solo lectura: MonaWorld nunca publica ni modera."
            />
          )}
          {view === 'economy' && (
            <Soon
              title="Economía"
              phase="Fase 6"
              detail="MonaCoins, MonaPoints y MonaTimer con metas. Los contadores ya viven en la sala; falta la interfaz."
            />
          )}
          {view === 'store' && (
            <Soon
              title="Store"
              phase="Sin fecha"
              detail="Fuera del alcance de la v1: es una herramienta personal, no un SaaS con planes ni pagos."
            />
          )}
          {view === 'settings' && (
            <Soon
              title="Configuración"
              phase="Fase 6"
              detail="Nombres de moneda, zona horaria y token del agente local."
            />
          )}
        </div>
      </main>
    </div>
  );
}
