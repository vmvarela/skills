import { describe, test, expect } from "bun:test";
import { rankAgents, eciForModel } from "../scripts/lib/match.ts";
import { synthModel, synthCatalogResponse } from "./helpers.ts";
import { fetchCatalog } from "../scripts/lib/catalog.ts";
import type { EpochData, CatalogModel } from "../scripts/lib/types.ts";
import { AGENT_ORDER } from "../scripts/lib/types.ts";

const CWD = "/tmp/po-test-cwd";

// SYNTHETIC epoch data — not a real Epoch snapshot
const EPOCH: EpochData = {
  schemaVersion: "1",
  fetchedAt: "2026-01-01T00:00:00Z",
  checkedAt: "2026-01-01T00:00:00Z",
  etag: null,
  eci: { "alpha-model": 150, "beta-model": 120, "gamma-model": 100, "cheap-model": 95, "epsilon-model": 145, g1: 100, g2: 90 },
  versionToGroup: {
    "alpha-model_high": "alpha-model",
    "alpha-model_medium": "alpha-model",
    "beta-model": "beta-model",
    "beta-model_max": "beta-model",
    "gamma-model_high": "gamma-model",
    "gamma-model_low": "gamma-model",
    "cheap-model_low": "cheap-model",
    "epsilon-model_high": "epsilon-model",
    duo: "g1",
    "duo_high": "g2",
  },
};

async function catalog(models: Record<string, unknown>[]): Promise<CatalogModel[]> {
  const res = await fetchCatalog(CWD, () => ({ code: 0, stdout: synthCatalogResponse(models, CWD), stderr: "" }));
  return res.models;
}

describe("eci matching", () => {
  test("exact modelID matches after dot/dash normalization", () => {
    const m = { modelID: "beta.model", variants: [] } as CatalogModel;
    expect(eciForModel(m, EPOCH)).toEqual({ group: "beta-model", eci: 120 });
  });

  test("variant-suffixed version matches via catalog variants", () => {
    const m = { modelID: "alpha-model", variants: ["high"] } as CatalogModel;
    expect(eciForModel(m, EPOCH)).toEqual({ group: "alpha-model", eci: 150 });
  });

  test("-free endpoints never match the base model", () => {
    const m = { modelID: "alpha-model-free", variants: ["high"] } as CatalogModel;
    expect(eciForModel(m, EPOCH)).toEqual({ error: "no_eci" });
  });

  test("conflicting group hits are ambiguous", () => {
    const m = { modelID: "duo", variants: ["high"] } as CatalogModel;
    expect(eciForModel(m, EPOCH)).toEqual({ error: "ambiguous" });
  });

  test("unscored models are excluded with no_eci", () => {
    const m = { modelID: "unknown-model", variants: [] } as CatalogModel;
    expect(eciForModel(m, EPOCH)).toEqual({ error: "no_eci" });
  });
});

