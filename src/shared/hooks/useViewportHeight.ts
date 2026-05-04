'use client';

import { useEffect } from 'react';

const VIEWPORT_HEIGHT_VAR = '--app-height';

export function useViewportHeight() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const updateViewportHeight = () => {
      document.documentElement.style.setProperty(VIEWPORT_HEIGHT_VAR, `${window.innerHeight}px`);
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
    };
  }, []);
}
