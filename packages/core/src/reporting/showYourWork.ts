import {
  DEFAULT_ENVIRONMENTAL_KPI_FACTORS,
  computeCO2Avoided,
  computeCarbonCapturePotential,
} from "../environmentalKpis";
import { tCO2e } from "../panelValueChain";
import { type SimulationResult } from "../simulatePanelFlow";

const round = (value: number, digits = 6): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const toNumber = (value: number): number => value;

export interface ShowYourWorkAssumptions {
  inferredRecoveryRate: number;
  bulkDensityKgPerCubicMeter: number;
  milesPerTrip: number;
  dieselTruckMpg: number;
  dieselEmissionFactorKgCO2ePerGallon: number;
  laborRateUsdPerHour: number;
  haulShareOfNonLaborCost: number;
  co2AvoidedPerKgRecovered: number;
  carbonCapturePotentialPerKgRecovered: number;
}

export const DEFAULT_SHOW_YOUR_WORK_ASSUMPTIONS: ShowYourWorkAssumptions = {
  inferredRecoveryRate: 0.8,
  bulkDensityKgPerCubicMeter: 2000,
  milesPerTrip: toNumber(DEFAULT_ENVIRONMENTAL_KPI_FACTORS.optimizedTruckMilesPerTrip),
  dieselTruckMpg: 6,
  dieselEmissionFactorKgCO2ePerGallon: 10.21,
  laborRateUsdPerHour: 40,
  haulShareOfNonLaborCost: 0.6,
  co2AvoidedPerKgRecovered: toNumber(
    DEFAULT_ENVIRONMENTAL_KPI_FACTORS.co2AvoidedPerKgRecovered,
  ),
  carbonCapturePotentialPerKgRecovered: toNumber(
    DEFAULT_ENVIRONMENTAL_KPI_FACTORS.carbonCapturePotentialPerKgRecovered,
  ),
};

export interface ShowYourWorkWorksheet {
  version: "1.0";
  deterministic: true;
  input: {
    totalCostUsd: number;
    totalTimeHours: number;
    totalEmissionsTonsCO2e: number;
    truckTrips: number;
    materialRecoveredKg: number;
  };
  assumptions: ShowYourWorkAssumptions;
  intermediates: {
    material: {
      inboundKg: number;
      recoveredKg: number;
      residualKg: number;
      inboundVolumeM3: number;
      recoveredVolumeM3: number;
      residualVolumeM3: number;
    };
    transport: {
      trips: number;
      milesPerTrip: number;
      totalMiles: number;
      dieselGallonsEstimate: number;
    };
    emissions: {
      factors: {
        operationalTonsCO2eFromSimulation: number;
        co2AvoidedPerKgRecovered: number;
        carbonCapturePotentialPerKgRecovered: number;
        dieselEmissionFactorKgCO2ePerGallon: number;
      };
      dieselTailpipeEstimateTonsCO2e: number;
      avoidedEmissionsTonsCO2e: number;
      uptakeEstimateTonsCO2e: number;
      netClimateBenefitTonsCO2e: number;
    };
    financial: {
      totalCostUsd: number;
      laborCostUsd: number;
      nonLaborCostUsd: number;
      haulCostUsd: number;
      processingCostUsd: number;
      costPerTripUsd: number;
      costPerRecoveredKgUsd: number;
      costPerRecoveredTonUsd: number;
    };
  };
}

export interface ShowYourWorkResult {
  worksheet: ShowYourWorkWorksheet;
  narrative: string;
}

const validateAssumptions = (assumptions: ShowYourWorkAssumptions): void => {
  if (assumptions.inferredRecoveryRate <= 0 || assumptions.inferredRecoveryRate > 1) {
    throw new Error("inferredRecoveryRate must be > 0 and <= 1");
  }
  if (assumptions.bulkDensityKgPerCubicMeter <= 0) {
    throw new Error("bulkDensityKgPerCubicMeter must be > 0");
  }
  if (assumptions.milesPerTrip < 0) {
    throw new Error("milesPerTrip must be >= 0");
  }
  if (assumptions.dieselTruckMpg <= 0) {
    throw new Error("dieselTruckMpg must be > 0");
  }
  if (assumptions.dieselEmissionFactorKgCO2ePerGallon <= 0) {
    throw new Error("dieselEmissionFactorKgCO2ePerGallon must be > 0");
  }
  if (assumptions.laborRateUsdPerHour < 0) {
    throw new Error("laborRateUsdPerHour must be >= 0");
  }
  if (assumptions.haulShareOfNonLaborCost < 0 || assumptions.haulShareOfNonLaborCost > 1) {
    throw new Error("haulShareOfNonLaborCost must be between 0 and 1");
  }
  if (assumptions.co2AvoidedPerKgRecovered < 0) {
    throw new Error("co2AvoidedPerKgRecovered must be >= 0");
  }
  if (assumptions.carbonCapturePotentialPerKgRecovered < 0) {
    throw new Error("carbonCapturePotentialPerKgRecovered must be >= 0");
  }
};

