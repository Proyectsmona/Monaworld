import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import {
  accounts,
  counters,
  events,
  overlays,
  rules as rulesTable,
  settings,
  viewers,
} from '@monaworld/db';
import type {
  AccountRepository,
  AwardedTotals,
  EventRepository,
  OverlayRepository,
  PlatformAccount,
  RuleRepository,
  SaveEventOutcome,
  ViewerRepository,
} from '@monaworld/application';
import { DEFAULT_SETTINGS, ruleSchema, settingsSchema } from '@monaworld/contracts';
import type { AccountSummary, ConnectorStatus, EventRow, Settings } from '@monaworld/contracts';
import {
  CONNECTABLE_PLATFORMS,
  emptyLayout,
  type OverlayLayout,
  type Platform,
  type Rule,
  type StreamEvent,
} from '@monaworld/domain';

/**
 * Adaptadores de persistencia sobre D1.
 *
 * Implementan los puertos que define la capa de aplicación. Todo el SQL vive
 * aquí: ni el dominio ni los casos de uso saben que existe una base de datos.
 */

type Db = DrizzleD1Database<Record<string, never>>;

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// ------------------------------------------------------------------- eventos

export class D1EventRepository implements EventRepository {
  private readonly db: Db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async save(event: StreamEvent, awarded: AwardedTotals): Promise<SaveEventOutcome> {
    // La idempotencia la garantiza el índice único sobre `dedupe_key`. No se
    // comprueba antes con un SELECT: entre la lectura y el insert cabe
    // perfectamente el reintento de un webhook.
    const inserted = await this.db
      .insert(events)
      .values({
        platform: event.platform,
        eventType: event.type,
        username: event.actor.displayName,
        amount: event.value.rawAmount,
        monacoins: Math.round(awarded.monacoins),
        monopoints: Math.round(awarded.monopoints),
        timerSeconds: Math.round(awarded.timerSeconds),
        simulated: event.simulated,
        dedupeKey: event.dedupeKey,
        eventSource: event.source,
        actorId: event.actor.platformUserId,
        avatarUrl: event.actor.avatarUrl,
        rawUnit: event.value.rawUnit,
        giftName: event.value.giftName,
        message: event.message,
      })
      .onConflictDoNothing({ target: events.dedupeKey })
      .returning({ id: events.id });

    const row = inserted[0];
    return row ? { stored: true, rowId: row.id } : { stored: false };
  }

  /** Segunda fase: anota lo que otorgaron las reglas una vez aplicadas. */
  async recordAwards(rowId: number, awarded: AwardedTotals): Promise<void> {
    await this.db
      .update(events)
      .set({
        monacoins: Math.round(awarded.monacoins),
        monopoints: Math.round(awarded.monopoints),
        timerSeconds: Math.round(awarded.timerSeconds),
      })
      .where(eq(events.id, rowId));
  }

  async listRecent(limit: number): Promise<EventRow[]> {
    const rows = await this.db
      .select()
      .from(events)
      .orderBy(desc(events.id))
      .limit(Math.min(Math.max(limit, 1), 200));

    return rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      eventType: r.eventType,
      username: r.username,
      amount: r.amount,
      giftName: r.giftName,
      message: r.message,
      simulated: r.simulated,
      createdAt: r.createdAt,
    }));
  }

  async countSince(isoTimestamp: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(events)
      .where(gte(events.createdAt, isoTimestamp));
    return row?.total ?? 0;
  }
}

// -------------------------------------------------------------------- reglas

export class D1RuleRepository implements RuleRepository {
  private readonly db: Db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async listAll(): Promise<Rule[]> {
    const rows = await this.db.select().from(rulesTable).orderBy(rulesTable.sortOrder);
    // Una regla corrupta se ignora en vez de tumbar la ingesta entera: durante
    // un directo es preferible perder una alerta que perderlas todas.
    return rows.flatMap((row) => {
      const parsed = ruleSchema.safeParse({
        id: row.id,
        name: row.name,
        enabled: row.enabled,
        cooldownMs: row.cooldownMs,
        match: parseJson(row.matchJson) ?? {},
        actions: parseJson(row.actionsJson) ?? [],
      });
      return parsed.success ? [parsed.data] : [];
    });
  }

