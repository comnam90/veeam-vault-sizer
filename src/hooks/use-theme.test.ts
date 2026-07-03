import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./use-theme";

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  let changeListener: (() => void) | null = null;
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_event: string, listener: () => void) => {
      changeListener = listener;
    },
    removeEventListener: () => {
      changeListener = null;
    },
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    setMatches: (value: boolean) => {
      matches = value;
      changeListener?.();
    },
  };
}

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to system and resolves via prefers-color-scheme (dark)", () => {
    mockMatchMedia(true);
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("defaults to system and resolves via prefers-color-scheme (light)", () => {
    mockMatchMedia(false);
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("persists an explicit choice to localStorage and applies it", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("reads a persisted choice back on next mount", () => {
    mockMatchMedia(true);
    window.localStorage.setItem("theme", "light");

    renderHook(() => useTheme());

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("returning to system removes the persisted choice", () => {
    mockMatchMedia(true);
    window.localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("system");
    });

    expect(window.localStorage.getItem("theme")).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("updates data-theme live when the OS preference changes while in system mode", () => {
    const media = mockMatchMedia(false);
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    act(() => {
      media.setMatches(true);
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
