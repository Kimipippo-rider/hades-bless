(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    view: "armory",
    weaponId: localStorage.getItem("hades-weapon") || null,
    aspectId: localStorage.getItem("hades-aspect") || null,
    selected: new Set((() => {
      try { return JSON.parse(localStorage.getItem("hades-selected") || "[]"); }
      catch { return []; }
    })()),
    godFilter: "all",
    search: "",
    duoGods: [],
    expandedDuo: null,
    highlightBoon: null,
    slotFilter: null,
    soul: localStorage.getItem("hades-soul") === "stygian" ? "stygian" : "infernal",
    keepsake: localStorage.getItem("hades-keepsake") || "",
    hammers: new Set((() => {
      try { return JSON.parse(localStorage.getItem("hades-hammers") || "[]"); }
      catch { return []; }
    })()),
    obtainedDuos: new Set((() => {
      try { return JSON.parse(localStorage.getItem("hades-obtained-duos") || "[]"); }
      catch { return []; }
    })()),
    expandedLegend: null,
    runMode: false,
  };

  function viewportLayout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = w / h;
    if (h <= 540 && w <= 980) return "phone";
    if (w <= 600) return "phone";
    if (w <= 820 && ratio <= 2 / 3) return "phone";
    if (w <= 1100) return "tablet";
    return "desktop";
  }

  function viewportOrient() {
    return window.innerHeight >= window.innerWidth ? "portrait" : "landscape";
  }

  function pinnedRunMode(layout = viewportLayout()) {
    const saved = localStorage.getItem("hades-run");
    const savedFor = localStorage.getItem("hades-run-for");
    if ((saved === "1" || saved === "0") && savedFor === layout) return saved === "1";
    return null;
  }

  function runModeForViewport(layout = viewportLayout()) {
    const pinned = pinnedRunMode(layout);
    if (pinned !== null) return pinned;
    return layout === "phone";
  }

  function applyViewportAttrs() {
    const root = document.documentElement;
    root.dataset.layout = viewportLayout();
    root.dataset.orient = viewportOrient();
  }

  state.runMode = runModeForViewport();
  applyViewportAttrs();

  const WEAPON_MAP = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
  const BOON_MAP = Object.fromEntries(BOONS.map((b) => [b.id, b]));
  const DUO_MAP = Object.fromEntries(DUOS.map((d) => [d.id, d]));
  const KEEPSAKE_MAP = Object.fromEntries(KEEPSAKES.map((k) => [k.id, k]));
  const HAMMER_MAP = Object.fromEntries(HAMMERS.map((h) => [h.id, h]));
  const LEGENDARIES = BOONS.filter((b) => b.slot === "legendary");
  const SLOT_KEYS = ["attack", "special", "cast", "dash", "call"];
  const SLOT_LABELS = { attack: "攻擊", special: "特殊", cast: "詠唱", dash: "衝刺", call: "神援" };
  const motionLite = window.matchMedia("(prefers-reduced-motion: reduce)");

  function prefersLiteMotion() {
    return motionLite.matches
      || navigator.connection?.saveData
      || document.hidden
      || document.body.classList.contains("is-run");
  }

  const weaponOf = () => WEAPON_MAP[state.weaponId];
  const aspectOf = () => weaponOf()?.aspects.find((a) => a.id === state.aspectId);
  const boonOf = (id) => BOON_MAP[id];
  const duoOf = (id) => DUO_MAP[id];
  const godOf = (id) => GODS[id];
  let hydrating = false;
  let toastTimer = 0;
  let syncEmbers = () => {};

  function persist() {
    localStorage.setItem("hades-selected", JSON.stringify([...state.selected]));
    if (state.weaponId) localStorage.setItem("hades-weapon", state.weaponId);
    if (state.aspectId) localStorage.setItem("hades-aspect", state.aspectId);
    localStorage.setItem("hades-soul", state.soul);
    if (state.keepsake) localStorage.setItem("hades-keepsake", state.keepsake);
    else localStorage.removeItem("hades-keepsake");
    localStorage.setItem("hades-hammers", JSON.stringify([...state.hammers]));
    localStorage.setItem("hades-obtained-duos", JSON.stringify([...state.obtainedDuos]));
    if (!hydrating) writeHash();
  }

  function buildHash() {
    if (state.view === "duos") {
      return state.duoGods.length ? `duos/${state.duoGods.join("/")}` : "duos";
    }
    if (state.view === "aspect" && state.weaponId) return `aspect/${state.weaponId}`;
    if (state.view === "planner" && state.weaponId && state.aspectId) {
      const parts = [];
      const boons = [...state.selected].sort().join(",");
      parts.push(`b=${boons}`);
      if (state.soul === "stygian") parts.push("soul=stygian");
      if (state.keepsake && KEEPSAKE_MAP[state.keepsake]) parts.push(`k=${state.keepsake}`);
      const hammers = [...state.hammers]
        .filter((id) => HAMMER_MAP[id]?.weapon === state.weaponId)
        .sort()
        .join(",");
      if (hammers) parts.push(`h=${hammers}`);
      return `planner/${state.weaponId}/${state.aspectId}?${parts.join("&")}`;
    }
    if (state.view === "armory") return "armory";
    return state.view || "armory";
  }

  function writeHash() {
    const next = `#${buildHash()}`;
    if ((location.hash || "#") === next) {
      updateTitle();
      return;
    }
    history.replaceState(null, "", next);
    updateTitle();
  }

  function applyHash() {
    const raw = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (!raw) return false;
    const [path, qs] = raw.split("?");
    const segs = path.split("/").filter(Boolean);
    const params = new URLSearchParams(qs || "");
    const view = segs[0];
    if (view === "armory") {
      state.view = "armory";
      return true;
    }
    if (view === "duos") {
      state.view = "duos";
      state.duoGods = segs.slice(1).filter((id) => GODS[id] && id !== "hermes").slice(0, 2);
      return true;
    }
    if (view === "aspect") {
      const weapon = WEAPON_MAP[segs[1]];
      if (!weapon) return false;
      state.weaponId = weapon.id;
      state.aspectId = null;
      state.view = "aspect";
      return true;
    }
    if (view === "planner") {
      const weapon = WEAPON_MAP[segs[1]];
      const aspect = weapon?.aspects.find((a) => a.id === segs[2]);
      if (!weapon || !aspect) return false;
      state.weaponId = weapon.id;
      state.aspectId = aspect.id;
      state.view = "planner";
      if (params.has("b")) {
        const rawB = params.get("b") || "";
        state.selected = new Set(rawB.split(",").filter((id) => id && BOON_MAP[id]));
        state.soul = params.get("soul") === "stygian" ? "stygian" : "infernal";
        const keepId = params.get("k") || "";
        state.keepsake = KEEPSAKE_MAP[keepId] ? keepId : "";
        const otherHammers = [...state.hammers].filter((id) => HAMMER_MAP[id]?.weapon !== weapon.id);
        const incoming = params.has("h")
          ? params.get("h").split(",").filter((id) => HAMMER_MAP[id])
          : [];
        state.hammers = new Set([...otherHammers, ...incoming]);
        stripIncompatibleBoons();
      }
      return true;
    }
    return false;
  }

  function updateTitle() {
    const weapon = weaponOf();
    const aspect = aspectOf();
    if (state.view === "planner" && weapon && aspect) {
      document.title = `${weapon.nameZh} · ${aspect.nameZh}｜冥府祝福`;
    } else {
      document.title = "冥府祝福 · Hades 神恩規劃";
    }
  }

  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    requestAnimationFrame(() => el.classList.add("is-on"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("is-on");
      setTimeout(() => { el.hidden = true; }, 220);
    }, 1800);
  }

  async function copyShare() {
    writeHash();
    const url = location.href;
    const weapon = weaponOf();
    const aspect = aspectOf();
    const title = weapon && aspect ? `${weapon.nameZh} · ${aspect.nameZh}` : "冥府祝福";
    const text = weapon && aspect
      ? `Hades 配裝：${weapon.nameZh}（${aspect.nameZh}型態）`
      : "Hades 神恩規劃";
    try {
      if (navigator.share && viewportLayout() === "phone") {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("已複製配裝連結");
    } catch {
      window.prompt("複製這個配裝連結", url);
    }
  }

  function applyRunChrome() {
    applyViewportAttrs();
    const onPlanner = state.view === "planner" && weaponOf() && aspectOf();
    document.body.classList.toggle("is-run", state.runMode);
    document.body.classList.toggle("show-dock", state.runMode && onPlanner);
    const toggle = $("#run-toggle");
    if (toggle) {
      toggle.textContent = state.runMode ? "完整規劃" : "本輪模式";
      toggle.classList.toggle("is-active", state.runMode);
    }
    const dock = $("#run-dock");
    if (dock) dock.hidden = !(state.runMode && onPlanner);
    if (!state.runMode) closeDuoSheet();
    syncEmbers();
  }

  function closeDuoSheet() {
    const sheet = $("#duo-sheet");
    if (sheet) sheet.hidden = true;
  }

  function showView(view, opts = {}) {
    state.view = view;
    $$(".view").forEach((el) => el.classList.toggle("is-active", el.dataset.view === view));
    $$(".tab").forEach((el) => el.classList.toggle("is-active", el.dataset.view === (view === "aspect" ? "armory" : view)));
    if (view === "planner") renderPlanner();
    if (view === "duos") renderDuoCatalog();
    if (view === "aspect") renderAspects();
    applyRunChrome();
    if (!opts.skipHash && !hydrating) writeHash();
    if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: prefersLiteMotion() ? "auto" : "smooth" });
  }

  const ICONS = {
    stygius: `<svg class="weapon-icon" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M40 6c4 12 7 24 7 38l-7 10-7-10c0-14 3-26 7-38z" fill="currentColor" fill-opacity=".2"/><path d="M40 10v40" opacity=".7"/><path d="M24 50c8 6 24 6 32 0l-4 6c-8 5-16 5-24 0z" fill="currentColor" fill-opacity=".22"/><path d="M37 56h6v12h-6z" fill="currentColor" fill-opacity=".18"/><circle cx="40" cy="72" r="4.5"/><path d="M37.5 72.5c.8 1.4 4.2 1.4 5 0" opacity=".9"/></svg>`,
    varatha: `<svg class="weapon-icon" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M40 4l7 16h-4l4 10H33l4-10h-4z" fill="currentColor" fill-opacity=".22"/><path d="M40 30v36"/><path d="M34 42h12M35 50h10"/><path d="M36 66h8l-4 8-4-8z" fill="currentColor" fill-opacity=".18"/><circle cx="40" cy="36" r="2.2" fill="currentColor"/></svg>`,
    aegis: `<svg class="weapon-icon" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="40" cy="40" r="26" fill="currentColor" fill-opacity=".12"/><circle cx="40" cy="40" r="18" opacity=".85"/><path d="M40 22l4.2 10.4 11.2 1.6-8.1 7.9 1.9 11.1L40 47.6 30.8 53l1.9-11.1-8.1-7.9 11.2-1.6z" fill="currentColor" fill-opacity=".28"/><circle cx="40" cy="40" r="5" fill="currentColor" fill-opacity=".35"/></svg>`,
    coronacht: `<svg class="weapon-icon" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 12c20 10 20 46 0 56" fill="currentColor" fill-opacity=".1"/><path d="M24 12c10 14 10 42 0 56"/><path d="M24 14c-6 16-6 36 0 52" opacity=".7"/><path d="M24 40h34"/><path d="M54 34l12 6-12 6"/><path d="M22 18h6M22 62h6"/></svg>`,
    malphon: `<svg class="weapon-icon" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 30h18c3 0 6 3 6 7v18c0 5-4 9-9 9H20c-5 0-8-4-8-9V37c0-4 1-7 2-7z" fill="currentColor" fill-opacity=".18"/><path d="M48 30h18c1 0 2 3 2 7v18c0 5-3 9-8 9h-9c-5 0-9-4-9-9V37c0-4 3-7 6-7z" fill="currentColor" fill-opacity=".18"/><path d="M18 30v-7h8v7M54 30v-7h8v7"/><path d="M20 42h10M20 48h10M50 42h10M50 48h10" opacity=".7"/></svg>`,
    exagryph: `<svg class="weapon-icon" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 44h28l8-6h20l6-8" fill="currentColor" fill-opacity=".12"/><path d="M10 44h28l8-6h22"/><path d="M18 44v12h16l4-6"/><path d="M14 44c0-6 4-10 9-10"/><path d="M54 30l10-12"/><path d="M38 38v-8h8"/><circle cx="16" cy="44" r="2.4" fill="currentColor"/></svg>`,
  };

  function weaponMark(id, sizeClass = "") {
    const svg = ICONS[id];
    if (!svg) return "";
    return `<span class="weapon-emblem ${sizeClass}" aria-hidden="true">${svg}</span>`;
  }

  function displayBoonName(boon) {
    const aspect = aspectOf();
    if (aspect?.id === "beowulf" && BEOWULF_CAST[boon.id]) {
      const v = BEOWULF_CAST[boon.id];
      return { name: v.name, nameZh: v.nameZh };
    }
    return { name: boon.name, nameZh: boon.nameZh };
  }

  function isBoonDisabled(boon) {
    const aspect = aspectOf();
    if (boon.exclusiveAspects?.includes(aspect?.id)) return true;
    if (boon.soul && boon.soul !== state.soul) return true;
    return false;
  }

  function slotConflict(boon) {
    if (!SLOT_KEYS.includes(boon.slot)) return false;
    for (const id of state.selected) {
      if (id !== boon.id && BOON_MAP[id]?.slot === boon.slot) return true;
    }
    return false;
  }

  function isBoonHidden(boon, needed) {
    if (state.selected.has(boon.id)) return false;
    if (state.highlightBoon === boon.id) return false;
    if (state.search.trim()) return false;
    if (needed?.has(boon.id)) return false;
    return isBoonDisabled(boon) || slotConflict(boon);
  }

  function keepsakeOf() {
    return KEEPSAKE_MAP[state.keepsake] || null;
  }

  function godKeepsake(godId) {
    return KEEPSAKES.find((k) => k.god === godId)?.id || "";
  }

  function keepsakeRoute(aspect) {
    const gods = aspect?.gods || [];
    const third = gods[2] ? godKeepsake(gods[2]) : "lambent-plume";
    return [
      { region: REGIONS[0], keepsakeId: godKeepsake(gods[0]), why: gods[0] ? `先鎖定 ${GODS[gods[0]].nameZh}` : "先鎖核心欄位" },
      { region: REGIONS[1], keepsakeId: godKeepsake(gods[1]), why: gods[1] ? `鋪 ${GODS[gods[1]].nameZh} 雙重` : "第二位神" },
      { region: REGIONS[2], keepsakeId: third, why: gods[2] ? `${GODS[gods[2]].nameZh} 或生存` : "荷米斯羽毛疊閃避" },
      { region: REGIONS[3], keepsakeId: "lucky-tooth", why: "額外死亡反抗" },
      { region: REGIONS[4], keepsakeId: "evergreen-acorn", why: "首領戰減傷" },
    ];
  }

  function stripIncompatibleBoons() {
    const removed = [];
    for (const id of [...state.selected]) {
      const boon = boonOf(id);
      if (boon && isBoonDisabled(boon)) {
        state.selected.delete(id);
        removed.push(displayBoonName(boon).nameZh);
      }
    }
    return removed;
  }

  function renderArmory() {
    $("#weapon-grid").innerHTML = WEAPONS.map((w) => `
      <button class="weapon-card" data-weapon="${w.id}" style="--accent:${w.accent}">
        ${weaponMark(w.id)}
        <span class="weapon-en">${w.name} · ${w.subtitle}</span>
        <h3>${w.nameZh}</h3>
        <p class="meta">${w.desc}</p>
        <div class="chip-row">
          <span class="chip">曾為 ${w.formerZh} 所持</span>
          <span class="chip">${w.unlock}</span>
          <span class="chip">${w.playstyle}</span>
        </div>
      </button>
    `).join("");
  }

  function renderAspects() {
    const weapon = weaponOf();
    if (!weapon) return showView("armory");
    const emblem = $("#aspect-emblem");
    if (emblem) {
      emblem.style.setProperty("--accent", weapon.accent);
      emblem.innerHTML = weaponMark(weapon.id);
    }
    $("#aspect-eyebrow").textContent = `${weapon.name} · ${weapon.subtitle}`;
    $("#aspect-title").textContent = `${weapon.nameZh}：選擇型態`;
    $("#aspect-desc").textContent = weapon.desc;
    $("#aspect-grid").innerHTML = weapon.aspects.map((a) => `
      <button class="aspect-card" data-aspect="${a.id}" style="--accent:${weapon.accent}">
        ${a.hidden ? `<span class="hidden-tag">HIDDEN ASPECT</span>` : ""}
        <span class="weapon-en">Aspect of ${a.name}</span>
        <h3>${a.nameZh}型態</h3>
        <p class="meta">${a.effectZh}</p>
        <p class="meta">${a.levels}</p>
        <div class="chip-row">
          <span class="chip">${a.playstyle}</span>
          ${a.gods.map((g) => `<span class="chip" style="border-color:${GODS[g].color};color:${GODS[g].color}">${GODS[g].nameZh}</span>`).join("")}
          ${a.hidden ? `<span class="chip hidden-chip">隱藏型態</span>` : ""}
        </div>
      </button>
    `).join("");
  }

  function duoReqIds(duo, godId) {
    let ids = duo.req[godId] || [];
    const ignore = duo.ignoreReqIfAspect?.[aspectOf()?.id];
    if (ignore?.length) ids = ids.filter((id) => !ignore.includes(id));
    return ids;
  }

  function extraReqState(duo) {
    if (duo.extraReq === "revenge") {
      const ok = BOONS.some((b) => b.tags?.includes("revenge") && state.selected.has(b.id));
      return { ok, counts: true, label: "復仇神恩" };
    }
    if (duo.extraReq === "non-hades-aid") {
      const ok = BOONS.some((b) => b.slot === "call" && state.selected.has(b.id));
      return { ok, counts: true, label: "奧林帕斯神援" };
    }
    return { ok: true, counts: false, label: "" };
  }

  function duoCoreReady(duo) {
    const aspect = aspectOf();
    if (duo.incompatibleAspects?.includes(aspect?.id)) return false;
    if (duo.extraReq === "infernal-soul" && state.soul !== "infernal") return false;
    if ((duo.blockedByBoons || []).some((id) => state.selected.has(id))) return false;
    const partsOk = duo.gods.every((g) => duoReqIds(duo, g).some((id) => state.selected.has(id)));
    return partsOk && extraReqState(duo).ok;
  }

  function duoStatus(duo) {
    const aspect = aspectOf();
    const aspectBlocked = duo.incompatibleAspects?.includes(aspect?.id);
    const soulBlocked = duo.extraReq === "infernal-soul" && state.soul !== "infernal";
    const boonBlockedId = (duo.blockedByBoons || []).find((id) => state.selected.has(id));
    const exclusiveTakenId = (duo.exclusiveWith || []).find((id) => state.obtainedDuos.has(id));
    const blocked = aspectBlocked || soulBlocked || Boolean(boonBlockedId) || Boolean(exclusiveTakenId);
    let blockReason = "";
    if (soulBlocked) blockReason = "需要夜之鏡「煉獄靈魂」";
    else if (aspectBlocked) blockReason = "與此型態不相容";
    else if (boonBlockedId) {
      const b = boonOf(boonBlockedId);
      blockReason = `無法與「${b ? displayBoonName(b).nameZh : boonBlockedId}」並存`;
    } else if (exclusiveTakenId) {
      blockReason = `已與「${duoOf(exclusiveTakenId)?.nameZh || exclusiveTakenId}」互斥`;
    }
    const parts = duo.gods.map((g) => duoReqIds(duo, g).some((id) => state.selected.has(id)));
    const extra = extraReqState(duo);
    const extraOk = extra.ok;
    const obtained = state.obtainedDuos.has(duo.id);
    const met = parts.every(Boolean) && extraOk && !soulBlocked;
    const progress = parts.filter(Boolean).length + (extra.counts ? (extraOk ? 1 : 0) : 0);
    const total = duo.gods.length + (extra.counts ? 1 : 0);
    const exclusiveReady = (duo.exclusiveWith || [])
      .map((id) => duoOf(id))
      .filter((other) => other && !state.obtainedDuos.has(other.id) && duoCoreReady(other));
    return { blocked, blockReason, met, progress, total, parts, extraOk, obtained, exclusiveReady };
  }

  function revengeBoons() {
    return BOONS.filter((b) => b.tags?.includes("revenge"));
  }

  function duoGaps(duo) {
    const status = duoStatus(duo);
    const gods = duo.gods.map((gid) => {
      const ids = duoReqIds(duo, gid);
      const owned = ids.filter((id) => state.selected.has(id));
      const missing = ids.filter((id) => !state.selected.has(id));
      return { godId: gid, met: owned.length > 0, owned, missing, ids };
    });
    let extra = null;
    if (duo.extraReq === "revenge") {
      const all = revengeBoons();
      const owned = all.filter((b) => state.selected.has(b.id)).map((b) => b.id);
      extra = {
        type: "revenge",
        label: "復仇神恩",
        met: owned.length > 0,
        owned,
        missing: all.map((b) => b.id),
      };
    } else if (duo.extraReq === "infernal-soul") {
      extra = {
        type: "soul",
        label: "煉獄靈魂",
        met: state.soul === "infernal",
      };
    } else if (duo.extraReq === "non-hades-aid") {
      const all = BOONS.filter((b) => b.slot === "call");
      const owned = all.filter((b) => state.selected.has(b.id)).map((b) => b.id);
      extra = {
        type: "aid",
        label: "奧林帕斯神援",
        met: owned.length > 0,
        owned,
        missing: all.map((b) => b.id),
      };
    }
    const missingLabels = [
      ...gods.filter((g) => !g.met).map((g) => GODS[g.godId].nameZh),
      extra?.type === "revenge" && !extra.met ? extra.label : null,
      extra?.type === "soul" && !extra.met ? extra.label : null,
      extra?.type === "aid" && !extra.met ? extra.label : null,
    ].filter(Boolean);
    return { ...status, gods, extra, missingLabels };
  }

  function suggestedDuoIds() {
    return new Set(aspectOf()?.duos || []);
  }

  function neededBoonIds() {
    const ids = new Set();
    const duo = duoOf(state.expandedDuo);
    if (duo) {
      const gaps = duoGaps(duo);
      gaps.gods.forEach((g) => {
        if (!g.met) g.missing.forEach((id) => ids.add(id));
      });
      if (gaps.extra?.type === "revenge" && !gaps.extra.met) {
        gaps.extra.missing.forEach((id) => ids.add(id));
      }
      if (gaps.extra?.type === "aid" && !gaps.extra.met) {
        gaps.extra.missing.forEach((id) => ids.add(id));
      }
    }
    const legend = boonOf(state.expandedLegend);
    if (legend) {
      legendaryGaps(legend).rows.forEach((row) => {
        if (!row.met && row.missing) row.missing.forEach((id) => ids.add(id));
      });
    }
    return ids;
  }

  function paintNeededBoons() {
    if (state.view === "planner" && weaponOf() && aspectOf()) renderBoonBoard();
    else syncBoonCards();
  }

  function gapChip(id) {
    const boon = boonOf(id);
    if (!boon) return "";
    const shown = displayBoonName(boon);
    const g = GODS[boon.god];
    const disabled = isBoonDisabled(boon);
    return `<button type="button" class="gap-chip" data-jump-boon="${boon.id}" style="--g:${g.color}" ${disabled ? "disabled title=\"與此型態不相容\"" : ""}>${shown.nameZh}</button>`;
  }

  function gapsMarkup(duo) {
    const gaps = duoGaps(duo);
    const godRows = gaps.gods.map((g) => {
      const god = GODS[g.godId];
      if (g.met) {
        const owned = displayBoonName(boonOf(g.owned[0]));
        return `<div class="gap-row is-met">
          <div class="gap-label"><strong>${god.nameZh}</strong><span style="color:#8ee0ad">已有 ${owned.nameZh}</span></div>
        </div>`;
      }
      return `<div class="gap-row">
        <div class="gap-label"><strong>還缺 ${god.nameZh}</strong><span>下列擇一</span></div>
        <div class="gap-picks">${g.missing.map(gapChip).join("")}</div>
      </div>`;
    }).join("");
    let extraRow = "";
    if (gaps.extra?.type === "revenge") {
      extraRow = gaps.extra.met
        ? `<div class="gap-row is-met"><div class="gap-label"><strong>復仇神恩</strong><span style="color:#8ee0ad">已有 ${displayBoonName(boonOf(gaps.extra.owned[0])).nameZh}</span></div></div>`
        : `<div class="gap-row"><div class="gap-label"><strong>還缺復仇神恩</strong><span>下列擇一</span></div><div class="gap-picks">${revengeBoons().map((b) => gapChip(b.id)).join("")}</div></div>`;
    } else if (gaps.extra?.type === "soul") {
      extraRow = gaps.extra.met
        ? `<div class="gap-row is-met"><div class="gap-label"><strong>夜之鏡</strong><span style="color:#8ee0ad">已選煉獄靈魂</span></div></div>`
        : `<div class="gap-row"><div class="gap-label"><strong>還缺煉獄靈魂</strong><span>請在左側改選夜之鏡</span></div></div>`;
    } else if (gaps.extra?.type === "aid") {
      extraRow = gaps.extra.met
        ? `<div class="gap-row is-met"><div class="gap-label"><strong>奧林帕斯神援</strong><span style="color:#8ee0ad">已有 ${displayBoonName(boonOf(gaps.extra.owned[0])).nameZh}</span></div></div>`
        : `<div class="gap-row"><div class="gap-label"><strong>還缺奧林帕斯神援</strong><span>下列擇一（非黑帝斯）</span></div><div class="gap-picks">${gaps.extra.missing.map(gapChip).join("")}</div></div>`;
    } else if (gaps.extra?.type === "note") {
      extraRow = `<p class="warn">${gaps.extra.label}</p>`;
    }
    return `<div class="duo-gaps">${godRows}${extraRow}</div>`;
  }

  function legendaryGaps(boon) {
    const prereq = boon.prereq || {};
    const rows = [];
    if (prereq.type === "OneOf") {
      const ids = prereq.ids || [];
      const owned = ids.filter((id) => state.selected.has(id));
      const keepOk = (prereq.keepsakes || []).includes(state.keepsake);
      const met = owned.length > 0 || keepOk;
      rows.push({
        label: "下列擇一",
        met,
        owned,
        missing: ids,
        keepOk,
        keepsakes: prereq.keepsakes || [],
        weight: 1,
        got: met ? 1 : 0,
      });
    } else if (prereq.type === "TwoOf") {
      const ids = prereq.ids || [];
      const owned = ids.filter((id) => state.selected.has(id));
      const keepOk = (prereq.keepsakes || []).includes(state.keepsake);
      const need = prereq.need || 2;
      const have = owned.length + (keepOk ? 1 : 0);
      const got = Math.min(have, need);
      rows.push({
        label: `下列任 ${need} 項`,
        met: have >= need,
        owned,
        missing: ids.filter((id) => !state.selected.has(id)),
        keepOk,
        keepsakes: prereq.keepsakes || [],
        need,
        have,
        weight: need,
        got,
      });
    } else if (prereq.type === "OneFromEachSet") {
      (prereq.sets || []).forEach((ids, i) => {
        const owned = ids.filter((id) => state.selected.has(id));
        const met = owned.length > 0;
        rows.push({
          label: i === 0 ? "第一組擇一" : "第二組擇一",
          met,
          owned,
          missing: ids,
          weight: 1,
          got: met ? 1 : 0,
        });
      });
    }
    if (boon.soul) {
      const met = state.soul === boon.soul;
      rows.push({
        type: "soul",
        label: boon.soul === "infernal" ? "煉獄靈魂" : "冥河靈魂",
        met,
        weight: 1,
        got: met ? 1 : 0,
      });
    }
    const blocked = boon.soul ? state.soul !== boon.soul : false;
    const met = rows.length ? rows.every((row) => row.met) : !blocked;
    const progress = rows.reduce((n, row) => n + (row.got || 0), 0);
    const total = Math.max(rows.reduce((n, row) => n + (row.weight || 1), 0), 1);
    const missingLabels = rows.filter((row) => !row.met).map((row) => {
      if (row.type === "soul") return row.label;
      if (row.need) return `再 ${row.need - row.have} 項前置`;
      if (row.missing?.length) return displayBoonName(boonOf(row.missing[0])).nameZh;
      return row.label;
    });
    return { blocked, met, selected: state.selected.has(boon.id), progress, total, rows, missingLabels };
  }

  function legendGapsMarkup(boon) {
    const gaps = legendaryGaps(boon);
    const rows = gaps.rows.map((row) => {
      if (row.type === "soul") {
        return row.met
          ? `<div class="gap-row is-met"><div class="gap-label"><strong>夜之鏡</strong><span style="color:#8ee0ad">已選${row.label}</span></div></div>`
          : `<div class="gap-row"><div class="gap-label"><strong>還缺${row.label}</strong><span>請在左側改選夜之鏡</span></div></div>`;
      }
      if (row.met) {
        const ownedNames = [
          ...(row.owned || []).map((id) => displayBoonName(boonOf(id)).nameZh),
          row.keepOk ? KEEPSAKE_MAP[state.keepsake]?.nameZh : null,
        ].filter(Boolean);
        return `<div class="gap-row is-met"><div class="gap-label"><strong>${row.label}</strong><span style="color:#8ee0ad">已有 ${ownedNames.join("、")}</span></div></div>`;
      }
      const keepChips = (row.keepsakes || []).map((id) => {
        const keep = KEEPSAKE_MAP[id];
        if (!keep) return "";
        return `<button type="button" class="gap-chip" data-keepsake="${keep.id}">信物：${keep.nameZh}</button>`;
      }).join("");
      return `<div class="gap-row">
        <div class="gap-label"><strong>還缺 ${row.label}</strong><span>${row.need ? `已有 ${row.have}/${row.need}` : "點名稱跳到神恩"}</span></div>
        <div class="gap-picks">${(row.missing || []).map(gapChip).join("")}${keepChips}</div>
      </div>`;
    }).join("");
    return `<div class="duo-gaps">${rows}</div>`;
  }

  function selectedInSlot(slot) {
    for (const id of state.selected) {
      const boon = BOON_MAP[id];
      if (boon?.slot === slot) return boon;
    }
    return null;
  }

  function boonStatusLabel(boon) {
    if (!boon) return null;
    if (boon.god === "hermes") return "攻速";
    if (boon.god === "athena") return "偏轉";
    if (boon.god === "poseidon") return "擊退";
    if (boon.god === "zeus") return "閃電";
    return GODS[boon.god]?.curseZh || null;
  }

  function combatMove(slot) {
    const weapon = weaponOf();
    const aspect = aspectOf();
    let move = { ...(weapon?.moves?.[slot] || {}) };
    if (aspect?.moves?.[slot]) move = { ...move, ...aspect.moves[slot] };
    HAMMERS.forEach((h) => {
      if (!state.hammers.has(h.id) || h.weapon !== weapon?.id || !h.moves?.[slot]) return;
      move = { ...move, ...h.moves[slot] };
    });
    return move;
  }

  function combatStatus(slot) {
    if (slot !== "attack" && slot !== "special") return null;
    const move = combatMove(slot);
    const current = selectedInSlot(slot);
    const status = boonStatusLabel(current);
    const dmg = [move.damage, move.nameZh].filter(Boolean).join(" · ");
    return {
      dmg,
      note: move.noteZh || "",
      status: current ? (status || "已上神恩") : "尚未上神恩",
      filled: Boolean(current),
      color: current ? GODS[current.god]?.color : "",
    };
  }

  function renderCoreSlots() {
    const aspect = aspectOf();
    if (!aspect) return;
    $("#core-slots").innerHTML = Object.keys(SLOT_LABELS).map((slot) => {
      const rec = aspect.slots[slot] ? boonOf(aspect.slots[slot]) : null;
      const current = selectedInSlot(slot);
      const shown = current ? displayBoonName(current) : rec ? displayBoonName(rec) : null;
      const god = current ? GODS[current.god] : rec ? GODS[rec.god] : null;
      const label = current ? shown.nameZh : rec ? (state.runMode ? shown.nameZh : `建議：${shown.nameZh}`) : "未鎖定";
      const on = state.slotFilter === slot;
      const filled = Boolean(current);
      const combat = combatStatus(slot);
      const combatRow = combat
        ? `<span class="slot-combat">
            <span class="slot-dmg">${combat.dmg}${combat.note ? ` · ${combat.note}` : ""}</span>
            <span class="status-chip ${combat.filled ? "is-on" : "is-empty"}">${combat.status}</span>
          </span>`
        : "";
      return `<button type="button" class="slot-row ${on ? "is-on" : ""} ${filled ? "is-filled" : ""}" data-slot-filter="${slot}" style="--g:${god ? god.color : (combat?.color || "var(--gold)")}">
        <span class="slot-label">${SLOT_LABELS[slot]}</span>
        <span class="slot-value">${label}<br><small>${current ? `${god.nameZh} · 已勾選` : rec ? `${god.nameZh} · ${shown.name}` : "—"}</small>${combatRow}</span>
      </button>`;
    }).join("");
  }

  function syncBoonCards() {
    const needed = neededBoonIds();
    $$("#boon-board [data-boon]").forEach((el) => {
      const boon = boonOf(el.dataset.boon);
      const on = state.selected.has(el.dataset.boon);
      const disabled = boon ? isBoonDisabled(boon) : false;
      el.classList.toggle("is-on", on);
      el.classList.toggle("is-needed", needed.has(el.dataset.boon) && !on);
      el.classList.toggle("is-disabled", disabled);
      if (disabled) el.setAttribute("disabled", "");
      else el.removeAttribute("disabled");
    });
  }

  function renderPriorityList() {
    const aspect = aspectOf();
    const list = $("#priority-list");
    if (!aspect || !list) return;
    const keep = keepsakeOf();
    const leadGod = keep?.god || aspect.gods[0];
    const others = aspect.gods.filter((id) => id !== leadGod);
    const infernal = state.soul !== "stygian";
    list.innerHTML = `
      <li>${keep?.god
        ? `已戴 <strong>${keep.nameZh}</strong>，先拿 <strong>${GODS[leadGod].nameZh}</strong> 核心欄位。`
        : `戴上 <strong>${GODS[aspect.gods[0]].nameZh}</strong> 信物，先鎖定核心欄位。`}</li>
      <li>第二優先：<strong>${GODS[others[0] || aspect.gods[1]]?.nameZh || "荷米斯"}</strong>，為雙重神恩鋪路。</li>
      <li>第三：<strong>${GODS[others[1]]?.nameZh || "荷米斯"}</strong> 或生存向神恩。</li>
      <li>夜之鏡：<strong>${infernal ? "煉獄靈魂" : "冥河靈魂"}</strong>${infernal ? "（可衝避雷針／滿載／更大召回）" : "（可衝壞消息；避雷針與滿載不可用）"}。</li>
      <li>對應雙重：${(aspect.duos || []).map((id) => duoOf(id)?.nameZh || id).join("、")}。</li>
    `;
  }

  function renderRunSystems() {
    const el = $("#run-systems");
    const aspect = aspectOf();
    if (!el || !aspect) return;
    const keep = keepsakeOf();
    const infernal = state.soul !== "stygian";
    const hammers = HAMMERS.filter((h) => h.weapon === state.weaponId);
    el.innerHTML = `
      <section class="sys-block">
        <h3>夜之鏡</h3>
        <div class="sys-toggle" role="group" aria-label="靈魂">
          <button type="button" class="sys-chip ${infernal ? "is-on" : ""}" data-soul="infernal">煉獄靈魂</button>
          <button type="button" class="sys-chip ${!infernal ? "is-on" : ""}" data-soul="stygian">冥河靈魂</button>
        </div>
        <p class="sys-note">${infernal
          ? "血石會掉落。可拿避雷針、滿載、更大召回、退出傷口。"
          : "血石自動回補。可拿自動裝填與壞消息。避雷針、滿載、更大召回與退出傷口無法使用。"}</p>
      </section>
      <section class="sys-block">
        <h3>信物</h3>
        <div class="keep-pills">
          <button type="button" class="sys-chip ${!state.keepsake ? "is-on" : ""}" data-keepsake="">未佩戴</button>
          ${KEEPSAKES.map((k) => {
            const g = k.god ? GODS[k.god] : null;
            return `<button type="button" class="sys-chip ${state.keepsake === k.id ? "is-on" : ""}" data-keepsake="${k.id}" ${g ? `style="--g:${g.color}"` : ""}>${k.nameZh}</button>`;
          }).join("")}
        </div>
        <p class="sys-note">${keep ? `${keep.nameZh}：${keep.effectZh}` : "點奧林帕斯信物，下一個神恩房間會出現該神。也可點下方地區套用建議。"} 規劃用精簡清單，未收錄全部信物。</p>
        <ol class="keepsake-route">
          ${keepsakeRoute(aspect).map((row) => {
            const item = KEEPSAKE_MAP[row.keepsakeId];
            const on = state.keepsake === row.keepsakeId;
            return `<li>
              <button type="button" class="route-btn ${on ? "is-on" : ""}" data-keepsake="${row.keepsakeId}">
                <strong>${row.region.nameZh}</strong>
                <span>${item ? item.nameZh : "—"}</span>
                <small>${row.why}</small>
              </button>
            </li>`;
          }).join("")}
        </ol>
      </section>
      <section class="sys-block hammer-block">
        <h3>代達羅斯鍛鎚</h3>
        <div class="hammer-pills">
          ${hammers.map((h) => {
            const rec = h.rec?.includes(aspect.id);
            const on = state.hammers.has(h.id);
            return `<button type="button" class="sys-chip ${on ? "is-on" : ""} ${rec ? "is-rec" : ""}" data-hammer="${h.id}" title="${h.effectZh}">${h.nameZh}${rec ? " · 建議" : ""}</button>`;
          }).join("")}
        </div>
        <p class="sys-note hammer-note">僅列出此兵器較常用的鍛鎚，可勾選本輪已拿到的。卡俄斯神恩不進雙重，故未列入。</p>
      </section>
    `;
  }

  function renderPlanner() {
    const weapon = weaponOf();
    const aspect = aspectOf();
    const empty = !weapon || !aspect;
    $("#planner-empty").hidden = !empty;
    $("#planner").hidden = empty;
    if (empty) {
      applyRunChrome();
      return;
    }

    const loadout = $("#loadout-weapon");
    loadout.style.setProperty("--accent", weapon.accent);
    loadout.innerHTML = `
      <div class="loadout-head">
        ${weaponMark(weapon.id, "is-sm")}
        <div>
          <p class="aspect-mini">${weapon.name} · Aspect of ${aspect.name}</p>
          <h2>${weapon.nameZh} · ${aspect.nameZh}</h2>
        </div>
      </div>
      <p class="meta">${aspect.effectZh}</p>
      <p class="meta combat-hint">攻擊／特殊欄顯示基礎傷害與狀態，不含石榴與稀有度。</p>
      ${aspect.unlockZh ? `<p class="warn">${aspect.unlockZh}</p>` : ""}
      ${aspect.notes ? `<p class="meta" style="margin-top:8px">${aspect.notes}</p>` : ""}
    `;

    renderCoreSlots();
    renderRunSystems();
    renderPriorityList();

    const gods = ["all", ...Object.keys(GODS)];
    $("#god-filters").innerHTML = gods.map((id) => {
      if (id === "all") {
        return `<button class="god-pill ${state.godFilter === "all" ? "is-active" : ""}" data-god="all" style="--g:var(--gold)">全部</button>`;
      }
      const g = GODS[id];
      const keepOn = keepsakeOf()?.god === id;
      return `<button class="god-pill ${state.godFilter === id ? "is-active" : ""} ${keepOn ? "is-keep" : ""}" data-god="${id}" style="--g:${g.color}">${g.nameZh}${keepOn ? " · 信物" : ""}</button>`;
    }).join("");

    renderBoonBoard();
    renderDuoRail();
    applyRunChrome();
  }

  function renderBoonBoard() {
    const aspect = aspectOf();
    const board = $("#boon-board");
    if (!aspect || !board) return;

    const q = state.search.trim().toLowerCase();
    const waiting = state.runMode && !state.slotFilter && state.godFilter === "all" && !q;
    const hint = $("#run-hint");
    if (hint) {
      hint.hidden = !state.runMode;
      hint.classList.toggle("is-visible", waiting);
      hint.textContent = waiting
        ? `點上方欄位，快速勾選本輪神恩。建議優先：${aspect.gods.map((id) => GODS[id].nameZh).join("、")}。`
        : "正在顯示對應神恩；再點一次欄位可回到提示。";
    }

    const neededIds = neededBoonIds();
    const grouped = {};
    let hiddenCount = 0;
    if (!waiting) {
      BOONS.forEach((b) => {
        if (state.godFilter !== "all" && b.god !== state.godFilter) return;
        if (state.slotFilter && b.slot !== state.slotFilter) return;
        const shown = displayBoonName(b);
        if (q && ![b.name, b.nameZh, shown.name, shown.nameZh, b.effectZh].join(" ").toLowerCase().includes(q)) return;
        if (isBoonHidden(b, neededIds)) {
          hiddenCount += 1;
          return;
        }
        (grouped[b.god] ||= []).push(b);
      });
    }

    const slotZh = Object.fromEntries(SLOTS.map((s) => [s.id, s.nameZh]));
    const blocks = Object.keys(GODS).filter((id) => grouped[id]).map((gid) => {
      const g = GODS[gid];
      const rec = aspect.gods.includes(gid);
      return `<article class="god-block" style="--g:${g.color}">
        <div class="god-block-head">
          <strong>${g.nameZh} · ${g.name}</strong>
          <small>${rec ? "本型態建議" : g.curseZh ? `狀態：${g.curseZh}` : "無雙重神恩"}</small>
        </div>
        <div class="boon-grid">
          ${grouped[gid].map((b) => {
            const shown = displayBoonName(b);
            const on = state.selected.has(b.id);
            const disabled = isBoonDisabled(b);
            const rec = Object.values(aspect.slots).includes(b.id);
            const needed = neededIds.has(b.id) && !on;
            const focus = state.highlightBoon === b.id;
            return `<button class="boon-card ${on ? "is-on" : ""} ${disabled ? "is-disabled" : ""} ${rec ? "is-rec" : ""} ${needed ? "is-needed" : ""} ${focus ? "is-focus" : ""}" data-boon="${b.id}" id="boon-${b.id}" style="--g:${g.color}" ${disabled ? "disabled" : ""}>
              <span class="boon-slot">${slotZh[b.slot]}${b.slot === "legendary" ? " ★" : ""}</span>
              <strong>${shown.nameZh}</strong>
              <span class="boon-en">${shown.name}</span>
              <p>${b.effectZh}</p>
            </button>`;
          }).join("")}
        </div>
      </article>`;
    }).join("");

    const emptyNote = hiddenCount
      ? `<p class="meta hide-note">已隱藏 ${hiddenCount} 道不相容神恩（同欄位、夜之鏡或型態）。取消勾選或搜尋名稱可再顯示。</p>`
      : `<p class="meta">沒有符合的神恩。</p>`;
    board.innerHTML = blocks || (waiting ? "" : emptyNote);
    if (blocks && hiddenCount) {
      board.insertAdjacentHTML("afterbegin", `<p class="meta hide-note">已依目前勾選隱藏 ${hiddenCount} 道不相容神恩。取消該欄位或搜尋名稱可再顯示。</p>`);
    }
  }

  function rankDuos() {
    const suggested = suggestedDuoIds();
    const ranked = DUOS.map((duo) => ({ duo, ...duoGaps(duo) }))
      .sort((a, b) => {
        const as = suggested.has(a.duo.id) ? 1 : 0;
        const bs = suggested.has(b.duo.id) ? 1 : 0;
        if (bs !== as) return bs - as;
        return 0;
      });
    const groups = [
      { title: "可領取", items: ranked.filter((x) => x.met && !x.blocked && !x.obtained) },
      { title: "已拿到", items: ranked.filter((x) => x.obtained) },
      { title: "還差 1 道", items: ranked.filter((x) => !x.met && !x.blocked && !x.obtained && x.progress === x.total - 1) },
      { title: "進行中", items: ranked.filter((x) => !x.met && !x.blocked && !x.obtained && x.progress > 0 && x.progress < x.total - 1) },
      { title: "尚未開始", items: ranked.filter((x) => !x.met && !x.blocked && !x.obtained && x.progress === 0) },
      { title: "無法使用", items: ranked.filter((x) => x.blocked && !x.obtained) },
    ];
    return { suggested, ranked, groups };
  }

  function exclusiveWarnMarkup(row) {
    if (!row.exclusiveReady?.length || row.obtained || row.blocked) return "";
    const names = row.exclusiveReady.map((d) => d.nameZh).join("、");
    return `<p class="warn">不能同時擁有：${names}。拿下一道後請標記已拿到。</p>`;
  }

  function obtainMarkup(duo, obtained) {
    return `<button type="button" class="ghost obtain-btn" data-obtain-duo="${duo.id}">${obtained ? "取消已拿到" : "標記已拿到"}</button>`;
  }

  function duoStatusSummary(row) {
    const { blocked, blockReason, met, obtained, exclusiveReady, missingLabels, progress, total } = row;
    const closeOne = !met && !blocked && !obtained && progress === total - 1;
    if (blocked) return `<p class="warn">${blockReason || "無法使用"}</p>`;
    if (obtained) return `<p class="warn" style="color:#8ee0ad">本輪已標記拿到</p>`;
    if (met && exclusiveReady?.length) {
      return `<p class="warn" style="color:#e8c35a">條件已滿足，但與「${exclusiveReady.map((d) => d.nameZh).join("、")}」互斥，只能選一道</p>`;
    }
    if (met) return `<p class="warn" style="color:#8ee0ad">條件已滿足，兩位神都可能提供</p>`;
    return `<p class="duo-missing">${closeOne ? "還差：" : "還缺："}${missingLabels.join("、")}</p>`;
  }

  function renderDuoRail() {
    const list = $("#duo-list");
    const y = list.scrollTop;
    const { suggested, groups } = rankDuos();
    const ready = groups[0].items.length;
    const close = groups[2].items.length;
    const got = groups[1].items.length;
    $("#duo-summary").textContent = `已勾選 ${state.selected.size} 道　·　可領取 ${ready}／28${got ? `　·　已拿到 ${got}` : ""}${close ? `　·　${close} 道只差一個條件` : ""}　·　點卡片看還缺什麼`;

    list.innerHTML = groups.flatMap(({ title, items }) => {
      if (!items.length) return [];
      const cards = items.map((row) => {
        const { duo, blocked, met, progress, total, obtained } = row;
        const [g1, g2] = duo.gods.map((id) => GODS[id]);
        const closeOne = !met && !blocked && !obtained && progress === total - 1;
        const open = !state.runMode && state.expandedDuo === duo.id;
        const cls = [
          blocked ? "is-blocked" : "",
          met && !blocked && !obtained ? "is-ready" : "",
          obtained ? "is-on" : "",
          suggested.has(duo.id) ? "is-suggested" : "",
          closeOne ? "is-close" : "",
          open ? "is-open" : "",
        ].join(" ");
        return `<article class="duo-card ${cls}" data-duo="${duo.id}" style="--g1:${g1.color};--g2:${g2.color}">
          <div class="duo-names">
            <strong>${duo.nameZh}</strong>
            <small>${g1.nameZh} × ${g2.nameZh}</small>
          </div>
          <div class="progress"><span style="width:${(progress / total) * 100}%"></span></div>
          <p class="duo-req">${duo.effectZh}${duo.stat ? `（${duo.stat}）` : ""}</p>
          ${duoStatusSummary(row)}
          ${open ? `${gapsMarkup(duo)}${exclusiveWarnMarkup(row)}${duo.notes && !blocked ? `<p class="warn">${duo.notes}</p>` : ""}${obtainMarkup(duo, obtained)}` : ""}
        </article>`;
      });
      return [`<p class="duo-group-title">${title}</p>`, ...cards];
    }).join("");

    list.scrollTop = y;
    paintNeededBoons();
    renderLegendRail();
    renderRunDock(groups, suggested);
    renderDuoSheet();
  }

  function rankLegendaries() {
    const ranked = LEGENDARIES.map((boon) => ({ boon, ...legendaryGaps(boon) }));
    return [
      { title: "可領取", items: ranked.filter((x) => x.met && !x.blocked && !x.selected) },
      { title: "已勾選", items: ranked.filter((x) => x.selected && !x.blocked) },
      { title: "還差 1 道", items: ranked.filter((x) => !x.met && !x.blocked && x.progress === x.total - 1) },
      { title: "進行中", items: ranked.filter((x) => !x.met && !x.blocked && x.progress > 0 && x.progress < x.total - 1) },
      { title: "尚未開始", items: ranked.filter((x) => !x.met && !x.blocked && x.progress === 0) },
      { title: "無法使用", items: ranked.filter((x) => x.blocked) },
    ];
  }

  function renderLegendRail() {
    const list = $("#legend-list");
    const summary = $("#legend-summary");
    if (!list || !summary) return;
    const groups = rankLegendaries();
    const ready = groups[0].items.length;
    const close = groups[2].items.length;
    summary.textContent = `可領取 ${ready}／${LEGENDARIES.length}${close ? `　·　${close} 道只差一個條件` : ""}　·　點卡片看前置`;
    list.innerHTML = groups.flatMap(({ title, items }) => {
      if (!items.length) return [];
      const cards = items.map((row) => {
        const { boon, blocked, met, selected, progress, total, missingLabels } = row;
        const god = GODS[boon.god];
        const closeOne = !met && !blocked && progress === total - 1;
        const open = !state.runMode && state.expandedLegend === boon.id;
        const cls = [
          blocked ? "is-blocked" : "",
          met && !blocked ? "is-ready" : "",
          selected ? "is-on" : "",
          closeOne ? "is-close" : "",
          open ? "is-open" : "",
        ].join(" ");
        const summaryLine = blocked
          ? `<p class="warn">需要夜之鏡「${boon.soul === "stygian" ? "冥河靈魂" : "煉獄靈魂"}」</p>`
          : selected
            ? `<p class="warn" style="color:#8ee0ad">已勾選</p>`
            : met
              ? `<p class="warn" style="color:#8ee0ad">前置已滿足，下次遇見可能提供</p>`
              : `<p class="duo-missing">${closeOne ? "還差：" : "還缺："}${missingLabels.join("、")}</p>`;
        return `<article class="duo-card ${cls}" data-legend="${boon.id}" style="--g1:${god.color};--g2:${god.color}">
          <div class="duo-names">
            <strong>${boon.nameZh}</strong>
            <small>${god.nameZh} · 傳說</small>
          </div>
          <div class="progress"><span style="width:${(progress / total) * 100}%"></span></div>
          <p class="duo-req">${boon.effectZh}</p>
          ${summaryLine}
          ${open ? legendGapsMarkup(boon) : ""}
        </article>`;
      });
      return [`<p class="duo-group-title">${title}</p>`, ...cards];
    }).join("");
  }

  function renderRunDock(groups, suggested) {
    const track = $("#run-dock-track");
    const summary = $("#run-dock-summary");
    if (!track || !summary) return;
    const ready = groups[0].items;
    const close = groups[2].items;
    const progress = groups[3].items;
    const suggestedLocked = groups[4].items.filter((x) => suggested.has(x.duo.id));
    const legendGroups = rankLegendaries();
    const legendReady = legendGroups[0].items;
    const legendClose = legendGroups[2].items;
    const legendPills = [...legendReady, ...legendClose].map((row) => {
      const { boon, met, missingLabels } = row;
      const closeOne = !met;
      return `<button type="button" class="run-pill ${met ? "is-ready" : "is-close"} ${state.expandedLegend === boon.id ? "is-open" : ""}" data-legend="${boon.id}" data-run-legend="1">
        <strong>${boon.nameZh}</strong>
        <small>${met ? "傳說可領取" : `還差 ${missingLabels.join("、")}`}</small>
      </button>`;
    });
    const pills = [...ready, ...close, ...progress, ...suggestedLocked];
    summary.textContent = `可領取 ${ready.length}　·　還差 1 道 ${close.length}${legendReady.length || legendClose.length ? `　·　傳說 ${legendReady.length} 可領／${legendClose.length} 接近` : ""}`;
    const duoPills = pills.map((row) => {
        const { duo, blocked, met, obtained, exclusiveReady, progress, total, missingLabels } = row;
        const closeOne = !met && !blocked && !obtained && progress === total - 1;
        const cls = [
          met && !obtained ? "is-ready" : "",
          closeOne ? "is-close" : "",
          suggested.has(duo.id) ? "is-suggested" : "",
          state.expandedDuo === duo.id ? "is-open" : "",
        ].join(" ");
        let sub = met ? "可領取" : closeOne ? `還差 ${missingLabels.join("、")}` : (missingLabels.join("、") || "進行中");
        if (met && exclusiveReady?.length) sub = `與${exclusiveReady.map((d) => d.nameZh).join("、")}互斥`;
        return `<button type="button" class="run-pill ${cls}" data-duo="${duo.id}" data-run-duo="1">
          <strong>${duo.nameZh}</strong>
          <small>${sub}</small>
        </button>`;
      });
    track.innerHTML = duoPills.length || legendPills.length
      ? [...duoPills, ...legendPills].join("")
      : `<p class="meta">勾選神恩後，即將完成的雙重與傳說會出現在這裡。</p>`;
  }

  function renderDuoSheet() {
    const sheet = $("#duo-sheet");
    const card = $("#duo-sheet-card");
    if (!sheet || !card) return;
    if (!state.runMode || (!state.expandedDuo && !state.expandedLegend)) {
      sheet.hidden = true;
      return;
    }
    if (state.expandedLegend) {
      const boon = boonOf(state.expandedLegend);
      if (!boon) {
        sheet.hidden = true;
        return;
      }
      const gaps = legendaryGaps(boon);
      const god = GODS[boon.god];
      const closeOne = !gaps.met && !gaps.blocked && gaps.progress === gaps.total - 1;
      sheet.hidden = false;
      delete card.dataset.duo;
      card.dataset.legend = boon.id;
      card.innerHTML = `
        <div class="duo-names">
          <strong>${boon.nameZh}</strong>
          <small>${god.nameZh} · 傳說</small>
        </div>
        <p class="duo-req" style="margin-top:8px">${boon.effectZh}</p>
        ${gaps.blocked ? `<p class="warn">需要夜之鏡「${boon.soul === "stygian" ? "冥河靈魂" : "煉獄靈魂"}」</p>` : gaps.met ? `<p class="warn" style="color:#8ee0ad">前置已滿足，下次遇見可能提供</p>` : `<p class="duo-missing">${closeOne ? "還差：" : "還缺："}${gaps.missingLabels.join("、")}</p>`}
        ${legendGapsMarkup(boon)}
        <button type="button" class="ghost" data-close-sheet style="margin-top:12px">關閉</button>
      `;
      paintNeededBoons();
      return;
    }
    const duo = duoOf(state.expandedDuo);
    if (!duo) {
      sheet.hidden = true;
      return;
    }
    const gaps = duoGaps(duo);
    const [g1, g2] = duo.gods.map((id) => GODS[id]);
    sheet.hidden = false;
    delete card.dataset.legend;
    card.dataset.duo = duo.id;
    card.innerHTML = `
      <div class="duo-names">
        <strong>${duo.nameZh}</strong>
        <small>${g1.nameZh} × ${g2.nameZh}</small>
      </div>
      <p class="duo-req" style="margin-top:8px">${duo.effectZh}${duo.stat ? `（${duo.stat}）` : ""}</p>
      ${duoStatusSummary(gaps)}
      ${gapsMarkup(duo)}
      ${exclusiveWarnMarkup(gaps)}
      ${duo.notes && !gaps.blocked ? `<p class="warn">${duo.notes}</p>` : ""}
      ${obtainMarkup(duo, gaps.obtained)}
      <button type="button" class="ghost" data-close-sheet style="margin-top:12px">關閉</button>
    `;
    paintNeededBoons();
  }

  function jumpToBoon(id, duoId, legendId) {
    if (duoId) {
      state.expandedDuo = duoId;
      state.expandedLegend = null;
    }
    if (legendId) {
      state.expandedLegend = legendId;
      state.expandedDuo = null;
    }
    const boon = boonOf(id);
    if (state.runMode && boon) {
      state.slotFilter = ["attack", "special", "cast", "dash", "call"].includes(boon.slot) ? boon.slot : null;
      if (!state.slotFilter) state.godFilter = boon.god;
    }
    if (!weaponOf() || !aspectOf()) {
      showView("planner");
      return;
    }
    const filterDirty = state.godFilter !== "all" || state.search !== "" || Boolean(state.slotFilter) || state.runMode;
    state.highlightBoon = id;
    if (!state.runMode) {
      state.godFilter = "all";
      state.slotFilter = null;
    }
    state.search = "";
    const search = $("#boon-search");
    if (search) search.value = "";
    if (state.view !== "planner") showView("planner", { keepScroll: true });
    else if (filterDirty) renderPlanner();
    else paintNeededBoons();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(`boon-${id}`) || $(`[data-boon="${id}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: prefersLiteMotion() ? "auto" : "smooth", block: "center" });
        el.classList.add("is-focus");
        if (typeof el.focus === "function") el.focus({ preventScroll: true });
        setTimeout(() => {
          el.classList.remove("is-focus");
          if (state.highlightBoon === id) state.highlightBoon = null;
        }, 1800);
      });
    });
  }

  function renderDuoCatalog() {
    $("#duo-god-row").innerHTML = Object.values(GODS).filter((g) => g.id !== "hermes").map((g) => `
      <button class="duo-god ${state.duoGods.includes(g.id) ? "is-active" : ""}" data-duo-god="${g.id}" style="--g:${g.color}">${g.nameZh}</button>
    `).join("");

    const selectedGods = state.duoGods;
    const list = DUOS.filter((d) => {
      if (selectedGods.length === 0) return true;
      if (selectedGods.length === 1) return d.gods.includes(selectedGods[0]);
      return selectedGods.every((g) => d.gods.includes(g));
    });

    $("#duo-catalog").innerHTML = list.map((duo) => {
      const [g1, g2] = duo.gods.map((id) => GODS[id]);
      return `<article class="duo-card" data-duo="${duo.id}" style="--g1:${g1.color};--g2:${g2.color}">
        <div class="duo-names">
          <strong>${duo.nameZh}</strong>
          <small>${duo.name}</small>
        </div>
        <p class="meta" style="margin:8px 0">${g1.nameZh} × ${g2.nameZh}</p>
        <p class="duo-req">${duo.effectZh}${duo.stat ? ` · ${duo.stat}` : ""}</p>
        <div class="duo-gaps" style="margin-top:10px">
          ${duo.gods.map((gid) => `
            <div class="gap-row">
              <div class="gap-label"><strong>${GODS[gid].nameZh}</strong><span>下列擇一</span></div>
              <div class="gap-picks">${duo.req[gid].map(gapChip).join("")}</div>
            </div>
          `).join("")}
        </div>
        ${duo.notes ? `<p class="warn">${duo.notes}</p>` : ""}
        ${duo.incompatibleAspects?.length ? `<p class="warn">不相容：${duo.incompatibleAspects.map((id) => id === "beowulf" ? "貝奧武夫" : "希拉").join("、")}型態</p>` : ""}
        ${duo.exclusiveWith?.length ? `<p class="warn">互斥：${duo.exclusiveWith.map((id) => duoOf(id)?.nameZh || id).join("、")}</p>` : ""}
        ${duo.blockedByBoons?.length ? `<p class="warn">無法與${duo.blockedByBoons.map((id) => boonOf(id)?.nameZh || id).join("、")}並存</p>` : ""}
      </article>`;
    }).join("");
  }

  function toggleObtainedDuo(id) {
    const duo = duoOf(id);
    if (!duo) return;
    if (state.obtainedDuos.has(id)) {
      state.obtainedDuos.delete(id);
    } else {
      state.obtainedDuos.add(id);
      (duo.exclusiveWith || []).forEach((other) => state.obtainedDuos.delete(other));
    }
    persist();
    renderDuoRail();
  }

  function toggleBoon(id) {
    const boon = boonOf(id);
    if (!boon || isBoonDisabled(boon)) return;
    if (state.selected.has(id)) {
      state.selected.delete(id);
    } else {
      if (SLOT_KEYS.includes(boon.slot)) {
        for (const other of [...state.selected]) {
          if (other !== id && BOON_MAP[other]?.slot === boon.slot) state.selected.delete(other);
        }
      }
      state.selected.add(id);
    }
    persist();
    renderCoreSlots();
    renderBoonBoard();
    renderDuoRail();
  }

  function startEmbers() {
    const canvas = $("#embers");
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    let w = 0;
    let h = 0;
    let sparks = [];
    let frame = 0;
    let running = false;

    const resize = () => {
      w = canvas.width = innerWidth;
      h = canvas.height = innerHeight;
      const count = Math.min(48, Math.round((w * h) / 28000));
      sparks = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.3,
        v: Math.random() * 0.6 + 0.15,
        a: Math.random() * 0.45 + 0.15,
      }));
    };

    const stop = () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      ctx.clearRect(0, 0, w, h);
      canvas.hidden = true;
    };

    const tick = () => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      sparks.forEach((s) => {
        s.y -= s.v;
        s.x += Math.sin(s.y * 0.01) * 0.2;
        if (s.y < -4) { s.y = h + 4; s.x = Math.random() * w; }
        ctx.fillStyle = `rgba(232, 180, 80, ${s.a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      if (prefersLiteMotion()) {
        stop();
        return;
      }
      canvas.hidden = false;
      if (!sparks.length) resize();
      if (!running) {
        running = true;
        frame = requestAnimationFrame(tick);
      }
    };

    resize();
    addEventListener("resize", () => {
      if (running) resize();
    });
    document.addEventListener("visibilitychange", sync);
    motionLite.addEventListener?.("change", sync);
    const conn = navigator.connection;
    conn?.addEventListener?.("change", sync);
    sync();
    syncEmbers = sync;
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#share-build") || e.target.closest("#share-build-loadout")) {
      copyShare();
      return;
    }

    if (e.target.closest("#run-toggle")) {
      state.runMode = !state.runMode;
      if (!state.runMode) {
        state.slotFilter = null;
        state.expandedDuo = null;
        state.expandedLegend = null;
      }
      localStorage.setItem("hades-run", state.runMode ? "1" : "0");
      localStorage.setItem("hades-run-for", viewportLayout());
      persist();
      applyRunChrome();
      if (state.view === "planner") renderPlanner();
      return;
    }

    if (e.target.closest("[data-close-sheet]")) {
      state.expandedDuo = null;
      state.expandedLegend = null;
      closeDuoSheet();
      renderDuoRail();
      return;
    }

    const tab = e.target.closest(".tab");
    if (tab && tab.dataset.view) return showView(tab.dataset.view);

    if (e.target.closest("#brand-home") || e.target.closest("[data-goto='armory']") || e.target.closest("#back-armory")) {
      return showView("armory");
    }

    const weapon = e.target.closest("[data-weapon]");
    if (weapon) {
      state.weaponId = weapon.dataset.weapon;
      state.aspectId = null;
      persist();
      showView("aspect");
      return;
    }

    const aspect = e.target.closest("[data-aspect]");
    if (aspect) {
      state.aspectId = aspect.dataset.aspect;
      persist();
      showView("planner");
      return;
    }

    const slotBtn = e.target.closest("[data-slot-filter]");
    if (slotBtn) {
      const slot = slotBtn.dataset.slotFilter;
      state.slotFilter = state.slotFilter === slot ? null : slot;
      renderPlanner();
      return;
    }

    const runDuo = e.target.closest("[data-run-duo]");
    if (runDuo) {
      const id = runDuo.dataset.duo;
      state.expandedDuo = state.expandedDuo === id ? null : id;
      state.expandedLegend = null;
      renderDuoRail();
      return;
    }

    const god = e.target.closest("[data-god]");
    if (god) {
      state.godFilter = god.dataset.god;
      renderPlanner();
      return;
    }

    const jump = e.target.closest("[data-jump-boon]");
    if (jump) {
      e.preventDefault();
      const host = jump.closest("[data-duo], [data-legend]");
      jumpToBoon(jump.dataset.jumpBoon, host?.dataset.duo, host?.dataset.legend);
      return;
    }

    const soulBtn = e.target.closest("[data-soul]");
    if (soulBtn) {
      state.soul = soulBtn.dataset.soul === "stygian" ? "stygian" : "infernal";
      const removed = stripIncompatibleBoons();
      persist();
      renderRunSystems();
      renderPriorityList();
      renderCoreSlots();
      renderBoonBoard();
      renderDuoRail();
      if (removed.length) toast(`已取消不相容神恩：${removed.join("、")}`);
      return;
    }

    const keepBtn = e.target.closest("[data-keepsake]");
    if (keepBtn) {
      state.keepsake = keepBtn.dataset.keepsake || "";
      persist();
      renderRunSystems();
      renderPriorityList();
      renderDuoRail();
      const keep = keepsakeOf();
      $$("#god-filters [data-god]").forEach((el) => {
        const on = keep?.god && el.dataset.god === keep.god;
        el.classList.toggle("is-keep", on);
        if (el.dataset.god !== "all") {
          const name = GODS[el.dataset.god]?.nameZh || "";
          el.textContent = on ? `${name} · 信物` : name;
        }
      });
      return;
    }

    const hammerBtn = e.target.closest("[data-hammer]");
    if (hammerBtn) {
      const id = hammerBtn.dataset.hammer;
      if (state.hammers.has(id)) state.hammers.delete(id);
      else state.hammers.add(id);
      persist();
      renderRunSystems();
      renderCoreSlots();
      return;
    }

    const runLegend = e.target.closest("[data-run-legend]");
    if (runLegend) {
      const id = runLegend.dataset.legend;
      state.expandedLegend = state.expandedLegend === id ? null : id;
      state.expandedDuo = null;
      renderDuoRail();
      return;
    }

    const legendCard = e.target.closest("#legend-list [data-legend]");
    if (legendCard) {
      const id = legendCard.dataset.legend;
      state.expandedLegend = state.expandedLegend === id ? null : id;
      state.expandedDuo = null;
      renderDuoRail();
      return;
    }

    const obtainBtn = e.target.closest("[data-obtain-duo]");
    if (obtainBtn) {
      e.preventDefault();
      toggleObtainedDuo(obtainBtn.dataset.obtainDuo);
      return;
    }

    const duoCard = e.target.closest("#duo-list [data-duo]");
    if (duoCard) {
      const id = duoCard.dataset.duo;
      state.expandedDuo = state.expandedDuo === id ? null : id;
      state.expandedLegend = null;
      renderDuoRail();
      return;
    }

    const boon = e.target.closest("[data-boon]");
    if (boon) return toggleBoon(boon.dataset.boon);

    const duoGod = e.target.closest("[data-duo-god]");
    if (duoGod) {
      const id = duoGod.dataset.duoGod;
      if (state.duoGods.includes(id)) state.duoGods = state.duoGods.filter((x) => x !== id);
      else if (state.duoGods.length < 2) state.duoGods.push(id);
      else state.duoGods = [state.duoGods[1], id];
      renderDuoCatalog();
      writeHash();
      return;
    }

    if (e.target.closest("#reset-run")) {
      state.selected.clear();
      state.obtainedDuos.clear();
      persist();
      renderCoreSlots();
      renderBoonBoard();
      renderDuoRail();
    }
  });

  let searchTimer = 0;
  $("#boon-search").addEventListener("input", (e) => {
    state.search = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderPlanner(), 120);
  });

  window.addEventListener("hashchange", () => {
    if (!applyHash()) return;
    hydrating = true;
    persist();
    showView(state.view, { skipHash: true, keepScroll: true });
    hydrating = false;
  });

  hydrating = true;
  const fromUrl = applyHash();
  renderArmory();
  renderDuoCatalog();
  if (fromUrl) {
    persist();
    showView(state.view, { skipHash: true, keepScroll: true });
  } else {
    applyRunChrome();
    updateTitle();
  }
  hydrating = false;
  if (fromUrl) writeHash();
  startEmbers();

  function syncViewportLayout() {
    applyViewportAttrs();
    const next = runModeForViewport();
    if (next === state.runMode) return;
    state.runMode = next;
    if (!state.runMode) {
      state.slotFilter = null;
      state.expandedDuo = null;
      state.expandedLegend = null;
    }
    applyRunChrome();
    if (state.view === "planner") renderPlanner();
  }

  let viewportTimer = 0;
  const onViewportChange = () => {
    clearTimeout(viewportTimer);
    viewportTimer = setTimeout(syncViewportLayout, 80);
  };
  addEventListener("resize", onViewportChange);
  addEventListener("orientationchange", onViewportChange);
  window.visualViewport?.addEventListener("resize", onViewportChange);
  [
    "(max-width: 600px)",
    "(max-width: 820px) and (max-aspect-ratio: 2/3)",
    "(max-width: 1100px)",
    "(max-height: 540px)",
    "(orientation: landscape)",
  ].forEach((query) => {
    const mq = window.matchMedia(query);
    mq.addEventListener?.("change", onViewportChange);
  });
})();
