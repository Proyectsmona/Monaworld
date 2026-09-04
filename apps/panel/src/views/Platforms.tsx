import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { Message } from 'primereact/message';
import { api, type AccountStatus } from '../api';
import { ConfirmDialog, PlatformChip, StatusChip } from './bits';

/**
 * Conexión de cuentas.
 *
 * Twitch y Kick se conectan desde aquí con OAuth. YouTube y TikTok no: viven en
 * el agente local y se configuran en su fichero `.env`, porque necesitan una
 * conexión larga y una IP residencial que un Worker no puede ofrecer.
 */

type Platform = AccountStatus['platform'];

interface HowTo {
  readonly method: string;
  readonly official: boolean;
  readonly note: string;
  readonly connectable: boolean;
  readonly setup?: string;
}

const HOW: Record<Platform, HowTo> = {
  twitch: {
    method: 'EventSub por webhook',
    official: true,
    connectable: true,
    note: 'Follows, subs, cheers, raids y chat. Al conectar se crean las suscripciones automáticamente.',
  },
  kick: {
    method: 'API pública por webhook',
    official: true,
    connectable: true,
    note: 'OAuth 2.1 con PKCE y webhooks firmados con clave pública. Llega directo al Worker.',
  },
  youtube: {
    method: 'liveChatMessages (Data API v3)',
    official: true,
    connectable: false,
    note: 'Necesita mantener una conexión abierta durante horas, así que corre en el agente.',
    setup: 'npm run agent:youtube-auth',
  },
  tiktok: {
    method: 'Protocolo interno del LIVE',
    official: false,
    connectable: false,
    note: 'Sin API oficial de gifts. Funciona mucho mejor desde una IP residencial que desde la nube.',
    setup: 'TIKTOK_USERNAME en apps/agent/.env',
  },
};

/** El callback vuelve al panel con el resultado en el hash de la URL. */
function readCallbackResult(): { platform: string; state: string; detail?: string } | null {
  const hash = location.hash.replace(/^#platforms\?/, '');
  if (!hash || hash === location.hash) return null;

  const params = new URLSearchParams(hash);
  const connected = params.get('connected');
  if (!connected) return null;

  return {
    platform: params.get('platform') ?? '',
    state: connected,
    detail: params.get('reason') ?? params.get('suscripciones') ?? undefined,
  };
}

export function Platforms() {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [busy, setBusy] = useState<Platform | null>(null);
  const [result, setResult] = useState(readCallbackResult);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void api
      .accounts()
      .then((r) => setAccounts(r.accounts))
      .catch(() => {});
  }, []);

  useEffect(reload, [reload]);

  useEffect(() => {
    // Limpiar el hash para que un recargado no repita el mensaje.
    if (result) history.replaceState(null, '', location.pathname);
  }, [result]);

  const [pendingDisconnect, setPendingDisconnect] = useState<Platform | null>(null);

  const disconnect = async (platform: Platform) => {
    setPendingDisconnect(null);
    setBusy(platform);
    setError(null);
    try {
      await api.disconnect(platform);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desconectar');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {result && (
        <Message.Root
          severity={result.state === 'si' ? 'success' : result.state === 'parcial' ? 'warn' : 'error'}
        >
          <Message.Content>
            <Message.Text>
              {result.state === 'si' && `${result.platform} conectado · ${result.detail ?? ''} suscripciones`}
              {result.state === 'parcial' &&
                `${result.platform} conectado con avisos (${result.detail}). Revisa los permisos concedidos.`}
              {result.state === 'no' && `No se pudo conectar ${result.platform}: ${result.detail}`}
            </Message.Text>
          </Message.Content>
        </Message.Root>
      )}

      {error && (
        <Message.Root severity="error">
          <Message.Content>
            <Message.Text>{error}</Message.Text>
          </Message.Content>
        </Message.Root>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {accounts.map((account) => {
          const how = HOW[account.platform];
          return (
            <Card.Root key={account.platform} className="mw-panel">
              <Card.Body className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <PlatformChip platform={account.platform} />
                  <StatusChip status={account.status} />
                </div>

                <div>
                  <div className="font-display text-base font-semibold">{how.method}</div>
                  <p className="mt-1 text-sm text-mw-muted">{how.note}</p>
                </div>

                <dl className="flex flex-col gap-2 border-t border-mw-line-soft pt-3 text-sm">
                  <div className="flex gap-3">
                    <dt className="mw-label w-24 shrink-0">Entra por</dt>
                    <dd className="text-mw-muted">
                      {account.via === 'webhook' ? 'Worker (Cloudflare)' : 'Agente local'}
                    </dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="mw-label w-24 shrink-0">Vía</dt>
                    <dd style={{ color: how.official ? 'var(--color-mw-ok)' : 'var(--color-mw-warn)' }}>
                      {how.official ? 'API oficial' : 'No oficial'}
                    </dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="mw-label w-24 shrink-0">Canal</dt>
                    <dd className="text-mw-muted">{account.channelName ?? 'sin conectar'}</dd>
                  </div>
                  {account.lastError && (
                    <div className="flex gap-3">
                      <dt className="mw-label w-24 shrink-0">Aviso</dt>
                      <dd className="break-words text-mw-risk">{account.lastError}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {how.connectable ? (
                    <>
                      <Button
                        size="small"
                        loading={busy === account.platform}
                        onClick={() => {
                          location.href = api.connectUrl(account.platform);
                        }}
                      >
                        {account.connected ? 'Reconectar' : 'Conectar'}
                      </Button>
                      {account.connected && (
                        <Button
                          size="small"
                          severity="secondary"
                          variant="text"
                          loading={busy === account.platform}
                          onClick={() => setPendingDisconnect(account.platform)}
                        >
                          Desconectar
                        </Button>
                      )}
                    </>
                  ) : (
                    <code className="rounded border border-mw-line bg-black/30 px-2 py-1 font-mono text-xs text-mw-muted">
                      {how.setup}
                    </code>
                  )}
                </div>
              </Card.Body>
            </Card.Root>
          );
        })}
      </div>

      <Card.Root className="mw-panel">
        <Card.Body className="p-5">
          <p className="text-sm text-mw-muted">
            MonaWorld solo <b className="text-mw-text">lee</b> lo que ocurre en los directos: nunca
            publica, nunca modera y nunca modifica cuentas. Los permisos que se piden son
            exclusivamente de lectura. No se crean, venden ni alteran Bits, Coins, Gifts ni
            suscripciones de las plataformas.
          </p>
        </Card.Body>
      </Card.Root>

      <ConfirmDialog
        open={pendingDisconnect !== null}
        title="¿Desconectar la cuenta?"
        detail="Se borrarán las suscripciones de webhook en la plataforma y el token guardado. Dejarás de recibir eventos hasta que vuelvas a conectar y autorizar."
        confirmLabel="Desconectar"
        busy={busy === pendingDisconnect}
        onConfirm={() => pendingDisconnect && void disconnect(pendingDisconnect)}
        onCancel={() => setPendingDisconnect(null)}
      />
    </div>
  );
}
