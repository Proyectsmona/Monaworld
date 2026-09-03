import type { StreamEvent } from '../events/stream-event.js';

/**
 * Sustitución de marcadores en el texto de una alerta.
 *
 * Devuelve SIEMPRE texto plano. El escapado es responsabilidad del renderer,
 * que pinta con nodos de texto y nunca con innerHTML: el nombre para mostrar
 * viene de una plataforma de terceros y acaba en pantalla durante el directo.
 */

const PLACEHOLDER = /\{(\w+)\}/g;

export function renderAlertTemplate(template: string, event: StreamEvent): string {
  const values: Readonly<Record<string, string>> = {
    user: event.actor.displayName,
    amount: formatAmount(event.value.rawAmount),
    gift: event.value.giftName ?? '',
    message: event.message ?? '',
    platform: event.platform,
    tier: event.value.tier ?? '',
    currency: event.value.currency ?? '',
  };

  // Un marcador desconocido se deja tal cual: es más fácil de diagnosticar
  // sobre el propio overlay que un hueco vacío.
  return template.replace(PLACEHOLDER, (whole, key: string) => values[key] ?? whole);
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/** Marcadores que reconoce el motor, para ofrecerlos en el editor de reglas. */
export const TEMPLATE_PLACEHOLDERS = [
  { token: '{user}', description: 'Nombre del espectador' },
  { token: '{amount}', description: 'Cantidad en unidades nativas' },
  { token: '{gift}', description: 'Nombre del regalo' },
  { token: '{message}', description: 'Mensaje adjunto' },
  { token: '{platform}', description: 'Plataforma de origen' },
  { token: '{tier}', description: 'Nivel de suscripción' },
  { token: '{currency}', description: 'Moneda de la donación' },
] as const;
