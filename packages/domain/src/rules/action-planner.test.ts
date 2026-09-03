import { describe, expect, it } from 'vitest';
import { aggregateCounterDeltas, counterDelta, planActions } from './action-planner.js';
import { matchesRule } from './rule-matcher.js';
import { renderAlertTemplate } from '../alerts/alert-template.js';
import { fixedClock } from '../shared/clock.js';
import type { Rule } from './rule.js';
import type { StreamEvent } from '../events/stream-event.js';

const event = (over: Partial<StreamEvent> = {}): StreamEvent => ({
  id: 'e1',
  platform: 'tiktok',
  source: 'agent',
  type: 'gift',
  actor: { platformUserId: 'u1', displayName: 'dizzy', isMod: false, isSubscriber: false },
  value: { rawAmount: 5, rawUnit: 'gift', giftName: 'Rose' },
  occurredAt: '2026-08-27T12:00:00.000Z',
  dedupeKey: 'tiktok:1',
  simulated: false,
  ...over,
});

const rule = (over: Partial<Rule> = {}): Rule => ({
  id: 'r1',
  name: 'regla',
  enabled: true,
  cooldownMs: 0,
  match: {},
  actions: [{ kind: 'alert', widget: 'alert', template: '{user}', durationMs: 5000 }],
  ...over,
});

describe('planificador de acciones', () => {
  it('reparte las acciones en tres carriles según su destino', () => {
    const plan = planActions(
      [
        rule({
          actions: [
            { kind: 'alert', widget: 'alert', template: '{user}', durationMs: 4000 },
            { kind: 'counter', key: 'monacoins', delta: 0, perUnit: 10 },
            { kind: 'obs', op: 'setScene', target: 'Fiesta', durationMs: 0 },
          ],
        }),
      ],
      event(),
    );

    expect(plan.queued).toHaveLength(1);
    expect(plan.immediate).toHaveLength(1);
    expect(plan.agent).toHaveLength(1);
    expect(plan.firedRuleIds).toEqual(['r1']);
  });

  it('ignora las reglas desactivadas', () => {
    expect(planActions([rule({ enabled: false })], event()).firedRuleIds).toHaveLength(0);
  });

  it('respeta el cooldown y vuelve a disparar al vencer', () => {
    const clock = fixedClock(1000);
    const cooldowns = new Map<string, number>();
    const r = rule({ cooldownMs: 10_000 });

    expect(planActions([r], event(), { cooldowns, clock }).firedRuleIds).toEqual(['r1']);

    clock.advance(4000);
    expect(planActions([r], event(), { cooldowns, clock }).firedRuleIds).toHaveLength(0);

    clock.advance(7000);
    expect(planActions([r], event(), { cooldowns, clock }).firedRuleIds).toEqual(['r1']);
  });

  it('suma los deltas de varias reglas sobre el mismo contador', () => {
    const plan = planActions(
      [
        rule({ id: 'a', actions: [{ kind: 'counter', key: 'monacoins', delta: 100, perUnit: 0 }] }),
        rule({ id: 'b', actions: [{ kind: 'counter', key: 'monacoins', delta: 0, perUnit: 10 }] }),
      ],
      event(),
    );

    const totals = aggregateCounterDeltas(plan, event());
    expect(totals.get('monacoins')).toBe(150);
  });

  it('combina la parte fija y la proporcional al valor nativo', () => {
    const action = { kind: 'counter', key: 'x', delta: 5, perUnit: 10 } as const;
    expect(counterDelta(action, event())).toBe(55);
  });
});

describe('condiciones', () => {
  it('filtra por plataforma, tipo, mínimo y nombre de regalo', () => {
    expect(matchesRule(rule({ match: { platforms: ['twitch'] } }), event())).toBe(false);
    expect(matchesRule(rule({ match: { types: ['follow'] } }), event())).toBe(false);
    expect(matchesRule(rule({ match: { minAmount: 6 } }), event())).toBe(false);
    expect(matchesRule(rule({ match: { giftName: 'Galaxy' } }), event())).toBe(false);
    expect(matchesRule(rule({ match: { minAmount: 5, giftName: 'Rose' } }), event())).toBe(true);
  });
});

describe('plantillas', () => {
  it('sustituye los marcadores conocidos', () => {
    expect(renderAlertTemplate('{user} envió {amount}× {gift}', event())).toBe('dizzy envió 5× Rose');
  });

  it('deja intacto lo que no reconoce, para poder diagnosticarlo en pantalla', () => {
    expect(renderAlertTemplate('{desconocido}', event())).toBe('{desconocido}');
  });

  it('devuelve texto plano: no interpreta el nombre como marcado', () => {
    const hostile = event({
      actor: { ...event().actor, displayName: '<img src=x onerror=alert(1)>' },
    });
    expect(renderAlertTemplate('{user}', hostile)).toBe('<img src=x onerror=alert(1)>');
  });
});
