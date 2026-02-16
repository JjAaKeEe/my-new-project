import { describe, expect, it } from "vitest";
import { kg, tCO2e, usd } from "./panelValueChain";
import { hours, type SimulationResult } from "./simulatePanelFlow";
import {
  evaluateInvestment,
  IRR,
  NPV,
  PaybackPeriod,
  type EvaluateInvestmentInput,
} from "./investmentEvaluator";

const makeSimulationResult = (totalCostValue: number): SimulationResult => ({
  totalCost: usd(totalCostValue),
  totalTime: hours(1),
  totalEmissions: tCO2e(0),
  truckTrips: 1,
  materialRecovered: kg(1000),
});

describe("NPV", () => {
  it("computes discounted value for simple cash flows", () => {
    const result = NPV(0.1, [-100, 60, 60]);
    expect(result).toBeCloseTo(4.13223, 5);
  });
});

describe("PaybackPeriod", () => {
  it("computes fractional payback period", () => {
    const result = PaybackPeriod([-100, 40, 40, 40]);
    expect(result).toBeCloseTo(2.5, 6);
  });

  it("returns null when never paid back", () => {
    const result = PaybackPeriod([-100, 10, 10, 10]);
    expect(result).toBeNull();
  });
});

describe("IRR", () => {
  it("computes internal rate of return for simple cash flows", () => {
    const result = IRR([-100, 60, 60]);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(0.13066, 4);
  });
});

describe("evaluateInvestment", () => {
  it("compares baseline vs grinder purchase using simulation cash flows", () => {
    const input: EvaluateInvestmentInput = {
      discountRate: 0.1,
      baseline: {
        points: [
          { period: 1, simulationResult: makeSimulationResult(100), recoveredMaterialRevenue: usd(120) },
          { period: 2, simulationResult: makeSimulationResult(100), recoveredMaterialRevenue: usd(120) },
          { period: 3, simulationResult: makeSimulationResult(100), recoveredMaterialRevenue: usd(120) },
        ],
      },
      grinderPurchase: {
        initialInvestment: usd(100),
        points: [
          { period: 1, simulationResult: makeSimulationResult(80), recoveredMaterialRevenue: usd(170) },
          { period: 2, simulationResult: makeSimulationResult(80), recoveredMaterialRevenue: usd(170) },
          { period: 3, simulationResult: makeSimulationResult(80), recoveredMaterialRevenue: usd(170) },
        ],
      },
    };

    const result = evaluateInvestment(input);

    expect(result.baseline.cashFlows).toEqual([0, 20, 20, 20]);
    expect(result.grinderPurchase.cashFlows).toEqual([-100, 90, 90, 90]);
    expect(result.incremental.cashFlows).toEqual([-100, 70, 70, 70]);

    expect(result.grinderPurchase.npv).toBeGreaterThan(result.baseline.npv);
    expect(result.incremental.npv).toBeGreaterThan(0);
    expect(result.preferredOption).toBe("grinderPurchase");
    expect(result.incremental.paybackPeriod).toBeCloseTo(1.42857, 4);
  });
});

