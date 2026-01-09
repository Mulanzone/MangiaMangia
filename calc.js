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

  const YEAST_DISPLAY_MULTIPLIER = {
    IDY: 1,
    ADY: 3,
    FRESH: 9
  };

  function fToC(f) {
    const n = Number(f);
    return Number.isFinite(n) ? (n - 32) * (5 / 9) : null;
  }

  function normalizeTempTargets(tempTargetsF) {
    if (!tempTargetsF || typeof tempTargetsF !== "object") return {};
    const out = {};
    Object.entries(tempTargetsF).forEach(([key, range]) => {
      if (!Array.isArray(range) || range.length !== 2) return;
      const a = fToC(range[0]);
      const b = fToC(range[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) out[key] = [a, b];
    });
    return out;
  }

  function getOvenById(ovens, id) {
    return (ovens || []).find((o) => o.id === id) || null;
  }

  function getOvenProgramById(oven, id) {
    if (!oven || !Array.isArray(oven.programs)) return null;
    return oven.programs.find((p) => p.id === id) || null;
  }

  function getMixerById(mixers, id) {
    return (mixers || []).find((m) => m.id === id) || null;
  }

  function getDefaultPlannedEatISO() {
    const now = new Date();
    const local = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      18,
      30,
      0,
      0
    );
    return local.toISOString();
  }

  function normalizeSession(session) {
    const s = session && typeof session === "object" ? session : {};
    return {
      schemaVersion: s.schemaVersion || "1.0",
      sessionId: s.sessionId || "session_unknown",
      plannedEatTimeISO: s.plannedEatTimeISO || getDefaultPlannedEatISO(),
      timezone: s.timezone || "America/Toronto",
      doughModality: s.doughModality || "MAKE_DOUGH",
      styleId: s.styleId || "ROUND_NEAPOLITAN",
      ballsUsed: Number.isFinite(Number(s.ballsUsed)) ? Number(s.ballsUsed) : 1,
      ballWeightG: Number.isFinite(Number(s.ballWeightG)) ? Number(s.ballWeightG) : 260,
      oven_id: s.oven_id || null,
      oven_program_id: s.oven_program_id || null,
      oven_overrides: s.oven_overrides || { enabled: false },
      mixer_id: s.mixer_id || null,
      fermentationLocation: s.fermentationLocation || "ROOM",
      fermentationMode: s.fermentationMode || "SINGLE",
      totalFermentationHours: Number.isFinite(Number(s.totalFermentationHours)) ? Number(s.totalFermentationHours) : 24,
      temps: s.temps || { roomTempC: 22, flourTempC: 22, fridgeTempC: 4 },
      prefermentType: s.prefermentType || "NONE",
      prefermentOptions: s.prefermentOptions || {},
      formulaOverrides: s.formulaOverrides || {},
      temperaturePlanning: s.temperaturePlanning || {},
      existingDough: s.existingDough || {}
    };
  }

  function resolvePreheatMinutes(oven) {
    if (!oven) return 0;
    if (oven.preheat && oven.preheat.preheat_target_minutes != null) {
      return clamp(Number(oven.preheat.preheat_target_minutes), 0, 240);
    }
    const id = String(oven.id || "").toLowerCase();
    if (oven.fuelType === "wood" || id.includes("wfo") || id.includes("wood")) return 90;
    if (id.includes("breville") || id.includes("pizzaiolo")) return 25;
    return 60;
  }

  function resolveOvenProfile(session, catalogs, warnings) {
    const ovens = catalogs?.ovens || [];
    let oven = getOvenById(ovens, session.oven_id);
    if (!oven && ovens.length) oven = ovens[0];

    const programFallback = oven?.programs?.[0] || null;
    let program = getOvenProgramById(oven, session.oven_program_id) || programFallback;

    const tempTargetsF = program?.temp_targets_f || {};
    const tempTargetsC = normalizeTempTargets(tempTargetsF);
    const preheatMinutes = resolvePreheatMinutes(oven);

    const overrides = session.oven_overrides || {};
    const allowOverrides = Boolean(oven?.capabilities?.allow_manual_override);

    const resolvedTempTargetsF = { ...tempTargetsF };
    if (allowOverrides && overrides.enabled) {
      if (overrides.deck_temp_f != null) resolvedTempTargetsF.deck = [overrides.deck_temp_f, overrides.deck_temp_f];
      if (overrides.top_temp_f != null) resolvedTempTargetsF.top = [overrides.top_temp_f, overrides.top_temp_f];
      if (overrides.air_temp_f != null) resolvedTempTargetsF.air = [overrides.air_temp_f, overrides.air_temp_f];
    }

    const resolvedTempTargetsC = normalizeTempTargets(resolvedTempTargetsF);
    const resolvedBakeTimeSeconds = allowOverrides && overrides.enabled && overrides.bake_time_seconds != null
      ? [Number(overrides.bake_time_seconds), Number(overrides.bake_time_seconds)]
      : program?.bake_time_seconds || null;

    const hasBroiler = Boolean(oven?.capabilities?.has_broiler);
    const broilerMode = hasBroiler
      ? (overrides.broiler_mode || "AUTO")
      : "OFF";

    if (!hasBroiler && overrides.broiler_mode && overrides.broiler_mode !== "OFF") {
      warnings.push("Broiler override ignored because the selected oven has no broiler.");
    }

    return {
      oven,
      program,
      preheatMinutes,
      tempTargetsF: resolvedTempTargetsF,
      tempTargetsC: resolvedTempTargetsC,
      bakeTimeSeconds: resolvedBakeTimeSeconds,
      broilerMode,
      allowOverrides
    };
  }

  function resolveMixerProfile(session, catalogs, warnings) {
    const mixers = catalogs?.mixers || [];
    let mixer = getMixerById(mixers, session.mixer_id);
    if (!mixer && mixers.length) mixer = mixers[0];

    let frictionFactorC = null;
    if (mixer?.frictionFactorRangeC && mixer.frictionFactorRangeC.length === 2) {
      const [min, max] = mixer.frictionFactorRangeC;
      if (Number.isFinite(min) && Number.isFinite(max)) {
        frictionFactorC = (Number(min) + Number(max)) / 2;
      }
    }

    if (frictionFactorC == null) {
      const key = String(mixer?.id || mixer?.type || "").toUpperCase();
      if (key.includes("HAND")) frictionFactorC = 3;
      else if (key.includes("HALO")) frictionFactorC = 8;
      else if (key.includes("KITCHENAID") || key.includes("PLANETARY")) frictionFactorC = 10;
      else {
        frictionFactorC = 3;
        warnings.push(`Unknown mixer friction factor for "${mixer?.id || "unknown"}", using 3°C.`);
      }
    }

    return {
      mixer,
      frictionFactorC
    };
  }

  function selectPoolishFlour(totalFlourG, options, warnings) {
    const override = options?.poolishBatchOverride || "AUTO";
    if (override === "FORCE_300") return Math.min(totalFlourG, 300);
    if (override === "FORCE_400") return Math.min(totalFlourG, 400);
    if (override === "CUSTOM") {
      const custom = Number(options?.customPoolishFlourG);
      if (Number.isFinite(custom) && custom > 0) return Math.min(totalFlourG, custom);
      warnings.push("Custom poolish flour invalid; falling back to auto.");
    }
    const suggested = totalFlourG * 0.3;
    return clamp(suggested, 0, Math.min(totalFlourG, 400));
  }

  function computeIngredients(session, totalDoughG, mixerProfile, warnings) {
    const overrides = session.formulaOverrides || {};
    const hydrationPct = Number.isFinite(overrides.hydrationPct) ? Number(overrides.hydrationPct) : 63;
    const saltPct = Number.isFinite(overrides.saltPct) ? Number(overrides.saltPct) : 2.8;
    const oilPct = Number.isFinite(overrides.oilPct) ? Number(overrides.oilPct) : 0;
    const honeyPct = Number.isFinite(overrides.honeyPct) ? Number(overrides.honeyPct) : 0;
    const maltPct = Number.isFinite(overrides.maltPct) ? Number(overrides.maltPct) : 0;
    const yeastPctIDY = Number.isFinite(overrides.yeastPctIDY) ? Number(overrides.yeastPctIDY) : 0.05;
    const yeastType = String(overrides.yeastType || "IDY").toUpperCase();

    const percentSum = 1 + (hydrationPct + saltPct + oilPct + honeyPct + maltPct + yeastPctIDY) / 100;
    const totalFlourG = totalDoughG / percentSum;
    const totalWaterG = totalFlourG * (hydrationPct / 100);
    const totalSaltG = totalFlourG * (saltPct / 100);
    const totalOilG = totalFlourG * (oilPct / 100);
    const totalHoneyG = totalFlourG * (honeyPct / 100);
    const totalMaltG = totalFlourG * (maltPct / 100);
    const totalYeastG = totalFlourG * (yeastPctIDY / 100);

    const prefermentType = String(session.prefermentType || "NONE").toUpperCase();
    const prefermentOptions = session.prefermentOptions || {};

    let preferment = null;
    let finalMix = null;

    if (prefermentType !== "NONE") {
      const yeastSplit = prefermentType === "POOLISH" || prefermentType === "POOLISH_BIGA_HYBRID" ? 0.7 : 1;
      let prefFlourG = 0;
      let prefWaterG = 0;
      let prefHoneyG = 0;
      let prefYeastG = totalYeastG * yeastSplit;

      if (prefermentType === "POOLISH") {
        const opts = prefermentOptions.poolish || {};
        prefFlourG = selectPoolishFlour(totalFlourG, opts, warnings);
        prefWaterG = prefFlourG;
        if (opts.honeyEnabled) prefHoneyG = totalHoneyG;
      } else if (prefermentType === "BIGA") {
        const opts = prefermentOptions.biga || {};
        const pct = clamp(Number(opts.bigaPercentTotalFlour || 0), 0, 100) / 100;
        prefFlourG = totalFlourG * pct;
        const hydration = clamp(Number(opts.bigaHydrationPct || 55), 50, 80);
        prefWaterG = prefFlourG * (hydration / 100);
      } else if (prefermentType === "TIGA") {
        const opts = prefermentOptions.tiga || {};
        const pct = clamp(Number(opts.tigaPercentTotalFlour || 0), 0, 100) / 100;
        prefFlourG = totalFlourG * pct;
        prefWaterG = prefFlourG * 0.7;
      } else if (prefermentType === "POOLISH_BIGA_HYBRID") {
        const opts = prefermentOptions.hybrid || {};
        const poolishFlourG = selectPoolishFlour(totalFlourG, opts, warnings);
        const poolishWaterG = poolishFlourG;
        const remainderFlourG = totalFlourG - poolishFlourG;
        const bigaPct = clamp(Number(opts.bigaPercentOfRemainderFlour || 0), 0, 100) / 100;
        const bigaFlourG = remainderFlourG * bigaPct;
        const bigaHydration = clamp(Number(opts.bigaHydrationPct || 55), 50, 80);
        const bigaWaterG = bigaFlourG * (bigaHydration / 100);
        prefFlourG = poolishFlourG + bigaFlourG;
        prefWaterG = poolishWaterG + bigaWaterG;
        if (opts.honeyEnabled) prefHoneyG = totalHoneyG;
      } else if (prefermentType === "SOURDOUGH") {
        const opts = prefermentOptions.sourdough || {};
        const inoculationPct = clamp(Number(opts.inoculationPctFlourBasis || 0), 0, 100) / 100;
        prefFlourG = totalFlourG * inoculationPct;
        const starterHydration = Number(opts.starterHydrationPct || 100) / 100;
        prefWaterG = prefFlourG * starterHydration;
        prefYeastG = 0;
        if (opts.useCommercialYeastAssist) {
          const assistPct = clamp(Number(opts.yeastAssistPctIDY || 0), 0, 5);
          prefYeastG = totalFlourG * (assistPct / 100);
        }
      }

      preferment = {
        type: prefermentType,
        flourG: round(prefFlourG, 1),
        waterG: round(prefWaterG, 1),
        honeyG: round(prefHoneyG, 1),
        yeastG: round(prefYeastG, 2)
      };

      const finalYeastG = Math.max(0, totalYeastG - preferment.yeastG);

      finalMix = {
        flourG: round(totalFlourG - preferment.flourG, 1),
        waterG: round(totalWaterG - preferment.waterG, 1),
        saltG: round(totalSaltG, 1),
        oilG: round(totalOilG, 1),
        honeyG: round(totalHoneyG - preferment.honeyG, 1),
        maltG: round(totalMaltG, 1),
        yeastG: round(finalYeastG, 2),
        addPrefermentMassG: round(preferment.flourG + preferment.waterG + preferment.honeyG + preferment.yeastG, 1)
      };
    }

    const yeastDisplayMultiplier = YEAST_DISPLAY_MULTIPLIER[yeastType] || 1;

    return {
      totals: {
        flourG: round(totalFlourG, 1),
        waterG: round(totalWaterG, 1),
        saltG: round(totalSaltG, 1),
        oilG: round(totalOilG, 1),
        honeyG: round(totalHoneyG, 1),
        maltG: round(totalMaltG, 1),
        yeastG: round(totalYeastG, 2),
        yeastType,
        yeastPctIDY,
        yeastPctDisplay: round(yeastPctIDY * yeastDisplayMultiplier, 3),
        yeastGDisplay: round(totalYeastG * yeastDisplayMultiplier, 2)
      },
      preferment,
      finalMix
    };
  }

  function computeIngredientBreakdown({ totals, prefermentType, prefermentPct }) {
    const errors = [];
    const t = totals || {};
    const totalFlour = Number(t.flour || 0);
    const totalWater = Number(t.water || 0);
    const totalSalt = Number(t.salt || 0);
    const totalHoney = Number(t.honey || 0);
    const totalYeast = Number(t.yeast || 0);

    const prefType = String(prefermentType || "direct").toLowerCase();
    const pct = clamp(Number(prefermentPct || 0), 0, 100) / 100;

    let hydration = 1;
    if (prefType === "biga") hydration = 0.55;
    if (prefType === "tiga") hydration = 0.7;

    const usePreferment = prefType !== "direct" && pct > 0;
    const prefermentFlour = usePreferment ? Math.min(totalFlour, totalFlour * pct) : 0;
    const prefermentWater = usePreferment ? Math.min(totalWater, prefermentFlour * hydration) : 0;
    const prefermentHoney = usePreferment ? totalHoney : 0;
    const prefermentYeast = usePreferment ? totalYeast : 0;

    const finalFlour = Math.max(0, totalFlour - prefermentFlour);
    const finalWater = Math.max(0, totalWater - prefermentWater);
    const finalHoney = Math.max(0, totalHoney - prefermentHoney);
    const finalYeast = Math.max(0, totalYeast - prefermentYeast);

    const prefermentTotalMass = prefermentFlour + prefermentWater + prefermentHoney + prefermentYeast;

    if (usePreferment && prefermentFlour === 0) {
      errors.push("Preferment flour is zero; check preferment percentage.");
    }

    return {
      totals: {
        flour: round(totalFlour, 1),
        water: round(totalWater, 1),
        salt: round(totalSalt, 1),
        honey: round(totalHoney, 1),
        yeast: round(totalYeast, 2)
      },
      preferment: {
        type: prefType,
        flour: round(prefermentFlour, 1),
        water: round(prefermentWater, 1),
        honey: round(prefermentHoney, 1),
        yeast: round(prefermentYeast, 2),
        totalMass: round(prefermentTotalMass, 1)
      },
      finalMix: {
        flour: round(finalFlour, 1),
        water: round(finalWater, 1),
        salt: round(totalSalt, 1),
        honey: round(finalHoney, 1),
        yeast: round(finalYeast, 2),
        addPrefermentMass: round(prefermentTotalMass, 1)
      },
      errors
    };
  }

  function computeWaterTempC(session, mixerProfile) {
    const temps = session.temps || {};
    const target = Number.isFinite(Number(session.temperaturePlanning?.targetDDTC))
      ? Number(session.temperaturePlanning?.targetDDTC)
      : 23;
    const roomTempC = Number.isFinite(Number(temps.roomTempC)) ? Number(temps.roomTempC) : 22;
    const flourTempC = Number.isFinite(Number(temps.flourTempC)) ? Number(temps.flourTempC) : 22;
    const friction = Number.isFinite(Number(mixerProfile?.frictionFactorC)) ? Number(mixerProfile.frictionFactorC) : 3;
    return round(target * 3 - roomTempC - flourTempC - friction, 1);
  }

  function scheduleBackward(plannedEatISO, blocks) {
    const plannedDate = new Date(plannedEatISO);
    if (Number.isNaN(plannedDate.getTime())) return [];
    let cursor = plannedDate;
    const out = [];
    [...blocks].reverse().forEach((block) => {
      const durationMs = (block.durationMinutes || 0) * 60 * 1000;
      const start = new Date(cursor.getTime() - durationMs);
      out.push({
        label: block.label,
        startISO: start.toISOString(),
        endISO: cursor.toISOString(),
        meta: block.meta || {}
      });
      cursor = start;
    });
    return out.reverse();
  }

  function buildTimeline(session, ovenProfile, warnings) {
    const blocks = [];
    const mode = session.doughModality;
    const plannedEatISO = session.plannedEatTimeISO;

    const bakeWindowMinutes = 30;
    blocks.push({ label: "Bake window", durationMinutes: bakeWindowMinutes });
    if (ovenProfile?.preheatMinutes) {
      blocks.push({ label: "Preheat oven", durationMinutes: ovenProfile.preheatMinutes });
    }

    if (mode === "MAKE_DOUGH") {
      const totalHours = clamp(Number(session.totalFermentationHours || 24), 0, 72);
      const bulkMinutes = totalHours * 60 * 0.6;
      const proofMinutes = totalHours * 60 * 0.4;
      blocks.push({ label: "Balling / pan proof", durationMinutes: proofMinutes });
      blocks.push({ label: "Bulk fermentation", durationMinutes: bulkMinutes });
      blocks.push({ label: "Mix & develop dough", durationMinutes: 20 });

      const prefType = String(session.prefermentType || "NONE").toUpperCase();
      if (prefType !== "NONE") {
        const prefLeadHours = prefType === "POOLISH" ? 16 : prefType === "BIGA" ? 18 : prefType === "SOURDOUGH" ? 10 : 12;
        blocks.push({ label: "Build preferment", durationMinutes: prefLeadHours * 60 });
      }
    } else {
      const existing = session.existingDough || {};
      const source = existing.source || "FROZEN";
      const thawLocation = existing.thawLocation || "FRIDGE";
      if (source === "FROZEN") {
        const fridgeThawHours = 18;
        const temperHours = 3;
        if (thawLocation === "FRIDGE") {
          blocks.push({ label: "Temper dough", durationMinutes: temperHours * 60, meta: { location: "ROOM" } });
          blocks.push({ label: "Thaw in fridge", durationMinutes: fridgeThawHours * 60, meta: { location: "FRIDGE" } });
        } else {
          blocks.push({ label: "Room-temp thaw", durationMinutes: 5 * 60, meta: { location: "ROOM" } });
          warnings.push("Insufficient thaw time; using room-temp thaw guidance (4–6h). Keep an eye on dough temperature.");
        }
      } else {
        blocks.push({ label: "Temper dough", durationMinutes: 2 * 60, meta: { location: "ROOM" } });
      }
    }

    return scheduleBackward(plannedEatISO, blocks);
  }

  function resolveSessionToPlan(session, catalogs = {}) {
    const warnings = [];
    const normalized = normalizeSession(session);

    if (normalized.styleId === "PAN_SICILIAN_STANDARD") {
      normalized.ballsUsed = 1;
    }

    const mode = normalized.doughModality;
    const useExisting = mode === "USE_EXISTING_DOUGH";
    const ballsUsed = useExisting
      ? Number(normalized.existingDough.ballsUsed || normalized.ballsUsed || 1)
      : Number(normalized.ballsUsed || 1);
    const ballWeightG = useExisting
      ? Number(normalized.existingDough.ballWeightG || normalized.ballWeightG || 0)
      : Number(normalized.ballWeightG || 0);

    const totalDoughG = round(ballsUsed * ballWeightG, 1);

    const ovenProfile = resolveOvenProfile(normalized, catalogs, warnings);
    const mixerProfile = resolveMixerProfile(normalized, catalogs, warnings);

    let ingredients = null;
    let recommendedWaterTempC = null;
    if (!useExisting) {
      ingredients = computeIngredients(normalized, totalDoughG, mixerProfile, warnings);
      recommendedWaterTempC = computeWaterTempC(normalized, mixerProfile);
    }

    const bakePlan = {
      launchMethod: ovenProfile?.program?.launch_method || null,
      rotationStrategy: ovenProfile?.program?.rotation_strategy || null,
      bakeTimeSeconds: ovenProfile?.bakeTimeSeconds || null,
      tempTargetsF: ovenProfile?.tempTargetsF || null,
      tempTargetsC: ovenProfile?.tempTargetsC || null,
      broilerMode: ovenProfile?.broilerMode || "OFF"
    };

    const timelineBlocks = buildTimeline(normalized, ovenProfile, warnings);

    return {
      mode,
      totalDoughG,
      warnings,
      ovenProfile,
      mixerProfile,
      bakePlan,
      ingredients,
      recommendedWaterTempC,
      timelineBlocks
    };
  }

  return {
    resolveSessionToPlan,
    computeIngredientBreakdown
  };
});
