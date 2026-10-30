import { test } from "node:test";
import assert from "node:assert/strict";
import { metaChargeMicros } from "../../src/server/providers/usage.ts";

test("Meta usage counts all output tokens and conservatively prices cached input", () => {
  assert.equal(
    metaChargeMicros({
      usage: {
        input_tokens: 1000,
        output_tokens: 1000,
        input_tokens_details: { cached_tokens: 500 },
      },
      output: [],
    }),
    5500,
  );
});
test("each search query and page access stays within the usage charge", () => {
  assert.equal(
    metaChargeMicros({
      usage: { input_tokens: 100, output_tokens: 100 },
      output: [
        {
          type: "web_search_call",
          status: "completed",
          action: { type: "search", queries: ["one", "two"] },
        },
        {
          type: "web_search_call",
          status: "completed",
          action: { type: "open_page" },
        },
      ],
    }),
    8050,
  );
});
test("missing, invalid or incomplete billing details cannot release a reservation", () => {
  for (const value of [
    {},
    { usage: { input_tokens: -1, output_tokens: 10 }, output: [] },
    { usage: { input_tokens: 100, output_tokens: 1.5 }, output: [] },
    {
      usage: { input_tokens: 100, output_tokens: 100 },
      output: [{ type: "web_search_call", status: "completed" }],
    },
    {
      usage: { input_tokens: 100, output_tokens: 100 },
      output: [
        {
          type: "web_search_call",
          status: "failed",
          action: { type: "search", query: "one" },
        },
      ],
    },
  ])
    assert.equal(metaChargeMicros(value), null);
});
