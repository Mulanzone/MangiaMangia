/* ============================================================
   Pizza Production Planner — v2 (Repaired)
   - Single dough per session (global)
   - Orders are toppings/pizza formats only
   - Timeline scheduled backward from plannedEat
   - Stable render/boot (no patching render before definition)
   ============================================================ */

(() => {
  "use strict";

  /* ---------- Utilities ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  const INPUT_STORE = {
    drafts: {},
    errors: {}
  };

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  function getInputDraft(key) {
    return hasOwn(INPUT_STORE.drafts, key) ? INPUT_STORE.drafts[key] : null;
  }

  function setInputDraft(key, value) {
    INPUT_STORE.drafts[key] = value;
  }

  function clearInputDraft(key) {
    delete INPUT_STORE.drafts[key];
  }

  function setInputError(key, message) {
    if (message) INPUT_STORE.errors[key] = message;
    else delete INPUT_STORE.errors[key];
  }

  function getInputError(key) {
    return hasOwn(INPUT_STORE.errors, key) ? INPUT_STORE.errors[key] : null;
  }

  function getInputDisplayValue(key, fallback) {
    const draft = getInputDraft(key);
    if (draft !== null) return draft;
    if (fallback == null) return "";
    return String(fallback);
  }

  function updateInputStatus(key, el) {
    const dirtyEl = document.querySelector(`[data-dirty-for="${key}"]`);
    const errorEl = document.querySelector(`[data-error-for="${key}"]`);
    const error = getInputError(key);
    const isDirty = getInputDraft(key) !== null;

    if (dirtyEl) {
      dirtyEl.textContent = isDirty ? "pending" : "";
      dirtyEl.hidden = !isDirty;
    }

    if (errorEl) {
      errorEl.textContent = error || "";
      errorEl.hidden = !error;
    }

    if (el) {
      el.classList.toggle("input-invalid", Boolean(error));
    }
  }

  function parseNumberInput(raw) {
    const cleaned = String(raw ?? "").trim();
    if (cleaned === "") return { status: "empty" };
    const normalized = cleaned.replace(",", ".");
    const value = Number(normalized);
    if (!Number.isFinite(value)) return { status: "invalid" };
    return { status: "ok", value };
  }

  function commitNumericInput(el, config) {
    const { key, min, max, allowEmpty, integer, setValue, onCommit } = config;
    const raw = el.value;
    setInputDraft(key, raw);

    const parsed = parseNumberInput(raw);
    if (parsed.status === "empty") {
      if (allowEmpty) {
        setValue(null);
        clearInputDraft(key);
        setInputError(key, null);
        el.value = "";
        updateInputStatus(key, el);
        if (onCommit) onCommit(null);
        saveState();
      } else {
        setInputError(key, "Enter a number.");
        updateInputStatus(key, el);
      }
      return;
    }

    if (parsed.status === "invalid") {
      setInputError(key, "Enter a valid number.");
      updateInputStatus(key, el);
      return;
    }

    let value = parsed.value;
    if (integer) value = Math.round(value);
    if (typeof min === "number") value = Math.max(min, value);
    if (typeof max === "number") value = Math.min(max, value);

    setValue(value);
    clearInputDraft(key);
    setInputError(key, null);
    el.value = String(value);
    updateInputStatus(key, el);
    if (onCommit) onCommit(value);
    saveState();
  }

  function bindNumericInput(el, config) {
    if (!el) return;
    const { key, getValue } = config;
    el.value = getInputDisplayValue(key, getValue());
    updateInputStatus(key, el);

    el.addEventListener("input", (e) => {
      setInputDraft(key, e.target.value);
      setInputError(key, null);
      updateInputStatus(key, el);
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });

    el.addEventListener("blur", () => {
      commitNumericInput(el, config);
    });
  }

  const escapeHtml = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const deepClone = (obj) => {
    try {
      return structuredClone(obj);
    } catch {
      return JSON.parse(JSON.stringify(obj));
    }
  };

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

  function setBanner(kind, title, msg) {
    const host = $("#appBanner");
    if (!host) return;
    host.innerHTML = `
      <div class="banner ${kind}">
        <strong>${escapeHtml(title)}</strong>
        <div class="small" style="margin-top:6px">${escapeHtml(msg)}</div>
      </div>
    `;
  }
const CONFIG = {
  mixers: null,
  doughMethods: null,
  ovens: null,
  doughPresets: [], // array of preset JSON objects
  toppings: [],
  sessionV2: null,
  customPresets: [],
  pizzaStyles: [],
  toppingsCatalog: []
};



  /* ---------- Storage ---------- */
  const LS = {
    STATE: "pizza_app_state_v3",
    CUSTOM_PIZZA_PRESETS: "pizza_custom_pizza_presets_v1"
  };
  // ---------- Config paths (served by your web server) ----------
  const CONFIG_PATHS = {
    doughPresets: "data/dough_presets.json",
    doughMethods: "data/dough_methods.json",
    toppings: "data/toppings.seed.json",
    mixers: "data/mixers.json",
    ovens: "data/ovens.json",
    customPresets: "data/custom_presets.json",
    pizzaStyles: "data/pizza_styles.json",
    toppingsCatalog: "data/toppings.json"
  };

  // ---------- Runtime-loaded config ----------
  // IMPORTANT: make this `let` so we can overwrite it after fetch.
  let BASE_DOUGH_PRESETS = [
    // Fallback so the app still works if the JSON fails to load.
    { id: "manual", label: "Custom / Manual", description: "You control every parameter.", defaults: null }
  ];
  let BASE_DOUGH_METHODS = [
    { id: "direct", label: "Direct Dough", category: "direct", supports: {}, phases: [], notes: "" }
  ];

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return await res.json();
  }

  async function loadDoughPresets() {
    const presets = await window.PizzaConfigLoader.loadDoughPresets({
      path: CONFIG_PATHS.doughPresets,
      fallback: BASE_DOUGH_PRESETS
    });

    CONFIG.doughPresets = presets;

    if (!CONFIG.doughPresets.some((m) => m.id === STATE?.session?.doughPresetId)) {
      if (!STATE.session) STATE.session = defaultState().session;
      STATE.session.doughPresetId = CONFIG.doughPresets[0]?.id || "manual";
    }
  }

  async function loadDoughMethods() {
    const methods = await window.PizzaConfigLoader.loadDoughMethods({
      path: CONFIG_PATHS.doughMethods,
      fallback: BASE_DOUGH_METHODS
    });

    CONFIG.doughMethods = methods;

    if (!CONFIG.doughMethods.some((m) => m.id === STATE?.session?.doughMethodId)) {
      if (!STATE.session) STATE.session = defaultState().session;
      STATE.session.doughMethodId = CONFIG.doughMethods[0]?.id || "direct";
    }
  }

  async function loadMixers() {
    const mixers = await window.PizzaConfigLoader.loadMixers({
      path: CONFIG_PATHS.mixers,
      fallback: BASE_MIXERS
    });

    CONFIG.mixers = mixers;

    if (!STATE.session) STATE.session = defaultState().session;
    if (!STATE.session.mixer_id && mixers.length) STATE.session.mixer_id = mixers[0].id;
  }

  async function loadOvens() {
    const ovens = await window.PizzaConfigLoader.loadOvens({
      path: CONFIG_PATHS.ovens,
      fallback: BASE_OVENS_RAW
    });

    CONFIG.ovens = ovens;

    if (!STATE.session) STATE.session = defaultState().session;
    if (!STATE.session.oven_id && ovens.length) STATE.session.oven_id = ovens[0].id;
    if (STATE.session.oven_id && !ovens.some((o) => o.id === STATE.session.oven_id)) {
      STATE.session.oven_id = ovens.length ? ovens[0].id : null;
    }
    if (STATE.session.oven_id) {
      const selected = window.PizzaConfigLoader.getOvenById(ovens, STATE.session.oven_id);
      if (selected?.programs?.length && !STATE.session.oven_program_id) {
        STATE.session.oven_program_id = selected.programs[0].id;
      }
    }
  }

  async function loadToppings() {
    const toppings = await window.PizzaConfigLoader.loadToppings({
      path: CONFIG_PATHS.toppings,
      fallback: []
    });
    CONFIG.toppings = toppings;
  }

  function coercePresetArray(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.presets)) return json.presets;
    if (json && Array.isArray(json.items)) return json.items;
    return [];
  }

  async function loadSessionV2Config() {
    const loader = window.PizzaConfigLoader;
    let methodsJson = {};
    let presetsJson = {};
    let customPresetsJson = { presets: [] };

    try {
      methodsJson = await loader.fetchJson(CONFIG_PATHS.doughMethods);
    } catch (err) {
      console.warn("Session v2 methods load failed:", err);
    }

    try {
      presetsJson = await loader.fetchJson(CONFIG_PATHS.doughPresets);
    } catch (err) {
      console.warn("Session v2 presets load failed:", err);
    }

    try {
      customPresetsJson = await loader.fetchJson(CONFIG_PATHS.customPresets);
    } catch (err) {
      customPresetsJson = { presets: [] };
    }

    const basePresets = coercePresetArray(presetsJson);
    const customPresets = coercePresetArray(customPresetsJson);

    const mergedPresets = [...basePresets, ...customPresets];
    if (!mergedPresets.some((preset) => preset.id === "manual_custom")) {
      mergedPresets.unshift({
        id: "manual_custom",
        label: "Manual / Custom",
        selection_notes_md: ["Start from method defaults, then edit inputs below."],
        overrides: null
      });
    }

    CONFIG.customPresets = customPresets;
    CONFIG.sessionV2 = {
      schema: methodsJson.session_schema || {},
      enums: methodsJson.enums || {},
      methods: Array.isArray(methodsJson.methods) ? methodsJson.methods : [],
      global_defaults: methodsJson.global_defaults || {},
      presets: mergedPresets
    };

    window.SESSION_V2_CONFIG = CONFIG.sessionV2;
  }

  async function loadPizzaStylesCatalog() {
    const styles = await window.PizzaConfigLoader.loadPizzaStyles({
      path: CONFIG_PATHS.pizzaStyles,
      fallback: []
    });
    CONFIG.pizzaStyles = styles;
  }

  async function loadToppingsCatalog() {
    const toppings = await window.PizzaConfigLoader.loadToppings({
      path: CONFIG_PATHS.toppingsCatalog,
      fallback: []
    });
    CONFIG.toppingsCatalog = toppings;
  }


  /* ---------- Hard Requirements ---------- */
  const MIN_BALLS = 6;


