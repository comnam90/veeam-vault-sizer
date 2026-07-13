import { describe, expect, it } from "vitest";
import { validateWorkloadData } from "./validate-workload-data";
import type { WorkloadDataValues } from "@/types/simple-mode";

const validValues: WorkloadDataValues = {
  sourceSizeTB: "10",
  dailyChangeRatePercent: "3",
  dataReductionPercent: "50",
  yearlyGrowthPercent: "10",
  shortTermRetentionDays: "30",
  gfsWeekly: "4",
  gfsMonthly: "12",
  gfsYearly: "3",
  projectLengthYears: "1",
  capGfsToForecastHorizon: true,
};

describe("validateWorkloadData", () => {
  it("returns no errors for valid default values", () => {
    expect(validateWorkloadData(validValues)).toEqual({});
  });

  describe("sourceSizeTB", () => {
    it("rejects 0", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "0" })
          .sourceSizeTB,
      ).toBe("Must be greater than 0");
    });

    it("rejects negative values", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "-5" })
          .sourceSizeTB,
      ).toBe("Must be greater than 0");
    });

    it("accepts a small positive decimal", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "0.1" })
          .sourceSizeTB,
      ).toBeUndefined();
    });

    it("rejects an empty string", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "" }).sourceSizeTB,
      ).toBe("Required");
    });

    it("rejects non-numeric text", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "abc" })
          .sourceSizeTB,
      ).toBe("Must be a number");
    });
  });

  describe("dailyChangeRatePercent", () => {
    it("accepts the boundary values 0 and 100", () => {
      expect(
        validateWorkloadData({ ...validValues, dailyChangeRatePercent: "0" })
          .dailyChangeRatePercent,
      ).toBeUndefined();
      expect(
        validateWorkloadData({
          ...validValues,
          dailyChangeRatePercent: "100",
        }).dailyChangeRatePercent,
      ).toBeUndefined();
    });

    it("rejects a negative value", () => {
      expect(
        validateWorkloadData({ ...validValues, dailyChangeRatePercent: "-1" })
          .dailyChangeRatePercent,
      ).toBe("Must be between 0 and 100");
    });

    it("rejects a value above 100", () => {
      expect(
        validateWorkloadData({
          ...validValues,
          dailyChangeRatePercent: "101",
        }).dailyChangeRatePercent,
      ).toBe("Must be between 0 and 100");
    });
  });

  describe("dataReductionPercent", () => {
    it("accepts the boundary values 0 and 100", () => {
      expect(
        validateWorkloadData({ ...validValues, dataReductionPercent: "0" })
          .dataReductionPercent,
      ).toBeUndefined();
      expect(
        validateWorkloadData({ ...validValues, dataReductionPercent: "100" })
          .dataReductionPercent,
      ).toBeUndefined();
    });

    it("rejects a value above 100", () => {
      expect(
        validateWorkloadData({ ...validValues, dataReductionPercent: "150" })
          .dataReductionPercent,
      ).toBe("Must be between 0 and 100");
    });
  });

  describe("yearlyGrowthPercent", () => {
    it("accepts the boundary value 0", () => {
      expect(
        validateWorkloadData({ ...validValues, yearlyGrowthPercent: "0" })
          .yearlyGrowthPercent,
      ).toBeUndefined();
    });

    it("accepts values above 100 (no upper cap)", () => {
      expect(
        validateWorkloadData({ ...validValues, yearlyGrowthPercent: "250" })
          .yearlyGrowthPercent,
      ).toBeUndefined();
    });

    it("rejects a negative value", () => {
      expect(
        validateWorkloadData({ ...validValues, yearlyGrowthPercent: "-1" })
          .yearlyGrowthPercent,
      ).toBe("Must be 0 or greater");
    });
  });

  describe("shortTermRetentionDays", () => {
    it("accepts the boundary value 1", () => {
      expect(
        validateWorkloadData({ ...validValues, shortTermRetentionDays: "1" })
          .shortTermRetentionDays,
      ).toBeUndefined();
    });

    it("rejects 0", () => {
      expect(
        validateWorkloadData({ ...validValues, shortTermRetentionDays: "0" })
          .shortTermRetentionDays,
      ).toBe("Must be 1 or greater");
    });

    it("rejects a non-integer value", () => {
      expect(
        validateWorkloadData({
          ...validValues,
          shortTermRetentionDays: "1.5",
        }).shortTermRetentionDays,
      ).toBe("Must be a whole number");
    });
  });

  describe("GFS points (weekly, monthly, yearly)", () => {
    it("accepts the boundary value 0 for all three", () => {
      const result = validateWorkloadData({
        ...validValues,
        gfsWeekly: "0",
        gfsMonthly: "0",
        gfsYearly: "0",
      });
      expect(result.gfsWeekly).toBeUndefined();
      expect(result.gfsMonthly).toBeUndefined();
      expect(result.gfsYearly).toBeUndefined();
    });

    it("rejects a negative value", () => {
      expect(
        validateWorkloadData({ ...validValues, gfsWeekly: "-1" }).gfsWeekly,
      ).toBe("Must be 0 or greater");
    });

    it("rejects a non-integer value", () => {
      expect(
        validateWorkloadData({ ...validValues, gfsMonthly: "1.5" }).gfsMonthly,
      ).toBe("Must be a whole number");
    });

    it("rejects an empty value", () => {
      expect(
        validateWorkloadData({ ...validValues, gfsYearly: "" }).gfsYearly,
      ).toBe("Required");
    });
  });

  describe("projectLengthYears", () => {
    it("accepts the boundary values 1 and 100", () => {
      expect(
        validateWorkloadData({ ...validValues, projectLengthYears: "1" })
          .projectLengthYears,
      ).toBeUndefined();
      expect(
        validateWorkloadData({ ...validValues, projectLengthYears: "100" })
          .projectLengthYears,
      ).toBeUndefined();
    });

    it("rejects 0 (the API's fall-back-to-growthRateScopeYears sentinel)", () => {
      expect(
        validateWorkloadData({ ...validValues, projectLengthYears: "0" })
          .projectLengthYears,
      ).toBe("Must be between 1 and 100");
    });

    it("rejects a value above 100", () => {
      expect(
        validateWorkloadData({ ...validValues, projectLengthYears: "101" })
          .projectLengthYears,
      ).toBe("Must be between 1 and 100");
    });

    it("rejects a non-integer value", () => {
      expect(
        validateWorkloadData({ ...validValues, projectLengthYears: "2.5" })
          .projectLengthYears,
      ).toBe("Must be a whole number");
    });

    it("rejects an empty value", () => {
      expect(
        validateWorkloadData({ ...validValues, projectLengthYears: "" })
          .projectLengthYears,
      ).toBe("Required");
    });
  });
});
