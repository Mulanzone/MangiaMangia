/* ============================================================
   Pizza App Config Loader (NRM-first, backward compatible)
   - Never throws to the UI layer unless you choose to
   - Accepts multiple JSON shapes:
       A) { presets: [...] }   (current)
       B) { items: [...] }     (versioned-friendly)
       C) [...]               (legacy array)
   - Normalizes into your existing runtime shape:
     { id, label, description, defaults: { ... } }
   ============================================================ */

(() => {
  "use strict";

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return await res.json();
  }

  function coercePresetArray(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.presets)) return json.presets;
    if (json && Array.isArray(json.items)) return json.items;
    return null;
  }

  function normalizeDoughMethodPreset(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!raw.id || !raw.label) return null;

    const defaults = raw.defaults && typeof raw.defaults === "object" ? raw.defaults : null;

    const normalized = {
      id: String(raw.id),
      label: String(raw.label),
      description: String(raw.description || ""),
      defaults: defaults
        ? {
            hydrationPct: clamp(Number(defaults.hydrationPct ?? 63), 40, 100),
            saltPct: clamp(Number(defaults.saltPct ?? 2.8), 0, 6),
            honeyPct: clamp(Number(defaults.honeyPct ?? 0), 0, 10),
            prefermentType: String(defaults.prefermentType ?? "direct"),
            prefermentPct: clamp(Number(defaults.prefermentPct ?? 0), 0, 100),
            fermentationHours: clamp(Number(defaults.fermentationHours ?? 24), 0, 168),
            fermentationLocation: String(defaults.fermentationLocation ?? "cold"),
            ddtC: clamp(Number(defaults.ddtC ?? 23), 10, 35)
          }
        : null
    };

    return normalized;
  }

  /**
   * Load + normalize dough method presets with hard fallback.
   * @param {object} opts
   * @param {string} opts.path - JSON path
   * @param {Array}  opts.fallback - already-normalized fallback array
   * @returns {Promise<Array>} normalized presets array
   */
  async function loadDoughPresets({ path, fallback }) {
    let json;
    try {
      json = await fetchJson(path);
    } catch (e) {
      // Hard fallback
      return Array.isArray(fallback) && fallback.length ? fallback : [];
    }

    const arr = coercePresetArray(json);
    if (!arr) return Array.isArray(fallback) && fallback.length ? fallback : [];

    const cleaned = arr
      .map(normalizeDoughMethodPreset)
      .filter(Boolean);

    return cleaned.length ? cleaned : (Array.isArray(fallback) && fallback.length ? fallback : []);
  }

  function normalizeDoughMethod(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!raw.id || !(raw.display_name || raw.label)) return null;
    return {
      id: String(raw.id),
      label: String(raw.display_name || raw.label),
      category: String(raw.category || ""),
      supports: raw.supports && typeof raw.supports === "object" ? raw.supports : {},
      phases: Array.isArray(raw.phases) ? raw.phases : [],
      notes: notesMdToString(raw.notes_md || raw.notesMd || [])
    };
  }

  async function loadDoughMethods({ path, fallback }) {
    let json;
    try {
      json = await fetchJson(path);
    } catch (e) {
      return Array.isArray(fallback) && fallback.length ? fallback : [];
    }

    const arr =
      Array.isArray(json) ? json :
      (json && Array.isArray(json.items) ? json.items :
      (json && Array.isArray(json.methods) ? json.methods : null));

    if (!arr) return Array.isArray(fallback) && fallback.length ? fallback : [];

    const cleaned = arr.map(normalizeDoughMethod).filter(Boolean);
    return cleaned.length ? cleaned : (Array.isArray(fallback) && fallback.length ? fallback : []);
  }
function normalizeMixer(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.id || !(raw.display_name || raw.label)) return null;
  return {
    id: String(raw.id),
    label: String(raw.display_name || raw.label),
    type: String(raw.mixer_class || raw.type || "hand"),
    frictionFactorRangeC: Array.isArray(raw.friction_factor_c_range) ? raw.friction_factor_c_range.map(Number) : null,
    bowlCapacityG: raw.bowlCapacityG != null ? Number(raw.bowlCapacityG) : null,
    notes: notesMdToString(raw.notes_md || raw.notes || [])
  };
}
function fToC(f) {
  const n = Number(f);
  return Number.isFinite(n) ? (n - 32) * (5 / 9) : null;
}

