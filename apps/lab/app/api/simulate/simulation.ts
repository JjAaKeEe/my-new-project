import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DEFAULT_ENVIRONMENTAL_KPI_FACTORS,
  DEFAULT_SIMULATION_OPTIONS,
  computeCO2Avoided,
  computeCarbonCapturePotential,
  kg,
  km,
  showYourWork,
  simulatePanelFlow,
  tCO2e,
  usd,
  type CostDrivers,
  type EnvironmentalKpiFactors,
  type ShowYourWorkWorksheet,
  type SustainabilityDrivers,
  type UnitOfWork,
} from "@rainier/core";

const ROUTE_DEFAULTS = {
  scenarioMode: "baseline",
  reuseUptakeRate: 0,
} as const;

const toNumber = (value: number): number => value;

export const unitOfWorkSchema = z
  .object({
    inboundMaterial: z.number().positive(),
    haulDistancePerTrip: z.number().positive(),
  })
  .strict();

export const costDriversSchema = z
  .object({
    truckCapacity: z.number().positive(),
    haulCostPerKm: z.number().nonnegative(),
    laborCostPerHour: z.number().nonnegative(),
    crusherProcessingCostPerKg: z.number().nonnegative(),
    grinderProcessingCostPerKg: z.number().nonnegative(),
    crusherThroughputKgPerHour: z.number().positive(),
    grinderThroughputKgPerHour: z.number().positive(),
  })
  .strict();

export const sustainabilityDriversSchema = z
  .object({
    haulEmissionsPerKm: z.number().nonnegative(),
    crusherEmissionsPerKg: z.number().nonnegative(),
    grinderEmissionsPerKg: z.number().nonnegative(),
    crusherRecoveryRate: z.number().min(0).max(1),
    grinderRecoveryRate: z.number().min(0).max(1),
  })
  .strict();

export const scenarioOptionsSchema = z
  .object({
    mode: z.enum(["baseline", "grinder", "grinder+reuse"]).default(
      ROUTE_DEFAULTS.scenarioMode,
    ),
    reuseUptakeRate: z.number().min(0).max(1).optional(),
  })
  .strict()
  .optional();

export const emissionsFactorsSchema = z
  .object({
    co2AvoidedPerKgRecovered: z.number().nonnegative().optional(),
    carbonCapturePotentialPerKgRecovered: z.number().nonnegative().optional(),
    baselineTruckMilesPerTrip: z.number().nonnegative().optional(),
    optimizedTruckMilesPerTrip: z.number().nonnegative().optional(),
  })
  .strict()
  .optional();

export const simulateRequestSchema = z
  .object({
    unitOfWork: unitOfWorkSchema,
    costDrivers: costDriversSchema,
    sustainabilityDrivers: sustainabilityDriversSchema,
    scenarioOptions: scenarioOptionsSchema,
    emissionsFactors: emissionsFactorsSchema,
  })
  .strict();

export type SimulateRequestPayload = z.infer<typeof simulateRequestSchema>;

export interface AssumptionUsed {
  name: string;
  value: number | string;
  source: "core-default" | "route-default";
}

export interface SimulateResponse {
  inputsEcho: {
    unitOfWork: z.infer<typeof unitOfWorkSchema>;
    costDrivers: z.infer<typeof costDriversSchema>;
    sustainabilityDrivers: z.infer<typeof sustainabilityDriversSchema>;
    scenarioOptions: {
      mode: "baseline" | "grinder" | "grinder+reuse";
      reuseUptakeRate: number;
    };
    emissionsFactors: {
      co2AvoidedPerKgRecovered: number;
      carbonCapturePotentialPerKgRecovered: number;
      baselineTruckMilesPerTrip: number;
      optimizedTruckMilesPerTrip: number;
    };
  };
  outputs: {
    costUsd: number;
    timeHours: number;
    truckTrips: number;
    materialFlows: {
      inboundKg: number;
      recoveredKg: number;
      residualKg: number;
      estimatedReuseUptakeKg: number;
      landfillKg: number;
    };
  };
  emissions: {
    operationalTonsCO2e: number;
    avoidedTonsCO2e: number;
    estimatedUptakeTonsCO2e: number;
    baselineOperationalTonsCO2e: number;
    operationalDeltaTonsCO2e: number;
  };
  financialDeltas: {
    baselineCostUsd: number;
    scenarioCostUsd: number;
    deltaCostUsd: number;
    baselineCostPerRecoveredKg: number | null;
    scenarioCostPerRecoveredKg: number | null;
    deltaCostPerRecoveredKg: number | null;
  };
  audit: {
    worksheet: ShowYourWorkWorksheet;
    methodology: string;
  };
  assumptionsUsed: AssumptionUsed[];
  traceId: string;
}

const toCoreUnitOfWork = (
  input: z.infer<typeof unitOfWorkSchema>,
): UnitOfWork => ({
  inboundMaterial: kg(input.inboundMaterial),
  haulDistancePerTrip: km(input.haulDistancePerTrip),
});

