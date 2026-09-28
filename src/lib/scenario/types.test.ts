import { describe, expect, it } from "vitest";
import { validateScenarioDocument } from "./types";

describe("ScenarioDocument validation", () => {
  it("accepts a versioned document and rejects unknown future versions", () => {
    const legacySafe = {
      schemaVersion: 1,
      engineId: "locust",
      projectId: "project-1",
      suiteId: "suite-1",
      sources: [],
      nodes: [{ id: "request-1", kind: "request", engineIds: ["locust"], method: "GET", url: "/health" }],
      configFiles: [],
    };
    expect(validateScenarioDocument(legacySafe)).toEqual(legacySafe);
    expect(validateScenarioDocument({ ...legacySafe, schemaVersion: 2 })).toBeNull();
  });
});