function pickFirst(arr) {
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

function normalizeRange2(range) {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const a = Number(range[0]);
  const b = Number(range[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

function notesMdToString(notes_md) {
  if (!Array.isArray(notes_md)) return "";
  return notes_md.filter(Boolean).map(String).join(" ");
}

function deriveProgramSummary(program) {
  if (!program || typeof program !== "object") return { targetTempC: null, bakeTimeSecRange: null, notes: "" };

  const bakeTimeSecRange = normalizeRange2(program.bake_time_seconds);

  // Choose a reasonable target temperature estimate from temp_targets_f:
  // priority: deck/top average if present, else air, else any first key.
  let targetTempC = null;
  const t = program.temp_targets_f && typeof program.temp_targets_f === "object" ? program.temp_targets_f : null;

  if (t) {
    const deck = normalizeRange2(t.deck);
    const top = normalizeRange2(t.top);
    const air = normalizeRange2(t.air);

    if (deck && top) {
      // average of midpoints
      const deckMidF = (deck[0] + deck[1]) / 2;
      const topMidF = (top[0] + top[1]) / 2;
      targetTempC = fToC((deckMidF + topMidF) / 2);
    } else if (air) {
      targetTempC = fToC((air[0] + air[1]) / 2);
    } else {
      const firstKey = Object.keys(t)[0];
      const r = firstKey ? normalizeRange2(t[firstKey]) : null;
      if (r) targetTempC = fToC((r[0] + r[1]) / 2);
    }
  }

  const notes = notesMdToString(program.notes_md);

  return { targetTempC, bakeTimeSecRange, notes };
}
function normalizeOven(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.id || !raw.display_name) return null;

  const programs = Array.isArray(raw.programs) ? raw.programs : [];
  const primaryProgram = pickFirst(programs);
  const primaryProgramId = primaryProgram && primaryProgram.id ? String(primaryProgram.id) : null;

  const progSummary = deriveProgramSummary(primaryProgram);

  return {
    id: String(raw.id),
    label: String(raw.display_name),
    fuelType: String(raw.fuel_type || ""),
    constraints: raw.constraints && typeof raw.constraints === "object" ? raw.constraints : {},
    capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : {},
    preheat: raw.preheat && typeof raw.preheat === "object" ? raw.preheat : null,
    programs,

    // convenience summaries
    primaryProgramId,
    targetTempC: progSummary.targetTempC,
    bakeTimeSecRange: progSummary.bakeTimeSecRange,
    notes: progSummary.notes || ""
  };
}

async function loadMixers({ path, fallback }) {
  let json;
  try {
    json = await fetchJson(path);
  } catch (e) {
    return Array.isArray(fallback) && fallback.length ? fallback : [];
  }

  const arr =
    Array.isArray(json) ? json :
    (json && Array.isArray(json.items) ? json.items :
    (json && Array.isArray(json.mixers) ? json.mixers : null));

  if (!arr) return Array.isArray(fallback) && fallback.length ? fallback : [];

  const cleaned = arr.map(normalizeMixer).filter(Boolean);
  return cleaned.length ? cleaned : (Array.isArray(fallback) && fallback.length ? fallback : []);
}
async function loadOvens({ path, fallback }) {
  let json;
  try {
    json = await fetchJson(path);
  } catch (e) {
    return Array.isArray(fallback) && fallback.length ? fallback : [];
  }

  const arr =
    Array.isArray(json) ? json :
    (json && Array.isArray(json.items) ? json.items :
    (json && Array.isArray(json.ovens) ? json.ovens : null));

  if (!arr) return Array.isArray(fallback) && fallback.length ? fallback : [];

  const cleaned = arr.map(normalizeOven).filter(Boolean);
  return cleaned.length ? cleaned : (Array.isArray(fallback) && fallback.length ? fallback : []);
}

async function loadToppings({ path, fallback }) {
  let json;
  try {
    json = await fetchJson(path);
  } catch (e) {
    return Array.isArray(fallback) && fallback.length ? fallback : [];
  }

  const arr =
    Array.isArray(json) ? json :
    (json && Array.isArray(json.items) ? json.items :
    (json && Array.isArray(json.toppings) ? json.toppings : null));

  if (!arr) return Array.isArray(fallback) && fallback.length ? fallback : [];

  return arr.filter((item) => item && item.id);
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

  // Expose a tiny API
  window.PizzaConfigLoader = {
    fetchJson,
    loadDoughPresets,
    loadDoughMethods,
    loadMixers,
    loadOvens,
    loadToppings,
    getOvenById,
    getOvenProgramById,
    getMixerById
  };


})();
