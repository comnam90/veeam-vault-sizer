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
