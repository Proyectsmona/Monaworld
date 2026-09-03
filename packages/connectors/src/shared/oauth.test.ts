import { describe, expect, it } from 'vitest';
import { createPkcePair, isExpired, randomToken, toTokens } from './oauth.js';

describe('PKCE', () => {
  it('genera un desafío S256 en base64url, sin relleno', async () => {
    const { verifier, challenge } = await createPkcePair();

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).not.toContain('=');
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
    // SHA-256 en base64url son siempre 43 caracteres.
    expect(challenge).toHaveLength(43);
  });

  it('el desafío es el hash del verificador, no el verificador', async () => {
    const pair = await createPkcePair();
    expect(pair.challenge).not.toBe(pair.verifier);
  });

  it('cada par es distinto', async () => {
    const [a, b] = await Promise.all([createPkcePair(), createPkcePair()]);
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('estado anti-CSRF', () => {
  it('no se repite', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => randomToken(24)));
    expect(tokens.size).toBe(100);
  });
});

describe('tokens', () => {
  it('convierte expires_in relativo en marca absoluta', () => {
    const before = Date.now();
    const tokens = toTokens({ access_token: 'a', refresh_token: 'r', expires_in: 3600 });

    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 3600_000);
    expect(tokens.refreshToken).toBe('r');
  });

  it('acepta respuestas sin refresh token', () => {
    expect(toTokens({ access_token: 'a' }).refreshToken).toBeNull();
  });

  it('considera caducado un token que vence dentro del margen', () => {
    expect(isExpired(Date.now() + 30_000)).toBe(true);
    expect(isExpired(Date.now() + 300_000)).toBe(false);
    expect(isExpired(null)).toBe(false);
  });
});
