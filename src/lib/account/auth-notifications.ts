import type { ThiepnIdentity } from '@thiepn/account-session';

/**
 * The shared Account SDK emits an identity on every verify(), including when
 * nothing changed. Consumers that verify on auth notifications must receive
 * only genuine transitions to avoid recursive refresh and sync attempts.
 */
export function coalesceLibraryAccountAuthChanges(
  listener: () => void,
): (identity: ThiepnIdentity) => void {
  let previousKey: string | null = null;
  return (identity) => {
    const key = identity.status === 'signed-in'
      ? `signed-in:${identity.id}:${identity.email ?? ''}`
      : identity.status === 'unavailable'
        ? `unavailable:${identity.code}`
        : 'signed-out';

    if (key === previousKey) return;
    previousKey = key;
    listener();
  };
}
