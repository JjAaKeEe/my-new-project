"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./page.module.css";

type ScenarioMode = "baseline" | "grinder" | "grinder+reuse";

interface LabFormState {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  substrateRemovalIn: number;
  useGrinder: boolean;
  reusePercent: number;
  haulDistanceMiles: number;
  truckCapacityTons: number;
  disposalRatePerTon: number;
  virginAggregateCostPerTon: number;
}

interface SimulateResponse {
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
    avoidedTonsCO2e: number;
    estimatedUptakeTonsCO2e: number;
  };
  financialDeltas: {
    baselineCostUsd: number;
    scenarioCostUsd: number;
    deltaCostUsd: number;
    baselineCostPerRecoveredKg: number | null;
  };
  audit: {
    worksheet: unknown;
    methodology: string;
  };
  traceId: string;
}

const DEFAULT_FORM: LabFormState = {
  lengthIn: 15,
  widthIn: 15,
  heightIn: 8,
  substrateRemovalIn: 6,
  useGrinder: true,
  reusePercent: 30,
  haulDistanceMiles: 18,
  truckCapacityTons: 2,
  disposalRatePerTon: 42,
  virginAggregateCostPerTon: 34,
};

const CUBIC_INCH_TO_CUBIC_METER = 1.6387064e-5;
const MILES_TO_KM = 1.609344;
const SHORT_TON_TO_KG = 907.18474;
const BULK_DENSITY_KG_PER_M3 = 1900;

const BASE_COST_DRIVERS = {
  haulCostPerKm: 3,
  laborCostPerHour: 40,
  crusherProcessingCostPerKg: 0.02,
  grinderProcessingCostPerKg: 0.03,
  crusherThroughputKgPerHour: 2500,
  grinderThroughputKgPerHour: 2000,
} as const;

const BASE_SUSTAINABILITY_DRIVERS = {
  haulEmissionsPerKm: 0.001,
  crusherEmissionsPerKg: 0.00004,
  grinderEmissionsPerKg: 0.00006,
  crusherRecoveryRate: 0.82,
  grinderRecoveryRate: 0.75,
} as const;

const format = (value: number, digits = 2): string =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toTon = (kg: number): number => kg / SHORT_TON_TO_KG;

const buildScenarioPayload = (form: LabFormState) => {
  const clampedRemovalIn = clamp(form.substrateRemovalIn, 0, form.heightIn);
  const processableHeightIn = Math.max(0, form.heightIn - clampedRemovalIn);
  const processableVolumeM3 =
    form.lengthIn * form.widthIn * processableHeightIn * CUBIC_INCH_TO_CUBIC_METER;
  const inboundMaterialKg = processableVolumeM3 * BULK_DENSITY_KG_PER_M3;

  const mode: ScenarioMode = form.useGrinder
    ? form.reusePercent > 0
      ? "grinder+reuse"
      : "grinder"
    : "baseline";

  return {
    unitOfWork: {
      inboundMaterial: inboundMaterialKg,
      haulDistancePerTrip: form.haulDistanceMiles * MILES_TO_KM,
    },
    costDrivers: {
      truckCapacity: form.truckCapacityTons * SHORT_TON_TO_KG,
      ...BASE_COST_DRIVERS,
    },
    sustainabilityDrivers: BASE_SUSTAINABILITY_DRIVERS,
    scenarioOptions: {
      mode,
      reuseUptakeRate: clamp(form.reusePercent / 100, 0, 1),
    },
  };
};

const computeMarginDelta = (result: SimulateResponse, form: LabFormState): number => {
  const baselineRecoveredKg =
    result.financialDeltas.baselineCostPerRecoveredKg &&
    result.financialDeltas.baselineCostPerRecoveredKg > 0
      ? result.financialDeltas.baselineCostUsd /
        result.financialDeltas.baselineCostPerRecoveredKg
      : 0;

  const baselineResidualKg = Math.max(
    0,
    result.outputs.materialFlows.inboundKg - baselineRecoveredKg,
  );

  const baselineDisposal = toTon(baselineResidualKg) * form.disposalRatePerTon;
  const scenarioDisposal =
    toTon(result.outputs.materialFlows.landfillKg) * form.disposalRatePerTon;

  const baselineVirginValue =
    toTon(baselineRecoveredKg) * form.virginAggregateCostPerTon;
  const scenarioVirginValue =
    toTon(result.outputs.materialFlows.recoveredKg) * form.virginAggregateCostPerTon;

  const baselineMargin =
    baselineVirginValue - result.financialDeltas.baselineCostUsd - baselineDisposal;
  const scenarioMargin =
    scenarioVirginValue - result.outputs.costUsd - scenarioDisposal;

  return scenarioMargin - baselineMargin;
};

