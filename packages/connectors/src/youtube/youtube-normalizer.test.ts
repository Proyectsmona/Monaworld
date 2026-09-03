import { describe, expect, it } from 'vitest';
import { youtubeNormalizer } from './youtube-normalizer.js';

const ctx = { nativeId: 'y1', receivedAt: '2026-08-27T12:00:00.000Z' };
const author = {
  channelId: 'UC123',
  displayName: 'Dizzy',
  profileImageUrl: 'https://yt/a.png',
  isChatModerator: true,
  isChatSponsor: true,
};

describe('normalizador de YouTube', () => {
  it('mapea un mensaje de texto', () => {
    const e = youtubeNormalizer.normalize(
      { id: 'msg-7', snippet: { type: 'textMessageEvent', textMessageDetails: { messageText: 'hola' } }, authorDetails: author },
      ctx,
    );
    expect(e).toMatchObject({ type: 'chat', message: 'hola', actor: { isMod: true, isSubscriber: true } });
    // El id del mensaje es estable entre reconexiones: evita alertas repetidas.
    expect(e?.dedupeKey).toBe('youtube:msg-7');
  });

  it('convierte los micros del Super Chat a unidades monetarias', () => {
    const e = youtubeNormalizer.normalize(
      {
        id: 'sc-1',
        snippet: {
          type: 'superChatEvent',
          superChatDetails: { amountMicros: '5000000', currency: 'EUR', userComment: '¡grande!', tier: 3 },
        },
        authorDetails: author,
      },
      ctx,
    );
    expect(e).toMatchObject({
      type: 'superchat',
      value: { rawAmount: 5, rawUnit: 'currency', currency: 'EUR', tier: 'Nivel 3' },
      message: '¡grande!',
    });
  });

  it('maneja importes fraccionarios sin arrastrar error de coma flotante', () => {
    const e = youtubeNormalizer.normalize(
      { id: 'sc-2', snippet: { type: 'superChatEvent', superChatDetails: { amountMicros: '1990000', currency: 'USD' } } },
      ctx,
    );
    expect(e?.value.rawAmount).toBe(1.99);
  });

  it('mapea nuevo miembro y regalo de membresías', () => {
    expect(
      youtubeNormalizer.normalize(
        { id: 'n1', snippet: { type: 'newSponsorEvent', newSponsorDetails: { memberLevelName: 'Mona Fan' } } },
        ctx,
      ),
    ).toMatchObject({ type: 'member', value: { tier: 'Mona Fan' } });

    expect(
      youtubeNormalizer.normalize(
        { id: 'g1', snippet: { type: 'membershipGiftingEvent', membershipGiftingDetails: { giftMembershipsCount: 10 } } },
        ctx,
      ),
    ).toMatchObject({ type: 'gift_sub', value: { rawAmount: 10 } });
  });

  it('ignora borrados y eventos de sistema', () => {
    expect(youtubeNormalizer.normalize({ id: 'd', snippet: { type: 'messageDeletedEvent' } }, ctx)).toBeNull();
  });

  it('prefiere la marca de tiempo de la plataforma sobre la de recepción', () => {
    const e = youtubeNormalizer.normalize(
      { id: 'x', snippet: { type: 'textMessageEvent', publishedAt: '2026-01-01T00:00:00.000Z', textMessageDetails: { messageText: 'a' } } },
      ctx,
    );
    expect(e?.occurredAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