  async findById(id: string): Promise<Rule | null> {
    const all = await this.listAll();
    return all.find((r) => r.id === id) ?? null;
  }

  async create(rule: Rule): Promise<void> {
    await this.db.insert(rulesTable).values(this.toRow(rule));
  }

  async update(rule: Rule): Promise<void> {
    await this.db.update(rulesTable).set(this.toRow(rule)).where(eq(rulesTable.id, rule.id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(rulesTable).where(eq(rulesTable.id, id));
  }

  private toRow(rule: Rule) {
    return {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      cooldownMs: rule.cooldownMs,
      matchJson: JSON.stringify(rule.match),
      actionsJson: JSON.stringify(rule.actions),
    };
  }
}

// --------------------------------------------------------------- espectadores

export class D1ViewerRepository implements ViewerRepository {
  private readonly db: Db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async touch(
    platform: Platform,
    platformUserId: string,
    displayName: string,
    seenAt: string,
  ): Promise<void> {
    await this.db
      .insert(viewers)
      .values({ platform, platformUserId, displayName, firstSeen: seenAt, lastSeen: seenAt })
      .onConflictDoUpdate({
        target: [viewers.platform, viewers.platformUserId],
        set: { displayName, lastSeen: seenAt },
      });
  }
}

// ------------------------------------------------------------------- cuentas

/** Twitch y Kick entran por webhook; YouTube y TikTok pasan por el agente. */
const VIA: Readonly<Record<string, 'webhook' | 'agent'>> = {
  twitch: 'webhook',
  kick: 'webhook',
  youtube: 'agent',
  tiktok: 'agent',
  manual: 'webhook',
};

export class D1AccountRepository implements AccountRepository {
  private readonly db: Db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async find(platform: Platform): Promise<PlatformAccount | null> {
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.platform, platform as 'twitch'))
      .limit(1);
    if (!row) return null;

    return {
      platform: row.platform as Platform,
      channelName: row.channelName,
      platformUserId: row.platformUserId,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt: row.expiresAt,
      status: row.status,
      lastError: row.lastError,
    };
  }

  async listSummaries(): Promise<AccountSummary[]> {
    const rows = await this.db.select().from(accounts);
    const byPlatform = new Map(rows.map((r) => [r.platform, r]));

    return CONNECTABLE_PLATFORMS.map((platform) => {
      const row = byPlatform.get(platform as 'twitch');
      return {
        platform,
        channelName: row?.channelName ?? null,
        status: (row?.status ?? 'offline') as ConnectorStatus,
        lastError: row?.lastError ?? null,
        via: VIA[platform] ?? 'agent',
        connected: Boolean(row?.accessToken) || Boolean(row?.channelName),
      };
    });
  }

  async saveTokens(account: PlatformAccount): Promise<void> {
    const values = {
      platform: account.platform as 'twitch',
      channelName: account.channelName,
      platformUserId: account.platformUserId,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: account.expiresAt,
      status: account.status,
      lastError: account.lastError,
      updatedAt: new Date().toISOString(),
    };

    await this.db
      .insert(accounts)
      .values(values)
      .onConflictDoUpdate({ target: accounts.platform, set: values });
  }

  /**
   * Inserta o actualiza el estado del conector.
   *
   * Tiene que ser un upsert y no un UPDATE: YouTube y TikTok no pasan por
   * ningún flujo OAuth que cree su fila, así que su primer informe de estado
   * llega antes de que exista. Un UPDATE ahí no falla, simplemente no hace
   * nada, y el panel se queda mostrando «desconectado» para siempre.
   */
  async setStatus(platform: Platform, status: ConnectorStatus, detail?: string): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.db
      .insert(accounts)
      .values({
        platform: platform as 'twitch',
        channelName: platform,
        status,
        lastError: detail ?? null,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: accounts.platform,
        set: { status, lastError: detail ?? null, updatedAt },
      });
  }

  async disconnect(platform: Platform): Promise<void> {
    await this.db
      .update(accounts)
      .set({
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        status: 'offline',
        lastError: null,
      })
      .where(eq(accounts.platform, platform as 'twitch'));
  }
}

