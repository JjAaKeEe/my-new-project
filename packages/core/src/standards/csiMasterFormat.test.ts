import { describe, expect, it } from "vitest";
import {
  CIRCULAR_PANEL_VALUE_CHAIN_CSI_BINDINGS,
  CSI_MASTERFORMAT_SECTIONS,
  LINEAR_PANEL_VALUE_CHAIN_CSI_BINDINGS,
} from "./csiMasterFormat";

describe("CSI MasterFormat standards", () => {
  it("exposes stable canonical section codes for panel value chain mapping", () => {
    expect(CSI_MASTERFORMAT_SECTIONS.projectManagementCoordination.code).toBe(
      "01 31 00",
    );
    expect(CSI_MASTERFORMAT_SECTIONS.wasteManagementDisposal.code).toBe(
      "01 74 19",
    );
    expect(CSI_MASTERFORMAT_SECTIONS.selectiveDemolition.code).toBe("02 41 13");
    expect(CSI_MASTERFORMAT_SECTIONS.castInPlaceConcrete.code).toBe("03 30 00");
  });

  it("keeps linear and circular bindings deterministic for UI consumers", () => {
    expect(LINEAR_PANEL_VALUE_CHAIN_CSI_BINDINGS.map((node) => node.stage)).toEqual([
      "intake_spec",
      "demo",
      "haul_dispose",
      "procurement",
      "batch_plant",
      "pour",
      "reopen",
    ]);
    expect(CIRCULAR_PANEL_VALUE_CHAIN_CSI_BINDINGS.map((node) => node.stage)).toEqual([
      "demo",
      "grind",
      "reuse_near_site",
      "reduced_procurement",
      "reduced_haul",
    ]);
  });
});
