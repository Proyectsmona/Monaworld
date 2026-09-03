/**
 * Resultado explícito para operaciones de dominio que pueden fallar por reglas
 * de negocio. Las excepciones quedan reservadas para fallos de infraestructura,
 * de forma que un caso de uso nunca confunde «el evento está duplicado» con
 * «la base de datos no responde».
 */
export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

export type DomainErrorCode =
  | 'invalid_event'
  | 'duplicate_event'
  | 'rule_not_found'
  | 'invalid_rule'
  | 'account_not_connected'
  | 'unauthorized';

export const domainError = (
  code: DomainErrorCode,
  message: string,
  details?: unknown,
): DomainError => ({ code, message, details });
