import { describe, expect, it } from "vitest";
import { POST } from "./route";

const validPayload = {
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

describe("POST /api/sensitivity", () => {
  it("returns 200 and compact dataset for valid payload", async () => {
    const request = new Request("http://localhost/api/sensitivity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    const body = (await response.json()) as {
      traceId: string;
      dataset: Array<{
        costDeltaUsd: number;
        emissionsAvoidedTonsCO2e: number;
        paybackDays: number | null;
      }>;
    };

    expect(response.status).toBe(200);
    expect(typeof body.traceId).toBe("string");
    expect(body.dataset.length).toBe(12);
    expect(typeof body.dataset[0].costDeltaUsd).toBe("number");
    expect(typeof body.dataset[0].emissionsAvoidedTonsCO2e).toBe("number");
    expect(
      body.dataset[0].paybackDays === null ||
        typeof body.dataset[0].paybackDays === "number",
    ).toBe(true);
  });

  it("returns 400 for invalid payload", async () => {
    const request = new Request("http://localhost/api/sensitivity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitOfWork: {} }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(typeof body.error).toBe("string");
  });
});
