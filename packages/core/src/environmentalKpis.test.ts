import { describe, expect, it } from "vitest";
import { kg, tCO2e, usd } from "./panelValueChain";
import {
  computeCO2Avoided,
  computeCarbonCapturePotential,
  computeTruckMilesAvoided,
  miles,
} from "./environmentalKpis";
import { hours, type SimulationResult } from "./simulatePanelFlow";

const simulationResult: SimulationResult = {
  totalCost: usd(1120),
  totalTime: hours(9.25),
  totalEmissions: tCO2e(0.75),
  truckTrips: 5,
  materialRecovered: kg(7500),
};

describe("environmental KPI functions", () => {
  it("computes CO2 avoided using default factors", () => {
    const result = computeCO2Avoided(simulationResult);
    expect(result).toBeCloseTo(0.15, 6);
  });

  it("computes carbon capture potential using default factors", () => {
    const result = computeCarbonCapturePotential(simulationResult);
    expect(result).toBeCloseTo(0.225, 6);
  });

  it("computes truck miles avoided using default factors", () => {
    const result = computeTruckMilesAvoided(simulationResult);
    expect(result).toBeCloseTo(60, 6);
  });

  it("supports factor overrides", () => {
    const co2 = computeCO2Avoided(simulationResult, {
      co2AvoidedPerKgRecovered: tCO2e(0.0002),
    });
    const capture = computeCarbonCapturePotential(simulationResult, {
      carbonCapturePotentialPerKgRecovered: tCO2e(0.00005),
    });
    const milesAvoided = computeTruckMilesAvoided(simulationResult, {
      baselineTruckMilesPerTrip: miles(50),
      optimizedTruckMilesPerTrip: miles(35),
    });

    expect(co2).toBeCloseTo(0.75, 6);
    expect(capture).toBeCloseTo(0.375, 6);
    expect(milesAvoided).toBeCloseTo(75, 6);
  });

  it("floors CO2 avoided at zero when operational emissions exceed avoided emissions", () => {
    const result = computeCO2Avoided(
      { ...simulationResult, totalEmissions: tCO2e(3) },
      { co2AvoidedPerKgRecovered: tCO2e(0.0001) },
    );
    expect(result).toBe(0);
  });

  it("throws on invalid negative factor values", () => {
    expect(() =>
      computeCarbonCapturePotential(simulationResult, {
        carbonCapturePotentialPerKgRecovered: tCO2e(-0.00001),
      }),
    ).toThrow(/carbonCapturePotentialPerKgRecovered must be >= 0/);
  });
});

