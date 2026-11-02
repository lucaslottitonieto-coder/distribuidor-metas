import { createContext, useContext, useEffect, useState } from 'react';
import { api, type Bootstrap } from './api';

export type AppContextValue = { data: Bootstrap; year: number; setYear: (year: number) => void; agencyId: number; setAgencyId: (id: number) => void; refresh: () => void; tick: number; navigate: (path: string) => void; setUnsaved: (dirty: boolean) => void };
export const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);
export function useRemote<T>(path: string, tick = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    api<T>(path).then(d => { if (active) setData(d); }).catch(e => { if (active) setError(e); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, tick]);
  return { data, error, loading };
}
