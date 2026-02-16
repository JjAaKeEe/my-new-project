import { describe, expect, it } from "vitest";
import { kg, km, tCO2e, usd } from "./panelValueChain";
import { analyzeScenario, type ScenarioInput } from "./scenarioModel";
import {
  generateAcademicSustainabilityReport,
  type AcademicReportInput,
} from "./reportGenerator";

const scenarioInput: ScenarioInput = {
  mode: "Crusher",
  assumptions: {
    truckSpeedKmPerHour: 60,
    loadUnloadHoursPerTrip: 0.5,
    recoveredMaterialPricePerKg: 0.06,
    carbonCreditPricePerTonCO2e: 45,
    co2AvoidedPerKgRecovered: 0.00012,
    carbonCapturePotentialPerKgRecovered: 0.00003,
    baselineTruckMilesPerTrip: 42,
    optimizedTruckMilesPerTrip: 30,
  },
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
};

describe("generateAcademicSustainabilityReport", () => {
  it("outputs all required academic sections and deterministic markdown", () => {
    const scenario = analyzeScenario(scenarioInput);
    const input: AcademicReportInput = {
      problemContext:
        "The region needs to reduce panel waste sent to landfill while improving process economics.",
      wasteBaseline:
        "Historically, panel waste was landfilled with limited material recovery and higher routing distance.",
      scenario,
      baselineReference: {
        totalCost: usd(1300),
        totalEmissions: tCO2e(0.95),
        materialRecovered: kg(2000),
        truckTrips: 8,
      },
      investmentMetrics: {
        npv: usd(25000),
        irr: 0.17,
        paybackPeriod: 2.8,
      },
    };

    const report = generateAcademicSustainabilityReport(input);

    expect(report.sections).toHaveLength(6);
    expect(report.sections.map((s) => s.id)).toEqual([
      "problemContext",
      "wasteBaseline",
      "simulationResults",
      "quantifiedImpact",
      "environmentalKpis",
      "investmentMetrics",
    ]);

    expect(report.markdown).toContain("## Problem Context");
    expect(report.markdown).toContain("## Waste Baseline");
    expect(report.markdown).toContain("## Simulation Results");
    expect(report.markdown).toContain("## Quantified Impact");
    expect(report.markdown).toContain("## Environmental KPIs");
    expect(report.markdown).toContain("## Investment Metrics");

    expect(report.markdown).toContain("1,010.00 USD");
    expect(report.markdown).toContain("0.5500 tCO2e");
    expect(report.markdown).toContain("25,000.00 USD");
  });
});
