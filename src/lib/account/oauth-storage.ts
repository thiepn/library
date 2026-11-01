/**
 * Storage adapter for app-local OAuth tokens.
 *
 * Browsers can allow sessionStorage (needed for PKCE state across redirects)
 * while denying localStorage writes (privacy/quota policies). A successful
 * code exchange must not get stranded between token receipt and /auth/v1/user.
 * This falls back to same-origin, tab-scoped sessionStorage without ever
 * sending credentials to another origin or logging them.
 */
export function libraryOAuthTokenStorage(
  browser: Pick<Window, 'localStorage' | 'sessionStorage'>,
): Storage {
  function safeStore(kind: 'localStorage' | 'sessionStorage'): Storage | null {
    try { return browser[kind]; } catch { return null; }
  }
  const primary = safeStore('localStorage');
  const fallback = safeStore('sessionStorage');

  return {
    getItem(key: string) {
      try {
        const value = fallback?.getItem(key);
        if (value != null) return value;
      } catch { /* fall through to ordinary persistent storage */ }
      try { return primary?.getItem(key) ?? null; } catch { return null; }
    },
    setItem(key: string, value: string) {
      try {
        if (!primary) throw new Error('localStorage unavailable');
        primary.setItem(key, value);
        // Remove any stale tab-scoped credentials after a persistent write.
        try { fallback?.removeItem(key); } catch {}
      } catch {
        if (!fallback) throw new Error('ACCOUNT_TOKEN_STORAGE_UNAVAILABLE');
        try { fallback.setItem(key, value); }
        catch { throw new Error('ACCOUNT_TOKEN_STORAGE_UNAVAILABLE'); }
      }
    },
    removeItem(key: string) {
      try { primary?.removeItem(key); } catch {}
      try { fallback?.removeItem(key); } catch {}
    },
  } as Storage;
}
