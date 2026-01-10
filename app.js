/* ============================================================
   Schema Coverage Map
   - Core session identity + scheduling:
     planned_eat_time_iso (UI: Session Settings), timezone (internal), dough_modality (UI)
   - Canonical session core:
     pizza_style_id (UI: Session Settings), method_id (UI: Dough Method),
     oven_type (UI: Equipment), flour_blend_id (UI: Dough Method),
     target_pizza_count (UI: Sizing; minimum derived from Orders), dough_unit_weight_g (UI: Sizing),
     hydration_percent/salt_percent/oil_percent/honey_percent/sugar_percent/
     diastatic_malt_percent/yeast_percent/yeast_type (UI: Formula Overrides),
     fermentation_location (UI: Fermentation Plan), ambient_temp_c/fridge_temp_c/
     flour_temp_c (UI: Temperature Planning), mix_method (UI: Equipment)
   - Preferment + starter:
     preferment_enabled/preferment_type/preferment_flour_percent_of_total/
     preferment_hydration_percent/preferment_mature_hours (UI: Preferment Options),
     hybrid_poolish_share_percent/hybrid_biga_share_percent/
     poolish_hydration_percent/biga_hydration_percent (UI: Preferment Options),
     starter_enabled/starter_hydration_percent/starter_inoculation_percent/
     starter_peak_window_hours (UI: Preferment Options)
   - Fermentation time model:
     bulk_ferment_hours/cold_ferment_hours/ball_or_pan_ferment_hours
     (UI: Fermentation Plan, plus total + mode helpers)
   - Pan sizing + batching:
     pan_or_tray_area_cm2/dough_grams_per_cm2 (UI: Sizing; used for pan weight calc),
     batching_max_dough_mass_g (UI: Sizing; derived batch splits)
   - Allowed dead-end placeholders:
     pan_length_in/pan_width_in (UI: Sizing; stored but not used)
   - Derived outputs:
     target_total_dough_g/total_flour_g/total_water_g/total_salt_g/total_oil_g/
     total_honey_g/total_malt_g/total_sugar_g/total_yeast_g/preferment_*_g/
     starter_*_g/final_mix_*_g/batches (Derived + displayed in Ingredient Totals)
   ============================================================ */

