import {
  CIRCULAR_PANEL_VALUE_CHAIN_CSI_BINDINGS,
  CSI_MASTERFORMAT_SECTIONS,
  LINEAR_PANEL_VALUE_CHAIN_CSI_BINDINGS,
  type PanelValueChainStage,
} from "@rainier/core";
import styles from "./page.module.css";

interface StageNarrative {
  decision: string;
  frictionLoop: string;
}

const STAGE_NARRATIVE: Record<PanelValueChainStage, StageNarrative> = {
  intake_spec: {
    decision: "Freeze windows and spec readiness are locked before demo release.",
    frictionLoop:
      "Late spec edits trigger resequencing, expedite purchasing, and cost plus emissions spikes.",
  },
  demo: {
    decision: "Selective demo scope is set to preserve recoverable concrete and substrate.",
    frictionLoop:
      "Overbreak or poor sorting increases residuals, which compounds haul and disposal load.",
  },
  haul_dispose: {
    decision: "Haul routing and destination choice are set before dispatch.",
    frictionLoop:
      "Queueing and long routes force extra truck hours, raising cost and tailpipe intensity.",
  },
  procurement: {
    decision: "Supplier coordination aligns PO timing with confirmed reuse yield.",
    frictionLoop:
      "Unclear handoff timing causes parallel virgin ordering and emergency deliveries.",
  },
  batch_plant: {
    decision: "Blend targets and QA test windows are agreed before batching.",
    frictionLoop:
      "Failed batch verification forces remixes and additional transport cycles.",
  },
  pour: {
    decision: "Pour sequencing is locked against crew availability and cure constraints.",
    frictionLoop:
      "Window slips create standby labor and rework risk, feeding back into procurement urgency.",
  },
  reopen: {
    decision: "Reopen timing is tied to explicit cure and inspection readiness criteria.",
    frictionLoop:
      "Compressed reopen commitments drive overtime and post-pour patching pressure.",
  },
  grind: {
    decision: "Grind profile and processing location are chosen to match reuse spec.",
    frictionLoop:
      "Gradation misses cause regrind loops, adding energy use and schedule drag.",
  },
  reuse_near_site: {
    decision: "Reuse percentage and on/near-site staging are set up front.",
    frictionLoop:
      "Staging conflicts create double-handling and lower realized reuse capture.",
  },
  reduced_procurement: {
    decision: "Virgin procurement is reduced only after verified recovered stock is posted.",
    frictionLoop:
      "Late supplier updates preserve baseline PO volumes and erase reuse savings.",
  },
  reduced_haul: {
    decision: "Dispatch prioritizes short-haul transfers over landfill disposal legs.",
    frictionLoop:
      "Late routing decisions drift toward baseline haul patterns and emissions rebound.",
  },
};

const formatCsiBindings = (sectionKeys: readonly (keyof typeof CSI_MASTERFORMAT_SECTIONS)[]) => {
  if (sectionKeys.length === 0) {
    return ["No direct MasterFormat section binding."];
  }
  return sectionKeys.map((sectionKey) => {
    const section = CSI_MASTERFORMAT_SECTIONS[sectionKey];
    return `${section.code} - ${section.title}`;
  });
};

const FlowSequence = ({
  labels,
}: {
  labels: readonly string[];
}) => (
  <div className={styles.sequence}>
    {labels.map((label, index) => (
      <div key={label} className={styles.sequenceStep}>
        <span className={styles.sequenceLabel}>{label}</span>
        {index < labels.length - 1 ? (
          <span className={styles.sequenceArrow}>{"->"}</span>
        ) : null}
      </div>
    ))}
  </div>
);

const FlowGrid = ({
  nodes,
}: {
  nodes: typeof LINEAR_PANEL_VALUE_CHAIN_CSI_BINDINGS | typeof CIRCULAR_PANEL_VALUE_CHAIN_CSI_BINDINGS;
}) => (
  <div className={styles.grid}>
    {nodes.map((node) => {
      const narrative = STAGE_NARRATIVE[node.stage];
      const csiBindings = formatCsiBindings(node.csiSections);
      return (
        <article key={node.stage} className={styles.nodeCard}>
          <h3>{node.label}</h3>
          <p className={styles.metaLabel}>CSI Binding</p>
          <p className={styles.metaValue}>{csiBindings.join(" | ")}</p>
          <p className={styles.metaLabel}>Upstream Decision</p>
          <p className={styles.metaValue}>{narrative.decision}</p>
          <p className={styles.metaLabel}>Friction + Feedback Loop</p>
          <p className={styles.metaValue}>{narrative.frictionLoop}</p>
        </article>
      );
    })}
  </div>
);

export default function ValueChainPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Panel Value Chain Map</h1>
        <p>
          Compact view of the baseline linear chain and circular alternative with CSI
          MasterFormat bindings, waste-driving decisions, and loop risks.
        </p>
      </header>

      <section className={styles.section}>
        <h2>Linear Sequence</h2>
        <FlowSequence labels={LINEAR_PANEL_VALUE_CHAIN_CSI_BINDINGS.map((node) => node.label)} />
        <FlowGrid nodes={LINEAR_PANEL_VALUE_CHAIN_CSI_BINDINGS} />
      </section>

      <section className={styles.section}>
        <h2>Circular Alternative</h2>
        <FlowSequence labels={CIRCULAR_PANEL_VALUE_CHAIN_CSI_BINDINGS.map((node) => node.label)} />
        <FlowGrid nodes={CIRCULAR_PANEL_VALUE_CHAIN_CSI_BINDINGS} />
      </section>
    </main>
  );
}
