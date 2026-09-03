import { describe, expect, it } from 'vitest';
import { twitchNormalizer } from './twitch-normalizer.js';

const ctx = { nativeId: 'msg-1', receivedAt: '2026-08-27T12:00:00.000Z' };
const run = (type: string, event: Record<string, unknown>) =>
  twitchNormalizer.normalize({ subscription: { type }, event }, ctx);

describe('normalizador de Twitch', () => {
  it('mapea un follow', () => {
    const e = run('channel.follow', { user_id: '1', user_name: 'dizzy' });
    expect(e).toMatchObject({ type: 'follow', actor: { displayName: 'dizzy' } });
    expect(e?.dedupeKey).toBe('twitch:msg-1');
  });

  it('traduce el tier numérico a nombre legible', () => {
    const e = run('channel.subscribe', { user_id: '1', user_name: 'dizzy', tier: '2000' });
    expect(e?.value.tier).toBe('Tier 2');
    expect(e?.actor.isSubscriber).toBe(true);
  });

  it('descarta la sub regalada duplicada para no contar el regalo dos veces', () => {
    const e = run('channel.subscribe', { user_id: '1', user_name: 'x', is_gift: true });
    expect(e).toBeNull();
  });

  it('conserva los bits en unidades nativas, no en euros', () => {
    const e = run('channel.cheer', { user_id: '1', user_name: 'dizzy', bits: 500 });
    expect(e?.value).toMatchObject({ rawAmount: 500, rawUnit: 'bits' });
  });

  it('respeta el anonimato en cheers y regalos', () => {
    const e = run('channel.cheer', { is_anonymous: true, bits: 100 });
    expect(e?.actor).toMatchObject({ platformUserId: 'anonymous', displayName: 'Anónimo' });
  });

  it('lee las insignias del chat para saber si es mod o suscriptor', () => {
    const e = run('channel.chat.message', {
      chatter_user_id: '9',
      chatter_user_name: 'mod_mona',
      message: { text: 'hola' },
      badges: [{ set_id: 'moderator' }, { set_id: 'subscriber' }],
    });
    expect(e?.actor).toMatchObject({ isMod: true, isSubscriber: true });
    expect(e?.message).toBe('hola');
  });

  it('descarta mensajes de chat vacíos', () => {
    const e = run('channel.chat.message', {
      chatter_user_id: '9',
      chatter_user_name: 'x',
      message: { text: '   ' },
    });
    expect(e).toBeNull();
  });

  it('mapea un raid con su número de espectadores', () => {
    const e = run('channel.raid', {
      from_broadcaster_user_id: '5',
      from_broadcaster_user_name: 'otra_streamer',
      viewers: 42,
    });
    expect(e).toMatchObject({ type: 'raid', value: { rawAmount: 42, rawUnit: 'viewers' } });
  });

  it('ignora los tipos que no ingestamos', () => {
    expect(run('channel.ban', { user_id: '1' })).toBeNull();
  });
});
