/* ============================================================
   Session Resolver v2 (schema-driven calculations only)
   - Loads dough_methods.json + dough_presets.json (+ optional custom presets)
   - Resolves totals + preferment/starter subtraction
   ============================================================ */

(() => {
  "use strict";

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const DEV = true;
  let DEV_ASSERTED = false;

  const STORE = {
    methods: [],
    presets: [],
    customPresets: [],
    globalDefaults: {},
    catalogs: { ovens: [], mixers: [] },
    lastResult: null
  };

  const FALLBACK_METHOD = {
    method_id: "direct",
    display_name: "Direct Dough",
    defaults: {
      hydration_percent: 63,
      salt_percent: 2.8,
      oil_percent: 0,
      honey_percent: 0,
      sugar_percent: 0,
      diastatic_malt_percent: 0,
      yeast_type: "idy",
      yeast_percent: 0.05,
      preferment_enabled: false,
      starter_enabled: false,
      fermentation_location: "cold",
      ddt_model_enabled: true,
      target_fdt_c: 23,
      mix_method: "hand"
    },
    ranges: {},
    flags: {},
    calculation_model: {
      percent_base: "total_flour",
      preferment: null,
      starter: null,
      final_mix: { subtract_preferment: false, subtract_starter: false }
    }
  };

  async function fetchJson(path, { allowMissing = false } = {}) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) {
      if (allowMissing && res.status === 404) return null;
      throw new Error(`HTTP ${res.status} for ${path}`);
    }
    return await res.json();
  }

  function resolveMethodsJson(json) {
    if (!json || typeof json !== "object") return { methods: [FALLBACK_METHOD], globalDefaults: {} };
    const methods = Array.isArray(json.methods)
      ? json.methods
      : (Array.isArray(json.items) ? json.items : []);
    return {
      methods: methods.length ? methods : [FALLBACK_METHOD],
      globalDefaults: json.global_defaults || {}
    };
  }

  function resolvePresetsJson(json) {
    if (!json || typeof json !== "object") return [];
    if (Array.isArray(json.presets)) return json.presets;
    if (Array.isArray(json.items)) return json.items;
    if (Array.isArray(json)) return json;
    return [];
  }

  async function loadDoughMethods() {
    let json = null;
    try {
      json = await fetchJson("data/dough_methods.json");
    } catch {
      json = null;
    }
    const resolved = resolveMethodsJson(json);
    STORE.methods = resolved.methods;
    STORE.globalDefaults = resolved.globalDefaults || {};
  }

  async function loadDoughPresets() {
    let json = null;
    try {
      json = await fetchJson("data/dough_presets.json");
    } catch {
      json = null;
    }
    STORE.presets = resolvePresetsJson(json);
  }

  async function loadCustomPresets() {
    let json = null;
    try {
      json = await fetchJson("data/custom_presets.json", { allowMissing: true });
    } catch {
      json = null;
    }
    STORE.customPresets = resolvePresetsJson(json);
  }

  function setCatalogs(catalogs) {
    STORE.catalogs = catalogs || { ovens: [], mixers: [] };
  }

  function getAllPresets() {
    return [...(STORE.presets || []), ...(STORE.customPresets || [])];
  }

  function getMethodById(id) {
    if (!STORE.methods.length) return FALLBACK_METHOD;
    return STORE.methods.find((m) => m.method_id === id) || STORE.methods[0] || FALLBACK_METHOD;
  }

  function getPresetById(id) {
    if (!id) return null;
    return getAllPresets().find((p) => p.id === id) || null;
  }

  function mergeDefined(base, override) {
    const out = { ...base };
    if (!override || typeof override !== "object") return out;
    Object.entries(override).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      out[key] = value;
    });
    return out;
  }

  function normalizeRanges(resolved, method, warnings) {
    const ranges = method?.ranges || {};
    const out = { ...resolved };
    Object.entries(ranges).forEach(([key, range]) => {
      if (!Array.isArray(range) || range.length !== 2) return;
      if (out[key] == null) return;
      const num = Number(out[key]);
      if (!Number.isFinite(num)) return;
      const clamped = clamp(num, Number(range[0]), Number(range[1]));
      if (clamped !== num) {
        warnings.push(`${key} clamped to ${clamped} (was ${num}).`);
        out[key] = clamped;
      }
    });
    return out;
  }

  function applySafetyRules(resolved, warnings) {
    const rules = STORE.globalDefaults?.ingredient_safety_rules || {};
    const ovenType = resolved.oven_type || null;

    if (rules.diastatic_malt) {
      const max = Number(rules.diastatic_malt.max_percent);
      const disallow = Array.isArray(rules.diastatic_malt.disallow_when)
        ? rules.diastatic_malt.disallow_when.some((r) => r.oven_type === ovenType)
        : false;
      if (disallow) {
        if (resolved.diastatic_malt_percent) warnings.push("Diastatic malt disabled for selected oven type.");
        resolved.diastatic_malt_percent = 0;
      } else if (Number.isFinite(max) && resolved.diastatic_malt_percent != null) {
        resolved.diastatic_malt_percent = clamp(Number(resolved.diastatic_malt_percent), 0, max);
      }
    }

    if (rules.honey && resolved.honey_percent != null) {
      const max = rules.honey.max_percent_by_oven_type?.[ovenType];
      if (Number.isFinite(max)) {
        resolved.honey_percent = clamp(Number(resolved.honey_percent), 0, max);
      }
    }

    if (rules.sugar && resolved.sugar_percent != null) {
      const max = rules.sugar.max_percent_by_oven_type?.[ovenType];
      if (Number.isFinite(max)) {
        resolved.sugar_percent = clamp(Number(resolved.sugar_percent), 0, max);
      }
    }

    if (rules.oil && resolved.oil_percent != null) {
      const max = Number(rules.oil.max_percent);
      if (Number.isFinite(max)) {
        resolved.oil_percent = clamp(Number(resolved.oil_percent), 0, max);
      }
    }

    return resolved;
  }

  function totalPizzasFromOrders(orders) {
    if (!Array.isArray(orders)) return 0;
    let total = 0;
    orders.forEach((person) => {
      (person.pizzas || []).forEach((pz) => {
        total += Number(pz.qty || 0);
      });
    });
    return Math.max(0, total);
  }

  function computeTargetPizzaCount(ordersState, fallback) {
    const fromOrders = totalPizzasFromOrders(ordersState);
    if (fromOrders > 0) return Math.max(fromOrders, Number(fallback || 0));
    return Number(fallback || 0);
  }

  function computeTotals(resolved, method, ordersState, warnings) {
    const hydration = Number(resolved.hydration_percent || 0);
    const salt = Number(resolved.salt_percent || 0);
    const oil = Number(resolved.oil_percent || 0);
    const honey = Number(resolved.honey_percent || 0);
    const sugar = Number(resolved.sugar_percent || 0);
    const malt = Number(resolved.diastatic_malt_percent || 0);
    const yeast = Number(resolved.yeast_percent || 0);

    const targetPizzaCount = computeTargetPizzaCount(ordersState, resolved.target_pizza_count);
    const doughUnitWeight = Number(resolved.dough_unit_weight_g || 0);
    const targetTotalDoughG = round(targetPizzaCount * doughUnitWeight, 4);

    const pctSum = (hydration + salt + oil + honey + sugar + malt + yeast) / 100;
    const totalFlourG = pctSum > 0 ? targetTotalDoughG / (1 + pctSum) : targetTotalDoughG;

    const totals = {
      target_pizza_count: targetPizzaCount,
      dough_unit_weight_g: doughUnitWeight,
      target_total_dough_g: round(targetTotalDoughG, 4),
      total_flour_g: round(totalFlourG, 4),
      total_water_g: round(totalFlourG * (hydration / 100), 4),
      total_salt_g: round(totalFlourG * (salt / 100), 4),
      total_oil_g: round(totalFlourG * (oil / 100), 4),
      total_honey_g: round(totalFlourG * (honey / 100), 4),
      total_malt_g: round(totalFlourG * (malt / 100), 4),
      total_sugar_g: round(totalFlourG * (sugar / 100), 4),
      total_yeast_g: round(totalFlourG * (yeast / 100), 4)
    };

    const calcModel = method?.calculation_model || {};
    const prefermentModel = calcModel.preferment;
    const starterModel = calcModel.starter;

    let prefermentFlourG = 0;
    let prefermentWaterG = 0;
    let prefermentYeastG = 0;
    let prefermentTotalG = 0;
    let prefermentType = null;
    let prefermentComponents = null;

    const prefermentEnabled = Boolean(resolved.preferment_enabled) && Boolean(prefermentModel);
    if (prefermentEnabled) {
      const flourPctField = prefermentModel.flour_pct_field;
      const flourPct = Number(resolved[flourPctField] || 0);
      prefermentFlourG = totalFlourG * (flourPct / 100);
      prefermentType = prefermentModel.type || resolved.preferment_type || null;

      if (prefermentModel.type === "hybrid_poolish_biga") {
        const poolishShare = Number(resolved[prefermentModel.split.poolish_share_field] || 0);
        const bigaShare = Number(resolved[prefermentModel.split.biga_share_field] || 0);
        const shareSum = poolishShare + bigaShare;
        if (shareSum !== 100) {
          warnings.push("Hybrid preferment shares should sum to 100.");
          if (DEV) {
            console.assert(shareSum === 100, "Hybrid preferment shares must sum to 100.");
          }
        }
        const poolishRatio = shareSum > 0 ? poolishShare / shareSum : 0.5;
        const bigaRatio = shareSum > 0 ? bigaShare / shareSum : 0.5;
        const poolishFlour = prefermentFlourG * poolishRatio;
        const bigaFlour = prefermentFlourG * bigaRatio;
        const poolishHydration = Number(resolved[prefermentModel.components.poolish.hydration_percent_field] || 0);
        const bigaHydration = Number(resolved[prefermentModel.components.biga.hydration_percent_field] || 0);
        const poolishWater = poolishFlour * (poolishHydration / 100);
        const bigaWater = bigaFlour * (bigaHydration / 100);
        prefermentWaterG = poolishWater + bigaWater;
        prefermentComponents = {
          poolish: {
            flour_g: round(poolishFlour, 4),
            water_g: round(poolishWater, 4),
            total_g: round(poolishFlour + poolishWater, 4)
          },
          biga: {
            flour_g: round(bigaFlour, 4),
            water_g: round(bigaWater, 4),
            total_g: round(bigaFlour + bigaWater, 4)
          }
        };
      } else {
        const hydrationField = prefermentModel.hydration_field;
        const prefHydration = Number(resolved[hydrationField] || 0);
        prefermentWaterG = prefermentFlourG * (prefHydration / 100);
      }

      prefermentYeastG = totals.total_yeast_g;
      prefermentTotalG = prefermentFlourG + prefermentWaterG + prefermentYeastG;
    }

    let starterFlourG = 0;
    let starterWaterG = 0;
    let starterTotalG = 0;

    const starterEnabled = Boolean(resolved[starterModel?.enabled_field]) && Boolean(starterModel);
    if (starterEnabled) {
      const inoculation = Number(resolved[starterModel.starter_inoculation_field] || 0);
      const hydration = Number(resolved[starterModel.starter_hydration_field] || 0);
      starterFlourG = totalFlourG * (inoculation / 100);
      starterWaterG = starterFlourG * (hydration / 100);
      starterTotalG = starterFlourG + starterWaterG;
    }

    const subtractPreferment = Boolean(calcModel.final_mix?.subtract_preferment);
    const subtractStarter = Boolean(calcModel.final_mix?.subtract_starter);

    const finalMixFlourG = subtractPreferment || subtractStarter
      ? Math.max(0, totalFlourG - (subtractPreferment ? prefermentFlourG : 0) - (subtractStarter ? starterFlourG : 0))
      : totalFlourG;
    const finalMixWaterG = subtractPreferment || subtractStarter
      ? Math.max(0, totals.total_water_g - (subtractPreferment ? prefermentWaterG : 0) - (subtractStarter ? starterWaterG : 0))
      : totals.total_water_g;
    const finalMixYeastG = Math.max(0, totals.total_yeast_g - prefermentYeastG);

    if (DEV && method?.method_id === "direct") {
      console.assert(round(finalMixFlourG, 3) === round(totalFlourG, 3), "Direct method final flour mismatch.");
      console.assert(round(finalMixWaterG, 3) === round(totals.total_water_g, 3), "Direct method final water mismatch.");
    }

    return {
      ...totals,
      yeast_type: resolved.yeast_type,
      preferment_type: prefermentType,
      preferment_flour_g: round(prefermentFlourG, 4),
      preferment_water_g: round(prefermentWaterG, 4),
      preferment_yeast_g: round(prefermentYeastG, 4),
      preferment_total_g: round(prefermentTotalG, 4),
      preferment_components: prefermentComponents,
      starter_flour_g: round(starterFlourG, 4),
      starter_water_g: round(starterWaterG, 4),
      starter_total_g: round(starterTotalG, 4),
      final_mix_flour_g: round(finalMixFlourG, 4),
      final_mix_water_g: round(finalMixWaterG, 4),
      final_mix_salt_g: totals.total_salt_g,
      final_mix_oil_g: totals.total_oil_g,
      final_mix_honey_g: totals.total_honey_g,
      final_mix_malt_g: totals.total_malt_g,
      final_mix_sugar_g: totals.total_sugar_g,
      final_mix_yeast_g: round(finalMixYeastG, 4)
    };
  }

  function computeBatches(resolved, derived) {
    const batchingDefaults = STORE.globalDefaults?.batching || {};
    const enabled = resolved.batching_enabled ?? batchingDefaults.enabled;
    if (!enabled) return [];

    const maxMass = Number(resolved.batching_max_dough_mass_g ?? batchingDefaults.max_dough_mass_per_batch_g);
    if (!Number.isFinite(maxMass) || maxMass <= 0) return [];

    const total = Number(derived.target_total_dough_g || 0);
    if (!Number.isFinite(total) || total <= maxMass) return total > 0 ? [{ batch_index: 1, dough_mass_g: round(total, 2) }] : [];

    const batches = [];
    let remaining = total;
    let idx = 1;
    while (remaining > 0) {
      const mass = Math.min(remaining, maxMass);
      batches.push({ batch_index: idx, dough_mass_g: round(mass, 2) });
      remaining -= mass;
      idx += 1;
    }
    return batches;
  }

  function normalizeSession(resolved, method, warnings) {
    let out = { ...resolved };
    out.method_id = resolved.method_id || method?.method_id || "direct";
    if (out.yeast_type) out.yeast_type = String(out.yeast_type).toLowerCase();
    out.hydration_percent = toNumber(out.hydration_percent);
    out.salt_percent = toNumber(out.salt_percent);
    out.oil_percent = toNumber(out.oil_percent);
    out.honey_percent = toNumber(out.honey_percent);
    out.sugar_percent = toNumber(out.sugar_percent);
    out.diastatic_malt_percent = toNumber(out.diastatic_malt_percent);
    out.yeast_percent = toNumber(out.yeast_percent);
    out.dough_unit_weight_g = toNumber(out.dough_unit_weight_g);
    out.target_pizza_count = toNumber(out.target_pizza_count);
    out.preferment_flour_percent_of_total = toNumber(out.preferment_flour_percent_of_total);
    out.preferment_hydration_percent = toNumber(out.preferment_hydration_percent);
    out.hybrid_poolish_share_percent = toNumber(out.hybrid_poolish_share_percent);
    out.hybrid_biga_share_percent = toNumber(out.hybrid_biga_share_percent);
    out.poolish_hydration_percent = toNumber(out.poolish_hydration_percent);
    out.biga_hydration_percent = toNumber(out.biga_hydration_percent);
    out.starter_hydration_percent = toNumber(out.starter_hydration_percent);
    out.starter_inoculation_percent = toNumber(out.starter_inoculation_percent);

    out = normalizeRanges(out, method, warnings);
    return out;
  }

  function resolveSessionV2({ method_id, preset_id, user_session_overrides_v2, orders_state }) {
    const warnings = [];
    const method = getMethodById(method_id);
    const preset = getPresetById(preset_id);

    let resolved = mergeDefined(method?.defaults || {}, preset?.overrides || {});
    resolved = mergeDefined(resolved, user_session_overrides_v2 || {});
    resolved.method_id = method?.method_id || method_id || "direct";
    resolved.preset_id = preset?.id || preset_id || null;

    resolved = normalizeSession(resolved, method, warnings);
    resolved = applySafetyRules(resolved, warnings);

    const derived = computeTotals(resolved, method, orders_state, warnings);
    const batches = computeBatches(resolved, derived);
    const derivedWithBatches = { ...derived, batches };

    const result = { resolved_session_v2: resolved, derived_session_v2: derivedWithBatches, warnings };
    STORE.lastResult = result;

    if (DEV) {
      const orderCount = totalPizzasFromOrders(orders_state);
      const expected = computeTargetPizzaCount(orders_state, resolved.target_pizza_count);
      console.assert(derivedWithBatches.target_pizza_count === expected, "Derived pizza count mismatch.");
      if (orderCount > 0) {
        console.assert(derivedWithBatches.target_pizza_count >= orderCount, "Orders should not exceed target pizza count.");
      }
    }

    if (DEV && !DEV_ASSERTED) {
      DEV_ASSERTED = true;
      runDevAssertions(methodsAvailable());
    }

    return result;
  }

  function methodsAvailable() {
    return Array.isArray(STORE.methods) && STORE.methods.length > 0;
  }

  function runDevAssertions(hasMethods) {
    if (!DEV || !hasMethods) return;

    const poolishMethod = getMethodById("poolish");
    if (poolishMethod) {
      const priorResult = STORE.lastResult;
      const check = resolveSessionV2({
        method_id: "poolish",
        preset_id: null,
        user_session_overrides_v2: {
          target_pizza_count: 1,
          dough_unit_weight_g: 1000,
          hydration_percent: 100,
          salt_percent: 0,
          yeast_percent: 0,
          preferment_enabled: true,
          preferment_flour_percent_of_total: 30,
          preferment_hydration_percent: 100
        },
        orders_state: []
      });
      const derived = check.derived_session_v2;
      const expectedTotalFlour = 500;
      const expectedPrefFlour = 150;
      const expectedPrefWater = 150;
      console.assert(round(derived.total_flour_g, 1) === expectedTotalFlour, "Poolish test total flour mismatch.");
      console.assert(round(derived.preferment_flour_g, 1) === expectedPrefFlour, "Poolish test preferment flour mismatch.");
      console.assert(round(derived.preferment_water_g, 1) === expectedPrefWater, "Poolish test preferment water mismatch.");
      console.assert(round(derived.final_mix_flour_g, 1) === expectedTotalFlour - expectedPrefFlour, "Poolish test final flour mismatch.");
      console.assert(round(derived.final_mix_water_g, 1) === expectedTotalFlour - expectedPrefWater, "Poolish test final water mismatch.");
      STORE.lastResult = priorResult;
    }
  }

  function mapStyleId(styleId) {
    const key = String(styleId || "").toUpperCase();
    if (key === "ROUND_NEAPOLITAN") return "neapolitan_round";
    if (key === "PAN_SICILIAN_STANDARD") return "teglia_bonci";
    return null;
  }

  function mapPrefermentType(pref) {
    const key = String(pref || "").toUpperCase();
    if (key === "POOLISH") return "poolish";
    if (key === "BIGA") return "biga";
    if (key === "TIGA") return "tiga";
    if (key === "POOLISH_BIGA_HYBRID") return "hybrid_poolish_biga";
    return null;
  }

  function mapMethodIdFromPreferment(pref) {
    const key = String(pref || "").toUpperCase();
    if (key === "POOLISH") return "poolish";
    if (key === "BIGA") return "biga";
    if (key === "TIGA") return "tiga";
    if (key === "POOLISH_BIGA_HYBRID") return "hybrid_poolish_biga";
    if (key === "SOURDOUGH") return "sourdough";
    return "direct";
  }

  function mapFermentationLocation(loc) {
    const key = String(loc || "").toUpperCase();
    if (key === "ROOM") return "room";
    if (key === "FRIDGE") return "cold";
    if (key === "HYBRID") return "mixed";
    return null;
  }

  function mapYeastType(yeast) {
    const key = String(yeast || "").toUpperCase();
    if (key === "ADY") return "ady";
    if (key === "FRESH") return "fresh";
    return "idy";
  }

  function mapOvenType(ovenId) {
    const ovens = STORE.catalogs?.ovens || [];
    const oven = ovens.find((o) => o.id === ovenId) || null;
    const fuel = String(oven?.fuelType || "").toLowerCase();
    if (fuel.includes("wood")) return "wood_fired";
    if (fuel.includes("gas")) return "gas_pizza_oven";
    if (fuel.includes("electric")) return "home_electric";
    return null;
  }

  function mapMixMethod(mixerId) {
    const mixers = STORE.catalogs?.mixers || [];
    const mixer = mixers.find((m) => m.id === mixerId) || null;
    const type = String(mixer?.type || "").toLowerCase();
    if (type.includes("spiral")) return "spiral";
    if (type.includes("planetary")) return "planetary";
    if (type.includes("hand")) return "hand";
    if (type.includes("stand")) return "stand_mixer";
    return "hand";
  }

  function legacyToV2Inputs({ legacy_session }) {
    const s = legacy_session || {};
    const formula = s.formulaOverrides || {};
    const prefermentOptions = s.prefermentOptions || {};
    const prefermentType = String(s.prefermentType || "NONE").toUpperCase();

    const safeNumber = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const method_id = s.doughMethodId || mapMethodIdFromPreferment(prefermentType);
    const preset_id = s.doughPresetId || null;

    const user_session_overrides_v2 = {
      pizza_style_id: mapStyleId(s.styleId),
      method_id,
      oven_type: mapOvenType(s.oven_id),
      flour_blend_id: null,
      target_pizza_count: safeNumber(s.ballsUsed),
      dough_unit_weight_g: safeNumber(s.ballWeightG),
      hydration_percent: safeNumber(formula.hydrationPct),
      salt_percent: safeNumber(formula.saltPct),
      oil_percent: safeNumber(formula.oilPct),
      honey_percent: safeNumber(formula.honeyPct),
      diastatic_malt_percent: safeNumber(formula.maltPct),
      yeast_type: mapYeastType(formula.yeastType),
      yeast_percent: safeNumber(formula.yeastPctIDY),
      fermentation_location: mapFermentationLocation(s.fermentationLocation),
      ambient_temp_c: safeNumber(s.temps?.roomTempC),
      flour_temp_c: safeNumber(s.temps?.flourTempC),
      fridge_temp_c: safeNumber(s.temps?.fridgeTempC),
      mix_method: mapMixMethod(s.mixer_id)
    };

    if (prefermentType !== "NONE" && prefermentType !== "SOURDOUGH") {
      user_session_overrides_v2.preferment_enabled = true;
      user_session_overrides_v2.preferment_type = mapPrefermentType(prefermentType);

      if (prefermentType === "BIGA") {
        user_session_overrides_v2.preferment_flour_percent_of_total = safeNumber(prefermentOptions?.biga?.bigaPercentTotalFlour);
        user_session_overrides_v2.preferment_hydration_percent = safeNumber(prefermentOptions?.biga?.bigaHydrationPct);
      }

      if (prefermentType === "TIGA") {
        user_session_overrides_v2.preferment_flour_percent_of_total = safeNumber(prefermentOptions?.tiga?.tigaPercentTotalFlour);
      }

      if (prefermentType === "POOLISH_BIGA_HYBRID") {
        user_session_overrides_v2.hybrid_biga_share_percent = safeNumber(prefermentOptions?.hybrid?.bigaPercentOfRemainderFlour);
        if (user_session_overrides_v2.hybrid_biga_share_percent != null) {
          user_session_overrides_v2.hybrid_poolish_share_percent = 100 - user_session_overrides_v2.hybrid_biga_share_percent;
        }
        user_session_overrides_v2.poolish_hydration_percent = 100;
        user_session_overrides_v2.biga_hydration_percent = safeNumber(prefermentOptions?.hybrid?.bigaHydrationPct);
      }
    }

    if (prefermentType === "SOURDOUGH") {
      user_session_overrides_v2.starter_enabled = true;
      user_session_overrides_v2.starter_hydration_percent = safeNumber(prefermentOptions?.sourdough?.starterHydrationPct);
      user_session_overrides_v2.starter_inoculation_percent = safeNumber(prefermentOptions?.sourdough?.inoculationPctFlourBasis);
    }

    return { method_id, preset_id, user_session_overrides_v2 };
  }

  function v2DerivedToLegacyDashboard(derived) {
    if (!derived || typeof derived !== "object") {
      return {
        total_dough_g: 0,
        total_flour_g: 0,
        total_water_g: 0,
        total_salt_g: 0,
        total_honey_g: 0,
        total_yeast_g: 0,
        preferment_flour_g: 0,
        final_mix_flour_g: 0,
        yeast_type: "IDY"
      };
    }

    return {
      total_dough_g: Number(derived.target_total_dough_g || 0),
      total_flour_g: Number(derived.total_flour_g || 0),
      total_water_g: Number(derived.total_water_g || 0),
      total_salt_g: Number(derived.total_salt_g || 0),
      total_honey_g: Number(derived.total_honey_g || 0),
      total_yeast_g: Number(derived.total_yeast_g || 0),
      preferment_flour_g: Number(derived.preferment_flour_g || 0),
      final_mix_flour_g: Number(derived.final_mix_flour_g || 0),
      yeast_type: String(derived.yeast_type || "IDY").toUpperCase()
    };
  }

  function getPizzaioloBundle() {
    if (!STORE.lastResult) return { resolved_session_v2: null, derived_session_v2: null };
    return {
      resolved_session_v2: STORE.lastResult.resolved_session_v2,
      derived_session_v2: STORE.lastResult.derived_session_v2
    };
  }

  window.SessionResolverV2 = {
    loadDoughMethods,
    loadDoughPresets,
    loadCustomPresets,
    resolveSessionV2,
    legacyToV2Inputs,
    v2DerivedToLegacyDashboard,
    getPizzaioloBundle,
    setCatalogs
  };
})();
