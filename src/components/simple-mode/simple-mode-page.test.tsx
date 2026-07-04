import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SimpleModePage } from "./simple-mode-page";

describe("SimpleModePage", () => {
  it("renders the Workload Data card and a reserved sidebar region", () => {
    render(<SimpleModePage />);

    expect(screen.getByText("Workload Data")).toBeInTheDocument();
    expect(
      screen.getByTestId("simple-mode-sidebar-placeholder"),
    ).toBeInTheDocument();
  });
});
