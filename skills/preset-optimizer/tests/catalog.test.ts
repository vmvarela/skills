import { describe, test, expect } from "bun:test";
import { fetchCatalog, isSelectable, splitSelectableId, CatalogError } from "../scripts/lib/catalog.ts";
import { synthCatalogResponse, synthModel } from "./helpers.ts";

const CWD = "/tmp/po-test-cwd";

describe("catalog", () => {
  test("scope assertion: response location must equal cwd", async () => {
    const runner = () => ({ code: 0, stdout: synthCatalogResponse([synthModel()], "/some/other/dir"), stderr: "" });
    expect(fetchCatalog(CWD, runner)).rejects.toThrow(CatalogError);
  });

  test("failed api call is an error", async () => {
    const runner = () => ({ code: 1, stdout: "", stderr: "boom" });
    expect(fetchCatalog(CWD, runner)).rejects.toThrow(CatalogError);
  });

  test("unparseable body is an error, raw body never surfaces", async () => {
    const runner = () => ({ code: 0, stdout: "<html>not json with s3cret</html>", stderr: "" });
    let err: unknown;
    try {
      await fetchCatalog(CWD, runner);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CatalogError);
    expect((err as Error).message).not.toContain("s3cret");
  });

  test("extracts only safe fields; settings/headers never leak", async () => {
    const runner = () => ({ code: 0, stdout: synthCatalogResponse([synthModel()], CWD), stderr: "" });
    const res = await fetchCatalog(CWD, runner);
    expect(res.directory).toBe(CWD);
    const m = res.models[0];
    expect(m.id).toBe("prov-a/alpha-model");
    expect(m.modelID).toBe("alpha-model");
    expect(m.providerID).toBe("prov-a");
    expect(m.contextLimit).toBe(200000);
    expect(m.variants).toEqual([]);
    const dumped = JSON.stringify(res);
    expect(dumped).not.toContain("secret.invalid");
    expect(dumped).not.toContain("s3cret");
  });

  test("splitSelectableId splits only the first slash", () => {
    expect(splitSelectableId("prov-a/model/with/slashes")).toEqual({ providerID: "prov-a", id: "model/with/slashes" });
    expect(() => splitSelectableId("noprovider")).toThrow(CatalogError);
  });

  test("isSelectable excludes disabled and unstable", () => {
    const base = synthModel() as never as import("../scripts/lib/types.ts").CatalogModel;
    expect(isSelectable(base)).toBe(true);
    expect(isSelectable({ ...base, enabled: false })).toBe(false);
    expect(isSelectable({ ...base, status: "unstable" })).toBe(false);
    expect(isSelectable({ ...base, status: "unknown" })).toBe(false);
  });
});