// ------------------------------------------------------------------ overlays

export class D1OverlayRepository implements OverlayRepository {
  private readonly db: Db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async findById(id: string): Promise<OverlayLayout | null> {
    const [row] = await this.db.select().from(overlays).where(eq(overlays.id, id)).limit(1);
    if (!row) return null;
    return this.toLayout(row);
  }

  async listAll(): Promise<OverlayLayout[]> {
    const rows = await this.db.select().from(overlays);
    return rows.map((r) => this.toLayout(r));
  }

  async save(layout: OverlayLayout): Promise<void> {
    const values = {
      id: layout.id,
      name: layout.name,
      layoutJson: JSON.stringify({ widgets: layout.widgets }),
      version: layout.version,
      updatedAt: new Date().toISOString(),
    };
    await this.db
      .insert(overlays)
      .values(values)
      .onConflictDoUpdate({ target: overlays.id, set: values });
  }

  private toLayout(row: { id: string; name: string; layoutJson: string; version: number }): OverlayLayout {
    const parsed = parseJson(row.layoutJson) as { widgets?: OverlayLayout['widgets'] } | null;
    return {
      ...emptyLayout(row.id, row.name),
      widgets: parsed?.widgets ?? [],
      version: row.version,
    };
  }
}

// ----------------------------------------------------------------- contadores

/** Lectura de contadores desde D1, para el arranque en frío del panel. */
export async function readPersistedCounters(database: D1Database) {
  const db = drizzle(database);
  const rows = await db.select().from(counters);
  return rows.map((r) => ({ key: r.key, value: r.value, label: r.label }));
}

/** Vuelca los contadores de la sala a D1 para que sobrevivan a un reinicio. */
export async function persistCounters(
  database: D1Database,
  totals: Readonly<Record<string, number>>,
): Promise<void> {
  const db = drizzle(database);
  const entries = Object.entries(totals);
  if (entries.length === 0) return;

  await db.batch(
    entries.map(([key, value]) =>
      db
        .insert(counters)
        .values({ key, value })
        .onConflictDoUpdate({ target: counters.key, set: { value } }),
    ) as unknown as [ReturnType<typeof db.insert>],
  );
}


/**
 * Ajustes del panel sobre la tabla clave/valor.
 *
 * No lleva puerto en `application` a propósito: tiene una sola implementación
 * y ningún caso de uso lo necesita: las rutas lo usan directamente, como hacen
 * con las cuentas. Un puerto aquí sería ceremonia sin sustitución detrás.
 */
export class D1SettingsRepository {
  private readonly db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  /**
   * Devuelve siempre un objeto completo.
   *
   * Las filas ausentes se rellenan con el valor por defecto en vez de dejar
   * huecos: quien lee ajustes no debería tener que saber si el usuario llegó a
   * guardarlos alguna vez.
   */
  async read(userId: number): Promise<Settings> {
    const rows = await this.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.userId, userId));

    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    // Un valor guardado que ya no valide —una zona horaria que se retiró, por
    // ejemplo— no debe romper el panel: se descarta y vuelve el de por defecto.
    const parsed = settingsSchema.safeParse(stored);
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  }

  async write(userId: number, value: Settings): Promise<void> {
    const entries = Object.entries(value);
    await this.db.batch(
      entries.map(([key, v]) =>
        this.db
          .insert(settings)
          .values({ userId, key, value: String(v) })
          .onConflictDoUpdate({
            target: [settings.userId, settings.key],
            set: { value: String(v) },
          }),
      ) as unknown as [ReturnType<typeof this.db.insert>],
    );
  }
}

export { and };