const fixed = (value: number, digits = 4): string => value.toFixed(digits);

export const showYourWork = (
  simulationResult: SimulationResult,
  overrides: Partial<ShowYourWorkAssumptions> = {},
): ShowYourWorkResult => {
  const assumptions: ShowYourWorkAssumptions = {
    ...DEFAULT_SHOW_YOUR_WORK_ASSUMPTIONS,
    ...overrides,
  };
  validateAssumptions(assumptions);

  const recoveredKg = toNumber(simulationResult.materialRecovered);
  const inboundKg = recoveredKg / assumptions.inferredRecoveryRate;
  const residualKg = Math.max(0, inboundKg - recoveredKg);

  const inboundVolumeM3 = inboundKg / assumptions.bulkDensityKgPerCubicMeter;
  const recoveredVolumeM3 = recoveredKg / assumptions.bulkDensityKgPerCubicMeter;
  const residualVolumeM3 = residualKg / assumptions.bulkDensityKgPerCubicMeter;

  const trips = simulationResult.truckTrips;
  const totalMiles = trips * assumptions.milesPerTrip;
  const dieselGallonsEstimate = totalMiles / assumptions.dieselTruckMpg;

  const operationalTonsCO2e = toNumber(simulationResult.totalEmissions);
  const dieselTailpipeEstimateTonsCO2e =
    (dieselGallonsEstimate * assumptions.dieselEmissionFactorKgCO2ePerGallon) / 1000;

  const avoidedEmissionsTonsCO2e = toNumber(
    computeCO2Avoided(simulationResult, {
      co2AvoidedPerKgRecovered: tCO2e(assumptions.co2AvoidedPerKgRecovered),
    }),
  );
  const uptakeEstimateTonsCO2e = toNumber(
    computeCarbonCapturePotential(simulationResult, {
      carbonCapturePotentialPerKgRecovered: tCO2e(
        assumptions.carbonCapturePotentialPerKgRecovered,
      ),
    }),
  );
  const netClimateBenefitTonsCO2e =
    avoidedEmissionsTonsCO2e + uptakeEstimateTonsCO2e - operationalTonsCO2e;

  const totalCostUsd = toNumber(simulationResult.totalCost);
  const laborCostUsd = Math.min(
    totalCostUsd,
    toNumber(simulationResult.totalTime) * assumptions.laborRateUsdPerHour,
  );
  const nonLaborCostUsd = Math.max(0, totalCostUsd - laborCostUsd);
  const haulCostUsd = nonLaborCostUsd * assumptions.haulShareOfNonLaborCost;
  const processingCostUsd = nonLaborCostUsd - haulCostUsd;

  const costPerTripUsd = trips > 0 ? totalCostUsd / trips : 0;
  const costPerRecoveredKgUsd = recoveredKg > 0 ? totalCostUsd / recoveredKg : 0;
  const costPerRecoveredTonUsd = recoveredKg > 0 ? totalCostUsd / (recoveredKg / 1000) : 0;

  const worksheet: ShowYourWorkWorksheet = {
    version: "1.0",
    deterministic: true,
    input: {
      totalCostUsd: round(totalCostUsd),
      totalTimeHours: round(toNumber(simulationResult.totalTime)),
      totalEmissionsTonsCO2e: round(operationalTonsCO2e),
      truckTrips: trips,
      materialRecoveredKg: round(recoveredKg),
    },
    assumptions: {
      inferredRecoveryRate: round(assumptions.inferredRecoveryRate),
      bulkDensityKgPerCubicMeter: round(assumptions.bulkDensityKgPerCubicMeter),
      milesPerTrip: round(assumptions.milesPerTrip),
      dieselTruckMpg: round(assumptions.dieselTruckMpg),
      dieselEmissionFactorKgCO2ePerGallon: round(
        assumptions.dieselEmissionFactorKgCO2ePerGallon,
      ),
      laborRateUsdPerHour: round(assumptions.laborRateUsdPerHour),
      haulShareOfNonLaborCost: round(assumptions.haulShareOfNonLaborCost),
      co2AvoidedPerKgRecovered: round(assumptions.co2AvoidedPerKgRecovered),
      carbonCapturePotentialPerKgRecovered: round(
        assumptions.carbonCapturePotentialPerKgRecovered,
      ),
    },
    intermediates: {
      material: {
        inboundKg: round(inboundKg),
        recoveredKg: round(recoveredKg),
        residualKg: round(residualKg),
        inboundVolumeM3: round(inboundVolumeM3),
        recoveredVolumeM3: round(recoveredVolumeM3),
        residualVolumeM3: round(residualVolumeM3),
      },
      transport: {
        trips,
        milesPerTrip: round(assumptions.milesPerTrip),
        totalMiles: round(totalMiles),
        dieselGallonsEstimate: round(dieselGallonsEstimate),
      },
      emissions: {
        factors: {
          operationalTonsCO2eFromSimulation: round(operationalTonsCO2e),
          co2AvoidedPerKgRecovered: round(assumptions.co2AvoidedPerKgRecovered),
          carbonCapturePotentialPerKgRecovered: round(
            assumptions.carbonCapturePotentialPerKgRecovered,
          ),
          dieselEmissionFactorKgCO2ePerGallon: round(
            assumptions.dieselEmissionFactorKgCO2ePerGallon,
          ),
        },
        dieselTailpipeEstimateTonsCO2e: round(dieselTailpipeEstimateTonsCO2e),
        avoidedEmissionsTonsCO2e: round(avoidedEmissionsTonsCO2e),
        uptakeEstimateTonsCO2e: round(uptakeEstimateTonsCO2e),
        netClimateBenefitTonsCO2e: round(netClimateBenefitTonsCO2e),
      },
      financial: {
        totalCostUsd: round(totalCostUsd),
        laborCostUsd: round(laborCostUsd),
        nonLaborCostUsd: round(nonLaborCostUsd),
        haulCostUsd: round(haulCostUsd),
        processingCostUsd: round(processingCostUsd),
        costPerTripUsd: round(costPerTripUsd),
        costPerRecoveredKgUsd: round(costPerRecoveredKgUsd),
        costPerRecoveredTonUsd: round(costPerRecoveredTonUsd),
      },
    },
  };

  const narrative = [
    "Methodology (deterministic worksheet v1.0)",
    `Start from simulation outputs: recovered mass ${fixed(recoveredKg, 2)} kg, ${trips} truck trips, total cost ${fixed(totalCostUsd, 2)} USD, total operational emissions ${fixed(operationalTonsCO2e, 4)} tCO2e, and modeled time ${fixed(toNumber(simulationResult.totalTime), 2)} hours.`,
    `Infer inbound and residual mass with an explicit recovery-rate assumption (${fixed(assumptions.inferredRecoveryRate, 4)}): inbound = recovered / recovery rate = ${fixed(inboundKg, 2)} kg; residual = inbound - recovered = ${fixed(residualKg, 2)} kg.`,
    `Convert mass to volumes using bulk density ${fixed(assumptions.bulkDensityKgPerCubicMeter, 2)} kg/m3: inbound ${fixed(inboundVolumeM3, 4)} m3, recovered ${fixed(recoveredVolumeM3, 4)} m3, residual ${fixed(residualVolumeM3, 4)} m3.`,
    `Estimate transport fuel by applying miles-per-trip ${fixed(assumptions.milesPerTrip, 2)} and diesel efficiency ${fixed(assumptions.dieselTruckMpg, 2)} mpg: total miles ${fixed(totalMiles, 2)}, diesel gallons ${fixed(dieselGallonsEstimate, 4)}. Diesel tailpipe emissions use ${fixed(assumptions.dieselEmissionFactorKgCO2ePerGallon, 4)} kgCO2e/gal, yielding ${fixed(dieselTailpipeEstimateTonsCO2e, 4)} tCO2e.`,
    `Apply environmental factors explicitly: avoided emissions factor ${fixed(assumptions.co2AvoidedPerKgRecovered, 6)} tCO2e/kg and uptake factor ${fixed(assumptions.carbonCapturePotentialPerKgRecovered, 6)} tCO2e/kg. This yields avoided emissions ${fixed(avoidedEmissionsTonsCO2e, 4)} tCO2e and uptake estimate ${fixed(uptakeEstimateTonsCO2e, 4)} tCO2e.`,
    `Compute net climate benefit as avoided + uptake - operational = ${fixed(netClimateBenefitTonsCO2e, 4)} tCO2e.`,
    `Decompose cost deterministically with labor-rate assumption ${fixed(assumptions.laborRateUsdPerHour, 2)} USD/h and haul-share assumption ${fixed(assumptions.haulShareOfNonLaborCost, 4)} of non-labor cost: labor ${fixed(laborCostUsd, 2)} USD, haul ${fixed(haulCostUsd, 2)} USD, processing ${fixed(processingCostUsd, 2)} USD.`,
    `Unitized economics: ${fixed(costPerTripUsd, 2)} USD/trip, ${fixed(costPerRecoveredKgUsd, 4)} USD/kg recovered, and ${fixed(costPerRecoveredTonUsd, 2)} USD/ton recovered.`,
  ].join("\n");

  return {
    worksheet,
    narrative,
  };
};
