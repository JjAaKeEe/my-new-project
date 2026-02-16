import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DEFAULT_SIMULATION_OPTIONS,
  kg,
  km,
  simulatePanelFlow,
  tCO2e,
  usd,
  type CostDrivers,
  type SustainabilityDrivers,
  type UnitOfWork,
} from "@rainier/core";
import {
  costDriversSchema,
  sustainabilityDriversSchema,
  unitOfWorkSchema,
} from "../simulate/simulation";

const EPSILON = 1e-9;
const MAX_GRID_POINTS = 2500;

const EXPEDITE_PROXY_NOTE =
  "Optional expedite penalty proxy used for scenario planning only; this is an assumption, not an empirical fact.";

const DEFAULT_SENSITIVITY_ASSUMPTIONS = {
  virginAggregateEmissionsPerKg: 0.000005,
  virginAggregateCostPerKg: 0.03,
  landfillDisposalCostPerKg: 0.045,
  grinderCapitalCostUsd: 90000,
  runsPerDay: 1,
} as const;

const DEFAULT_EXPEDITE_PENALTY_PROXY = {
  enabled: false,
  specReadiness: 1,
  lowSpecReadinessThreshold: 0.65,
  readinessExponent: 2,
  baseCostPenaltyUsd: 350,
  baseEmissionsPenaltyTonsCO2e: 0.02,
  haulDistanceThresholdKm: 40,
  haulCostPenaltyUsdPerKm: 4,
  haulEmissionsPenaltyTonsCO2ePerKm: 0.0004,
} as const;

const toNumber = (value: number): number => value;
const round = (value: number, digits = 6): number =>
  Number(value.toFixed(digits));
const roundNullable = (value: number | null, digits = 6): number | null =>
  value === null ? null : round(value, digits);

const numericRangeSchema = z
  .object({
    start: z.number(),
    end: z.number(),
    step: z.number().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.end < value.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "range.end must be >= range.start",
      });
    }
  });

const positiveRangeSchema = numericRangeSchema.superRefine((value, context) => {
  if (value.start <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "range.start must be > 0",
    });
  }
});

const unitIntervalRangeSchema = numericRangeSchema.superRefine((value, context) => {
  if (value.start < 0 || value.start > 1 || value.end < 0 || value.end > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "range.start and range.end must be within [0, 1]",
    });
  }
});

export const sensitivityRangesSchema = z
  .object({
    haulDistancePerTrip: positiveRangeSchema,
    reuseUptakeRate: unitIntervalRangeSchema,
    grinderUtilization: unitIntervalRangeSchema.optional(),
    grinderThroughputKgPerHour: positiveRangeSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasUtilization = value.grinderUtilization !== undefined;
    const hasThroughput = value.grinderThroughputKgPerHour !== undefined;
    if (hasUtilization === hasThroughput) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide exactly one grinder axis: grinderUtilization or grinderThroughputKgPerHour",
      });
    }
  });

export const sensitivityAssumptionsSchema = z
  .object({
    virginAggregateEmissionsPerKg: z.number().nonnegative().optional(),
    virginAggregateCostPerKg: z.number().nonnegative().optional(),
    landfillDisposalCostPerKg: z.number().nonnegative().optional(),
    grinderCapitalCostUsd: z.number().positive().optional(),
    runsPerDay: z.number().positive().optional(),
  })
  .strict()
  .optional();

export const expeditePenaltyProxySchema = z
  .object({
    enabled: z.boolean().optional(),
    specReadiness: z.number().min(0).max(1).optional(),
    lowSpecReadinessThreshold: z.number().min(0).max(1).optional(),
    readinessExponent: z.number().min(1).optional(),
    baseCostPenaltyUsd: z.number().nonnegative().optional(),
    baseEmissionsPenaltyTonsCO2e: z.number().nonnegative().optional(),
    haulDistanceThresholdKm: z.number().nonnegative().optional(),
    haulCostPenaltyUsdPerKm: z.number().nonnegative().optional(),
    haulEmissionsPenaltyTonsCO2ePerKm: z.number().nonnegative().optional(),
  })
  .strict()
  .optional();

