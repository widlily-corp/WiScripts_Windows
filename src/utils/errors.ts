/**
 * Structured backend error shape serialized by Rust `AppError`.
 */
export interface StructuredAppError {
  code?: string;
  key?: string;
  message: string;
}

/**
 * Parses an unknown error value (plain string, Error instance, JSON string, or
 * Rust `{ code, key, message }` object) into a normalized `StructuredAppError`.
 */
export function parseAppError(error: unknown): StructuredAppError {
  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed !== null && typeof parsed === 'object' && 'message' in parsed) {
          const obj = parsed as { code?: unknown; key?: unknown; message?: unknown };
          if (typeof obj.message === 'string') {
            return {
              code: typeof obj.code === 'string' ? obj.code : undefined,
              key: typeof obj.key === 'string' ? obj.key : undefined,
              message: obj.message,
            };
          }
        }
      } catch {
        // Not valid JSON; treat as plain string error
      }
    }
    return { message: error };
  }

  if (error instanceof Error) {
    const withMeta = error as Error & { code?: unknown; key?: unknown };
    return {
      code: typeof withMeta.code === 'string' ? withMeta.code : undefined,
      key: typeof withMeta.key === 'string' ? withMeta.key : undefined,
      message: error.message,
    };
  }

  if (error !== null && typeof error === 'object') {
    const obj = error as { code?: unknown; key?: unknown; message?: unknown; error?: unknown };
    if (typeof obj.message === 'string') {
      return {
        code: typeof obj.code === 'string' ? obj.code : undefined,
        key: typeof obj.key === 'string' ? obj.key : undefined,
        message: obj.message,
      };
    }
    if (typeof obj.error === 'string') {
      return {
        code: typeof obj.code === 'string' ? obj.code : undefined,
        key: typeof obj.key === 'string' ? obj.key : undefined,
        message: obj.error,
      };
    }
  }

  return { message: String(error) };
}

/**
 * Safely extracts error message string from an unknown error object or string without using `as any`.
 */
export function getErrorMessage(error: unknown): string {
  return parseAppError(error).message;
}

/**
 * Safely extracts structured error code (`AppError.code`) if present.
 */
export function getErrorCode(error: unknown): string | undefined {
  return parseAppError(error).code;
}

/**
 * Safely extracts structured localization key (`AppError.key`) if present.
 */
export function getErrorKey(error: unknown): string | undefined {
  return parseAppError(error).key;
}

/**
 * Detects whether an error represents a missing file / uninstaller (`FileNotFound` / OS error 2).
 */
export function isFileNotFoundError(error: unknown): boolean {
  const { code, key, message } = parseAppError(error);
  const normCode = (code ?? '').toLowerCase();
  const normKey = (key ?? '').toLowerCase();
  const normMsg = message.toLowerCase();

  return (
    normCode === 'file_not_found' ||
    normCode === 'filenotfound' ||
    normKey.includes('file_not_found') ||
    normMsg.includes('filenotfound') ||
    normMsg.includes('not found') ||
    normMsg.includes('os error 2')
  );
}
