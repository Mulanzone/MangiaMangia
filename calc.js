(function(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.PizzaCalc = factory();
  }
})(typeof self !== "undefined" ? self : this, function() {
  "use strict";

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

  const DEFAULT_PREFERMENT_HYDRATION = {
    direct: 0,
    poolish: 1,
    biga: 0.55,
    sourdough: 1
  };

  const ROUNDING = {
    flour: 0,
    water: 0,
    salt: 1,
    honey: 1,
    yeast: 2
  };

  function normalizeTotal(value, key) {
    const num = Number(value || 0);
    const decimals = ROUNDING[key] ?? 0;
    return round(num, decimals);
  }

  function computeIngredientBreakdown(config = {}) {
    const totalsInput = config.totals || {};
    const prefermentType = String(config.prefermentType || "direct").toLowerCase();
    const prefermentPct = prefermentType === "direct"
      ? 0
      : clamp(Number(config.prefermentPct || 0), 0, 100) / 100;
    const prefermentHydration = Number.isFinite(config.prefermentHydration)
      ? config.prefermentHydration
      : (DEFAULT_PREFERMENT_HYDRATION[prefermentType] ?? 0);

    const totals = {
      flour: normalizeTotal(totalsInput.flour, "flour"),
      water: normalizeTotal(totalsInput.water, "water"),
      salt: normalizeTotal(totalsInput.salt, "salt"),
      honey: normalizeTotal(totalsInput.honey, "honey"),
      yeast: normalizeTotal(totalsInput.yeast, "yeast")
    };

    const errors = [];

    const prefermentFlourRaw = totals.flour * prefermentPct;
    let prefermentFlour = clamp(prefermentFlourRaw, 0, totals.flour);
    if (prefermentFlourRaw > totals.flour) {
      errors.push("Preferment flour exceeds total flour.");
    }

    const prefermentWaterRaw = prefermentFlour * prefermentHydration;
    let prefermentWater = clamp(prefermentWaterRaw, 0, totals.water);
    if (prefermentWaterRaw > totals.water) {
      errors.push("Preferment water exceeds total water.");
    }

    const honeyPrefPct = Number.isFinite(config.honeyPrefermentPct)
      ? clamp(config.honeyPrefermentPct, 0, 100) / 100
      : (prefermentType === "direct" ? 0 : 1);
    const yeastPrefPct = Number.isFinite(config.yeastPrefermentPct)
      ? clamp(config.yeastPrefermentPct, 0, 100) / 100
      : (prefermentType === "direct" ? 0 : 1);

    const prefermentHoneyRaw = totals.honey * honeyPrefPct;
    const prefermentYeastRaw = totals.yeast * yeastPrefPct;

    const preferment = {
      type: prefermentType,
      flour: round(prefermentFlour, ROUNDING.flour),
      water: round(prefermentWater, ROUNDING.water),
      honey: round(prefermentHoneyRaw, ROUNDING.honey),
      yeast: round(prefermentYeastRaw, ROUNDING.yeast)
    };

    const finalMix = {
      addPrefermentMass: 0,
      flour: 0,
      water: 0,
      salt: totals.salt,
      honey: 0,
      yeast: 0
    };

    const ingredients = ["flour", "water", "honey", "yeast"];
    for (const key of ingredients) {
      const totalVal = totals[key];
      const prefVal = preferment[key];
      const remainder = round(totalVal - prefVal, ROUNDING[key]);
      if (remainder < 0) {
        errors.push(`Final mix ${key} is negative after preferment split.`);
        finalMix[key] = 0;
        preferment[key] = round(totalVal, ROUNDING[key]);
      } else {
        finalMix[key] = remainder;
      }
    }

    preferment.totalMass = round(
      preferment.flour + preferment.water + preferment.honey + preferment.yeast,
      1
    );
    finalMix.addPrefermentMass = preferment.totalMass;

    if (prefermentType === "sourdough") {
      preferment.starter = {
        totalMass: preferment.totalMass
      };
    }

    return {
      totals,
      preferment,
      finalMix,
      errors
    };
  }

  return {
    computeIngredientBreakdown
  };
});
