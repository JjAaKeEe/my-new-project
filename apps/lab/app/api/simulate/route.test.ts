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
};

describe("POST /api/simulate", () => {
  it("returns 200 for valid payload", async () => {
    const request = new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    const body = (await response.json()) as { traceId: string };

    expect(response.status).toBe(200);
    expect(typeof body.traceId).toBe("string");
    expect(body.traceId.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid payload", async () => {
    const request = new Request("http://localhost/api/simulate", {
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
