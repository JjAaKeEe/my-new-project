import { usd, type USD } from "./panelValueChain";
import { type SimulationResult } from "./simulatePanelFlow";

export interface SimulationCashFlowPoint {
  period: number;
  simulationResult: SimulationResult;
  recoveredMaterialRevenue: USD;
  otherCashFlow?: USD;
}

export interface InvestmentScenarioInput {
  points: SimulationCashFlowPoint[];
  initialInvestment?: USD;
}

export interface ScenarioFinancialMetrics {
  cashFlows: number[];
  npv: USD;
  irr: number | null;
  paybackPeriod: number | null;
}

export interface EvaluateInvestmentInput {
  discountRate: number;
  baseline: InvestmentScenarioInput;
  grinderPurchase: InvestmentScenarioInput;
}

export interface InvestmentComparisonResult {
  baseline: ScenarioFinancialMetrics;
  grinderPurchase: ScenarioFinancialMetrics;
  incremental: ScenarioFinancialMetrics;
  preferredOption: "baseline" | "grinderPurchase" | "tie";
}

const toNumber = (value: number): number => value;

const seriesFromScenario = (scenario: InvestmentScenarioInput): {
  periods: number[];
  netByPeriod: Map<number, number>;
  cashFlows: number[];
} => {
  const netByPeriod = new Map<number, number>();
  for (const point of scenario.points) {
    if (point.period < 1 || !Number.isInteger(point.period)) {
      throw new Error("period must be a positive integer starting at 1");
    }
    const net =
      toNumber(point.recoveredMaterialRevenue) -
      toNumber(point.simulationResult.totalCost) +
      toNumber(point.otherCashFlow ?? usd(0));
    netByPeriod.set(point.period, (netByPeriod.get(point.period) ?? 0) + net);
  }

  const periods = [...netByPeriod.keys()].sort((a, b) => a - b);
  const rawInitial = -toNumber(scenario.initialInvestment ?? usd(0));
  const initial = Object.is(rawInitial, -0) ? 0 : rawInitial;
  const cashFlows = [initial, ...periods.map((period) => netByPeriod.get(period) ?? 0)];
  return { periods, netByPeriod, cashFlows };
};

export const NPV = (discountRate: number, cashFlows: readonly number[]): number => {
  if (discountRate <= -1) {
    throw new Error("discountRate must be greater than -1");
  }
  return cashFlows.reduce(
    (acc, cashFlow, periodIndex) => acc + cashFlow / (1 + discountRate) ** periodIndex,
    0,
  );
};

export const PaybackPeriod = (cashFlows: readonly number[]): number | null => {
  if (cashFlows.length === 0) {
    return null;
  }

  let cumulative = cashFlows[0];
  if (cumulative >= 0) {
    return 0;
  }

  for (let i = 1; i < cashFlows.length; i += 1) {
    const previous = cumulative;
    cumulative += cashFlows[i];
    if (cumulative >= 0) {
      if (cashFlows[i] <= 0) {
        return i;
      }
      const fraction = -previous / cashFlows[i];
      return (i - 1) + fraction;
    }
  }

  return null;
};

export const IRR = (
  cashFlows: readonly number[],
  maxIterations = 200,
  tolerance = 1e-7,
): number | null => {
  if (cashFlows.length < 2) {
    return null;
  }

  const hasPositive = cashFlows.some((value) => value > 0);
  const hasNegative = cashFlows.some((value) => value < 0);
  if (!hasPositive || !hasNegative) {
    return null;
  }

  const f = (rate: number): number => NPV(rate, cashFlows);
  let low = -0.9999;
  let high = 1;
  let fLow = f(low);
  let fHigh = f(high);

  let expansions = 0;
  while (fLow * fHigh > 0 && expansions < 20) {
    high *= 2;
    fHigh = f(high);
    expansions += 1;
  }

  if (fLow * fHigh > 0) {
    return null;
  }

  for (let i = 0; i < maxIterations; i += 1) {
    const mid = (low + high) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < tolerance) {
      return mid;
    }
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }

  return (low + high) / 2;
};

const makeMetrics = (discountRate: number, cashFlows: number[]): ScenarioFinancialMetrics => ({
  cashFlows,
  npv: usd(NPV(discountRate, cashFlows)),
  irr: IRR(cashFlows),
  paybackPeriod: PaybackPeriod(cashFlows),
});

export const evaluateInvestment = (
  input: EvaluateInvestmentInput,
): InvestmentComparisonResult => {
  const baseline = seriesFromScenario(input.baseline);
  const grinder = seriesFromScenario(input.grinderPurchase);

  const allPeriods = [...new Set([...baseline.periods, ...grinder.periods])].sort(
    (a, b) => a - b,
  );

  const incrementalInitial =
    -toNumber(input.grinderPurchase.initialInvestment ?? usd(0)) +
    toNumber(input.baseline.initialInvestment ?? usd(0));
  const incrementalCashFlows = [
    incrementalInitial,
    ...allPeriods.map(
      (period) =>
        (grinder.netByPeriod.get(period) ?? 0) - (baseline.netByPeriod.get(period) ?? 0),
    ),
  ];

  const baselineMetrics = makeMetrics(input.discountRate, baseline.cashFlows);
  const grinderMetrics = makeMetrics(input.discountRate, grinder.cashFlows);
  const incrementalMetrics = makeMetrics(input.discountRate, incrementalCashFlows);

  const preferredOption =
    grinderMetrics.npv > baselineMetrics.npv
      ? "grinderPurchase"
      : grinderMetrics.npv < baselineMetrics.npv
        ? "baseline"
        : "tie";

  return {
    baseline: baselineMetrics,
    grinderPurchase: grinderMetrics,
    incremental: incrementalMetrics,
    preferredOption,
  };
};
