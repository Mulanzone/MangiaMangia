const assert = require("assert");
const { computeIngredientBreakdown } = require("../calc");

function assertTotalsReconcile(result) {
  const { totals, preferment, finalMix } = result;
  assert.strictEqual(preferment.flour + finalMix.flour, totals.flour);
  assert.strictEqual(preferment.water + finalMix.water, totals.water);
  assert.strictEqual(preferment.honey + finalMix.honey, totals.honey);
  assert.strictEqual(preferment.yeast + finalMix.yeast, totals.yeast);
  assert.strictEqual(finalMix.salt, totals.salt);
}

// Poolish
{
  const result = computeIngredientBreakdown({
    totals: { flour: 1000, water: 650, salt: 28, honey: 10, yeast: 2 },
    prefermentType: "poolish",
    prefermentPct: 30
  });

  assert.strictEqual(result.preferment.flour, 300);
  assert.strictEqual(result.preferment.water, 300);
  assert.strictEqual(result.preferment.honey, 10);
  assert.strictEqual(result.preferment.totalMass, 612);
  assert.strictEqual(result.finalMix.addPrefermentMass, 612);
  assert.strictEqual(result.finalMix.honey, 0);
  assertTotalsReconcile(result);
}

// Biga
{
  const result = computeIngredientBreakdown({
    totals: { flour: 1200, water: 720, salt: 33.6, honey: 12, yeast: 1.2 },
    prefermentType: "biga",
    prefermentPct: 40
  });

  assert.strictEqual(result.preferment.flour, 480);
  assert.strictEqual(result.preferment.water, 264);
  assert.strictEqual(result.preferment.honey, 12);
  assert.strictEqual(result.preferment.totalMass, 757.2);
  assert.strictEqual(result.finalMix.addPrefermentMass, 757.2);
  assert.strictEqual(result.finalMix.honey, 0);
  assertTotalsReconcile(result);
}

// Sourdough
{
  const result = computeIngredientBreakdown({
    totals: { flour: 900, water: 585, salt: 25.2, honey: 9, yeast: 0 },
    prefermentType: "sourdough",
    prefermentPct: 20
  });

  assert.strictEqual(result.preferment.flour, 180);
  assert.strictEqual(result.preferment.water, 180);
  assert.strictEqual(result.preferment.honey, 9);
  assert.strictEqual(result.preferment.totalMass, 369);
  assert.strictEqual(result.finalMix.addPrefermentMass, 369);
  assert.strictEqual(result.finalMix.honey, 0);
  assertTotalsReconcile(result);
}

console.log("ingredientBreakdown tests passed");
