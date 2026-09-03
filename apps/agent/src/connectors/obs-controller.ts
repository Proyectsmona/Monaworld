import type { ObsAction } from '@monaworld/domain';

/**
 * Control de OBS por `obs-websocket`.
 *
 * Es la capacidad que solo existe estando en la misma máquina, y lo que separa
 * «mostrar alertas» de ser un centro de control: un raid grande puede cambiar
 * de escena y un gift concreto encender una fuente durante unos segundos.
 */

export interface ObsControllerOptions {
  readonly url: string;
  readonly password?: string;
  readonly onLog?: (message: string) => void;
}

export class ObsController {
  private client: any;
  private connected = false;

  constructor(private readonly options: ObsControllerOptions) {}

  private log(message: string): void {
    this.options.onLog?.(`[obs] ${message}`);
  }

  async connect(): Promise<void> {
    try {
      const { default: OBSWebSocket } = await import('obs-websocket-js');
      this.client = new OBSWebSocket();
      await this.client.connect(this.options.url, this.options.password || undefined);
      this.connected = true;
      this.log('conectado');

      this.client.on('ConnectionClosed', () => {
        this.connected = false;
        this.log('conexión cerrada');
      });
    } catch (error) {
      this.connected = false;
      // OBS cerrado no es un fallo del agente: el resto sigue funcionando.
      this.log(`no disponible: ${(error as Error).message}`);
    }
  }

  async apply(action: ObsAction): Promise<void> {
    if (!this.connected) {
      this.log('acción ignorada: OBS no está conectado');
      return;
    }

    try {
      switch (action.op) {
        case 'setScene':
          await this.client.call('SetCurrentProgramScene', { sceneName: action.target });
          break;

        case 'setSourceVisible':
        case 'toggleSource': {
          const visible = await this.toggleSource(action.target, action.op === 'toggleSource');
          // Encender una fuente «durante N segundos» se implementa aquí y no en
          // el dominio: es una particularidad de OBS, no una regla de negocio.
          if (action.durationMs > 0 && visible) {
            setTimeout(() => {
              void this.toggleSource(action.target, false, false);
            }, action.durationMs).unref?.();
          }
          break;
        }
      }
    } catch (error) {
      this.log(`falló ${action.op} sobre «${action.target}»: ${(error as Error).message}`);
    }
  }

  private async toggleSource(name: string, toggle: boolean, forceOn = true): Promise<boolean> {
    const scene = await this.client.call('GetCurrentProgramScene');
    const sceneName = scene.currentProgramSceneName ?? scene.sceneName;

    const items = await this.client.call('GetSceneItemList', { sceneName });
    const item = items.sceneItems?.find((i: { sourceName: string }) => i.sourceName === name);
    if (!item) throw new Error(`no existe la fuente «${name}» en la escena actual`);

    const enabled = toggle ? !item.sceneItemEnabled : forceOn;
    await this.client.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId: item.sceneItemId,
      sceneItemEnabled: enabled,
    });
    return enabled;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    try {
      await this.client?.disconnect?.();
    } catch {
      // ya estaba cerrado
    }
    this.connected = false;
  }
}
