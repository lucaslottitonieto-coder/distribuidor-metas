import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/** useLayoutEffect no navegador, useEffect no servidor (evita o aviso de SSR do React 18). */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// ---------------------------------------------------------------- Relógio compartilhado

let nowValue = Date.now();
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | undefined;

function subscribeTick(cb: () => void) {
  tickListeners.add(cb);
  if (!tickTimer) {
    nowValue = Date.now();
    tickTimer = setInterval(() => {
      nowValue = Date.now();
      tickListeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    tickListeners.delete(cb);
    if (!tickListeners.size && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }
  };
}

/**
 * Hora atual que avança a cada segundo (durações "ao vivo", tempos relativos). Um único timer para toda a página.
 * No servidor e durante a hidratação devolve 0 — trate 0 como "ainda não sei a hora" (RelativeTime e Duration já tratam).
 */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeTick,
    () => nowValue,
    () => 0,
  );
}

/** Largura de um elemento, atualizada com ResizeObserver. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Valor com atraso (busca enquanto digita). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Estado controlado ou não controlado (padrão value/defaultValue/onChange). */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInner(next);
      onChangeRef.current?.(next);
    },
    [controlled],
  );
  return [current, set];
}

// ---------------------------------------------------------------- localStorage protegido

/** Lê do localStorage sem quebrar em janelas privadas ou com armazenamento bloqueado. */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // sem persistência: segue só em memória
  }
}

/** Título da aba do navegador, restaurado ao desmontar. */
export function useDocumentTitle(title: string | undefined, suffix?: string) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = suffix ? `${title} · ${suffix}` : title;
    return () => {
      document.title = prev;
    };
  }, [title, suffix]);
}
