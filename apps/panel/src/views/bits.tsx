/**
 * Identidad visual por plataforma: el color codifica de dónde entra el evento,
 * no decora.
 *
 * TikTok es la excepción y merece explicación. Su marca es negra, pero el panel
 * ya es casi negro: un trazo negro sobre fondo negro no distingue nada, que es
 * exactamente lo contrario de para lo que está el color aquí. Se resuelve como
 * lo hace la propia TikTok sobre fondos oscuros —relleno negro sólido y trazo
 * claro— así conserva su identidad y sigue leyéndose de un vistazo.
 */
export interface PlatformStyle {
  readonly accent: string;
  readonly fill?: string;
}

export const PLATFORM_STYLE: Record<string, PlatformStyle> = {
  twitch: { accent: '#a970ff' },
  youtube: { accent: '#ff3b30' },
  kick: { accent: '#53fc18' },
  tiktok: { accent: '#f0f0f0', fill: '#000000' },
  manual: { accent: '#a18fb4' },
};

export const platformStyle = (platform: string): PlatformStyle =>
  PLATFORM_STYLE[platform] ?? PLATFORM_STYLE.manual!;

const PLATFORM_LABEL: Record<string, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  tiktok: 'TikTok',
  manual: 'Manual',
};

export const platformLabel = (platform: string): string => PLATFORM_LABEL[platform] ?? platform;

export function PlatformChip({ platform }: { platform: string }) {
  const { accent, fill } = platformStyle(platform);
  return (
    <span className="mw-chip" style={{ color: accent, background: fill }}>
      <span className="mw-dot" />
      {platformLabel(platform)}
    </span>
  );
}

const STATUS = {
  online: { color: 'var(--color-mw-ok)', label: 'En línea' },
  offline: { color: 'var(--color-mw-dim)', label: 'Desconectado' },
  error: { color: 'var(--color-mw-risk)', label: 'Error' },
} as const;

export function StatusChip({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status] ?? STATUS.offline;
  return (
    <span className="mw-chip" style={{ color: s.color }}>
      <span className="mw-dot" />
      {s.label}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-mw-line px-4 py-10 text-center text-sm text-mw-dim">
      {children}
    </div>
  );
}
