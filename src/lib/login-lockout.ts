export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_LOCK_MINUTES = 10;

export function isLoginLocked(
  lockedUntil: Date | null | undefined,
  now = new Date(),
) {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function lockoutRemainingMinutes(lockedUntil: Date, now = new Date()) {
  const ms = lockedUntil.getTime() - now.getTime();
  return Math.max(1, Math.ceil(ms / 60_000));
}

/** Nächster Zählerstand nach einem falschen Passwort. Beim 10. Versuch beginnt die Sperre. */
export function nextFailedLoginState(currentCount: number, now = new Date()) {
  const nextCount = currentCount + 1;
  if (nextCount >= LOGIN_MAX_FAILURES) {
    return {
      failedLoginCount: 0,
      loginLockedUntil: new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000),
      justLocked: true as const,
    };
  }
  return {
    failedLoginCount: nextCount,
    loginLockedUntil: null,
    justLocked: false as const,
  };
}
