import { describe, expect, it } from "vitest";
import { capGfsToForecastHorizon } from "./cap-gfs-to-forecast-horizon";

describe("capGfsToForecastHorizon", () => {
  it("leaves counts unchanged when already within the horizon", () => {
    const result = capGfsToForecastHorizon(
      { weeklies: 4, monthlies: 12, yearlies: 1 },
      1,
    );

    expect(result).toEqual({ weeklies: 4, monthlies: 12, yearlies: 1 });
  });

  it("caps yearlies to the forecast horizon in years", () => {
    const result = capGfsToForecastHorizon(
      { weeklies: 0, monthlies: 0, yearlies: 3 },
      1,
    );

    expect(result.yearlies).toBe(1);
  });

  it("caps monthlies to the number of whole months in the horizon", () => {
    const result = capGfsToForecastHorizon(
      { weeklies: 0, monthlies: 24, yearlies: 0 },
      1,
    );

    expect(result.monthlies).toBe(12);
  });

  it("caps weeklies to the number of whole weeks in the horizon", () => {
    const result = capGfsToForecastHorizon(
      { weeklies: 60, monthlies: 0, yearlies: 0 },
      1,
    );

    expect(result.weeklies).toBe(52);
  });

  it("leaves an exact-boundary yearly count unchanged", () => {
    const result = capGfsToForecastHorizon(
      { weeklies: 0, monthlies: 12, yearlies: 1 },
      1,
    );

    expect(result).toEqual({ weeklies: 0, monthlies: 12, yearlies: 1 });
  });

  it("caps multiple classes independently in a single call", () => {
    const result = capGfsToForecastHorizon(
      { weeklies: 100, monthlies: 24, yearlies: 7 },
      1,
    );

    expect(result).toEqual({ weeklies: 52, monthlies: 12, yearlies: 1 });
  });
});
