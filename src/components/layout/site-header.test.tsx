import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteHeader } from "./site-header";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function renderHeader() {
  return render(
    <TooltipProvider delayDuration={0}>
      <SiteHeader />
    </TooltipProvider>,
  );
}

describe("SiteHeader", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockMatchMedia(false);
  });

  it("renders the app title", () => {
    renderHeader();
    expect(
      screen.getByRole("heading", { name: /veeam data cloud vault sizer/i }),
    ).toBeInTheDocument();
  });

  it("keeps the Advanced option disabled and out of tab order", () => {
    renderHeader();
    // Radix's ToggleGroup type="single" assigns role="radio" to items
    // (and role="radiogroup" to the container), not role="button".
    const advanced = screen.getByRole("radio", { name: /advanced mode/i });
    expect(advanced).toHaveAttribute("aria-disabled", "true");
    expect(advanced).toHaveAttribute("tabindex", "-1");
  });

  it("shows a Coming soon tooltip when the Advanced trigger is hovered", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.hover(screen.getByText("Advanced Mode"));

    // Radix's Tooltip renders its children twice while open: once visibly,
    // and once inside a visually-hidden role="tooltip" node for screen
    // readers (see @radix-ui/react-tooltip's VisuallyHiddenContentContext).
    // findByText requires a single match, so query all and assert at least
    // one is present.
    const matches = await screen.findAllByText("Coming soon");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("cycles the theme through light, dark, and system on repeated clicks", async () => {
    const user = userEvent.setup();
    renderHeader();

    const toggle = screen.getByRole("button", { name: /theme:/i });
    expect(toggle).toHaveAccessibleName(/theme: system/i);

    await user.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(toggle).toHaveAccessibleName(/theme: light/i);

    await user.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    // useTheme() always resolves "system" down to the concrete OS
    // preference for `data-theme` (verified by src/hooks/use-theme.test.ts
    // and required by the `[data-theme=dark]` custom-variant CSS hook), so
    // the literal string "system" is never written to the DOM. The only
    // observable signal that we're back in system mode is the accessible
    // name.
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName(/theme: system/i);
  });
});
