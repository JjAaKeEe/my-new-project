import { describe, expect, it } from "vitest";
import { kg, tCO2e, usd } from "../panelValueChain";
import { hours, type SimulationResult } from "../simulatePanelFlow";
import { showYourWork } from "./showYourWork";

const sampleResult: SimulationResult = {
  totalCost: usd(1010),
  totalTime: hours(9),
  totalEmissions: tCO2e(0.55),
  truckTrips: 5,
  materialRecovered: kg(8200),
};

describe("showYourWork", () => {
  it("returns deterministic worksheet and EMBA-ready narrative for a sample panel", () => {
    const reportA = showYourWork(sampleResult);
    const reportB = showYourWork(sampleResult);

    expect(reportA).toEqual(reportB);
    expect(reportA.worksheet).toMatchSnapshot();
    expect(reportA.narrative).toMatchSnapshot();
  });
});
