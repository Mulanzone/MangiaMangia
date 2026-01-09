(() => {
  "use strict";

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

  const isPercentField = (key) => key.includes("_percent");
  const isEnabledField = (key) => key.endsWith("_enabled");

  function buildEmptySessionFromSchema(sessionSchema) {
    const schema = sessionSchema || {};
    const fields = [
      ...(schema.required_core_fields || []),
      ...(schema.required_time_model_fields || []),
      ...(schema.optional_fields || [])
    ];

    const session = {};
    fields.forEach((key) => {
      if (isPercentField(key)) session[key] = 0;
      else if (isEnabledField(key)) session[key] = false;
      else session[key] = null;
    });

    return session;
  }

  function getConfig() {
    return window.SESSION_V2_CONFIG || {};
  }

  function parseMaybeNumber(value, key) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const cleaned = value.trim();
      if (cleaned === "") return isPercentField(key) ? 0 : null;
      const normalized = cleaned.replace(",", ".");
      const num = Number(normalized);
      return Number.isFinite(num) ? num : value;
    }
    return value;
  }

  function normalizeSessionValues(session, schemaFields, methodRanges) {
    const ranges = methodRanges || {};
    schemaFields.forEach((key) => {
      let value = session[key];
      value = parseMaybeNumber(value, key);

      if (value == null) {
        if (isPercentField(key)) value = 0;
        if (isEnabledField(key)) value = false;
      }

      if (typeof value === "number" && ranges[key]) {
        const [min, max] = ranges[key];
        if (typeof min === "number" && typeof max === "number") {
          value = clamp(value, min, max);
        }
      }

      session[key] = value;
    });
  }

  function validateSession(session, schema, enums, method, warnings) {
    const requiredFields = [
      ...(schema.required_core_fields || []),
      ...(schema.required_time_model_fields || [])
    ];

    requiredFields.forEach((key) => {
      const value = session[key];
      if (value == null || value === "") {
        warnings.push(`Missing required field: ${key}.`);
      }
    });

    if (enums && typeof enums === "object") {
      Object.entries(enums).forEach(([key, values]) => {
        if (!Array.isArray(values)) return;
        const value = session[key];
        if (value != null && value !== "" && !values.includes(value)) {
          warnings.push(`Invalid ${key} value: ${value}.`);
        }
      });
    }

    const preferment = method?.calculation_model?.preferment;
    if (preferment?.type === "hybrid_poolish_biga") {
      const poolishShare = Number(session.hybrid_poolish_share_percent ?? 0);
      const bigaShare = Number(session.hybrid_biga_share_percent ?? 0);
      const total = poolishShare + bigaShare;
      if (total !== 100 && total > 0) {
        const normalizedPoolish = round((poolishShare / total) * 100, 2);
        const normalizedBiga = round((bigaShare / total) * 100, 2);
        session.hybrid_poolish_share_percent = normalizedPoolish;
        session.hybrid_biga_share_percent = round(100 - normalizedPoolish, 2);
        warnings.push("Hybrid preferment shares normalized to sum to 100%." );
      }
    }
  }

  function applySafetyRules(session, globalDefaults, warnings) {
    const rules = globalDefaults?.ingredient_safety_rules || {};
    const ovenType = session.oven_type;

    if (rules.diastatic_malt) {
      const malt = rules.diastatic_malt;
      if (Array.isArray(malt.disallow_when)) {
        const disallowed = malt.disallow_when.some((rule) => rule.oven_type === ovenType);
        if (disallowed && Number(session.diastatic_malt_percent || 0) > 0) {
          session.diastatic_malt_percent = 0;
          warnings.push("Diastatic malt disabled for this oven type.");
        }
      }
      if (typeof malt.max_percent === "number") {
        if (Number(session.diastatic_malt_percent || 0) > malt.max_percent) {
          session.diastatic_malt_percent = malt.max_percent;
          warnings.push("Diastatic malt percent clamped to safety max.");
        }
      }
    }

    if (rules.honey) {
      const honey = rules.honey;
      let maxHoney = null;
      if (honey.max_percent_by_oven_type && ovenType) {
        maxHoney = honey.max_percent_by_oven_type[ovenType] ?? null;
      }
      if (maxHoney == null && typeof honey.max_percent === "number") {
        maxHoney = honey.max_percent;
      }
      if (maxHoney != null && Number(session.honey_percent || 0) > maxHoney) {
        session.honey_percent = maxHoney;
        warnings.push("Honey percent clamped to oven safety max.");
      }
    }

    if (rules.oil && typeof rules.oil.max_percent === "number") {
      if (Number(session.oil_percent || 0) > rules.oil.max_percent) {
        session.oil_percent = rules.oil.max_percent;
        warnings.push("Oil percent clamped to safety max.");
      }
    }
  }

  function computeTotals(session) {
    const totalPercent = [
      session.hydration_percent,
      session.salt_percent,
      session.oil_percent,
      session.honey_percent,
      session.sugar_percent,
      session.diastatic_malt_percent,
      session.yeast_percent
    ].reduce((sum, value) => sum + (Number(value) || 0), 0);

    const totalDoughG = Number(session.target_total_dough_g || 0);
    const flourG = totalPercent > 0 ? totalDoughG / (1 + totalPercent / 100) : totalDoughG;

    return {
      totalDoughG,
      flourG
    };
  }

  function deriveSession(session, method, globalDefaults) {
    const derived = {};

    const targetPizzaCount = Number(session.target_pizza_count || 0);
    const doughUnitWeightG = Number(session.dough_unit_weight_g || 0);
    const panArea = Number(session.pan_or_tray_area_cm2 || 0);
    const gramsPerCm2 = Number(session.dough_grams_per_cm2 || 0);

    let targetTotalDoughG = 0;
    if (panArea > 0 && gramsPerCm2 > 0) {
      targetTotalDoughG = panArea * gramsPerCm2;
    } else if (targetPizzaCount > 0 && doughUnitWeightG > 0) {
      targetTotalDoughG = targetPizzaCount * doughUnitWeightG;
    }

    session.target_total_dough_g = round(targetTotalDoughG, 1);
    derived.target_total_dough_g = session.target_total_dough_g;

    const totals = computeTotals(session);
    const totalFlourG = totals.flourG;
    const totalWaterG = totalFlourG * (Number(session.hydration_percent || 0) / 100);
    const totalSaltG = totalFlourG * (Number(session.salt_percent || 0) / 100);
    const totalOilG = totalFlourG * (Number(session.oil_percent || 0) / 100);
    const totalHoneyG = totalFlourG * (Number(session.honey_percent || 0) / 100);
    const totalMaltG = totalFlourG * (Number(session.diastatic_malt_percent || 0) / 100);
    const totalSugarG = totalFlourG * (Number(session.sugar_percent || 0) / 100);
    const totalYeastG = totalFlourG * (Number(session.yeast_percent || 0) / 100);

    derived.total_flour_g = round(totalFlourG, 1);
    derived.total_water_g = round(totalWaterG, 1);
    derived.total_salt_g = round(totalSaltG, 1);
    derived.total_oil_g = round(totalOilG, 1);
    derived.total_honey_g = round(totalHoneyG, 1);
    derived.total_malt_g = round(totalMaltG, 1);
    derived.total_sugar_g = round(totalSugarG, 1);
    derived.total_yeast_g = round(totalYeastG, 3);

    const preferment = method?.calculation_model?.preferment;
    const starter = method?.calculation_model?.starter;
    const subtractPreferment = Boolean(method?.calculation_model?.final_mix?.subtract_preferment);
    const subtractStarter = Boolean(method?.calculation_model?.final_mix?.subtract_starter);

    let prefermentFlourG = 0;
    let prefermentWaterG = 0;
    let prefermentYeastG = 0;
    let prefermentComponents = null;

    if (session.preferment_enabled && preferment && session.preferment_flour_percent_of_total > 0) {
      const prefPct = Number(session.preferment_flour_percent_of_total || 0) / 100;
      prefermentFlourG = totalFlourG * prefPct;

      if (preferment.type === "hybrid_poolish_biga") {
        const poolishShare = Number(session.hybrid_poolish_share_percent || 0) / 100;
        const bigaShare = Number(session.hybrid_biga_share_percent || 0) / 100;
        const poolishFlourG = prefermentFlourG * poolishShare;
        const bigaFlourG = prefermentFlourG * bigaShare;

        const poolishHydrationKey = preferment.components?.poolish?.hydration_percent_field;
        const bigaHydrationKey = preferment.components?.biga?.hydration_percent_field;
        const poolishHydration = Number(session[poolishHydrationKey])
          || Number(method?.defaults?.[poolishHydrationKey])
          || 100;
        const bigaHydration = Number(session[bigaHydrationKey])
          || Number(method?.defaults?.[bigaHydrationKey])
          || 45;

        const poolishWaterG = poolishFlourG * (poolishHydration / 100);
        const bigaWaterG = bigaFlourG * (bigaHydration / 100);

        prefermentWaterG = poolishWaterG + bigaWaterG;
        prefermentComponents = {
          poolish_flour_g: round(poolishFlourG, 1),
          poolish_water_g: round(poolishWaterG, 1),
          biga_flour_g: round(bigaFlourG, 1),
          biga_water_g: round(bigaWaterG, 1)
        };
      } else {
        const hydration = Number(session.preferment_hydration_percent || 0) / 100;
        prefermentWaterG = prefermentFlourG * hydration;
      }

      prefermentYeastG = totalYeastG * (prefermentFlourG / (totalFlourG || 1));
    }

    let starterFlourG = 0;
    let starterWaterG = 0;
    if (session.starter_enabled && starter && session.starter_inoculation_percent > 0) {
      starterFlourG = totalFlourG * (Number(session.starter_inoculation_percent || 0) / 100);
      starterWaterG = starterFlourG * (Number(session.starter_hydration_percent || 100) / 100);
    }

    derived.preferment_flour_g = round(prefermentFlourG, 1);
    derived.preferment_water_g = round(prefermentWaterG, 1);
    derived.preferment_yeast_g = round(prefermentYeastG, 3);
    derived.preferment_total_g = round(prefermentFlourG + prefermentWaterG + prefermentYeastG, 1);

    derived.starter_flour_g = round(starterFlourG, 1);
    derived.starter_water_g = round(starterWaterG, 1);
    derived.starter_total_g = round(starterFlourG + starterWaterG, 1);

    if (prefermentComponents) {
      derived.preferment_components = prefermentComponents;
    }

    const flourSubtract = (subtractPreferment ? prefermentFlourG : 0) + (subtractStarter ? starterFlourG : 0);
    const waterSubtract = (subtractPreferment ? prefermentWaterG : 0) + (subtractStarter ? starterWaterG : 0);

    derived.final_mix_flour_g = round(totalFlourG - flourSubtract, 1);
    derived.final_mix_water_g = round(totalWaterG - waterSubtract, 1);
    derived.final_mix_salt_g = round(totalSaltG, 1);
    derived.final_mix_oil_g = round(totalOilG, 1);
    derived.final_mix_honey_g = round(totalHoneyG, 1);
    derived.final_mix_malt_g = round(totalMaltG, 1);
    derived.final_mix_sugar_g = round(totalSugarG, 1);
    derived.final_mix_yeast_g = round(totalYeastG - prefermentYeastG, 3);

    const maxBatch = Number(session.batching_max_dough_mass_g)
      || Number(globalDefaults?.batching?.max_dough_mass_per_batch_g)
      || 0;

    const batches = [];
    if (maxBatch > 0 && targetTotalDoughG > 0) {
      let remaining = targetTotalDoughG;
      let idx = 1;
      while (remaining > 0) {
        const mass = Math.min(maxBatch, remaining);
        batches.push({ batch_index: idx, dough_mass_g: round(mass, 1) });
        remaining -= mass;
        idx += 1;
      }
    }

    derived.batches = batches;

    return derived;
  }

  function getPresetOverrides(preset) {
    if (!preset || typeof preset !== "object") return null;
    if (preset.overrides == null) return null;
    const selectionOverrides = {};
    ["pizza_style_id", "oven_type", "flour_blend_id"].forEach((key) => {
      if (preset[key] != null) selectionOverrides[key] = preset[key];
    });
    return { ...selectionOverrides, ...preset.overrides };
  }

  function resolveSession({ method_id, preset_id, user_session_overrides }) {
    const config = getConfig();
    const schema = config.schema || {};
    const schemaFields = new Set([
      ...(schema.required_core_fields || []),
      ...(schema.required_time_model_fields || []),
      ...(schema.optional_fields || [])
    ]);

    const methods = Array.isArray(config.methods) ? config.methods : [];
    const presets = Array.isArray(config.presets) ? config.presets : [];
    const globalDefaults = config.global_defaults || {};

    const warnings = [];
    const method = methods.find((m) => m.method_id === method_id) || methods[0] || {};
    const preset = presets.find((p) => p.id === preset_id) || null;

    const resolved = buildEmptySessionFromSchema(schema);
    if (schemaFields.has("method_id")) resolved.method_id = method?.method_id || method_id || resolved.method_id;

    const applyOverrides = (source) => {
      if (!source || typeof source !== "object") return;
      Object.entries(source).forEach(([key, value]) => {
        if (!schemaFields.has(key)) return;
        resolved[key] = value;
      });
    };

    applyOverrides(method.defaults);

    const presetOverrides = getPresetOverrides(preset);
    const styleIdForDefaults = preset?.pizza_style_id || resolved.pizza_style_id;
    const hasTargetOverrides = presetOverrides
      ? Object.prototype.hasOwnProperty.call(presetOverrides, "target_pizza_count")
        || Object.prototype.hasOwnProperty.call(presetOverrides, "dough_unit_weight_g")
      : false;

    if (!hasTargetOverrides) {
      if (styleIdForDefaults === "neapolitan_round") {
        if (resolved.target_pizza_count == null) resolved.target_pizza_count = 6;
        if (resolved.dough_unit_weight_g == null) resolved.dough_unit_weight_g = 280;
      } else if (styleIdForDefaults === "teglia_bonci") {
        if (resolved.target_pizza_count == null) resolved.target_pizza_count = 1;
        if (resolved.dough_unit_weight_g == null) resolved.dough_unit_weight_g = 1200;
      } else if (styleIdForDefaults === "focaccia") {
        if (resolved.target_pizza_count == null) resolved.target_pizza_count = 1;
        if (resolved.dough_unit_weight_g == null) resolved.dough_unit_weight_g = 1200;
      } else if (styleIdForDefaults === "pizza_rossa") {
        if (resolved.target_pizza_count == null) resolved.target_pizza_count = 1;
        if (resolved.dough_unit_weight_g == null) resolved.dough_unit_weight_g = 1000;
      }
    }

    applyOverrides(presetOverrides);
    applyOverrides(user_session_overrides);

    const schemaFieldList = Array.from(schemaFields);
    normalizeSessionValues(resolved, schemaFieldList, method.ranges || {});
    validateSession(resolved, schema, config.enums || {}, method, warnings);
    applySafetyRules(resolved, globalDefaults, warnings);
    const derived = deriveSession(resolved, method, globalDefaults);

    const warningEnabled = resolved.warnings_enabled !== false;
    const finalWarnings = warningEnabled ? warnings : [];

    return {
      resolved_session: resolved,
      derived_session: derived,
      warnings: finalWarnings
    };
  }

  function getResolvedSessionBundle() {
    const accessor = window.PizzaSessionStateAccessor;
    if (!accessor || typeof accessor.getSessionV2 !== "function") {
      return { resolved_session: null, derived_session: null, warnings: [] };
    }
    const bundle = accessor.getSessionV2();
    return bundle || { resolved_session: null, derived_session: null, warnings: [] };
  }

  window.SessionResolver = {
    buildEmptySessionFromSchema,
    resolveSession,
    getResolvedSessionBundle
  };
})();
