const PLATFORM_COLOR: Record<string, string> = {
  twitch: '#a970ff',
  youtube: '#ff4e45',
  kick: '#53fc18',
  tiktok: '#25f4ee',
  manual: '#a18fb4',
};

const PLATFORM_LABEL: Record<string, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  tiktok: 'TikTok',
  manual: 'Manual',
};

export function PlatformChip({ platform }: { platform: string }) {
  return (
    <span className="mw-chip" style={{ color: PLATFORM_COLOR[platform] ?? '#a18fb4' }}>
      <span className="mw-dot" />
      {PLATFORM_LABEL[platform] ?? platform}
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