const toCoreCostDrivers = (
  input: z.infer<typeof costDriversSchema>,
): CostDrivers => ({
  truckCapacity: kg(input.truckCapacity),
  haulCostPerKm: usd(input.haulCostPerKm),
  laborCostPerHour: usd(input.laborCostPerHour),
  crusherProcessingCostPerKg: usd(input.crusherProcessingCostPerKg),
  grinderProcessingCostPerKg: usd(input.grinderProcessingCostPerKg),
  crusherThroughputKgPerHour: kg(input.crusherThroughputKgPerHour),
  grinderThroughputKgPerHour: kg(input.grinderThroughputKgPerHour),
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

const coreEmissionDefaults = {
  co2AvoidedPerKgRecovered: toNumber(
    DEFAULT_ENVIRONMENTAL_KPI_FACTORS.co2AvoidedPerKgRecovered,
  ),
  carbonCapturePotentialPerKgRecovered: toNumber(
    DEFAULT_ENVIRONMENTAL_KPI_FACTORS.carbonCapturePotentialPerKgRecovered,
  ),
  baselineTruckMilesPerTrip: toNumber(
    DEFAULT_ENVIRONMENTAL_KPI_FACTORS.baselineTruckMilesPerTrip,
  ),
  optimizedTruckMilesPerTrip: toNumber(
    DEFAULT_ENVIRONMENTAL_KPI_FACTORS.optimizedTruckMilesPerTrip,
  ),
};

const resolveNormalizedInput = (payload: SimulateRequestPayload) => {
  const assumptionsUsed: AssumptionUsed[] = [];

  const scenarioMode = payload.scenarioOptions?.mode ?? ROUTE_DEFAULTS.scenarioMode;
  if (payload.scenarioOptions?.mode === undefined) {
    assumptionsUsed.push({
      name: "scenarioOptions.mode",
      value: ROUTE_DEFAULTS.scenarioMode,
      source: "route-default",
    });
  }

  const reuseUptakeRateRaw = payload.scenarioOptions?.reuseUptakeRate;
  const reuseUptakeRate =
    scenarioMode === "grinder+reuse"
      ? (reuseUptakeRateRaw ?? ROUTE_DEFAULTS.reuseUptakeRate)
      : 0;
  if (scenarioMode === "grinder+reuse" && reuseUptakeRateRaw === undefined) {
    assumptionsUsed.push({
      name: "scenarioOptions.reuseUptakeRate",
      value: ROUTE_DEFAULTS.reuseUptakeRate,
      source: "route-default",
    });
  }

  const resolvedEmissions = {
    co2AvoidedPerKgRecovered:
      payload.emissionsFactors?.co2AvoidedPerKgRecovered ??
      coreEmissionDefaults.co2AvoidedPerKgRecovered,
    carbonCapturePotentialPerKgRecovered:
      payload.emissionsFactors?.carbonCapturePotentialPerKgRecovered ??
      coreEmissionDefaults.carbonCapturePotentialPerKgRecovered,
    baselineTruckMilesPerTrip:
      payload.emissionsFactors?.baselineTruckMilesPerTrip ??
      coreEmissionDefaults.baselineTruckMilesPerTrip,
    optimizedTruckMilesPerTrip:
      payload.emissionsFactors?.optimizedTruckMilesPerTrip ??
      coreEmissionDefaults.optimizedTruckMilesPerTrip,
  };

  if (payload.emissionsFactors?.co2AvoidedPerKgRecovered === undefined) {
    assumptionsUsed.push({
      name: "emissionsFactors.co2AvoidedPerKgRecovered",
      value: coreEmissionDefaults.co2AvoidedPerKgRecovered,
      source: "core-default",
    });
  }
  if (payload.emissionsFactors?.carbonCapturePotentialPerKgRecovered === undefined) {
    assumptionsUsed.push({
      name: "emissionsFactors.carbonCapturePotentialPerKgRecovered",
      value: coreEmissionDefaults.carbonCapturePotentialPerKgRecovered,
      source: "core-default",
    });
  }
  if (payload.emissionsFactors?.baselineTruckMilesPerTrip === undefined) {
    assumptionsUsed.push({
      name: "emissionsFactors.baselineTruckMilesPerTrip",
      value: coreEmissionDefaults.baselineTruckMilesPerTrip,
      source: "core-default",
    });
  }
  if (payload.emissionsFactors?.optimizedTruckMilesPerTrip === undefined) {
    assumptionsUsed.push({
      name: "emissionsFactors.optimizedTruckMilesPerTrip",
      value: coreEmissionDefaults.optimizedTruckMilesPerTrip,
      source: "core-default",
    });
  }

  assumptionsUsed.push({
    name: "simulationOptions.truckSpeedKmPerHour",
    value: DEFAULT_SIMULATION_OPTIONS.truckSpeedKmPerHour,
    source: "core-default",
  });
  assumptionsUsed.push({
    name: "simulationOptions.loadUnloadHoursPerTrip",
    value: DEFAULT_SIMULATION_OPTIONS.loadUnloadHoursPerTrip,
    source: "core-default",
  });

  return {
    normalized: {
      unitOfWork: payload.unitOfWork,
      costDrivers: payload.costDrivers,
      sustainabilityDrivers: payload.sustainabilityDrivers,
      scenarioOptions: {
        mode: scenarioMode,
        reuseUptakeRate,
      },
      emissionsFactors: resolvedEmissions,
    },
    assumptionsUsed,
  };
};

const costPerRecoveredKg = (costUsd: number, recoveredKg: number): number | null =>
  recoveredKg > 0 ? costUsd / recoveredKg : null;

export const buildSimulationResponse = (
  payload: SimulateRequestPayload,
  traceId: string = randomUUID(),
): SimulateResponse => {
  const { normalized, assumptionsUsed } = resolveNormalizedInput(payload);

  const unitOfWork = toCoreUnitOfWork(normalized.unitOfWork);
  const costDrivers = toCoreCostDrivers(normalized.costDrivers);
  const sustainabilityDrivers = toCoreSustainabilityDrivers(
    normalized.sustainabilityDrivers,
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
      useCrusher: normalized.scenarioOptions.mode === "baseline",
      truckSpeedKmPerHour: DEFAULT_SIMULATION_OPTIONS.truckSpeedKmPerHour,
      loadUnloadHoursPerTrip: DEFAULT_SIMULATION_OPTIONS.loadUnloadHoursPerTrip,
    },
  );

  const factorOverrides: Partial<EnvironmentalKpiFactors> = {
    co2AvoidedPerKgRecovered: tCO2e(
      normalized.emissionsFactors.co2AvoidedPerKgRecovered,
    ),
    carbonCapturePotentialPerKgRecovered: tCO2e(
      normalized.emissionsFactors.carbonCapturePotentialPerKgRecovered,
    ),
  };

  const inboundKg = normalized.unitOfWork.inboundMaterial;
  const recoveredKg = toNumber(scenarioSimulation.materialRecovered);
  const residualKg = Math.max(0, inboundKg - recoveredKg);
  const estimatedReuseUptakeKg =
    normalized.scenarioOptions.mode === "grinder+reuse"
      ? residualKg * normalized.scenarioOptions.reuseUptakeRate
      : 0;
  const landfillKg = Math.max(0, residualKg - estimatedReuseUptakeKg);

  const avoidedTonsCO2e = toNumber(
    computeCO2Avoided(scenarioSimulation, factorOverrides),
  );
  const captureFromRecoveredTonsCO2e = toNumber(
    computeCarbonCapturePotential(scenarioSimulation, factorOverrides),
  );
  const reuseUptakeTonsCO2e =
    estimatedReuseUptakeKg *
    normalized.emissionsFactors.carbonCapturePotentialPerKgRecovered;

  const scenarioCostUsd = toNumber(scenarioSimulation.totalCost);
  const baselineCostUsd = toNumber(baselineSimulation.totalCost);
  const scenarioRecoveredKg = toNumber(scenarioSimulation.materialRecovered);
  const baselineRecoveredKg = toNumber(baselineSimulation.materialRecovered);

  const scenarioCostPerRecoveredKg = costPerRecoveredKg(
    scenarioCostUsd,
    scenarioRecoveredKg,
  );
  const baselineCostPerRecoveredKg = costPerRecoveredKg(
    baselineCostUsd,
    baselineRecoveredKg,
  );
  const showYourWorkResult = showYourWork(scenarioSimulation);

  return {
    inputsEcho: normalized,
    outputs: {
      costUsd: scenarioCostUsd,
      timeHours: toNumber(scenarioSimulation.totalTime),
      truckTrips: scenarioSimulation.truckTrips,
      materialFlows: {
        inboundKg,
        recoveredKg,
        residualKg,
        estimatedReuseUptakeKg,
        landfillKg,
      },
    },
    emissions: {
      operationalTonsCO2e: toNumber(scenarioSimulation.totalEmissions),
      avoidedTonsCO2e,
      estimatedUptakeTonsCO2e:
        captureFromRecoveredTonsCO2e + reuseUptakeTonsCO2e,
      baselineOperationalTonsCO2e: toNumber(baselineSimulation.totalEmissions),
      operationalDeltaTonsCO2e:
        toNumber(scenarioSimulation.totalEmissions) -
        toNumber(baselineSimulation.totalEmissions),
    },
    financialDeltas: {
      baselineCostUsd,
      scenarioCostUsd,
      deltaCostUsd: scenarioCostUsd - baselineCostUsd,
      baselineCostPerRecoveredKg,
      scenarioCostPerRecoveredKg,
      deltaCostPerRecoveredKg:
        baselineCostPerRecoveredKg !== null && scenarioCostPerRecoveredKg !== null
          ? scenarioCostPerRecoveredKg - baselineCostPerRecoveredKg
          : null,
    },
    audit: {
      worksheet: showYourWorkResult.worksheet,
      methodology: showYourWorkResult.narrative,
    },
    assumptionsUsed,
    traceId,
  };
};