export const sensitivityRequestSchema = z
  .object({
    unitOfWork: unitOfWorkSchema,
    costDrivers: costDriversSchema,
    sustainabilityDrivers: sustainabilityDriversSchema,
    ranges: sensitivityRangesSchema,
    assumptions: sensitivityAssumptionsSchema,
    expeditePenaltyProxy: expeditePenaltyProxySchema,
  })
  .strict();

export type SensitivityRequestPayload = z.infer<typeof sensitivityRequestSchema>;

export interface SensitivityAssumptionUsed {
  name: string;
  value: number | string | boolean;
  source: "request" | "core-default";
  description: string;
}

export type GrinderAxisMode = "utilization" | "throughput";

export interface SensitivityPlotPoint {
  haulDistancePerTripKm: number;
  reuseUptakeRate: number;
  grinderUtilization: number | null;
  grinderThroughputKgPerHour: number;
  costDeltaUsd: number;
  emissionsAvoidedTonsCO2e: number;
  paybackDays: number | null;
}

export interface SensitivityPointDiagnostics {
  baselineVirginAggregateEmissionsTonsCO2e: number;
  scenarioVirginAggregateEmissionsTonsCO2e: number;
  baselineTotalCostUsd: number;
  scenarioTotalCostUsd: number;
  baselineTotalEmissionsTonsCO2e: number;
  scenarioTotalEmissionsTonsCO2e: number;
  baselineResidualKg: number;
  scenarioResidualKg: number;
  scenarioReuseKg: number;
  scenarioLandfillKg: number;
  baselineDisposalTrips: number;
  scenarioDisposalTrips: number;
  expeditePenaltyCostUsd: number;
  expeditePenaltyEmissionsTonsCO2e: number;
}

export interface SensitivityPointComputation {
  point: SensitivityPlotPoint;
  diagnostics: SensitivityPointDiagnostics;
}

export interface SensitivityGridResult {
  axisMode: GrinderAxisMode;
  axes: {
    haulDistancePerTripKm: number[];
    reuseUptakeRate: number[];
    grinderAxisValues: number[];
  };
  points: SensitivityPointComputation[];
  assumptionsUsed: SensitivityAssumptionUsed[];
  penaltyProxy: NormalizedPenaltyProxy;
}

export interface SensitivityResponse {
  traceId: string;
  grid: {
    haulDistancePerTripKm: number[];
    reuseUptakeRate: number[];
    grinderAxis: {
      mode: GrinderAxisMode;
      values: number[];
    };
  };
  dataset: SensitivityPlotPoint[];
  assumptionsUsed: SensitivityAssumptionUsed[];
  penaltyProxy: {
    enabled: boolean;
    note: string;
    parameters: NormalizedPenaltyProxy;
  };
}

interface NormalizedSensitivityAssumptions {
  virginAggregateEmissionsPerKg: number;
  virginAggregateCostPerKg: number;
  landfillDisposalCostPerKg: number;
  grinderCapitalCostUsd: number;
  runsPerDay: number;
}

interface NormalizedPenaltyProxy {
  enabled: boolean;
  specReadiness: number;
  lowSpecReadinessThreshold: number;
  readinessExponent: number;
  baseCostPenaltyUsd: number;
  baseEmissionsPenaltyTonsCO2e: number;
  haulDistanceThresholdKm: number;
  haulCostPenaltyUsdPerKm: number;
  haulEmissionsPenaltyTonsCO2ePerKm: number;
}

interface ExpeditePenaltyResult {
  costPenaltyUsd: number;
  emissionsPenaltyTonsCO2e: number;
}

interface SensitivityPointInput {
  haulDistancePerTripKm: number;
  reuseUptakeRate: number;
  grinderUtilization: number | null;
  grinderThroughputKgPerHour: number;
}

interface SensitivityContext {
  unitOfWork: z.infer<typeof unitOfWorkSchema>;
  costDrivers: z.infer<typeof costDriversSchema>;
  sustainabilityDrivers: z.infer<typeof sustainabilityDriversSchema>;
  assumptions: NormalizedSensitivityAssumptions;
  penaltyProxy: NormalizedPenaltyProxy;
}

const toCoreUnitOfWork = (
  input: z.infer<typeof unitOfWorkSchema>,
  haulDistancePerTripKm: number,
): UnitOfWork => ({
  inboundMaterial: kg(input.inboundMaterial),
  haulDistancePerTrip: km(haulDistancePerTripKm),
});

