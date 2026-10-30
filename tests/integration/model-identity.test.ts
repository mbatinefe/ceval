import { test } from "node:test";
import assert from "node:assert/strict";
import {
  modelIdentityKey,
  modelIdentityParts,
} from "../../src/shared/model-identity.ts";
import { containsModel } from "../../src/server/scan/validation.ts";

test("complete MacBook identities retain every qualifier across listing-style order and punctuation", () => {
  for (const model of [
    "MacBook Pro 16-inch M2 Pro 2023",
    "MacBook Pro 16-inch (M2 Pro, 2023)",
    '2023 MacBook Pro 16" M2 Pro',
    "MacBook Pro M2 Pro 16-inch 2023",
    "16-inch MacBook Pro (2023, M2 Pro)",
    "MacBook Pro 16-inch M2-Pro 2023",
    "MacBook-Pro 16-inch M2 - Pro 2023",
    "2023 MacBook Pro 16-inch M2–Pro",
  ]) {
    assert.deepEqual(
      modelIdentityParts(model),
      ["macbook pro", "16 inch", "m2 pro", "2023"],
      model,
    );
    assert.equal(modelIdentityKey(model), "macbookpro16inchm2pro2023", model);
  }
});
test("MacBook keys preserve size, family, chip, year and embedded variant distinctions", () => {
  const original = modelIdentityKey("MacBook Pro 16-inch M2 Pro 2023");
  for (const model of [
    "MacBook Pro 14-inch M2 Pro 2023",
    "MacBook Air 16-inch M2 Pro 2023",
    "MacBook Pro 16-inch M2 Max 2023",
    "MacBook Pro 16-inch M2 2023",
    "MacBook Pro 16-inch M1 Pro 2023",
    "MacBook Pro 16-inch M2 Pro 2021",
    "MacBook Pro 16-inch M2 Pro 2023 Silver",
    "MacBook Pro 16-inch M2 Pro 2023 512GB",
  ])
    assert.notEqual(modelIdentityKey(model), original, model);
});
test("ambiguous, incomplete, and unrelated models do not use reordered MacBook matching", () => {
  for (const model of [
    "MacBook Pro 16-inch M2 Pro / M2 Max 2023",
    "MacBook Pro 16-inch M2 Pro 2021 / 2023",
    "MacBook Pro 14-inch / 16-inch M2 Pro 2023",
    "MacBook Pro 16-inch M2 Pro",
    "MacBook Pro M2 Pro 2023",
    "MacBook Pro 16-inch 2023",
    "MacBook Pro 16-inch M2 Pro 2023 512GB",
    "ExampleBook Pro 16-inch M2 Pro 2023",
    "WH-1000XM5 2023",
  ])
    assert.equal(modelIdentityParts(model), null, model);
  assert.equal(modelIdentityKey("WH-1000XM5"), "wh1000xm5");
  assert.notEqual(
    modelIdentityKey("WH-1000XM5 2023"),
    modelIdentityKey("2023 WH-1000XM5"),
  );
});
test("decimal screen sizes retain their complete value in both identity and evidence matching", () => {
  const model = "MacBook Pro 16.2-inch M2 Pro 2023";
  assert.deepEqual(modelIdentityParts(model), [
    "macbook pro",
    "16.2 inch",
    "m2 pro",
    "2023",
  ]);
  assert.equal(
    containsModel('Apple 2023 MacBook Pro 16.2" M2 Pro', model),
    true,
  );
  assert.equal(
    containsModel('Apple 2023 MacBook Pro 16" M2 Pro', model),
    false,
  );
  assert.notEqual(
    modelIdentityKey(model),
    modelIdentityKey("MacBook Pro 16-inch M2 Pro 2023"),
  );
});
test("listing comparisons cannot assemble a match from conflicting model specifications", () => {
  const model = "MacBook Pro 16-inch M2 Pro 2023";
  for (const evidence of [
    "Apple 2023 MacBook Pro 14-inch M2 Pro Silver; also browse 16-inch laptops",
    "Apple 2021 MacBook Pro 16-inch M1 Pro Silver; compare with 2023 M2 Pro",
    "Apple 2023 MacBook Air 16-inch M2 Pro Silver; see MacBook Pro models",
  ])
    assert.equal(containsModel(evidence, model), false, evidence);
});
test("hyphenated chip tiers cannot match the base chip", () => {
  for (const chip of ["M3-Pro", "M3 - Pro", "M3–Pro", "M3—Pro"]) {
    const evidence = `Apple 2023 MacBook-Pro 14-inch ${chip} Silver`;
    assert.equal(
      containsModel(evidence, "MacBook Pro 14-inch M3 2023"),
      false,
      chip,
    );
    assert.equal(
      containsModel(evidence, "MacBook Pro 14-inch M3 Pro 2023"),
      true,
      chip,
    );
  }
});
test("a listing price cannot supply a missing model year", () => {
  const model = "MacBook Pro 16-inch M2 Pro 2023";
  for (const price of [
    "USD $2023.00",
    "$2,023",
    "2023 USD",
    "£2023",
    "2023 ₺",
    "2023 $",
  ])
    assert.equal(
      containsModel(`Apple MacBook Pro 16-inch M2 Pro ${price}`, model),
      false,
      price,
    );
});