describe("ranking", () => {
  test("all six agents in canonical order", async () => {
    const models = await catalog([synthModel({ id: "alpha-model", variants: ["high"] })]);
    const r = rankAgents(EPOCH, models);
    expect(Object.keys(r.agents)).toEqual(AGENT_ORDER);
  });

  test("variant ladder picks the first offered variant, no inference", async () => {
    const models = await catalog([synthModel({ id: "alpha-model", variants: ["medium", "xhigh", "high"] })]);
    const r = rankAgents(EPOCH, models);
    // orchestrator ladder high,medium,max -> high
    expect(r.agents.orchestrator.options[0].variant).toBe("high");
    // oracle ladder max,high,medium -> high (max not offered)
    expect(r.agents.oracle.options[0].variant).toBe("high");
    // explorer ladder low,minimal,medium -> medium
    expect(r.agents.explorer.options[0].variant).toBe("medium");
  });

  test("models without a supported ladder variant are excluded", async () => {
    const models = await catalog([synthModel({ id: "alpha-model", variants: ["xhigh"] })]);
    const r = rankAgents(EPOCH, models);
    expect(r.agents.orchestrator.options).toEqual([]);
    expect(r.agents.orchestrator.exclusions["variant_unsupported"]).toBe(1);
  });

  test("variant matching is case-sensitive", async () => {
    const models = await catalog([synthModel({ id: "alpha-model", variants: ["HIGH"] })]);
    const r = rankAgents(EPOCH, models);
    expect(r.agents.orchestrator.options).toEqual([]);
    expect(r.agents.orchestrator.exclusions["variant_unsupported"]).toBe(1);
  });

  test("quality floor is bestECI - 10, not a ratio", async () => {
    const models = await catalog([
      synthModel({ id: "alpha-model", variants: ["high"], providerID: "prov-a" }),
      synthModel({ id: "gamma-model", variants: ["high"], providerID: "prov-a", inputPrice: 0.1, outputPrice: 0.2 }),
    ]);
    const r = rankAgents(EPOCH, models);
    expect(r.agents.orchestrator.bestECI).toBe(150);
    expect(r.agents.orchestrator.qualityFloor).toBe(140);
    // gamma (100) is cheap but below floor: excluded by quality, not price
    expect(r.agents.orchestrator.options.every((o) => o.model.includes("alpha-model"))).toBe(true);
    expect(r.agents.orchestrator.exclusions["quality_floor"]).toBe(1);
  });

  test("explicit zero price is valid; missing price excludes with no_price", async () => {
    const models = await catalog([
      synthModel({ id: "cheap-model", variants: ["low"], providerID: "prov-a", inputPrice: 0, outputPrice: 0, context: 64000, input: ["text"] }),
      synthModel({ id: "noprice-model", variants: ["low"], providerID: "prov-a", inputPrice: null, context: 64000, input: ["text"] }),
    ]);
    const r = rankAgents(EPOCH, models);
    expect(r.agents.fixer.options[0].price).toBe(0);
    expect(r.agents.fixer.exclusions["no_price"]).toBe(1);
  });

  test("effective price is input + output * profile weight", async () => {
    const models = await catalog([synthModel({ id: "alpha-model", variants: ["high", "medium", "low", "minimal", "max"], inputPrice: 1, outputPrice: 2 })]);
    const r = rankAgents(EPOCH, models);
    expect(r.agents.orchestrator.options[0].price).toBe(1 + 2 * 3); // weight 3
    expect(r.agents.oracle.options[0].price).toBe(1 + 2 * 4); // weight 4
    expect(r.agents.explorer.options[0].price).toBe(1 + 2 * 1.5);
  });

  test("vision requirement: designer needs image input", async () => {
    const models = await catalog([synthModel({ id: "alpha-model", variants: ["high"], input: ["text"] })]);
    const r = rankAgents(EPOCH, models);
    expect(r.agents.designer.exclusions["vision"]).toBe(1);
    expect(r.agents.orchestrator.options.length).toBe(1);
  });

  test("text capability is required for every agent, including designer", async () => {
    const models = await catalog([synthModel({ id: "alpha-model", variants: ["high"], input: ["image"] })]);
    const r = rankAgents(EPOCH, models);
    expect(r.agents.designer.exclusions["text"]).toBe(1);
    expect(r.agents.orchestrator.exclusions["text"]).toBe(1);
  });

  test("context minimum per profile", async () => {
    const models = await catalog([synthModel({ id: "gamma-model", variants: ["low", "high"], context: 64000 })]);
    const r = rankAgents(EPOCH, models);
    expect(r.agents.orchestrator.exclusions["context"]).toBe(1); // 128k min
    expect(r.agents.oracle.exclusions["context"]).toBe(1); // 200k min
    expect(r.agents.fixer.options.length).toBe(1); // 64k ok
  });

  test("--top is per provider; ordering by price asc, eci desc, id asc", async () => {
    const models = await catalog([
      synthModel({ id: "alpha-model", variants: ["high"], providerID: "prov-a", inputPrice: 2, outputPrice: 1 }),
      synthModel({ id: "alpha-model-b", modelID: "alpha-model", variants: ["high"], providerID: "prov-a", inputPrice: 1, outputPrice: 1 }),
      synthModel({ id: "alpha-model-c", modelID: "alpha-model", variants: ["high"], providerID: "prov-b", inputPrice: 5, outputPrice: 1 }),
    ]);
    const r = rankAgents(EPOCH, models, 2);
    // prices: b=4, a=5, c=8; per-provider cap keeps all with top=2
    expect(r.agents.orchestrator.options.map((o) => o.model)).toEqual([
      "prov-a/alpha-model-b",
      "prov-a/alpha-model",
      "prov-b/alpha-model-c",
    ]);
    const r1 = rankAgents(EPOCH, models, 1); // top=1: one per provider
    expect(r1.agents.orchestrator.options.map((o) => o.model)).toEqual(["prov-a/alpha-model-b", "prov-b/alpha-model-c"]);
  });

  test("ties break by descending eci then exact id", async () => {
    const models = await catalog([
      synthModel({ id: "alpha-model", variants: ["high"], providerID: "prov-a", inputPrice: 1, outputPrice: 1 }),
      synthModel({ id: "epsilon-model", modelID: "epsilon-model", variants: ["high"], providerID: "prov-b", inputPrice: 1, outputPrice: 1 }),
    ]);
    const r = rankAgents(EPOCH, models, 1);
    // same price 4; alpha (150) beats epsilon (145)
    expect(r.agents.orchestrator.options[0].model).toBe("prov-a/alpha-model");
  });

  test("--top bounds are enforced", async () => {
    const models = await catalog([synthModel({ id: "alpha-model", variants: ["high"] })]);
    expect(() => rankAgents(EPOCH, models, 0)).toThrow();
    expect(() => rankAgents(EPOCH, models, 21)).toThrow();
    expect(() => rankAgents(EPOCH, models, 20)).not.toThrow();
  });
});
