import { describe, expect, it } from "vitest";
import {
  buildSensitivityGrid,
  buildSensitivityResponse,
  sensitivityRequestSchema,
  type SensitivityRequestPayload,
} from "./simulation";

const basePayload: SensitivityRequestPayload = {
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
  ranges: {
    haulDistancePerTrip: { start: 20, end: 40, step: 20 },
    reuseUptakeRate: { start: 0, end: 1, step: 0.5 },
    grinderUtilization: { start: 0.8, end: 1, step: 0.2 },
  },
};

describe("sensitivityRequestSchema", () => {
  it("rejects payloads that provide both grinder axes", () => {
    const result = sensitivityRequestSchema.safeParse({
      ...basePayload,
      ranges: {
        ...basePayload.ranges,
        grinderThroughputKgPerHour: { start: 1500, end: 2500, step: 500 },
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts payloads with throughput axis only", () => {
    const result = sensitivityRequestSchema.safeParse({
      ...basePayload,
      ranges: {
        haulDistancePerTrip: { start: 20, end: 20, step: 1 },
        reuseUptakeRate: { start: 0, end: 0.5, step: 0.5 },
        grinderThroughputKgPerHour: { start: 1500, end: 2500, step: 500 },
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("buildSensitivityResponse", () => {
  it("returns deterministic results for the same payload and trace id", () => {
    const payload = sensitivityRequestSchema.parse(basePayload);
    const a = buildSensitivityResponse(payload, "trace-fixed");
    const b = buildSensitivityResponse(payload, "trace-fixed");

    expect(a).toEqual(b);
    expect(a.traceId).toBe("trace-fixed");
    expect(a.grid.grinderAxis.mode).toBe("utilization");
    expect(a.dataset).toHaveLength(12);
    expect(a.penaltyProxy.note).toContain("assumption");
  });
});

describe("buildSensitivityGrid", () => {
  it("shows non-increasing virgin aggregate emissions as reuse increases", () => {
    const payload = sensitivityRequestSchema.parse({
      ...basePayload,
      ranges: {
        haulDistancePerTrip: { start: 30, end: 30, step: 1 },
        reuseUptakeRate: { start: 0, end: 1, step: 0.5 },
        grinderUtilization: { start: 1, end: 1, step: 0.1 },
      },
      expeditePenaltyProxy: {
        enabled: false,
      },
    });

    const grid = buildSensitivityGrid(payload);
    const ordered = [...grid.points].sort(
      (a, b) => a.point.reuseUptakeRate - b.point.reuseUptakeRate,
    );

    for (let idx = 1; idx < ordered.length; idx += 1) {
      expect(
        ordered[idx].diagnostics.scenarioVirginAggregateEmissionsTonsCO2e,
      ).toBeLessThanOrEqual(
        ordered[idx - 1].diagnostics.scenarioVirginAggregateEmissionsTonsCO2e +
          1e-9,
      );

      expect(ordered[idx].point.emissionsAvoidedTonsCO2e).toBeGreaterThanOrEqual(
        ordered[idx - 1].point.emissionsAvoidedTonsCO2e - 1e-9,
      );
    }
  });
});
