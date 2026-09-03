import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

/**
 * Obtención del refresh token de YouTube, para el agente.
 *
 * Google usa el flujo «loopback» para aplicaciones de escritorio: el navegador
 * vuelve a un servidor que este script levanta en localhost. Es el sustituto
 * soportado del antiguo copiar-y-pegar manual, que Google retiró.
 *
 *   npm run agent:youtube-auth
 *
 * Se ejecuta una sola vez: el refresh token no caduca mientras no se revoque,
 * y a partir de ahí el agente renueva el access token solo.
 */

const PORT = 4788;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Solo lectura: MonaWorld nunca publica ni modera en YouTube. */
const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`\nFalta ${name}.`);
    console.error('Créalo en Google Cloud Console → Credenciales → ID de cliente de OAuth');
    console.error('  · Tipo de aplicación: "Aplicación de escritorio"');
    console.error(`  · URI de redirección autorizado: ${REDIRECT_URI}\n`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const clientId = requireEnv('YOUTUBE_CLIENT_ID');
  const clientSecret = requireEnv('YOUTUBE_CLIENT_SECRET');
  const state = randomBytes(16).toString('hex');

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', SCOPES.join(' '));
  authorizeUrl.searchParams.set('state', state);
  // `offline` + `consent` son los que hacen que Google devuelva refresh token:
  // sin ellos solo llega el access token y el agente moriría en una hora.
  authorizeUrl.searchParams.set('access_type', 'offline');
  authorizeUrl.searchParams.set('prompt', 'consent');

  console.log('\nMonaWorld · autorización de YouTube\n');
  console.log('Abre esta URL en el navegador:\n');
  console.log(`  ${authorizeUrl}\n`);
  console.log('Esperando la respuesta de Google…\n');

  const code = await waitForCode(state);
  if (!code) {
    console.error('No se recibió el código. Vuelve a intentarlo.');
    process.exit(1);
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok || !body.refresh_token) {
    console.error('\nNo se pudo obtener el refresh token:');
    console.error(JSON.stringify(body, null, 2));
    if (response.ok) {
      console.error(
        '\nGoogle solo devuelve refresh token con access_type=offline y prompt=consent.',
      );
      console.error('Si ya autorizaste antes, revoca el acceso y repite:');
      console.error('  https://myaccount.google.com/permissions\n');
    }
    process.exit(1);
  }

  console.log('\nListo. Añade esto a apps/agent/.env:\n');
  console.log(`YOUTUBE_REFRESH_TOKEN=${body.refresh_token}\n`);
}

/** Levanta el servidor de vuelta, espera un código y se cierra. */
function waitForCode(expectedState: string): Promise<string | null> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const failed = !code || state !== expectedState;

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(resultPage(failed));

      server.close();
      resolve(failed ? null : code);
    });

    server.listen(PORT, '127.0.0.1');

    // Si nadie responde en cinco minutos, no dejar el proceso colgado.
    setTimeout(
      () => {
        server.close();
        resolve(null);
      },
      5 * 60 * 1000,
    ).unref();
  });
}

function resultPage(failed: boolean): string {
  const title = failed ? 'Algo salió mal' : 'Autorización concedida';
  const detail = failed
    ? 'Vuelve a la terminal y repite el proceso.'
    : 'Ya puedes cerrar esta pestaña y volver a la terminal.';
  const accent = failed ? '#ff5b72' : '#ff35b8';

  return `<!doctype html><meta charset="utf-8"><title>MonaWorld</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0711;
color:#f3eaf8;font-family:system-ui,sans-serif;text-align:center">
<div><div style="font-size:34px;font-weight:800">Mona<span style="color:${accent}">World</span></div>
<h1 style="font-size:20px;margin:18px 0 6px">${title}</h1>
<p style="color:#a18fb4;margin:0">${detail}</p></div></body>`;
}

void main();
