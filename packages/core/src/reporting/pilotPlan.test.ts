import { describe, expect, it } from "vitest";
import { generatePilotPlan, type PilotPlanInput } from "./pilotPlan";

const sampleInput: PilotPlanInput = {
  scenarioOptions: {
    mode: "grinder+reuse",
    reuseUptakeRate: 0.4,
    specReadiness: 0.72,
    grinderUtilization: 0.84,
  },
  metrics: {
    truckTripsAvoidedPerPanel: 1.3,
    tonsDivertedPerPanel: 0.82,
    marginDeltaUsdPerPanel: 36.5,
    co2AvoidedTonsPerPanel: 0.038,
  },
};

describe("generatePilotPlan", () => {
  it("returns a deterministic 4-8 week pilot narrative for a sample scenario", () => {
    const planA = generatePilotPlan(sampleInput);
    const planB = generatePilotPlan(sampleInput);

    expect(planA).toEqual(planB);
    expect(planA.durationWeeks).toBe(7);
    expect(planA.panelsPerWeek).toBe(2);
    expect(planA.totalPanels).toBe(14);
    expect(planA.selectedMetrics.map((metric) => metric.id)).toEqual([
      "tonsDiverted",
      "marginDeltaUsdPerPanel",
      "co2Avoided",
    ]);
    expect(planA.paragraph).toBe(
      "A 7-week pilot will run in a single corridor at 2 panels/week (14 panels total) for the grinder+reuse scenario with a 40.0% reuse target and 72.0% spec readiness. Primary metrics are tons diverted (0.820 tons/panel; 11.480 tons total), $/panel margin delta ($36.50/panel; $511.00 total), and CO2 avoided (0.0380 tons/panel; 0.5320 tons total). Data will be reconciled from tickets, scale slips, dispatch logs, batch tickets for an auditable weekly readout. The key tradeoff is quality/spec compliance; mitigation is locking gradation bands, running hold-point tests on early pours, and routing out-of-spec grind to non-structural use to protect schedule.",
    );
  });
});
