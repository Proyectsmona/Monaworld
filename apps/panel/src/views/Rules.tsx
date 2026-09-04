import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { ToggleSwitch } from 'primereact/toggleswitch';
import type { Rule } from '@monaworld/domain';
import { api } from '../api';
import { ConfirmDialog, Empty } from './bits';

/**
 * Reglas: condición → acciones. Las visibles (alerta, sonido) pasan por la cola
 * serial del Durable Object; las de estado se aplican al instante.
 */
const STARTER_RULES: Omit<Rule, 'id'>[] = [
  {
    name: 'Alerta de follow',
    enabled: true,
    cooldownMs: 2000,
    match: { types: ['follow'] },
    actions: [
      { kind: 'alert', widget: 'alert', template: '¡{user} te sigue!', durationMs: 5000 },
      { kind: 'counter', key: 'monopoints', delta: 10, perUnit: 0 },
    ],
  },
  {
    name: 'Alerta de suscripción',
    enabled: true,
    cooldownMs: 0,
    match: { types: ['subscribe', 'resub', 'gift_sub', 'member'] },
    actions: [
      { kind: 'alert', widget: 'alert', template: '{user} se suscribió ✦', durationMs: 7000 },
      { kind: 'counter', key: 'monacoins', delta: 100, perUnit: 0 },
      { kind: 'counter', key: 'timer', delta: 120, perUnit: 0 },
    ],
  },
  {
    name: 'Bits y donaciones',
    enabled: true,
    cooldownMs: 0,
    match: { types: ['cheer', 'donation', 'superchat'] },
    actions: [
      {
        kind: 'alert',
        widget: 'alert',
        template: '{user} envió {amount} · ¡gracias!',
        durationMs: 6000,
      },
      { kind: 'counter', key: 'monacoins', delta: 0, perUnit: 1 },
    ],
  },
  {
    name: 'Gift grande de TikTok',
    enabled: true,
    cooldownMs: 3000,
    match: { platforms: ['tiktok'], types: ['gift'], minAmount: 5 },
    actions: [
      {
        kind: 'alert',
        widget: 'alert',
        template: '{user} envió {amount}× {gift} ✧',
        durationMs: 6000,
      },
      { kind: 'counter', key: 'monacoins', delta: 0, perUnit: 10 },
    ],
  },
  {
    name: 'Raid',
    enabled: true,
    cooldownMs: 0,
    match: { types: ['raid'] },
    actions: [
      {
        kind: 'alert',
        widget: 'alert',
        template: '{user} llega con {amount} espectadores',
        durationMs: 8000,
      },
    ],
  },
];

export function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    void api
      .rules()
      .then((r) => setRules(r.rules))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(reload, [reload]);

  const seed = async () => {
    setBusy(true);
    try {
      for (const rule of STARTER_RULES) await api.createRule(rule);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (rule: Rule, enabled: boolean) => {
    setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
    const { id, ...rest } = rule;
    await api.updateRule(id, { ...rest, enabled });
  };

  // Se guarda la regla entera, no solo el id: el diálogo necesita su nombre
  // para que quien confirma sepa exactamente qué va a borrar.
  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);

  const remove = async (rule: Rule) => {
    setRules((rs) => rs.filter((r) => r.id !== rule.id));
    setPendingDelete(null);
    await api.deleteRule(rule.id);
  };

  return (
    <div className="flex flex-col gap-5">
      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Reglas activas</h2>
              <p className="mt-1 text-sm text-mw-muted">
                Un evento entra, se compara con estas reglas, y las que casan producen
                acciones.
              </p>
            </div>
            {loaded && rules.length === 0 && (
              <Button className="mw-submit" loading={busy} onClick={seed}>
                Crear reglas de ejemplo
              </Button>
            )}
          </div>

          {!loaded && <p className="mt-4 text-sm text-mw-dim">Cargando…</p>}

          {loaded && rules.length === 0 && (
            <div className="mt-4">
              <Empty>
                No hay reglas todavía. Crea las de ejemplo para tener alertas funcionando de
                inmediato.
              </Empty>
            </div>
          )}

          {rules.length > 0 && (
            <ul className="mt-4 flex flex-col divide-y divide-mw-line-soft">
              {rules.map((rule) => (
                <li key={rule.id} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <b className="font-display">{rule.name}</b>
                      {rule.cooldownMs > 0 && (
                        <span className="mw-label">cooldown {rule.cooldownMs / 1000}s</span>
                      )}
                    </div>

                    <div className="mt-1 text-sm text-mw-muted">
                      {describeMatch(rule)}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rule.actions.map((a, i) => (
                        <span
                          key={i}
                          className="rounded border border-mw-line bg-black/25 px-2 py-0.5 font-mono text-xs text-mw-muted"
                        >
                          {describeAction(a)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <ToggleSwitch.Root
                      checked={rule.enabled}
                      onCheckedChange={(e: { checked: boolean }) => toggle(rule, e.checked)}
                    >
                      <ToggleSwitch.Control>
                        <ToggleSwitch.Handle />
                      </ToggleSwitch.Control>
                    </ToggleSwitch.Root>
                    <Button
                      className="mw-btn mw-btn-danger mw-btn-icon"
                      size="small"
                      aria-label={`Eliminar ${rule.name}`}
                      onClick={() => setPendingDelete(rule)}
                    >
                      <span className="pi pi-trash" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card.Body>
      </Card.Root>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="¿Eliminar esta regla?"
        detail={`«${pendingDelete?.name ?? ''}» dejará de aplicarse. Los eventos seguirán entrando, pero no producirán sus acciones. No se puede deshacer.`}
        onConfirm={() => pendingDelete && void remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function describeMatch(rule: Rule): string {
  const m = rule.match;
  const parts: string[] = [];
  if (m.platforms?.length) parts.push(m.platforms.join(', '));
  if (m.types?.length) parts.push(m.types.join(' · '));
  if (m.minAmount !== undefined) parts.push(`≥ ${m.minAmount}`);
  if (m.giftName) parts.push(`regalo «${m.giftName}»`);
  return parts.length ? parts.join('  →  ') : 'cualquier evento';
}

function describeAction(a: Rule['actions'][number]): string {
  switch (a.kind) {
    case 'alert':
      return `alerta ${a.durationMs / 1000}s`;
    case 'sound':
      return 'sonido';
    case 'counter':
      return `${a.key} ${a.perUnit ? `×${a.perUnit}` : `+${a.delta}`}`;
    case 'obs':
      return `obs: ${a.op}`;
  }
}
