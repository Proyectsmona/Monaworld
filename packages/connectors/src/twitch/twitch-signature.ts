import {
  invalid,
  isWithinReplayWindow,
  timingSafeEqual,
  toHex,
  valid,
  type SignatureVerdict,
} from '../shared/normalizer.js';

/**
 * Verificación de firma de Twitch EventSub: HMAC-SHA256 sobre
 * `messageId + timestamp + cuerpo`, con el secreto acordado al suscribirse.
 *
 * Sin esto, quien descubra la URL del webhook puede inyectar donaciones falsas
 * y regalarse MonaCoins.
 */

export const TWITCH_HEADERS = {
  id: 'Twitch-Eventsub-Message-Id',
  timestamp: 'Twitch-Eventsub-Message-Timestamp',
  signature: 'Twitch-Eventsub-Message-Signature',
  type: 'Twitch-Eventsub-Message-Type',
  subscriptionType: 'Twitch-Eventsub-Subscription-Type',
} as const;

export type TwitchMessageType =
  | 'webhook_callback_verification'
  | 'notification'
  | 'revocation';

export interface TwitchRequestEnvelope {
  readonly verdict: SignatureVerdict;
  readonly messageId: string;
  readonly messageType: TwitchMessageType;
  readonly body: string;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(signature);
}

export async function verifyTwitchRequest(
  headers: Headers,
  body: string,
  secret: string,
  now = Date.now(),
): Promise<TwitchRequestEnvelope> {
  const messageId = headers.get(TWITCH_HEADERS.id) ?? '';
  const timestamp = headers.get(TWITCH_HEADERS.timestamp) ?? '';
  const signature = headers.get(TWITCH_HEADERS.signature) ?? '';
  const messageType = (headers.get(TWITCH_HEADERS.type) ??
    'notification') as TwitchMessageType;

  const envelope = (verdict: SignatureVerdict): TwitchRequestEnvelope => ({
    verdict,
    messageId,
    messageType,
    body,
  });

  if (!messageId || !timestamp || !signature) {
    return envelope(invalid('faltan cabeceras de firma'));
  }
  if (!isWithinReplayWindow(timestamp, now)) {
    return envelope(invalid('mensaje fuera de la ventana de reenvío'));
  }

  const expected = `sha256=${await hmacSha256Hex(secret, messageId + timestamp + body)}`;
  if (!timingSafeEqual(expected, signature)) {
    return envelope(invalid('firma incorrecta'));
  }

  return envelope(valid);
}
