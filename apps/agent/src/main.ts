import { Uplink } from './transport/uplink.ts';
import { TikTokConnector } from './connectors/tiktok-connector.ts';
import { YouTubeConnector } from './connectors/youtube-connector.ts';
import { ObsController } from './connectors/obs-controller.ts';

/**
 * Agente local de MonaWorld.
 *
 * Hace exactamente lo que un Worker de Cloudflare no puede hacer, y nada más:
 *
 *   · YouTube — necesita una conexión abierta durante horas.
 *   · TikTok  — funciona mucho peor desde una IP de centro de datos.
 *   · OBS     — hay que estar en la misma máquina.
 *
 * Twitch y Kick NO están aquí: llegan por webhook directos al Worker y siguen
 * funcionando aunque este proceso esté apagado.
 *
 * Cada conector es independiente: si TikTok se rompe —y se romperá—, YouTube y
 * OBS siguen funcionando.
 */

const log = (message: string) => {
  const time = new Date().toLocaleTimeString('es-ES');
  console.log(`${time}  ${message}`);
};

function readEnv() {
  const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) {
      console.error(`Falta la variable ${name}. Copia .env.example a .env y rellénalo.`);
      process.exit(1);
    }
    return value;
  };

  return {
    baseUrl: required('MONAWORLD_URL').replace(/\/$/, ''),
    token: required('AGENT_TOKEN'),
    tiktokUsername: process.env.TIKTOK_USERNAME?.trim().replace(/^@/, ''),
    youtube: {
      clientId: process.env.YOUTUBE_CLIENT_ID?.trim(),
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET?.trim(),
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN?.trim(),
    },
    obs: {
      url: process.env.OBS_URL?.trim() || 'ws://127.0.0.1:4455',
      password: process.env.OBS_PASSWORD?.trim(),
    },
  };
}

async function main(): Promise<void> {
  const config = readEnv();

  log('MonaWorld · agente local');
  log(`Worker: ${config.baseUrl}`);

  const uplink = new Uplink({ baseUrl: config.baseUrl, token: config.token, onLog: log });

  const obs = new ObsController({ ...config.obs, onLog: log });
  await obs.connect();

  const running: Array<{ stop: () => void | Promise<void> }> = [];

  // ------------------------------------------------------------- TikTok
  if (config.tiktokUsername) {
    const tiktok = new TikTokConnector({
      username: config.tiktokUsername,
      onEvent: (event) => uplink.publish(event),
      onStatus: (status, detail) => void uplink.report('tiktok', status, detail),
      onLog: log,
    });
    running.push(tiktok);
    void tiktok.start();
  } else {
    log('TikTok desactivado (falta TIKTOK_USERNAME)');
  }

  // ------------------------------------------------------------ YouTube
  const { clientId, clientSecret, refreshToken } = config.youtube;
  if (clientId && clientSecret && refreshToken) {
    const youtube = new YouTubeConnector({
      clientId,
      clientSecret,
      refreshToken,
      onEvent: (event) => uplink.publish(event),
      onStatus: (status, detail) => void uplink.report('youtube', status, detail),
      onLog: log,
    });
    running.push(youtube);
    void youtube.start();
  } else {
    log('YouTube desactivado (faltan credenciales OAuth)');
  }

  if (running.length === 0) {
    log('Ningún conector activo. Revisa el fichero .env.');
  }

  const shutdown = async () => {
    log('cerrando…');
    uplink.stop();
    await Promise.allSettled(running.map((r) => r.stop()));
    await obs.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // Un fallo dentro de un conector no debe tumbar el agente entero.
  process.on('unhandledRejection', (reason) => {
    log(`promesa sin capturar: ${String(reason)}`);
  });
}

void main();
