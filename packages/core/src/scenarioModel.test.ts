import { describe, expect, it } from "vitest";
import { kg, km, tCO2e, usd } from "./panelValueChain";
import { analyzeScenario, type ScenarioAssumptions, type ScenarioInput } from "./scenarioModel";

const assumptions: ScenarioAssumptions = {
  truckSpeedKmPerHour: 60,
  loadUnloadHoursPerTrip: 0.5,
  recoveredMaterialPricePerKg: 0.06,
  carbonCreditPricePerTonCO2e: 45,
  co2AvoidedPerKgRecovered: 0.00012,
  carbonCapturePotentialPerKgRecovered: 0.00003,
  baselineTruckMilesPerTrip: 42,
  optimizedTruckMilesPerTrip: 30,
};

const makeInput = (mode: "Crusher" | "Grinder"): ScenarioInput => ({
  mode,
  assumptions,
  unitOfWork: {
    inboundMaterial: kg(10000),
    haulDistancePerTrip: km(30),
  },
  costDrivers: {
    truckCapacity: kg(2000),
    haulCostPerKm: usd(3),
    laborCostPerHour: usd(40),
    crusherProcessingCostPerKg: usd(0.02),
    grinderProcessingCostPerKg: usd(0.03),
    crusherThroughputKgPerHour: kg(2500),
    grinderThroughputKgPerHour: kg(2000),
  },
  sustainabilityDrivers: {
    haulEmissionsPerKm: tCO2e(0.001),
    crusherEmissionsPerKg: tCO2e(0.00004),
    grinderEmissionsPerKg: tCO2e(0.00006),
    crusherRecoveryRate: 0.82,
    grinderRecoveryRate: 0.75,
  },
});

describe("analyzeScenario", () => {
  it("returns deterministic crusher analysis with explicit traceable assumptions", () => {
    const result = analyzeScenario(makeInput("Crusher"));

    expect(result.simulationResult.totalCost).toBeCloseTo(1010, 6);
    expect(result.simulationResult.totalEmissions).toBeCloseTo(0.55, 6);
    expect(result.simulationResult.materialRecovered).toBeCloseTo(8200, 6);

    expect(result.costBreakdown.haulCost).toBeCloseTo(450, 6);
    expect(result.costBreakdown.processingCost).toBeCloseTo(200, 6);
    expect(result.costBreakdown.laborCost).toBeCloseTo(360, 6);

    expect(result.environmentalKpis.co2Avoided).toBeCloseTo(0.434, 6);
    expect(result.environmentalKpis.carbonCapturePotential).toBeCloseTo(0.246, 6);
    expect(result.environmentalKpis.truckMilesAvoided).toBeCloseTo(60, 6);
    expect(result.environmentalKpis.avoidedEmissionPercentage).toBeCloseTo(78.90909, 4);

    expect(result.financialMetrics.materialRevenue).toBeCloseTo(492, 6);
    expect(result.financialMetrics.carbonCreditRevenue).toBeCloseTo(19.53, 6);
    expect(result.financialMetrics.totalRevenue).toBeCloseTo(511.53, 6);
    expect(result.financialMetrics.netCashFlow).toBeCloseTo(-498.47, 6);

    expect(result.assumptionTrace).toHaveLength(8);
    expect(result.assumptionTrace.map((item) => item.name)).toEqual([
      "truckSpeedKmPerHour",
      "loadUnloadHoursPerTrip",
      "recoveredMaterialPricePerKg",
      "carbonCreditPricePerTonCO2e",
      "co2AvoidedPerKgRecovered",
      "carbonCapturePotentialPerKgRecovered",
      "baselineTruckMilesPerTrip",
      "optimizedTruckMilesPerTrip",
    ]);
  });

  it("reflects grinder mode semantics without changing core simulation behavior", () => {
    const result = analyzeScenario(makeInput("Grinder"));

    expect(result.simulationResult.totalCost).toBeCloseTo(1150, 6);
    expect(result.simulationResult.totalEmissions).toBeCloseTo(0.75, 6);
    expect(result.simulationResult.materialRecovered).toBeCloseTo(7500, 6);

    expect(result.costBreakdown.processingCost).toBeCloseTo(300, 6);
    expect(result.emissionsBreakdown.processingEmissions).toBeCloseTo(0.6, 6);
  });

  it("throws for non-positive operational assumptions", () => {
    expect(() =>
      analyzeScenario({
        ...makeInput("Crusher"),
        assumptions: { ...assumptions, truckSpeedKmPerHour: 0 },
      }),
    ).toThrow(/truckSpeedKmPerHour must be > 0/);
  });
});
