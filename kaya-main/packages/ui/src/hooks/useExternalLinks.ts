import { useEffect } from 'react';

/**
 * Hook that intercepts clicks on external links (http/https with target="_blank")
 * and opens them using Tauri's shell.open() API in desktop mode,
 * or falls back to window.open() in web mode.
 *
 * This is necessary because Tauri's webview doesn't automatically open
 * external links in the default browser.
 */
export function useExternalLinks(): void {
  useEffect(() => {
    const handleClick = async (event: MouseEvent) => {
      // Find the closest anchor element
      const target = event.target as HTMLElement;
      const anchor = target.closest('a');

      if (!anchor) return;

      const href = anchor.getAttribute('href');
      const targetAttr = anchor.getAttribute('target');

      // Only handle external links (http/https)
      if (!href || (!href.startsWith('http://') && !href.startsWith('https://'))) {
        return;
      }

      // Check if this is meant to be an external link
      if (targetAttr !== '_blank') {
        return;
      }

      // Prevent default browser behavior
      event.preventDefault();
      event.stopPropagation();

      // Check if we're in Tauri environment
      if (typeof window !== 'undefined' && '__TAURI__' in window) {
        try {
          // Access Tauri internals directly to avoid dynamic import issues
          const tauri = (
            window as unknown as {
              __TAURI__: { core: { invoke: (cmd: string, args: unknown) => Promise<unknown> } };
            }
          ).__TAURI__;
          if (tauri?.core?.invoke) {
            await tauri.core.invoke('plugin:shell|open', { path: href });
          } else {
            window.open(href, '_blank', 'noopener,noreferrer');
          }
        } catch (error) {
          console.error('Failed to open external link with Tauri:', error);
          // Fallback to window.open
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      } else {
        // Web environment - use standard window.open
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    };

    // Add listener to document to catch all link clicks
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, []);
}
