import { kg, km, tCO2e, usd, type Kilograms, type Kilometers, type TonsCO2e, type USD } from "./panelValueChain";

export type Hours = number & { readonly __brand: "Hours" };

export const hours = (value: number): Hours => value as Hours;
export const DEFAULT_TRUCK_SPEED_KM_PER_HOUR = 50;
export const DEFAULT_LOAD_UNLOAD_HOURS_PER_TRIP = 0.25;
export const DEFAULT_SIMULATION_OPTIONS = {
  truckSpeedKmPerHour: DEFAULT_TRUCK_SPEED_KM_PER_HOUR,
  loadUnloadHoursPerTrip: DEFAULT_LOAD_UNLOAD_HOURS_PER_TRIP,
} as const;

export interface UnitOfWork {
  inboundMaterial: Kilograms;
  haulDistancePerTrip: Kilometers;
}

export interface CostDrivers {
  truckCapacity: Kilograms;
  haulCostPerKm: USD;
  laborCostPerHour: USD;
  crusherProcessingCostPerKg: USD;
  grinderProcessingCostPerKg: USD;
  crusherThroughputKgPerHour: Kilograms;
  grinderThroughputKgPerHour: Kilograms;
}

export interface SustainabilityDrivers {
  haulEmissionsPerKm: TonsCO2e;
  crusherEmissionsPerKg: TonsCO2e;
  grinderEmissionsPerKg: TonsCO2e;
  crusherRecoveryRate: number;
  grinderRecoveryRate: number;
}

export interface SimulationOptions {
  useCrusher: boolean;
  truckSpeedKmPerHour?: number;
  loadUnloadHoursPerTrip?: number;
}

export interface SimulationResult {
  totalCost: USD;
  totalTime: Hours;
  totalEmissions: TonsCO2e;
  truckTrips: number;
  materialRecovered: Kilograms;
}

const toNumber = (value: number): number => value;

const validateRate = (rate: number, name: string): void => {
  if (rate < 0 || rate > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
};

const validatePositive = (value: number, name: string): void => {
  if (value <= 0) {
    throw new Error(`${name} must be > 0`);
  }
};

export const simulatePanelFlow = (
  unitOfWork: UnitOfWork,
  costDrivers: CostDrivers,
  sustainabilityDrivers: SustainabilityDrivers,
  options: SimulationOptions,
): SimulationResult => {
  const truckSpeed =
    options.truckSpeedKmPerHour ?? DEFAULT_SIMULATION_OPTIONS.truckSpeedKmPerHour;
  const loadUnloadHours =
    options.loadUnloadHoursPerTrip ??
    DEFAULT_SIMULATION_OPTIONS.loadUnloadHoursPerTrip;

  validatePositive(truckSpeed, "truckSpeedKmPerHour");
  validatePositive(loadUnloadHours, "loadUnloadHoursPerTrip");
  validatePositive(costDrivers.truckCapacity, "truckCapacity");
  validatePositive(unitOfWork.inboundMaterial, "inboundMaterial");
  validatePositive(unitOfWork.haulDistancePerTrip, "haulDistancePerTrip");

  validateRate(sustainabilityDrivers.crusherRecoveryRate, "crusherRecoveryRate");
  validateRate(sustainabilityDrivers.grinderRecoveryRate, "grinderRecoveryRate");

  const inputKg = toNumber(unitOfWork.inboundMaterial);
  const distancePerTripKm = toNumber(unitOfWork.haulDistancePerTrip);
  const trips = Math.ceil(inputKg / toNumber(costDrivers.truckCapacity));

  const processingThroughput = options.useCrusher
    ? toNumber(costDrivers.crusherThroughputKgPerHour)
    : toNumber(costDrivers.grinderThroughputKgPerHour);
  validatePositive(processingThroughput, "processingThroughputKgPerHour");

  const processingCostPerKg = options.useCrusher
    ? toNumber(costDrivers.crusherProcessingCostPerKg)
    : toNumber(costDrivers.grinderProcessingCostPerKg);

  const processEmissionsPerKg = options.useCrusher
    ? toNumber(sustainabilityDrivers.crusherEmissionsPerKg)
    : toNumber(sustainabilityDrivers.grinderEmissionsPerKg);

  const recoveryRate = options.useCrusher
    ? sustainabilityDrivers.crusherRecoveryRate
    : sustainabilityDrivers.grinderRecoveryRate;

  const totalDistanceKm = trips * distancePerTripKm;
  const haulTimeHours = totalDistanceKm / truckSpeed + trips * loadUnloadHours;
  const processingTimeHours = inputKg / processingThroughput;
  const totalTimeHours = haulTimeHours + processingTimeHours;

  const haulCost = totalDistanceKm * toNumber(costDrivers.haulCostPerKm);
  const processingCost = inputKg * processingCostPerKg;
  const laborCost = totalTimeHours * toNumber(costDrivers.laborCostPerHour);
  const totalCostValue = haulCost + processingCost + laborCost;

  const haulEmissions = totalDistanceKm * toNumber(sustainabilityDrivers.haulEmissionsPerKm);
  const processEmissions = inputKg * processEmissionsPerKg;
  const totalEmissionsValue = haulEmissions + processEmissions;

  const recoveredKg = inputKg * recoveryRate;

  return {
    totalCost: usd(totalCostValue),
    totalTime: hours(totalTimeHours),
    totalEmissions: tCO2e(totalEmissionsValue),
    truckTrips: trips,
    materialRecovered: kg(recoveredKg),
  };
};

export const makeUnitOfWork = (inboundMaterialKg: number, haulDistanceKm: number): UnitOfWork => ({
  inboundMaterial: kg(inboundMaterialKg),
  haulDistancePerTrip: km(haulDistanceKm),
});
