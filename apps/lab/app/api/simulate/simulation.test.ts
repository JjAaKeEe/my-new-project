import { describe, expect, it } from "vitest";
import {
  buildSimulationResponse,
  simulateRequestSchema,
  type SimulateRequestPayload,
} from "./simulation";

const basePayload: SimulateRequestPayload = {
  unitOfWork: {
    inboundMaterial: 10000,
    haulDistancePerTrip: 30,
  },
  costDrivers: {
    truckCapacity: 2000,
    haulCostPerKm: 3,
    laborCostPerHour: 40,
    crusherProcessingCostPerKg: 0.02,
    grinderProcessingCostPerKg: 0.03,
    crusherThroughputKgPerHour: 2500,
    grinderThroughputKgPerHour: 2000,
  },
  sustainabilityDrivers: {
    haulEmissionsPerKm: 0.001,
    crusherEmissionsPerKg: 0.00004,
    grinderEmissionsPerKg: 0.00006,
    crusherRecoveryRate: 0.82,
    grinderRecoveryRate: 0.75,
  },
};

describe("simulateRequestSchema", () => {
  it("rejects invalid request payloads", () => {
    const result = simulateRequestSchema.safeParse({
      unitOfWork: {},
      costDrivers: {},
      sustainabilityDrivers: {},
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid payload and applies defaults", () => {
    const result = simulateRequestSchema.parse(basePayload);

    expect(result.unitOfWork.inboundMaterial).toBe(10000);
    expect(result.scenarioOptions).toBeUndefined();
    expect(result.emissionsFactors).toBeUndefined();
  });
});

describe("buildSimulationResponse", () => {
  it("returns baseline golden response", () => {
    const payload = simulateRequestSchema.parse(basePayload);
    const response = buildSimulationResponse(payload, "trace-baseline");

    expect(response.traceId).toBe("trace-baseline");

    expect(response.inputsEcho.scenarioOptions.mode).toBe("baseline");
    expect(response.inputsEcho.scenarioOptions.reuseUptakeRate).toBe(0);

    expect(response.outputs.costUsd).toBeCloseTo(980, 6);
    expect(response.outputs.timeHours).toBeCloseTo(8.25, 6);
    expect(response.outputs.truckTrips).toBe(5);
    expect(response.outputs.materialFlows.inboundKg).toBeCloseTo(10000, 6);
    expect(response.outputs.materialFlows.recoveredKg).toBeCloseTo(8200, 6);
    expect(response.outputs.materialFlows.residualKg).toBeCloseTo(1800, 6);
    expect(response.outputs.materialFlows.estimatedReuseUptakeKg).toBeCloseTo(0, 6);
    expect(response.outputs.materialFlows.landfillKg).toBeCloseTo(1800, 6);

    expect(response.emissions.operationalTonsCO2e).toBeCloseTo(0.55, 6);
    expect(response.emissions.avoidedTonsCO2e).toBeCloseTo(0.434, 6);
    expect(response.emissions.estimatedUptakeTonsCO2e).toBeCloseTo(0.246, 6);
    expect(response.emissions.baselineOperationalTonsCO2e).toBeCloseTo(0.55, 6);
    expect(response.emissions.operationalDeltaTonsCO2e).toBeCloseTo(0, 6);

    expect(response.financialDeltas.baselineCostUsd).toBeCloseTo(980, 6);
    expect(response.financialDeltas.scenarioCostUsd).toBeCloseTo(980, 6);
    expect(response.financialDeltas.deltaCostUsd).toBeCloseTo(0, 6);
    expect(response.financialDeltas.baselineCostPerRecoveredKg).toBeCloseTo(
      980 / 8200,
      8,
    );
    expect(response.financialDeltas.scenarioCostPerRecoveredKg).toBeCloseTo(
      980 / 8200,
      8,
    );
    expect(response.financialDeltas.deltaCostPerRecoveredKg).toBeCloseTo(0, 8);
    expect(response.audit.worksheet.input.totalCostUsd).toBeCloseTo(980, 6);
    expect(response.audit.methodology).toContain("Methodology");

    expect(response.assumptionsUsed.map((item) => item.name)).toEqual([
      "scenarioOptions.mode",
      "emissionsFactors.co2AvoidedPerKgRecovered",
      "emissionsFactors.carbonCapturePotentialPerKgRecovered",
      "emissionsFactors.baselineTruckMilesPerTrip",
      "emissionsFactors.optimizedTruckMilesPerTrip",
      "simulationOptions.truckSpeedKmPerHour",
      "simulationOptions.loadUnloadHoursPerTrip",
    ]);
  });

  it("returns grinder+reuse golden response with factor overrides", () => {
    const payload = simulateRequestSchema.parse({
      ...basePayload,
      scenarioOptions: {
        mode: "grinder+reuse",
        reuseUptakeRate: 0.4,
      },
      emissionsFactors: {
        co2AvoidedPerKgRecovered: 0.0002,
        carbonCapturePotentialPerKgRecovered: 0.00005,
      },
    });

    const response = buildSimulationResponse(payload, "trace-grinder-reuse");

    expect(response.traceId).toBe("trace-grinder-reuse");
    expect(response.inputsEcho.scenarioOptions.mode).toBe("grinder+reuse");
    expect(response.inputsEcho.scenarioOptions.reuseUptakeRate).toBeCloseTo(0.4, 6);

    expect(response.outputs.costUsd).toBeCloseTo(1120, 6);
    expect(response.outputs.timeHours).toBeCloseTo(9.25, 6);
    expect(response.outputs.truckTrips).toBe(5);
    expect(response.outputs.materialFlows.recoveredKg).toBeCloseTo(7500, 6);
    expect(response.outputs.materialFlows.residualKg).toBeCloseTo(2500, 6);
    expect(response.outputs.materialFlows.estimatedReuseUptakeKg).toBeCloseTo(1000, 6);
    expect(response.outputs.materialFlows.landfillKg).toBeCloseTo(1500, 6);

    expect(response.emissions.operationalTonsCO2e).toBeCloseTo(0.75, 6);
    expect(response.emissions.avoidedTonsCO2e).toBeCloseTo(0.75, 6);
    expect(response.emissions.estimatedUptakeTonsCO2e).toBeCloseTo(0.425, 6);
    expect(response.emissions.baselineOperationalTonsCO2e).toBeCloseTo(0.55, 6);
    expect(response.emissions.operationalDeltaTonsCO2e).toBeCloseTo(0.2, 6);

    expect(response.financialDeltas.baselineCostUsd).toBeCloseTo(980, 6);
    expect(response.financialDeltas.scenarioCostUsd).toBeCloseTo(1120, 6);
    expect(response.financialDeltas.deltaCostUsd).toBeCloseTo(140, 6);
    expect(response.financialDeltas.baselineCostPerRecoveredKg).toBeCloseTo(
      980 / 8200,
      8,
    );
    expect(response.financialDeltas.scenarioCostPerRecoveredKg).toBeCloseTo(
      1120 / 7500,
      8,
    );
    expect(response.financialDeltas.deltaCostPerRecoveredKg).toBeCloseTo(
      1120 / 7500 - 980 / 8200,
      8,
    );
    expect(response.audit.worksheet.input.totalCostUsd).toBeCloseTo(1120, 6);
    expect(response.audit.methodology).toContain("Methodology");

    expect(response.assumptionsUsed.map((item) => item.name)).toEqual([
      "emissionsFactors.baselineTruckMilesPerTrip",
      "emissionsFactors.optimizedTruckMilesPerTrip",
      "simulationOptions.truckSpeedKmPerHour",
      "simulationOptions.loadUnloadHoursPerTrip",
    ]);
  });
});