const toCoreCostDrivers = (
  input: z.infer<typeof costDriversSchema>,
  grinderThroughputKgPerHour: number,
): CostDrivers => ({
  truckCapacity: kg(input.truckCapacity),
  haulCostPerKm: usd(input.haulCostPerKm),
  laborCostPerHour: usd(input.laborCostPerHour),
  crusherProcessingCostPerKg: usd(input.crusherProcessingCostPerKg),
  grinderProcessingCostPerKg: usd(input.grinderProcessingCostPerKg),
  crusherThroughputKgPerHour: kg(input.crusherThroughputKgPerHour),
  grinderThroughputKgPerHour: kg(grinderThroughputKgPerHour),
});

const toCoreSustainabilityDrivers = (
  input: z.infer<typeof sustainabilityDriversSchema>,
): SustainabilityDrivers => ({
  haulEmissionsPerKm: tCO2e(input.haulEmissionsPerKm),
  crusherEmissionsPerKg: tCO2e(input.crusherEmissionsPerKg),
  grinderEmissionsPerKg: tCO2e(input.grinderEmissionsPerKg),
  crusherRecoveryRate: input.crusherRecoveryRate,
  grinderRecoveryRate: input.grinderRecoveryRate,
});

const expandRangeValues = (
  input: z.infer<typeof numericRangeSchema>,
): number[] => {
  const values: number[] = [];
  const span = input.end - input.start;
  const steps = Math.floor(span / input.step + EPSILON);

  for (let idx = 0; idx <= steps; idx += 1) {
    values.push(round(input.start + idx * input.step));
  }

  if (input.end - values[values.length - 1] > EPSILON) {
    values.push(round(input.end));
  }

  return [...new Set(values)];
};

const resolveAssumption = (
  value: number | undefined,
  fallback: number,
  name: string,
  description: string,
  assumptionsUsed: SensitivityAssumptionUsed[],
): number => {
  const resolved = value ?? fallback;
  assumptionsUsed.push({
    name,
    value: resolved,
    source: value === undefined ? "core-default" : "request",
    description,
  });
  return resolved;
};

const resolveBooleanAssumption = (
  value: boolean | undefined,
  fallback: boolean,
  name: string,
  description: string,
  assumptionsUsed: SensitivityAssumptionUsed[],
): boolean => {
  const resolved = value ?? fallback;
  assumptionsUsed.push({
    name,
    value: resolved,
    source: value === undefined ? "core-default" : "request",
    description,
  });
  return resolved;
};

