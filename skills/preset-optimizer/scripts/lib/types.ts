// Shared types and the approved six-agent slim 3.x profile set.
// Order is canonical: orchestrator, oracle, council, explorer, designer, fixer.
// librarian aliases explorer; there is no observer.

export type AgentName =
  | "orchestrator"
  | "oracle"
  | "council"
  | "explorer"
  | "designer"
  | "fixer";

export interface Profile {
  /** slim agent kind, informational only (ECI quality is model-level) */
  kind: "rank" | "intelligence" | "coding";
  minContext: number;
  vision: boolean;
  tools: boolean;
  /** variant ladder: first variant id actually offered by the model wins; no inference */
  ladder: string[];
  /** output-price multiplier: effectivePrice = input + output * weight */
  outputWeight: number;
}

export const AGENT_ORDER: AgentName[] = [
  "orchestrator",
  "oracle",
  "council",
  "explorer",
  "designer",
  "fixer",
];

export const PROFILES: Record<AgentName, Profile> = {
  orchestrator: { kind: "rank", minContext: 128_000, vision: false, tools: true, ladder: ["high", "medium", "max"], outputWeight: 3 },
  oracle: { kind: "intelligence", minContext: 200_000, vision: false, tools: true, ladder: ["max", "high", "medium"], outputWeight: 4 },
  council: { kind: "rank", minContext: 128_000, vision: false, tools: true, ladder: ["high", "medium", "max"], outputWeight: 3 },
  explorer: { kind: "coding", minContext: 64_000, vision: false, tools: true, ladder: ["low", "minimal", "medium"], outputWeight: 1.5 },
  designer: { kind: "rank", minContext: 128_000, vision: true, tools: true, ladder: ["medium", "high", "low"], outputWeight: 2 },
  fixer: { kind: "coding", minContext: 64_000, vision: false, tools: true, ladder: ["low", "minimal", "medium"], outputWeight: 1.5 },
};

/** Safe subset of the /api/model catalog entry; never settings/headers/body. */
export interface CatalogModel {
  providerID: string;
  /** upstream identity used to match Epoch ECI data */
  modelID: string;
  /** selectable id: providerID + "/" + id */
  id: string;
  name: string;
  enabled: boolean;
  status: string;
  tools: boolean;
  inputTypes: string[];
  contextLimit: number | null;
  variants: string[];
  /** base (non-tiered) price in USD/Mtok, null when absent/invalid */
  baseInput: number | null;
  baseOutput: number | null;
}

export interface EpochData {
  schemaVersion: string;
  fetchedAt: string;
  checkedAt: string;
  etag: string | null;
  /** ECI score keyed by normalized model group */
  eci: Record<string, number>;
  /** model_version -> model group (both normalized) */
  versionToGroup: Record<string, string>;
}