const BASE_MIXERS = [
  { id: "hand", label: "Hand Mixing", type: "hand", bowlCapacityG: null, notes: "" }
];
const BASE_OVENS_RAW = [
  {
    id: "home_oven_450f",
    display_name: "Home Oven (Max 450°F)",
    fuel_type: "electric_or_gas",
    constraints: { supports_round_only: false, supports_pan: true, max_pizza_diameter_in: 16 },
    capabilities: { has_broiler: true, allow_manual_override: true },
    programs: [
      {
        id: "steel_high_heat",
        display_name: "Stone / Steel Bake",
        temp_targets_f: { air: [450, 450] },
        bake_time_seconds: [420, 720],
        rotation_strategy: "once_halfway",
        notes_md: []
      }
    ]
  }
];

  /* ---------- Pizza Presets (base immutable + editable custom) ---------- */
  const BASE_PIZZA_PRESETS = [
    {
      id: "neapolitan_margherita",
      name: "Neapolitan — Margherita",
      format: "neapolitan",
      image: "",
      ingredients: [
        { name: "Crushed tomatoes / passata", quantity: 90, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "Thin, controlled layer" },
        { name: "Mozzarella (fior di latte)", quantity: 90, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "Drain well" },
        { name: "Basil", quantity: 3, unit: "g", bakeTiming: "after", scalingRule: "per_pizza", notes: "Add after bake to preserve aroma" },
        { name: "Extra virgin olive oil", quantity: 6, unit: "g", bakeTiming: "after", scalingRule: "per_pizza", notes: "Finish" }
      ]
    },
    {
      id: "neapolitan_pepperoni",
      name: "Neapolitan — Pepperoni",
      format: "neapolitan",
      image: "",
      ingredients: [
        { name: "Crushed tomatoes / passata", quantity: 85, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "" },
        { name: "Mozzarella", quantity: 95, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "" },
        { name: "Pepperoni", quantity: 35, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "Go lighter than you think" },
        { name: "Extra virgin olive oil", quantity: 6, unit: "g", bakeTiming: "after", scalingRule: "per_pizza", notes: "" }
      ]
    },
    {
      id: "calzone_ricotta",
      name: "Calzone — Ricotta & Mozzarella",
      format: "calzone",
      image: "",
      ingredients: [
        { name: "Ricotta", quantity: 120, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "Keep filling controlled" },
        { name: "Mozzarella", quantity: 80, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "Low moisture helps" },
        { name: "Salami / ham", quantity: 40, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "Optional" }
      ]
    },
    {
      id: "teglia_rossa",
      name: "Teglia / Pan — Pizza Rossa",
      format: "teglia",
      image: "",
      ingredients: [
        { name: "Tomato sauce", quantity: 160, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "Spread gently, keep airy" },
        { name: "Olive oil", quantity: 10, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "Pan + top drizzle" },
        { name: "Oregano", quantity: 2, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "" }
      ]
    }
  ];

  /* ---------- State ---------- */
  const defaultState = () => ({
    activeTab: "session",
    debugMode: false,
    making: {
         measured: {
        roomC: null,
        flourC: null,
        waterC: null,
        doughC: null,
        counterC: null
      }
},
    session: {
      schemaVersion: "1.0",
      sessionId: cryptoSafeId("session"),
      plannedEatTimeISO: "",
      timezone: "America/Toronto",
      doughModality: "MAKE_DOUGH",
      styleId: "ROUND_NEAPOLITAN",
      ballsUsed: MIN_BALLS,
      ballWeightG: 260,
      oven_id: null,
      oven_program_id: null,
      oven_overrides: {
        enabled: false,
        deck_temp_f: null,
        top_temp_f: null,
        air_temp_f: null,
        bake_time_seconds: null,
        broiler_mode: "AUTO"
      },
      mixer_id: null,
      fermentationLocation: "ROOM",
      fermentationMode: "SINGLE",
      totalFermentationHours: 24,
      temps: {
        roomTempC: 22,
        flourTempC: 22,
        fridgeTempC: 4
      },
      prefermentType: "NONE",
      prefermentOptions: {
        poolish: { honeyEnabled: false, poolishBatchOverride: "AUTO", customPoolishFlourG: null },
        biga: { bigaPercentTotalFlour: 30, bigaHydrationPct: 55 },
        tiga: { tigaPercentTotalFlour: 30 },
        hybrid: { honeyEnabled: false, poolishBatchOverride: "AUTO", customPoolishFlourG: null, bigaPercentOfRemainderFlour: 30, bigaHydrationPct: 55 },
        sourdough: { starterHydrationPct: 100, inoculationPctFlourBasis: 20, useCommercialYeastAssist: false, yeastAssistPctIDY: 0.02 }
      },
      formulaOverrides: {
        hydrationPct: 63,
        saltPct: 2.8,
        oilPct: 0,
        honeyPct: 0.5,
        maltPct: 0,
        yeastPctIDY: 0.05,
        yeastType: "IDY"
      },
      temperaturePlanning: { targetDDTC: 23 },
      existingDough: {
        source: "FROZEN",
        frozenState: "HARD_FROZEN",
        packaging: "BAG",
        thawLocation: "FRIDGE",
        styleId: "ROUND_NEAPOLITAN",
        ballsUsed: MIN_BALLS,
        ballWeightG: 260
      },
      doughMethodId: "direct",
      doughPresetId: "manual"
    },
    session_v2_selection: {
      method_id: "direct",
      preset_id: "manual_custom"
    },
    session_v2_inputs: {},
    session_v2: {
      resolved_session: null,
      derived_session: null,
      warnings: []
    },

    orders: []
  });

  let STATE = defaultState();
  let LAST_CHANGED_INPUT_KEY = "—";

  function saveState() {
    localStorage.setItem(LS.STATE, JSON.stringify(STATE));
  }

  function loadState() {
    const raw = localStorage.getItem(LS.STATE);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (s && typeof s === "object") STATE = s;
    } catch {
      // ignore malformed state
    }
  }

  /* ---------- Normalize older states ---------- */
  function cryptoSafeId(prefix) {
    try {
      const buf = new Uint32Array(2);
      crypto.getRandomValues(buf);
      return `${prefix}_${buf[0].toString(16)}${buf[1].toString(16)}`;
    } catch {
      return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
    }
  }

  function normalizeState() {
    if (!STATE || typeof STATE !== "object") STATE = defaultState();
    if (!STATE.making) STATE.making = { measured: { roomC: null, flourC: null, waterC: null, doughC: null, counterC: null } };
    if (!STATE.making.measured) STATE.making.measured = { roomC: null, flourC: null, waterC: null, doughC: null, counterC: null };

    if (typeof STATE.debugMode !== "boolean") STATE.debugMode = false;
    if (!STATE.activeTab) STATE.activeTab = "session";
    if (!STATE.debugMode && STATE.activeTab === "debug") STATE.activeTab = "session";
    if (!Array.isArray(STATE.orders)) STATE.orders = [];

    if (!STATE.session || typeof STATE.session !== "object") {
      const legacy = STATE.dough || {};
      const legacyTemps = legacy.temps || {};
      const legacyPrefermentType = legacy.prefermentType || "direct";
      const plannedISO = legacy.plannedEat ? localInputToISO(legacy.plannedEat) : getDefaultPlannedEatISO();

      STATE.session = {
        ...defaultState().session,
        sessionId: STATE.sessionId || cryptoSafeId("session"),
        plannedEatTimeISO: plannedISO,
        doughModality: "MAKE_DOUGH",
        styleId: "ROUND_NEAPOLITAN",
        ballsUsed: Math.max(MIN_BALLS, totalPizzasFromOrders()),
        ballWeightG: Number(legacy.ballWeightG || 260),
        oven_id: STATE.ovenId || null,
        oven_program_id: STATE.ovenProgramId || null,
        mixer_id: STATE.mixerId || null,
        fermentationLocation: legacy.fermentationLocation === "cold" ? "FRIDGE" : legacy.fermentationLocation === "hybrid" ? "HYBRID" : "ROOM",
        fermentationMode: legacy.fermentationLocation === "double" ? "DOUBLE" : "SINGLE",
        totalFermentationHours: normalizeFermentationHours(legacy.fermentationHours, legacyPrefermentType),
        temps: {
          roomTempC: Number(legacyTemps.roomC ?? 22),
          flourTempC: Number(legacyTemps.flourC ?? 22),
          fridgeTempC: 4
        },
        prefermentType: legacyPrefermentType === "direct" ? "NONE" : legacyPrefermentType.toUpperCase(),
        formulaOverrides: {
          hydrationPct: Number(legacy.hydrationPct ?? 63),
          saltPct: Number(legacy.saltPct ?? 2.8),
          honeyPct: Number(legacy.honeyPct ?? 0),
          oilPct: 0,
          maltPct: 0,
          yeastPctIDY: Number(legacy.yeastPct ?? 0.05),
          yeastType: String(legacy.yeastType || "IDY").toUpperCase()
        },
        temperaturePlanning: { targetDDTC: Number(legacyTemps.targetDDTC ?? 23) }
      };
    }

    const sessionDefaults = defaultState().session;
    STATE.session = {
      ...sessionDefaults,
      ...STATE.session,
      temps: { ...sessionDefaults.temps, ...STATE.session.temps },
      oven_overrides: { ...sessionDefaults.oven_overrides, ...STATE.session.oven_overrides },
      prefermentOptions: {
        ...sessionDefaults.prefermentOptions,
        ...STATE.session.prefermentOptions,
        poolish: { ...sessionDefaults.prefermentOptions.poolish, ...STATE.session.prefermentOptions?.poolish },
        biga: { ...sessionDefaults.prefermentOptions.biga, ...STATE.session.prefermentOptions?.biga },
        tiga: { ...sessionDefaults.prefermentOptions.tiga, ...STATE.session.prefermentOptions?.tiga },
        hybrid: { ...sessionDefaults.prefermentOptions.hybrid, ...STATE.session.prefermentOptions?.hybrid },
        sourdough: { ...sessionDefaults.prefermentOptions.sourdough, ...STATE.session.prefermentOptions?.sourdough }
      },
      formulaOverrides: { ...sessionDefaults.formulaOverrides, ...STATE.session.formulaOverrides },
      temperaturePlanning: { ...sessionDefaults.temperaturePlanning, ...STATE.session.temperaturePlanning },
      existingDough: { ...sessionDefaults.existingDough, ...STATE.session.existingDough }
    };

    if (!STATE.session.plannedEatTimeISO) STATE.session.plannedEatTimeISO = getDefaultPlannedEatISO();
    if (!STATE.session.sessionId) STATE.session.sessionId = cryptoSafeId("session");
    if (!STATE.session.timezone) STATE.session.timezone = "America/Toronto";

    const fermOptions = [0, 24, 48];
    if (!fermOptions.includes(Number(STATE.session.totalFermentationHours))) {
      STATE.session.totalFermentationHours = 24;
    }

    if (STATE.session.styleId === "PAN_SICILIAN_STANDARD") {
      STATE.session.ballsUsed = 1;
    }

    STATE.session.existingDough = STATE.session.existingDough || defaultState().session.existingDough;
    STATE.session.existingDough.styleId = STATE.session.styleId;

    if (!STATE.session_v2_selection || typeof STATE.session_v2_selection !== "object") {
      STATE.session_v2_selection = { ...defaultState().session_v2_selection };
    }
    if (!STATE.session_v2_inputs || typeof STATE.session_v2_inputs !== "object") {
      STATE.session_v2_inputs = {};
    }
    if (!STATE.session_v2 || typeof STATE.session_v2 !== "object") {
      STATE.session_v2 = { ...defaultState().session_v2 };
    }

    delete STATE.dough;
    delete STATE.ovenId;
    delete STATE.ovenProgramId;
    delete STATE.mixerId;
    delete STATE.ovens;
    delete STATE.mixers;

    // normalize orders
    for (const person of STATE.orders) {
      if (!person.id) person.id = cryptoSafeId("person");
      if (!person.name) person.name = "Person";
      if (!Array.isArray(person.pizzas)) person.pizzas = [];

      for (const pz of person.pizzas) {
        if (!pz.id) pz.id = cryptoSafeId("pz");
        if (!pz.presetId) pz.presetId = "neapolitan_margherita";
        if (!isFinite(Number(pz.qty))) pz.qty = 1;
        if (!Array.isArray(pz.toppings)) pz.toppings = [];
        if (typeof pz.formatOverride !== "string") pz.formatOverride = "";
      }
    }

    saveState();
  }
  /* ---------- Tab System ---------- */
  function renderTabs() {
    const tabs = $("#tabs");
    const sessionPanel = $("#tab-session");
    if (!tabs || !sessionPanel) {
      setBanner(
        "error",
        "HTML structure mismatch",
        "Missing required elements (#tabs and/or #tab-session). Your index.html must include the tab buttons and panels with ids like #tab-session, #tab-orders, #tab-making, #tab-shopping, #tab-presets."
      );
      return false;
    }

    $$("#tabs .tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === STATE.activeTab);
    });

    const debugBtn = $("#tabs .tab-btn[data-tab=\"debug\"]");
    if (debugBtn) {
      debugBtn.style.display = STATE.debugMode ? "" : "none";
    }
    const debugToggle = $("#debugToggle");
    if (debugToggle) {
      debugToggle.checked = STATE.debugMode;
    }

    $$(".tab-panel").forEach((p) => p.classList.remove("active"));
    const active = $(`#tab-${STATE.activeTab}`);
    if (active) active.classList.add("active");

    return true;
  }


  function switchTab(tab) {
    STATE.activeTab = tab;
    saveState();
    render();
  }

  function setDebugMode(enabled) {
    STATE.debugMode = Boolean(enabled);
    if (!STATE.debugMode && STATE.activeTab === "debug") STATE.activeTab = "session";
    saveState();
    render();
  }

  /* ---------- Preset persistence ---------- */
  function loadCustomPizzaPresets() {
    const raw = localStorage.getItem(LS.CUSTOM_PIZZA_PRESETS);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveCustomPizzaPresets(list) {
    localStorage.setItem(LS.CUSTOM_PIZZA_PRESETS, JSON.stringify(list));
  }

  function allPizzaPresets() {
    return [...BASE_PIZZA_PRESETS, ...loadCustomPizzaPresets()];
  }

  function getPreset(presetId) {
    return allPizzaPresets().find((p) => p.id === presetId) || BASE_PIZZA_PRESETS[0];
  }

  function isBasePreset(presetId) {
    return BASE_PIZZA_PRESETS.some((p) => p.id === presetId);
  }

  /* ---------- Yeast Multipliers (IDY baseline) ---------- */
  function yeastMultiplier(yeastType) {
    const key = String(yeastType || "").toUpperCase();
    if (key === "ADY") return 3;
    if (key === "FRESH") return 9;
    return 1;
  }

  function yeastTypeLabel(yeastType) {
    const key = String(yeastType || "").toUpperCase();
    if (key === "ADY") return "Active Dry";
    if (key === "FRESH") return "Fresh";
    return "Instant Dry";
  }

  /* ---------- Dough method apply ---------- */
  function getMethod(id) {
    return (CONFIG.doughMethods || []).find((m) => m.id === id) || (CONFIG.doughMethods || [])[0];
  }

  function getOvenById(id) {
    return window.PizzaConfigLoader.getOvenById(CONFIG.ovens || [], id);
  }

  const PREFERMENT_METHOD_MAP = {
    NONE: ["direct"],
    POOLISH: ["poolish"],
    BIGA: ["biga"],
    TIGA: ["biga"],
    POOLISH_BIGA_HYBRID: ["poolish", "biga"],
    SOURDOUGH: ["sourdough"]
  };

  function getMethodIdsForPreferment(prefType) {
    const pref = String(prefType || "NONE").toUpperCase();
    return PREFERMENT_METHOD_MAP[pref] || [];
  }

  function resolveMethodIdForPreferment(prefType, fallback) {
    const ids = getMethodIdsForPreferment(prefType);
    const available = new Set((CONFIG.doughMethods || []).map((m) => m.id));
    const resolved = ids.find((id) => available.has(id));
    return resolved || fallback || (CONFIG.doughMethods || [])[0]?.id || "direct";
  }

  function getMethodNotesForPreferment(prefType) {
    const ids = getMethodIdsForPreferment(prefType);
    const methods = ids.map(getMethod).filter(Boolean);
    const notes = methods.map((m) => m.notes).filter(Boolean);
    const labels = methods.map((m) => m.label).filter(Boolean);
    if (!notes.length) return "";
    const label = labels.length ? `${labels.join(" + ")}: ` : "";
    return `${label}${notes.join(" ")}`;
  }

  function getSessionDefaultsForPreferment(prefType, options = {}) {
    const defaults = defaultState().session;
    const current = STATE.session || defaults;
    const preserved = {
      plannedEatTimeISO: current.plannedEatTimeISO,
      timezone: current.timezone,
      doughModality: current.doughModality,
      styleId: current.styleId,
      ballsUsed: current.ballsUsed,
      ballWeightG: current.ballWeightG,
      oven_id: current.oven_id,
      oven_program_id: current.oven_program_id,
      oven_overrides: current.oven_overrides,
      mixer_id: current.mixer_id,
      existingDough: current.existingDough,
      temps: current.temps
    };

    return {
      ...defaults,
      ...preserved,
      prefermentType: prefType,
      fermentationLocation: defaults.fermentationLocation,
      fermentationMode: defaults.fermentationMode,
      totalFermentationHours: normalizeFermentationHours(defaults.totalFermentationHours, prefType),
      formulaOverrides: { ...defaults.formulaOverrides },
      temperaturePlanning: { ...defaults.temperaturePlanning },
      prefermentOptions: deepClone(defaults.prefermentOptions),
      doughMethodId: resolveMethodIdForPreferment(prefType, defaults.doughMethodId),
      doughPresetId: options.doughPresetId ?? defaults.doughPresetId
    };
  }

  function resetSessionForPrefermentType(prefType, options = {}) {
    STATE.session = getSessionDefaultsForPreferment(prefType, options);
  }

  function applyDoughPreset(presetId) {
    const preset = (CONFIG.doughPresets || []).find((p) => p.id === presetId) || null;
    if (!STATE.session) STATE.session = defaultState().session;

    if (!preset || presetId === "manual" || !preset.defaults) {
      STATE.session.doughPresetId = presetId;
      saveState();
      render();
      return;
    }

    const def = preset.defaults;
    const prefType = String(def.prefermentType || "direct");
    const normalizedPrefType = prefType === "direct" ? "NONE" : prefType.toUpperCase();
    resetSessionForPrefermentType(normalizedPrefType, { doughPresetId: presetId });

    STATE.session.formulaOverrides = {
      ...STATE.session.formulaOverrides,
      hydrationPct: Number(def.hydrationPct ?? STATE.session.formulaOverrides?.hydrationPct ?? 63),
      saltPct: Number(def.saltPct ?? STATE.session.formulaOverrides?.saltPct ?? 2.8),
      honeyPct: Number(def.honeyPct ?? STATE.session.formulaOverrides?.honeyPct ?? 0),
      yeastPctIDY: Number(def.yeastPct ?? STATE.session.formulaOverrides?.yeastPctIDY ?? 0.05)
    };

    STATE.session.prefermentType = normalizedPrefType;
    STATE.session.totalFermentationHours = normalizeFermentationHours(def.fermentationHours, prefType);
    STATE.session.fermentationLocation =
      def.fermentationLocation === "cold" ? "FRIDGE" :
      def.fermentationLocation === "hybrid" ? "HYBRID" :
      "ROOM";
    STATE.session.temperaturePlanning = {
      targetDDTC: Number(def.ddtC ?? STATE.session.temperaturePlanning?.targetDDTC ?? 23)
    };

    saveState();
    render();
  }

  /* ---------- Orders helpers ---------- */
  function totalPizzasFromOrders() {
    let total = 0;
    for (const person of STATE.orders) {
      for (const pz of person.pizzas || []) total += Number(pz.qty || 0);
    }
    return Math.max(0, total);
  }

  function ensureMinimumBallLogic() {
    const minBalls = Math.max(MIN_BALLS, totalPizzasFromOrders());
    if (STATE.session) {
      const current = Number(STATE.session.ballsUsed || minBalls);
      const next = Math.max(current, minBalls);
      STATE.session.ballsUsed = STATE.session.styleId === "PAN_SICILIAN_STANDARD" ? 1 : next;
      return STATE.session.ballsUsed;
    }
    return minBalls;
  }

  function addPerson(name) {
    const nm = (name || "").trim() || `Person ${STATE.orders.length + 1}`;
    STATE.orders.push({ id: cryptoSafeId("person"), name: nm, pizzas: [] });
    saveState();
  }

  function removePerson(personId) {
    STATE.orders = STATE.orders.filter((p) => p.id !== personId);
    saveState();
  }

function addPizzaToPerson(personId) {
  const person = STATE.orders.find((p) => p.id === personId);
  if (!person) return;

  // 1. Choose a dough-compatible preset
  const presetId = getFirstAllowedPresetId();
  const preset = getPreset(presetId);

  // 2. Create the pizza using THAT preset
  const newPizza = {
    id: cryptoSafeId("pz"),
    presetId,
    qty: 1,
    toppings: deepClone(preset.ingredients || []), // ← THIS IS THE LINE YOU ASKED ABOUT
    formatOverride: ""
  };

  person.pizzas.push(newPizza);
  saveState();
}



function getFirstAllowedPresetId() {
  const allowed = allPizzaPresets().filter(isPresetAllowedByDough);
  return allowed.length ? allowed[0].id : (allPizzaPresets()[0]?.id || "neapolitan_margherita");
}

  function removePizza(personId, pizzaId) {
    const person = STATE.orders.find((p) => p.id === personId);
    if (!person) return;
    person.pizzas = person.pizzas.filter((x) => x.id !== pizzaId);
    saveState();
  }
function getSelectedOven() {
  return window.PizzaConfigLoader.getOvenById(CONFIG.ovens || [], STATE.session?.oven_id) || null;
}

function getSelectedOvenProgram(ov) {
  if (!ov || !Array.isArray(ov.programs) || !ov.programs.length) return null;
  return ov.programs.find((p) => p.id === STATE.session?.oven_program_id) || ov.programs[0];
}

const TEMP_TARGET_LABELS = {
  deck: "Deck",
  top: "Top",
  air: "Air",
  stone: "Stone"
};

function formatTempRangeF(range) {
  if (!Array.isArray(range)) return "—";
  const min = Number(range[0]);
  const max = Number(range[1]);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return "—";
  if (!Number.isFinite(max) || min === max) return `${round(min, 0)}°F`;
  return `${round(min, 0)}–${round(max, 0)}°F`;
}

function getProgramTempTargets(prog) {
  const targets = prog?.temp_targets_f;
  if (!targets || typeof targets !== "object") return [];
  return Object.entries(targets)
    .filter(([, range]) => Array.isArray(range) && range.length)
    .map(([key, range]) => ({
      key,
      label: TEMP_TARGET_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value: formatTempRangeF(range)
    }));
}

  function getPlan() {
    if (!window.PizzaCalc || typeof window.PizzaCalc.resolveSessionToPlan !== "function") {
      return { totalDoughG: 0, ingredients: null, recommendedWaterTempC: null, warnings: [] };
    }
    return window.PizzaCalc.resolveSessionToPlan(STATE.session, {
      ovens: CONFIG.ovens || [],
      mixers: CONFIG.mixers || []
    });
  }

  /* ---------- Dough totals ---------- */
  function computeDough() {
    const plan = getPlan();
    const totals = plan.ingredients?.totals;
    const preferment = plan.ingredients?.preferment;
    const finalMix = plan.ingredients?.finalMix;
    const ordered = totalPizzasFromOrders();
    const balls = ensureMinimumBallLogic();

    if (!totals) {
      return {
        ordered,
        balls,
        totalDoughG: round(plan.totalDoughG || 0, 0),
        flourG: 0,
        waterG: 0,
        saltG: 0,
        honeyG: 0,
        yeastG: 0,
        prefermentFlourG: 0,
        finalFlourG: 0,
        yeastType: totals?.yeastType || "IDY",
        yeastMult: 1
      };
    }

    return {
      ordered,
      balls,
      totalDoughG: round(plan.totalDoughG || 0, 0),
      flourG: round(totals.flourG || 0, 0),
      waterG: round(totals.waterG || 0, 0),
      saltG: round(totals.saltG || 0, 1),
      honeyG: round(totals.honeyG || 0, 1),
      yeastG: round(totals.yeastG || 0, 2),
      prefermentFlourG: round(preferment?.flourG || 0, 0),
      finalFlourG: round(finalMix?.flourG || 0, 0),
      yeastType: totals.yeastType || "IDY",
      yeastMult: 1
    };
  }

  /* ---------- DDT Water Temp (simple 3-factor) ---------- */
function recommendWaterTempC() {
  const plan = getPlan();
  return plan.recommendedWaterTempC == null ? "—" : round(plan.recommendedWaterTempC, 1);
}

function isFiniteNumber(x) {
  return Number.isFinite(Number(x));
}

function firstFinite(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

const FERMENTATION_HOUR_OPTIONS = [0, 24, 48];

function getFermentationHourOptions(prefermentType) {
  const pref = String(prefermentType || "NONE").toUpperCase();
  return pref === "NONE" ? FERMENTATION_HOUR_OPTIONS : FERMENTATION_HOUR_OPTIONS.filter((h) => h !== 0);
}

function normalizeFermentationHours(hours, prefermentType) {
  const options = getFermentationHourOptions(prefermentType);
  const parsed = Number(hours);
  if (Number.isFinite(parsed) && options.includes(parsed)) return parsed;
  if (options.includes(24)) return 24;
  return options[0] ?? 24;
}

  function doughModeCopy() {
    const s = STATE.session;
    const pref = String(s.prefermentType || "NONE").toUpperCase();
    const loc = s.fermentationLocation || "ROOM";
    const hours = normalizeFermentationHours(s.totalFermentationHours, pref);
    const methodNotes = getMethodNotesForPreferment(pref);

    const prefCopy =
      pref === "NONE"
        ? "Direct dough: clean, straightforward flavor."
        : pref === "POOLISH"
        ? "Poolish: sweeter aroma, extensibility, gentle complexity."
        : pref === "BIGA"
        ? "Biga: strength + structure, nuttier aroma, controlled fermentation."
        : pref === "TIGA"
        ? "Tiga: structured preferment with steady handling."
        : pref === "POOLISH_BIGA_HYBRID"
        ? "Hybrid: poolish aroma + biga structure."
        : "Sourdough: deeper complexity and aroma; peak timing matters.";

    const timeCopy =
      hours === 0
        ? "Same-day ferment: mild flavor, tighter structure. Keep it warm and bake soon."
        : hours === 24
        ? "24h ferment: balanced flavor, good extensibility, classic Neapolitan feel."
        : "48h ferment: deeper aroma, silkier texture, handle gently with stronger flour.";

    const locCopy =
      loc === "ROOM"
        ? "Room-temp fermentation: faster and sensitive to temperature swings."
        : loc === "FRIDGE"
        ? "Cold fermentation: predictable handling and slower flavor build."
        : "Hybrid: start at room temp for activity, then cold for control.";

    return `${prefCopy} ${timeCopy} ${locCopy}${methodNotes ? ` ${methodNotes}` : ""}`;
  }

  function updateSessionOutputs() {
    const s = STATE.session;
    const c = computeDough();
    const plan = getPlan();
    const ballsUsed = ensureMinimumBallLogic();
    const waterRec = recommendWaterTempC();

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText("kpi-total-pizzas", totalPizzasFromOrders());
    setText("kpi-balls-used", ballsUsed);
    setText("kpi-ball-weight", `${s.ballWeightG} g`);
    setText("kpi-total-dough", `${c.totalDoughG} g`);
    setText("totals-flour", `${c.flourG} g`);
    setText("totals-water", `${c.waterG} g`);
    setText("totals-salt", `${c.saltG} g`);
    setText("totals-honey", `${c.honeyG} g`);
    setText("totals-yeast", `${c.yeastG} g`);
    setText("pref-flour", `${c.prefermentFlourG} g`);
    setText("pref-final-flour", `${c.finalFlourG} g`);
    setText("pref-pct", plan.ingredients?.preferment ? "—" : "0%");
    setText("pref-type", plan.ingredients?.preferment?.type || "NONE");

    const doughModeEl = document.getElementById("dough-mode-copy");
    if (doughModeEl) doughModeEl.textContent = doughModeCopy();

    const waterEl = document.getElementById("waterRec");
    if (waterEl) waterEl.value = `${waterRec} °C`;

    const prefTypeSelect = document.getElementById("prefType");
    if (prefTypeSelect) prefTypeSelect.value = s.prefermentType;
  }

  function updateMakingOutputs() {
    const liveWaterRec = recommendWaterTempC();
    const waterEl = document.getElementById("making-water-rec");
    if (waterEl) waterEl.textContent = liveWaterRec;
  }

  function clearSessionV2Drafts() {
    Object.keys(INPUT_STORE.drafts).forEach((key) => {
      if (key.startsWith("session_v2:")) delete INPUT_STORE.drafts[key];
    });
    Object.keys(INPUT_STORE.errors).forEach((key) => {
      if (key.startsWith("session_v2:")) delete INPUT_STORE.errors[key];
    });
  }

  function ensureSessionV2State() {
    if (!CONFIG.sessionV2) return;
    const methods = CONFIG.sessionV2.methods || [];
    const presets = CONFIG.sessionV2.presets || [];
    const defaultMethodId = methods[0]?.method_id || "direct";
    const defaultPresetId = presets[0]?.id || "manual_custom";

    if (!STATE.session_v2_selection || typeof STATE.session_v2_selection !== "object") {
      STATE.session_v2_selection = { method_id: defaultMethodId, preset_id: defaultPresetId };
    }

    if (!methods.some((m) => m.method_id === STATE.session_v2_selection.method_id)) {
      STATE.session_v2_selection.method_id = defaultMethodId;
    }

    if (!presets.some((p) => p.id === STATE.session_v2_selection.preset_id)) {
      STATE.session_v2_selection.preset_id = defaultPresetId;
    }

    if (!STATE.session_v2_inputs || typeof STATE.session_v2_inputs !== "object") {
      STATE.session_v2_inputs = {};
    }

    if (!STATE.session_v2 || typeof STATE.session_v2 !== "object") {
      STATE.session_v2 = { resolved_session: null, derived_session: null, warnings: [] };
    }

    updateSessionV2Resolved();
  }

  function updateSessionV2Resolved() {
    if (!window.SessionResolver || !CONFIG.sessionV2) return;
    const selection = STATE.session_v2_selection || {};
    const result = window.SessionResolver.resolveSession({
      method_id: selection.method_id,
      preset_id: selection.preset_id,
      user_session_overrides: STATE.session_v2_inputs || {}
    });
    STATE.session_v2 = result;
  }

  function runSessionResolverTests() {
    if (!window.SessionResolver || !CONFIG.sessionV2) return;
    const methods = CONFIG.sessionV2.methods || [];
    const presets = CONFIG.sessionV2.presets || [];

    const resolve = (methodId, overrides = {}) =>
      window.SessionResolver.resolveSession({
        method_id: methodId,
        preset_id: "manual_custom",
        user_session_overrides: {
          pizza_style_id: "neapolitan_round",
          oven_type: "home_electric",
          flour_blend_id: "00_only",
          target_pizza_count: 1,
          dough_unit_weight_g: 300,
          hydration_percent: 60,
          salt_percent: 2.5,
          fermentation_location: "cold",
          ambient_temp_c: 22,
          fridge_temp_c: 4,
          mix_method: "hand",
          bulk_ferment_hours: 0,
          cold_ferment_hours: 24,
          ball_or_pan_ferment_hours: 0,
          ...overrides
        }
      });

    const direct = resolve("direct", { preferment_enabled: false, starter_enabled: false, yeast_percent: 0.05 });
    console.assert(
      Math.abs(direct.derived_session.final_mix_flour_g - direct.derived_session.total_flour_g) < 0.1,
      "Direct: final mix flour should equal total flour."
    );
    console.assert(
      Math.abs(direct.derived_session.final_mix_water_g - direct.derived_session.total_water_g) < 0.1,
      "Direct: final mix water should equal total water."
    );

    const poolish = resolve("poolish", {
      preferment_enabled: true,
      preferment_flour_percent_of_total: 30,
      preferment_hydration_percent: 100
    });
    console.assert(
      Math.abs(poolish.derived_session.final_mix_flour_g - (poolish.derived_session.total_flour_g - poolish.derived_session.preferment_flour_g)) < 0.1,
      "Poolish: final mix flour subtracts preferment flour."
    );
    console.assert(
      Math.abs(poolish.derived_session.final_mix_water_g - (poolish.derived_session.total_water_g - poolish.derived_session.preferment_water_g)) < 0.1,
      "Poolish: final mix water subtracts preferment water."
    );

    const biga = resolve("biga", {
      preferment_enabled: true,
      preferment_flour_percent_of_total: 50,
      preferment_hydration_percent: 45
    });
    console.assert(
      Math.abs(biga.derived_session.final_mix_flour_g - (biga.derived_session.total_flour_g - biga.derived_session.preferment_flour_g)) < 0.1,
      "Biga: final mix flour subtracts preferment flour."
    );
    console.assert(
      Math.abs(biga.derived_session.final_mix_water_g - (biga.derived_session.total_water_g - biga.derived_session.preferment_water_g)) < 0.1,
      "Biga: final mix water subtracts preferment water."
    );

    const hybrid = resolve("hybrid_poolish_biga", {
      preferment_enabled: true,
      preferment_flour_percent_of_total: 60,
      hybrid_poolish_share_percent: 60,
      hybrid_biga_share_percent: 40
    });
    const components = hybrid.derived_session.preferment_components || {};
    console.assert(
      Math.abs((components.poolish_flour_g || 0) + (components.biga_flour_g || 0) - hybrid.derived_session.preferment_flour_g) < 0.1,
      "Hybrid: preferment components sum to preferment flour."
    );
    console.assert(
      Math.abs(hybrid.derived_session.final_mix_flour_g - (hybrid.derived_session.total_flour_g - hybrid.derived_session.preferment_flour_g)) < 0.1,
      "Hybrid: final mix flour subtracts preferment flour."
    );

    const presetWithOverrides = presets.find((preset) => preset?.overrides && preset.method_id);
    if (presetWithOverrides) {
      const method = methods.find((m) => m.method_id === presetWithOverrides.method_id);
      if (method) {
        const presetBundle = window.SessionResolver.resolveSession({
          method_id: method.method_id,
          preset_id: presetWithOverrides.id,
          user_session_overrides: {
            pizza_style_id: presetWithOverrides.pizza_style_id || "neapolitan_round",
            oven_type: presetWithOverrides.oven_type || "home_electric",
            flour_blend_id: presetWithOverrides.flour_blend_id || "00_only",
            target_pizza_count: 1,
            dough_unit_weight_g: 300,
            fermentation_location: "cold",
            ambient_temp_c: 22,
            fridge_temp_c: 4,
            mix_method: "hand",
            bulk_ferment_hours: 0,
            cold_ferment_hours: 24,
            ball_or_pan_ferment_hours: 0
          }
        });

        Object.entries(method.defaults || {}).forEach(([key, value]) => {
          if (Object.prototype.hasOwnProperty.call(presetWithOverrides.overrides, key)) return;
          if (["diastatic_malt_percent", "honey_percent", "oil_percent"].includes(key)) return;
          const resolvedValue = presetBundle.resolved_session[key];
          console.assert(
            resolvedValue === value,
            `Preset override check failed for ${key}.`
          );
        });
      }
    }
  }

  function updateOrderCounts(personId) {
    if (!personId) return;
    const person = STATE.orders.find((p) => p.id === personId);
    if (!person) return;
    const count = person.pizzas.reduce((a, p) => a + Number(p.qty || 0), 0);
    const countEl = document.querySelector(`[data-person-count="${personId}"]`);
    if (countEl) countEl.textContent = `${count} pizza(s)`;
  }

  /* ============================================================
     RENDERS
     ============================================================ */

  function renderSession() {
    const root = $("#tab-session");
    if (!root) return;

    if (!CONFIG.sessionV2?.schema) {
      root.innerHTML = `
        <div class="card">
          <h2>Sessions</h2>
          <p>Session schema is still loading.</p>
        </div>
      `;
      return;
    }

    ensureSessionV2State();

    const selection = STATE.session_v2_selection;
    const bundle = STATE.session_v2 || {};
    const resolved = bundle.resolved_session || {};
    const derived = bundle.derived_session || {};
    const warnings = bundle.warnings || [];
    const schema = CONFIG.sessionV2.schema;
    const enums = CONFIG.sessionV2.enums || {};
    const methods = CONFIG.sessionV2.methods || [];
    const presets = CONFIG.sessionV2.presets || [];
    const selectedPreset = presets.find((preset) => preset.id === selection.preset_id) || null;
    const selectedMethod = methods.find((method) => method.method_id === selection.method_id) || methods[0] || null;
    const methodRanges = selectedMethod?.ranges || {};

    const requiredFields = new Set([
      ...(schema.required_core_fields || []),
      ...(schema.required_time_model_fields || [])
    ]);

    const allFields = [
      ...(schema.required_core_fields || []),
      ...(schema.required_time_model_fields || []),
      ...(schema.optional_fields || [])
    ];

    const sections = {
      identity: [],
      target: [],
      formula: [],
      yeast: [],
      preferment: [],
      fermentation: [],
      temperature: [],
      batching: [],
      notes: []
    };

    const identityFields = new Set(["pizza_style_id", "method_id", "oven_type", "flour_blend_id"]);
    const targetFields = new Set(["target_pizza_count", "dough_unit_weight_g", "pan_or_tray_area_cm2", "dough_grams_per_cm2"]);

    const categorizeField = (key) => {
      if (identityFields.has(key)) return "identity";
      if (targetFields.has(key)) return "target";
      if (key === "notes_md") return "notes";
      if (key.includes("batch")) return "batching";
      if (key.includes("temp") || key.includes("ddt")) return "temperature";
      if (key.includes("ferment") && !key.includes("preferment")) return "fermentation";
      if (key.includes("preferment") || key.includes("hybrid")) return "preferment";
      if (key.includes("starter") || key.includes("yeast")) return "yeast";
      if (key.includes("percent") || key.includes("hydration")) return "formula";
      return "formula";
    };

    allFields.forEach((key) => {
      const bucket = categorizeField(key);
      sections[bucket].push(key);
    });

    const labelForField = (key) =>
      key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());

    const isNumericField = (key, value) =>
      typeof value === "number" || /(_percent|_g|_cm2|_count|_hours|_temp|_c)$/.test(key);

    const isIntegerField = (key) => /(_count|_g|_cm2)$/.test(key);

    const renderOptions = (options, current) => {
      const safeOptions = Array.isArray(options) ? options : [];
      const withEmpty = current == null ? ["", ...safeOptions] : safeOptions;
      return withEmpty
        .map((opt) => {
          const label = opt === "" ? "—" : opt;
          return `<option value="${escapeHtml(opt)}" ${String(opt) === String(current ?? "") ? "selected" : ""}>${escapeHtml(label)}</option>`;
        })
        .join("");
    };

    const renderField = (key) => {
      const value = resolved[key];
      const enumOptions = key === "method_id"
        ? methods.map((method) => ({ value: method.method_id, label: method.display_name || method.method_id }))
        : enums[key];

      if (key === "notes_md") {
        return `
          <div class="grid-span-2">
            <label>${escapeHtml(labelForField(key))}</label>
            <textarea id="session-v2-${key}" data-field="${key}" rows="4">${escapeHtml(value || "")}</textarea>
          </div>
        `;
      }

      if (key.endsWith("_enabled") || key === "warnings_enabled") {
        return `
          <div>
            <label style="display:flex; gap:8px; align-items:center;">
              <input type="checkbox" id="session-v2-${key}" data-field="${key}" ${value ? "checked" : ""}>
              ${escapeHtml(labelForField(key))}
            </label>
          </div>
        `;
      }

      if (enumOptions) {
        if (key === "method_id") {
          return `
            <div>
              <label>${escapeHtml(labelForField(key))}</label>
              <select id="session-v2-${key}" data-field="${key}">
                ${enumOptions
                  .map((opt) => `
                    <option value="${escapeHtml(opt.value)}" ${String(opt.value) === String(value ?? "") ? "selected" : ""}>
                      ${escapeHtml(opt.label)}
                    </option>
                  `)
                  .join("")}
              </select>
            </div>
          `;
        }
        return `
          <div>
            <label>${escapeHtml(labelForField(key))}</label>
            <select id="session-v2-${key}" data-field="${key}">
              ${renderOptions(enumOptions, value)}
            </select>
          </div>
        `;
      }

      if (isNumericField(key, value)) {
        const inputKey = `session_v2:${key}`;
        return `
          <div>
            <label>${escapeHtml(labelForField(key))} <span class="dirty-indicator" data-dirty-for="${inputKey}" hidden></span></label>
            <input type="text" id="session-v2-${key}" inputmode="decimal" data-numeric="true"
              value="${escapeHtml(getInputDisplayValue(inputKey, value))}">
            <div class="input-error" data-error-for="${inputKey}" hidden></div>
          </div>
        `;
      }

      return `
        <div>
          <label>${escapeHtml(labelForField(key))}</label>
          <input type="text" id="session-v2-${key}" data-field="${key}" value="${escapeHtml(value ?? "")}">
        </div>
      `;
    };

    const renderSection = (title, keys) => {
      if (!keys.length) return "";
      return `
        <div class="card">
          <h3>${escapeHtml(title)}</h3>
          <div class="grid-2">
            ${keys.map(renderField).join("")}
          </div>
        </div>
      `;
    };

    const renderNotes = () => {
      if (!selectedPreset) return "<div class=\"small\">No preset selected.</div>";
      const notes = Array.isArray(selectedPreset.selection_notes_md)
        ? selectedPreset.selection_notes_md
        : (selectedPreset.selection_notes_md ? [selectedPreset.selection_notes_md] : []);
      const authority = selectedPreset.embedded_authority?.name || selectedPreset.authority_id;
      return `
        <div class="card">
          <h3>Preset Notes</h3>
          <div class="small"><strong>${escapeHtml(selectedPreset.label || selectedPreset.id)}</strong></div>
          ${authority ? `<div class="small">Authority: ${escapeHtml(authority)}</div>` : ""}
          ${notes.length ? `<ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : "<div class=\"small\">No notes.</div>"}
        </div>
      `;
    };

    const renderWarnings = () => {
      if (!warnings.length) return "";
      return `
        <div class="card">
          <h3>Warnings</h3>
          <ul>
            ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
          </ul>
        </div>
      `;
    };

    root.innerHTML = `
      <div class="card">
        <h2>Sessions (Schema-driven)</h2>
        <p>Session_v2 uses dough method schema, presets, and override inputs to compute a resolved dough plan.</p>
      </div>

      <div class="card">
        <h3>Identity / Selection</h3>
        <div class="grid-2">
          <div>
            <label>Preset</label>
            <select id="session-v2-preset">
              ${presets.map((preset) => `
                <option value="${preset.id}" ${preset.id === selection.preset_id ? "selected" : ""}>
                  ${escapeHtml(preset.label || preset.id)}
                </option>
              `).join("")}
            </select>
          </div>
          ${sections.identity.map(renderField).join("")}
        </div>
      </div>

      ${renderNotes()}
      ${renderSection("Target Output", sections.target)}
      ${renderSection("Formula", sections.formula)}
      ${renderSection("Yeast / Starter", sections.yeast)}
      ${renderSection("Preferment", sections.preferment)}
      ${renderSection("Fermentation / Schedule", sections.fermentation)}
      ${renderSection("Temperature Model", sections.temperature)}
      ${renderSection("Batching", sections.batching)}
      ${renderSection("Notes", sections.notes)}

      <div class="card">
        <h3>Resolved Totals</h3>
        <div class="kpi">
          <div class="box"><div class="small">Total dough</div><div class="v">${derived.target_total_dough_g ?? "—"} g</div></div>
          <div class="box"><div class="small">Flour</div><div class="v">${derived.total_flour_g ?? "—"} g</div></div>
          <div class="box"><div class="small">Water</div><div class="v">${derived.total_water_g ?? "—"} g</div></div>
          <div class="box"><div class="small">Salt</div><div class="v">${derived.total_salt_g ?? "—"} g</div></div>
        </div>
        ${derived.batches?.length ? `
          <div class="small" style="margin-top:10px;">
            Batches: ${derived.batches.map((b) => `#${b.batch_index} ${b.dough_mass_g}g`).join(", ")}
          </div>
        ` : ""}
      </div>

      ${renderWarnings()}
    `;

    const presetSelect = $("#session-v2-preset");
    if (presetSelect) {
      presetSelect.onchange = (e) => {
        const nextPresetId = e.target.value;
        const nextPreset = presets.find((preset) => preset.id === nextPresetId);
        STATE.session_v2_selection.preset_id = nextPresetId;
        if (nextPreset?.method_id) {
          STATE.session_v2_selection.method_id = nextPreset.method_id;
        }
        STATE.session_v2_inputs = {};
        clearSessionV2Drafts();
        updateSessionV2Resolved();
        saveState();
        render();
      };
    }

    sections.identity
      .filter((key) => key === "method_id")
      .forEach((key) => {
        const el = $(`#session-v2-${key}`);
        if (!el) return;
        el.onchange = (e) => {
          STATE.session_v2_selection.method_id = e.target.value;
          delete STATE.session_v2_inputs.method_id;
          updateSessionV2Resolved();
          saveState();
          render();
        };
      });

    allFields.forEach((key) => {
      const el = $(`#session-v2-${key}`);
      if (!el) return;
      if (key === "method_id") return;

      if (key.endsWith("_enabled") || key === "warnings_enabled") {
        el.onchange = (e) => {
          STATE.session_v2_inputs[key] = e.target.checked;
          updateSessionV2Resolved();
          saveState();
          render();
        };
        return;
      }

      if (key === "notes_md") {
        el.onchange = (e) => {
          STATE.session_v2_inputs[key] = e.target.value;
          updateSessionV2Resolved();
          saveState();
          render();
        };
        return;
      }

      if (el.tagName === "SELECT") {
        el.onchange = (e) => {
          STATE.session_v2_inputs[key] = e.target.value || null;
          updateSessionV2Resolved();
          saveState();
          render();
        };
        return;
      }

      if (el.dataset.numeric === "true") {
        const inputKey = `session_v2:${key}`;
        const range = methodRanges[key] || [];
        bindNumericInput(el, {
          key: inputKey,
          getValue: () => resolved[key],
          setValue: (value) => { STATE.session_v2_inputs[key] = value; },
          min: range[0],
          max: range[1],
          allowEmpty: !requiredFields.has(key),
          integer: isIntegerField(key),
          onCommit: () => {
            updateSessionV2Resolved();
            render();
          }
        });
        return;
      }

      el.onchange = (e) => {
        STATE.session_v2_inputs[key] = e.target.value;
        updateSessionV2Resolved();
        saveState();
        render();
      };
    });
  }
  function renderPizzaToppingsMini(pz, preset) {
    const tops =
      Array.isArray(pz.toppings) && pz.toppings.length
        ? pz.toppings
        : deepClone(preset.ingredients || []);

    if (!tops.length) return `<div class="small">No toppings set.</div>`;

    const before = tops.filter((t) => t.bakeTiming === "before");
    const after = tops.filter((t) => t.bakeTiming === "after");
    const split = tops.filter((t) => t.bakeTiming === "split");

    const group = (title, arr) => `
      <div style="margin-top:8px;">
        <div class="small"><strong>${title}</strong></div>
        <div class="small">${
          arr.map((a) => `${escapeHtml(a.name)} (${a.quantity}${a.unit || "g"})`).join(", ") || "—"
        }</div>
      </div>
    `;

    return `
      ${group("Before bake", before)}
      ${group("After bake", after)}
      ${group("Split", split)}
    `;
  }

  function openToppingsEditor(personId, pizzaId) {
    const person = STATE.orders.find((p) => p.id === personId);
    if (!person) return;
    const pizza = person.pizzas.find((p) => p.id === pizzaId);
    if (!pizza) return;

    const preset = getPreset(pizza.presetId);
    const tops =
      Array.isArray(pizza.toppings) && pizza.toppings.length
        ? pizza.toppings
        : deepClone(preset.ingredients || []);
    pizza.toppings = tops;

    const choice = prompt(
      `Edit toppings for "${preset.name}"\n\n` +
        `Type:\n` +
        `1 = Add ingredient\n` +
        `2 = Remove ingredient\n` +
        `3 = Edit quantity\n` +
        `4 = Change timing (before/after/split)\n\n` +
        `Current:\n` +
        tops.map((t, i) => `${i + 1}. ${t.name} — ${t.quantity}${t.unit || "g"} — ${t.bakeTiming}`).join("\n")
    );

    if (!choice) return;

    if (choice === "1") {
      const name = prompt("Ingredient name:");
      if (!name) return;
      const qty = Number(prompt("Quantity (number):", "10"));
      const unit = prompt("Unit (g/ml):", "g") || "g";
      const timing = prompt("Timing (before/after/split):", "before") || "before";
      tops.push({
        name: name.trim(),
        quantity: isFinite(qty) ? qty : 0,
        unit,
        bakeTiming: timing,
        scalingRule: "per_pizza",
        notes: ""
      });
    }

    if (choice === "2") {
      const idx = Number(prompt("Remove which number?", "1")) - 1;
      if (idx >= 0 && idx < tops.length) tops.splice(idx, 1);
    }

    if (choice === "3") {
      const idx = Number(prompt("Edit which number?", "1")) - 1;
      if (idx < 0 || idx >= tops.length) return;
      const qty = Number(prompt(`New quantity for ${tops[idx].name}:`, String(tops[idx].quantity)));
      if (isFinite(qty)) tops[idx].quantity = qty;
    }

    if (choice === "4") {
      const idx = Number(prompt("Change timing for which number?", "1")) - 1;
      if (idx < 0 || idx >= tops.length) return;
      const timing = prompt("Timing (before/after/split):", tops[idx].bakeTiming || "before");
      if (timing) tops[idx].bakeTiming = timing;
    }

    pizza.toppings = tops;
    saveState();
    normalizeState();
    render();
  }
function getDoughAllowedFormats() {
  const s = STATE.session || {};
  const methodId = String(s.doughMethodId || s.doughPresetId || "").toLowerCase();
  const pref = String(s.prefermentType || "NONE").toLowerCase();

  // Default = permissive if unknown (so you don't brick the app while building)
  let allowed = new Set(["neapolitan", "calzone", "panzerotti", "teglia", "focaccia", "dessert", "custom"]);

  // Hard rules by methodId (tighten as you add real presets)
  // Neapolitan-style dough methods should NOT allow teglia/focaccia by default
  if (methodId.includes("neapolitan") || methodId.includes("vito") || methodId.includes("iacopelli")) {
    allowed = new Set(["neapolitan", "calzone", "panzerotti", "dessert", "custom"]);
  }

  // Teglia / pan / focaccia oriented dough methods
  if (methodId.includes("teglia") || methodId.includes("pan") || methodId.includes("bonci") || methodId.includes("focaccia")) {
    allowed = new Set(["teglia", "focaccia", "dessert", "custom"]);
  }

  // Preferment-based constraints (optional): biga tends to be strength-oriented;
  // still compatible with neapolitan and some pan styles depending on your philosophy.
  if (pref === "biga") {
    // Example: allow neapolitan + teglia if you want. Tighten later.
    allowed = new Set([...allowed].filter(f => ["neapolitan","calzone","panzerotti","teglia","custom"].includes(f)));
  }

  return allowed;
}

function isPresetAllowedByDough(preset) {
  const allowed = getDoughAllowedFormats();
  const fmt = String(preset?.format || "custom").toLowerCase();
  return allowed.has(fmt);
}

  function renderOrders() {
  const root = $("#tab-orders");
  const allowedFormats = Array.from(getDoughAllowedFormats());
  const presetsAll = allPizzaPresets();
const presetsAllowed = presetsAll.filter(isPresetAllowedByDough);


  root.innerHTML = `
      <div class="card">
        <h2>Orders</h2>
        <p>Add people, then add pizzas. Everyone uses the same dough from Session. This tab is toppings + formats only.</p>
        <div class="small" style="margin-top:6px;">
          Dough constraint active: allowed pizza formats are <strong>${escapeHtml(allowedFormats.join(", "))}</strong>.
        </div>
      <div class="grid-2">
        <div>
          <label>Add person</label>
          <input id="newPersonName" placeholder="Name (e.g., Paolo)" />
        </div>
        <div style="display:flex; gap:10px; align-items:flex-end;">
          <button class="tab-btn" id="btnAddPerson" style="width:100%;">Add</button>
        </div>
      </div>
    </div>

    ${STATE.orders.length === 0 ? `
      <div class="card">
        <h3>No people yet</h3>
        <p>Add the first person to start taking orders.</p>
      </div>
    ` : ""}

    ${STATE.orders.map(person => `
      <div class="card" data-person="${person.id}">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div>
            <h3 style="margin:0;">${escapeHtml(person.name)}</h3>
            <div class="small" data-person-count="${person.id}">${person.pizzas.reduce((a,p)=>a+Number(p.qty||0),0)} pizza(s)</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="tab-btn" data-act="addPizza" data-person="${person.id}">Add pizza</button>
            <button class="tab-btn" data-act="removePerson" data-person="${person.id}" style="border-color:rgba(239,68,68,.35);">Remove person</button>
          </div>
        </div>

        ${person.pizzas.length === 0 ? `
          <div class="card" style="margin-top:12px;">
            <p>No pizzas yet. Click <strong>Add pizza</strong>.</p>
          </div>
        ` : ""}

        ${person.pizzas.map(pz => {
          const preset = getPreset(pz.presetId);
          const ingPreview = (preset.ingredients || []).slice(0, 4).map(i => i.name).join(", ");
          return `
            <div class="card" style="margin-top:12px;" data-pizza="${pz.id}">
              <div class="grid-2">
                <div>
                  <label>Pizza preset</label>
                  <select data-act="setPreset" data-person="${person.id}" data-pizza="${pz.id}">
                    ${presetsAllowed.map(pr => `
                      <option value="${pr.id}" ${pr.id === pz.presetId ? "selected" : ""}>
                        ${escapeHtml(pr.name)}
                      </option>
                    `).join("")}
                  </select>
                  <div class="small">Preview: ${escapeHtml(ingPreview || "—")}</div>
                </div>

                <div>
                  <label>Quantity <span class="dirty-indicator" data-dirty-for="qty-${person.id}-${pz.id}" hidden></span></label>
                  <input type="text" inputmode="numeric" data-numeric="true"
                    value="${escapeHtml(getInputDisplayValue(`qty-${person.id}-${pz.id}`, Number(pz.qty || 1)))}"
                    data-act="setQty" data-person="${person.id}" data-pizza="${pz.id}">
                  <div class="input-error" data-error-for="qty-${person.id}-${pz.id}" hidden></div>
                  <div class="small">This contributes to dough balls (min ${MIN_BALLS} total).</div>
                </div>
              </div>

              <div class="small" style="margin-top:8px;">
                Format: <strong>${escapeHtml(preset.format)}</strong>
              </div>

              <div style="margin-top:10px;">
                <button class="tab-btn" data-act="editToppings" data-person="${person.id}" data-pizza="${pz.id}">
                  Customize toppings
                </button>
                <button class="tab-btn" data-act="removePizza" data-person="${person.id}" data-pizza="${pz.id}"
                  style="border-color:rgba(239,68,68,.35); margin-left:8px;">
                  Remove pizza
                </button>
              </div>

              <div class="card" style="margin-top:10px;">
                <h3 style="margin:0 0 8px;">Toppings (this pizza)</h3>
                ${renderPizzaToppingsMini(pz, preset)}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `).join("")}
  `;

  // IMPORTANT: Bind these fresh each render (safe).
  // Add Person button
  $("#btnAddPerson").onclick = () => {
    const el = $("#newPersonName");
    addPerson(el.value);
    el.value = "";
    normalizeState();
    render();
  };

  // CRITICAL: prevent double-firing by using ONLY ONE delegated click handler.
  // If your old code added a root.addEventListener("click", ...) elsewhere, delete it.
  root.onclick = (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;

    const act = btn.dataset.act;
    const personId = btn.dataset.person;
    const pizzaId = btn.dataset.pizza;

    if (act === "addPizza") {
      addPizzaToPerson(personId);
      normalizeState();
      render();
      return;
    }

    if (act === "removePerson") {
      const person = STATE.orders.find(p => p.id === personId);
      if (!person) return;
      if (!confirm(`Remove ${person.name} and all their pizzas?`)) return;
      removePerson(personId);
      normalizeState();
      render();
      return;
    }

    if (act === "removePizza") {
      if (!confirm("Remove this pizza?")) return;
      removePizza(personId, pizzaId);
      normalizeState();
      render();
      return;
    }

    if (act === "editToppings") {
      openToppingsEditor(personId, pizzaId);
      return;
    }
  };

  // Delegated change handler (preset)
  root.onchange = (e) => {
    const act = e.target?.dataset?.act;
    if (!act) return;

    const personId = e.target.dataset.person;
    const pizzaId = e.target.dataset.pizza;

    const person = STATE.orders.find(p => p.id === personId);
    if (!person) return;
    const pizza = person.pizzas.find(p => p.id === pizzaId);
    if (!pizza) return;

    if (act === "setPreset") {
      pizza.presetId = e.target.value;
      const preset = getPreset(pizza.presetId);
      pizza.toppings = deepClone(preset.ingredients || []);
      saveState();
      normalizeState();
      render();
      return;
    }

  };

  $$('input[data-act="setQty"]', root).forEach((input) => {
    const personId = input.dataset.person;
    const pizzaId = input.dataset.pizza;
    bindNumericInput(input, {
      key: `qty-${personId}-${pizzaId}`,
      getValue: () => {
        const person = STATE.orders.find((p) => p.id === personId);
        const pizza = person?.pizzas.find((p) => p.id === pizzaId);
        return Number(pizza?.qty || 1);
      },
      setValue: (value) => {
        const person = STATE.orders.find((p) => p.id === personId);
        const pizza = person?.pizzas.find((p) => p.id === pizzaId);
        if (pizza) pizza.qty = clamp(value, 1, 30);
      },
      min: 1,
      max: 30,
      integer: true,
      onCommit: () => updateOrderCounts(personId)
    });
  });
}


  function computeToppingTotals() {
    const totals = {};
    for (const person of STATE.orders) {
      for (const pz of person.pizzas || []) {
        const preset = getPreset(pz.presetId);
        const tops = (Array.isArray(pz.toppings) && pz.toppings.length) ? pz.toppings : (preset.ingredients || []);
        const qty = Number(pz.qty || 1);

        for (const ing of tops) {
          const name = (ing.name || "").trim();
          if (!name) continue;
          const unit = (ing.unit || "g").trim();
          const q = Number(ing.quantity || 0);
          const rule = ing.scalingRule || "per_pizza";

          const factor = rule === "fixed_session" ? 1 : qty;

          const key = `${name.toLowerCase()}__${unit.toLowerCase()}`;
          if (!totals[key]) totals[key] = { name, unit, total: 0 };
          totals[key].total += q * factor;
        }
      }
    }
    return totals;
  }

  function renderShopping() {
    const root = $("#tab-shopping");
    const dough = computeDough();
    const ballsUsed = ensureMinimumBallLogic();
    const toppingTotals = computeToppingTotals();
    const flourType = flourTypeForDough(STATE.session);
    const flourItems = new Map();
    const yeastLabel = yeastTypeLabel(STATE.session?.formulaOverrides?.yeastType);

    const addFlourItem = (label, amount) => {
      if (!amount) return;
      const current = flourItems.get(label) || 0;
      flourItems.set(label, current + amount);
    };

    addFlourItem(flourType.label, dough.prefermentFlourG);
    addFlourItem(flourType.label, dough.finalFlourG);

    const flourList = Array.from(flourItems.entries())
      .map(([label, amount]) => `<li><strong>Flour (${escapeHtml(label)})</strong> — ${round(amount, 0)} g</li>`)
      .join("");

    root.innerHTML = `
      <div class="card">
        <h3>Dough (for ${ballsUsed} ball(s) × ${STATE.session.ballWeightG}g)</h3>
        <ul>
          ${flourList}
          <li><strong>Water</strong> — ${dough.waterG} g</li>
          <li><strong>Salt</strong> — ${dough.saltG} g</li>
          <li><strong>Honey</strong> — ${dough.honeyG} g</li>
          <li><strong>Yeast (${escapeHtml(yeastLabel)})</strong> — ${dough.yeastG} g</li>
        </ul>
        <div class="small">Preferment split: ${dough.prefermentFlourG}g (${escapeHtml(flourType.label)}) preferment flour, ${dough.finalFlourG}g (${escapeHtml(flourType.label)}) final-mix flour.</div>
      </div>

      <div class="card">
        <h3>Toppings (consolidated)</h3>
        ${Object.keys(toppingTotals).length === 0 ? `
          <p>No toppings yet. Add pizzas and select presets in Orders.</p>
        ` : `
          <ul>
            ${Object.values(toppingTotals)
              .sort((a,b)=>a.name.localeCompare(b.name))
              .map(x => `<li><strong>${escapeHtml(x.name)}</strong> — ${round(x.total, 0)} ${escapeHtml(x.unit)}</li>`)
              .join("")}
          </ul>
        `}
      </div>
    `;
  }

  function parseDTLocal(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
function safeStringify(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch { return String(obj); }
}

function pickTruthy(obj) {
  // Keeps "enabled/active" values without noise
  if (!obj || typeof obj !== "object") return obj;

  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;

    // keep false/0 because those can be meaningful
    out[k] = v;
  }
  return out;
}

// Derive the same timeline inputs your making planner uses.
// This avoids relying on internal locals that disappear after buildMakingCards().
function computeTimelineInputs() {
  const plan = getPlan();
  return {
    ovenId: STATE.session?.oven_id || null,
    ovenProgramId: STATE.session?.oven_program_id || null,
    timelineBlocks: plan.timelineBlocks || [],
    warnings: plan.warnings || []
  };
}

function getCanonicalInputsState() {
  return {
    session: deepClone(STATE.session || {}),
    orders: deepClone(STATE.orders || []),
    making: deepClone(STATE.making || {})
  };
}

function getDerivedOutputsSummary() {
  return {
    totals: {
      totalPeople: Array.isArray(STATE.orders) ? STATE.orders.length : 0,
      totalPizzas: (typeof totalPizzasFromOrders === "function") ? totalPizzasFromOrders() : null,
      ballsUsed: (typeof ensureMinimumBallLogic === "function") ? ensureMinimumBallLogic() : null
    },
    dough: (typeof computeDough === "function") ? computeDough() : null,
    timeline: computeTimelineInputs(),
    waterTempC: (typeof recommendWaterTempC === "function") ? recommendWaterTempC() : null
  };
}

function validateState() {
  const errors = [];
  const s = STATE.session || {};
  const planned = parseDTLocal(s.plannedEatTimeISO);

  if (!planned) errors.push("Planned time to eat is missing or invalid.");
  if (!s.oven_id) errors.push("Oven selection is missing.");

  const hydration = Number(s.formulaOverrides?.hydrationPct);
  if (!isFinite(hydration) || hydration < 50 || hydration > 90) {
    errors.push("Hydration % must be between 50 and 90.");
  }

  const salt = Number(s.formulaOverrides?.saltPct);
  if (!isFinite(salt) || salt < 1.5 || salt > 4) {
    errors.push("Salt % must be between 1.5 and 4.");
  }

  const honey = Number(s.formulaOverrides?.honeyPct);
  if (!isFinite(honey) || honey < 0 || honey > 3) {
    errors.push("Honey % must be between 0 and 3.");
  }

  const ballWeight = Number(s.ballWeightG);
  if (!isFinite(ballWeight) || ballWeight < 200) {
    errors.push("Ball weight must be at least 200g.");
  }

  const fermHours = Number(s.totalFermentationHours);
  const fermOptions = getFermentationHourOptions(s.prefermentType);
  if (!isFinite(fermHours) || !fermOptions.includes(fermHours)) {
    errors.push(`Fermentation hours must be ${fermOptions.join(", ")}.`);
  }

  (STATE.orders || []).forEach((person, personIndex) => {
    (person.pizzas || []).forEach((pz, pizzaIndex) => {
      const qty = Number(pz.qty);
      if (!isFinite(qty) || qty < 1) {
        errors.push(`Order ${personIndex + 1}, pizza ${pizzaIndex + 1} must have qty >= 1.`);
      }
    });
  });

  return errors;
}

function getDebugInfo() {
  return {
    canonicalInputs: getCanonicalInputsState(),
    lastChangedInputKey: LAST_CHANGED_INPUT_KEY,
    derivedOutputs: getDerivedOutputsSummary(),
    validationErrors: validateState()
  };
}

function renderDebugPanel() {
  const root = $("#debug-panel");
  if (!root) return;

  if (!STATE.debugMode) {
    root.innerHTML = "";
    root.classList.add("hidden");
    return;
  }

  const info = getDebugInfo();
  const errorsHtml = info.validationErrors.length
    ? `<ul>${info.validationErrors.map(err => `<li>${escapeHtml(err)}</li>`).join("")}</ul>`
    : `<div class="small">None</div>`;

  root.classList.remove("hidden");
  root.innerHTML = `
    <div class="card">
      <h2>Debug Mode</h2>
      <p>Live debug data updates as you edit inputs.</p>
    </div>
    <div class="card">
      <h3>Canonical Inputs (JSON)</h3>
      <pre class="small">${escapeHtml(safeStringify(info.canonicalInputs))}</pre>
    </div>
    <div class="card">
      <h3>Last-Changed Input Key</h3>
      <div class="small">${escapeHtml(info.lastChangedInputKey || "—")}</div>
    </div>
    <div class="card">
      <h3>Derived Outputs Summary</h3>
      <pre class="small">${escapeHtml(safeStringify(info.derivedOutputs))}</pre>
    </div>
    <div class="card">
      <h3>Validation Errors</h3>
      ${errorsHtml}
    </div>
  `;
}

function describeInputKey(target) {
  if (!target) return "unknown";
  if (target.dataset?.debugKey) return target.dataset.debugKey;
  if (target.id) return target.id;
  if (target.name) return target.name;
  if (target.dataset?.act) {
    const pid = target.dataset.pid ? `:${target.dataset.pid}` : "";
    const idx = target.dataset.idx ? `[${target.dataset.idx}]` : "";
    return `${target.dataset.act}${pid}${idx}`;
  }
  return target.tagName ? target.tagName.toLowerCase() : "unknown";
}

function renderDebug() {
  const root = $("#tab-debug");
  if (!root) return;

  const info = getDebugInfo();
  const errorsHtml = info.validationErrors.length
    ? `<ul>${info.validationErrors.map(err => `<li>${escapeHtml(err)}</li>`).join("")}</ul>`
    : `<div class="small">None</div>`;

  root.innerHTML = `
    <div class="card">
      <h2>Debug</h2>
      <p>Live debug data for inputs and derived outputs.</p>
    </div>

    <div class="card">
      <h3>Canonical Inputs (JSON)</h3>
      <pre class="small">${escapeHtml(safeStringify(info.canonicalInputs))}</pre>
    </div>

    <div class="card">
      <h3>Last-Changed Input Key</h3>
      <div class="small">${escapeHtml(info.lastChangedInputKey || "—")}</div>
    </div>

    <div class="card">
      <h3>Derived Outputs Summary</h3>
      <pre class="small">${escapeHtml(safeStringify(info.derivedOutputs))}</pre>
    </div>

    <div class="card">
      <h3>Validation Errors</h3>
      ${errorsHtml}
    </div>
  `;
}


  function buildMakingCards() {
  const plan = getPlan();
  const timeline = plan.timelineBlocks || [];

  if (!timeline.length) {
    return [{
      title: "Set an anchor time",
      subtitle: "Your timeline needs a valid Planned time to eat.",
      items: [{ time: "—", text: "Go to Session and set Planned time to eat." }]
    }];
  }

  const items = timeline.map((block) => ({
    time: isoToLocalInput(block.startISO).replace("T", " "),
    text: block.label
  }));

  return [{
    title: "Master Timeline (from plan)",
    subtitle: "Scheduled backward from your planned eat time.",
    items
  }];
}
/* ============================================================
   PIZZA MAKING — GUIDE ENGINE (Secret Sauce)
   - Turns STATE selections into a comprehensive step-by-step guide
   - Preferment-specific (direct/poolish/biga/sourdough)
   - Oven-specific (WFO vs Breville vs Home)
   - Style-specific (neapolitan/teglia/calzone/etc.)
   ============================================================ */

// --- Helpers ---
function cToF(c) { return (c * 9/5) + 32; }
function fmtC(c) { return `${round(c, 1)}°C`; }
function fmtF(f) { return `${round(f, 0)}°F`; }
function minutesToHuman(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function isWoodFiredSelected() {
  const ov = getSelectedOven();
  return (ov?.fuelType === "wood") || String(STATE.session?.oven_id || "").includes("wfo");
}

function isBrevilleSelected() {
  const ov = getSelectedOven();
  return (ov?.id || "").includes("breville") || (ov?.label || "").toLowerCase().includes("breville");
}

function getDominantOrderFormat() {
  // Uses your presets and qty to determine "what are we mainly making?"
  const counts = {};
  for (const person of (STATE.orders || [])) {
    for (const pz of (person.pizzas || [])) {
      const preset = getPreset(pz.presetId);
      const fmt = String(preset.format || "custom").toLowerCase();
      const qty = Number(pz.qty || 1);
      counts[fmt] = (counts[fmt] || 0) + qty;
    }
  }
  const entries = Object.entries(counts);
  if (!entries.length) return "neapolitan";
  entries.sort((a,b)=>b[1]-a[1]);
  return entries[0][0];
}

function formatTempRangeCFromF(range) {
  if (!Array.isArray(range)) return "—";
  const min = Number(range[0]);
  const max = Number(range[1]);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return "—";
  const toC = (f) => (f - 32) * 5/9;
  if (!Number.isFinite(max) || min === max) return `${round(toC(min), 0)}°C`;
  return `${round(toC(min), 0)}–${round(toC(max), 0)}°C`;
}

function formatOrderFormatLabel(format) {
  const fmt = String(format || "").toLowerCase();
  const map = {
    neapolitan: "Neapolitan Round",
    calzone: "Calzone",
    panzerotti: "Panzerotti",
    teglia: "Teglia / Pan",
    focaccia: "Focaccia",
    dessert: "Dessert",
    custom: "Custom"
  };
  return map[fmt] || fmt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFermentationLocationLabel(loc) {
  const key = String(loc || "").toLowerCase();
  const map = {
    fridge: "Cold",
    room: "Room",
    hybrid: "Hybrid"
  };
  return map[key] || "—";
}

function formatPrefermentLabel(prefType) {
  const pref = String(prefType || "NONE").toLowerCase();
  if (pref === "none") return "Direct";
  if (pref === "poolish") return "Poolish";
  if (pref === "biga") return "Biga";
  if (pref === "tiga") return "Tiga";
  if (pref === "poolish_biga_hybrid") return "Hybrid";
  if (pref === "sourdough") return "Starter";
  return pref.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildSessionSnapshot() {
  const d = STATE.session || {};
  const ov = getSelectedOven();
  const prog = getSelectedOvenProgram(ov);
  const method = getMethod(d.doughMethodId);

  const tempTargets = prog?.temp_targets_f && typeof prog.temp_targets_f === "object"
    ? prog.temp_targets_f
    : {};
  const topRange = formatTempRangeF(tempTargets.top || tempTargets.air);
  const floorRange = formatTempRangeF(tempTargets.deck);

  const prefLabel = formatPrefermentLabel(d.prefermentType);
  const fermHours = normalizeFermentationHours(d.totalFermentationHours, d.prefermentType);
  const hoursLabel = Number.isFinite(fermHours) ? `${fermHours}h` : "—";
  const locationLabel = formatFermentationLocationLabel(d.fermentationLocation);
  const methodLabel = method?.label || "—";
  const methodMeta = `${prefLabel} • ${hoursLabel} ${locationLabel}`;

  const format = getDominantOrderFormat();
  const styleLabel = formatOrderFormatLabel(format);
  const ballWeight = Number(d.ballWeightG);
  const ballWeightLabel = Number.isFinite(ballWeight) ? `${Math.round(ballWeight)}g` : "—";
  const showBallWeight = !["teglia", "focaccia"].includes(String(format || "").toLowerCase());
  const styleLine = showBallWeight ? `${styleLabel} • ${ballWeightLabel}` : styleLabel;

  const fermLoc = d.fermentationLocation || "FRIDGE";
  const fermTotal = Number(d.totalFermentationHours);
  let fermentationStatus = "—";
  if (String(fermLoc).toUpperCase() === "FRIDGE") fermentationStatus = "Cold fermented • Ready to bake";
  else if (String(fermLoc).toUpperCase() === "HYBRID") fermentationStatus = "Hybrid ferment • Tempering now";
  else if (Number.isFinite(fermTotal) && fermTotal <= 10) fermentationStatus = "Same-day dough • Time-sensitive";
  else if (String(fermLoc).toUpperCase() === "ROOM") fermentationStatus = "Room ferment • Bake same day";

  const honeyPct = Number(d.formulaOverrides?.honeyPct || 0);
  const hydrationPct = Number(d.formulaOverrides?.hydrationPct || 0);
  const prefType = String(d.prefermentType || "NONE").toLowerCase();
  const handlingNote = honeyPct > 0
    ? "Faster browning expected"
    : hydrationPct >= 70
      ? "High hydration — flour generously"
      : (prefType === "poolish" || prefType === "biga")
        ? "Gentle opening — preserve gas"
        : "";

  return `
    <div class="card making-temp-card">
      <h3 style="margin:0 0 10px;">Session Snapshot</h3>
      <div class="session-snapshot-grid">
        <div class="session-snapshot-temps">
          <div class="small">Oven Target Temps</div>
          <div class="session-snapshot-temp-block">
            <div class="session-snapshot-temp-label">Top</div>
            <div class="session-snapshot-temp-value">${escapeHtml(topRange || "—")}</div>
          </div>
          <div class="session-snapshot-temp-block">
            <div class="session-snapshot-temp-label">Floor</div>
            <div class="session-snapshot-temp-value">${escapeHtml(floorRange || "—")}</div>
          </div>
        </div>
        <div class="session-snapshot-details">
          <div>
            <div class="small">Dough Method</div>
            <div><strong>${escapeHtml(methodLabel || "—")}</strong></div>
            <div class="small">${escapeHtml(methodMeta || "—")}</div>
          </div>
          <div>
            <div class="small">Style</div>
            <div><strong>${escapeHtml(styleLine || "—")}</strong></div>
          </div>
          <div>
            <div class="small">Fermentation Status</div>
            <div><strong>${escapeHtml(fermentationStatus || "—")}</strong></div>
          </div>
          ${handlingNote ? `
            <div>
              <div class="small">Handling/Bake Note</div>
              <div><strong>${escapeHtml(handlingNote)}</strong></div>
            </div>
          ` : ""}
        </div>
      </div>
    </div>
  `;
}
function flourSpecForDough(d) {
  const pref = d.prefermentType || "NONE";
  const hours = normalizeFermentationHours(d.totalFermentationHours ?? d.fermentationHours, pref);
  const hyd = Number(d.formulaOverrides?.hydrationPct ?? d.hydrationPct ?? 63);
  const isCold =
    d.fermentationLocation === "FRIDGE" ||
    d.fermentationLocation === "HYBRID" ||
    d.fermentationMode === "DOUBLE";

  // Base assumptions
  let wMin = 260, wMax = 300;
  let proteinMin = 11.5;
  const notes = [];

  // Preferment-driven strength needs
  if (pref === "biga") {
    // Biga generally benefits from stronger flour (especially long or cold schedules)
    wMin = 300; wMax = 340;
    proteinMin = 13.0;
    notes.push("Biga benefits from stronger flour to hold structure over time.");
  } else if (pref === "poolish") {
    // Poolish tends to be more extensible; still can need strength if long/cold or high hydration
    wMin = 280; wMax = 320;
    proteinMin = 12.5;
    notes.push("Poolish increases extensibility; ensure enough strength to avoid slack dough.");
  } else if (pref === "sourdough") {
    wMin = 280; wMax = 340;
    proteinMin = 12.5;
    notes.push("Sourdough timing is variable; strength helps tolerate schedule drift.");
  } else {
    // direct
    wMin = 260; wMax = 300;
    proteinMin = 11.5;
  }

  // Schedule intensity adjustments
  if (hours >= 48) {
    wMin += 10; wMax += 10;
    proteinMin += 0.3;
    notes.push("Long fermentation (48h+) increases the need for flour strength.");
  } else if (hours >= 24 && isCold) {
    wMin += 10;
    notes.push("Cold schedules reduce speed but still demand gluten durability.");
  }

  // Hydration adjustments
  if (hyd >= 70) {
    wMin += 10; wMax += 10;
    proteinMin += 0.3;
    notes.push("High hydration (≥70%) benefits from stronger flour to maintain shape.");
  }

  // Clamp to sane upper bounds (avoid nonsense)
  wMin = clamp(wMin, 240, 380);
  wMax = clamp(wMax, wMin, 400);
  proteinMin = round(clamp(proteinMin, 10.5, 15.0), 1);

  const specText = `Use strong flour: W ${wMin}–${wMax} (protein ≥ ${proteinMin}%).`;

  // This is what we’ll inject into Shopping as an advisory line item
  const shoppingAdvisory = {
    name: "Flour specification (recommended)",
    detail: specText + (notes.length ? " " + notes.join(" ") : "")
  };

  return { wMin, wMax, proteinMin, notes, specText, shoppingAdvisory };
}

function flourTypeForDough(d) {
  const spec = flourSpecForDough(d);
  const wTarget = Math.round(((spec.wMin + spec.wMax) / 2) / 10) * 10;
  let descriptor = "moderate";
  if (wTarget >= 320) descriptor = "strong";
  else if (wTarget >= 300) descriptor = "medium-strong";
  return {
    wTarget,
    descriptor,
    label: `W${wTarget} (${descriptor})`
  };
}

function buildShoppingAdvisories() {
  const advisories = [];

  // Flour spec
  const flourSpec = flourSpecForDough(STATE.session || {});
  advisories.push(flourSpec.shoppingAdvisory);

  // Oven-related advisory example (optional)
  const ov = getSelectedOven();
  if (ov?.fuelType === "wood") {
    advisories.push({
      name: "Wood-fired oven note",
      detail: "Plan for active flame management during service; rotating frequently prevents scorching."
    });
  }

  return advisories;
}

// Optional: simple “flour strength hints” (you can replace with real W/protein later)
function flourStrengthGuidance(prefermentType, style) {
  // Not a calculator; it’s guidance copy keyed to what matters.
  if (prefermentType === "biga") {
    return {
      headline: "Flour strength requirement (Biga)",
      text:
        "Biga rewards strong flour. Choose a flour marketed for long fermentation / high strength (often higher protein and W). " +
        "Weak flour collapses, turns gummy, and loses structure during final mix."
    };
  }
  if (style === "teglia" || style === "focaccia") {
    return {
      headline: "Flour strength requirement (High hydration / Pan)",
      text:
        "High hydration pan styles need flour that can hold water and gas. If dough spreads flat and tears, the flour may be too weak or under-developed."
    };
  }
  return {
    headline: "Flour strength requirement",
    text:
      "Use a quality pizza flour suited to your fermentation time. Longer cold ferments generally benefit from stronger flour than same-day doughs."
  };
}

// --- Core: compute “facts” the guide will use ---
function computeGuideFacts() {
  const d = STATE.session || {};
  const plan = getPlan();
  const ov = getSelectedOven();
  const prog = getSelectedOvenProgram(ov);
  const dough = computeDough();
  const style = getDominantOrderFormat();
  const waterRec = recommendWaterTempC();

  const ingredientBreakdown = plan.ingredients;

  // Preferment split (flour-based)
  const prefType = ingredientBreakdown?.preferment?.type || "NONE";
  const totalFlour = Number(ingredientBreakdown?.totals?.flourG || 0);
  const prefFlourG = Number(ingredientBreakdown?.preferment?.flourG || 0);
  const prefPct = totalFlour ? prefFlourG / totalFlour : 0;
  const finalFlourG = Number(ingredientBreakdown?.finalMix?.flourG || 0);
  const prefWaterG = Number(ingredientBreakdown?.preferment?.waterG || 0);
  const finalWaterG = Number(ingredientBreakdown?.finalMix?.waterG || 0);

  // Oven cues
  const wood = isWoodFiredSelected();
  const breville = isBrevilleSelected();
  const bakeSec = Array.isArray(prog?.bake_time_seconds) ? prog.bake_time_seconds : null;

  return {
    style,
    dough,
    waterRec,
    ov,
    prog,
    wood,
    breville,

    prefType,
    prefPct,
    prefFlourG,
    prefWaterG,
    finalFlourG,
    finalWaterG,
    ingredientBreakdown,

    fermentationHours: normalizeFermentationHours(d.totalFermentationHours, d.prefermentType),
    fermentationLocation: d.fermentationLocation || "FRIDGE",
    mixingMethod: plan.mixerProfile?.mixer?.type || d.mixer_id || "hand",
    targetDDTC: Number(d.temperaturePlanning?.targetDDTC ?? 23),
    roomC: Number(d.temps?.roomTempC ?? 22),
    flourC: Number(d.temps?.flourTempC ?? 22),
    bakeSec
  };
}

// --- Step builder primitives ---
function step(title, body, meta = {}) {
  return { title, body, meta };
}
function chapter(title, subtitle, steps, warnings = []) {
  return { title, subtitle, steps, warnings };
}

// --- Chapter generators ---
function chapterOverview(f) {
  const d = STATE.session || {};
  const pizzaCount = totalPizzasFromOrders();
  const ballsUsed = ensureMinimumBallLogic();

  const ovenLine = f.ov ? `${f.ov.label || f.ov.id}` : "—";
  const programLine = f.prog ? `${f.prog.display_name || f.prog.id}` : "—";

  const warnings = [];
  if (pizzaCount === 0) warnings.push("No pizzas ordered yet. Add at least one pizza in Orders so the guide can tailor style and toppings.");
  if ((f.style === "teglia" || f.style === "focaccia") && f.wood && f.bakeSec && f.bakeSec[1] <= 150) {
    warnings.push("Your selected WFO program is a high-heat Neapolitan profile but your dominant style is pan/teglia. Either change program/approach or expect scorching risk.");
  }

  return chapter(
    "Overview",
    "This guide is generated from your Session + Orders selections.",
    [
      step("What you’re making (dominant style)", `Style detected: ${escapeHtml(f.style)}.`),
      step("Production quantities (global dough)", `Ordered pizzas: ${pizzaCount}. Dough balls used: ${ballsUsed} (min ${MIN_BALLS}). Ball weight: ${d.ballWeightG}g.`),
      step("Oven & setting", `Oven: ${escapeHtml(ovenLine)}. Setting: ${escapeHtml(programLine)}.`),
      step("Temperature discipline (Babi-style)", `Target DDT: ${fmtC(f.targetDDTC)}. Room: ${fmtC(f.roomC)}. Flour: ${fmtC(f.flourC)}. Recommended water temp: ${fmtC(f.waterRec)} (${fmtF(cToF(f.waterRec))}).`)
    ],
    warnings
  );
}

function chapterTemperatureDiscipline(f) {
  // This is your “Babi” layer: measurements, levers, how to correct.
  const steps = [];

  steps.push(step(
    "Measure before you touch the dough",
    "1) Measure room temp (ambient). 2) Measure flour temp (probe inserted into flour). 3) Confirm your target DDT. " +
    "DDT is the control knob that makes your fermentation predictable."
  ));

  steps.push(step(
    "Hit the water temperature",
    `Set your water to ${fmtC(f.waterRec)} (${fmtF(cToF(f.waterRec))}). Use a thermometer. ` +
    "If you overshoot, add ice or chill water; if you undershoot, warm water slightly."
  ));

  const friction = (f.mixingMethod === "halo") ? 5 : 2;
  steps.push(step(
    "Understand what changes the DDT",
    `Friction factor assumption: ~${friction}°C for ${escapeHtml(f.mixingMethod)}. If your finished dough temp is high, you either used warm water or mixed too aggressively/too long. ` +
    "If finished temp is low, your water was too cold or flour was very cold."
  ));

  steps.push(step(
    "Reality check after mix",
    "After mixing, probe the dough. If you miss DDT by more than ~1°C, note it. Next batch: adjust water temperature by the same magnitude (roughly) and/or reduce mix intensity."
  ));

  return chapter(
    "Temperature Discipline (Babi-style)",
    "DDT is the predictability system: measure, target, verify.",
    steps
  );
}

function chapterPreferment(f) {
  const warnings = [];
  const steps = [];

  // Flour strength guidance appears here because it matters most for preferments
  const flourHint = flourStrengthGuidance(f.prefType, f.style);
  steps.push(step(flourHint.headline, flourHint.text));

  if (f.prefType === "direct" || f.prefPct === 0) {
    steps.push(step(
      "Direct dough selected",
      "No preferment will be built. You will mix full flour and water in one dough. Proceed to Mixing."
    ));
    return chapter("Preferment / Starter", "Skipped (direct dough).", steps, warnings);
  }

  if (f.prefType === "poolish") {
    steps.push(step(
      "Poolish formula (from your session values)",
      `Poolish flour: ${f.prefFlourG}g. Poolish water (100% hydration): ${f.prefWaterG}g. ` +
      "Mix until smooth; no dry pockets."
    ));
    steps.push(step(
      "How to mix poolish properly",
      "Use room-temp water unless your schedule requires slowing it. Add water first, then flour. Stir to a thick batter. Scrape sides. Cover loosely."
    ));
    steps.push(step(
      "When is poolish ready",
      "Look for: domed surface, many bubbles, aerated structure, and the start of flattening at the center. " +
      "Use it at peak—not collapsed. The clock is secondary to maturity."
    ));
  }

  if (f.prefType === "biga") {
    steps.push(step(
      "Biga formula (from your session values)",
      `Biga flour: ${f.prefFlourG}g. Biga water (~55% hydration): ${f.prefWaterG}g. ` +
      "Goal: a shaggy, dryish mass. No smooth dough ball."
    ));
    steps.push(step(
      "How to add water (biga technique)",
      "Start with flour in the bowl. Add water gradually while mixing on low (or by hand with a fork). " +
      "Stop as soon as the flour is hydrated into clumps. You are not developing gluten here; you are hydrating flour particles."
    ));
    steps.push(step(
      "What a correct biga looks like",
      "Texture: shaggy, clumpy, coarse, slightly dry. If it becomes smooth like final dough, you added too much water or overmixed."
    ));
    steps.push(step(
      "How to judge biga maturity",
      "Ready signs: expanded volume, aromatic smell (sweet/fermented), visible internal webbing when pulled apart. " +
      "Overripe signs: collapse, sour sharp odor, wet smear, or excessive proteolysis (mushy strands)."
    ));
  }

  if (f.prefType === "sourdough") {
    steps.push(step(
      "Sourdough selected",
      "Your timing depends on starter strength and temperature. The correct target is: starter/levain peaks at your final mix time."
    ));
    steps.push(step(
      "Feeding plan (principle)",
      "Feed so the starter peaks when you need it. If it peaks too early, reduce temperature or inoculation. If it peaks too late, warm it or increase inoculation."
    ));
    steps.push(step(
      "Peak signals",
      "Look for: maximum rise, rounded top beginning to flatten, airy texture, pleasant lactic aroma. Use it before it collapses."
    ));
  }

  // A generic “schedule note”
  steps.push(step(
    "Timing note",
    `You selected ${f.fermentationHours}h total fermentation. Preferments should be scheduled so they reach maturity at final mix time, not “whenever the clock hits.”`
  ));

  return chapter("Preferment / Starter", "Build the preferment correctly; it sets flavor and structure.", steps, warnings);
}

function chapterMixing(f) {
  const steps = [];

  const method = f.mixingMethod === "halo" ? "Halo / planetary" : "hand";
  steps.push(step("Mixing goal", `Goal: development without overheating. Mixing method: ${escapeHtml(method)}.`));

  if (f.prefType !== "direct" && f.prefPct > 0) {
    steps.push(step(
      "Final mix split (from your session values)",
      `Final flour: ${f.finalFlourG}g. Final water: ${f.finalWaterG}g. ` +
      "Preferment is incorporated during final mix."
    ));
  } else {
    steps.push(step(
      "Single mix quantities",
      `Flour: ${f.dough.flourG}g. Water: ${f.dough.waterG}g. Salt: ${f.dough.saltG}g. Honey: ${f.dough.honeyG}g.`
    ));
  }

  steps.push(step(
    "Water first, then flour (controlled hydration)",
    "Add most water first. Add flour while mixing until shaggy. Rest 10–20 minutes (short autolyse) if you want easier development. " +
    "Hold back a little water to adjust if dough looks tight."
  ));

  steps.push(step(
    "Salt timing",
    "Add salt after initial incorporation (or after short rest). Salt tightens gluten; adding too early can slow hydration and make mixing harder."
  ));

  if (Number(STATE.session?.formulaOverrides?.honeyPct || 0) > 0) {
    steps.push(step(
      "Honey (optional)",
      "Add honey with water (it dissolves more cleanly). Honey can enhance browning, especially in home ovens; watch color in high-heat WFO."
    ));
  }

  steps.push(step(
    "DDT checkpoint",
    `After mix, probe dough temperature. Target is ${fmtC(f.targetDDTC)}. If you’re high, shorten mixing and lower water temp next time; if low, raise water temp.`
  ));

  return chapter("Mixing", "Build structure; control temperature.", steps);
}

function chapterFermentationAndBalling(f) {
  const d = STATE.session || {};
  const steps = [];

  steps.push(step(
    "Fermentation strategy",
    `Location: ${escapeHtml(f.fermentationLocation)}. Total time: ${f.fermentationHours}h. ` +
    "Remember: time + temperature = fermentation speed."
  ));

  const fermLoc = String(f.fermentationLocation || "").toUpperCase();
  if (fermLoc === "FRIDGE") {
    steps.push(step(
      "Cold fermentation (predictability mode)",
      "After mixing, rest briefly at room temp if desired, then refrigerate well covered. " +
      "Cold gives schedule control; flavor develops slowly."
    ));
  } else if (fermLoc === "HYBRID") {
    steps.push(step(
      "Hybrid fermentation",
      "Start at room temp to wake the dough, then move cold to stabilize. " +
      "Use this when you want activity plus scheduling reliability."
    ));
  } else if (fermLoc === "DOUBLE") {
    steps.push(step(
      "Double fermentation",
      "Start at room temp for activity, move cold for flavor and control, then finish at room temp so the dough is bake-ready."
    ));
  } else {
    steps.push(step(
      "Room fermentation",
      "Watch the dough—room temp is faster and more variable. Use container markings and dough cues, not just the clock."
    ));
  }

  steps.push(step(
    "When to ball",
    "Ball when the dough has enough strength and gas to hold shape without tearing. Over-balled too early can tighten; too late can degas and weaken."
  ));

  steps.push(step(
    "Balling technique (surface tension)",
    `Target ball weight: ${Number(d.ballWeightG || 260)}g. Use minimal flour. Create a smooth skin with tension; seal underneath.`
  ));

  steps.push(step(
    "Final proof / temper",
    "Before shaping, temper dough until extensible. If dough is cold and tight, you will tear it and lose rim gas."
  ));

  return chapter("Fermentation & Balling", "Time + temperature + handling create predictability.", steps);
}

function chapterShapingAndBake(f) {
  const steps = [];
  const warnings = [];

  // Style-specific shaping + bake
  if (f.style === "neapolitan") {
    steps.push(step(
      "Shaping (Neapolitan)",
      "Open from the center outward. Keep the rim inflated. No rolling pin. If it resists, rest 5–10 minutes and continue."
    ));
  } else if (f.style === "teglia" || f.style === "focaccia") {
    steps.push(step(
      "Pan shaping (Teglia/Focaccia)",
      "Oil the pan generously. Stretch gently in stages. If it shrinks back, rest 10–15 minutes and continue. Dimple to preserve bubbles."
    ));
  } else if (f.style === "calzone" || f.style === "panzerotti") {
    steps.push(step(
      "Shaping (Calzone/Panzerotti)",
      "Open round, add controlled filling, seal aggressively. Avoid overfilling. Consider venting to prevent blowouts."
    ));
  } else {
    steps.push(step(
      "Shaping (General)",
      "Handle gently to preserve gas. If it tears easily, it may be over-fermented or under-developed."
    ));
  }

  // Oven-specific firing/bake
  if (f.wood) {
    steps.push(step(
      "Wood-fired oven management (Iacopelli-style control)",
      "You are managing flame + deck + dome. The goal is repeatable bakes, not one big spike. Maintain a live flame for top heat, but don’t scorch the rim."
    ));

    steps.push(step(
      "Dome browning technique (only in WFO)",
      "Use the dome roof as a browning tool: launch, then lift the pizza slightly toward the dome briefly to set and color the top without burning the bottom. Rotate frequently to avoid hot-spot scorching."
    ));

    if (f.bakeSec) {
      steps.push(step(
        "Bake targets (from setting)",
        `Target bake time: ${f.bakeSec[0]}–${f.bakeSec[1]} seconds. Rotation strategy: ${escapeHtml(f.prog?.rotation_strategy || "as needed")}. Launch method: ${escapeHtml(f.prog?.launch_method || "on deck")}.`
      ));
    } else {
      steps.push(step(
        "Bake targets",
        "Use visual cues: leopard spotting, set rim, underside with controlled char. Rotate frequently."
      ));
    }

    if ((f.style === "teglia" || f.style === "focaccia") && f.bakeSec && f.bakeSec[1] <= 150) {
      warnings.push("Teglia/Focaccia with a Neapolitan high-heat program is high risk for scorching. You likely need reduced flame/indirect zone and longer bake.");
    }
  } else if (f.breville) {
    steps.push(step(
      "Breville workflow (no dome maneuver)",
      "Preheat fully to saturate the deck. You don’t have a dome browning tool; browning comes from top element balance and time. Launch cleanly; rotate only if needed."
    ));
    steps.push(step(
      "Avoid WFO habits that don’t translate",
      "Do not attempt dome-lift browning; focus on correct program selection, preheat saturation, and topping management."
    ));
  } else {
    steps.push(step(
      "Home oven workflow",
      "Steel/stone must be fully saturated. Longer bakes mean moisture management matters: go lighter on sauce/cheese, and use broiler briefly if top lags."
    ));
  }

  steps.push(step(
    "Post-bake finishing",
    "Finish with oil, basil, parm, oregano, etc. Slice after a brief rest if it’s a pan pizza; slice immediately for Neapolitan."
  ));

  return chapter("Shaping, Bake & Finish", "Style-aware shaping + oven-aware bake execution.", steps, warnings);
}

// --- Assemble the guide ---
function buildPizzaMakingGuide() {
  const f = computeGuideFacts();

  const chapters = [
    chapterOverview(f),
    chapterTemperatureDiscipline(f),
    chapterPreferment(f),
    chapterMixing(f),
    chapterFermentationAndBalling(f),
    chapterShapingAndBake(f)
  ];

  return { facts: f, chapters };
}


function renderMaking() {
  const root = $("#tab-making");
  const plan = getPlan();
  const timeline = plan.timelineBlocks || [];
  const ingredients = plan.ingredients;
  const oven = plan.ovenProfile?.oven;
  const program = plan.ovenProfile?.program;

  const timelineItems = timeline.length
    ? timeline.map((block) => `
        <li><strong>${escapeHtml(block.label)}</strong> — ${escapeHtml(isoToLocalInput(block.startISO).replace("T", " "))}</li>
      `).join("")
    : "<li>No timeline available. Check your planned eat time.</li>";

  root.innerHTML = `
    <div class="card">
      <h2>Pizzaiolo Plan</h2>
      <div class="small">Derived from your Session selections.</div>
    </div>

    <div class="card">
      <h3>Equipment</h3>
      <div class="small">Oven: ${escapeHtml(oven?.label || oven?.id || "—")}</div>
      <div class="small">Program: ${escapeHtml(program?.display_name || program?.id || "—")}</div>
    </div>

    <div class="card">
      <h3>Timeline</h3>
      <ul>${timelineItems}</ul>
    </div>

    <div class="card">
      <h3>Ingredient Totals</h3>
      ${ingredients ? `
        <div class="kpi">
          <div class="box"><div class="small">Flour</div><div class="v">${ingredients.totals.flourG} g</div></div>
          <div class="box"><div class="small">Water</div><div class="v">${ingredients.totals.waterG} g</div></div>
          <div class="box"><div class="small">Salt</div><div class="v">${ingredients.totals.saltG} g</div></div>
          <div class="box"><div class="small">Honey</div><div class="v">${ingredients.totals.honeyG} g</div></div>
          <div class="box"><div class="small">Yeast</div><div class="v">${ingredients.totals.yeastG} g</div></div>
        </div>
      ` : `<div class="small">Using existing dough; ingredient totals are not computed.</div>`}
    </div>
  `;
  return;
  const cards = buildMakingCards();

  const d = STATE.session || {};
  const dough = computeDough();
  const ingredientBreakdown = PizzaCalc.computeIngredientBreakdown({
    totals: {
      flour: dough.flourG,
      water: dough.waterG,
      salt: dough.saltG,
      honey: dough.honeyG,
      yeast: dough.yeastG
    },
    prefermentType: d.prefermentType || "direct",
    prefermentPct: Number(d.prefermentPct || 0)
  });
  const flourSpec = flourSpecForDough(d);
  const flourType = flourTypeForDough(d);
  const ov = getSelectedOven();
  const prog = getSelectedOvenProgram(ov);

  const measured = STATE.making?.measured || {};
  const liveWaterRec = recommendWaterTempC();

  const prefType = ingredientBreakdown.preferment.type;
  const hasPref = prefType && prefType !== "direct" && ingredientBreakdown.preferment.totalMass > 0;
  const prefermentLabel =
    prefType === "poolish" ? "Poolish" :
    prefType === "biga" ? "Biga" :
    prefType === "sourdough" ? "Starter" :
    "Preferment";

  const ingredientBox = (label, value, detail) => `
    <div class="box">
      <div class="small">${escapeHtml(label)}</div>
      <div class="v" style="font-size:34px;">${value} g</div>
      ${detail ? `<div class="small ingredient-note">${escapeHtml(detail)}</div>` : ""}
    </div>
  `;

  const waterTempDetail = `Target water temp: ${liveWaterRec} °C`;
  const flourTypeDetail = flourType.label;
  const yeastDetail = yeastTypeLabel(d.yeastType);

  const weighOutTotals = `
    <div class="card">
      <h3>Weigh Out Ingredients (Total Dough)</h3>
      <div class="kpi" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
        ${ingredientBox("FLOUR", ingredientBreakdown.totals.flour)}
        ${ingredientBox("WATER", ingredientBreakdown.totals.water)}
        ${ingredientBox("SALT", ingredientBreakdown.totals.salt)}
        ${ingredientBox("HONEY", ingredientBreakdown.totals.honey)}
        ${ingredientBox("Yeast", ingredientBreakdown.totals.yeast, yeastDetail)}
      </div>
    </div>
  `;

  const prefermentStepAItems = [
    ingredientBox("Flour", ingredientBreakdown.preferment.flour, flourTypeDetail),
    ingredientBox("Water", ingredientBreakdown.preferment.water, waterTempDetail),
    ingredientBreakdown.preferment.honey > 0 ? ingredientBox("HONEY", ingredientBreakdown.preferment.honey) : "",
    ingredientBreakdown.preferment.yeast > 0 ? ingredientBox("Yeast", ingredientBreakdown.preferment.yeast, yeastDetail) : ""
  ].join("");

  const sourdoughCompositionItems = [
    ingredientBreakdown.preferment.flour > 0 ? ingredientBox("Flour", ingredientBreakdown.preferment.flour, flourTypeDetail) : "",
    ingredientBreakdown.preferment.water > 0 ? ingredientBox("Water", ingredientBreakdown.preferment.water, waterTempDetail) : "",
    ingredientBreakdown.preferment.honey > 0 ? ingredientBox("HONEY", ingredientBreakdown.preferment.honey) : "",
    ingredientBreakdown.preferment.yeast > 0 ? ingredientBox("Yeast", ingredientBreakdown.preferment.yeast, yeastDetail) : ""
  ].join("");

  const prefermentStepA = prefType === "sourdough"
    ? `
      <div class="card">
        <h3>Step A — Prepare/Use Starter</h3>
        <div class="kpi" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
          ${ingredientBox("ACTIVE STARTER TO USE", ingredientBreakdown.preferment.totalMass)}
        </div>
        ${sourdoughCompositionItems ? `
          <div class="small" style="margin-top:10px;">
            Starter composition (assumes 100% hydration):
          </div>
          <div class="kpi" style="grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top:10px;">
            ${sourdoughCompositionItems}
          </div>
        ` : ""}
      </div>
    `
    : `
      <div class="card">
        <h3>Step A — Make the ${escapeHtml(prefermentLabel)}</h3>
        <div class="kpi" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
          ${prefermentStepAItems}
        </div>
      </div>
    `;

  const finalMixItems = [
    ingredientBox("Flour", ingredientBreakdown.finalMix.flour, flourTypeDetail),
    ingredientBox("Water", ingredientBreakdown.finalMix.water, waterTempDetail),
    ingredientBox("SALT", ingredientBreakdown.finalMix.salt),
    ingredientBreakdown.finalMix.honey > 0 ? ingredientBox("HONEY", ingredientBreakdown.finalMix.honey) : "",
    ingredientBreakdown.finalMix.yeast > 0 ? ingredientBox("Yeast", ingredientBreakdown.finalMix.yeast, yeastDetail) : ""
  ].join("");

  const prefermentStepB = `
    <div class="card">
      <h3>Step B — Final Dough Mix</h3>
      <div class="small" style="margin-bottom:10px;">
        Add preferment/starter: <strong>${ingredientBreakdown.finalMix.addPrefermentMass} g</strong>
      </div>
      <div class="kpi" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
        ${finalMixItems}
      </div>
    </div>
  `;

  const totalsReference = `
    <div class="card">
      <details>
        <summary><strong>Totals (reference)</strong></summary>
        <div class="kpi" style="grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top:12px;">
          ${ingredientBox("FLOUR", ingredientBreakdown.totals.flour)}
          ${ingredientBox("WATER", ingredientBreakdown.totals.water)}
          ${ingredientBox("SALT", ingredientBreakdown.totals.salt)}
          ${ingredientBox("HONEY", ingredientBreakdown.totals.honey)}
          ${ingredientBox("Yeast", ingredientBreakdown.totals.yeast, yeastDetail)}
        </div>
      </details>
    </div>
  `;

  const ingredientWarnings = ingredientBreakdown.errors.length
    ? `
      <div class="card" style="border:1px solid rgba(239,68,68,.6);">
        <h3>Ingredient split warning</h3>
        <ul class="small" style="margin:8px 0 0 16px;">
          ${ingredientBreakdown.errors.map((msg) => `<li>${escapeHtml(msg)}</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  const measureNowCard = `
    <div class="card">
      <h3>Measure Now (Live Temps)</h3>

      <div class="grid-2">
        <div>
          <label>Measured room temp (°C) <span class="dirty-indicator" data-dirty-for="mk_roomC" hidden></span></label>
          <input type="text" inputmode="decimal" data-numeric="true" id="mk_roomC"
            value="${escapeHtml(getInputDisplayValue("mk_roomC", isFiniteNumber(measured.roomC) ? measured.roomC : ""))}" placeholder="e.g., 24.0" />
          <div class="input-error" data-error-for="mk_roomC" hidden></div>
        </div>
        <div>
          <label>Measured flour temp (°C) <span class="dirty-indicator" data-dirty-for="mk_flourC" hidden></span></label>
          <input type="text" inputmode="decimal" data-numeric="true" id="mk_flourC"
            value="${escapeHtml(getInputDisplayValue("mk_flourC", isFiniteNumber(measured.flourC) ? measured.flourC : ""))}" placeholder="e.g., 22.0" />
          <div class="input-error" data-error-for="mk_flourC" hidden></div>
        </div>

        <div>
          <label>Measured water temp (°C) <span class="dirty-indicator" data-dirty-for="mk_waterC" hidden></span></label>
          <input type="text" inputmode="decimal" data-numeric="true" id="mk_waterC"
            value="${escapeHtml(getInputDisplayValue("mk_waterC", isFiniteNumber(measured.waterC) ? measured.waterC : ""))}" placeholder="optional" />
          <div class="input-error" data-error-for="mk_waterC" hidden></div>
        </div>
        <div>
          <label>Measured dough temp (°C) <span class="dirty-indicator" data-dirty-for="mk_doughC" hidden></span></label>
          <input type="text" inputmode="decimal" data-numeric="true" id="mk_doughC"
            value="${escapeHtml(getInputDisplayValue("mk_doughC", isFiniteNumber(measured.doughC) ? measured.doughC : ""))}" placeholder="after mix" />
          <div class="input-error" data-error-for="mk_doughC" hidden></div>
        </div>

        <div>
          <label>Measured counter temp (°C) <span class="dirty-indicator" data-dirty-for="mk_counterC" hidden></span></label>
          <input type="text" inputmode="decimal" data-numeric="true" id="mk_counterC"
            value="${escapeHtml(getInputDisplayValue("mk_counterC", isFiniteNumber(measured.counterC) ? measured.counterC : ""))}" placeholder="optional" />
          <div class="input-error" data-error-for="mk_counterC" hidden></div>
        </div>

        <div>
          <label>Target DDT (°C) <span class="dirty-indicator" data-dirty-for="mk_targetDDT" hidden></span></label>
          <input type="text" inputmode="decimal" data-numeric="true" id="mk_targetDDT"
            value="${escapeHtml(getInputDisplayValue("mk_targetDDT", Number(d.temps?.targetDDTC ?? 23)))}" />
          <div class="input-error" data-error-for="mk_targetDDT" hidden></div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <div class="small">Recommended water temperature (DDT-based)</div>
        <div class="v" style="font-size:44px; line-height:1; margin-top:6px;">
          <span id="making-water-rec">${liveWaterRec}</span> °C
        </div>
        <div class="small" style="margin-top:8px;">
          Uses measured room/flour if entered; otherwise uses Session temps. Mixer friction from selected mixer.
        </div>
      </div>

      <div class="small" style="margin-top:10px;">
        Oven: <strong>${escapeHtml(ov?.label || "—")}</strong>
        ${prog ? ` • Setting: <strong>${escapeHtml(prog.display_name || prog.id)}</strong>` : ""}
      </div>
    </div>
  `;

  const makingSummary = `
    ${ingredientWarnings}
    ${hasPref ? prefermentStepA + prefermentStepB + totalsReference : weighOutTotals}
    ${hasPref ? `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin:0 0 10px;">Preferment Split (Flour)</h3>
          <div class="kpi" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
            <div class="box">
              <div class="small">${escapeHtml(prefType.toUpperCase())} FLOUR</div>
              <div class="v" style="font-size:28px;">${dough.prefermentFlourG} g</div>
            </div>
            <div class="box">
              <div class="small">FINAL MIX FLOUR</div>
              <div class="v" style="font-size:28px;">${dough.finalFlourG} g</div>
            </div>
            <div class="box">
              <div class="small">PREFERMENT %</div>
              <div class="v" style="font-size:28px;">${Number(d.prefermentPct || 0)}%</div>
            </div>
          </div>
          <div class="small" style="margin-top:10px;">
            Preferment type: <strong>${escapeHtml(prefType)}</strong>
          </div>
        </div>
      ` : ``}
  `;

  root.innerHTML = `
    ${buildSessionSnapshot()}

    ${measureNowCard}
    ${makingSummary}

    ${cards.map(c => `
      <div class="card">
        <h3>${escapeHtml(c.title)}</h3>
        <div class="small">${escapeHtml(c.subtitle)}</div>
        <div style="margin-top:10px;">
          ${c.items.map(it => `
            <div class="card" style="margin:10px 0; background:rgba(0,0,0,.22);">
              <div class="small"><strong>${escapeHtml(it.time)}</strong></div>
              <div style="margin-top:6px;">${escapeHtml(it.text)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;

  // Wiring: update measured values on commit
  bindNumericInput($("#mk_roomC"), {
    key: "mk_roomC",
    getValue: () => measured.roomC,
    setValue: (value) => { STATE.making.measured.roomC = value; },
    allowEmpty: true,
    onCommit: updateMakingOutputs
  });
  bindNumericInput($("#mk_flourC"), {
    key: "mk_flourC",
    getValue: () => measured.flourC,
    setValue: (value) => { STATE.making.measured.flourC = value; },
    allowEmpty: true,
    onCommit: updateMakingOutputs
  });
  bindNumericInput($("#mk_waterC"), {
    key: "mk_waterC",
    getValue: () => measured.waterC,
    setValue: (value) => { STATE.making.measured.waterC = value; },
    allowEmpty: true,
    onCommit: updateMakingOutputs
  });
  bindNumericInput($("#mk_doughC"), {
    key: "mk_doughC",
    getValue: () => measured.doughC,
    setValue: (value) => { STATE.making.measured.doughC = value; },
    allowEmpty: true,
    onCommit: updateMakingOutputs
  });
  bindNumericInput($("#mk_counterC"), {
    key: "mk_counterC",
    getValue: () => measured.counterC,
    setValue: (value) => { STATE.making.measured.counterC = value; },
    allowEmpty: true,
    onCommit: updateMakingOutputs
  });

  bindNumericInput($("#mk_targetDDT"), {
    key: "mk_targetDDT",
    getValue: () => Number(STATE.session?.temperaturePlanning?.targetDDTC ?? 23),
    setValue: (value) => { if (STATE.session) STATE.session.temperaturePlanning.targetDDTC = value; },
    onCommit: () => {
      updateSessionOutputs();
      updateMakingOutputs();
    }
  });
}


  function presetCardHtml(p, isBase) {
    const preview = (p.ingredients || []).slice(0, 5).map((i) => i.name).filter(Boolean).join(", ");
    return `
      <div class="card" style="background:rgba(0,0,0,.20);">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div>
            <h3 style="margin:0;">${escapeHtml(p.name)}</h3>
            <div class="small">Format: <strong>${escapeHtml(p.format)}</strong></div>
            <div class="small">Preview: ${escapeHtml(preview || "—")}</div>
          </div>
          <div style="display:flex; gap:8px;">
            ${isBase ? `<span class="small">Base</span>` : `
              <button class="tab-btn" data-act="addIng" data-pid="${p.id}">Add ingredient</button>
              <button class="tab-btn" data-act="delete" data-pid="${p.id}" style="border-color:rgba(239,68,68,.35);">Delete</button>
            `}
          </div>
        </div>

        ${isBase ? "" : `
          <div class="grid-2" style="margin-top:10px;">
            <div>
              <label>Name</label>
              <input data-act="name" data-pid="${p.id}" value="${escapeHtml(p.name)}">
            </div>
            <div>
              <label>Format</label>
              <select data-act="format" data-pid="${p.id}">
                ${["neapolitan","calzone","panzerotti","teglia","focaccia","dessert","custom"].map(f =>
                  `<option value="${f}" ${p.format===f?"selected":""}>${f}</option>`
                ).join("")}
              </select>
            </div>
          </div>

          <div style="margin-top:12px;">
            <h3 style="margin:0 0 8px;">Ingredients</h3>
            ${(p.ingredients || []).map((ing, idx) => `
              <div class="grid-2" style="margin:10px 0;">
                <div>
                  <label>Name</label>
                  <input data-act="ing_name" data-pid="${p.id}" data-idx="${idx}" value="${escapeHtml(ing.name)}" />
                </div>
                <div>
                  <label>Quantity <span class="dirty-indicator" data-dirty-for="ing-${p.id}-${idx}" hidden></span></label>
                  <input type="text" inputmode="decimal" data-numeric="true" data-act="ing_qty" data-pid="${p.id}" data-idx="${idx}"
                    value="${escapeHtml(getInputDisplayValue(`ing-${p.id}-${idx}`, Number(ing.quantity || 0)))}" />
                  <div class="input-error" data-error-for="ing-${p.id}-${idx}" hidden></div>
                </div>
                <div>
                  <label>Unit</label>
                  <select data-act="ing_unit" data-pid="${p.id}" data-idx="${idx}">
                    ${["g","ml"].map(u => `<option value="${u}" ${ing.unit===u?"selected":""}>${u}</option>`).join("")}
                  </select>
                </div>
                <div>
                  <label>Timing</label>
                  <select data-act="ing_time" data-pid="${p.id}" data-idx="${idx}">
                    ${["before","after","split"].map(t => `<option value="${t}" ${ing.bakeTiming===t?"selected":""}>${t}</option>`).join("")}
                  </select>
                </div>
                <div>
                  <label>Scaling</label>
                  <select data-act="ing_rule" data-pid="${p.id}" data-idx="${idx}">
                    ${["per_pizza","fixed_session"].map(r => `<option value="${r}" ${ing.scalingRule===r?"selected":""}>${r}</option>`).join("")}
                  </select>
                </div>
              </div>
            `).join("")}
          </div>
        `}
      </div>
    `;
  }

  function renderPresets() {
    const root = $("#tab-presets");
    const custom = loadCustomPizzaPresets();

    root.innerHTML = `
      <div class="card">
        <h3>Create new preset</h3>
        <div class="grid-2">
          <div>
            <label>Name</label>
            <input id="presetName" placeholder="e.g., White pie — mushroom" />
          </div>
          <div>
            <label>Format</label>
            <select id="presetFormat">
              <option value="neapolitan">Neapolitan round</option>
              <option value="calzone">Calzone</option>
              <option value="panzerotti">Panzerotti</option>
              <option value="teglia">Bonci-style teglia / pan</option>
              <option value="focaccia">Focaccia</option>
              <option value="dessert">Dessert pizza</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
        <button class="tab-btn" id="btnCreatePreset" style="margin-top:10px;">Create</button>
      </div>

      <div class="card">
        <h3>Base presets (immutable)</h3>
        ${BASE_PIZZA_PRESETS.map((p) => presetCardHtml(p, true)).join("")}
      </div>

      <div class="card">
        <h3>Custom presets</h3>
        ${custom.length === 0 ? `<p>No custom presets yet.</p>` : custom.map((p) => presetCardHtml(p, false)).join("")}
      </div>
    `;

    $("#btnCreatePreset").onclick = () => {
      const name = ($("#presetName").value || "").trim();
      const format = $("#presetFormat").value;
      if (!name) return alert("Name is required.");

      const id = cryptoSafeId("preset");
      const newPreset = { id, name, format, image: "", ingredients: [] };

      const list = loadCustomPizzaPresets();
      list.push(newPreset);
      saveCustomPizzaPresets(list);
      render();
    };

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.dataset.act;
      const pid = btn.dataset.pid;
      if (!pid) return;

      if (act === "delete") {
        if (isBasePreset(pid)) return;
        if (!confirm("Delete this custom preset?")) return;
        const list = loadCustomPizzaPresets().filter((p) => p.id !== pid);
        saveCustomPizzaPresets(list);
        render();
      }

      if (act === "addIng") {
        if (isBasePreset(pid)) return;
        const list = loadCustomPizzaPresets();
        const p = list.find((x) => x.id === pid);
        if (!p) return;
        p.ingredients.push({ name: "", quantity: 0, unit: "g", bakeTiming: "before", scalingRule: "per_pizza", notes: "" });
        saveCustomPizzaPresets(list);
        render();
      }
    });

    root.addEventListener("change", (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      const pid = e.target.dataset.pid;
      if (!pid || isBasePreset(pid)) return;

      const list = loadCustomPizzaPresets();
      const p = list.find((x) => x.id === pid);
      if (!p) return;

      if (act === "name") p.name = e.target.value;
      if (act === "format") p.format = e.target.value;

      if (act.startsWith("ing_")) {
        const idx = Number(e.target.dataset.idx);
        const ing = p.ingredients[idx];
        if (!ing) return;

        if (act === "ing_name") ing.name = e.target.value;
        if (act === "ing_unit") ing.unit = e.target.value;
        if (act === "ing_time") ing.bakeTiming = e.target.value;
        if (act === "ing_rule") ing.scalingRule = e.target.value;
      }

      saveCustomPizzaPresets(list);
    });

    $$('input[data-act="ing_qty"]', root).forEach((input) => {
      const pid = input.dataset.pid;
      const idx = Number(input.dataset.idx);
      bindNumericInput(input, {
        key: `ing-${pid}-${idx}`,
        getValue: () => {
          const list = loadCustomPizzaPresets();
          const preset = list.find((x) => x.id === pid);
          const ing = preset?.ingredients?.[idx];
          return Number(ing?.quantity || 0);
        },
        setValue: (value) => {
          const list = loadCustomPizzaPresets();
          const preset = list.find((x) => x.id === pid);
          const ing = preset?.ingredients?.[idx];
          if (ing) {
            ing.quantity = value;
            saveCustomPizzaPresets(list);
          }
        },
        min: 0,
        onCommit: () => {}
      });
    });
  }

  /* ============================================================
     ROUTER + BOOT (single source of truth)
     ============================================================ */

  function render() {
    normalizeState();
    if (!renderTabs()) return;

    renderDebugPanel();

    if (STATE.activeTab === "session") renderSession();
    else if (STATE.activeTab === "orders") renderOrders();
    else if (STATE.activeTab === "making") renderMaking();
    else if (STATE.activeTab === "shopping") renderShopping();
    else if (STATE.activeTab === "presets") renderPresets();
    else if (STATE.activeTab === "debug") renderDebug();
    else renderSession();
  }

  async function boot() {
    loadState();
    if (!STATE || !STATE.session) STATE = defaultState();
    window.PizzaSessionStateAccessor = {
      getSessionV2: () => STATE.session_v2
    };

    const params = new URLSearchParams(window.location.search);
    const debugParam = params.get("debug");
    if (debugParam === "1" || debugParam === "true") {
      STATE.debugMode = true;
    }
    if (debugParam === "0") {
      STATE.debugMode = false;
    }

    // Attach tab events
    $$("#tabs .tab-btn").forEach((b) => {
      b.onclick = () => switchTab(b.dataset.tab);
    });

    const debugToggle = $("#debugToggle");
    if (debugToggle) {
      debugToggle.onchange = (e) => {
        setDebugMode(e.target.checked);
      };
    }

    document.addEventListener("input", (e) => {
      LAST_CHANGED_INPUT_KEY = describeInputKey(e.target);
      if (STATE.debugMode) {
        renderDebugPanel();
        if (STATE.activeTab === "debug") renderDebug();
      }
    });
    document.addEventListener(
      "wheel",
      (e) => {
        const target = e.target;
        if (target instanceof HTMLInputElement && target.dataset.numeric === "true" && document.activeElement === target) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
    document.addEventListener("change", (e) => {
      LAST_CHANGED_INPUT_KEY = describeInputKey(e.target);
      if (STATE.debugMode) {
        renderDebugPanel();
        if (STATE.activeTab === "debug") renderDebug();
      }
    });

    // Load configs from JSON BEFORE first render
    try {
      await loadDoughPresets();
    } catch (err) {
      console.error("Dough preset load failed:", err);
      setBanner(
        "error",
        "Preset load failed",
        `Could not load ${CONFIG_PATHS.doughPresets}. Open Console + verify URL works. (${err.message})`
      );
    }

    try {
      await loadDoughMethods();
    } catch (err) {
      console.error("Dough methods load failed:", err);
      setBanner(
        "warn",
        "Methods load failed",
        `Could not load ${CONFIG_PATHS.doughMethods}. Using built-in fallback. (${err.message})`
      );
    }

    try {
      await loadSessionV2Config();
    } catch (err) {
      console.error("Session v2 config load failed:", err);
    }
    ensureSessionV2State();

    try {
      await loadMixers();
    } catch (err) {
      console.error("Mixers load failed:", err);
      setBanner(
        "warn",
        "Mixers load failed",
        `Could not load ${CONFIG_PATHS.mixers}. Using built-in fallback. (${err.message})`
      );
    }

    try {
      await loadOvens();
    } catch (err) {
      console.error("Ovens load failed:", err);
      setBanner(
        "warn",
        "Ovens load failed",
        `Could not load ${CONFIG_PATHS.ovens}. Using built-in fallback. (${err.message})`
      );
    }

    try {
      await loadToppings();
    } catch (err) {
      console.error("Toppings load failed:", err);
    }

    try {
      await loadPizzaStylesCatalog();
    } catch (err) {
      console.warn("Pizza styles catalog load failed:", err);
    }

    try {
      await loadToppingsCatalog();
    } catch (err) {
      console.warn("Toppings catalog load failed:", err);
    }

    if (STATE.debugMode) {
      runSessionResolverTests();
    }

    saveState();


    // First render
    render();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