const resolveNormalizedInput = (payload: SensitivityRequestPayload) => {
  const assumptionsUsed: SensitivityAssumptionUsed[] = [];

  const assumptions: NormalizedSensitivityAssumptions = {
    virginAggregateEmissionsPerKg: resolveAssumption(
      payload.assumptions?.virginAggregateEmissionsPerKg,
      DEFAULT_SENSITIVITY_ASSUMPTIONS.virginAggregateEmissionsPerKg,
      "assumptions.virginAggregateEmissionsPerKg",
      "Embodied emissions factor for virgin aggregate displaced by reuse (tCO2e/kg).",
      assumptionsUsed,
    ),
    virginAggregateCostPerKg: resolveAssumption(
      payload.assumptions?.virginAggregateCostPerKg,
      DEFAULT_SENSITIVITY_ASSUMPTIONS.virginAggregateCostPerKg,
      "assumptions.virginAggregateCostPerKg",
      "Material procurement unit cost proxy for virgin aggregate (USD/kg).",
      assumptionsUsed,
    ),
    landfillDisposalCostPerKg: resolveAssumption(
      payload.assumptions?.landfillDisposalCostPerKg,
      DEFAULT_SENSITIVITY_ASSUMPTIONS.landfillDisposalCostPerKg,
      "assumptions.landfillDisposalCostPerKg",
      "Landfill disposal unit cost for residual material (USD/kg).",
      assumptionsUsed,
    ),
    grinderCapitalCostUsd: resolveAssumption(
      payload.assumptions?.grinderCapitalCostUsd,
      DEFAULT_SENSITIVITY_ASSUMPTIONS.grinderCapitalCostUsd,
      "assumptions.grinderCapitalCostUsd",
      "Capital outlay proxy used to compute payback in days (USD).",
      assumptionsUsed,
    ),
    runsPerDay: resolveAssumption(
      payload.assumptions?.runsPerDay,
      DEFAULT_SENSITIVITY_ASSUMPTIONS.runsPerDay,
      "assumptions.runsPerDay",
      "Number of equivalent unit-of-work runs per day for payback conversion.",
      assumptionsUsed,
    ),
  };

  const penaltyProxy: NormalizedPenaltyProxy = {
    enabled: resolveBooleanAssumption(
      payload.expeditePenaltyProxy?.enabled,
      DEFAULT_EXPEDITE_PENALTY_PROXY.enabled,
      "expeditePenaltyProxy.enabled",
      EXPEDITE_PROXY_NOTE,
      assumptionsUsed,
    ),
    specReadiness: resolveAssumption(
      payload.expeditePenaltyProxy?.specReadiness,
      DEFAULT_EXPEDITE_PENALTY_PROXY.specReadiness,
      "expeditePenaltyProxy.specReadiness",
      "Readiness score in [0,1]; lower values increase expedite risk proxy.",
      assumptionsUsed,
    ),
    lowSpecReadinessThreshold: resolveAssumption(
      payload.expeditePenaltyProxy?.lowSpecReadinessThreshold,
      DEFAULT_EXPEDITE_PENALTY_PROXY.lowSpecReadinessThreshold,
      "expeditePenaltyProxy.lowSpecReadinessThreshold",
      "Threshold below which readiness penalty activates.",
      assumptionsUsed,
    ),
    readinessExponent: resolveAssumption(
      payload.expeditePenaltyProxy?.readinessExponent,
      DEFAULT_EXPEDITE_PENALTY_PROXY.readinessExponent,
      "expeditePenaltyProxy.readinessExponent",
      "Non-linear exponent applied to readiness shortfall.",
      assumptionsUsed,
    ),
    baseCostPenaltyUsd: resolveAssumption(
      payload.expeditePenaltyProxy?.baseCostPenaltyUsd,
      DEFAULT_EXPEDITE_PENALTY_PROXY.baseCostPenaltyUsd,
      "expeditePenaltyProxy.baseCostPenaltyUsd",
      "Base expedite cost proxy (USD) applied when readiness is below threshold.",
      assumptionsUsed,
    ),
    baseEmissionsPenaltyTonsCO2e: resolveAssumption(
      payload.expeditePenaltyProxy?.baseEmissionsPenaltyTonsCO2e,
      DEFAULT_EXPEDITE_PENALTY_PROXY.baseEmissionsPenaltyTonsCO2e,
      "expeditePenaltyProxy.baseEmissionsPenaltyTonsCO2e",
      "Base expedite emissions proxy (tCO2e) applied when readiness is below threshold.",
      assumptionsUsed,
    ),
    haulDistanceThresholdKm: resolveAssumption(
      payload.expeditePenaltyProxy?.haulDistanceThresholdKm,
      DEFAULT_EXPEDITE_PENALTY_PROXY.haulDistanceThresholdKm,
      "expeditePenaltyProxy.haulDistanceThresholdKm",
      "Distance threshold above which additional expedite friction is applied.",
      assumptionsUsed,
    ),
    haulCostPenaltyUsdPerKm: resolveAssumption(
      payload.expeditePenaltyProxy?.haulCostPenaltyUsdPerKm,
      DEFAULT_EXPEDITE_PENALTY_PROXY.haulCostPenaltyUsdPerKm,
      "expeditePenaltyProxy.haulCostPenaltyUsdPerKm",
      "Incremental expedite cost proxy beyond distance threshold (USD/km).",
      assumptionsUsed,
    ),
    haulEmissionsPenaltyTonsCO2ePerKm: resolveAssumption(
      payload.expeditePenaltyProxy?.haulEmissionsPenaltyTonsCO2ePerKm,
      DEFAULT_EXPEDITE_PENALTY_PROXY.haulEmissionsPenaltyTonsCO2ePerKm,
      "expeditePenaltyProxy.haulEmissionsPenaltyTonsCO2ePerKm",
      "Incremental expedite emissions proxy beyond distance threshold (tCO2e/km).",
      assumptionsUsed,
    ),
  };

  assumptionsUsed.push({
    name: "throughputModel",
    value: "linear-utilization-scaling",
    source: "core-default",
    description:
      "When grinderUtilization is used, effective grinder throughput = nominal throughput * utilization.",
  });

  return {
    assumptions,
    penaltyProxy,
    assumptionsUsed,
  };
};

