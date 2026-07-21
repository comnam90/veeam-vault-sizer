import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately, with no debounce delay", () => {
    const { result } = renderHook(() => useDebouncedValue("initial", 200));

    expect(result.current).toBe("initial");
  });

  it("does not update while changes keep arriving faster than the delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "6" } },
    );

    rerender({ value: "60" });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current).toBe("6");
  });

  it("settles to the latest value once changes stop for the full delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "6" } },
    );

    rerender({ value: "60" });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe("60");
  });
});
