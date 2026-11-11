'use client';

import { useEffect } from 'react';

const VIEWPORT_HEIGHT_VAR = '--app-height';

export function useViewportHeight() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const updateViewportHeight = () => {
      const height = Math.round(window.visualViewport?.height ?? window.innerHeight);
      document.documentElement.style.setProperty(VIEWPORT_HEIGHT_VAR, `${height}px`);
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
    };
  }, []);
}
