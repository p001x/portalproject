import { useState, useEffect, useCallback } from "react";

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
        return JSON.parse(saved) as T;
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
          sessionStorage.setItem(storageKey, JSON.stringify(newData));
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
