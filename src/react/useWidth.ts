import { useEffect, useRef, useState } from 'react';

/** Ancho disponible de un contenedor (se actualiza al redimensionar). */
export function useWidth<T extends HTMLElement>(fallback = 560) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const w = el.getBoundingClientRect().width; if (w > 0) setWidth(Math.round(w)); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}
