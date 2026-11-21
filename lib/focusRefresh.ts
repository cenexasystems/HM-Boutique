// lib/focusRefresh.ts
//
// Pages refresh their data when you come back to the tab. Doing that on EVERY focus (alt-tab,
// clicking another window, a print dialog closing...) re-downloads every order each time and makes
// the app feel slow. This only refreshes when the page has been away for a while.

export function refreshOnFocus(refresh: () => void, minGapMs = 60_000): () => void {
  let last = Date.now();
  const onFocus = () => {
    if (Date.now() - last < minGapMs) return;
    last = Date.now();
    refresh();
  };
  window.addEventListener('focus', onFocus);
  return () => window.removeEventListener('focus', onFocus);
}
