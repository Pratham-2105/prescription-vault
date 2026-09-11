import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * The query is local and fast, so this is not about sparing the database. It
 * is about the cache: the filters object is part of the query key, so every
 * keystroke would create a new cache entry, and "diabetes" would leave eight
 * dead entries behind it.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);

    // Clearing on every change is what makes this a debounce rather than a
    // delay: a keystroke cancels the previous timer before it fires.
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return settled;
}