import { describe, expect, it } from "vitest";
import { kg, km, tCO2e, usd } from "./panelValueChain";
import {
  simulatePanelFlow,
  type CostDrivers,
  type SustainabilityDrivers,
  type UnitOfWork,
} from "./simulatePanelFlow";

const unitOfWork: UnitOfWork = {
  inboundMaterial: kg(10000),
  haulDistancePerTrip: km(30),
};

const costDrivers: CostDrivers = {
  truckCapacity: kg(2000),
  haulCostPerKm: usd(3),
  laborCostPerHour: usd(40),
  crusherProcessingCostPerKg: usd(0.02),
  grinderProcessingCostPerKg: usd(0.03),
  crusherThroughputKgPerHour: kg(2500),
  grinderThroughputKgPerHour: kg(2000),
};

const sustainabilityDrivers: SustainabilityDrivers = {
  haulEmissionsPerKm: tCO2e(0.001),
  crusherEmissionsPerKg: tCO2e(0.00004),
  grinderEmissionsPerKg: tCO2e(0.00006),
  crusherRecoveryRate: 0.82,
  grinderRecoveryRate: 0.75,
};

describe("simulatePanelFlow", () => {
  it("computes crusher simulation outputs", () => {
    const result = simulatePanelFlow(
      unitOfWork,
      costDrivers,
      sustainabilityDrivers,
      { useCrusher: true, truckSpeedKmPerHour: 60, loadUnloadHoursPerTrip: 0.5 },
    );

    expect(result.truckTrips).toBe(5);
    expect(result.totalTime).toBeCloseTo(9, 6);
    expect(result.totalCost).toBeCloseTo(1010, 6);
    expect(result.totalEmissions).toBeCloseTo(0.55, 6);
    expect(result.materialRecovered).toBeCloseTo(8200, 6);
  });

  it("computes grinder simulation outputs with default options", () => {
    const result = simulatePanelFlow(
      unitOfWork,
      costDrivers,
      sustainabilityDrivers,
      { useCrusher: false },
    );

    expect(result.truckTrips).toBe(5);
    expect(result.totalTime).toBeCloseTo(9.25, 6);
    expect(result.totalCost).toBeCloseTo(1120, 6);
    expect(result.totalEmissions).toBeCloseTo(0.75, 6);
    expect(result.materialRecovered).toBeCloseTo(7500, 6);
  });

  it("rounds up truck trips for partial loads", () => {
    const result = simulatePanelFlow(
      { inboundMaterial: kg(2001), haulDistancePerTrip: km(10) },
      costDrivers,
      sustainabilityDrivers,
      { useCrusher: true, truckSpeedKmPerHour: 50, loadUnloadHoursPerTrip: 0.25 },
    );

    expect(result.truckTrips).toBe(2);
  });

  it("rejects invalid recovery rates", () => {
    expect(() =>
      simulatePanelFlow(unitOfWork, costDrivers, { ...sustainabilityDrivers, crusherRecoveryRate: 1.2 }, { useCrusher: true }),
    ).toThrow(/crusherRecoveryRate must be between 0 and 1/);
  });
});
