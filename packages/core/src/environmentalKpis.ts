import { tCO2e, type TonsCO2e } from "./panelValueChain";
import { type SimulationResult } from "./simulatePanelFlow";

export type Miles = number & { readonly __brand: "Miles" };

export const miles = (value: number): Miles => value as Miles;

export interface EnvironmentalKpiFactors {
  /**
   * Assumption:
   * Each kilogram of recovered material displaces virgin-material production
   * and avoids this many tons of CO2e before accounting for operational emissions.
   */
  co2AvoidedPerKgRecovered: TonsCO2e;
  /**
   * Assumption:
   * Recovered mineral-rich material can mineralize/capture this many tons of CO2e per kilogram.
   */
  carbonCapturePotentialPerKgRecovered: TonsCO2e;
  /**
   * Assumption:
   * Baseline (non-optimized) logistics distance per truck trip.
   */
  baselineTruckMilesPerTrip: Miles;
  /**
   * Assumption:
   * Optimized panel-flow logistics distance per truck trip.
   */
  optimizedTruckMilesPerTrip: Miles;
}

export const DEFAULT_ENVIRONMENTAL_KPI_FACTORS: EnvironmentalKpiFactors = {
  co2AvoidedPerKgRecovered: tCO2e(0.00012),
  carbonCapturePotentialPerKgRecovered: tCO2e(0.00003),
  baselineTruckMilesPerTrip: miles(42),
  optimizedTruckMilesPerTrip: miles(30),
};

const toNumber = (value: number): number => value;

const resolvedFactors = (
  overrides?: Partial<EnvironmentalKpiFactors>,
): EnvironmentalKpiFactors => ({
  ...DEFAULT_ENVIRONMENTAL_KPI_FACTORS,
  ...overrides,
});

const validateFactors = (factors: EnvironmentalKpiFactors): void => {
  if (factors.co2AvoidedPerKgRecovered < 0) {
    throw new Error("co2AvoidedPerKgRecovered must be >= 0");
  }
  if (factors.carbonCapturePotentialPerKgRecovered < 0) {
    throw new Error("carbonCapturePotentialPerKgRecovered must be >= 0");
  }
  if (factors.baselineTruckMilesPerTrip < 0 || factors.optimizedTruckMilesPerTrip < 0) {
    throw new Error("truck miles factors must be >= 0");
  }
};

/**
 * Computes net CO2 avoided as:
 * 1) gross avoided from recovered material displacement
 * 2) minus simulation operational emissions
 * 3) floored at zero to avoid negative "avoided" values in KPI dashboards
 */
export const computeCO2Avoided = (
  simulationResult: SimulationResult,
  factorOverrides?: Partial<EnvironmentalKpiFactors>,
): TonsCO2e => {
  const factors = resolvedFactors(factorOverrides);
  validateFactors(factors);

  const grossAvoided =
    toNumber(simulationResult.materialRecovered) *
    toNumber(factors.co2AvoidedPerKgRecovered);
  const netAvoided = Math.max(0, grossAvoided - toNumber(simulationResult.totalEmissions));
  return tCO2e(netAvoided);
};

/**
 * Estimates potential carbon capture from recovered material only.
 * This is separate from operational emissions and should be treated as a potential future benefit.
 */
export const computeCarbonCapturePotential = (
  simulationResult: SimulationResult,
  factorOverrides?: Partial<EnvironmentalKpiFactors>,
): TonsCO2e => {
  const factors = resolvedFactors(factorOverrides);
  validateFactors(factors);

  const potential =
    toNumber(simulationResult.materialRecovered) *
    toNumber(factors.carbonCapturePotentialPerKgRecovered);
  return tCO2e(potential);
};

/**
 * Computes avoided truck miles by comparing baseline and optimized routes
 * per trip and multiplying by the number of trips in the simulation.
 */
export const computeTruckMilesAvoided = (
  simulationResult: SimulationResult,
  factorOverrides?: Partial<EnvironmentalKpiFactors>,
): Miles => {
  const factors = resolvedFactors(factorOverrides);
  validateFactors(factors);

  const milesAvoidedPerTrip = Math.max(
    0,
    toNumber(factors.baselineTruckMilesPerTrip) -
      toNumber(factors.optimizedTruckMilesPerTrip),
  );
  return miles(simulationResult.truckTrips * milesAvoidedPerTrip);
};

