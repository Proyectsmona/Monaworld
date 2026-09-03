import { systemClock, uuidGenerator } from '@monaworld/domain';
import type { IngestDependencies, RuleDependencies } from '@monaworld/application';
import type { SessionUser } from '@monaworld/contracts';
import {
  D1AccountRepository,
  D1EventRepository,
  D1OverlayRepository,
  D1RuleRepository,
  D1ViewerRepository,
} from '../persistence/d1-repositories.js';
import { DurableRealtimeRoom } from '../realtime/durable-room.js';
import type { WorkerEnv } from '../env.js';

/**
 * Raíz de composición.
 *
 * Es el ÚNICO sitio del Worker donde se decide qué implementación concreta
 * cumple cada puerto. Los casos de uso reciben interfaces; si mañana los
 * eventos se guardan en otro sitio, se cambia aquí y en ningún otro lugar.
 *
 * Se construye por petición porque en Workers los enlaces (`env`) llegan con
 * cada petición, no al arrancar el proceso.
 */
export interface Container {
  readonly events: D1EventRepository;
  readonly rules: D1RuleRepository;
  readonly viewers: D1ViewerRepository;
  readonly accounts: D1AccountRepository;
  readonly overlays: D1OverlayRepository;
  readonly room: DurableRealtimeRoom;
  readonly ingest: IngestDependencies;
  readonly ruleDeps: RuleDependencies;
}

export function buildContainer(env: WorkerEnv): Container {
  const events = new D1EventRepository(env.DB);
  const rules = new D1RuleRepository(env.DB);
  const viewers = new D1ViewerRepository(env.DB);
  const accounts = new D1AccountRepository(env.DB);
  const overlays = new D1OverlayRepository(env.DB);
  const room = new DurableRealtimeRoom(env);

  return {
    events,
    rules,
    viewers,
    accounts,
    overlays,
    room,
    ingest: {
      events,
      rules,
      viewers,
      room,
      clock: systemClock,
      ids: uuidGenerator,
    },
    ruleDeps: { rules, ids: uuidGenerator },
  };
}

/** Variables que las rutas comparten a través del contexto de Hono. */
export type AppVariables = {
  container: Container;
  user: SessionUser;
};
