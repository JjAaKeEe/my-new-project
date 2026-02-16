export type Brand<T, B extends string> = T & { readonly __brand: B };

export type Kilograms = Brand<number, "Kilograms">;
export type Kilometers = Brand<number, "Kilometers">;
export type TonsCO2e = Brand<number, "TonsCO2e">;
export type USD = Brand<number, "USD">;

export const kg = (value: number): Kilograms => value as Kilograms;
export const km = (value: number): Kilometers => value as Kilometers;
export const tCO2e = (value: number): TonsCO2e => value as TonsCO2e;
export const usd = (value: number): USD => value as USD;

export type MaterialStreamKind = "Concrete" | "Substrate" | "RecycledAggregate";

export interface MaterialStreamBase {
  id: string;
  kind: MaterialStreamKind;
  weight: Kilograms;
  moistureRatio?: number;
}

export interface ConcreteStream extends MaterialStreamBase {
  kind: "Concrete";
  compressiveStrengthMpa?: number;
}

export interface SubstrateStream extends MaterialStreamBase {
  kind: "Substrate";
  organicContentRatio?: number;
}

export interface RecycledAggregateStream extends MaterialStreamBase {
  kind: "RecycledAggregate";
  gradationClass?: string;
}

export type MaterialStream =
  | ConcreteStream
  | SubstrateStream
  | RecycledAggregateStream;

export interface Truck {
  id: string;
  plateNumber: string;
  maxPayload: Kilograms;
  fuelType: "Diesel" | "Biodiesel" | "Electric";
}

export interface HaulEvent {
  id: string;
  truckId: Truck["id"];
  materialStreamId: MaterialStream["id"];
  distance: Kilometers;
  loadedWeight: Kilograms;
  happenedAt: Date;
}

export type ProcessingEquipmentKind = "Crusher" | "Grinder";

export interface ProcessingEquipmentBase {
  id: string;
  kind: ProcessingEquipmentKind;
  name: string;
  throughputPerHour: Kilograms;
  powerKw: number;
}

export interface Crusher extends ProcessingEquipmentBase {
  kind: "Crusher";
  crusherType: "Jaw" | "Cone" | "Impact";
}

export interface Grinder extends ProcessingEquipmentBase {
  kind: "Grinder";
  grinderType: "Horizontal" | "Vertical";
}

export type ProcessingEquipment = Crusher | Grinder;

export interface Emissions {
  source: "Transport" | "Processing" | "Other";
  amount: TonsCO2e;
}

export interface AvoidedEmissions {
  reason: "VirginMaterialDisplacement" | "LandfillDiversion" | "Other";
  amount: TonsCO2e;
}

export interface CarbonCapture {
  method: "Mineralization" | "DirectAirCapture" | "Biochar" | "Other";
  amount: TonsCO2e;
}

export interface EnvironmentalMetrics {
  emissions: Emissions[];
  avoidedEmissions: AvoidedEmissions[];
  carbonCapture: CarbonCapture[];
}

export interface Cost {
  category:
    | "Transport"
    | "Labor"
    | "Fuel"
    | "Maintenance"
    | "Disposal"
    | "Other";
  amount: USD;
}

export interface Revenue {
  stream: "AggregateSales" | "TippingFees" | "CarbonCredits" | "Other";
  amount: USD;
}

export interface FinancialMetrics {
  costs: Cost[];
  revenues: Revenue[];
}

export interface PanelValueChain {
  materialStreams: MaterialStream[];
  trucks: Truck[];
  haulEvents: HaulEvent[];
  equipment: ProcessingEquipment[];
  environmental: EnvironmentalMetrics;
  financial: FinancialMetrics;
}

const sum = <T>(items: T[], selector: (item: T) => number): number =>
  items.reduce((total, item) => total + selector(item), 0);

export const totalMaterialWeight = (streams: readonly MaterialStream[]): Kilograms =>
  kg(sum([...streams], (stream) => stream.weight));

export const totalHaulDistance = (events: readonly HaulEvent[]): Kilometers =>
  km(sum([...events], (event) => event.distance));

export const totalCO2Avoided = (metrics: EnvironmentalMetrics): TonsCO2e =>
  tCO2e(
    sum(metrics.avoidedEmissions, (item) => item.amount) +
      sum(metrics.carbonCapture, (item) => item.amount),
  );

export const netCost = (metrics: FinancialMetrics): USD =>
  usd(
    sum(metrics.costs, (item) => item.amount) -
      sum(metrics.revenues, (item) => item.amount),
  );
