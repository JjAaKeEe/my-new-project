export interface CsiMasterFormatSection {
  code: string;
  title: string;
  division: string;
}

export const CSI_MASTERFORMAT_SECTIONS = {
  projectManagementCoordination: {
    code: "01 31 00",
    title: "Project Management and Coordination",
    division: "Division 01 - General Requirements",
  },
  submittalProcedures: {
    code: "01 33 00",
    title: "Submittal Procedures",
    division: "Division 01 - General Requirements",
  },
  wasteManagementDisposal: {
    code: "01 74 19",
    title: "Construction Waste Management and Disposal",
    division: "Division 01 - General Requirements",
  },
  selectiveDemolition: {
    code: "02 41 13",
    title: "Selective Site Demolition",
    division: "Division 02 - Existing Conditions",
  },
  commonConcreteRequirements: {
    code: "03 05 00",
    title: "Common Work Results for Concrete",
    division: "Division 03 - Concrete",
  },
  castInPlaceConcrete: {
    code: "03 30 00",
    title: "Cast-in-Place Concrete",
    division: "Division 03 - Concrete",
  },
  earthMoving: {
    code: "31 20 00",
    title: "Earth Moving",
    division: "Division 31 - Earthwork",
  },
  aggregateBaseCourses: {
    code: "32 11 23",
    title: "Aggregate Base Courses",
    division: "Division 32 - Exterior Improvements",
  },
} as const satisfies Record<string, CsiMasterFormatSection>;

export type CsiMasterFormatSectionKey = keyof typeof CSI_MASTERFORMAT_SECTIONS;

export type PanelValueChainStage =
  | "intake_spec"
  | "demo"
  | "haul_dispose"
  | "procurement"
  | "batch_plant"
  | "pour"
  | "reopen"
  | "grind"
  | "reuse_near_site"
  | "reduced_procurement"
  | "reduced_haul";

export interface PanelValueChainStandardBinding {
  stage: PanelValueChainStage;
  label: string;
  csiSections: readonly CsiMasterFormatSectionKey[];
}

export const LINEAR_PANEL_VALUE_CHAIN_CSI_BINDINGS: readonly PanelValueChainStandardBinding[] =
  [
    {
      stage: "intake_spec",
      label: "Intake / Spec",
      csiSections: ["projectManagementCoordination", "submittalProcedures"],
    },
    {
      stage: "demo",
      label: "Demo",
      csiSections: ["selectiveDemolition", "wasteManagementDisposal"],
    },
    {
      stage: "haul_dispose",
      label: "Haul / Dispose",
      csiSections: ["wasteManagementDisposal"],
    },
    {
      stage: "procurement",
      label: "Procurement",
      csiSections: ["commonConcreteRequirements", "castInPlaceConcrete"],
    },
    {
      stage: "batch_plant",
      label: "Batch Plant",
      csiSections: ["commonConcreteRequirements", "castInPlaceConcrete"],
    },
    {
      stage: "pour",
      label: "Pour",
      csiSections: ["castInPlaceConcrete"],
    },
    {
      stage: "reopen",
      label: "Reopen",
      csiSections: [],
    },
  ];

export const CIRCULAR_PANEL_VALUE_CHAIN_CSI_BINDINGS: readonly PanelValueChainStandardBinding[] =
  [
    {
      stage: "demo",
      label: "Demo",
      csiSections: ["selectiveDemolition", "wasteManagementDisposal"],
    },
    {
      stage: "grind",
      label: "Grind",
      csiSections: ["selectiveDemolition", "wasteManagementDisposal"],
    },
    {
      stage: "reuse_near_site",
      label: "Reuse On/Near Site",
      csiSections: ["earthMoving", "aggregateBaseCourses"],
    },
    {
      stage: "reduced_procurement",
      label: "Reduced Procurement",
      csiSections: ["commonConcreteRequirements", "castInPlaceConcrete"],
    },
    {
      stage: "reduced_haul",
      label: "Reduced Haul",
      csiSections: ["wasteManagementDisposal"],
    },
  ];
