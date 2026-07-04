import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver. Radix UI's Popper (used by
// Tooltip, Select, Popover, etc.) reads element size via ResizeObserver, so
// any test that opens a Radix-positioned element needs this stub.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;

// jsdom does not implement window.matchMedia at all (calling it throws
// "window.matchMedia is not a function"). useTheme reads it unconditionally
// on mount to resolve the default "system" theme, so any test that renders
// a component tree under useTheme needs this stub. Tests that exercise OS
// theme-preference changes (see hooks/use-theme.test.ts) replace
// window.matchMedia with a fuller mock of their own before rendering.
function matchMediaStub(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList;
}

window.matchMedia ??= matchMediaStub;
