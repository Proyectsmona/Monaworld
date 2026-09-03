import {
  invalid,
  isWithinReplayWindow,
  valid,
  type SignatureVerdict,
} from '../shared/normalizer.js';

/**
 * Verificación de firma de Kick.
 *
 * A diferencia de Twitch, Kick firma con clave asimétrica: publica una clave
 * pública RSA y firma `messageId.timestamp.cuerpo`. Nosotros solo verificamos,
 * así que no hay ningún secreto compartido que se pueda filtrar.
 */

export const KICK_HEADERS = {
  id: 'Kick-Event-Message-Id',
  timestamp: 'Kick-Event-Message-Timestamp',
  signature: 'Kick-Event-Signature',
  type: 'Kick-Event-Type',
  version: 'Kick-Event-Version',
} as const;

export interface KickRequestEnvelope {
  readonly verdict: SignatureVerdict;
  readonly messageId: string;
  readonly eventType: string;
  readonly body: string;
}

/** Convierte una clave pública en PEM al formato que espera WebCrypto. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function verifyKickRequest(
  headers: Headers,
  body: string,
  publicKeyPem: string,
  now = Date.now(),
): Promise<KickRequestEnvelope> {
  const messageId = headers.get(KICK_HEADERS.id) ?? '';
  const timestamp = headers.get(KICK_HEADERS.timestamp) ?? '';
  const signature = headers.get(KICK_HEADERS.signature) ?? '';
  const eventType = headers.get(KICK_HEADERS.type) ?? '';

  const envelope = (verdict: SignatureVerdict): KickRequestEnvelope => ({
    verdict,
    messageId,
    eventType,
    body,
  });

  if (!messageId || !timestamp || !signature) {
    return envelope(invalid('faltan cabeceras de firma'));
  }
  if (!isWithinReplayWindow(timestamp, now)) {
    return envelope(invalid('mensaje fuera de la ventana de reenvío'));
  }

  try {
    const key = await crypto.subtle.importKey(
      'spki',
      pemToArrayBuffer(publicKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const payload = new TextEncoder().encode(`${messageId}.${timestamp}.${body}`);

    const okSignature = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signatureBytes,
      payload,
    );

    return envelope(okSignature ? valid : invalid('firma incorrecta'));
  } catch (error) {
    return envelope(invalid(`no se pudo verificar: ${(error as Error).message}`));
  }
}

/** Kick publica su clave pública; se cachea porque cambia muy rara vez. */
export const KICK_PUBLIC_KEY_URL = 'https://api.kick.com/public/v1/public-key';
