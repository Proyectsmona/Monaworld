import { describe, expect, it } from 'vitest';
import { kickNormalizer } from './kick-normalizer.js';

const ctx = { nativeId: 'k1', receivedAt: '2026-08-27T12:00:00.000Z' };
const run = (eventType: string, payload: Record<string, unknown>) =>
  kickNormalizer.normalize({ eventType, payload }, ctx);

const sender = {
  user_id: 42,
  username: 'dizzy',
  profile_picture: 'https://kick/x.png',
  identity: { badges: [{ type: 'moderator' }, { type: 'subscriber' }] },
};

describe('normalizador de Kick', () => {
  it('mapea un mensaje de chat y sus insignias', () => {
    const e = run('chat.message.sent', { message_id: 'm9', sender, content: 'hola mona' });
    expect(e).toMatchObject({
      type: 'chat',
      message: 'hola mona',
      actor: { displayName: 'dizzy', isMod: true, isSubscriber: true },
    });
    // La clave usa el id del mensaje, no el de la petición.
    expect(e?.dedupeKey).toBe('kick:chat.message.sent:m9');
  });

  it('mapea un follow', () => {
    const e = run('channel.followed', { follower: { user_id: 7, username: 'nueva' } });
    expect(e).toMatchObject({ type: 'follow', actor: { displayName: 'nueva' } });
  });

  it('cuenta las subs regaladas por el número de destinatarios', () => {
    const e = run('channel.subscription.gifts', {
      gifter: { user_id: 1, username: 'generosa' },
      giftees: [{ user_id: 2 }, { user_id: 3 }, { user_id: 4 }],
    });
    expect(e).toMatchObject({ type: 'gift_sub', value: { rawAmount: 3, rawUnit: 'gift' } });
  });

  it('descarta un regalo sin destinatarios', () => {
    expect(run('channel.subscription.gifts', { gifter: sender, giftees: [] })).toBeNull();
  });

  it('distingue alta de renovación', () => {
    expect(run('channel.subscription.new', { subscriber: sender })?.type).toBe('subscribe');
    expect(run('channel.subscription.renewal', { subscriber: sender, duration: 6 })).toMatchObject({
      type: 'resub',
      value: { rawAmount: 6 },
    });
  });

  it('respeta el anonimato', () => {
    const e = run('channel.followed', { follower: { is_anonymous: true } });
    expect(e?.actor.displayName).toBe('Anónimo');
  });

  it('ignora en silencio los eventos que Kick añada y no mapeemos', () => {
    expect(run('moderation.banned', { sender })).toBeNull();
  });
});
