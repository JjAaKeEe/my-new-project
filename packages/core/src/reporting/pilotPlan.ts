const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const formatNumber = (value: number, digits = 2): string =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const formatUsd = (value: number, digits = 2): string => {
  const absolute = formatNumber(Math.abs(value), digits);
  return value < 0 ? `-$${absolute}` : `$${absolute}`;
};

export type PilotScenarioMode = "baseline" | "grinder" | "grinder+reuse";

export interface PilotScenarioOptions {
  mode: PilotScenarioMode;
  reuseUptakeRate: number;
  specReadiness: number;
  grinderUtilization?: number;
}

export interface PilotMetricsInput {
  truckTripsAvoidedPerPanel: number;
  tonsDivertedPerPanel: number;
  marginDeltaUsdPerPanel: number;
  co2AvoidedTonsPerPanel: number;
}

export interface PilotPlanInput {
  scenarioOptions: PilotScenarioOptions;
  metrics: PilotMetricsInput;
  testLocation?: string;
  panelsPerWeek?: 2 | 3 | 4;
  durationWeeks?: number;
}

export type PilotMetricId =
  | "truckTripsAvoided"
  | "tonsDiverted"
  | "marginDeltaUsdPerPanel"
  | "co2Avoided";

export interface PilotMetricPlan {
  id: PilotMetricId;
  label: string;
  perPanel: number;
  pilotTotal: number;
}

export type PilotRiskType =
  | "quality/spec compliance"
  | "grinder uptime"
  | "schedule risk";

export interface PilotRiskPlan {
  type: PilotRiskType;
  mitigation: string;
}

export interface PilotPlanResult {
  durationWeeks: number;
  panelsPerWeek: number;
  totalPanels: number;
  testLocation: string;
  selectedMetrics: readonly PilotMetricPlan[];
  dataSources: readonly string[];
  keyRisk: PilotRiskPlan;
  paragraph: string;
}

export const DEFAULT_PILOT_DATA_SOURCES = [
  "tickets",
  "scale slips",
  "dispatch logs",
  "batch tickets",
] as const;

