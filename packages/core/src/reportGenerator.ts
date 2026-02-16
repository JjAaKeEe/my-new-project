import { type Kilograms, type TonsCO2e, type USD } from "./panelValueChain";
import { type ScenarioAnalysisResult } from "./scenarioModel";

export type ReportSectionId =
  | "problemContext"
  | "wasteBaseline"
  | "simulationResults"
  | "quantifiedImpact"
  | "environmentalKpis"
  | "investmentMetrics";

export interface AcademicReportSection {
  id: ReportSectionId;
  title: string;
  content: string;
}

export interface BaselineReference {
  totalCost: USD;
  totalEmissions: TonsCO2e;
  materialRecovered: Kilograms;
  truckTrips: number;
}

export interface ReportInvestmentMetrics {
  npv: USD;
  irr: number | null;
  paybackPeriod: number | null;
}

export interface AcademicReportInput {
  problemContext: string;
  wasteBaseline: string;
  scenario: ScenarioAnalysisResult;
  baselineReference: BaselineReference;
  investmentMetrics: ReportInvestmentMetrics;
}

export interface AcademicReport {
  sections: readonly AcademicReportSection[];
  markdown: string;
}

const toNumber = (value: number): number => value;

const format = (value: number, digits = 2): string =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const percentDelta = (baseline: number, current: number): number => {
  if (baseline === 0) {
    return 0;
  }
  return ((current - baseline) / baseline) * 100;
};

export const generateAcademicSustainabilityReport = (
  input: AcademicReportInput,
): AcademicReport => {
  const baselineCost = toNumber(input.baselineReference.totalCost);
  const baselineEmissions = toNumber(input.baselineReference.totalEmissions);
  const baselineRecovered = toNumber(input.baselineReference.materialRecovered);
  const baselineTrips = input.baselineReference.truckTrips;

  const scenarioCost = toNumber(input.scenario.simulationResult.totalCost);
  const scenarioEmissions = toNumber(input.scenario.simulationResult.totalEmissions);
  const scenarioRecovered = toNumber(input.scenario.simulationResult.materialRecovered);
  const scenarioTrips = input.scenario.simulationResult.truckTrips;

  const costDelta = scenarioCost - baselineCost;
  const emissionsDelta = scenarioEmissions - baselineEmissions;
  const recoveredDelta = scenarioRecovered - baselineRecovered;
  const tripDelta = scenarioTrips - baselineTrips;

  const sections: AcademicReportSection[] = [
    {
      id: "problemContext",
      title: "Problem Context",
      content: input.problemContext,
    },
    {
      id: "wasteBaseline",
      title: "Waste Baseline",
      content: `${input.wasteBaseline} Baseline totals are ${format(
        baselineCost,
      )} USD cost, ${format(baselineEmissions, 4)} tCO2e emissions, ${format(
        baselineRecovered,
        2,
      )} kg recovered material, and ${baselineTrips} truck trips.`,
    },
    {
      id: "simulationResults",
      title: "Simulation Results",
      content: `The ${input.scenario.mode.toLowerCase()} scenario produces ${format(
        scenarioRecovered,
        2,
      )} kg recovered material with ${format(scenarioCost)} USD total cost, ${format(
        scenarioEmissions,
        4,
      )} tCO2e total emissions, and ${scenarioTrips} truck trips.`,
    },
    {
      id: "quantifiedImpact",
      title: "Quantified Impact",
      content: `Compared with baseline, total cost changes by ${format(
        costDelta,
      )} USD (${format(percentDelta(baselineCost, scenarioCost), 2)}%), emissions change by ${format(
        emissionsDelta,
        4,
      )} tCO2e (${format(percentDelta(baselineEmissions, scenarioEmissions), 2)}%), recovered material changes by ${format(
        recoveredDelta,
        2,
      )} kg, and truck trips change by ${tripDelta}.`,
    },
    {
      id: "environmentalKpis",
      title: "Environmental KPIs",
      content: `Computed KPIs indicate ${format(
        toNumber(input.scenario.environmentalKpis.co2Avoided),
        4,
      )} tCO2e avoided, ${format(
        toNumber(input.scenario.environmentalKpis.carbonCapturePotential),
        4,
      )} tCO2e capture potential, ${format(
        toNumber(input.scenario.environmentalKpis.truckMilesAvoided),
        2,
      )} truck miles avoided, and ${format(
        input.scenario.environmentalKpis.avoidedEmissionPercentage,
        2,
      )}% avoided-emission ratio.`,
    },
    {
      id: "investmentMetrics",
      title: "Investment Metrics",
      content: `Investment evaluation reports NPV ${format(
        toNumber(input.investmentMetrics.npv),
      )} USD, IRR ${
        input.investmentMetrics.irr === null
          ? "N/A"
          : `${format(input.investmentMetrics.irr * 100, 2)}%`
      }, and payback period ${
        input.investmentMetrics.paybackPeriod === null
          ? "N/A"
          : `${format(input.investmentMetrics.paybackPeriod, 2)} periods`
      }.`,
    },
  ];

  const markdown = sections
    .map((section) => `## ${section.title}\n\n${section.content}`)
    .join("\n\n");

  return { sections, markdown };
};
