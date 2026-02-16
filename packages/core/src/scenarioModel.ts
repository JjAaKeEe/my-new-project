import { tCO2e, usd, type Kilograms, type TonsCO2e, type USD } from "./panelValueChain";
import {
  computeCO2Avoided,
  computeCarbonCapturePotential,
  computeTruckMilesAvoided,
  miles,
  type EnvironmentalKpiFactors,
  type Miles,
} from "./environmentalKpis";
import {
  simulatePanelFlow,
  type CostDrivers,
  type SimulationResult,
  type SustainabilityDrivers,
  type UnitOfWork,
} from "./simulatePanelFlow";

export type ScenarioMode = "Crusher" | "Grinder";

export type AssumptionCategory = "operational" | "financial" | "environmental";

export interface ScenarioAssumptionTraceItem {
  name:
    | "truckSpeedKmPerHour"
    | "loadUnloadHoursPerTrip"
    | "recoveredMaterialPricePerKg"
    | "carbonCreditPricePerTonCO2e"
    | "co2AvoidedPerKgRecovered"
    | "carbonCapturePotentialPerKgRecovered"
    | "baselineTruckMilesPerTrip"
    | "optimizedTruckMilesPerTrip";
  category: AssumptionCategory;
  unit: string;
  value: number;
}

export interface ScenarioAssumptions {
  truckSpeedKmPerHour: number;
  loadUnloadHoursPerTrip: number;
  recoveredMaterialPricePerKg: number;
  carbonCreditPricePerTonCO2e: number;
  co2AvoidedPerKgRecovered: number;
  carbonCapturePotentialPerKgRecovered: number;
  baselineTruckMilesPerTrip: number;
  optimizedTruckMilesPerTrip: number;
}

export interface ScenarioInput {
  mode: ScenarioMode;
  unitOfWork: UnitOfWork;
  costDrivers: CostDrivers;
  sustainabilityDrivers: SustainabilityDrivers;
  assumptions: ScenarioAssumptions;
}

export interface ScenarioCostBreakdown {
  haulCost: USD;
  processingCost: USD;
  laborCost: USD;
  totalCost: USD;
}

export interface ScenarioEmissionsBreakdown {
  haulEmissions: TonsCO2e;
  processingEmissions: TonsCO2e;
  totalEmissions: TonsCO2e;
}

export interface ScenarioEnvironmentalKpis {
  co2Avoided: TonsCO2e;
  carbonCapturePotential: TonsCO2e;
  truckMilesAvoided: Miles;
  avoidedEmissionPercentage: number;
}

export interface ScenarioRevenueMetrics {
  materialRevenue: USD;
  carbonCreditRevenue: USD;
  totalRevenue: USD;
  netCashFlow: USD;
  costPerKgRecovered: number | null;
  grossMarginPercentage: number | null;
}

export interface ScenarioAnalysisResult {
  mode: ScenarioMode;
  simulationResult: SimulationResult;
  costBreakdown: ScenarioCostBreakdown;
  emissionsBreakdown: ScenarioEmissionsBreakdown;
  environmentalKpis: ScenarioEnvironmentalKpis;
  financialMetrics: ScenarioRevenueMetrics;
  assumptionTrace: readonly ScenarioAssumptionTraceItem[];
}

const toNumber = (value: number): number => value;

const validatePositive = (value: number, name: string): void => {
  if (value <= 0) {
    throw new Error(`${name} must be > 0`);
  }
};

const validateNonNegative = (value: number, name: string): void => {
  if (value < 0) {
    throw new Error(`${name} must be >= 0`);
  }
};

const validateAssumptions = (assumptions: ScenarioAssumptions): void => {
  validatePositive(assumptions.truckSpeedKmPerHour, "truckSpeedKmPerHour");
  validatePositive(assumptions.loadUnloadHoursPerTrip, "loadUnloadHoursPerTrip");
  validateNonNegative(assumptions.recoveredMaterialPricePerKg, "recoveredMaterialPricePerKg");
  validateNonNegative(assumptions.carbonCreditPricePerTonCO2e, "carbonCreditPricePerTonCO2e");
  validateNonNegative(assumptions.co2AvoidedPerKgRecovered, "co2AvoidedPerKgRecovered");
  validateNonNegative(
    assumptions.carbonCapturePotentialPerKgRecovered,
    "carbonCapturePotentialPerKgRecovered",
  );
  validateNonNegative(assumptions.baselineTruckMilesPerTrip, "baselineTruckMilesPerTrip");
  validateNonNegative(assumptions.optimizedTruckMilesPerTrip, "optimizedTruckMilesPerTrip");
};

const factorOverridesFromAssumptions = (
  assumptions: ScenarioAssumptions,
): Partial<EnvironmentalKpiFactors> => ({
  co2AvoidedPerKgRecovered: tCO2e(assumptions.co2AvoidedPerKgRecovered),
  carbonCapturePotentialPerKgRecovered: tCO2e(
    assumptions.carbonCapturePotentialPerKgRecovered,
  ),
  baselineTruckMilesPerTrip: miles(assumptions.baselineTruckMilesPerTrip),
  optimizedTruckMilesPerTrip: miles(assumptions.optimizedTruckMilesPerTrip),
});