const ensureUnitInterval = (value: number, name: string): void => {
  if (value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
};

const ensureNonNegative = (value: number, name: string): void => {
  if (value < 0) {
    throw new Error(`${name} must be >= 0`);
  }
};

const validateInput = (input: PilotPlanInput): void => {
  ensureUnitInterval(input.scenarioOptions.reuseUptakeRate, "reuseUptakeRate");
  ensureUnitInterval(input.scenarioOptions.specReadiness, "specReadiness");

  if (input.scenarioOptions.grinderUtilization !== undefined) {
    ensureUnitInterval(input.scenarioOptions.grinderUtilization, "grinderUtilization");
  }

  ensureNonNegative(input.metrics.truckTripsAvoidedPerPanel, "truckTripsAvoidedPerPanel");
  ensureNonNegative(input.metrics.tonsDivertedPerPanel, "tonsDivertedPerPanel");
  ensureNonNegative(input.metrics.co2AvoidedTonsPerPanel, "co2AvoidedTonsPerPanel");

  if (input.panelsPerWeek !== undefined && ![2, 3, 4].includes(input.panelsPerWeek)) {
    throw new Error("panelsPerWeek must be 2, 3, or 4");
  }
  if (
    input.durationWeeks !== undefined &&
    (input.durationWeeks < 4 || input.durationWeeks > 8)
  ) {
    throw new Error("durationWeeks must be between 4 and 8");
  }
};

const derivePanelsPerWeek = (scenario: PilotScenarioOptions): number => {
  let cadence = scenario.mode === "baseline" ? 4 : scenario.mode === "grinder" ? 3 : 2;
  if (scenario.specReadiness < 0.6) {
    cadence = 2;
  } else if (scenario.specReadiness > 0.9 && scenario.mode !== "grinder+reuse") {
    cadence = Math.min(4, cadence + 1);
  }
  return clamp(cadence, 2, 4);
};

const deriveDurationWeeks = (scenario: PilotScenarioOptions): number => {
  let weeks = scenario.mode === "baseline" ? 4 : scenario.mode === "grinder" ? 5 : 6;
  if (scenario.reuseUptakeRate >= 0.35) {
    weeks += 1;
  }
  if (scenario.specReadiness < 0.7) {
    weeks += 1;
  }
  return clamp(weeks, 4, 8);
};

const selectMetricIds = (scenario: PilotScenarioOptions): readonly PilotMetricId[] => {
  if (scenario.mode === "grinder+reuse") {
    return ["tonsDiverted", "marginDeltaUsdPerPanel", "co2Avoided"];
  }
  if (scenario.mode === "grinder") {
    return ["truckTripsAvoided", "tonsDiverted", "co2Avoided"];
  }
  return ["truckTripsAvoided", "marginDeltaUsdPerPanel"];
};

const metricFromId = (
  metricId: PilotMetricId,
  metrics: PilotMetricsInput,
  totalPanels: number,
): PilotMetricPlan => {
  switch (metricId) {
    case "truckTripsAvoided":
      return {
        id: metricId,
        label: "truck trips avoided",
        perPanel: metrics.truckTripsAvoidedPerPanel,
        pilotTotal: metrics.truckTripsAvoidedPerPanel * totalPanels,
      };
    case "tonsDiverted":
      return {
        id: metricId,
        label: "tons diverted",
        perPanel: metrics.tonsDivertedPerPanel,
        pilotTotal: metrics.tonsDivertedPerPanel * totalPanels,
      };
    case "marginDeltaUsdPerPanel":
      return {
        id: metricId,
        label: "$/panel margin delta",
        perPanel: metrics.marginDeltaUsdPerPanel,
        pilotTotal: metrics.marginDeltaUsdPerPanel * totalPanels,
      };
    case "co2Avoided":
      return {
        id: metricId,
        label: "CO2 avoided",
        perPanel: metrics.co2AvoidedTonsPerPanel,
        pilotTotal: metrics.co2AvoidedTonsPerPanel * totalPanels,
      };
  }
};

const chooseRisk = (scenario: PilotScenarioOptions): PilotRiskPlan => {
  if (scenario.mode === "grinder+reuse" || scenario.reuseUptakeRate >= 0.35) {
    return {
      type: "quality/spec compliance",
      mitigation:
        "locking gradation bands, running hold-point tests on early pours, and routing out-of-spec grind to non-structural use to protect schedule",
    };
  }

  if ((scenario.grinderUtilization ?? 0) >= 0.85) {
    return {
      type: "grinder uptime",
      mitigation:
        "pre-staging wear parts, using preventive maintenance checks each shift, and keeping a backup haul path for missed grind windows",
    };
  }

  return {
    type: "schedule risk",
    mitigation:
      "holding a 72-hour freeze window, running daily dispatch/spec coordination, and carrying one buffer panel each week",
  };
};

const formatMetricPhrase = (metric: PilotMetricPlan): string => {
  if (metric.id === "marginDeltaUsdPerPanel") {
    return `${metric.label} (${formatUsd(metric.perPanel)}/panel; ${formatUsd(metric.pilotTotal)} total)`;
  }

  if (metric.id === "tonsDiverted") {
    return `${metric.label} (${formatNumber(metric.perPanel, 3)} tons/panel; ${formatNumber(metric.pilotTotal, 3)} tons total)`;
  }

  if (metric.id === "co2Avoided") {
    return `${metric.label} (${formatNumber(metric.perPanel, 4)} tons/panel; ${formatNumber(metric.pilotTotal, 4)} tons total)`;
  }

  return `${metric.label} (${formatNumber(metric.perPanel, 2)}/panel; ${formatNumber(metric.pilotTotal, 2)} total)`;
};

const formatMetricList = (metrics: readonly PilotMetricPlan[]): string => {
  if (metrics.length === 0) {
    return "";
  }
  if (metrics.length === 1) {
    return formatMetricPhrase(metrics[0]);
  }
  if (metrics.length === 2) {
    return `${formatMetricPhrase(metrics[0])} and ${formatMetricPhrase(metrics[1])}`;
  }
  return `${formatMetricPhrase(metrics[0])}, ${formatMetricPhrase(metrics[1])}, and ${formatMetricPhrase(metrics[2])}`;
};

const formatScenarioLabel = (mode: PilotScenarioMode): string => {
  if (mode === "grinder+reuse") {
    return "grinder+reuse";
  }
  return mode;
};

export const generatePilotPlan = (input: PilotPlanInput): PilotPlanResult => {
  validateInput(input);

  const durationWeeks = input.durationWeeks ?? deriveDurationWeeks(input.scenarioOptions);
  const panelsPerWeek = input.panelsPerWeek ?? derivePanelsPerWeek(input.scenarioOptions);
  const totalPanels = durationWeeks * panelsPerWeek;
  const testLocation = input.testLocation?.trim() || "a single corridor";

  const selectedMetricIds = selectMetricIds(input.scenarioOptions);
  const selectedMetrics = selectedMetricIds.map((metricId) =>
    metricFromId(metricId, input.metrics, totalPanels),
  );

  const keyRisk = chooseRisk(input.scenarioOptions);
  const metricText = formatMetricList(selectedMetrics);
  const dataSourcesText = DEFAULT_PILOT_DATA_SOURCES.join(", ");
  const scenarioLabel = formatScenarioLabel(input.scenarioOptions.mode);

  const paragraph = [
    `A ${durationWeeks}-week pilot will run in ${testLocation} at ${panelsPerWeek} panels/week (${totalPanels} panels total) for the ${scenarioLabel} scenario with a ${formatNumber(input.scenarioOptions.reuseUptakeRate * 100, 1)}% reuse target and ${formatNumber(input.scenarioOptions.specReadiness * 100, 1)}% spec readiness.`,
    `Primary metrics are ${metricText}.`,
    `Data will be reconciled from ${dataSourcesText} for an auditable weekly readout.`,
    `The key tradeoff is ${keyRisk.type}; mitigation is ${keyRisk.mitigation}.`,
  ].join(" ");

  return {
    durationWeeks,
    panelsPerWeek,
    totalPanels,
    testLocation,
    selectedMetrics,
    dataSources: DEFAULT_PILOT_DATA_SOURCES,
    keyRisk,
    paragraph,
  };
};
