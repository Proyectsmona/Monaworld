import type { Rule } from '@monaworld/domain';
import type {
  AccountSummary,
  CounterSummary,
  EventRow,
  SessionUser,
  Settings,
} from '@monaworld/contracts';

// Los DTO se importan de `contracts` en vez de redeclararse: duplicarlos aquí
// es justo cómo el cliente y el servidor se desincronizan sin que nadie lo note.
export type { AccountSummary, CounterSummary, EventRow, SessionUser, Settings };
/** Alias histórico, para no tocar todas las vistas de golpe. */
export type AccountStatus = AccountSummary;
export type CounterRow = CounterSummary;

export interface ApiError {
  error: string;
  detail?: unknown;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error((data as ApiError).error ?? res.statusText), data);
  return data as T;
}

export const api = {
  status: () => call<{ needsBootstrap: boolean }>('/api/auth/status'),
  me: () => call<{ user: SessionUser }>('/api/auth/me'),
  bootstrap: (username: string, password: string) =>
    call<{ ok: true }>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    call<{ ok: true; user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => call<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  events: (limit = 50) => call<{ events: EventRow[] }>(`/api/events?limit=${limit}`),
  counters: () => call<{ counters: CounterRow[] }>('/api/counters'),
  accounts: () => call<{ accounts: AccountStatus[] }>('/api/accounts'),

  settings: () => call<{ settings: Settings }>('/api/settings'),
  saveSettings: (settings: Settings) =>
    call<{ ok: true; settings: Settings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  rules: () => call<{ rules: Rule[] }>('/api/rules'),
  createRule: (rule: Omit<Rule, 'id'>) =>
    call<{ ok: true; id: string }>('/api/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
  updateRule: (id: string, rule: Omit<Rule, 'id'>) =>
    call<{ ok: true }>(`/api/rules/${id}`, { method: 'PUT', body: JSON.stringify(rule) }),
  deleteRule: (id: string) => call<{ ok: true }>(`/api/rules/${id}`, { method: 'DELETE' }),

  /** Arranca el flujo OAuth: el navegador sale hacia la plataforma. */
  connectUrl: (platform: string) => `/api/connect/${platform}/start`,
  disconnect: (platform: string) =>
    call<{ ok: true }>(`/api/connect/${platform}/disconnect`, { method: 'POST' }),

  simulate: (input: {
    platform: string;
    type: string;
    displayName?: string;
    amount?: number;
    giftName?: string;
    message?: string;
  }) => call<{ accepted: boolean; reason?: string }>('/api/simulate', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
};