(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (num, min, max) => Math.max(min, Math.min(max, num));
  const round = (num, digits = 1) => Math.round(num * 10 ** digits) / 10 ** digits;

  const LS_KEY = "mm_app_state_v3";
  const ASSET_BASE_KEY = "mm_asset_base";
  const CUSTOM_PRESET_ID = "manual_custom";
  const PAN_DENSITY_G_CM2 = 0.59;

  const APP_STATE = {
    catalogs: {
      ovens: [],
      mixers: []
    },
    methods: [],
    presets: [],
    orders: [],
    session: {
      inputs: {},
      userTouched: {},
      resolved: {},
      derived: {},
      warnings: [],
      safetyViolations: {},
      presetNotices: [],
      requiredKeys: [],
      coverageMissing: [],
      flags: {
        doughWeightUserOverride: false,
        panAutoWeightEnabled: true
      }
    },
    ui: {
      activeTab: "session"
    }
  };

  window.APP_STATE = APP_STATE;

  const BASE_INPUT_DEFAULTS = {
    planned_eat_time_iso: "",
    timezone: "America/Toronto",
    dough_modality: "make_dough",
    existing_dough_state: "frozen",
    pizza_style_id: "neapolitan_round",
    method_id: "direct",
    preset_id: "manual_custom",
    oven_id: null,
    oven_setting_id: null,
    oven_type: "gas_pizza_oven",
    flour_blend_id: "00_only",
    mixer_id: null,
    target_pizza_count: 0,
    dough_unit_weight_g: 270,
    pan_or_tray_area_cm2: null,
    dough_grams_per_cm2: null,
    pan_length_in: null,
    pan_width_in: null,
    ambient_temp_c: 22,
    flour_temp_c: 22,
    fridge_temp_c: 4,
    ddt_model_enabled: true,
    target_fdt_c: 23,
    mix_method: "hand",
    batching_max_dough_mass_g: 3500,
    warnings_enabled: true,
    notes_md: ""
  };

  const COVERAGE_MAP = {
    pizza_style_id: "ui",
    method_id: "ui",
    oven_type: "ui",
    flour_blend_id: "ui",
    target_pizza_count: "ui",
    dough_unit_weight_g: "ui",
    hydration_percent: "ui",
    salt_percent: "ui",
    oil_percent: "ui",
    honey_percent: "ui",
    sugar_percent: "ui",
    diastatic_malt_percent: "ui",
    yeast_type: "ui",
    yeast_percent: "ui",
    fermentation_location: "ui",
    bulk_ferment_hours: "ui",
    cold_ferment_hours: "ui",
    ball_or_pan_ferment_hours: "ui",
    preferment_enabled: "ui",
    preferment_type: "ui",
    preferment_flour_percent_of_total: "ui",
    preferment_hydration_percent: "ui",
    preferment_mature_hours: "ui",
    hybrid_poolish_share_percent: "ui",
    hybrid_biga_share_percent: "ui",
    poolish_hydration_percent: "ui",
    biga_hydration_percent: "ui",
    starter_enabled: "ui",
    starter_hydration_percent: "ui",
    starter_inoculation_percent: "ui",
    starter_peak_window_hours: "ui",
    ambient_temp_c: "ui",
    flour_temp_c: "ui",
    fridge_temp_c: "ui",
    ddt_model_enabled: "ui",
    target_fdt_c: "ui",
    mix_method: "ui",
    pan_or_tray_area_cm2: "ui",
    dough_grams_per_cm2: "ui",
    batching_max_dough_mass_g: "ui"
  };

  const DEFAULT_ORDERS = [];

  function cloneDefaultOrders() {
    return DEFAULT_ORDERS.map((order) => ({ ...order }));
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cryptoSafeId(prefix) {
    try {
      const buf = new Uint32Array(2);
      crypto.getRandomValues(buf);
      return `${prefix}_${buf[0].toString(16)}${buf[1].toString(16)}`;
    } catch {
      return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
    }
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

  function isoToLocalInput(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  }

  function localInputToISO(localString) {
    if (!localString) return "";
    const date = new Date(localString);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString();
  }

  function loadState() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        APP_STATE.orders = Array.isArray(parsed.orders) ? parsed.orders : APP_STATE.orders;
        APP_STATE.session.inputs = parsed.session?.inputs || APP_STATE.session.inputs;
        APP_STATE.ui.activeTab = parsed.ui?.activeTab || APP_STATE.ui.activeTab;
        if (APP_STATE.ui.activeTab === "debug") {
          APP_STATE.ui.activeTab = "session";
        }
      }
    } catch {
      // ignore
    }
  }

  function saveState() {
    const payload = {
      orders: APP_STATE.orders,
      session: { inputs: APP_STATE.session.inputs },
      ui: APP_STATE.ui
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  }

  function getDefaultAssetBase() {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/[^/]*$/, "");
    return url.toString();
  }

  function normalizeAssetBase(value, defaultBase) {
    if (!value) return null;
    try {
      const url = new URL(value, defaultBase);
      return new URL("./", url).toString();
    } catch {
      return null;
    }
  }

  function resolveAssetBase() {
    const defaultBase = getDefaultAssetBase();
    const params = new URLSearchParams(window.location.search);
    const fromParam = normalizeAssetBase(params.get("assetBase"), defaultBase);
    if (fromParam) {
      localStorage.setItem(ASSET_BASE_KEY, fromParam);
      return fromParam;
    }

    const stored = localStorage.getItem(ASSET_BASE_KEY);
    const fromStorage = normalizeAssetBase(stored, defaultBase);
    if (fromStorage) return fromStorage;
    if (stored) localStorage.removeItem(ASSET_BASE_KEY);
    return defaultBase;
  }

  function assetUrl(relPath) {
    const base = resolveAssetBase();
    return new URL(relPath, base).toString();
  }

  function stripJsonComments(text) {
    let result = "";
    let inString = false;
    let stringChar = "";
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (inLineComment) {
        if (char === "\n") {
          inLineComment = false;
          result += char;
        }
        continue;
      }

      if (inBlockComment) {
        if (char === "*" && next === "/") {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }

      if (inString) {
        result += char;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === stringChar) {
          inString = false;
          stringChar = "";
        }
        continue;
      }

      if (char === "\"" || char === "'") {
        inString = true;
        stringChar = char;
        escaped = false;
        result += char;
        continue;
      }

      if (char === "/" && next === "/") {
        inLineComment = true;
        i += 1;
        continue;
      }

      if (char === "/" && next === "*") {
        inBlockComment = true;
        i += 1;
        continue;
      }

      result += char;
    }

    return result;
  }

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${path} (HTTP ${res.status})`);
    const text = await res.text();
    return JSON.parse(stripJsonComments(text));
  }

  function getMethodById(id) {
    return APP_STATE.methods.find((m) => m.method_id === id) || null;
  }

  function getPresetById(id) {
    return APP_STATE.presets.find((p) => p.id === id) || null;
  }

  function getOvenById(id) {
    return APP_STATE.catalogs.ovens.find((o) => o.id === id) || null;
  }

  function getMixerById(id) {
    return APP_STATE.catalogs.mixers.find((m) => m.id === id) || null;
  }

  function setMethodFromPreferment(value) {
    const normalized = (value || "").toLowerCase();
    if (normalized === "poolish") return "poolish";
    if (normalized === "biga") return "biga";
    if (normalized === "tiga") return "tiga";
    if (normalized === "hybrid_poolish_biga") return "hybrid_poolish_biga";
    if (normalized === "sourdough" || normalized === "starter") return "sourdough";
    return "direct";
  }

  function deriveMethodIdFromPrefermentType(type) {
    return setMethodFromPreferment(type);
  }

  function prefermentTypeFromMethod(methodId) {
    if (methodId === "poolish") return "poolish";
    if (methodId === "biga") return "biga";
    if (methodId === "tiga") return "tiga";
    if (methodId === "hybrid_poolish_biga") return "hybrid_poolish_biga";
    if (methodId === "sourdough") return "sourdough";
    return "direct";
  }

  function buildRequiredSessionKeys(methodsJson) {
    const keys = new Set();
    const schema = methodsJson.session_schema || {};

    (schema.required_core_fields || []).forEach((k) => keys.add(k));
    (schema.required_time_model_fields || []).forEach((k) => keys.add(k));

    (methodsJson.methods || []).forEach((method) => {
      Object.keys(method.defaults || {}).forEach((k) => keys.add(k));
      const calc = method.calculation_model || {};
      const addIfString = (value) => {
        if (typeof value === "string") keys.add(value);
      };
      addIfString(calc?.preferment?.flour_pct_field);
      addIfString(calc?.preferment?.hydration_field);
      addIfString(calc?.preferment?.split?.poolish_share_field);
      addIfString(calc?.preferment?.split?.biga_share_field);
      addIfString(calc?.preferment?.components?.poolish?.hydration_percent_field);
      addIfString(calc?.preferment?.components?.biga?.hydration_percent_field);
      addIfString(calc?.starter?.enabled_field);
      addIfString(calc?.starter?.starter_hydration_field);
      addIfString(calc?.starter?.starter_inoculation_field);
    });

    const safety = methodsJson.global_defaults?.ingredient_safety_rules || {};
    if (Object.keys(safety).length) {
      keys.add("diastatic_malt_percent");
      keys.add("honey_percent");
      keys.add("sugar_percent");
      keys.add("oil_percent");
    }

    keys.add("flour_temp_c");
    keys.add("batching_max_dough_mass_g");
    keys.add("pan_or_tray_area_cm2");
    keys.add("dough_grams_per_cm2");

    return Array.from(keys);
  }

  function validatePresetOverrides(requiredKeys, presets) {
    const unknown = [];
    presets.forEach((preset) => {
      const overrides = preset.overrides || {};
      Object.keys(overrides).forEach((key) => {
        if (!requiredKeys.includes(key)) {
          unknown.push({ preset: preset.id, key });
        }
      });
    });
    return unknown;
  }

  function validateCoverage(requiredKeys, coverageMap) {
    const missing = requiredKeys.filter((key) => !coverageMap[key]);
    if (missing.length) {
      console.warn(`[Session Warning] Missing coverage for keys: ${missing.join(", ")}.`);
    }
    return missing;
  }

  function normalizeInputs(input, methodDefaults, method) {
    const base = {
      ...BASE_INPUT_DEFAULTS,
      planned_eat_time_iso: getDefaultPlannedEatISO()
    };

    const merged = { ...base, ...methodDefaults, ...input };

    if (!merged.planned_eat_time_iso) {
      merged.planned_eat_time_iso = getDefaultPlannedEatISO();
    }

    if (!merged.timezone) {
      merged.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
    }

    if (!merged.preferment_type) {
      merged.preferment_type = prefermentTypeFromMethod(method?.method_id);
    }

    if (method?.supports) {
      if (!method.supports.preferment) merged.preferment_enabled = false;
      if (!method.supports.starter) merged.starter_enabled = false;
    }

    return merged;
  }

  function getPresetPrefermentType(preset) {
    if (!preset) return null;
    const overrides = preset.overrides || {};
    if (overrides.preferment_type) {
      return overrides.preferment_type === "starter" ? "sourdough" : overrides.preferment_type;
    }
    if (overrides.method_id) return prefermentTypeFromMethod(overrides.method_id);
    if (preset.method_id) return prefermentTypeFromMethod(preset.method_id);
    if (overrides.starter_enabled) return "sourdough";
    if (overrides.preferment_enabled === false) return "direct";
    return null;
  }

  const PRESET_CUSTOM_KEYS = new Set([
    "dough_unit_weight_g",
    "preferment_type",
    "preferment_flour_percent_of_total",
    "preferment_hydration_percent",
    "preferment_mature_hours",
    "hybrid_poolish_share_percent",
    "hybrid_biga_share_percent",
    "poolish_hydration_percent",
    "biga_hydration_percent",
    "starter_enabled",
    "starter_hydration_percent",
    "starter_inoculation_percent",
    "starter_peak_window_hours",
    "fermentation_location",
    "bulk_ferment_hours",
    "cold_ferment_hours",
    "ball_or_pan_ferment_hours",
    "hydration_percent",
    "salt_percent",
    "oil_percent",
    "honey_percent",
    "sugar_percent",
    "diastatic_malt_percent",
    "yeast_percent",
    "yeast_type",
    "ambient_temp_c",
    "flour_temp_c",
    "fridge_temp_c",
    "ddt_model_enabled",
    "target_fdt_c"
  ]);

  function syncPrefermentFlags(inputs, method) {
    const type = inputs.preferment_type || "direct";
    const prefermentEnabled = type !== "direct" && type !== "sourdough";
    const starterEnabled = type === "sourdough";
    inputs.preferment_enabled = prefermentEnabled;
    inputs.starter_enabled = starterEnabled;

    if (method?.supports) {
      if (!method.supports.preferment) inputs.preferment_enabled = false;
      if (!method.supports.starter) inputs.starter_enabled = false;
    }
  }

  function applyMethodDefaultsForChange(nextMethod, prevMethodId) {
    if (!nextMethod) return;
    const prevDefaults = getMethodById(prevMethodId)?.defaults || {};
    const nextDefaults = nextMethod.defaults || {};
    Object.entries(nextDefaults).forEach(([key, value]) => {
      const current = APP_STATE.session.inputs[key];
      if (current === undefined || current === null || current === "" || current === prevDefaults[key]) {
        APP_STATE.session.inputs[key] = value;
      }
    });
  }

  function buildMethodBaseInputs(method, prefermentType) {
    const base = normalizeInputs({}, method?.defaults || {}, method);
    base.preferment_type = prefermentType;
    base.method_id = method?.method_id || deriveMethodIdFromPrefermentType(prefermentType);
    syncPrefermentFlags(base, method);
    return base;
  }

  function shouldMarkPresetCustom(updates, options = {}) {
    if (options.markPresetCustom === false) return false;
    if (options.markPresetCustom === true) return true;
    return Object.keys(updates).some((key) => PRESET_CUSTOM_KEYS.has(key));
  }

  function applyUserOverrides(base, overrides, method) {
    const allowed = new Set([
      ...Object.keys(base),
      ...(APP_STATE.session.requiredKeys || [])
    ]);
    const next = { ...base };
    Object.entries(overrides).forEach(([key, value]) => {
      if (!allowed.has(key)) return;
      if (key === "preferment_type" || key === "method_id") return;
      if (!method?.supports?.preferment && key.startsWith("preferment_")) return;
      if (!method?.supports?.starter && key.startsWith("starter_")) return;
      next[key] = value;
    });
    return next;
  }

  function markUserTouched(keys) {
    if (!APP_STATE.session.userTouched) APP_STATE.session.userTouched = {};
    keys.forEach((key) => {
      APP_STATE.session.userTouched[key] = true;
    });
  }

  function getUserOverridesFromTouched(inputs, method) {
    const touched = APP_STATE.session.userTouched || {};
    const overrides = {};
    Object.entries(touched).forEach(([key, wasTouched]) => {
      if (!wasTouched) return;
      if (key === "preferment_type" || key === "method_id") return;
      if (!method?.supports?.preferment && key.startsWith("preferment_")) return;
      if (!method?.supports?.starter && key.startsWith("starter_")) return;
      overrides[key] = inputs[key];
    });
    return overrides;
  }

  function buildInputsForMethodChange(nextMethod, prefermentType, presetOverrides) {
    const currentInputs = APP_STATE.session.inputs;
    const methodDefaults = nextMethod?.defaults || {};
    const persistentKeys = Object.keys(BASE_INPUT_DEFAULTS).filter(
      (key) => !Object.prototype.hasOwnProperty.call(methodDefaults, key)
    );
    const baseInputs = { ...BASE_INPUT_DEFAULTS };

    baseInputs.planned_eat_time_iso = currentInputs.planned_eat_time_iso || getDefaultPlannedEatISO();
    baseInputs.timezone = currentInputs.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";

    persistentKeys.forEach((key) => {
      if (currentInputs[key] !== undefined) {
        baseInputs[key] = currentInputs[key];
      }
    });

    let resolved = mergeOverrides(methodDefaults, presetOverrides);
    const userOverrides = getUserOverridesFromTouched(currentInputs, nextMethod);
    resolved = mergeOverrides(resolved, userOverrides);

    const nextInputs = { ...baseInputs, ...resolved };
    nextInputs.preferment_type = prefermentType;
    nextInputs.method_id = nextMethod?.method_id || setMethodFromPreferment(prefermentType);
    nextInputs.preset_id = currentInputs.preset_id;
    syncPrefermentFlags(nextInputs, nextMethod);
    return { nextInputs, resolved };
  }

  function recordPresetNotice(message) {
    if (!message) return;
    APP_STATE.session.presetNotices = [message];
  }

  function applyPresetSelection(preset) {
    if (!preset) return;
    const overrides = preset.overrides || {};
    const prefermentType = getPresetPrefermentType(preset);
    const prevMethodId = APP_STATE.session.inputs.method_id;
    const prevPrefermentType = APP_STATE.session.inputs.preferment_type;

    if (prefermentType) {
      APP_STATE.session.inputs.preferment_type = prefermentType;
      APP_STATE.session.inputs.method_id = deriveMethodIdFromPrefermentType(prefermentType);
      applyMethodDefaultsForChange(getMethodById(APP_STATE.session.inputs.method_id), prevMethodId);
      if (prefermentType !== prevPrefermentType) {
        recordPresetNotice(`Preset set preferment type to ${prefermentType}.`);
      }
    }

    Object.entries(overrides).forEach(([key, value]) => {
      if (key === "method_id") return;
      if (value !== undefined && value !== null) {
        APP_STATE.session.inputs[key] = value;
      }
    });

    if (preset.pizza_style_id) {
      APP_STATE.session.inputs.pizza_style_id = preset.pizza_style_id;
    }
    if (preset.oven_type) {
      APP_STATE.session.inputs.oven_type = preset.oven_type;
    }
    if (preset.flour_blend_id) {
      APP_STATE.session.inputs.flour_blend_id = preset.flour_blend_id;
    }

    APP_STATE.session.inputs.preset_id = preset.id;
    syncPrefermentFlags(APP_STATE.session.inputs, getMethodById(APP_STATE.session.inputs.method_id));
  }

  function inferMethodFromPreset(preset) {
    if (!preset || !preset.overrides) return null;
    const overrides = preset.overrides;
    if (overrides.method_id) return overrides.method_id;
    if (overrides.required_method_id) return overrides.required_method_id;
    if (overrides.preferment_type) {
      const type = overrides.preferment_type;
      if (type === "poolish") return "poolish";
      if (type === "biga") return "biga";
      if (type === "tiga") return "tiga";
      if (type === "hybrid_poolish_biga") return "hybrid_poolish_biga";
    }
    if (overrides.starter_enabled || overrides.yeast_type === "starter_only") {
      return "sourdough";
    }
    if (overrides.preferment_enabled === false) return "direct";
    return null;
  }

  function mergeOverrides(base, overrides) {
    const out = { ...base };
    Object.entries(overrides || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) out[key] = value;
    });
    return out;
  }

  function applyRangeClamps(resolved, method, warnings, inputs) {
    const ranges = method?.ranges || {};
    Object.entries(ranges).forEach(([key, range]) => {
      if (!Array.isArray(range) || range.length !== 2) return;
      const [min, max] = range;
      const value = Number(resolved[key]);
      if (!Number.isFinite(value)) return;
      const clamped = clamp(value, min, max);
      if (clamped !== value) {
        warnings.push(`Range clamped ${key} to ${clamped} (was ${value}).`);
        resolved[key] = clamped;
        if (inputs) inputs[key] = clamped;
      }
    });
  }

  function applySafetyRules(resolved, safetyRules, warnings) {
    if (!safetyRules) return {};
    const ovenType = resolved.oven_type;
    const violations = {};
    const applyRule = (field, rule) => {
      if (!rule) return;
      const current = Number(resolved[field] ?? 0);
      if (!Number.isFinite(current)) return;
      let max = null;
      if (rule.max_percent != null) max = rule.max_percent;
      if (rule.max_percent_by_oven_type && rule.max_percent_by_oven_type[ovenType] != null) {
        max = rule.max_percent_by_oven_type[ovenType];
      }
      if (max != null && current > max) {
        violations[field] = { max, current };
        warnings.push(`Safety warning: ${field} exceeds ${max}% for oven type ${ovenType}.`);
      }
    };

    applyRule("diastatic_malt_percent", safetyRules.diastatic_malt);
    applyRule("honey_percent", safetyRules.honey);
    applyRule("sugar_percent", safetyRules.sugar);
    applyRule("oil_percent", safetyRules.oil);

    if (safetyRules.diastatic_malt?.disallow_when) {
      const disallow = safetyRules.diastatic_malt.disallow_when.some(
        (rule) => rule.oven_type === ovenType
      );
      if (disallow && Number(resolved.diastatic_malt_percent || 0) > 0) {
        violations.diastatic_malt_percent = {
          max: 0,
          current: Number(resolved.diastatic_malt_percent || 0)
        };
        warnings.push(`Safety warning: diastatic malt is not recommended for oven type ${ovenType}.`);
      }
    }

    return violations;
  }

  function resolveSession() {
    const warnings = [...(APP_STATE.session.presetNotices || [])];
    const inputs = { ...APP_STATE.session.inputs };

    const selectedPreset = getPresetById(inputs.preset_id) || null;
    const presetType = getPresetPrefermentType(selectedPreset);
    const presetStyle = selectedPreset?.pizza_style_id || null;

    if (inputs.preferment_type === "starter") {
      inputs.preferment_type = "sourdough";
    }

    if (selectedPreset && selectedPreset.id !== CUSTOM_PRESET_ID) {
      if (presetType && inputs.preferment_type && inputs.preferment_type !== presetType) {
        warnings.push("Preset cleared because preferment type changed.");
        inputs.preset_id = CUSTOM_PRESET_ID;
      }
      if (presetStyle && inputs.pizza_style_id && inputs.pizza_style_id !== presetStyle) {
        warnings.push("Preset cleared because style changed.");
        inputs.preset_id = CUSTOM_PRESET_ID;
      }
    }

    if (!inputs.preferment_type && presetType) {
      inputs.preferment_type = presetType;
    }

    const derivedMethodId = deriveMethodIdFromPrefermentType(inputs.preferment_type || "direct");
    if (derivedMethodId && derivedMethodId !== inputs.method_id) {
      warnings.push(`Preferment type set method to ${derivedMethodId}.`);
      inputs.method_id = derivedMethodId;
    }

    let method = getMethodById(inputs.method_id) || APP_STATE.methods[0];
    if (!method && APP_STATE.methods.length) method = APP_STATE.methods[0];
    if (method && inputs.method_id !== method.method_id) {
      warnings.push(`Method reset to ${method.method_id}.`);
      inputs.method_id = method.method_id;
    }

    const normalizedInputs = normalizeInputs(inputs, method?.defaults || {}, method);
    syncPrefermentFlags(normalizedInputs, method);
    enforceLockedFermentTotal(normalizedInputs, warnings);

    let resolved = mergeOverrides(normalizedInputs, {});
    if (selectedPreset?.overrides && inputs.preset_id !== CUSTOM_PRESET_ID) {
      resolved = mergeOverrides(resolved, selectedPreset.overrides);
    }

    syncPrefermentFlags(resolved, method);

    if (selectedPreset?.overrides && APP_STATE.session.requiredKeys?.length) {
      Object.keys(selectedPreset.overrides).forEach((key) => {
        if (!APP_STATE.session.requiredKeys.includes(key)) {
          warnings.push(`Unknown preset key "${key}" from ${selectedPreset.id}.`);
        }
      });
    }

    resolved.method_id = deriveMethodIdFromPrefermentType(resolved.preferment_type || "direct");
    if (resolved.method_id !== method?.method_id) {
      method = getMethodById(resolved.method_id) || method;
    }

    resolved.pizza_style_id = normalizedInputs.pizza_style_id;
    resolved.flour_blend_id = normalizedInputs.flour_blend_id;

    const oven = getOvenById(resolved.oven_id);
    if (oven) {
      if (oven.fuel_type === "wood") resolved.oven_type = "wood_fired";
      if (oven.fuel_type === "electric") resolved.oven_type = "home_electric";
      if (oven.fuel_type === "electric_or_gas") resolved.oven_type = "home_gas";
    }

    applyRangeClamps(resolved, method, warnings, normalizedInputs);
    const safetyViolations = applySafetyRules(
      resolved,
      APP_STATE.methodsJson?.global_defaults?.ingredient_safety_rules,
      warnings
    );

    APP_STATE.session.inputs = normalizedInputs;
    APP_STATE.session.resolved = resolved;
    APP_STATE.session.warnings = warnings;
    APP_STATE.session.safetyViolations = safetyViolations;
    APP_STATE.session.presetNotices = [];

    return { resolved, method, preset: selectedPreset, warnings };
  }

  function resolveOvenAndMixer(resolved) {
    const ovens = APP_STATE.catalogs.ovens;
    let oven = getOvenById(resolved.oven_id) || ovens[0] || null;
    if (oven && !resolved.oven_id) resolved.oven_id = oven.id;

    let setting = null;
    if (oven && oven.programs?.length) {
      setting = oven.programs.find((p) => p.id === resolved.oven_setting_id) || oven.programs[0];
      if (!resolved.oven_setting_id) resolved.oven_setting_id = setting?.id || null;
    }

    const mixers = APP_STATE.catalogs.mixers;
    let mixer = getMixerById(resolved.mixer_id) || mixers[0] || null;
    if (mixer && !resolved.mixer_id) resolved.mixer_id = mixer.id;
    if (mixer?.mixer_class) resolved.mix_method = mixer.mixer_class;

    let frictionFactorC = 3;
    if (mixer?.friction_factor_c_range?.length === 2) {
      frictionFactorC = (mixer.friction_factor_c_range[0] + mixer.friction_factor_c_range[1]) / 2;
    }

    return { oven, setting, mixer, frictionFactorC };
  }

  function computeDerived(resolved, method) {
    const derived = {};
    const ordersTotal = totalPizzasFromOrders();

    const isPan = resolved.pizza_style_id !== "neapolitan_round";
    let doughUnitWeight = Number(resolved.dough_unit_weight_g || 0);
    let ballsUsed = Number(resolved.target_pizza_count || ordersTotal || 0);

    if (!Number.isFinite(ballsUsed) || ballsUsed <= 0) ballsUsed = ordersTotal || 0;

    if (!isPan) {
      const minBalls = 6;
      const minWeight = 270;
      if (!Number.isFinite(doughUnitWeight) || doughUnitWeight <= 0) doughUnitWeight = minWeight;
      if (doughUnitWeight < minWeight) {
        APP_STATE.session.warnings.push(`Ball weight increased to ${minWeight}g minimum.`);
        doughUnitWeight = minWeight;
        APP_STATE.session.inputs.dough_unit_weight_g = minWeight;
      }
      ballsUsed = Math.max(minBalls, ballsUsed, ordersTotal);
      if (ballsUsed !== resolved.target_pizza_count) {
        APP_STATE.session.inputs.target_pizza_count = ballsUsed;
      }
    } else {
      ballsUsed = 1;
      if (resolved.target_pizza_count !== 1) {
        APP_STATE.session.inputs.target_pizza_count = 1;
      }
      const defaultPanWeight = 750;
      if (!APP_STATE.session.flags.doughWeightUserOverride) {
        doughUnitWeight = defaultPanWeight;
        APP_STATE.session.inputs.dough_unit_weight_g = doughUnitWeight;
      }

      const lengthIn = Number(resolved.pan_length_in || 0);
      const widthIn = Number(resolved.pan_width_in || 0);
      if (
        APP_STATE.session.flags.panAutoWeightEnabled &&
        Number.isFinite(lengthIn) &&
        Number.isFinite(widthIn) &&
        lengthIn > 0 &&
        widthIn > 0
      ) {
        const areaCm2 = lengthIn * 2.54 * (widthIn * 2.54);
        const computedWeight = Math.round(areaCm2 * PAN_DENSITY_G_CM2);
        if (Number.isFinite(computedWeight) && computedWeight > 0) {
          doughUnitWeight = computedWeight;
          APP_STATE.session.inputs.dough_unit_weight_g = doughUnitWeight;
        }
      }
    }

    derived.effective_balls_used = ballsUsed;
    derived.dough_unit_weight_g = doughUnitWeight;
    derived.target_total_dough_g = Math.round(ballsUsed * doughUnitWeight);

    const pctFields = [
      "hydration_percent",
      "salt_percent",
      "oil_percent",
      "honey_percent",
      "sugar_percent",
      "diastatic_malt_percent",
      "yeast_percent"
    ];

    const totalPct = pctFields.reduce((sum, key) => {
      const val = Number(resolved[key] || 0);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);

    const totalFlour = derived.target_total_dough_g / (1 + totalPct / 100);

    derived.total_flour_g = round(totalFlour, 1);
    derived.total_water_g = round(totalFlour * (Number(resolved.hydration_percent || 0) / 100), 1);
    derived.total_salt_g = round(totalFlour * (Number(resolved.salt_percent || 0) / 100), 1);
    derived.total_oil_g = round(totalFlour * (Number(resolved.oil_percent || 0) / 100), 1);
    derived.total_honey_g = round(totalFlour * (Number(resolved.honey_percent || 0) / 100), 1);
    derived.total_malt_g = round(totalFlour * (Number(resolved.diastatic_malt_percent || 0) / 100), 1);
    derived.total_sugar_g = round(totalFlour * (Number(resolved.sugar_percent || 0) / 100), 1);
    const idyEquivYeastG = totalFlour * (Number(resolved.yeast_percent || 0) / 100);
    const yeastType = resolved.yeast_type || "idy";
    const yeastFactor = yeastType === "ady" ? 3 : yeastType === "fresh" ? 9 : 1;
    derived.yeast_idy_equiv_g = round(idyEquivYeastG, 2);
    derived.total_yeast_g = round(idyEquivYeastG * yeastFactor, 2);

    derived.preferment_flour_g = 0;
    derived.preferment_water_g = 0;
    derived.preferment_yeast_g = 0;
    derived.preferment_components = null;

    derived.starter_total_g = 0;
    derived.starter_flour_g = 0;
    derived.starter_water_g = 0;

    const prefermentModel = method?.calculation_model?.preferment;
    const starterModel = method?.calculation_model?.starter;

    if (prefermentModel && resolved.preferment_enabled) {
      const prefFlourPct = Number(resolved.preferment_flour_percent_of_total || 0);
      const prefFlour = totalFlour * (prefFlourPct / 100);
      derived.preferment_flour_g = round(prefFlour, 1);

      if (prefermentModel.type === "hybrid_poolish_biga") {
        const poolishShare = Number(resolved.hybrid_poolish_share_percent || 0);
        const bigaShare = Number(resolved.hybrid_biga_share_percent || 0);
        const sum = poolishShare + bigaShare;
        if (sum !== 100) {
          APP_STATE.session.warnings.push("Hybrid preferment shares must sum to 100%; normalized.");
        }
        const normalizedPoolish = sum > 0 ? (poolishShare / sum) * 100 : 50;
        const normalizedBiga = sum > 0 ? (bigaShare / sum) * 100 : 50;
        const poolishFlour = prefFlour * (normalizedPoolish / 100);
        const bigaFlour = prefFlour * (normalizedBiga / 100);
        const poolishHydration = Number(resolved.poolish_hydration_percent || 100);
        const bigaHydration = Number(resolved.biga_hydration_percent || 45);
        const poolishWater = poolishFlour * (poolishHydration / 100);
        const bigaWater = bigaFlour * (bigaHydration / 100);
        derived.preferment_water_g = round(poolishWater + bigaWater, 1);
        derived.preferment_components = {
          poolish: {
            flour_g: round(poolishFlour, 1),
            water_g: round(poolishWater, 1)
          },
          biga: {
            flour_g: round(bigaFlour, 1),
            water_g: round(bigaWater, 1)
          }
        };
      } else {
        const prefHydration = Number(resolved.preferment_hydration_percent || 100);
        const prefWater = prefFlour * (prefHydration / 100);
        derived.preferment_water_g = round(prefWater, 1);
      }

      derived.preferment_yeast_g = round(derived.total_yeast_g, 2);
    }

    if (starterModel && resolved.starter_enabled) {
      const inoculation = Number(resolved.starter_inoculation_percent || 0);
      const starterFlour = totalFlour * (inoculation / 100);
      const starterHydration = Number(resolved.starter_hydration_percent || 100);
      const starterWater = starterFlour * (starterHydration / 100);
      derived.starter_flour_g = round(starterFlour, 1);
      derived.starter_water_g = round(starterWater, 1);
      derived.starter_total_g = round(starterFlour + starterWater, 1);
    }

    let finalFlour = totalFlour;
    let finalWater = derived.total_water_g;
    let finalYeast = derived.total_yeast_g;

    if (prefermentModel?.subtract_from_final_mix && resolved.preferment_enabled) {
      finalFlour -= derived.preferment_flour_g;
      finalWater -= derived.preferment_water_g;
      finalYeast -= derived.preferment_yeast_g;
    }

    if (starterModel?.subtract_from_final_mix && resolved.starter_enabled) {
      finalFlour -= derived.starter_flour_g;
      finalWater -= derived.starter_water_g;
    }

    derived.final_mix_flour_g = round(Math.max(0, finalFlour), 1);
    derived.final_mix_water_g = round(Math.max(0, finalWater), 1);
    derived.final_mix_salt_g = derived.total_salt_g;
    derived.final_mix_oil_g = derived.total_oil_g;
    derived.final_mix_honey_g = derived.total_honey_g;
    derived.final_mix_malt_g = derived.total_malt_g;
    derived.final_mix_sugar_g = derived.total_sugar_g;
    derived.final_mix_yeast_g = round(Math.max(0, finalYeast), 2);

    const maxBatch = Number(resolved.batching_max_dough_mass_g || 0) || 3500;
    const batchCount = Math.max(1, Math.ceil(derived.target_total_dough_g / maxBatch));
    const batchMass = derived.target_total_dough_g / batchCount;
    derived.batches = Array.from({ length: batchCount }, (_, idx) => ({
      index: idx + 1,
      mass_g: round(batchMass, 1)
    }));

    const { frictionFactorC } = resolveOvenAndMixer(resolved);
    derived.recommended_water_temp_c = resolved.ddt_model_enabled
      ? round(resolved.target_fdt_c * 3 - (resolved.ambient_temp_c + resolved.flour_temp_c + frictionFactorC), 1)
      : null;

    return derived;
  }

  function totalPizzasFromOrders() {
    return APP_STATE.orders.reduce((sum, order) => sum + Number(order.quantity || 0), 0);
  }

  function formatLocalDateTimeDisplay(isoString) {
    if (!isoString) return "—";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "—";
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16).replace("T", " ");
  }

  function computeLeadTimeMinutes(resolved) {
    const mixMinutes = 20;
    const ballMinutes = 15;
    const benchMinutes = 60;
    const bakeBufferMinutes = 20;
    const existingDoughLeadMinutes = 45;

    if (resolved.dough_modality === "existing_dough") {
      return existingDoughLeadMinutes;
    }

    const fermentationMinutes =
      (Number(resolved.bulk_ferment_hours || 0) +
        Number(resolved.cold_ferment_hours || 0) +
        Number(resolved.ball_or_pan_ferment_hours || 0)) *
      60;
    return fermentationMinutes + mixMinutes + ballMinutes + benchMinutes + bakeBufferMinutes;
  }

  function updateStateAndRender() {
    resolveSession();
    APP_STATE.session.derived = computeDerived(APP_STATE.session.resolved, getMethodById(APP_STATE.session.resolved.method_id));
    saveState();
    render();
  }

  function resetSessionInputs() {
    const defaultMethod = getMethodById(BASE_INPUT_DEFAULTS.method_id) || APP_STATE.methods[0];
    const defaults = normalizeInputs({}, defaultMethod?.defaults || {}, defaultMethod);
    const styleDefaults = applyStyleDefaults(defaults.pizza_style_id);
    APP_STATE.session.inputs = { ...defaults, ...styleDefaults };
    APP_STATE.session.userTouched = {};
    APP_STATE.session.flags.doughWeightUserOverride = false;
    APP_STATE.session.flags.panAutoWeightEnabled = true;
    updateStateAndRender();
  }

  function applyInputChanges(updates, options = {}) {
    const inputs = APP_STATE.session.inputs;
    const entries = Object.entries(updates);
    const hasChanges = entries.some(([key, value]) => inputs[key] !== value);
    if (!hasChanges) return;

    if (
      shouldMarkPresetCustom(updates, options) &&
      inputs.preset_id &&
      inputs.preset_id !== CUSTOM_PRESET_ID &&
      !Object.prototype.hasOwnProperty.call(updates, "preset_id")
    ) {
      inputs.preset_id = CUSTOM_PRESET_ID;
    }

    entries.forEach(([key, value]) => {
      inputs[key] = value;
    });

    if (options.trackUserTouched) {
      const keys = options.userTouchedKeys || entries.map(([key]) => key);
      markUserTouched(keys);
    }

    updateStateAndRender();
  }

  function resetOrdersForStyle(styleId) {
    if (!styleId) return;
    APP_STATE.orders = APP_STATE.orders || [];
  }

  function applyStyleDefaults(styleId) {
    if (styleId !== "neapolitan_round") {
      const updates = { target_pizza_count: 1 };
      if (!APP_STATE.session.flags.doughWeightUserOverride) {
        updates.dough_unit_weight_g = 750;
      }
      return updates;
    }
    const updates = { target_pizza_count: 6 };
    if (!APP_STATE.session.flags.doughWeightUserOverride) {
      updates.dough_unit_weight_g = 270;
    }
    return updates;
  }

  function applyPrefermentTypeChange(value, options = {}) {
    const prevInputs = { ...APP_STATE.session.inputs };
    const nextMethodId = setMethodFromPreferment(value);
    const nextMethod = getMethodById(nextMethodId) || APP_STATE.methods[0];
    const preset = getPresetById(prevInputs.preset_id);
    const presetOverrides =
      preset && prevInputs.preset_id !== CUSTOM_PRESET_ID ? preset.overrides || {} : {};

    const { nextInputs, resolved } = buildInputsForMethodChange(nextMethod, value, presetOverrides);
    nextInputs.method_id = nextMethodId;

    if (shouldMarkPresetCustom({ preferment_type: value }, options) && nextInputs.preset_id !== CUSTOM_PRESET_ID) {
      nextInputs.preset_id = CUSTOM_PRESET_ID;
    }

    APP_STATE.session.inputs = nextInputs;

    console.info("[Session] Preferment changed -> method_id:", nextMethodId);
    console.info(
      "[Session] Resolved hydration/salt/yeast:",
      resolved.hydration_percent,
      resolved.salt_percent,
      resolved.yeast_percent
    );
    const expectedHydration =
      presetOverrides.hydration_percent ?? nextMethod?.defaults?.hydration_percent;
    if (!APP_STATE.session.userTouched?.hydration_percent && expectedHydration != null) {
      console.assert(
        resolved.hydration_percent === expectedHydration,
        "[Session] Hydration should update with preferment change."
      );
    }

    updateStateAndRender();
  }

  function enforceLockedFermentTotal(inputs, warnings) {
    const bulk = Number(inputs.bulk_ferment_hours || 0);
    const cold = Number(inputs.cold_ferment_hours || 0);
    const ball = Number(inputs.ball_or_pan_ferment_hours || 0);
    const currentTotal = round(bulk + cold + ball, 1);
    let target = 0;
    if (currentTotal > 0 && currentTotal <= 24) target = 24;
    if (currentTotal > 24) target = 48;
    if (currentTotal === 0) target = 0;
    if (currentTotal === target) return;

    warnings.push(`Total fermentation hours adjusted to ${target}.`);
    if (target === 0 || currentTotal === 0) {
      inputs.bulk_ferment_hours = 0;
      inputs.cold_ferment_hours = 0;
      inputs.ball_or_pan_ferment_hours = 0;
      return;
    }
    inputs.bulk_ferment_hours = round(target * (bulk / currentTotal), 1);
    inputs.cold_ferment_hours = round(target * (cold / currentTotal), 1);
    inputs.ball_or_pan_ferment_hours = round(target * (ball / currentTotal), 1);
  }

  function handleNumberInput(el, key, opts = {}) {
    if (!el) return;
    el.addEventListener("change", (e) => {
      const raw = e.target.value;
      if (raw === "") {
        if (opts.allowEmpty) {
          applyInputChanges({ [key]: null }, opts);
        }
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      const rounded = opts.integer ? Math.round(value) : value;
      applyInputChanges({ [key]: rounded }, opts);
    });
  }

  function on(sel, event, handler, root = document) {
    const el = $(sel, root);
    if (!el) return null;
    el.addEventListener(event, handler);
    return el;
  }

  function setActive(selector, active) {
    const el = $(selector);
    if (!el) return;
    el.classList.toggle("active", active);
  }

  function renderWarnings() {
    const warnings = [
      ...(APP_STATE.session.warnings || []),
      ...(APP_STATE.session.coverageMissing?.length
        ? [`Coverage missing for keys: ${APP_STATE.session.coverageMissing.join(", ")}.`]
        : [])
    ];
    const host = $("#session-warnings");
    if (!host) return;
    if (!warnings.length) {
      host.innerHTML = "<div class=\"small\">No warnings.</div>";
      return;
    }
    host.innerHTML = `
      <ul>
        ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
      </ul>
    `;
  }

  function renderSession() {
    const root = $("#tab-session");
    if (!root) return;
    const { resolved, derived } = APP_STATE.session;
    const method = getMethodById(resolved.method_id);
    const preset = getPresetById(resolved.preset_id);
    const ovens = APP_STATE.catalogs.ovens;
    const mixers = APP_STATE.catalogs.mixers;
    const oven = getOvenById(resolved.oven_id);
    const settings = oven?.programs || [];

    const totalPizzas = totalPizzasFromOrders();
    const isPan = resolved.pizza_style_id !== "neapolitan_round";
    const prefermentType = resolved.preferment_type || "direct";
    const showPrefermentFields = prefermentType !== "direct" && prefermentType !== "sourdough";
    const showHybridFields = prefermentType === "hybrid_poolish_biga";
    const showStarterFields = prefermentType === "sourdough";
    const showPrefermentCard = prefermentType !== "direct";
    const existingDough = resolved.dough_modality === "existing_dough";
    const safetyWarnings = APP_STATE.session.safetyViolations || {};
    const showSizing = !existingDough && isPan;
    const ballWeightLabel = isPan ? "Dough Weight (g)" : "Ball Weight (g)";
    const totalFermentHours =
      Number(resolved.bulk_ferment_hours || 0) +
      Number(resolved.cold_ferment_hours || 0) +
      Number(resolved.ball_or_pan_ferment_hours || 0);
    const lockedFermentTotal = totalFermentHours <= 0 ? 0 : totalFermentHours <= 24 ? 24 : 48;
    const fermentMode =
      totalFermentHours > 0 && (resolved.cold_ferment_hours > 0 || resolved.ball_or_pan_ferment_hours > 0)
        ? "double"
        : "single";

    const leadTimeMinutes = computeLeadTimeMinutes(resolved);
    const plannedEatTime = resolved.planned_eat_time_iso ? new Date(resolved.planned_eat_time_iso) : null;
    const startTime = plannedEatTime
      ? new Date(plannedEatTime.getTime() - leadTimeMinutes * 60 * 1000)
      : null;
    const whenToStartDisplay = startTime ? formatLocalDateTimeDisplay(startTime.toISOString()) : "—";

    root.innerHTML = `
      <div class="card" id="card-dashboard">
        <h2>Pizza Party Dashboard</h2>
        <p>One dough for everyone. Orders only change how many balls you need.</p>
        <div class="kpi">
          <div class="box"><div class="small">Pizzas ordered</div><div class="v">${totalPizzas}</div></div>
          <div class="box"><div class="small">Balls used</div><div class="v">${derived.effective_balls_used}</div></div>
          <div class="box"><div class="small">Ball weight</div><div class="v">${derived.dough_unit_weight_g} g</div></div>
          <div class="box"><div class="small">Total dough</div><div class="v">${derived.target_total_dough_g} g</div></div>
          <div class="box"><div class="small">When to Start</div><div class="v">${whenToStartDisplay}</div><div class="small">Estimate</div></div>
        </div>
      </div>

      <div class="card" id="card-session-settings">
        <h3>Session Settings</h3>
        <div class="grid-2">
          <div>
            <label>Planned time to eat</label>
            <input type="datetime-local" id="plannedEat" value="${escapeHtml(isoToLocalInput(resolved.planned_eat_time_iso))}">
            <div class="small">Timeline is scheduled backward from this time.</div>
          </div>
          <div>
            <label>${ballWeightLabel}</label>
            <input type="number" id="ballWeight" value="${escapeHtml(derived.dough_unit_weight_g)}">
          </div>
        </div>
        <div style="margin-top:12px;">
          <label>Dough Source</label>
          <select id="doughModality">
            <option value="make_dough" ${resolved.dough_modality === "make_dough" ? "selected" : ""}>Make Dough</option>
            <option value="existing_dough" ${resolved.dough_modality === "existing_dough" ? "selected" : ""}>Use Existing Dough</option>
          </select>
          <div style="margin-top:10px; ${existingDough ? "" : "display:none;"}">
            <label>Dough Status</label>
            <select id="existingDoughState">
              <option value="frozen" ${resolved.existing_dough_state === "frozen" ? "selected" : ""}>Frozen</option>
              <option value="thawed" ${resolved.existing_dough_state === "thawed" ? "selected" : ""}>Thawed</option>
              <option value="store_bought" ${resolved.existing_dough_state === "store_bought" ? "selected" : ""}>Store-bought</option>
            </select>
          </div>
        </div>
        <div style="margin-top:12px; text-align:right;">
          <button class="tab-btn" id="resetSession">Reset Session</button>
        </div>
      </div>

      <div class="card" id="card-equipment">
        <h3>Equipment</h3>
        <div class="grid-2">
          <div>
            <label>Oven</label>
            <select id="ovenSelect">
              ${ovens.map((o) => `
                <option value="${o.id}" ${o.id === resolved.oven_id ? "selected" : ""}>${escapeHtml(o.display_name)}</option>
              `).join("")}
            </select>
            <div class="small" style="margin-top:6px;">
              ${oven?.constraints?.max_pizza_diameter_in ? "Max: " + escapeHtml(oven.constraints.max_pizza_diameter_in) + "\"" : ""}
              ${oven?.constraints?.supports_round_only ? " • Round only" : ""}
            </div>
            ${!existingDough ? `
            <div style="margin-top:10px;">
              <label>Mixer</label>
              <select id="mixerSelect">
                ${mixers.map((m) => `
                  <option value="${m.id}" ${m.id === resolved.mixer_id ? "selected" : ""}>${escapeHtml(m.display_name)}</option>
                `).join("")}
              </select>
            </div>
            ` : ""}
          </div>
          <div>
            <label>Settings</label>
            <select id="ovenSettingSelect">
              ${settings.map((s) => `
                <option value="${s.id}" ${s.id === resolved.oven_setting_id ? "selected" : ""}>${escapeHtml(s.display_name || s.id)}</option>
              `).join("")}
            </select>
          </div>
        </div>
      </div>

      ${showSizing ? `
      <div class="card" id="card-sizing">
        <h3>Sizing</h3>
        <div class="grid-2">
          <div>
            <label>Pan length (in)</label>
            <input type="number" id="panLength" value="${escapeHtml(resolved.pan_length_in ?? "")}">
          </div>
          <div>
            <label>Pan width (in)</label>
            <input type="number" id="panWidth" value="${escapeHtml(resolved.pan_width_in ?? "")}">
          </div>
        </div>
      </div>
      ` : ""}

      <div class="card" id="card-fermentation">
        <h3>Dough Configuration</h3>
        ${existingDough ? "" : `
        <div class="grid-2">
          <div>
            <label>Preferment</label>
            <select id="prefermentType">
              <option value="direct" ${resolved.preferment_type === "direct" ? "selected" : ""}>None (Direct)</option>
              <option value="poolish" ${resolved.preferment_type === "poolish" ? "selected" : ""}>Poolish</option>
              <option value="biga" ${resolved.preferment_type === "biga" ? "selected" : ""}>Biga</option>
              <option value="tiga" ${resolved.preferment_type === "tiga" ? "selected" : ""}>Tiga</option>
              <option value="hybrid_poolish_biga" ${resolved.preferment_type === "hybrid_poolish_biga" ? "selected" : ""}>Poolish + Biga Hybrid</option>
              <option value="sourdough" ${resolved.preferment_type === "sourdough" ? "selected" : ""}>Sourdough Starter</option>
            </select>
          </div>
          <div>
            <label>Dough Preset</label>
            <select id="presetSelect">
              ${APP_STATE.presets.map((p) => `
                <option value="${p.id}" ${p.id === resolved.preset_id ? "selected" : ""}>${escapeHtml(p.label)}</option>
              `).join("")}
            </select>
            <div class="small">${escapeHtml(preset?.label || "")}</div>
          </div>
        </div>
        `}
        <div style="margin-top:12px;">
          <label>Pizza Style</label>
          <select id="styleId">
            <option value="neapolitan_round" ${resolved.pizza_style_id === "neapolitan_round" ? "selected" : ""}>Neapolitan Round</option>
            <option value="teglia_bonci" ${resolved.pizza_style_id === "teglia_bonci" ? "selected" : ""}>Pan / Teglia</option>
          </select>
          <div class="small">Pan style sets dough weight defaults.</div>
        </div>
        <div class="card" style="margin-top:12px; ${existingDough || !showPrefermentCard ? "display:none;" : ""}">
          <h4>Preferment Options</h4>
          <div class="grid-2">
            ${showPrefermentFields ? `
            <div>
              <label>Preferment flour % of total</label>
              <input type="number" id="prefFlourPct" value="${escapeHtml(resolved.preferment_flour_percent_of_total ?? "")}">
            </div>
            <div>
              <label>Preferment hydration %</label>
              <input type="number" id="prefHydration" value="${escapeHtml(resolved.preferment_hydration_percent ?? "")}">
            </div>
            <div>
              <label>Preferment mature hours</label>
              <input type="number" id="prefMature" value="${escapeHtml(resolved.preferment_mature_hours ?? "")}">
            </div>
            ` : ""}
            ${showHybridFields ? `
            <div>
              <label>Hybrid poolish share %</label>
              <input type="number" id="poolishShare" value="${escapeHtml(resolved.hybrid_poolish_share_percent ?? "")}">
            </div>
            <div>
              <label>Hybrid biga share %</label>
              <input type="number" id="bigaShare" value="${escapeHtml(resolved.hybrid_biga_share_percent ?? "")}">
            </div>
            <div>
              <label>Poolish hydration %</label>
              <input type="number" id="poolishHydration" value="${escapeHtml(resolved.poolish_hydration_percent ?? "")}">
            </div>
            <div>
              <label>Biga hydration %</label>
              <input type="number" id="bigaHydration" value="${escapeHtml(resolved.biga_hydration_percent ?? "")}">
            </div>
            ` : ""}
            ${showStarterFields ? `
            <div>
              <label>Starter hydration %</label>
              <input type="number" id="starterHydration" value="${escapeHtml(resolved.starter_hydration_percent ?? "")}">
            </div>
            <div>
              <label>Starter inoculation %</label>
              <input type="number" id="starterInoculation" value="${escapeHtml(resolved.starter_inoculation_percent ?? "")}">
            </div>
            <div>
              <label>Starter peak window hours</label>
              <input type="number" id="starterPeak" value="${escapeHtml(resolved.starter_peak_window_hours ?? "")}">
            </div>
            ` : ""}
          </div>
        </div>
        <div class="card" style="margin-top:12px; ${existingDough ? "display:none;" : ""}">
          <h4>Ingredient Configuration</h4>
          <div class="grid-2">
            <div>
              <label>Hydration %</label>
              <input type="number" id="hydration" value="${escapeHtml(resolved.hydration_percent)}">
            </div>
            <div>
              <label>Salt %</label>
              <input type="number" id="salt" value="${escapeHtml(resolved.salt_percent)}">
            </div>
            <div>
              <label>Oil %</label>
              <input type="number" id="oil" class="${safetyWarnings.oil_percent ? "input-warning" : ""}" value="${escapeHtml(resolved.oil_percent)}">
            </div>
            <div>
              <label>Honey %</label>
              <input type="number" id="honey" class="${safetyWarnings.honey_percent ? "input-warning" : ""}" value="${escapeHtml(resolved.honey_percent)}">
            </div>
            <div>
              <label>Sugar %</label>
              <input type="number" id="sugar" class="${safetyWarnings.sugar_percent ? "input-warning" : ""}" value="${escapeHtml(resolved.sugar_percent)}">
            </div>
            <div>
              <label>Diastatic malt %</label>
              <input type="number" id="malt" class="${safetyWarnings.diastatic_malt_percent ? "input-warning" : ""}" value="${escapeHtml(resolved.diastatic_malt_percent)}">
            </div>
            <div>
              <label>Yeast % (IDY equiv)</label>
              <input type="number" id="yeastPct" value="${escapeHtml(resolved.yeast_percent)}">
            </div>
            <div>
              <label>Yeast type</label>
              <select id="yeastType">
                ${(APP_STATE.methodsJson?.enums?.yeast_type || ["idy", "ady", "fresh", "starter_only", "starter_plus_yeast"]).map((type) => `
                  <option value="${type}" ${resolved.yeast_type === type ? "selected" : ""}>${escapeHtml(type)}</option>
                `).join("")}
              </select>
            </div>
          </div>
        </div>
        ${existingDough ? "" : `
        <div class="card" style="margin-top:12px;">
          <h4>Fermentation Settings</h4>
          <div class="grid-2" style="margin-top:10px;">
            <div>
              <label>Fermentation mode</label>
              <select id="fermMode">
                <option value="single" ${fermentMode === "single" ? "selected" : ""}>Single</option>
                <option value="double" ${fermentMode === "double" ? "selected" : ""}>Double</option>
              </select>
            </div>
            <div>
              <label>Fermentation location</label>
              <select id="fermLoc">
                ${(APP_STATE.methodsJson?.enums?.fermentation_location || ["room", "cold", "mixed"]).map((loc) => `
                  <option value="${loc}" ${resolved.fermentation_location === loc ? "selected" : ""}>${escapeHtml(loc)}</option>
                `).join("")}
              </select>
            </div>
            <div>
              <label>Total fermentation hours</label>
              <select id="fermTotal">
                ${[0, 24, 48].map((value) => `
                  <option value="${value}" ${lockedFermentTotal === value ? "selected" : ""}>${value}</option>
                `).join("")}
              </select>
            </div>
            <div>
              <label>Bulk ferment hours</label>
              <input type="number" id="bulkHours" value="${escapeHtml(resolved.bulk_ferment_hours)}">
            </div>
            <div>
              <label>Cold ferment hours</label>
              <input type="number" id="coldHours" value="${escapeHtml(resolved.cold_ferment_hours)}">
            </div>
            <div>
              <label>Ball/Pan ferment hours</label>
              <input type="number" id="ballHours" value="${escapeHtml(resolved.ball_or_pan_ferment_hours)}">
            </div>
          </div>
        </div>
        `}
      </div>

      <div class="card" id="card-warnings" style="${existingDough ? "display:none;" : ""}">
        <h3>Warnings</h3>
        <div id="session-warnings"></div>
      </div>

      <div class="card" id="card-ingredients" style="${existingDough ? "display:none;" : ""}">
        <h3>Ingredient Totals + Preferment Split</h3>
        <div class="kpi">
          <div class="box"><div class="small">Flour</div><div class="v">${derived.total_flour_g} g</div></div>
          <div class="box"><div class="small">Water</div><div class="v">${derived.total_water_g} g</div></div>
          <div class="box"><div class="small">Salt</div><div class="v">${derived.total_salt_g} g</div></div>
          <div class="box"><div class="small">Oil</div><div class="v">${derived.total_oil_g} g</div></div>
          <div class="box"><div class="small">Honey</div><div class="v">${derived.total_honey_g} g</div></div>
          <div class="box"><div class="small">Sugar</div><div class="v">${derived.total_sugar_g} g</div></div>
          <div class="box"><div class="small">Malt</div><div class="v">${derived.total_malt_g} g</div></div>
          <div class="box"><div class="small">Yeast</div><div class="v">${derived.total_yeast_g} g (${escapeHtml(resolved.yeast_type)})</div></div>
        </div>
        <div class="card" style="margin-top:12px;">
          <h3>Preferment / Starter Split</h3>
          <div class="kpi">
            <div class="box"><div class="small">Preferment flour</div><div class="v">${derived.preferment_flour_g} g</div></div>
            <div class="box"><div class="small">Preferment water</div><div class="v">${derived.preferment_water_g} g</div></div>
            <div class="box"><div class="small">Starter total</div><div class="v">${derived.starter_total_g} g</div></div>
            <div class="box"><div class="small">Final mix flour</div><div class="v">${derived.final_mix_flour_g} g</div></div>
            <div class="box"><div class="small">Final mix water</div><div class="v">${derived.final_mix_water_g} g</div></div>
            <div class="box"><div class="small">Final mix yeast</div><div class="v">${derived.final_mix_yeast_g} g</div></div>
          </div>
        </div>
      </div>
    `;

    renderWarnings();

    on("#resetSession", "click", () => {
      if (!window.confirm("Seriously?")) return;
      resetSessionInputs();
    });

    on("#plannedEat", "change", (e) => applyInputChanges({ planned_eat_time_iso: localInputToISO(e.target.value) }));
    on("#doughModality", "change", (e) => applyInputChanges({ dough_modality: e.target.value }));
    on("#styleId", "change", (e) => {
      const nextStyle = e.target.value;
      if (nextStyle === resolved.pizza_style_id) return;
      APP_STATE.session.flags.panAutoWeightEnabled = true;
      resetOrdersForStyle(nextStyle);
      const defaults = applyStyleDefaults(nextStyle);
      applyInputChanges({ pizza_style_id: nextStyle, ...defaults });
    });
    on("#presetSelect", "change", (e) => {
      const preset = getPresetById(e.target.value);
      applyPresetSelection(preset);
      updateStateAndRender();
    });
    on("#ovenSelect", "change", (e) => applyInputChanges({ oven_id: e.target.value }));
    on("#ovenSettingSelect", "change", (e) => applyInputChanges({ oven_setting_id: e.target.value }));
    on("#mixerSelect", "change", (e) => {
      const mixer = getMixerById(e.target.value);
      applyInputChanges({
        mixer_id: e.target.value,
        mix_method: mixer?.mixer_class || APP_STATE.session.inputs.mix_method
      });
    });
    on("#existingDoughState", "change", (e) => applyInputChanges({ existing_dough_state: e.target.value }));

    on("#ballWeight", "change", (e) => {
      const value = Number(e.target.value);
      if (!Number.isFinite(value)) return;
      APP_STATE.session.flags.doughWeightUserOverride = true;
      if (isPan) APP_STATE.session.flags.panAutoWeightEnabled = false;
      applyInputChanges({ dough_unit_weight_g: Math.round(value) }, { trackUserTouched: true });
    });
    on("#panLength", "change", (e) => {
      const raw = e.target.value;
      APP_STATE.session.flags.panAutoWeightEnabled = true;
      if (raw === "") {
        applyInputChanges({ pan_length_in: null });
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      applyInputChanges({ pan_length_in: value });
    });
    on("#panWidth", "change", (e) => {
      const raw = e.target.value;
      APP_STATE.session.flags.panAutoWeightEnabled = true;
      if (raw === "") {
        applyInputChanges({ pan_width_in: null });
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      applyInputChanges({ pan_width_in: value });
    });

    on("#prefermentType", "change", (e) => {
      const value = e.target.value;
      applyPrefermentTypeChange(value, { markPresetCustom: true });
    });
    handleNumberInput($("#prefFlourPct"), "preferment_flour_percent_of_total", { trackUserTouched: true });
    handleNumberInput($("#prefHydration"), "preferment_hydration_percent", { trackUserTouched: true });
    handleNumberInput($("#prefMature"), "preferment_mature_hours", { trackUserTouched: true });
    handleNumberInput($("#poolishShare"), "hybrid_poolish_share_percent", { trackUserTouched: true });
    handleNumberInput($("#bigaShare"), "hybrid_biga_share_percent", { trackUserTouched: true });
    handleNumberInput($("#poolishHydration"), "poolish_hydration_percent", { trackUserTouched: true });
    handleNumberInput($("#bigaHydration"), "biga_hydration_percent", { trackUserTouched: true });
    handleNumberInput($("#starterHydration"), "starter_hydration_percent", { trackUserTouched: true });
    handleNumberInput($("#starterInoculation"), "starter_inoculation_percent", { trackUserTouched: true });
    handleNumberInput($("#starterPeak"), "starter_peak_window_hours", { trackUserTouched: true });

    on("#fermLoc", "change", (e) => applyInputChanges({ fermentation_location: e.target.value }, { trackUserTouched: true }));
    handleNumberInput($("#bulkHours"), "bulk_ferment_hours", { trackUserTouched: true });
    handleNumberInput($("#coldHours"), "cold_ferment_hours", { trackUserTouched: true });
    handleNumberInput($("#ballHours"), "ball_or_pan_ferment_hours", { trackUserTouched: true });
    on("#fermTotal", "change", (e) => {
      const total = Number(e.target.value || 0);
      if (!Number.isFinite(total)) return;
      if (total === 0) {
        applyInputChanges({
          bulk_ferment_hours: 0,
          cold_ferment_hours: 0,
          ball_or_pan_ferment_hours: 0
        }, { trackUserTouched: true });
        return;
      }
      const currentTotal = totalFermentHours || 1;
      const bulkRatio = resolved.bulk_ferment_hours / currentTotal;
      const coldRatio = resolved.cold_ferment_hours / currentTotal;
      const ballRatio = resolved.ball_or_pan_ferment_hours / currentTotal;
      applyInputChanges({
        bulk_ferment_hours: round(total * bulkRatio, 1),
        cold_ferment_hours: round(total * coldRatio, 1),
        ball_or_pan_ferment_hours: round(total * ballRatio, 1)
      }, { trackUserTouched: true });
    });

    on("#fermMode", "change", (e) => {
      const total = Number(($("#fermTotal") || {}).value || 0);
      if (e.target.value === "single") {
        applyInputChanges({
          bulk_ferment_hours: total,
          cold_ferment_hours: 0,
          ball_or_pan_ferment_hours: 0
        }, { trackUserTouched: true });
        return;
      }
      const defaults = method?.defaults || {};
      const defaultTotal =
        Number(defaults.bulk_ferment_hours || 0) +
        Number(defaults.cold_ferment_hours || 0) +
        Number(defaults.ball_or_pan_ferment_hours || 0);
      if (defaultTotal > 0) {
        applyInputChanges({
          bulk_ferment_hours: round(total * (defaults.bulk_ferment_hours / defaultTotal), 1),
          cold_ferment_hours: round(total * (defaults.cold_ferment_hours / defaultTotal), 1),
          ball_or_pan_ferment_hours: round(total * (defaults.ball_or_pan_ferment_hours / defaultTotal), 1)
        }, { trackUserTouched: true });
      }
    });

    handleNumberInput($("#hydration"), "hydration_percent", { trackUserTouched: true });
    handleNumberInput($("#salt"), "salt_percent", { trackUserTouched: true });
    handleNumberInput($("#oil"), "oil_percent", { trackUserTouched: true });
    handleNumberInput($("#honey"), "honey_percent", { trackUserTouched: true });
    handleNumberInput($("#sugar"), "sugar_percent", { trackUserTouched: true });
    handleNumberInput($("#malt"), "diastatic_malt_percent", { trackUserTouched: true });
    handleNumberInput($("#yeastPct"), "yeast_percent", { trackUserTouched: true });
    on("#yeastType", "change", (e) => applyInputChanges({ yeast_type: e.target.value }, { trackUserTouched: true }));
  }

  function renderOrders() {
    const root = $("#tab-orders");
    if (!root) return;
    root.innerHTML = `
      <div class="card">
        <h2>Orders</h2>
        <p>Track how many pizzas each person wants.</p>
        <div id="orders-list"></div>
        <button id="add-order">Add person</button>
      </div>
    `;

    const list = $("#orders-list");
    if (!list) return;
    list.innerHTML = APP_STATE.orders.map((order) => `
      <div class="card" style="margin-top:10px;">
        <div class="grid-2">
          <div>
            <label>Name</label>
            <input type="text" data-order-name="${order.id}" value="${escapeHtml(order.name)}">
          </div>
          <div>
            <label>Pizza count</label>
            <input type="number" data-order-qty="${order.id}" value="${escapeHtml(order.quantity)}">
          </div>
        </div>
        <button data-order-remove="${order.id}">Remove</button>
      </div>
    `).join("");

    $$("[data-order-name]").forEach((input) => {
      input.addEventListener("change", (e) => {
        const order = APP_STATE.orders.find((o) => o.id === e.target.dataset.orderName);
        if (order) {
          order.name = e.target.value;
          updateStateAndRender();
        }
      });
    });

    $$("[data-order-qty]").forEach((input) => {
      input.addEventListener("change", (e) => {
        const order = APP_STATE.orders.find((o) => o.id === e.target.dataset.orderQty);
        if (order) {
          order.quantity = Number(e.target.value || 0);
          updateStateAndRender();
        }
      });
    });

    $$("[data-order-remove]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.dataset.orderRemove;
        APP_STATE.orders = APP_STATE.orders.filter((o) => o.id !== id);
        updateStateAndRender();
      });
    });

    on("#add-order", "click", () => {
      APP_STATE.orders.push({ id: cryptoSafeId("order"), name: "Guest", quantity: 1, notes: "" });
      updateStateAndRender();
    });
  }

  function renderMaking() {
    const root = $("#tab-making");
    if (!root) return;
    const { resolved, derived } = APP_STATE.session;
    const existingDough = resolved.dough_modality === "existing_dough";
    root.innerHTML = `
      <div class="card">
        <h2>Pizzaiolo</h2>
        <p>Use your Pizza Party session to guide mixing and shaping.</p>
        <div class="kpi">
          <div class="box"><div class="small">Total dough</div><div class="v">${derived.target_total_dough_g} g</div></div>
          <div class="box"><div class="small">Recommended water temp</div><div class="v">${derived.recommended_water_temp_c ?? "—"} °C</div></div>
          <div class="box"><div class="small">Yeast type</div><div class="v">${escapeHtml(resolved.yeast_type)}</div></div>
        </div>
      </div>
      ${existingDough ? "" : `
      <div class="card">
        <h3>Temperature Planning (DDT)</h3>
        <div class="grid-2">
          <div>
            <label>DDT model enabled</label>
            <select id="ddtEnabled">
              <option value="true" ${resolved.ddt_model_enabled ? "selected" : ""}>Yes</option>
              <option value="false" ${!resolved.ddt_model_enabled ? "selected" : ""}>No</option>
            </select>
          </div>
          <div>
            <label>Room temp (°C)</label>
            <input type="number" id="ambientTemp" value="${escapeHtml(resolved.ambient_temp_c)}">
          </div>
          <div>
            <label>Flour temp (°C)</label>
            <input type="number" id="flourTemp" value="${escapeHtml(resolved.flour_temp_c)}">
          </div>
          <div>
            <label>Fridge temp (°C)</label>
            <input type="number" id="fridgeTemp" value="${escapeHtml(resolved.fridge_temp_c)}">
          </div>
          <div>
            <label>Target DDT (°C)</label>
            <input type="number" id="targetFDT" value="${escapeHtml(resolved.target_fdt_c)}">
          </div>
          <div>
            <label>Recommended water temp (°C)</label>
            <input type="text" id="waterRec" value="${derived.recommended_water_temp_c ?? "—"}" disabled>
          </div>
        </div>
      </div>
      `}
    `;

    on("#ddtEnabled", "change", (e) => applyInputChanges({ ddt_model_enabled: e.target.value === "true" }, { trackUserTouched: true }));
    handleNumberInput($("#ambientTemp"), "ambient_temp_c", { trackUserTouched: true });
    handleNumberInput($("#flourTemp"), "flour_temp_c", { trackUserTouched: true });
    handleNumberInput($("#fridgeTemp"), "fridge_temp_c", { trackUserTouched: true });
    handleNumberInput($("#targetFDT"), "target_fdt_c", { trackUserTouched: true });
  }

  function renderShopping() {
    const root = $("#tab-shopping");
    if (!root) return;
    const { derived } = APP_STATE.session;
    root.innerHTML = `
      <div class="card">
        <h2>Shopping List</h2>
        <p>Totals are derived from the Pizza Party session.</p>
        <ul>
          <li>Flour: ${derived.total_flour_g} g</li>
          <li>Water: ${derived.total_water_g} g</li>
          <li>Salt: ${derived.total_salt_g} g</li>
          <li>Oil: ${derived.total_oil_g} g</li>
          <li>Honey: ${derived.total_honey_g} g</li>
          <li>Sugar: ${derived.total_sugar_g} g</li>
          <li>Malt: ${derived.total_malt_g} g</li>
          <li>Yeast: ${derived.total_yeast_g} g</li>
        </ul>
      </div>
    `;
  }

  function renderPresets() {
    const root = $("#tab-presets");
    if (!root) return;
    root.innerHTML = `
      <div class="card">
        <h2>Pizza Presets</h2>
        ${APP_STATE.presets.map((preset) => `
          <div class="card" style="margin-top:12px;">
            <h3>${escapeHtml(preset.label)}</h3>
            <div class="small">Method: ${escapeHtml(preset.method_id || "—")}</div>
            <div class="small">Style: ${escapeHtml(preset.pizza_style_id || "—")}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function render() {
    setActive("#tab-session", APP_STATE.ui.activeTab === "session");
    setActive("#tab-orders", APP_STATE.ui.activeTab === "orders");
    setActive("#tab-making", APP_STATE.ui.activeTab === "making");
    setActive("#tab-shopping", APP_STATE.ui.activeTab === "shopping");
    setActive("#tab-presets", APP_STATE.ui.activeTab === "presets");
    $$("#tabs .tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === APP_STATE.ui.activeTab);
    });

    renderSession();
    renderOrders();
    renderMaking();
    renderShopping();
    renderPresets();
  }

  function initTabs() {
    $$("#tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        APP_STATE.ui.activeTab = btn.dataset.tab;
        saveState();
        render();
      });
    });

  }

  function setupDevTest() {
    window.runPoolishDevTest = () => {
      const testSession = {
        ...BASE_INPUT_DEFAULTS,
        method_id: "poolish",
        hydration_percent: 100,
        dough_unit_weight_g: 1000,
        target_pizza_count: 1,
        preferment_enabled: true,
        preferment_type: "poolish",
        preferment_flour_percent_of_total: 30,
        preferment_hydration_percent: 100,
        yeast_percent: 0,
        salt_percent: 0
      };

      const method = getMethodById("poolish");
      const resolved = normalizeInputs(testSession, method?.defaults || {}, method);
      const derived = computeDerived(resolved, method);
      const pass =
        derived.total_flour_g === 500 &&
        derived.preferment_flour_g === 150 &&
        derived.preferment_water_g === 150 &&
        derived.final_mix_flour_g === 350 &&
        derived.final_mix_water_g === 350;

      console.log("Poolish dev test", { derived, pass });
      return pass;
    };
  }

  async function init() {
    loadState();
    APP_STATE.orders = APP_STATE.orders.length ? APP_STATE.orders : cloneDefaultOrders();

    const dataAssets = {
      methods: assetUrl("data/dough_methods.json"),
      presets: assetUrl("data/dough_presets.json"),
      ovens: assetUrl("data/ovens.json"),
      mixers: assetUrl("data/mixers.json")
    };
    Object.entries(dataAssets).forEach(([key, url]) => {
      console.log(`[Data] ${key} url = ${url}`);
    });

    const [methodsJson, presetsJson, ovensJson, mixersJson] = await Promise.all([
      fetchJson(dataAssets.methods),
      fetchJson(dataAssets.presets),
      fetchJson(dataAssets.ovens),
      fetchJson(dataAssets.mixers)
    ]);

    APP_STATE.methodsJson = methodsJson;
    APP_STATE.methods = methodsJson.methods || [];
    APP_STATE.presets = presetsJson.presets || [];
    APP_STATE.catalogs.ovens = ovensJson.ovens || [];
    APP_STATE.catalogs.mixers = mixersJson.mixers || [];

    APP_STATE.session.requiredKeys = buildRequiredSessionKeys(methodsJson);
    const unknown = validatePresetOverrides(APP_STATE.session.requiredKeys, APP_STATE.presets);
    if (unknown.length) {
      unknown.forEach((issue) => {
        console.warn(`[Session Warning] Preset ${issue.preset} includes unknown key ${issue.key}.`);
      });
    }
    APP_STATE.session.coverageMissing = validateCoverage(APP_STATE.session.requiredKeys, COVERAGE_MAP);

    const defaultMethod = getMethodById(BASE_INPUT_DEFAULTS.method_id) || APP_STATE.methods[0];
    const defaultInputs = normalizeInputs(APP_STATE.session.inputs, defaultMethod?.defaults || {}, defaultMethod);
    APP_STATE.session.inputs = defaultInputs;

    resolveSession();
    APP_STATE.session.derived = computeDerived(APP_STATE.session.resolved, getMethodById(APP_STATE.session.resolved.method_id));

    initTabs();
    setupDevTest();
    render();
  }

  init().catch((err) => {
    console.error(err);
    const banner = $("#appBanner");
    if (banner) {
      banner.innerHTML = `<div class="banner error">Failed to load data. ${escapeHtml(err.message)}</div>`;
    }
  });
})();
