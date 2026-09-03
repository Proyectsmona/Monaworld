import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Esquema de la D1 `monaworld`.
 *
 * Las tablas `users`, `settings` y `events` ya existían en el prototipo y se
 * conservan: las columnas nuevas se añaden con ALTER TABLE, sin borrar datos.
 */

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['ADMIN', 'MODERATOR_ADMIN', 'USER'] })
    .notNull()
    .default('ADMIN'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (t) => [uniqueIndex('settings_user_key').on(t.userId, t.key)],
);

/** Sesiones del panel. Cookie HttpOnly, no JWT: se pueden revocar. */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('sessions_user').on(t.userId)],
);

/** Cuentas de plataforma conectadas y sus tokens OAuth. */
export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    platform: text('platform', {
      enum: ['twitch', 'kick', 'youtube', 'tiktok'],
    }).notNull(),
    channelName: text('channel_name').notNull(),
    platformUserId: text('platform_user_id'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    expiresAt: integer('expires_at'),
    /** Estado del conector para pintarlo en el panel. */
    status: text('status', { enum: ['online', 'offline', 'error'] })
      .notNull()
      .default('offline'),
    lastError: text('last_error'),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex('accounts_platform').on(t.platform)],
);

/**
 * Historial de eventos. Las columnas `monacoins`, `monopoints` y `timer_seconds`
 * vienen del prototipo y se conservan: registran lo que otorgaron las reglas,
 * que es justo lo que se quiere ver en el historial.
 */
export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id'),
    platform: text('platform').notNull(),
    eventType: text('event_type').notNull(),
    username: text('username'),
    amount: real('amount').default(0),
    monacoins: integer('monacoins').default(0),
    monopoints: integer('monopoints').default(0),
    timerSeconds: integer('timer_seconds').default(0),
    simulated: integer('simulated', { mode: 'boolean' }).default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),

    // añadidas en la migración 0001
    dedupeKey: text('dedupe_key'),
    eventSource: text('event_source'),
    actorId: text('actor_id'),
    avatarUrl: text('avatar_url'),
    rawUnit: text('raw_unit'),
    giftName: text('gift_name'),
    message: text('message'),
  },
  (t) => [
    index('events_created').on(t.createdAt),
    uniqueIndex('events_dedupe').on(t.dedupeKey),
  ],
);

/** Reglas: condiciones y acciones como JSON, validadas con Zod al leerlas. */
export const rules = sqliteTable('rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  matchJson: text('match_json').notNull().default('{}'),
  actionsJson: text('actions_json').notNull().default('[]'),
  cooldownMs: integer('cooldown_ms').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** Contadores: metas, monedas internas y temporizador. */
export const counters = sqliteTable('counters', {
  key: text('key').primaryKey(),
  value: real('value').notNull().default(0),
  label: text('label'),
});

export const viewers = sqliteTable(
  'viewers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    platform: text('platform').notNull(),
    platformUserId: text('platform_user_id').notNull(),
    displayName: text('display_name').notNull(),
    firstSeen: text('first_seen')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastSeen: text('last_seen')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex('viewers_identity').on(t.platform, t.platformUserId)],
);

/** Layouts de overlay. JSON descriptivo, nunca HTML. */
export const overlays = sqliteTable('overlays', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  layoutJson: text('layout_json').notNull().default('{"widgets":[]}'),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type UserRow = typeof users.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type RuleRow = typeof rules.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type CounterRow = typeof counters.$inferSelect;
export type OverlayRow = typeof overlays.$inferSelect;
