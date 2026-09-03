import type { StreamEvent } from '../events/stream-event.js';
import type { Rule } from './rule.js';

/**
 * Decide si un evento satisface la condición de una regla. Función pura: la
 * misma entrada da siempre la misma respuesta, lo que la hace trivial de probar
 * y de razonar cuando una alerta no salta y hay que averiguar por qué.
 */
export function matchesRule(rule: Rule, event: StreamEvent): boolean {
  const { match } = rule;

  if (match.platforms?.length && !match.platforms.includes(event.platform)) return false;
  if (match.types?.length && !match.types.includes(event.type)) return false;
  if (match.minAmount !== undefined && event.value.rawAmount < match.minAmount) return false;
  if (match.giftName !== undefined && event.value.giftName !== match.giftName) return false;
  if (match.actorIsMod !== undefined && event.actor.isMod !== match.actorIsMod) return false;
  if (
    match.actorIsSubscriber !== undefined &&
    event.actor.isSubscriber !== match.actorIsSubscriber
  ) {
    return false;
  }

  if (match.messageContains) {
    const haystack = (event.message ?? '').toLowerCase();
    if (!haystack.includes(match.messageContains.toLowerCase())) return false;
  }

  return true;
}

/** Explica por qué una regla no casó. Se usa en el panel para depurar reglas. */
export function explainMismatch(rule: Rule, event: StreamEvent): string | null {
  const { match } = rule;
  if (match.platforms?.length && !match.platforms.includes(event.platform)) {
    return `la plataforma ${event.platform} no está en la condición`;
  }
  if (match.types?.length && !match.types.includes(event.type)) {
    return `el tipo ${event.type} no está en la condición`;
  }
  if (match.minAmount !== undefined && event.value.rawAmount < match.minAmount) {
    return `${event.value.rawAmount} es menor que el mínimo ${match.minAmount}`;
  }
  if (match.giftName !== undefined && event.value.giftName !== match.giftName) {
    return `el regalo no es «${match.giftName}»`;
  }
  return matchesRule(rule, event) ? null : 'no cumple alguna condición del actor o del mensaje';
}