const traceAssumptions = (assumptions: ScenarioAssumptions): ScenarioAssumptionTraceItem[] => [
  {
    name: "truckSpeedKmPerHour",
    category: "operational",
    unit: "km/hour",
    value: assumptions.truckSpeedKmPerHour,
  },
  {
    name: "loadUnloadHoursPerTrip",
    category: "operational",
    unit: "hours/trip",
    value: assumptions.loadUnloadHoursPerTrip,
  },
  {
    name: "recoveredMaterialPricePerKg",
    category: "financial",
    unit: "USD/kg",
    value: assumptions.recoveredMaterialPricePerKg,
  },
  {
    name: "carbonCreditPricePerTonCO2e",
    category: "financial",
    unit: "USD/tCO2e",
    value: assumptions.carbonCreditPricePerTonCO2e,
  },
  {
    name: "co2AvoidedPerKgRecovered",
    category: "environmental",
    unit: "tCO2e/kg",
    value: assumptions.co2AvoidedPerKgRecovered,
  },
  {
    name: "carbonCapturePotentialPerKgRecovered",
    category: "environmental",
    unit: "tCO2e/kg",
    value: assumptions.carbonCapturePotentialPerKgRecovered,
  },
  {
    name: "baselineTruckMilesPerTrip",
    category: "environmental",
    unit: "miles/trip",
    value: assumptions.baselineTruckMilesPerTrip,
  },
  {
    name: "optimizedTruckMilesPerTrip",
    category: "environmental",
    unit: "miles/trip",
    value: assumptions.optimizedTruckMilesPerTrip,
  },
];

export const analyzeScenario = (input: ScenarioInput): ScenarioAnalysisResult => {
  validateAssumptions(input.assumptions);

  const simulationResult = simulatePanelFlow(
    input.unitOfWork,
    input.costDrivers,
    input.sustainabilityDrivers,
    {
      useCrusher: input.mode === "Crusher",
      truckSpeedKmPerHour: input.assumptions.truckSpeedKmPerHour,
      loadUnloadHoursPerTrip: input.assumptions.loadUnloadHoursPerTrip,
    },
  );

  const overrides = factorOverridesFromAssumptions(input.assumptions);
  const recoveredKg = toNumber(simulationResult.materialRecovered);
  const totalEmissions = toNumber(simulationResult.totalEmissions);

  const totalDistanceKm =
    simulationResult.truckTrips * toNumber(input.unitOfWork.haulDistancePerTrip);
  const inputKg = toNumber(input.unitOfWork.inboundMaterial);

  const processingCostPerKg =
    input.mode === "Crusher"
      ? toNumber(input.costDrivers.crusherProcessingCostPerKg)
      : toNumber(input.costDrivers.grinderProcessingCostPerKg);
  const processingEmissionsPerKg =
    input.mode === "Crusher"
      ? toNumber(input.sustainabilityDrivers.crusherEmissionsPerKg)
      : toNumber(input.sustainabilityDrivers.grinderEmissionsPerKg);

  const haulCost = usd(totalDistanceKm * toNumber(input.costDrivers.haulCostPerKm));
  const processingCost = usd(inputKg * processingCostPerKg);
  const laborCost = usd(
    toNumber(simulationResult.totalTime) * toNumber(input.costDrivers.laborCostPerHour),
  );

  const haulEmissions = tCO2e(
    totalDistanceKm * toNumber(input.sustainabilityDrivers.haulEmissionsPerKm),
  );
  const processingEmissions = tCO2e(inputKg * processingEmissionsPerKg);

  const co2Avoided = computeCO2Avoided(simulationResult, overrides);
  const carbonCapturePotential = computeCarbonCapturePotential(
    simulationResult,
    overrides,
  );
  const truckMilesAvoided = computeTruckMilesAvoided(simulationResult, overrides);

  const avoidedEmissionPercentage =
    totalEmissions > 0 ? (toNumber(co2Avoided) / totalEmissions) * 100 : 0;

  const materialRevenue = usd(
    recoveredKg * input.assumptions.recoveredMaterialPricePerKg,
  );
  const carbonCreditRevenue = usd(
    toNumber(co2Avoided) * input.assumptions.carbonCreditPricePerTonCO2e,
  );
  const totalRevenue = usd(toNumber(materialRevenue) + toNumber(carbonCreditRevenue));
  const netCashFlow = usd(toNumber(totalRevenue) - toNumber(simulationResult.totalCost));

  return {
    mode: input.mode,
    simulationResult,
    costBreakdown: {
      haulCost,
      processingCost,
      laborCost,
      totalCost: simulationResult.totalCost,
    },
    emissionsBreakdown: {
      haulEmissions,
      processingEmissions,
      totalEmissions: simulationResult.totalEmissions,
    },
    environmentalKpis: {
      co2Avoided,
      carbonCapturePotential,
      truckMilesAvoided,
      avoidedEmissionPercentage,
    },
    financialMetrics: {
      materialRevenue,
      carbonCreditRevenue,
      totalRevenue,
      netCashFlow,
      costPerKgRecovered:
        recoveredKg > 0 ? toNumber(simulationResult.totalCost) / recoveredKg : null,
      grossMarginPercentage:
        toNumber(totalRevenue) > 0
          ? (toNumber(netCashFlow) / toNumber(totalRevenue)) * 100
          : null,
    },
    assumptionTrace: traceAssumptions(input.assumptions),
  };
};

const stableNormalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, stableNormalize(inner)]),
    );
  }
  return value;
};

export const stableScenarioJson = (input: ScenarioInput): string =>
  JSON.stringify(stableNormalize(input));

export const scenarioFingerprint = (input: ScenarioInput): string => {
  const text = stableScenarioJson(input);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};