export const computeExpeditePenaltyProxy = (
  haulDistancePerTripKm: number,
  proxy: NormalizedPenaltyProxy,
): ExpeditePenaltyResult => {
  if (!proxy.enabled) {
    return {
      costPenaltyUsd: 0,
      emissionsPenaltyTonsCO2e: 0,
    };
  }

  const thresholdBase = Math.max(proxy.lowSpecReadinessThreshold, EPSILON);
  const readinessGap = Math.max(0, proxy.lowSpecReadinessThreshold - proxy.specReadiness);
  const readinessFactor = (readinessGap / thresholdBase) ** proxy.readinessExponent;
  const haulExcessKm = Math.max(0, haulDistancePerTripKm - proxy.haulDistanceThresholdKm);
  const haulScale = 1 + haulExcessKm / Math.max(proxy.haulDistanceThresholdKm, 1);

  const costPenaltyUsd =
    proxy.baseCostPenaltyUsd * readinessFactor * haulScale +
    haulExcessKm * proxy.haulCostPenaltyUsdPerKm;

  const emissionsPenaltyTonsCO2e =
    proxy.baseEmissionsPenaltyTonsCO2e * readinessFactor * haulScale +
    haulExcessKm * proxy.haulEmissionsPenaltyTonsCO2ePerKm;

  return {
    costPenaltyUsd,
    emissionsPenaltyTonsCO2e,
  };
};

