import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import type { Opportunity } from "@edurev/types";
import { opportunities as mockOpportunities } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { OpportunityModel } from "../models/index.js";
import { makeClient, startTestServer, stopTestServer } from "./helpers.js";

// Phase 3: the API side of the new look (docs/modules/ui-shell.md). Test names start with the item ID.

const OPP_ID = "opp-u11t-untrimmed";

const untrimmed: Opportunity = {
  id: OPP_ID, title: "  U11T Hcl Amplified  ", project: "U11T Hcl Amplified ", client: " U11T Client ", company: " U11T Company ",
  description: "Older record saved before names were trimmed.", category: "Web development", skills: ["React"], budget: 5000, currency: "INR",
  deadline: "2027-01-31", status: "OPEN", requiredTier: "TIER_1", estimatedHours: 5, numberOfBids: 0, slaDeadline: "2027-01-30T18:00:00.000Z",
  matchScore: 0, deliverables: ["Build"], updatedAt: "2026-11-01",
};

describe("Phase 3: UI shell (API)", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    // Store the record exactly as an old version of the app would have, stray spaces included
    if (isDbConnected()) {
      await OpportunityModel.deleteOne({ id: OPP_ID });
      await OpportunityModel.collection.insertOne({ ...untrimmed });
    } else {
      mockOpportunities.push({ ...untrimmed });
    }
  });

  after(async () => {
    if (isDbConnected()) {
      await OpportunityModel.deleteOne({ id: OPP_ID });
    } else {
      const index = mockOpportunities.findIndex((o) => o.id === OPP_ID);
      if (index >= 0) mockOpportunities.splice(index, 1);
    }
    await stopTestServer(server);
  });

  it("U11: older opportunities with stray spaces in their names are shown trimmed", async () => {
    const one = await call("GET", `/opportunities/${OPP_ID}`, { as: "studentA" });
    assert.strictEqual(one.status, 200);
    assert.strictEqual(one.json.data.project, "U11T Hcl Amplified");
    assert.strictEqual(one.json.data.title, "U11T Hcl Amplified");
    assert.strictEqual(one.json.data.company, "U11T Company");
    assert.strictEqual(one.json.data.client, "U11T Client");

    const list = await call("GET", "/opportunities", { as: "analyst" });
    assert.strictEqual(list.status, 200);
    const listed = (list.json.data as Opportunity[]).find((o) => o.id === OPP_ID);
    assert.strictEqual(listed?.project, "U11T Hcl Amplified");
  });

  it("U11: reading never rewrites the stored record or the in-memory seed", async () => {
    if (isDbConnected()) {
      const stored = await OpportunityModel.collection.findOne({ id: OPP_ID });
      assert.strictEqual(stored?.project, "U11T Hcl Amplified ");
    } else {
      assert.strictEqual(mockOpportunities.find((o) => o.id === OPP_ID)?.project, "U11T Hcl Amplified ");
    }
  });
});
