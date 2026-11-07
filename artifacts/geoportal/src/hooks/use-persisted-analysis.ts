import { useState, useCallback } from "react";

// GEE ephemeral thumbnail & tile tokens expire after ~120 minutes.
// Automatically invalidate cached results after 90 minutes to prevent 401 "Invalid token" errors.
const MAX_CACHE_AGE_MS = 90 * 60 * 1000;

interface CacheEnvelope<T> {
  _cachedAt: number;
  payload: T;
}

/**
 * Hook to persist analysis state, parameters, and results in sessionStorage
 * so when users switch tabs or navigate across modules, their active work
 * remains intact without needing to re-run the calculation.
 */
export function usePersistedAnalysis<T>(
  moduleKey: string,
  initialData: T | null = null
): [T | null, (data: T | null) => void, () => void] {
  const storageKey = `spetro_analysis_${moduleKey}`;

  const [data, setDataState] = useState<T | null>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && "_cachedAt" in parsed && "payload" in parsed) {
          const envelope = parsed as CacheEnvelope<T>;
          if (Date.now() - envelope._cachedAt > MAX_CACHE_AGE_MS) {
            sessionStorage.removeItem(storageKey);
            return initialData;
          }
          return envelope.payload;
        }
        // Legacy un-enveloped cache
        return parsed as T;
      }
    } catch (e) {
      console.warn(`[usePersistedAnalysis] Failed to parse cached data for ${moduleKey}:`, e);
    }
    return initialData;
  });

  const setData = useCallback(
    (newData: T | null) => {
      setDataState(newData);
      try {
        if (newData === null) {
          sessionStorage.removeItem(storageKey);
        } else {
          const envelope: CacheEnvelope<T> = {
            _cachedAt: Date.now(),
            payload: newData,
          };
          sessionStorage.setItem(storageKey, JSON.stringify(envelope));
        }
      } catch (e) {
        console.warn(`[usePersistedAnalysis] Storage quota or serialization issue for ${moduleKey}:`, e);
      }
    },
    [storageKey, moduleKey]
  );

  const clear = useCallback(() => {
    setDataState(null);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  return [data, setData, clear];
}