export const computeSensitivityPoint = (
  input: SensitivityPointInput,
  context: SensitivityContext,
): SensitivityPointComputation => {
  const unitOfWork = toCoreUnitOfWork(context.unitOfWork, input.haulDistancePerTripKm);
  const costDrivers = toCoreCostDrivers(
    context.costDrivers,
    input.grinderThroughputKgPerHour,
  );
  const sustainabilityDrivers = toCoreSustainabilityDrivers(
    context.sustainabilityDrivers,
  );

  const baselineSimulation = simulatePanelFlow(
    unitOfWork,
    costDrivers,
    sustainabilityDrivers,
    {
      useCrusher: true,
      truckSpeedKmPerHour: DEFAULT_SIMULATION_OPTIONS.truckSpeedKmPerHour,
      loadUnloadHoursPerTrip: DEFAULT_SIMULATION_OPTIONS.loadUnloadHoursPerTrip,
    },
  );

  const scenarioSimulation = simulatePanelFlow(
    unitOfWork,
    costDrivers,
    sustainabilityDrivers,
    {
      useCrusher: false,
      truckSpeedKmPerHour: DEFAULT_SIMULATION_OPTIONS.truckSpeedKmPerHour,
      loadUnloadHoursPerTrip: DEFAULT_SIMULATION_OPTIONS.loadUnloadHoursPerTrip,
    },
  );

  const inboundKg = context.unitOfWork.inboundMaterial;
  const truckCapacityKg = context.costDrivers.truckCapacity;

  const baselineRecoveredKg = toNumber(baselineSimulation.materialRecovered);
  const scenarioRecoveredKg = toNumber(scenarioSimulation.materialRecovered);
  const baselineResidualKg = Math.max(0, inboundKg - baselineRecoveredKg);
  const scenarioResidualKg = Math.max(0, inboundKg - scenarioRecoveredKg);
  const scenarioReuseKg = scenarioResidualKg * input.reuseUptakeRate;
  const scenarioLandfillKg = Math.max(0, scenarioResidualKg - scenarioReuseKg);

  const baselineDisposalTrips = Math.ceil(baselineResidualKg / truckCapacityKg);
  const scenarioDisposalTrips = Math.ceil(scenarioLandfillKg / truckCapacityKg);

  const baselineDisposalDistanceKm = baselineDisposalTrips * input.haulDistancePerTripKm;
  const scenarioDisposalDistanceKm = scenarioDisposalTrips * input.haulDistancePerTripKm;

  const baselineDisposalHaulCostUsd =
    baselineDisposalDistanceKm * context.costDrivers.haulCostPerKm;
  const scenarioDisposalHaulCostUsd =
    scenarioDisposalDistanceKm * context.costDrivers.haulCostPerKm;

  const baselineDisposalHaulEmissionsTonsCO2e =
    baselineDisposalDistanceKm * context.sustainabilityDrivers.haulEmissionsPerKm;
  const scenarioDisposalHaulEmissionsTonsCO2e =
    scenarioDisposalDistanceKm * context.sustainabilityDrivers.haulEmissionsPerKm;

  const baselineVirginAggregateKg = inboundKg;
  const scenarioVirginAggregateKg = Math.max(0, inboundKg - scenarioReuseKg);

  const baselineVirginAggregateEmissionsTonsCO2e =
    baselineVirginAggregateKg * context.assumptions.virginAggregateEmissionsPerKg;
  const scenarioVirginAggregateEmissionsTonsCO2e =
    scenarioVirginAggregateKg * context.assumptions.virginAggregateEmissionsPerKg;

  const baselineVirginAggregateCostUsd =
    baselineVirginAggregateKg * context.assumptions.virginAggregateCostPerKg;
  const scenarioVirginAggregateCostUsd =
    scenarioVirginAggregateKg * context.assumptions.virginAggregateCostPerKg;

  const baselineDisposalCostUsd =
    baselineResidualKg * context.assumptions.landfillDisposalCostPerKg;
  const scenarioDisposalCostUsd =
    scenarioLandfillKg * context.assumptions.landfillDisposalCostPerKg;

  const expeditePenalty = computeExpeditePenaltyProxy(
    input.haulDistancePerTripKm,
    context.penaltyProxy,
  );

  const baselineTotalCostUsd =
    toNumber(baselineSimulation.totalCost) +
    baselineDisposalHaulCostUsd +
    baselineDisposalCostUsd +
    baselineVirginAggregateCostUsd;

  const scenarioTotalCostUsd =
    toNumber(scenarioSimulation.totalCost) +
    scenarioDisposalHaulCostUsd +
    scenarioDisposalCostUsd +
    scenarioVirginAggregateCostUsd +
    expeditePenalty.costPenaltyUsd;

  const baselineTotalEmissionsTonsCO2e =
    toNumber(baselineSimulation.totalEmissions) +
    baselineDisposalHaulEmissionsTonsCO2e +
    baselineVirginAggregateEmissionsTonsCO2e;

  const scenarioTotalEmissionsTonsCO2e =
    toNumber(scenarioSimulation.totalEmissions) +
    scenarioDisposalHaulEmissionsTonsCO2e +
    scenarioVirginAggregateEmissionsTonsCO2e +
    expeditePenalty.emissionsPenaltyTonsCO2e;

  const costDeltaUsd = scenarioTotalCostUsd - baselineTotalCostUsd;
  const emissionsAvoidedTonsCO2e =
    baselineTotalEmissionsTonsCO2e - scenarioTotalEmissionsTonsCO2e;

  const dailySavingsUsd =
    (baselineTotalCostUsd - scenarioTotalCostUsd) * context.assumptions.runsPerDay;
  const paybackDays =
    dailySavingsUsd > 0
      ? context.assumptions.grinderCapitalCostUsd / dailySavingsUsd
      : null;

  return {
    point: {
      haulDistancePerTripKm: round(input.haulDistancePerTripKm),
      reuseUptakeRate: round(input.reuseUptakeRate),
      grinderUtilization:
        input.grinderUtilization === null
          ? null
          : round(input.grinderUtilization),
      grinderThroughputKgPerHour: round(input.grinderThroughputKgPerHour),
      costDeltaUsd: round(costDeltaUsd),
      emissionsAvoidedTonsCO2e: round(emissionsAvoidedTonsCO2e),
      paybackDays: roundNullable(paybackDays),
    },
    diagnostics: {
      baselineVirginAggregateEmissionsTonsCO2e: round(
        baselineVirginAggregateEmissionsTonsCO2e,
      ),
      scenarioVirginAggregateEmissionsTonsCO2e: round(
        scenarioVirginAggregateEmissionsTonsCO2e,
      ),
      baselineTotalCostUsd: round(baselineTotalCostUsd),
      scenarioTotalCostUsd: round(scenarioTotalCostUsd),
      baselineTotalEmissionsTonsCO2e: round(baselineTotalEmissionsTonsCO2e),
      scenarioTotalEmissionsTonsCO2e: round(scenarioTotalEmissionsTonsCO2e),
      baselineResidualKg: round(baselineResidualKg),
      scenarioResidualKg: round(scenarioResidualKg),
      scenarioReuseKg: round(scenarioReuseKg),
      scenarioLandfillKg: round(scenarioLandfillKg),
      baselineDisposalTrips,
      scenarioDisposalTrips,
      expeditePenaltyCostUsd: round(expeditePenalty.costPenaltyUsd),
      expeditePenaltyEmissionsTonsCO2e: round(
        expeditePenalty.emissionsPenaltyTonsCO2e,
      ),
    },
  };
};

