(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    view: "armory",
    weaponId: localStorage.getItem("hades-weapon") || null,
    aspectId: localStorage.getItem("hades-aspect") || null,
    schoolId: localStorage.getItem("hades-school") || "standard",
    selected: new Set((() => {
      try { return JSON.parse(localStorage.getItem("hades-selected") || "[]"); }
      catch { return []; }
    })()),
    godFilter: "all",
    search: "",
    duoGods: [],
    legendGod: "",
    expandedDuo: null,
    highlightBoon: null,
    slotFilter: null,
    soul: localStorage.getItem("hades-soul") === "stygian" ? "stygian" : "infernal",
    keepsake: localStorage.getItem("hades-keepsake") || "",
    companion: localStorage.getItem("hades-companion") || "",
    hammers: new Set((() => {
      try { return JSON.parse(localStorage.getItem("hades-hammers") || "[]"); }
      catch { return []; }
    })()),
    obtainedDuos: new Set((() => {
      try { return JSON.parse(localStorage.getItem("hades-obtained-duos") || "[]"); }
      catch { return []; }
    })()),
    keepSlots: {},
    keepFocus: null,
    keepHere: "",
    expandedLegend: null,
    railPanel: localStorage.getItem("hades-rail-panel") === "legends" ? "legends" : "duos",
    runMode: false,
    poms: {},
    pomStep: 1,
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
  const COMPANION_MAP = Object.fromEntries(COMPANIONS.map((c) => [c.id, c]));
  const LEGENDARIES = BOONS.filter((b) => b.slot === "legendary");
  const SLOT_KEYS = ["attack", "special", "cast", "dash", "call"];
  const SLOT_LABELS = { attack: "攻擊", special: "特殊", cast: "投彈", dash: "衝刺", call: "求援" };

  function keepIdOk(id) {
    return id && id !== "-" && KEEPSAKE_MAP[id] ? id : "";
  }

  function emptyKeepSlots() {
    return Object.fromEntries(REGIONS.map((r) => [r.id, ""]));
  }

  function parseKeepSlots(raw) {
    const slots = emptyKeepSlots();
    if (typeof raw === "string") {
      const parts = raw.split(",");
      const stride = parts.length >= 10 ? 2 : 1;
      REGIONS.forEach((r, i) => {
        slots[r.id] = keepIdOk(parts[i * stride] || "");
      });
      return slots;
    }
    if (raw && typeof raw === "object") {
      REGIONS.forEach((r) => {
        const row = raw[r.id];
        if (typeof row === "string") slots[r.id] = keepIdOk(row);
        else if (row && typeof row === "object") slots[r.id] = keepIdOk(row.during || "");
      });
    }
    return slots;
  }

  function serializeKeepSlots() {
    return REGIONS.map((r) => state.keepSlots[r.id] || "-").join(",");
  }

  function keepSlotsFilled() {
    return REGIONS.some((r) => state.keepSlots[r.id]);
  }

  function serializeObtainedDuos() {
    return [...state.obtainedDuos].filter((id) => DUO_MAP[id]).sort().join(",");
  }

  function parseObtainedDuos(raw) {
    return new Set(String(raw || "").split(",").filter((id) => id && DUO_MAP[id]));
  }

  const POM_MAX_HITS = 12;

  function boonCanPom(boon) {
    return Boolean(boon && boon.slot !== "legendary" && boon.god !== "hermes" && boon.god !== "chaos");
  }

  function parsePomHits(raw) {
    const fromArr = Array.isArray(raw)
      ? raw
      : [...String(raw || "")];
    return fromArr.map(Number).filter((n) => n === 1 || n === 2).slice(0, POM_MAX_HITS);
  }

  function parsePoms(raw) {
    const out = {};
    if (typeof raw === "string") {
      String(raw || "").split(",").forEach((part) => {
        const cut = part.indexOf(":");
        if (cut < 1) return;
        const id = part.slice(0, cut);
        if (!BOON_MAP[id] || !boonCanPom(BOON_MAP[id])) return;
        const hits = parsePomHits(part.slice(cut + 1));
        if (hits.length) out[id] = hits;
      });
      return out;
    }
    if (raw && typeof raw === "object") {
      Object.keys(raw).forEach((id) => {
        if (!BOON_MAP[id] || !boonCanPom(BOON_MAP[id])) return;
        const hits = parsePomHits(raw[id]);
        if (hits.length) out[id] = hits;
      });
    }
    return out;
  }

  function prunePoms() {
    Object.keys(state.poms).forEach((id) => {
      if (!state.selected.has(id) || !boonCanPom(BOON_MAP[id])) delete state.poms[id];
    });
  }

  function serializePoms() {
    prunePoms();
    return Object.keys(state.poms).sort().map((id) => `${id}:${state.poms[id].join("")}`).join(",");
  }

  function pomHits(id) {
    return state.poms[id] || [];
  }

  const POM_PIP_SVG = `<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M6 0.4 L8.1 3.2 H3.9 Z"/><ellipse cx="6" cy="8.6" rx="5" ry="5.05"/></svg>`;

  function clearBoonPoms(id) {
    delete state.poms[id];
  }

  function addPom(id, step) {
    const n = step === 2 ? 2 : 1;
    const boon = BOON_MAP[id];
    if (!id || !boonCanPom(boon) || isBoonDisabled(boon)) return;
    if (!state.selected.has(id)) {
      if (SLOT_KEYS.includes(boon.slot)) {
        for (const other of [...state.selected]) {
          if (other !== id && BOON_MAP[other]?.slot === boon.slot) {
            state.selected.delete(other);
            clearBoonPoms(other);
          }
        }
      }
      state.selected.add(id);
    }
    const hits = pomHits(id);
    if (hits.length >= POM_MAX_HITS) {
      toast("這道祝福的石榴已記滿");
      return;
    }
    state.poms[id] = [...hits, n];
    persist();
    renderCoreSlots();
    renderBoonBoard();
    renderDuoRail();
    renderRunSystems();
  }

  function removePomHit(id, index) {
    const hits = [...pomHits(id)];
    const i = Number(index);
    if (!id || !Number.isInteger(i) || i < 0 || i >= hits.length) return;
    hits.splice(i, 1);
    if (hits.length) state.poms[id] = hits;
    else delete state.poms[id];
    persist();
    renderCoreSlots();
    renderBoonBoard();
    renderRunSystems();
  }

  function pomAddMarkup(boonId) {
    const boon = BOON_MAP[boonId];
    if (!boonCanPom(boon) || isBoonDisabled(boon)) return "";
    return `<span class="pom-add" data-pom-boon="${boonId}">
      <i class="pom-pip is-single" data-pom-add="1" role="button" title="力量石榴 +1">${POM_PIP_SVG}</i>
      <i class="pom-pip is-double" data-pom-add="2" role="button" title="力量石榴 +2">${POM_PIP_SVG}</i>
    </span>`;
  }

  function pomPipsMarkup(boonId, { interactive = true } = {}) {
    if (!boonCanPom(BOON_MAP[boonId])) return "";
    if (interactive && !state.selected.has(boonId)) return "";
    const hits = pomHits(boonId);
    if (!hits.length) return "";
    const nodes = hits.map((n, i) => {
      const cls = n === 2 ? "is-double" : "is-single";
      const hit = interactive ? ` data-pom-hit="${i}" role="button" title="拿掉這顆石榴"` : "";
      return `<i class="pom-pip ${cls}"${hit}>${POM_PIP_SVG}</i>`;
    });
    return `<span class="pom-pips${interactive ? "" : " is-static"}"${interactive ? ` data-pom-boon="${boonId}"` : ""}>${nodes.join("")}</span>`;
  }

  function keepSlotId(regionId) {
    return state.keepSlots[regionId] || "";
  }

  function keepRecId(regionId) {
    const i = REGIONS.findIndex((r) => r.id === regionId);
    const row = i >= 0 ? keepsakeRoute()[i] : null;
    return row?.duringId || "";
  }

  function keepRecWhy(regionId) {
    const i = REGIONS.findIndex((r) => r.id === regionId);
    const row = i >= 0 ? keepsakeRoute()[i] : null;
    return row?.duringWhy || "";
  }

  function keepChipInfo(regionId) {
    const filled = keepSlotId(regionId);
    const rec = keepRecId(regionId);
    const id = filled || rec || "";
    return {
      id,
      keep: KEEPSAKE_MAP[id] || null,
      filled: Boolean(filled),
      rec: !filled && Boolean(rec),
      current: Boolean(id) && id === state.keepsake,
    };
  }

  function validKeepHere(id) {
    return REGIONS.some((r) => r.id === id) ? id : "";
  }

  function keepHereWearId() {
    if (!state.keepHere) return "";
    return keepSlotId(state.keepHere) || keepRecId(state.keepHere) || "";
  }

  function wearKeepHere() {
    const id = keepHereWearId();
    if (id) state.keepsake = id;
  }

  state.keepSlots = parseKeepSlots((() => {
    try { return JSON.parse(localStorage.getItem("hades-keep-slots") || "null"); }
    catch { return null; }
  })());
  state.keepHere = validKeepHere(localStorage.getItem("hades-keep-here") || "");
  state.poms = parsePoms((() => {
    try { return JSON.parse(localStorage.getItem("hades-poms") || "null"); }
    catch { return null; }
  })());
  prunePoms();
  state.pomStep = (() => {
    const saved = localStorage.getItem("hades-pom-step");
    if (saved === "1" || saved === "2") return Number(saved);
    return state.obtainedDuos.has("sweet-nectar") ? 2 : 1;
  })();
  const motionLite = window.matchMedia("(prefers-reduced-motion: reduce)");

  function prefersLiteMotion() {
    return motionLite.matches
      || navigator.connection?.saveData
      || document.hidden
      || document.body.classList.contains("is-run");
  }

  const weaponOf = () => WEAPON_MAP[state.weaponId];
  const aspectOf = () => weaponOf()?.aspects.find((a) => a.id === state.aspectId);
  function aspectSchools(aspect = aspectOf()) {
    if (!aspect) return [];
    const first = (aspect.notes || "").split("。").find(Boolean);
    const standard = {
      id: "standard",
      nameZh: aspect.playstyle || "標準",
      blurbZh: first ? `${first}。` : "",
      gods: aspect.gods || [],
      slots: aspect.slots || {},
      duos: aspect.duos || [],
      notes: aspect.notes || "",
    };
    if (aspect.extras) standard.extras = aspect.extras;
    if (aspect.pom) standard.pom = aspect.pom;
    return [standard, ...(aspect.schools || [])];
  }
  function schoolOf() {
    const schools = aspectSchools();
    return schools.find((s) => s.id === state.schoolId) || schools[0] || null;
  }
  function normalizeSchool() {
    const schools = aspectSchools();
    if (!schools.length) return;
    if (!schools.some((s) => s.id === state.schoolId)) state.schoolId = "standard";
  }
  const boonOf = (id) => BOON_MAP[id];
  const duoOf = (id) => DUO_MAP[id];
  const godOf = (id) => GODS[id];
  let hydrating = false;
  let toastTimer = 0;
  let syncEmbers = () => {};

  function persist() {
    normalizeHammers();
    normalizeSchool();
    localStorage.setItem("hades-selected", JSON.stringify([...state.selected]));
    if (state.weaponId) localStorage.setItem("hades-weapon", state.weaponId);
    if (state.aspectId) localStorage.setItem("hades-aspect", state.aspectId);
    if (state.schoolId && state.schoolId !== "standard") localStorage.setItem("hades-school", state.schoolId);
    else localStorage.removeItem("hades-school");
    localStorage.setItem("hades-soul", state.soul);
    if (state.keepsake) localStorage.setItem("hades-keepsake", state.keepsake);
    else localStorage.removeItem("hades-keepsake");
    if (state.companion) localStorage.setItem("hades-companion", state.companion);
    else localStorage.removeItem("hades-companion");
    localStorage.setItem("hades-keep-slots", JSON.stringify(state.keepSlots = parseKeepSlots(state.keepSlots)));
    if (state.keepHere) localStorage.setItem("hades-keep-here", state.keepHere);
    else localStorage.removeItem("hades-keep-here");
    localStorage.setItem("hades-hammers", JSON.stringify([...state.hammers]));
    localStorage.setItem("hades-obtained-duos", JSON.stringify([...state.obtainedDuos]));
    prunePoms();
    localStorage.setItem("hades-poms", JSON.stringify(state.poms));
    localStorage.setItem("hades-pom-step", state.pomStep === 2 ? "2" : "1");
    localStorage.setItem("hades-rail-panel", state.railPanel === "legends" ? "legends" : "duos");
    if (!hydrating) writeHash();
  }

  function buildHash() {
    if (state.view === "duos") {
      return state.duoGods.length ? `duos/${state.duoGods.join("/")}` : "duos";
    }
    if (state.view === "legends") {
      return state.legendGod ? `legends/${state.legendGod}` : "legends";
    }
    if (state.view === "aspect" && state.weaponId) return `aspect/${state.weaponId}`;
    if (state.view === "planner" && state.weaponId && state.aspectId) {
      const parts = [];
      const boons = [...state.selected].sort().join(",");
      parts.push(`b=${boons}`);
      if (state.soul === "stygian") parts.push("soul=stygian");
      if (state.keepsake && KEEPSAKE_MAP[state.keepsake]) parts.push(`k=${state.keepsake}`);
      if (state.companion && COMPANION_MAP[state.companion]) parts.push(`c=${state.companion}`);
      parts.push(`kr=${serializeKeepSlots()}`);
      if (state.keepHere) parts.push(`here=${state.keepHere}`);
      parts.push(`d=${serializeObtainedDuos()}`);
      parts.push(`p=${serializePoms()}`);
      const hammers = thisWeaponHammers().join(",");
      if (hammers) parts.push(`h=${hammers}`);
      if (state.schoolId && state.schoolId !== "standard") parts.push(`school=${state.schoolId}`);
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
      state.duoGods = segs.slice(1).filter((id) => GODS[id] && !GODS[id].noDuo).slice(0, 2);
      return true;
    }
    if (view === "legends") {
      state.view = "legends";
      const godId = segs[1] || "";
      state.legendGod = legendCatalogGodOk(godId) ? godId : "";
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
      if (params.has("school")) state.schoolId = params.get("school") || "standard";
      else if (params.has("b")) state.schoolId = "standard";
      if (params.has("b")) {
        const rawB = params.get("b") || "";
        state.selected = new Set(rawB.split(",").filter((id) => id && BOON_MAP[id]));
        state.soul = params.get("soul") === "stygian" ? "stygian" : "infernal";
        const keepId = params.get("k") || "";
        state.keepsake = KEEPSAKE_MAP[keepId] ? keepId : "";
        const companionId = params.get("c") || "";
        state.companion = COMPANION_MAP[companionId] ? companionId : "";
        if (params.has("kr")) state.keepSlots = parseKeepSlots(params.get("kr") || "");
        if (params.has("here")) state.keepHere = validKeepHere(params.get("here") || "");
        if (state.keepHere) wearKeepHere();
        if (params.has("d")) state.obtainedDuos = parseObtainedDuos(params.get("d"));
        if (params.has("p")) state.poms = parsePoms(params.get("p") || "");
        prunePoms();
        const otherHammers = [...state.hammers].filter((id) => HAMMER_MAP[id]?.weapon !== weapon.id);
        const incoming = params.has("h")
          ? params.get("h").split(",").filter((id) => HAMMER_MAP[id]?.weapon === weapon.id).slice(0, 2)
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
      document.title = "冥府祝福 · Hades 祝福規劃";
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
      : "Hades 祝福規劃";
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

  const SHARE_FONT_DISPLAY = '"Cinzel", Palatino, "Songti TC", serif';
  const SHARE_FONT_SANS = '"Noto Sans TC", "PingFang TC", "Hiragino Sans CNS", "Microsoft JhengHei", sans-serif';
  const SHARE_FONT_SERIF = '"Noto Serif TC", "Songti TC", "LiSong Pro", Palatino, serif';
  let shareMenuAnchor = null;

  function closeShareMenu() {
    const menu = $("#share-menu");
    if (!menu || menu.hidden) {
      shareMenuAnchor = null;
      return;
    }
    menu.hidden = true;
    shareMenuAnchor = null;
    $$("[aria-controls='share-menu']").forEach((el) => el.setAttribute("aria-expanded", "false"));
  }

  function openShareMenu(anchor) {
    const menu = $("#share-menu");
    if (!menu || !anchor) return;
    shareMenuAnchor = anchor;
    menu.hidden = false;
    $$("[aria-controls='share-menu']").forEach((el) => {
      el.setAttribute("aria-expanded", el === anchor ? "true" : "false");
    });
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = r.right - mw;
    if (left < 8) left = 8;
    if (left + mw > innerWidth - 8) left = Math.max(8, innerWidth - mw - 8);
    let top = r.bottom + 8;
    if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function buildShareCard() {
    const weapon = weaponOf();
    const aspect = aspectOf();
    if (!weapon || !aspect) return null;
    writeHash();
    const school = schoolOf();
    const slots = SLOT_KEYS.map((slot) => {
      const boon = selectedInSlot(slot);
      const shown = boon ? displayBoonName(boon) : null;
      const god = boon ? GODS[boon.god] : null;
      const poms = boon ? pomHits(boon.id) : [];
      return {
        label: SLOT_LABELS[slot],
        nameZh: shown?.nameZh || "—",
        godZh: god?.nameZh || "",
        color: god?.color || "",
        filled: Boolean(boon),
        poms,
      };
    });
    const support = selectedSupportBoons().map((b) => {
      const god = GODS[b.god];
      return {
        nameZh: displayBoonName(b).nameZh,
        godZh: god?.nameZh || "",
        color: god?.color || "",
        legendary: b.slot === "legendary",
        poms: pomHits(b.id),
      };
    });
    const duos = [...state.obtainedDuos]
      .map((id) => duoOf(id))
      .filter(Boolean)
      .map((d) => ({
        nameZh: d.nameZh,
        gods: d.gods.map((g) => GODS[g]?.nameZh).filter(Boolean).join(" × "),
      }));
    const keep = keepsakeOf();
    const here = REGIONS.find((r) => r.id === state.keepHere);
    return {
      weaponEn: `${weapon.name} · Aspect of ${aspect.name}`,
      weaponZh: `${weapon.nameZh} · ${aspect.nameZh}`,
      accent: weapon.accent || "#c9a227",
      schoolZh: school?.nameZh || "",
      soulZh: state.soul === "stygian" ? "冥河靈魂" : "煉獄靈魂",
      slots,
      keepsake: keep ? keep.nameZh : "",
      companion: companionOf()?.nameZh || "",
      hereZh: here?.nameZh || "",
      keepRoute: REGIONS.map((r) => ({
        label: r.nameZh,
        value: KEEPSAKE_MAP[keepSlotId(r.id)]?.nameZh || "—",
        filled: Boolean(keepSlotId(r.id)),
        here: state.keepHere === r.id,
      })),
      hammers: thisWeaponHammers().map((id) => HAMMER_MAP[id]?.nameZh).filter(Boolean),
      support,
      duos,
    };
  }

  function wrapShareText(ctx, text, maxWidth) {
    const chars = [...String(text || "")];
    const lines = [];
    let line = "";
    chars.forEach((ch) => {
      const next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function roundShareRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
    else ctx.rect(x, y, w, h);
  }

  function drawSharePomDots(ctx, x, y, hits) {
    let dx = x;
    (hits || []).forEach((n) => {
      ctx.beginPath();
      ctx.arc(dx + 4, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = n === 2 ? "#e8c35a" : "#e07a9a";
      ctx.fill();
      dx += 11;
    });
  }

  function drawShareChip(ctx, x, y, text, color) {
    ctx.font = `700 18px ${SHARE_FONT_SANS}`;
    const padX = 14;
    const h = 34;
    const w = ctx.measureText(text).width + padX * 2;
    roundShareRect(ctx, x, y, w, h, 17);
    ctx.fillStyle = "rgba(201, 162, 39, 0.10)";
    ctx.fill();
    ctx.strokeStyle = color || "rgba(201, 162, 39, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#f0d37a";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + padX, y + h / 2);
    ctx.textBaseline = "top";
    return w;
  }

  function layoutShareChips(ctx, items, maxWidth, font, padX, gap) {
    ctx.font = font;
    const rows = [];
    let row = [];
    let x = 0;
    items.forEach((item) => {
      const pomW = item.poms?.length ? item.poms.length * 11 + 8 : 0;
      const w = Math.min(maxWidth, Math.ceil(ctx.measureText(item.text).width) + padX * 2 + pomW);
      if (row.length && x + w > maxWidth) {
        rows.push(row);
        row = [];
        x = 0;
      }
      row.push({ ...item, w });
      x += w + gap;
    });
    if (row.length) rows.push(row);
    return rows;
  }

  function drawSharePng(card) {
    const scale = 2;
    const width = 1080;
    const pad = 56;
    const inner = width - pad * 2;
    const gap = 12;
    const cols = 5;
    const tileW = (inner - gap * (cols - 1)) / cols;
    const slotH = 172;
    const keepH = 128;
    const chipH = 40;
    const chipGap = 10;
    const chipFont = `700 20px ${SHARE_FONT_SANS}`;
    const measure = document.createElement("canvas").getContext("2d");

    const hammerChips = layoutShareChips(
      measure,
      card.hammers.map((text) => ({ text, color: "#c4783a" })),
      inner,
      chipFont,
      16,
      chipGap,
    );
    const supportChips = layoutShareChips(
      measure,
      card.support.map((row) => ({
        text: row.legendary ? `${row.nameZh} · 傳奇` : row.nameZh,
        color: row.color || "#c9a227",
        poms: row.poms || [],
      })),
      inner,
      chipFont,
      16,
      chipGap,
    );
    const duoChips = layoutShareChips(
      measure,
      card.duos.map((row) => ({ text: row.nameZh, color: "#c9a227" })),
      inner,
      chipFont,
      16,
      chipGap,
    );

    const chipsBlock = (rows) => (rows.length ? 26 + rows.length * (chipH + 8) + 12 : 0);
    const weaponProbe = document.createElement("canvas").getContext("2d");
    weaponProbe.font = `700 34px ${SHARE_FONT_SERIF}`;
    const weaponLines = wrapShareText(weaponProbe, card.weaponZh, inner);

    let height = pad;
    height += 108 + weaponLines.length * 42 + 58;
    height += 26 + slotH + 28;
    height += 26 + keepH + 28;
    height += chipsBlock(hammerChips);
    height += chipsBlock(supportChips);
    height += chipsBlock(duoChips);
    height += 64 + pad;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#1a0a0a");
    bg.addColorStop(0.4, "#090505");
    bg.addColorStop(1, "#120808");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * 0.22, 80, 20, width * 0.22, 120, 520);
    glow.addColorStop(0, "rgba(138, 28, 28, 0.42)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    const goldGlow = ctx.createRadialGradient(width * 0.82, 70, 10, width * 0.82, 70, 280);
    goldGlow.addColorStop(0, "rgba(201, 162, 39, 0.14)");
    goldGlow.addColorStop(1, "transparent");
    ctx.fillStyle = goldGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(201, 162, 39, 0.38)";
    ctx.lineWidth = 2;
    roundShareRect(ctx, 18, 18, width - 36, height - 36, 26);
    ctx.stroke();
    ctx.strokeStyle = card.accent || "#c9a227";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(18, 48);
    ctx.lineTo(18, height - 48);
    ctx.stroke();

    let y = pad;
    ctx.font = `700 16px ${SHARE_FONT_DISPLAY}`;
    ctx.fillStyle = "#c9a227";
    ctx.fillText("INFERNAL BLESSINGS", pad, y);
    ctx.textAlign = "right";
    ctx.fillText("HOUSE OF HADES", width - pad, y);
    ctx.textAlign = "left";
    y += 28;
    ctx.font = `700 42px ${SHARE_FONT_SERIF}`;
    ctx.fillStyle = "#f0d37a";
    ctx.fillText("冥府祝福", pad, y);
    y += 52;
    ctx.font = `700 16px ${SHARE_FONT_DISPLAY}`;
    ctx.fillStyle = card.accent || "#c9a227";
    ctx.fillText(card.weaponEn, pad, y);
    y += 26;
    ctx.font = `700 34px ${SHARE_FONT_SERIF}`;
    ctx.fillStyle = "#f4e7c8";
    weaponLines.forEach((line) => {
      ctx.fillText(line, pad, y);
      y += 42;
    });
    y += 4;

    let chipX = pad;
    if (card.schoolZh) chipX += drawShareChip(ctx, chipX, y, card.schoolZh, card.accent) + 8;
    chipX += drawShareChip(ctx, chipX, y, card.soulZh, "#c9a227") + 8;
    if (card.keepsake) chipX += drawShareChip(ctx, chipX, y, `佩戴 ${card.keepsake}`, "#c9a227") + 8;
    if (card.companion) drawShareChip(ctx, chipX, y, `伴偶 ${card.companion}`, "#c9a227");
    y += 50;

    const rule = () => {
      ctx.strokeStyle = "rgba(201, 162, 39, 0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();
      y += 20;
    };
    rule();

    const sectionTitle = (left, right) => {
      ctx.font = `700 15px ${SHARE_FONT_SANS}`;
      ctx.fillStyle = "#c9a227";
      ctx.fillText(left, pad, y);
      if (right) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#f0d37a";
        ctx.fillText(right, width - pad, y);
        ctx.textAlign = "left";
      }
      y += 26;
    };

    const drawTiles = (items, h, paint) => {
      items.forEach((item, i) => {
        paint(item, pad + i * (tileW + gap), y, tileW, h);
      });
      y += h + 28;
    };

    sectionTitle("五欄祝福");
    drawTiles(card.slots, slotH, (slot, x, ty, w, h) => {
      roundShareRect(ctx, x, ty, w, h, 16);
      ctx.fillStyle = "rgba(22, 10, 10, 0.82)";
      ctx.fill();
      ctx.fillStyle = slot.filled ? slot.color : "rgba(201, 162, 39, 0.28)";
      ctx.fillRect(x, ty, 5, h);
      ctx.font = `700 14px ${SHARE_FONT_SANS}`;
      ctx.fillStyle = "#b9a789";
      ctx.fillText(slot.label, x + 16, ty + 14);
      ctx.font = `700 22px ${SHARE_FONT_SANS}`;
      ctx.fillStyle = slot.filled ? "#f4e7c8" : "#b9a789";
      wrapShareText(ctx, slot.nameZh, w - 28).slice(0, 3).forEach((line, li) => {
        ctx.fillText(line, x + 16, ty + 40 + li * 28);
      });
      if (slot.godZh) {
        ctx.font = `700 14px ${SHARE_FONT_SANS}`;
        ctx.fillStyle = slot.color || "#b9a789";
        ctx.fillText(slot.godZh, x + 16, ty + h - 28);
      }
      if (slot.poms?.length) {
        const gw = slot.godZh ? ctx.measureText(slot.godZh).width + 10 : 0;
        drawSharePomDots(ctx, x + 16 + gw, ty + h - 22, slot.poms);
      }
    });

    sectionTitle("信物路線", card.hereZh ? `在${card.hereZh}` : "");
    drawTiles(card.keepRoute, keepH, (row, x, ty, w, h) => {
      roundShareRect(ctx, x, ty, w, h, 16);
      ctx.fillStyle = row.here ? "rgba(201, 162, 39, 0.12)" : "rgba(22, 10, 10, 0.82)";
      ctx.fill();
      if (row.here) {
        ctx.strokeStyle = "rgba(201, 162, 39, 0.7)";
        ctx.lineWidth = 1.5;
        roundShareRect(ctx, x, ty, w, h, 16);
        ctx.stroke();
      }
      ctx.font = `700 13px ${SHARE_FONT_SANS}`;
      ctx.fillStyle = "#c9a227";
      ctx.fillText(row.here ? "這裡" : row.label, x + 14, ty + 14);
      if (row.here) {
        ctx.fillStyle = "#b9a789";
        ctx.fillText(row.label, x + 14, ty + 34);
      }
      ctx.font = `700 20px ${SHARE_FONT_SANS}`;
      ctx.fillStyle = row.filled ? "#f4e7c8" : "#b9a789";
      const nameY = row.here ? ty + 58 : ty + 44;
      wrapShareText(ctx, row.value, w - 28).slice(0, 2).forEach((line, li) => {
        ctx.fillText(line, x + 14, nameY + li * 26);
      });
    });

    const drawChipRows = (title, rows) => {
      if (!rows.length) return;
      sectionTitle(title);
      rows.forEach((row) => {
        let x = pad;
        row.forEach((chip) => {
          roundShareRect(ctx, x, y, chip.w, chipH, 12);
          ctx.fillStyle = "rgba(22, 10, 10, 0.82)";
          ctx.fill();
          ctx.fillStyle = chip.color || "#c9a227";
          ctx.fillRect(x, y + 8, 4, chipH - 16);
          ctx.font = chipFont;
          ctx.fillStyle = "#f4e7c8";
          ctx.textBaseline = "middle";
          ctx.fillText(chip.text, x + 16, y + chipH / 2);
          if (chip.poms?.length) {
            drawSharePomDots(ctx, x + 16 + ctx.measureText(chip.text).width + 8, y + chipH / 2, chip.poms);
          }
          ctx.textBaseline = "top";
          x += chip.w + chipGap;
        });
        y += chipH + 8;
      });
      y += 12;
    };

    drawChipRows("狄德勒斯之錘", hammerChips);
    drawChipRows("其他／傳奇", supportChips);
    drawChipRows("已拿到雙重", duoChips);

    rule();
    ctx.font = `700 15px ${SHARE_FONT_DISPLAY}`;
    ctx.fillStyle = "#c9a227";
    ctx.fillText("INFERNAL BLESSINGS", pad, y);
    ctx.textAlign = "right";
    ctx.fillText("冥府祝福", width - pad, y);
    ctx.textAlign = "left";

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png");
    });
  }

  function downloadShareBlob(blob, name) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  }

  function sharePngStamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  async function exportSharePng() {
    const card = buildShareCard();
    if (!card) {
      toast("先選定武器與型態");
      return;
    }
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const blob = await drawSharePng(card);
      const fileName = `冥府祝福-${card.weaponZh.replace(/\s*·\s*/g, "-").replace(/\s+/g, "")}-${sharePngStamp()}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      try {
        if (viewportLayout() === "phone" && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: card.weaponZh,
            text: `Hades 配裝：${card.weaponZh}`,
          });
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
      try {
        if (navigator.clipboard?.write && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        }
      } catch { /* download still proceeds */ }
      downloadShareBlob(blob, fileName);
      toast("已下載配裝圖");
    } catch {
      toast("無法產生圖片，請改用複製連結");
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
    applyRailPanel();
    syncEmbers();
  }

  function railPanelOf(raw) {
    return raw === "legends" ? "legends" : "duos";
  }

  function applyRailPanel() {
    const panel = railPanelOf(state.railPanel);
    state.railPanel = panel;
    const rail = $("#duo-rail");
    if (rail) rail.dataset.panel = panel;
    $$("[data-rail-panel]").forEach((btn) => {
      const on = btn.dataset.railPanel === panel;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    const title = $("#rail-title");
    if (title) title.textContent = panel === "legends" ? "傳奇祝福" : "雙重祝福追蹤";
  }

  function setRailPanel(next) {
    const panel = railPanelOf(next);
    const changed = panel !== state.railPanel;
    state.railPanel = panel;
    localStorage.setItem("hades-rail-panel", panel);
    if (changed) {
      if (panel === "duos") state.expandedLegend = null;
      else state.expandedDuo = null;
    }
    applyRailPanel();
    if (changed && state.view === "planner") renderDuoRail();
  }

  function closeDuoSheet() {
    const sheet = $("#duo-sheet");
    if (sheet) sheet.hidden = true;
  }

  function showView(view, opts = {}) {
    closeShareMenu();
    state.view = view;
    $$(".view").forEach((el) => el.classList.toggle("is-active", el.dataset.view === view));
    $$(".tab").forEach((el) => el.classList.toggle("is-active", el.dataset.view === (view === "aspect" ? "armory" : view)));
    if (view === "planner") renderPlanner();
    if (view === "duos") renderDuoCatalog();
    if (view === "legends") renderLegendCatalog();
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

  function companionOf() {
    return COMPANION_MAP[state.companion] || null;
  }

  function godKeepsake(godId) {
    return KEEPSAKES.find((k) => k.god === godId)?.id || "";
  }

  const DEFAULT_EXTRAS = {
    artemis: ["pressure-points", "support-fire", "clean-kill"],
    athena: ["blinding-flash", "bronze-skin"],
    aphrodite: ["broken-resolve", "different-league"],
    zeus: ["static-discharge", "billowing-strength"],
    poseidon: ["razor-shoals", "hydraulic-might"],
    ares: ["impending-doom", "dire-misfortune"],
    dionysus: ["premium-vintage", "strong-drink"],
    demeter: ["ravenous-will", "rare-crop"],
    hermes: ["greater-evasion", "hyper-sprint"],
  };

  const SUPPORT_EXTRAS = {
    zeus: ["static-discharge", "storm-lightning", "high-voltage", "double-strike"],
    poseidon: ["razor-shoals", "typhoons-fury", "breaking-wave", "wave-pounding"],
    athena: ["blinding-flash", "brilliant-riposte", "bronze-skin"],
    aphrodite: ["broken-resolve", "sweet-surrender", "empty-inside"],
    artemis: ["pressure-points", "support-fire", "clean-kill"],
    ares: ["impending-doom", "dire-misfortune", "black-metal"],
    dionysus: ["numbing-sensation", "peer-pressure", "high-tolerance"],
    demeter: ["arctic-blast", "killing-freeze", "ravenous-will"],
    hermes: ["greater-evasion", "hyper-sprint", "rush-delivery"],
  };

  function aspectCoreIds(source = schoolOf()) {
    const order = ["attack", "special", "cast", "dash", "call"];
    return order.map((s) => source?.slots?.[s]).filter(Boolean);
  }

  function schoolSlotForGod(school, godId) {
    const slots = school?.slots || {};
    for (const slot of ["attack", "special", "cast", "dash", "call"]) {
      const id = slots[slot];
      if (id && BOON_MAP[id]?.god === godId) return id;
    }
    return "";
  }

  const OPENING_FALLBACK = {
    zeus: "lightning-strike",
    poseidon: "tempest-strike",
    athena: "divine-dash",
    aphrodite: "heartbreak-strike",
    artemis: "deadly-strike",
    ares: "curse-of-agony",
    dionysus: "drunken-strike",
    demeter: "frost-strike",
  };

  function openingOfferForGod(godId, school = schoolOf()) {
    if (!OPENING_FALLBACK[godId]) return null;
    const coreId = schoolSlotForGod(school, godId);
    if (coreId && BOON_MAP[coreId]) return { id: coreId, source: "core" };
    const fallbackId = OPENING_FALLBACK[godId];
    if (fallbackId && BOON_MAP[fallbackId]) return { id: fallbackId, source: "fallback" };
    return null;
  }

  function openingCoreIds(school = schoolOf()) {
    const ids = aspectCoreIds(school);
    const keep = keepsakeOf();
    if (keep?.type === "god" && keep.god) {
      const first = schoolSlotForGod(school, keep.god);
      if (first && ids.includes(first)) return [first, ...ids.filter((id) => id !== first)];
    } else if (keep?.type === "utility" && school?.slots?.dash) {
      const dash = school.slots.dash;
      if (ids.includes(dash)) return [dash, ...ids.filter((id) => id !== dash)];
    }
    return ids;
  }

  function openingCoreLabels(school = schoolOf(), { withGod = false } = {}) {
    return openingCoreIds(school).map((id) => {
      const b = boonOf(id);
      if (!b) return "";
      const name = displayBoonName(b).nameZh;
      const god = GODS[b.god]?.nameZh;
      return withGod && god ? `${name}（${god}）` : name;
    }).filter(Boolean);
  }

  function aspectExtraIds(source = schoolOf()) {
    if (source?.extras) return source.extras;
    const core = new Set(aspectCoreIds(source));
    const ids = [];
    (source?.gods || []).forEach((g) => {
      (DEFAULT_EXTRAS[g] || []).forEach((id) => {
        if (!core.has(id) && !ids.includes(id) && BOON_MAP[id]) ids.push(id);
      });
    });
    return ids.slice(0, 4);
  }

  function aspectPomIds(source = schoolOf()) {
    if (source?.pom) return source.pom;
    return [...aspectCoreIds(source), ...aspectExtraIds(source).slice(0, 2)];
  }

  function selectedCoreGods() {
    const gods = [];
    for (const id of state.selected) {
      const boon = BOON_MAP[id];
      if (!boon || !SLOT_KEYS.includes(boon.slot)) continue;
      if (!gods.includes(boon.god)) gods.push(boon.god);
    }
    return gods;
  }

  function selectedSupportBoons() {
    return [...state.selected]
      .map((id) => BOON_MAP[id])
      .filter((b) => b && (b.slot === "extra" || b.slot === "legendary"))
      .sort((a, b) => Number(a.slot === "legendary") - Number(b.slot === "legendary"));
  }

  function legendaryIsNear(boon) {
    if (!boon || isBoonDisabled(boon) || state.selected.has(boon.id)) return false;
    const gaps = legendaryGaps(boon);
    if (gaps.blocked) return false;
    return gaps.met || gaps.progress >= gaps.total - 1;
  }

  function suggestedSupportBoons() {
    const gods = selectedCoreGods();
    if (!gods.length) return { gods, boons: [] };
    const boons = [];
    const seen = new Set();
    gods.forEach((gid) => {
      const legends = LEGENDARIES.filter((b) => b.god === gid && legendaryIsNear(b) && !seen.has(b.id));
      const extras = (SUPPORT_EXTRAS[gid] || []).filter((id) => {
        if (seen.has(id) || state.selected.has(id)) return false;
        const boon = BOON_MAP[id];
        return boon && !isBoonDisabled(boon);
      });
      extras.slice(0, legends.length ? 3 : 4).forEach((id) => {
        seen.add(id);
        boons.push(BOON_MAP[id]);
      });
      legends.forEach((boon) => {
        seen.add(boon.id);
        boons.push(boon);
      });
    });
    return { gods, boons: boons.slice(0, 8) };
  }

  function supportChip(boon, { on = false, rec = false } = {}) {
    const shown = displayBoonName(boon);
    const g = GODS[boon.god];
    const star = boon.slot === "legendary" ? " ★" : "";
    const pips = on ? pomPipsMarkup(boon.id, { interactive: false }) : "";
    return `<button type="button" class="sys-chip ${on ? "is-on" : ""} ${rec ? "is-rec" : ""}" data-jump-boon="${boon.id}" ${g ? `style="--g:${g.color}"` : ""}>${shown.nameZh}${star}${pips}</button>`;
  }

  function keepsakeRoute(source = schoolOf()) {
    const gods = source?.gods || [];
    const g0 = godKeepsake(gods[0]);
    const g1 = godKeepsake(gods[1]);
    const g2 = gods[2] ? godKeepsake(gods[2]) : "lambent-plume";
    const n0 = gods[0] ? GODS[gods[0]].nameZh : "核心神";
    const n1 = gods[1] ? GODS[gods[1]].nameZh : "第二神";
    const n2 = gods[2] ? GODS[gods[2]].nameZh : "赫爾墨斯";
    return [
      { region: REGIONS[0], duringId: g0, bossId: "evergreen-acorn", duringWhy: `區內鎖 ${n0}`, bossWhy: "復仇女神前換橡子" },
      { region: REGIONS[1], duringId: g1, bossId: "evergreen-acorn", duringWhy: `區內鋪 ${n1}`, bossWhy: "海德拉前換橡子" },
      { region: REGIONS[2], duringId: g2, bossId: "evergreen-acorn", duringWhy: `區內 ${n2} 或羽毛`, bossWhy: "忒修斯前換橡子" },
      { region: REGIONS[3], duringId: "lucky-tooth", bossId: "lambent-plume", duringWhy: "牙齒保命", bossWhy: "或繼續疊羽毛" },
      { region: REGIONS[4], duringId: "evergreen-acorn", bossId: "lucky-tooth", duringWhy: "黑帝斯戰橡子", bossWhy: "或牙齒保命" },
    ];
  }

  function exclusiveHammerIds(hammer) {
    const ids = new Set(hammer?.exclusiveWith || []);
    HAMMERS.forEach((h) => {
      if (h.id !== hammer?.id && h.weapon === hammer?.weapon && h.exclusiveWith?.includes(hammer.id)) {
        ids.add(h.id);
      }
    });
    return [...ids];
  }

  function hammerOffAspect(hammer) {
    const aspectId = aspectOf()?.id;
    if (!hammer || !aspectId) return false;
    if (hammer.onlyAspects && !hammer.onlyAspects.includes(aspectId)) return true;
    if (hammer.blockedAspects?.includes(aspectId)) return true;
    return false;
  }

  function normalizeHammers() {
    const byWeapon = {};
    [...state.hammers].forEach((id) => {
      const h = HAMMER_MAP[id];
      if (!h) return;
      if (h.weapon === state.weaponId && hammerOffAspect(h)) return;
      const list = byWeapon[h.weapon] ||= [];
      if (list.length < 2) list.push(id);
    });
    state.hammers = new Set(Object.values(byWeapon).flat());
  }

  function thisWeaponHammers() {
    return [...state.hammers].filter((id) => HAMMER_MAP[id]?.weapon === state.weaponId).slice(0, 2);
  }

  function setHammerSlot(slotIndex, id) {
    const slot = slotIndex === 1 ? 1 : 0;
    const others = [...state.hammers].filter((hid) => HAMMER_MAP[hid]?.weapon !== state.weaponId);
    const slots = [thisWeaponHammers()[0] || "", thisWeaponHammers()[1] || ""];
    const incoming = id && HAMMER_MAP[id]?.weapon === state.weaponId && !hammerOffAspect(HAMMER_MAP[id]) ? id : "";
    if (slots[slot] === incoming) return;
    if (incoming && slots[1 - slot] === incoming) slots[1 - slot] = "";
    const removed = [];
    if (incoming) {
      exclusiveHammerIds(HAMMER_MAP[incoming]).forEach((ex) => {
        if (ex === incoming) return;
        if (slots[0] === ex) {
          slots[0] = "";
          removed.push(HAMMER_MAP[ex]?.nameZh || ex);
        }
        if (slots[1] === ex) {
          slots[1] = "";
          removed.push(HAMMER_MAP[ex]?.nameZh || ex);
        }
      });
    }
    slots[slot] = incoming;
    state.hammers = new Set([...others, ...slots.filter(Boolean)]);
    persist();
    renderRunSystems();
    renderCoreSlots();
    renderBoonBoard();
    const pill = $("[data-god='hammer']");
    if (pill) {
      const count = thisWeaponHammers().length;
      pill.textContent = `狄德勒斯之錘${count ? ` · ${count}` : ""}`;
      pill.classList.toggle("is-keep", count > 0);
    }
    if (removed.length) toast(`已取消互斥錘：${[...new Set(removed)].join("、")}`);
  }

  function stripIncompatibleBoons() {
    const removed = [];
    for (const id of [...state.selected]) {
      const boon = boonOf(id);
      if (boon && isBoonDisabled(boon)) {
        state.selected.delete(id);
        clearBoonPoms(id);
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
      return { ok, counts: true, label: "復仇祝福" };
    }
    if (duo.extraReq === "non-hades-aid") {
      const ok = BOONS.some((b) => b.slot === "call" && state.selected.has(b.id));
      return { ok, counts: true, label: "奧林帕斯求援" };
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
    if (soulBlocked) blockReason = "需要夜之聖鏡「煉獄靈魂」";
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
        label: "復仇祝福",
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
        label: "奧林帕斯求援",
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
    return new Set(schoolOf()?.duos || []);
  }

  function collectGapMissing(gaps, ids) {
    gaps.gods.forEach((g) => {
      if (!g.met) g.missing.forEach((id) => ids.add(id));
    });
    if (gaps.extra && !gaps.extra.met && gaps.extra.missing) {
      gaps.extra.missing.forEach((id) => ids.add(id));
    }
  }

  function neededBoonIds() {
    const ids = new Set();
    const duo = duoOf(state.expandedDuo);
    if (duo) collectGapMissing(duoGaps(duo), ids);
    const legend = boonOf(state.expandedLegend);
    if (legend) {
      legendaryGaps(legend).rows.forEach((row) => {
        if (!row.met && row.missing) row.missing.forEach((id) => ids.add(id));
      });
    }
    const suggested = suggestedDuoIds();
    DUOS.forEach((d) => {
      if (suggested.size && !suggested.has(d.id)) return;
      const gaps = duoGaps(d);
      if (gaps.obtained || gaps.blocked || gaps.met) return;
      if (gaps.progress !== gaps.total - 1) return;
      collectGapMissing(gaps, ids);
    });
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
        ? `<div class="gap-row is-met"><div class="gap-label"><strong>復仇祝福</strong><span style="color:#8ee0ad">已有 ${displayBoonName(boonOf(gaps.extra.owned[0])).nameZh}</span></div></div>`
        : `<div class="gap-row"><div class="gap-label"><strong>還缺復仇祝福</strong><span>下列擇一</span></div><div class="gap-picks">${revengeBoons().map((b) => gapChip(b.id)).join("")}</div></div>`;
    } else if (gaps.extra?.type === "soul") {
      extraRow = gaps.extra.met
        ? `<div class="gap-row is-met"><div class="gap-label"><strong>夜之聖鏡</strong><span style="color:#8ee0ad">已選煉獄靈魂</span></div></div>`
        : `<div class="gap-row"><div class="gap-label"><strong>還缺煉獄靈魂</strong><span>請在左側改選夜之聖鏡</span></div></div>`;
    } else if (gaps.extra?.type === "aid") {
      extraRow = gaps.extra.met
        ? `<div class="gap-row is-met"><div class="gap-label"><strong>奧林帕斯求援</strong><span style="color:#8ee0ad">已有 ${displayBoonName(boonOf(gaps.extra.owned[0])).nameZh}</span></div></div>`
        : `<div class="gap-row"><div class="gap-label"><strong>還缺奧林帕斯求援</strong><span>下列擇一（非黑帝斯）</span></div><div class="gap-picks">${gaps.extra.missing.map(gapChip).join("")}</div></div>`;
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
          ? `<div class="gap-row is-met"><div class="gap-label"><strong>夜之聖鏡</strong><span style="color:#8ee0ad">已選${row.label}</span></div></div>`
          : `<div class="gap-row"><div class="gap-label"><strong>還缺${row.label}</strong><span>請在左側改選夜之聖鏡</span></div></div>`;
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
        return `<button type="button" class="gap-chip" data-keep-pick="${keep.id}">信物：${keep.nameZh}</button>`;
      }).join("");
      return `<div class="gap-row">
        <div class="gap-label"><strong>還缺 ${row.label}</strong><span>${row.need ? `已有 ${row.have}/${row.need}` : "點名稱跳到祝福"}</span></div>
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

  function openingOfferFilled(offer) {
    const boon = boonOf(offer?.id);
    return Boolean(boon && selectedInSlot(boon.slot));
  }

  function openingOfferName(offer) {
    const boon = boonOf(offer?.id);
    return boon ? displayBoonName(boon).nameZh : "";
  }

  function openingOfferBlockNote(offer) {
    const name = openingOfferName(offer);
    if (!name) return "";
    const filled = openingOfferFilled(offer) ? "；該欄已有，可跳過或拿其他" : "";
    if (offer.source === "core") return `本房建議：${name}${filled}`;
    return `本房可拿：${name}（非本流派核心）${filled}`;
  }

  function openingOfferHintText(offer, godId) {
    const name = openingOfferName(offer);
    const godName = GODS[godId]?.nameZh || "";
    if (!name || !godName) return "";
    if (openingOfferFilled(offer)) return `遇到${godName}：該欄已有，可跳過或拿其他。`;
    if (offer.source === "core") return `遇到${godName}：拿${name}。`;
    return `遇到${godName}：可拿${name}（非本流派核心）。`;
  }

  function boonStatusLabel(boon) {
    if (!boon) return null;
    if (boon.god === "hermes") return "攻速";
    if (boon.god === "athena") return "反彈";
    if (boon.god === "poseidon") return "擊退";
    if (boon.god === "zeus") return "心驚膽戰";
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
      status: current ? (status || "已上祝福") : "尚未上祝福",
      filled: Boolean(current),
      color: current ? GODS[current.god]?.color : "",
    };
  }

  function renderCoreSlots() {
    const school = schoolOf();
    if (!school) return;
    $("#core-slots").innerHTML = Object.keys(SLOT_LABELS).map((slot) => {
      const rec = school.slots[slot] ? boonOf(school.slots[slot]) : null;
      const current = selectedInSlot(slot);
      const shown = current ? displayBoonName(current) : rec ? displayBoonName(rec) : null;
      const god = current ? GODS[current.god] : rec ? GODS[rec.god] : null;
      const pips = current ? pomPipsMarkup(current.id, { interactive: false }) : "";
      const label = current
        ? `${shown.nameZh}${pips}`
        : rec ? (state.runMode ? shown.nameZh : `建議：${shown.nameZh}`) : "未鎖定";
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
    renderPickedSupport();
  }

  function renderPickedSupport() {
    const el = $("#picked-support");
    if (!el || !aspectOf()) return;
    const picked = selectedSupportBoons();
    const { gods, boons: suggested } = suggestedSupportBoons();
    const godNames = gods.map((id) => GODS[id]?.nameZh).filter(Boolean);
    el.innerHTML = `
      <h3>其他／傳奇</h3>
      <p class="sys-label">已勾選</p>
      ${picked.length
        ? `<div class="keep-pills">${picked.map((b) => supportChip(b, { on: true })).join("")}</div>`
        : `<p class="picked-empty">尚未勾選其他或傳奇</p>`}
      ${suggested.length ? `
        <p class="sys-label">建議輔助</p>
        <div class="keep-pills">${suggested.map((b) => supportChip(b, { rec: true })).join("")}</div>
        <p class="sys-note">依目前${godNames.join("、")}方向</p>
      ` : ""}
    `;
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
    const school = schoolOf();
    const list = $("#priority-list");
    if (!school || !list) return;
    const keep = keepsakeOf();
    const here = REGIONS.find((r) => r.id === state.keepHere);
    const infernal = state.soul !== "stygian";
    const duos = (school.duos || []).map((id) => duoOf(id)?.nameZh).filter(Boolean);
    const line2 = [duos.length ? `衝 ${duos.join(" · ")}` : "", infernal ? "煉獄靈魂" : "冥河靈魂"].filter(Boolean).join("　·　");
    let line1 = "";
    if (keep?.type === "utility") {
      const picks = openingCoreLabels(school, { withGod: true }).join(" · ") || "核心欄位";
      const where = here ? `${here.nameZh} · ` : "";
      line1 = `${where}${keep.nameZh}不鎖神。第一間房依本型態優先：${picks}`;
    } else {
      const core = openingCoreLabels(school).join(" · ") || "核心欄位";
      const keepLabel = keep
        ? (here ? `${here.nameZh} · ${keep.nameZh}` : `目前佩戴 ${keep.nameZh}`)
        : `${GODS[school.gods[0]]?.nameZh || "核心神"}信物`;
      line1 = `${keepLabel} → ${core}`;
    }
    list.innerHTML = `${line1}<br>${line2}`;
  }

  function keepPaletteMarkup() {
    const keep = keepsakeOf();
    const focusId = state.keepFocus
      ? keepSlotId(state.keepFocus)
      : state.keepsake;
    const recId = state.keepFocus ? keepRecId(state.keepFocus) : "";
    const filledFocus = state.keepFocus ? keepSlotId(state.keepFocus) : "";
    const pill = (k) => {
      const g = k.god ? GODS[k.god] : null;
      const on = focusId === k.id;
      const rec = recId === k.id && !filledFocus;
      return `<button type="button" class="sys-chip ${on ? "is-on" : ""} ${rec ? "is-rec" : ""}" data-keep-pick="${k.id}" ${g ? `style="--g:${g.color}"` : ""}>${k.nameZh}</button>`;
    };
    const region = REGIONS.find((r) => r.id === state.keepFocus);
    const focusLabel = region ? region.nameZh : "";
    return `
      <div class="keep-palette">
        ${focusLabel ? `<p class="sys-label">選 ${focusLabel}</p>` : ""}
        <p class="sys-label">神祇</p>
        <div class="keep-pills">
          <button type="button" class="sys-chip ${!focusId ? "is-on" : ""}" data-keep-pick="">未佩戴</button>
          ${KEEPSAKES.filter((k) => k.type === "god").map(pill).join("")}
        </div>
        <p class="sys-label">生存／其他</p>
        <div class="keep-pills">
          ${KEEPSAKES.filter((k) => k.type !== "god").map(pill).join("")}
        </div>
        <p class="sys-note">${keep ? `${keep.nameZh}：${keep.effectZh}` : "點清單寫入這一區。空格上的淺色是建議，再點該格可確認。"}</p>
      </div>
    `;
  }

  function renderKeepRail() {
    const el = $("#keep-rail");
    if (!el) return;
    const aspect = aspectOf();
    if (!aspect) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    const keep = keepsakeOf();
    const here = REGIONS.find((r) => r.id === state.keepHere);
    const hereNote = here ? `在${here.nameZh}` : "";
    const wearNote = keep ? `佩戴 ${keep.nameZh}` : "尚未佩戴";
    el.innerHTML = `
      <div class="keep-rail-head">
        <h3>信物路線</h3>
        <p class="keep-rail-note">${[hereNote, wearNote].filter(Boolean).join(" · ")}</p>
      </div>
      <div class="keep-rail-track">
        ${REGIONS.map((region) => {
          const isHere = state.keepHere === region.id;
          const info = keepChipInfo(region.id);
          const focused = state.keepFocus === region.id;
          const why = info.rec ? `建議：${keepRecWhy(region.id)}` : (info.filled ? "開區佩戴" : "未選");
          const name = info.keep ? info.keep.nameZh : "—";
          const g = info.keep?.god ? GODS[info.keep.god] : null;
          const cls = [
            "sys-chip",
            info.current ? "is-on" : "",
            info.rec ? "is-rec" : "",
            info.filled && !info.current ? "is-set" : "",
            focused ? "is-focus" : "",
          ].filter(Boolean).join(" ");
          return `
          <div class="keep-region ${isHere ? "is-here" : ""}">
            <div class="keep-region-head">
              <strong>${region.nameZh}</strong>
              <button type="button" class="keep-here ${isHere ? "is-on" : ""}" data-keep-here="${region.id}" aria-pressed="${isHere}">我在這裡</button>
            </div>
            <button type="button" class="${cls}" data-keep-slot data-keep-region="${region.id}" ${g ? `style="--g:${g.color}"` : ""}>${name}<small>${why}</small></button>
          </div>
        `;
        }).join("")}
      </div>
      ${state.keepFocus ? keepPaletteMarkup() : `<p class="sys-note">${keep ? `${keep.nameZh}：${keep.effectZh}` : "點「我在這裡」標註所在區；點格子選該區開跑要戴的信物。"}</p>`}
    `;
  }

  function refreshKeepGodPills() {
    const keep = keepsakeOf();
    $$("#god-filters [data-god]").forEach((el) => {
      const on = keep?.god && el.dataset.god === keep.god;
      el.classList.toggle("is-keep", on);
      if (el.dataset.god !== "all" && el.dataset.god !== "hammer") {
        const name = GODS[el.dataset.god]?.nameZh || "";
        el.textContent = on ? `${name} · 信物` : name;
      }
    });
  }

  function applyKeepChange() {
    persist();
    renderKeepRail();
    renderPriorityList();
    refreshKeepGodPills();
    renderRunSystems();
    renderDuoRail();
  }

  function renderRunSystems() {
    const el = $("#run-systems");
    const aspect = aspectOf();
    if (!el || !aspect) return;
    const infernal = state.soul !== "stygian";
    const hammerSlots = thisWeaponHammers();
    el.innerHTML = `
      <section class="sys-block">
        <h3>夜之聖鏡</h3>
        <div class="sys-toggle" role="group" aria-label="靈魂">
          <button type="button" class="sys-chip ${infernal ? "is-on" : ""}" data-soul="infernal">煉獄靈魂</button>
          <button type="button" class="sys-chip ${!infernal ? "is-on" : ""}" data-soul="stygian">冥河靈魂</button>
        </div>
        <p class="sys-note">${infernal
          ? "血石會掉落。可拿引電血統、全副武裝、自動收回、拔箭留瘡。"
          : "血石自動回補。可拿自動填彈與當頭一棒。引電血統、全副武裝、自動收回與拔箭留瘡無法使用。"}</p>
      </section>
      <section class="sys-block hammer-block">
        <h3>狄德勒斯之錘</h3>
        ${hammerSlots.length
          ? `<div class="keep-pills">${hammerSlots.map((id) => {
            const h = HAMMER_MAP[id];
            return `<button type="button" class="sys-chip is-on" data-hammer="${id}">${h.nameZh}</button>`;
          }).join("")}</div>
            <p class="sys-note hammer-note">${hammerSlots.map((id) => HAMMER_MAP[id].effectZh).join(" ")}</p>`
          : `<p class="sys-note hammer-note">點上方篩選「狄德勒斯之錘」，勾選本輪拿到的改造。最多兩把。</p>`}
      </section>
      <section class="sys-block">
        <h3>力量石榴</h3>
        <p class="pom-legend">
          <i class="pom-pip is-single">${POM_PIP_SVG}</i> +1 級
          <i class="pom-pip is-double">${POM_PIP_SVG}</i> +2 級
        </p>
        <p class="sys-note">游標移到祝福上，點粉紅記 +1、金色記 +2，可記多顆。點名稱旁已放上的石榴可拿掉。赫爾墨斯與卡俄斯不用石榴。</p>
      </section>
      <section class="sys-block">
        <h3>伴偶</h3>
        <div class="keep-pills" role="group" aria-label="伴偶">
          <button type="button" class="sys-chip ${!state.companion ? "is-on" : ""}" data-companion="">未攜帶</button>
          ${COMPANIONS.map((c) =>
            `<button type="button" class="sys-chip ${state.companion === c.id ? "is-on" : ""}" data-companion="${c.id}">${c.nameZh}</button>`
          ).join("")}
        </div>
        <p class="sys-note">${(() => {
          const c = companionOf();
          return c ? `${c.nameZh}（${c.fromZh}）：${c.effectZh}` : "本輪只能帶一隻。點選伴偶記錄你帶進冥府的那一隻。";
        })()}</p>
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
      renderKeepRail();
      applyRunChrome();
      return;
    }

    const school = schoolOf();
    const schools = aspectSchools(aspect);
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
      ${schools.length > 1 ? `
        <div class="school-picks">
          <div class="keep-pills" role="group" aria-label="流派">
            ${schools.map((s) => `<button type="button" class="sys-chip ${school?.id === s.id ? "is-on" : ""}" data-school="${s.id}">${s.nameZh}</button>`).join("")}
          </div>
          ${school?.blurbZh ? `<p class="school-blurb">${school.blurbZh}</p>` : ""}
        </div>
      ` : ""}
      ${school?.notes ? `<p class="meta" style="margin-top:8px">${school.notes}</p>` : ""}
    `;

    renderCoreSlots();
    renderRunSystems();
    renderKeepRail();
    renderPriorityList();

    const keep = keepsakeOf();
    const hammerCount = thisWeaponHammers().length;
    const pills = [
      { id: "all", label: "全部", color: "var(--gold)" },
      ...Object.values(GODS).map((g) => ({
        id: g.id,
        label: keep?.god === g.id ? `${g.nameZh} · 信物` : g.nameZh,
        color: g.color,
        keep: keep?.god === g.id,
      })),
      {
        id: "hammer",
        label: hammerCount ? `狄德勒斯之錘 · ${hammerCount}` : "狄德勒斯之錘",
        color: "#c4783a",
        keep: hammerCount > 0,
      },
    ];
    $("#god-filters").innerHTML = pills.map((p) =>
      `<button class="god-pill ${state.godFilter === p.id ? "is-active" : ""} ${p.keep ? "is-keep" : ""}" data-god="${p.id}" style="--g:${p.color}">${p.label}</button>`
    ).join("");

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
    const school = schoolOf();
    const keep = keepsakeOf();
    const roomOffer = keep?.type === "utility" ? openingOfferForGod(state.godFilter, school) : null;
    if (hint) {
      hint.hidden = !state.runMode;
      const showOffer = Boolean(roomOffer) && !q;
      hint.classList.toggle("is-visible", waiting || showOffer);
      if (waiting) {
        const picks = openingCoreLabels(school, { withGod: true }).join("、");
        const schoolGods = (school?.gods || []).map((id) => GODS[id].nameZh).join("、");
        hint.textContent = keep?.type === "utility"
          ? `此信物不鎖神，第一間房優先找 ${picks || schoolGods}。`
          : `點上方欄位，快速勾選本輪祝福。建議優先：${schoolGods}。`;
      } else if (showOffer) {
        hint.textContent = openingOfferHintText(roomOffer, state.godFilter);
      } else {
        hint.textContent = "正在顯示對應祝福；再點一次欄位可回到提示。";
      }
    }

    if (state.godFilter === "hammer") {
      const slots = thisWeaponHammers();
      const hammers = HAMMERS.filter((h) => h.weapon === state.weaponId).filter((h) => {
        if (hammerOffAspect(h) && !slots.includes(h.id)) return false;
        if (!q) return true;
        return [h.name, h.nameZh, h.effectZh].join(" ").toLowerCase().includes(q);
      });
      board.innerHTML = `<article class="god-block" style="--g:#c4783a">
        <div class="god-block-head">
          <strong>狄德勒斯之錘 · Daedalus Hammer</strong>
          <small>本輪最多兩把${slots.length ? ` · 已選 ${slots.length}` : ""}</small>
        </div>
        <div class="boon-grid">
          ${hammers.map((h) => {
            const on = slots.includes(h.id);
            const rec = h.rec?.includes(aspect.id);
            const blocked = !on && exclusiveHammerIds(h).some((id) => slots.includes(id));
            const slotLabel = on ? (slots[0] === h.id ? "第一把" : "第二把") : rec ? "建議" : "改造";
            const tags = [rec ? ["core", "建議"] : null, blocked ? ["duo", "互斥"] : null].filter(Boolean);
            return `<button class="boon-card ${on ? "is-on" : ""} ${rec ? "is-rec" : ""} ${blocked ? "is-needed" : ""}" data-hammer="${h.id}" style="--g:#c4783a">
              <span class="boon-slot">${slotLabel}</span>
              ${tags.length ? `<span class="boon-tags">${tags.map(([k, t]) => `<i class="tag-${k}">${t}</i>`).join("")}</span>` : ""}
              <strong>${h.nameZh}</strong>
              <span class="boon-en">${h.name}</span>
              <p>${h.effectZh}</p>
            </button>`;
          }).join("") || `<p class="meta">沒有符合的錘。</p>`}
        </div>
      </article>`;
      return;
    }

    const neededIds = neededBoonIds();
    const pomIds = new Set(aspectPomIds(school));
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
      const recGod = (school?.gods || []).includes(gid);
      const offerHere = roomOffer && gid === state.godFilter ? roomOffer : null;
      const headNote = offerHere
        ? openingOfferBlockNote(offerHere)
        : recGod ? "本型態建議" : gid === "chaos" ? "詛咒結束後生效" : g.curseZh ? `狀態：${g.curseZh}` : "無雙重祝福";
      return `<article class="god-block" style="--g:${g.color}">
        <div class="god-block-head">
          <strong>${g.nameZh} · ${g.name}</strong>
          <small>${headNote}</small>
        </div>
        <div class="boon-grid">
          ${grouped[gid].map((b) => {
            const shown = displayBoonName(b);
            const on = state.selected.has(b.id);
            const disabled = isBoonDisabled(b);
            const rec = Object.values(school?.slots || {}).includes(b.id);
            const roomPick = Boolean(offerHere && b.id === offerHere.id);
            const needed = neededIds.has(b.id) && !on;
            const pom = pomIds.has(b.id) && boonCanPom(b);
            const focus = state.highlightBoon === b.id;
            const tags = [
              rec ? ["core", "核心"] : null,
              roomPick ? ["core", "本房優先"] : null,
              roomPick && offerHere.source === "fallback" ? ["core", "非本流派核心"] : null,
              needed ? ["duo", "雙重"] : null,
              pom ? ["pom", "建議石榴"] : null,
            ].filter(Boolean);
            return `<button class="boon-card ${on ? "is-on" : ""} ${disabled ? "is-disabled" : ""} ${rec || roomPick ? "is-rec" : ""} ${needed ? "is-needed" : ""} ${pom ? "is-pom" : ""} ${focus ? "is-focus" : ""}" data-boon="${b.id}" id="boon-${b.id}" style="--g:${g.color}" ${disabled ? "disabled" : ""}>
              <span class="boon-slot">${slotZh[b.slot]}${b.slot === "legendary" ? " ★" : ""}</span>
              ${tags.length ? `<span class="boon-tags">${tags.map(([k, t]) => `<i class="tag-${k}">${t}</i>`).join("")}</span>` : ""}
              <strong>${shown.nameZh}${pomPipsMarkup(b.id)}</strong>
              ${pomAddMarkup(b.id)}
              <span class="boon-en">${shown.name}</span>
              <p>${b.effectZh}</p>
            </button>`;
          }).join("")}
        </div>
      </article>`;
    }).join("");

    const emptyNote = hiddenCount
      ? `<p class="meta hide-note">已隱藏 ${hiddenCount} 道不相容祝福（同欄位、夜之聖鏡或型態）。取消勾選或搜尋名稱可再顯示。</p>`
      : `<p class="meta">沒有符合的祝福。</p>`;
    board.innerHTML = blocks || (waiting ? "" : emptyNote);
    if (blocks && hiddenCount) {
      board.insertAdjacentHTML("afterbegin", `<p class="meta hide-note">已依目前勾選隱藏 ${hiddenCount} 道不相容祝福。取消該欄位或搜尋名稱可再顯示。</p>`);
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
      { title: "尚未開始", items: ranked.filter((x) => !x.met && !x.blocked && !x.obtained && x.progress === 0 && x.progress !== x.total - 1) },
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

  function obtainLegendMarkup(boon, selected) {
    if (isBoonDisabled(boon)) return "";
    return `<button type="button" class="ghost obtain-btn" data-obtain-legend="${boon.id}">${selected ? "取消已拿到" : "標記已拿到"}</button>`;
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
      { title: "已拿到", items: ranked.filter((x) => x.selected) },
      { title: "還差 1 道", items: ranked.filter((x) => !x.met && !x.blocked && !x.selected && x.progress === x.total - 1) },
      { title: "進行中", items: ranked.filter((x) => !x.met && !x.blocked && !x.selected && x.progress > 0 && x.progress < x.total - 1) },
      { title: "尚未開始", items: ranked.filter((x) => !x.met && !x.blocked && !x.selected && x.progress === 0 && x.progress !== x.total - 1) },
      { title: "無法使用", items: ranked.filter((x) => x.blocked && !x.selected) },
    ];
  }

  function renderLegendRail() {
    const list = $("#legend-list");
    const summary = $("#legend-summary");
    if (!list || !summary) return;
    const groups = rankLegendaries();
    const ready = groups[0].items.length;
    const got = groups[1].items.length;
    const close = groups[2].items.length;
    summary.textContent = `可領取 ${ready}／${LEGENDARIES.length}${got ? `　·　已拿到 ${got}` : ""}${close ? `　·　${close} 道只差一個條件` : ""}　·　點卡片看前置，可標記已拿到`;
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
        const summaryLine = blocked && !selected
          ? `<p class="warn">需要夜之聖鏡「${boon.soul === "stygian" ? "冥河靈魂" : "煉獄靈魂"}」</p>`
          : selected
            ? `<p class="warn" style="color:#8ee0ad">本輪已標記拿到</p>`
            : met
              ? `<p class="warn" style="color:#8ee0ad">前置已滿足，下次遇見可能提供</p>`
              : `<p class="duo-missing">${closeOne ? "還差：" : "還缺："}${missingLabels.join("、")}</p>`;
        return `<article class="duo-card ${cls}" data-legend="${boon.id}" style="--g1:${god.color};--g2:${god.color}">
          <div class="duo-names">
            <strong>${boon.nameZh}</strong>
            <small>${god.nameZh} · 傳奇</small>
          </div>
          <div class="progress"><span style="width:${(progress / total) * 100}%"></span></div>
          <p class="duo-req">${boon.effectZh}</p>
          ${summaryLine}
          ${open ? `${legendGapsMarkup(boon)}${obtainLegendMarkup(boon, selected)}` : ""}
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
      return `<button type="button" class="run-pill ${met ? "is-ready" : "is-close"} ${state.expandedLegend === boon.id ? "is-open" : ""}" data-legend="${boon.id}" data-run-legend="1">
        <strong>${boon.nameZh}</strong>
        <small>${met ? "傳奇可領取" : `還差 ${missingLabels.join("、")}`}</small>
      </button>`;
    });
    const pills = [...ready, ...close, ...progress, ...suggestedLocked];
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
    if (state.railPanel === "legends") {
      summary.textContent = `傳奇 ${legendReady.length} 可領／${legendClose.length} 接近`;
      track.innerHTML = legendPills.length
        ? legendPills.join("")
        : `<p class="meta">勾選祝福後，即將完成的傳奇會出現在這裡。</p>`;
      return;
    }
    summary.textContent = `可領取 ${ready.length}　·　還差 1 道 ${close.length}`;
    track.innerHTML = duoPills.length
      ? duoPills.join("")
      : `<p class="meta">勾選祝福後，即將完成的雙重會出現在這裡。</p>`;
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
          <small>${god.nameZh} · 傳奇</small>
        </div>
        <p class="duo-req" style="margin-top:8px">${boon.effectZh}</p>
        ${gaps.blocked && !gaps.selected ? `<p class="warn">需要夜之聖鏡「${boon.soul === "stygian" ? "冥河靈魂" : "煉獄靈魂"}」</p>` : gaps.selected ? `<p class="warn" style="color:#8ee0ad">本輪已標記拿到</p>` : gaps.met ? `<p class="warn" style="color:#8ee0ad">前置已滿足，下次遇見可能提供</p>` : `<p class="duo-missing">${closeOne ? "還差：" : "還缺："}${gaps.missingLabels.join("、")}</p>`}
        ${legendGapsMarkup(boon)}
        ${obtainLegendMarkup(boon, gaps.selected)}
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
    $("#duo-god-row").innerHTML = Object.values(GODS).filter((g) => !g.noDuo).map((g) => `
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
        ${duo.incompatibleAspects?.length ? `<p class="warn">不相容：${duo.incompatibleAspects.map((id) => id === "beowulf" ? "貝奧武夫" : "赫拉").join("、")}型態</p>` : ""}
        ${duo.exclusiveWith?.length ? `<p class="warn">互斥：${duo.exclusiveWith.map((id) => duoOf(id)?.nameZh || id).join("、")}</p>` : ""}
        ${duo.blockedByBoons?.length ? `<p class="warn">無法與${duo.blockedByBoons.map((id) => boonOf(id)?.nameZh || id).join("、")}並存</p>` : ""}
      </article>`;
    }).join("");
  }

  function legendCatalogGods() {
    return Object.values(GODS).filter((g) => g.id !== "chaos");
  }

  function legendCatalogGodOk(id) {
    return Boolean(id && GODS[id] && id !== "chaos" && LEGENDARIES.some((b) => b.god === id));
  }

  function renderLegendCatalog() {
    const row = $("#legend-god-row");
    const catalog = $("#legend-catalog");
    if (!row || !catalog) return;
    row.innerHTML = legendCatalogGods().map((g) => `
      <button class="duo-god ${state.legendGod === g.id ? "is-active" : ""}" data-legend-god="${g.id}" style="--g:${g.color}">${g.nameZh}</button>
    `).join("");

    const list = LEGENDARIES.filter((b) => !state.legendGod || b.god === state.legendGod);
    catalog.innerHTML = list.map((boon) => {
      const god = GODS[boon.god];
      return `<article class="duo-card" style="--g1:${god.color};--g2:${god.color}">
        <div class="duo-names">
          <strong>${boon.nameZh}</strong>
          <small>${boon.name}</small>
        </div>
        <p class="meta" style="margin:8px 0">${god.nameZh} · 傳奇</p>
        <p class="duo-req">${boon.effectZh}</p>
        <div style="margin-top:10px">${legendGapsMarkup(boon)}</div>
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
      if (id === "sweet-nectar") state.pomStep = 2;
    }
    persist();
    renderDuoRail();
    renderRunSystems();
    renderBoonBoard();
  }

  function toggleBoon(id) {
    const boon = boonOf(id);
    if (!boon || isBoonDisabled(boon)) return;
    if (state.selected.has(id)) {
      state.selected.delete(id);
      clearBoonPoms(id);
    } else {
      if (SLOT_KEYS.includes(boon.slot)) {
        for (const other of [...state.selected]) {
          if (other !== id && BOON_MAP[other]?.slot === boon.slot) {
            state.selected.delete(other);
            clearBoonPoms(other);
          }
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
    const shareChoice = e.target.closest("[data-share]");
    if (shareChoice) {
      const kind = shareChoice.dataset.share;
      closeShareMenu();
      if (kind === "link") copyShare();
      else if (kind === "png") exportSharePng();
      return;
    }
    const shareTrigger = e.target.closest("#share-build");
    if (shareTrigger) {
      if (shareMenuAnchor === shareTrigger) closeShareMenu();
      else openShareMenu(shareTrigger);
      return;
    }
    closeShareMenu();

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

    const railTab = e.target.closest("[data-rail-panel]");
    if (railTab) {
      setRailPanel(railTab.dataset.railPanel);
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
      normalizeSchool();
      persist();
      showView("planner");
      return;
    }

    const schoolBtn = e.target.closest("[data-school]");
    if (schoolBtn) {
      state.schoolId = schoolBtn.dataset.school;
      wearKeepHere();
      persist();
      renderPlanner();
      return;
    }

    const slotBtn = e.target.closest("[data-slot-filter]");
    if (slotBtn) {
      const slot = slotBtn.dataset.slotFilter;
      state.slotFilter = state.slotFilter === slot ? null : slot;
      if (state.godFilter === "hammer") state.godFilter = "all";
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
      if (state.godFilter === "hammer") state.slotFilter = null;
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
      if (removed.length) toast(`已取消不相容祝福：${removed.join("、")}`);
      return;
    }

    const pomAdd = e.target.closest("[data-pom-add]");
    if (pomAdd) {
      e.preventDefault();
      const id = pomAdd.closest("[data-pom-boon], [data-boon]")?.dataset.pomBoon
        || pomAdd.closest("[data-boon]")?.dataset.boon;
      addPom(id, Number(pomAdd.dataset.pomAdd));
      return;
    }

    const pomHit = e.target.closest("[data-pom-hit]");
    if (pomHit) {
      e.preventDefault();
      const id = pomHit.closest("[data-pom-boon], [data-boon]")?.dataset.pomBoon
        || pomHit.closest("[data-boon]")?.dataset.boon;
      removePomHit(id, Number(pomHit.dataset.pomHit));
      return;
    }

    const companionBtn = e.target.closest("[data-companion]");
    if (companionBtn) {
      const id = companionBtn.dataset.companion || "";
      state.companion = COMPANION_MAP[id] ? id : "";
      persist();
      renderRunSystems();
      return;
    }

    const keepHereBtn = e.target.closest("[data-keep-here]");
    if (keepHereBtn) {
      const regionId = validKeepHere(keepHereBtn.dataset.keepHere);
      if (!regionId) return;
      state.keepHere = regionId;
      state.keepFocus = null;
      wearKeepHere();
      applyKeepChange();
      return;
    }

    const keepSlotBtn = e.target.closest("[data-keep-slot]");
    if (keepSlotBtn) {
      const regionId = keepSlotBtn.dataset.keepRegion;
      const same = state.keepFocus === regionId;
      const filled = keepSlotId(regionId);
      const rec = keepRecId(regionId);
      if (same) {
        state.keepFocus = null;
      } else {
        state.keepFocus = regionId;
        if (filled) state.keepsake = filled;
        else if (rec) {
          state.keepSlots[regionId] = rec;
          state.keepsake = rec;
        }
      }
      applyKeepChange();
      return;
    }

    const keepPick = e.target.closest("[data-keep-pick]");
    if (keepPick) {
      const id = keepPick.dataset.keepPick || "";
      if (state.keepFocus) {
        state.keepSlots[state.keepFocus] = id;
        state.keepFocus = null;
      }
      state.keepsake = id;
      applyKeepChange();
      return;
    }

    const hammerBtn = e.target.closest("[data-hammer]");
    if (hammerBtn) {
      const slots = thisWeaponHammers();
      const id = hammerBtn.dataset.hammer;
      const idx = slots.indexOf(id);
      if (idx >= 0) setHammerSlot(idx, "");
      else setHammerSlot(slots[0] ? 1 : 0, id);
      return;
    }

    const obtainLegendBtn = e.target.closest("[data-obtain-legend]");
    if (obtainLegendBtn) {
      e.preventDefault();
      toggleBoon(obtainLegendBtn.dataset.obtainLegend);
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

    const legendGod = e.target.closest("[data-legend-god]");
    if (legendGod) {
      const id = legendGod.dataset.legendGod;
      state.legendGod = state.legendGod === id ? "" : (legendCatalogGodOk(id) ? id : "");
      renderLegendCatalog();
      writeHash();
      return;
    }

    if (e.target.closest("#reset-run")) {
      state.selected.clear();
      state.obtainedDuos.clear();
      state.poms = {};
      state.pomStep = 1;
      state.keepsake = "";
      state.companion = "";
      state.keepSlots = emptyKeepSlots();
      state.keepFocus = null;
      state.keepHere = "";
      state.hammers = new Set(
        [...state.hammers].filter((id) => HAMMER_MAP[id]?.weapon !== state.weaponId)
      );
      persist();
      renderPlanner();
      return;
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
    wearKeepHere();
    hydrating = true;
    persist();
    showView(state.view, { skipHash: true, keepScroll: true });
    hydrating = false;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeShareMenu();
    if (state.keepFocus) {
      state.keepFocus = null;
      renderKeepRail();
    }
  });

  hydrating = true;
  const fromUrl = applyHash();
  wearKeepHere();
  renderArmory();
  renderDuoCatalog();
  renderLegendCatalog();
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
