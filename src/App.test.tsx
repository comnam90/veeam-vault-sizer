import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the header title and the Workload Data card", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /veeam data cloud vault sizer/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Workload Data")).toBeInTheDocument();
  });
});