export const buildSensitivityGrid = (
  payload: SensitivityRequestPayload,
): SensitivityGridResult => {
  const normalized = resolveNormalizedInput(payload);
  const haulDistanceValues = expandRangeValues(payload.ranges.haulDistancePerTrip);
  const reuseValues = expandRangeValues(payload.ranges.reuseUptakeRate);
  const axisMode: GrinderAxisMode =
    payload.ranges.grinderUtilization !== undefined
      ? "utilization"
      : "throughput";
  const grinderAxisValues = expandRangeValues(
    payload.ranges.grinderUtilization ?? payload.ranges.grinderThroughputKgPerHour!,
  );

  const gridPointCount =
    haulDistanceValues.length * reuseValues.length * grinderAxisValues.length;
  if (gridPointCount > MAX_GRID_POINTS) {
    throw new Error(
      `Grid too large: ${gridPointCount} points exceeds limit ${MAX_GRID_POINTS}`,
    );
  }

  const context: SensitivityContext = {
    unitOfWork: payload.unitOfWork,
    costDrivers: payload.costDrivers,
    sustainabilityDrivers: payload.sustainabilityDrivers,
    assumptions: normalized.assumptions,
    penaltyProxy: normalized.penaltyProxy,
  };

  const points: SensitivityPointComputation[] = [];
  for (const haulDistancePerTripKm of haulDistanceValues) {
    for (const reuseUptakeRate of reuseValues) {
      for (const grinderAxisValue of grinderAxisValues) {
        const grinderUtilization =
          axisMode === "utilization" ? grinderAxisValue : null;
        const grinderThroughputKgPerHour =
          axisMode === "utilization"
            ? payload.costDrivers.grinderThroughputKgPerHour * grinderAxisValue
            : grinderAxisValue;

        points.push(
          computeSensitivityPoint(
            {
              haulDistancePerTripKm,
              reuseUptakeRate,
              grinderUtilization,
              grinderThroughputKgPerHour,
            },
            context,
          ),
        );
      }
    }
  }

  return {
    axisMode,
    axes: {
      haulDistancePerTripKm: haulDistanceValues,
      reuseUptakeRate: reuseValues,
      grinderAxisValues,
    },
    points,
    assumptionsUsed: normalized.assumptionsUsed,
    penaltyProxy: normalized.penaltyProxy,
  };
};

export const buildSensitivityResponse = (
  payload: SensitivityRequestPayload,
  traceId: string = randomUUID(),
): SensitivityResponse => {
  const gridResult = buildSensitivityGrid(payload);
  return {
    traceId,
    grid: {
      haulDistancePerTripKm: gridResult.axes.haulDistancePerTripKm,
      reuseUptakeRate: gridResult.axes.reuseUptakeRate,
      grinderAxis: {
        mode: gridResult.axisMode,
        values: gridResult.axes.grinderAxisValues,
      },
    },
    dataset: gridResult.points.map((result) => result.point),
    assumptionsUsed: gridResult.assumptionsUsed,
    penaltyProxy: {
      enabled: gridResult.penaltyProxy.enabled,
      note: EXPEDITE_PROXY_NOTE,
      parameters: gridResult.penaltyProxy,
    },
  };
};
