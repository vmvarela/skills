// Deterministic ECI matching and agent ranking. No fuzzy inference:
// exact normalized ids plus variant-suffixed metadata versions only;
// -free/-contributor endpoint ids are never equated with base models.

import { normId } from "./epoch.ts";
import { isSelectable } from "./catalog.ts";
import { AGENT_ORDER, PROFILES, type AgentName, type CatalogModel, type EpochData } from "./types.ts";

export interface Option {
  model: string; // selectable id: provider/model
  variant: string;
  eci: number;
  price: number; // input + output * profile.outputWeight
}

export interface AgentResult {
  agent: AgentName;
  bestECI: number | null;
  qualityFloor: number | null;
  options: Option[];
  exclusions: Record<string, number>;
}

export interface RankResult {
  catalogCount: number;
  agents: Record<AgentName, AgentResult>;
}

const QUALITY_MARGIN = 10;

/**
 * ECI group for a catalog model. Matches the exact normalized modelID, or
 * modelID + "_" + variantId for variants the model actually offers. All hits
 * must agree on one group; several distinct groups is an ambiguity rejection.
 */
export function eciForModel(m: CatalogModel, epoch: EpochData): { group: string; eci: number } | { error: "ambiguous" | "no_eci" } {
  const candidates = [normId(m.modelID)];
  for (const v of m.variants) candidates.push(`${normId(m.modelID)}_${normId(v)}`);
  const groups = new Set<string>();
  for (const c of candidates) {
    const g = epoch.versionToGroup[c];
    if (g !== undefined && g in epoch.eci) groups.add(g);
  }
  if (groups.size > 1) return { error: "ambiguous" };
  if (groups.size === 0) return { error: "no_eci" };
  const group = [...groups][0];
  return { group, eci: epoch.eci[group] };
}

function effectivePrice(m: CatalogModel, weight: number): number | null {
  // only the exact active base tier (entries with a tier field are ignored upstream);
  // missing/negative/non-finite values are rejected, explicit zero is fine
  if (m.baseInput === null || m.baseOutput === null) return null;
  return m.baseInput + m.baseOutput * weight;
}

function pickVariant(m: CatalogModel, ladder: string[]): string | null {
  const offered = new Set(m.variants);
  for (const l of ladder) if (offered.has(l)) return l;
  return null;
}

export function rankAgents(epoch: EpochData, catalog: CatalogModel[], top = 1): RankResult {
  if (!Number.isInteger(top) || top < 1 || top > 20) throw new Error("rank: --top must be an integer 1..20");
  const agents = {} as Record<AgentName, AgentResult>;
  for (const agent of AGENT_ORDER) {
    const p = PROFILES[agent];
    const exclusions: Record<string, number> = {};
    const bump = (r: string) => {
      exclusions[r] = (exclusions[r] ?? 0) + 1;
    };
    interface Candidate {
      model: string;
      variant: string;
      eci: number;
      price: number;
    }
    const candidates: Candidate[] = [];

    for (const m of catalog) {
      if (!isSelectable(m)) {
        bump(m.enabled ? "unstable_status" : "disabled");
        continue;
      }
      if (m.tools !== p.tools) {
        bump("tools");
        continue;
      }
      if (!m.inputTypes.includes("text")) {
        bump("text");
        continue;
      }
      if (p.vision && !m.inputTypes.includes("image")) {
        bump("vision");
        continue;
      }
      if (m.contextLimit === null || m.contextLimit < p.minContext) {
        bump("context");
        continue;
      }
      const price = effectivePrice(m, p.outputWeight);
      if (price === null) {
        bump("no_price");
        continue;
      }
      const variant = pickVariant(m, p.ladder);
      if (variant === null) {
        bump("variant_unsupported");
        continue;
      }
      const q = eciForModel(m, epoch);
      if ("error" in q) {
        bump(q.error);
        continue;
      }
      candidates.push({ model: m.id, variant, eci: q.eci, price });
    }

    const bestECI = candidates.length ? Math.max(...candidates.map((c) => c.eci)) : null;
    const floor = bestECI === null ? null : bestECI - QUALITY_MARGIN;
    const eligible = bestECI === null ? [] : candidates.filter((c) => {
      const ok = c.eci >= floor!;
      if (!ok) bump("quality_floor");
      return ok;
    });
    eligible.sort((a, b) => a.price - b.price || b.eci - a.eci || (a.model < b.model ? -1 : 1));
    // per-provider cap
    const perProvider = new Map<string, number>();
    const capped: Candidate[] = [];
    for (const c of eligible) {
      const provider = c.model.slice(0, c.model.indexOf("/"));
      const n = perProvider.get(provider) ?? 0;
      if (n >= top) continue;
      perProvider.set(provider, n + 1);
      capped.push(c);
    }
    capped.sort((a, b) => a.price - b.price || b.eci - a.eci || (a.model < b.model ? -1 : 1));
    agents[agent] = {
      agent,
      bestECI,
      qualityFloor: floor,
      options: capped.map((c) => ({ model: c.model, variant: c.variant, eci: c.eci, price: c.price })),
      exclusions,
    };
  }
  return { catalogCount: catalog.length, agents };
}