export default function Page() {
  const [form, setForm] = useState<LabFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulateResponse | null>(null);

  const marginDelta = useMemo(() => {
    if (!result) {
      return 0;
    }
    return computeMarginDelta(result, form);
  }, [result, form]);

  const methodologyParagraph = useMemo(() => {
    if (!result) {
      return "Run a scenario to generate a reproducible methodology narrative.";
    }
    return result.audit.methodology.replace(/\n+/g, " ");
  }, [result]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(buildScenarioPayload(form)),
      });

      const body = (await response.json()) as SimulateResponse | { error: string };
      if (!response.ok) {
        throw new Error("error" in body ? body.error : "Simulation failed");
      }

      setResult(body as SimulateResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Upstream Innovation Lab</h1>

      <div className={styles.topGrid}>
        <section className={styles.panel}>
          <h2>Scenario Builder</h2>
          <form onSubmit={onSubmit} className={styles.form}>
            <label>
              Panel length (in)
              <input
                type="number"
                value={form.lengthIn}
                onChange={(e) => setForm({ ...form, lengthIn: Number(e.target.value) })}
              />
            </label>
            <label>
              Panel width (in)
              <input
                type="number"
                value={form.widthIn}
                onChange={(e) => setForm({ ...form, widthIn: Number(e.target.value) })}
              />
            </label>
            <label>
              Panel height (in)
              <input
                type="number"
                value={form.heightIn}
                onChange={(e) => setForm({ ...form, heightIn: Number(e.target.value) })}
              />
            </label>
            <label>
              Substrate removal (in)
              <input
                type="number"
                value={form.substrateRemovalIn}
                onChange={(e) =>
                  setForm({ ...form, substrateRemovalIn: Number(e.target.value) })
                }
              />
            </label>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={form.useGrinder}
                onChange={(e) => setForm({ ...form, useGrinder: e.target.checked })}
              />
              Enable grinder path
            </label>
            <label>
              Reuse (%)
              <input
                type="number"
                min={0}
                max={100}
                value={form.reusePercent}
                onChange={(e) => setForm({ ...form, reusePercent: Number(e.target.value) })}
              />
            </label>
            <label>
              Haul distance (mi)
              <input
                type="number"
                value={form.haulDistanceMiles}
                onChange={(e) =>
                  setForm({ ...form, haulDistanceMiles: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Truck capacity (tons)
              <input
                type="number"
                value={form.truckCapacityTons}
                onChange={(e) =>
                  setForm({ ...form, truckCapacityTons: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Disposal rate ($/ton)
              <input
                type="number"
                value={form.disposalRatePerTon}
                onChange={(e) =>
                  setForm({ ...form, disposalRatePerTon: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Virgin aggregate cost ($/ton)
              <input
                type="number"
                value={form.virginAggregateCostPerTon}
                onChange={(e) =>
                  setForm({ ...form, virginAggregateCostPerTon: Number(e.target.value) })
                }
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Running..." : "Run scenario"}
            </button>
            {error ? <p className={styles.error}>{error}</p> : null}
          </form>
        </section>

        <section className={styles.panel}>
          <h2>Results</h2>
          {result ? (
            <div className={styles.resultsGrid}>
              <div>
                <span>Cost delta</span>
                <strong>{format(result.financialDeltas.deltaCostUsd)} USD</strong>
              </div>
              <div>
                <span>Margin delta</span>
                <strong>{format(marginDelta)} USD</strong>
              </div>
              <div>
                <span>Avoided emissions</span>
                <strong>{format(result.emissions.avoidedTonsCO2e, 4)} tCO2e</strong>
              </div>
              <div>
                <span>Estimated uptake</span>
                <strong>{format(result.emissions.estimatedUptakeTonsCO2e, 4)} tCO2e</strong>
              </div>
              <div>
                <span>Trace</span>
                <strong>{result.traceId}</strong>
              </div>
            </div>
          ) : (
            <p className={styles.placeholder}>Run the scenario to view deltas and emissions.</p>
          )}
        </section>
      </div>

      <section className={styles.panel}>
        <h2>Audit</h2>
        <p className={styles.methodology}>{methodologyParagraph}</p>
        <details>
          <summary>Show-Your-Work worksheet JSON</summary>
          <pre className={styles.pre}>
            {result
              ? JSON.stringify(result.audit.worksheet, null, 2)
              : "No worksheet yet."}
          </pre>
        </details>
      </section>
    </main>
  );
}
