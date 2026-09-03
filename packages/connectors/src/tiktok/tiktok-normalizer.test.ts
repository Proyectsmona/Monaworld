import { describe, expect, it } from 'vitest';
import { tiktokNormalizer } from './tiktok-normalizer.js';

const ctx = { nativeId: 'n1', receivedAt: '2026-08-27T12:00:00.000Z' };
const user = { userId: '77', uniqueId: 'dizzy', nickname: 'Dizzy', profilePictureUrl: 'https://x/y.png' };

describe('normalizador de TikTok', () => {
  it('no cuenta un gift mientras la racha sigue abierta', () => {
    const e = tiktokNormalizer.normalize(
      { kind: 'gift', user, giftDetails: { giftName: 'Rose', giftType: 1 }, repeatCount: 3, repeatEnd: false },
      ctx,
    );
    expect(e).toBeNull();
  });

  it('cuenta el gift una sola vez al cerrarse la racha', () => {
    const e = tiktokNormalizer.normalize(
      { kind: 'gift', user, giftDetails: { giftName: 'Rose', giftType: 1 }, repeatCount: 5, repeatEnd: true },
      ctx,
    );
    expect(e).toMatchObject({
      type: 'gift',
      value: { rawAmount: 5, rawUnit: 'gift', giftName: 'Rose' },
    });
  });

  it('los gifts no acumulables cuentan de inmediato', () => {
    const e = tiktokNormalizer.normalize(
      { kind: 'gift', user, giftDetails: { giftName: 'Galaxy', giftType: 2 }, repeatCount: 1 },
      ctx,
    );
    expect(e?.value.giftName).toBe('Galaxy');
  });

  it('distingue dos rachas del mismo regalo por su clave', () => {
    const a = tiktokNormalizer.normalize(
      { kind: 'gift', user, msgId: 'm1', giftId: 5, giftDetails: { giftName: 'Rose', giftType: 1 }, repeatCount: 5, repeatEnd: true },
      ctx,
    );
    const b = tiktokNormalizer.normalize(
      { kind: 'gift', user, msgId: 'm2', giftId: 5, giftDetails: { giftName: 'Rose', giftType: 1 }, repeatCount: 5, repeatEnd: true },
      ctx,
    );
    expect(a?.dedupeKey).not.toBe(b?.dedupeKey);
  });

  it('separa follow y share del mismo evento social', () => {
    const follow = tiktokNormalizer.normalize({ kind: 'social', user, action: 'follow' }, ctx);
    const share = tiktokNormalizer.normalize({ kind: 'social', user, action: 'share' }, ctx);
    expect(follow?.type).toBe('follow');
    expect(share?.type).toBe('share');
  });

  it('usa el nickname y cae al uniqueId si falta', () => {
    const e = tiktokNormalizer.normalize({ kind: 'chat', user: { uniqueId: 'solo_id' }, comment: 'hola' }, ctx);
    expect(e?.actor.displayName).toBe('solo_id');
  });

  it('descarta chat vacío', () => {
    expect(tiktokNormalizer.normalize({ kind: 'chat', user, comment: '  ' }, ctx)).toBeNull();
  });
});
