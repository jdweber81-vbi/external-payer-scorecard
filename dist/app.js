"use strict";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const STORE = "externalPayerScorecard.v5";
const categoryDefs = [
  {
    id: "operational",
    name: "Operational Execution",
    weight: 35,
    metrics: [
      [
        "caps",
        "Open Corrective Action Plans (CAPs)",
        "Total open CAPs by client and estimated annual value.",
        "90 = Tier 3 routine/internal remediation; 65 = Tier 2 formal with no penalty; 40 = Tier 1 contractual CAP with financial exposure.",
      ],
      [
        "callClaim",
        "Core Operational Metrics: Call and Claim",
        "Delegated-agreement call and claim measures, performance guarantees, liquidated damages, and service levels.",
        "Map supported results to 90 / 65 / 40 / 15.",
      ],
      [
        "quality",
        "Core Operational Metrics: Quality and HEDIS (FUH 7 / FUH 30)",
        "Quality Compass results by client, line of business, and measure.",
        "90 = 95th percentile; 65 = 75th; 40 = 50th; 15 = 25th.",
      ],
      [
        "network",
        "Core Operational Metrics: Network Adequacy and Access",
        "Performance-guarantee results for network adequacy and access.",
        "90 = 10 PGs passed; 65 = 5–9; 40 = 1–4; 15 = 0.",
      ],
      [
        "cmum",
        "Core Operational Metrics: Case Management and Utilization Management",
        "Key CM and UM dashboard measures.",
        "Map validated results to 90 / 65 / 40 / 15.",
      ],
      [
        "engagement",
        "Member Engagement Score",
        "Composite score from the payer member-engagement dashboard.",
        "90 = 90th percentile; 65 = 75th; 40 = 50th; 15 = 25th.",
      ],
    ],
  },
  {
    id: "contract",
    name: "Contractual Performance",
    weight: 15,
    metrics: [
      [
        "term",
        "Contract Structure: Term for Convenience",
        "Whether the current contract contains a term-for-convenience provision.",
        "90 = No; 15 = Yes.",
      ],
      [
        "renewal",
        "Renewal Proximity",
        "Contract term length.",
        "90 = 5+ years; 65 = 3–5; 40 = 1–3; 15 = 1 year.",
      ],
      [
        "profit",
        "Optum Profitability",
        "IOI or contribution margin.",
        "90 = ASO 15%+ / FI 5%+; 65 = ASO 5–10% / FI 2–5%; 40 = ASO 0–5% / FI -2–2%; 15 = below those ranges.",
      ],
    ],
  },
  {
    id: "rate",
    name: "Rate and Trend Performance",
    weight: 20,
    metrics: [
      [
        "mlr",
        "Admin Rate Completeness (MLR)",
        "Behavioral MLR by contract year and line of business.",
        "90 = Commercial 85%+, MA 80%+, Medicaid 87%+; 65/40/15 use the workbook's descending threshold bands.",
      ],
      [
        "trend",
        "Trend Performance",
        "Behavioral year-over-year PMPM trend.",
        "90 = <3%; 65 = 3–9.9%; 40 = 10–15%; 15 = >15%.",
      ],
    ],
  },
  {
    id: "relationship",
    name: "Relationship and Sponsor Health",
    weight: 20,
    metrics: [
      [
        "nps",
        "Client NPS: Rating",
        "Average client NPS classification.",
        "90 = Promoter; 65 = Passive; 15 = Detractor.",
      ],
      [
        "relationship",
        "Client NPS: Relationship Status",
        "Strategic Partner, Solutions Provider, or Tools/Services Vendor.",
        "90 = Strategic Partner; 65 = Solutions Provider; 40 = Tools/Services Vendor.",
      ],
      [
        "executive",
        "Executive / Overall Engagement Quality",
        "QBR attendance, executive touchpoints, client noise, and internal feedback.",
        "90 = Green; 65 = Yellow; 15 = Red.",
      ],
      [
        "escalation",
        "Escalation Frequency",
        "Number and severity of open Major Issue Management tickets.",
        "90 = 0; 65 = 1–5; 15 = 6+ or high-risk C-suite escalation.",
      ],
    ],
  },
  {
    id: "strategic",
    name: "Strategic Fit and Adequacy Value",
    weight: 10,
    metrics: [
      [
        "footprint",
        "Enterprise Footprint",
        "Whether the client has other enterprise business.",
        "90 = Yes; 15 = No.",
      ],
      [
        "market",
        "Market Environment",
        "Whether state, federal, or other external headwinds affect scope.",
        "90 = No; 15 = Yes.",
      ],
      [
        "reference",
        "Reference Value",
        "Whether the payer participates in the reference program.",
        "90 = Yes; 15 = No.",
      ],
      [
        "pipeline",
        "Overall Growth Carry Forward / Pipeline",
        "Whether other business is in the pipeline.",
        "90 = Yes; 15 = No.",
      ],
      [
        "viability",
        "Client Financial Viability",
        "Profitability, short-term losses, long-term losses, acquisition, or insolvency risk.",
        "90 = profit growth; 65 = profitable; 40 = short-term losses; 15 = sustained losses or material viability risk.",
      ],
      [
        "forecast",
        "Client Growth Forecast",
        "Forecast membership, LOB, or geographic growth.",
        "90 = >5% growth; 65 = <5% growth; 40 = flat; 15 = contraction.",
      ],
    ],
  },
];
categoryDefs.forEach(
  (c) =>
    (c.metrics = c.metrics.map((m, i) => ({
      id: m[0],
      name: m[1],
      definition: m[2],
      mapping: m[3],
      weight: +(c.weight / c.metrics.length).toFixed(4),
    }))),
);
const defaultClients = window.APPROVED_CLIENT_DATA || [];
let state = load();
let activeStatus = "all";
let currentSummary = "";
let pendingEvidence = null;
const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open("externalPayerScorecardFiles", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("files");
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function putFile(id, file) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function getFile(id) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const req = db.transaction("files").objectStore("files").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function deleteFile(id) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s?.clients) return s;
  } catch {}
  return {
    clients: structuredClone(defaultClients),
    categories: structuredClone(categoryDefs),
    references: [],
    ai: { enabled: true },
  };
}
function save() {
  localStorage.setItem(STORE, JSON.stringify(state));
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;
const score = (c) =>
  Math.round(
    Object.entries(c.scores).reduce(
      (t, [id, v]) =>
        t +
        (v * (state.categories.find((x) => x.id === id)?.weight || 0)) / 100,
      0,
    ),
  );
const status = (c) =>
  score(c) < 60 ? "Red" : score(c) < 80 ? "Yellow" : "Green";
function render() {
  renderSummary();
  renderCards();
  renderMethod();
  renderLibraries();
  renderBook();
}
function renderSummary() {
  const avg = Math.round(
      state.clients.reduce((s, c) => s + score(c), 0) / state.clients.length,
    ),
    counts = { Red: 0, Yellow: 0, Green: 0 };
  state.clients.forEach((c) => counts[status(c)]++);
  $("#summaryGrid").innerHTML =
    `<article class="summary-card"><span>Accounts</span><strong>${state.clients.length}</strong><small>${money(state.clients.reduce((s, c) => s + c.contractValue, 0))} portfolio value</small></article><article class="summary-card"><span>Average CHI</span><strong>${avg}</strong><small>Weighted health score</small></article><article class="summary-card red"><span>Needs attention</span><strong>${counts.Red}</strong><small>Score below 60</small></article><article class="summary-card yellow"><span>Watch closely</span><strong>${counts.Yellow}</strong><small>Score 60–79</small></article><article class="summary-card green"><span>Healthy</span><strong>${counts.Green}</strong><small>Score 80–100</small></article>`;
}
function renderCards() {
  const q = $("#searchBox").value.toLowerCase(),
    fund = $("#fundingFilter").value;
  let html = "";
  ["Red", "Yellow", "Green"].forEach((st) => {
    const cs = state.clients
      .filter(
        (c) =>
          status(c) === st &&
          (activeStatus === "all" || activeStatus === st) &&
          (fund === "all" || c.funding === fund) &&
          JSON.stringify(c).toLowerCase().includes(q),
      )
      .sort((a, b) => score(a) - score(b));
    if (!cs.length) return;
    html += `<div><div class="group-heading ${st.toLowerCase()}"><span></span><h2>${st === "Red" ? "Needs attention" : st === "Yellow" ? "Watch closely" : "Healthy"}</h2><b>${cs.length}</b><i></i></div><div class="cards-grid">${cs.map(cardHtml).join("")}</div></div>`;
  });
  $("#scorecardList").innerHTML =
    html || '<div class="empty">No matching accounts.</div>';
}
function cardHtml(c) {
  const s = score(c),
    st = status(c),
    refs = state.references.filter(
      (r) => r.purpose === "client" && r.clientIds.includes(c.id),
    );
  const review = c.review || {};
  return `<article class="payer-card ${st.toLowerCase()}" data-id="${c.id}"><div class="card-top"><div><div class="status-label">● ${st}</div><h3>${esc(c.name)}</h3><p>${esc(c.states)} · ${esc(c.clientManager)}</p></div><div class="score-ring" style="--score:${s}"><strong>${s}</strong><small>CHI</small></div></div><div class="badges"><span class="badge funding">${esc(c.funding)}</span>${c.segments.map((x) => `<span class="badge">${esc(x)}</span>`).join("")}</div><div class="account-metrics"><div><span>Annual / ACR band</span><strong>${esc(c.contractBand || money(c.contractValue))}</strong></div><div><span>Renewal</span><strong>${esc(c.renewal || "Not provided")}</strong><small>${esc(c.membership || "")} membership</small></div></div><div class="risk-block"><h4>Risk drivers</h4><ul>${c.riskDrivers.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div><div class="factor-bars">${state.categories.map((cat) => `<div class="factor"><span>${esc(cat.name)}</span><b>${c.scores[cat.id]}</b><i><u style="width:${c.scores[cat.id]}%"></u></i></div>`).join("")}</div><button class="card-expand" data-expand="${c.id}" aria-expanded="false">Account details <i>⌄</i></button><div class="client-details" id="details-${c.id}" hidden>${detail("Funding", c.funding)}${detail("Lines of business", c.segments.join(", "))}${detail("Primary states", c.states)}${detail("UM region", c.umRegion)}${detail("CM model", c.cmModel)}${detail("Carved into plan", c.carved)}${detail("Claims platform", c.claimsPlatform)}${detail("Client Manager", c.clientManager)}${detail("Executive Director", c.executiveDirector)}${detail("Client Service Manager", c.serviceManager)}${detail("DSA", c.dsa)}${detail("QI", c.qi)}${detail("CAP", c.cap)}${detail("Risk list", c.onRiskList)}${detail("Referenceability", c.referenceable)}${detail("Overall health review", review.health)}${detail("Value realization", review.value)}${detail("Operations / delivery", review.operations)}${detail("Relationship", review.relationship)}${detail("Growth opportunity", review.growth)}</div><button class="reference-toggle" data-ref="${c.id}">Reference files <b>${refs.length}</b><i>⌄</i></button><div id="refs-${c.id}" hidden>${refs.length ? refs.map((r) => `<small>${esc(r.name)} → ${esc(metricName(r.metricId))}</small>`).join("<br>") : "<small>No files connected yet.</small>"}</div><div class="summary-actions"><button data-summary="internal" data-id="${c.id}">Internal Summary</button><button data-summary="customer" data-id="${c.id}">Customer-Facing Summary</button></div><div class="card-footer"><small>Updated ${esc(c.updated)}</small><button data-upload="${c.id}">Add update</button></div></article>`;
}
const detail = (a, b) =>
  `<div class="detail"><span>${a}</span><strong>${esc(b || "—")}</strong></div>`;
function metricName(id) {
  for (const c of state.categories) {
    const m = c.metrics.find((x) => x.id === id);
    if (m) return m.name;
  }
  return "Pending review";
}
function renderMethod() {
  $("#methodology").className = "methodology-grid";
  $("#methodology").innerHTML = state.categories
    .map(
      (c) =>
        `<article class="category category-column" data-cat="${c.id}"><div class="category-head"><button class="category-toggle" type="button" data-cat-toggle="${c.id}" aria-expanded="false"><span><strong>${esc(c.name)}</strong><small>${c.metrics.length} sub-categories</small></span><i>⌄</i></button><label><input class="cat-weight" type="number" min="0" max="100" step=".0001" value="${c.weight}">%</label></div><div class="category-metrics" id="cat-metrics-${c.id}" hidden><div class="submetric-toolbar"><strong>Sub-category weights</strong><button type="button" data-split-category="${c.id}">Split category equally</button></div>${c.metrics.map((m) => `<div class="submetric"><div><strong>${esc(m.name)}</strong><small>${esc(m.definition)}</small><details><summary>Source and scoring guidance</summary><p>${esc(m.mapping)}</p></details></div><label><input class="metric-weight" data-metric="${m.id}" type="number" min="0" max="100" step=".0001" value="${m.weight}">%</label></div>`).join("")}<div class="subweight-total">Sub-weight total: <b>${Math.round(c.metrics.reduce((s, m) => s + m.weight, 0) * 10000) / 10000}%</b></div></div></article>`,
    )
    .join("");
  refreshWeightTotal();
}
function refreshWeightTotal() {
  const n = $$(".cat-weight").reduce((s, x) => s + (+x.value || 0), 0);
  $("#weightTotal").textContent = `${Math.round(n * 10000) / 10000}%`;
  $("#weightTotal").style.color = Math.abs(n - 100) > 0.02 ? "#c62828" : "";
}
function renderLibraries() {
  const rows = (purpose) => {
    const rs = state.references.filter((r) => r.purpose === purpose);
    return rs.length
      ? rs
          .map(
            (r) =>
              `<div class="library-row"><span class="file-type">${esc(r.name.split(".").pop().toUpperCase())}</span><div><strong>${esc(r.name)}</strong><small>${esc(r.context || "Saved locally in this browser")}</small></div><small>${new Date(r.date).toLocaleDateString()} · ${Math.round(r.size / 1024)} KB</small><span><button data-open-ref="${r.id}">Open</button><button data-delete-ref="${r.id}">Remove</button></span></div>`,
          )
          .join("")
      : '<div class="empty">No files saved yet.</div>';
  };
  const client = state.references.filter((r) => r.purpose === "client").length,
    general = state.references.filter((r) => r.purpose === "general").length;
  $("#referenceLibrary").innerHTML = rows("client");
  $("#generalLibrary").innerHTML = rows("general");
  $("#referenceCount").textContent = `${client} file${client === 1 ? "" : "s"}`;
  $("#generalCount").textContent = `${general} file${general === 1 ? "" : "s"}`;
}
function analysis() {
  const avg = Math.round(
      state.clients.reduce((s, c) => s + score(c), 0) / state.clients.length,
    ),
    counts = { Red: 0, Yellow: 0, Green: 0 };
  state.clients.forEach((c) => counts[status(c)]++);
  const cats = state.categories
      .map((cat) => ({
        name: cat.name,
        avg: Math.round(
          state.clients.reduce((s, c) => s + c.scores[cat.id], 0) /
            state.clients.length,
        ),
      }))
      .sort((a, b) => b.avg - a.avg),
    best = cats[0],
    worst = cats.at(-1);
  return {
    overview: `The portfolio contains ${state.clients.length} clients representing ${money(state.clients.reduce((s, c) => s + c.contractValue, 0))}, with an average CHI of ${avg}. ${counts.Red} are red, ${counts.Yellow} are yellow, and ${counts.Green} are green.`,
    exceptional:
      best.avg >= 80
        ? `${best.name} is the strongest category at ${best.avg}, meeting the threshold for exceptional performance.`
        : `No portfolio category currently meets the 80-point exceptional threshold. ${best.name} is strongest at ${best.avg}.`,
    well: `The strongest repeatable capability is ${best.name}, averaging ${best.avg} across the book.`,
    improve: `${worst.name} is the lowest category at ${worst.avg} and should receive the most immediate cross-account attention.`,
    recurring: `${state.clients.filter((c) => c.scores[state.categories.find((x) => x.name === worst.name).id] < 60).length} of ${state.clients.length} clients score below 60 in ${worst.name}.`,
    growth: `Growth should test prospects whose funding and LOB profiles resemble the healthiest current clients. This is a data-supported hypothesis, not a guaranteed outcome.`,
  };
}
function renderBook() {
  const a = analysis();
  $("#bookOverview").innerHTML =
    `<article class="bob-grid"><article><h3>Book of Business Overview</h3><p>${a.overview}</p></article><article><h3>What are we exceptional at:</h3><p>${a.exceptional}</p></article><article><h3>What we do consistently well:</h3><p>${a.well}</p></article><article><h3>What needs improvement:</h3><p>${a.improve}</p></article><article><h3>Areas consistently needing improvement across the book:</h3><p>${a.recurring}</p></article><article><h3>Potential areas of opportunity for Growth:</h3><p>${a.growth}</p></article></article>`;
  $("#bookMeta").textContent =
    `Calculated portfolio narrative · Generated ${new Date().toLocaleString()}`;
}
function localSummary(c, type) {
  const s = score(c),
    st = status(c),
    strong = Object.entries(c.scores).sort((a, b) => b[1] - a[1])[0],
    weak = Object.entries(c.scores).sort((a, b) => a[1] - b[1])[0];
  if (type === "customer")
    return `${c.name} currently has a Client Health Index of ${s}, placing the account in ${st.toLowerCase()} status. ${state.categories.find((x) => x.id === strong[0]).name} is a relative strength. Our shared improvement priority is ${state.categories.find((x) => x.id === weak[0]).name}, supported by focused review of current evidence and next actions. We recommend aligning on owners, timing, and measurable progress with the current renewal plan: ${c.renewal}.`;
  return `${c.name} is ${st.toLowerCase()} with a CHI of ${s}. Strongest category: ${state.categories.find((x) => x.id === strong[0]).name} (${strong[1]}). Lowest category: ${state.categories.find((x) => x.id === weak[0]).name} (${weak[1]}). Primary risks: ${c.riskDrivers.join("; ")}. Immediate priority: validate the lowest-scoring evidence, assign accountable owners, and establish a recovery plan ahead of renewal.`;
}
async function callAi(payload) {
  if (!state.ai.enabled) throw new Error("AI is disabled");
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(out.error || `AI bridge returned ${response.status}`);
  return out;
}
async function getSummary(c, type) {
  const out = await callAi({
    operation: "client-summary",
    summaryType: type,
    client: { ...c, chi: score(c), status: status(c) },
    methodology: state.categories,
  });
  return out.summary || localSummary(c, type);
}
function modal(id, show = true) {
  $(id).hidden = !show;
  document.body.style.overflow = show ? "hidden" : "";
}
function toast(text) {
  const n = document.createElement("div");
  n.className = "toast";
  n.textContent = text;
  document.body.append(n);
  setTimeout(() => n.remove(), 1800);
}
document.addEventListener("click", async (e) => {
  const acc = e.target.closest(".accordion");
  if (acc) {
    const p = $("#" + acc.dataset.panel);
    p.hidden = !p.hidden;
    acc.querySelector("i").textContent = p.hidden ? "⌄" : "⌃";
  }
  const ex = e.target.closest("[data-expand]");
  if (ex) {
    const p = $("#details-" + ex.dataset.expand);
    p.hidden = !p.hidden;
    ex.setAttribute("aria-expanded", String(!p.hidden));
    ex.querySelector("i").textContent = p.hidden ? "⌄" : "⌃";
  }
  const rt = e.target.closest("[data-ref]");
  if (rt) {
    const p = $("#refs-" + rt.dataset.ref);
    p.hidden = !p.hidden;
  }
  const up = e.target.closest("[data-upload]");
  if (up) {
    openUpload(+up.dataset.upload);
  }
  const sm = e.target.closest("[data-summary]");
  if (sm) {
    const c = state.clients.find((x) => x.id === +sm.dataset.id);
    $("#summaryTitle").textContent =
      `${sm.dataset.summary === "customer" ? "Customer-Facing Summary" : "Internal Summary"} · ${c.name}`;
    $("#summaryText").textContent = "Creating summary…";
    modal("#summaryModal");
    try {
      currentSummary = await getSummary(c, sm.dataset.summary);
      $("#summaryText").textContent = currentSummary;
    } catch (err) {
      currentSummary = localSummary(c, sm.dataset.summary);
      $("#summaryText").textContent =
        currentSummary + `\n\n(Local fallback used: ${err.message})`;
    }
  }
  const op = e.target.closest("[data-open-ref]");
  if (op) {
    const file = await getFile(op.dataset.openRef);
    if (file) {
      const url = URL.createObjectURL(file);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }
  const del = e.target.closest("[data-delete-ref]");
  if (del && confirm("Remove this locally stored reference?")) {
    await deleteFile(del.dataset.deleteRef);
    state.references = state.references.filter(
      (r) => r.id !== del.dataset.deleteRef,
    );
    save();
    render();
  }
});
document.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-cat-toggle]");
  if (toggle) {
    const panel = $("#cat-metrics-" + toggle.dataset.catToggle);
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    toggle.querySelector("i").textContent = panel.hidden ? "⌄" : "⌃";
  }
  const split = e.target.closest("[data-split-category]");
  if (split) {
    const c = state.categories.find(
      (x) => x.id === split.dataset.splitCategory,
    );
    if (c) {
      const each = +(c.weight / c.metrics.length).toFixed(4);
      c.metrics.forEach((m) => (m.weight = each));
      renderMethod();
      toast(`${c.name} split equally.`);
    }
  }
});
$$(".filter").forEach(
  (b) =>
    (b.onclick = () => {
      $$(".filter").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      activeStatus = b.dataset.status;
      renderCards();
    }),
);
$("#searchBox").oninput = renderCards;
$("#fundingFilter").onchange = renderCards;
function openUpload(id) {
  modal("#uploadModal");
  $("#uploadClients").innerHTML = state.clients
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === id ? "selected" : ""}>${esc(c.name)}</option>`,
    )
    .join("");
  $("#uploadMetric").innerHTML =
    '<option value="">Pending review</option>' +
    state.categories
      .flatMap((c) =>
        c.metrics.map(
          (m) =>
            `<option value="${m.id}">${esc(c.name)} — ${esc(m.name)}</option>`,
        ),
      )
      .join("");
  const mode = id ? "manual" : "ai";
  $(`input[name="routingMode"][value="${mode}"]`).checked = true;
  $("#clientChooser").hidden = mode !== "manual";
}
function filenameTokens(name) {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, " ")
    .replace(/q[1-4]/g, " ")
    .replace(/20\d{2}/g, " ")
    .replace(/\bv\d+\b/g, " ")
    .replace(/\b(final|draft|revised|revision|updated|update|copy)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((x) => x.length > 1);
}
function filenameSimilarity(a, b) {
  const left = new Set(filenameTokens(a)),
    right = new Set(filenameTokens(b));
  if (!left.size || !right.size) return 0;
  const common = [...left].filter((x) => right.has(x)).length;
  return common / new Set([...left, ...right]).size;
}
function findSimilarReference(name, purpose, excludeId) {
  return (
    state.references
      .filter((r) => r.id !== excludeId && r.purpose === purpose)
      .map((r) => ({ r, score: filenameSimilarity(name, r.name) }))
      .filter((x) => x.score >= 0.4)
      .sort((a, b) => b.score - a.score)[0]?.r || null
  );
}
async function resolveReplacement(reference, result) {
  let old = null;
  if (
    result?.replacementCandidateId &&
    !["low", "none"].includes(result.replacementConfidence)
  )
    old = state.references.find(
      (r) => r.id === result.replacementCandidateId && r.id !== reference.id,
    );
  old =
    old ||
    findSimilarReference(reference.name, reference.purpose, reference.id);
  if (!old) return false;
  const replace = confirm(
    `Is this replacing the file or document titled “${old.name}”?\n\nSelect OK to replace the older document, or Cancel to keep both.`,
  );
  if (!replace) return false;
  await deleteFile(old.id);
  state.references = state.references.filter((r) => r.id !== old.id);
  reference.replaces = old.name;
  reference.context = `Replaces ${old.name}; pending evidence approval.`;
  return true;
}
function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
async function aiFilePayload(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "eml") {
    const data = bytesToBase64(await file.arrayBuffer());
    return {
      fileName: file.name.replace(/\.eml$/i, ".txt"),
      fileData: `data:text/plain;base64,${data}`,
      fileMime: "text/plain",
    };
  }
  return {
    fileName: file.name,
    fileData: `data:${file.type || "application/octet-stream"};base64,${bytesToBase64(await file.arrayBuffer())}`,
    fileMime: file.type || "application/octet-stream",
  };
}
async function showEvidenceReview(reference, result) {
  const identifiedIds = [
    ...new Set(
      (result.identifiedClientIds || [])
        .map(Number)
        .filter((id) => state.clients.some((c) => c.id === id)),
    ),
  ];
  if (reference.purpose === "client" && identifiedIds.length) {
    reference.clientIds = identifiedIds;
  }
  await resolveReplacement(reference, result);
  save();
  pendingEvidence = {
    referenceId: reference.id,
    findings: (result.findings || []).filter((f) =>
      reference.clientIds.includes(Number(f.clientId)),
    ),
  };
  const names = reference.clientIds
    .map((id) => state.clients.find((c) => c.id === id)?.name)
    .filter(Boolean);
  $("#evidenceSummary").innerHTML = `<b>AI identified ${names.length} client${names.length === 1 ? "" : "s"}:</b><div class="identified-clients">${names.map((name) => `<span>${esc(name)}</span>`).join("")}</div><small>${esc(result.clientIdentificationSummary || "Review the highlighted clients and metric connections below.")}</small><small>${esc(result.documentSummary || "AI completed its evidence review.")}</small>`;
  $("#evidenceFindings").innerHTML = pendingEvidence.findings.length
    ? pendingEvidence.findings
        .map((f, i) => {
          const c = state.clients.find((x) => x.id === f.clientId),
            cat = state.categories.find((x) => x.id === f.categoryId);
          return `<article class="evidence-finding ${f.factStatus}"><label class="finding-check"><input type="checkbox" data-finding-index="${i}" ${f.proposedScore !== null && f.factStatus === "confirmed" ? "checked" : ""}> <span><b>${esc(c?.name || "Unknown client")} → ${esc(cat?.name || f.categoryId)}</b><small>${esc(metricName(f.metricId))}</small></span></label><div class="finding-flags"><em>${esc(f.factStatus)}</em><em>${esc(f.confidence)} confidence</em>${f.proposedScore === null ? "<em>No score proposed</em>" : `<label>Proposed score <input type="number" min="0" max="100" value="${f.proposedScore}" data-finding-score="${i}"></label>`}</div><p><b>Evidence:</b> ${esc(f.evidence)}</p><p><b>Why it maps:</b> ${esc(f.rationale)}</p></article>`;
        })
        .join("")
    : '<div class="empty">No scorecard findings were supported by this document.</div>';
  modal("#evidenceReviewModal");
}
function finishEvidence(apply) {
  const ref = state.references.find(
    (r) => r.id === pendingEvidence?.referenceId,
  );
  if (apply && pendingEvidence) {
    const approved = [];
    $$("[data-finding-index]:checked").forEach((input) => {
      const i = +input.dataset.findingIndex,
        f = { ...pendingEvidence.findings[i] },
        scoreInput = $(`[data-finding-score="${i}"]`);
      if (scoreInput)
        f.proposedScore = Math.max(0, Math.min(100, +scoreInput.value));
      if (
        state.clients.some((c) => c.id === f.clientId) &&
        state.categories.some((c) => c.id === f.categoryId)
      )
        approved.push(f);
    });
    const groups = {};
    approved
      .filter((f) => f.proposedScore !== null && f.factStatus === "confirmed")
      .forEach((f) => {
        const key = `${f.clientId}:${f.categoryId}`;
        (groups[key] ||= []).push(f.proposedScore);
      });
    Object.entries(groups).forEach(([key, scores]) => {
      const [clientId, categoryId] = key.split(":"),
        client = state.clients.find((c) => c.id === +clientId);
      if (client)
        client.scores[categoryId] = Math.round(
          scores.reduce((a, b) => a + b, 0) / scores.length,
        );
    });
    approved.forEach((f) => {
      const client = state.clients.find((c) => c.id === f.clientId);
      if (
        client &&
        (f.factStatus === "potential" ||
          (f.proposedScore !== null && f.proposedScore < 70))
      )
        client.riskDrivers = [
          `${f.factStatus === "potential" ? "Potential: " : ""}${f.rationale}`,
          ...client.riskDrivers,
        ].slice(0, 4);
    });
    if (ref) {
      ref.aiFindings = approved;
      ref.context = approved.length
        ? `${approved.length} AI finding${approved.length === 1 ? "" : "s"} reviewed and approved.`
        : "AI reviewed; no findings approved.";
    }
  } else if (ref) {
    ref.context = "Saved locally without AI score changes.";
  }
  save();
  render();
  modal("#evidenceReviewModal", false);
  pendingEvidence = null;
  toast(
    apply
      ? "Approved evidence applied to the scorecard."
      : "Document saved without score changes.",
  );
}
$("#uploadButton").onclick = () => openUpload();
$("#settingsButton").onclick = () => {
  modal("#settingsModal");
  $("#aiEnabled").checked = !!state.ai.enabled;
};
$$("[data-close]").forEach(
  (x) =>
    (x.onclick = () =>
      $$(".modal-backdrop").forEach((m) => modal("#" + m.id, false))),
);
$("#fileInput").onchange = (e) =>
  ($("#selectedFile").textContent = e.target.files[0]?.name || "");
document.addEventListener("paste", (e) => {
  if ($("#uploadModal").hidden) return;
  const item = [...(e.clipboardData?.items || [])].find(
    (x) => x.kind === "file",
  );
  if (!item) return;
  const file = item.getAsFile(),
    dt = new DataTransfer();
  dt.items.add(
    new File([file], `pasted-screenshot-${Date.now()}.png`, {
      type: file.type,
    }),
  );
  $("#fileInput").files = dt.files;
  $("#selectedFile").textContent = dt.files[0].name;
});
$$('input[name="purpose"]').forEach(
  (x) =>
    (x.onchange = () => {
      const general = x.value === "general" && x.checked;
      $("#routingChoice").hidden = general;
      const routingMode = $('input[name="routingMode"]:checked')?.value;
      $("#clientChooser").hidden = general || routingMode !== "manual";
      $("#aiReviewRow").hidden = general;
    }),
);
$$('input[name="routingMode"]').forEach(
  (x) =>
    (x.onchange = () => {
      if (!x.checked) return;
      $("#clientChooser").hidden = x.value !== "manual";
    }),
);
$("#uploadForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = $("#fileInput").files[0];
  if (!f || f.size > 50 * 1024 * 1024)
    return toast("Choose a file under 50 MB.");
  const purpose = $('input[name="purpose"]:checked').value,
    routingMode = $('input[name="routingMode"]:checked')?.value || "manual",
    manualClientIds = [...$("#uploadClients").selectedOptions].map(
      (x) => +x.value,
    ),
    clientIds = routingMode === "manual" ? manualClientIds : [],
    useAi = purpose === "client" && $("#aiReview").checked && state.ai.enabled;
  if (purpose === "client" && routingMode === "manual" && !clientIds.length)
    return toast("Choose at least one client.");
  if (purpose === "client" && routingMode === "ai" && !useAi)
    return toast("Enable the AI connection or choose the clients manually.");
  if (useAi && f.size > 8 * 1024 * 1024)
    return toast(
      "AI review supports files up to 8 MB; uncheck AI review to save this file locally.",
    );
  const id = crypto.randomUUID(),
    reference = {
      id,
      name: f.name,
      size: f.size,
      type: f.type,
      date: new Date().toISOString(),
      purpose,
      clientIds,
      metricId: $("#uploadMetric").value,
      score: $("#uploadScore").value === "" ? null : +$("#uploadScore").value,
      context: $("#uploadContext").value || "Saved locally; pending review.",
    };
  await putFile(id, f);
  state.references.push(reference);
  save();
  modal("#uploadModal", false);
  if (useAi) {
    toast("AI is reviewing and slicing the evidence…");
    try {
      const payload = await aiFilePayload(f),
        result = await callAi({
          operation: "document-analysis",
          ...payload,
          routingMode,
          manuallySelectedClientIds: manualClientIds,
          candidateClients: state.clients.map((c) => ({
            id: c.id,
            name: c.name,
            funding: c.funding,
            segments: c.segments,
            states: c.states,
            umRegion: c.umRegion,
            claimsPlatform: c.claimsPlatform,
          })),
          methodology: state.categories,
          existingReferences: state.references
            .filter((r) => r.id !== reference.id)
            .map((r) => ({
              id: r.id,
              name: r.name,
              purpose: r.purpose,
              clientIds: r.clientIds,
              date: r.date,
            })),
          userContext: $("#uploadContext").value,
        });
      await showEvidenceReview(reference, result);
    } catch (err) {
      await resolveReplacement(reference, null);
      reference.context = `Saved locally; AI review failed: ${err.message}`;
      save();
      render();
      toast("Saved locally. AI review could not be completed.");
    }
  } else {
    await resolveReplacement(reference, null);
    if (
      purpose === "client" &&
      $("#uploadScore").value !== "" &&
      $("#uploadMetric").value
    ) {
      for (const clientId of clientIds) {
        const c = state.clients.find((x) => x.id === clientId),
          cat = state.categories.find((x) =>
            x.metrics.some((m) => m.id === $("#uploadMetric").value),
          );
        if (c && cat) c.scores[cat.id] = +$("#uploadScore").value;
      }
    }
    save();
    render();
    toast("Reference saved locally.");
  }
  e.target.reset();
};
$("#approveEvidence").onclick = () => finishEvidence(true);
$("#saveWithoutChanges").onclick = () => finishEvidence(false);
$("#settingsForm").onsubmit = (e) => {
  e.preventDefault();
  state.ai = { enabled: $("#aiEnabled").checked };
  save();
  modal("#settingsModal", false);
  toast("AI preference saved.");
};
$("#copySummary").onclick = async () => {
  await navigator.clipboard.writeText(currentSummary);
  toast("Summary copied.");
};
$("#resetWeights").onclick = () => {
  state.categories = structuredClone(categoryDefs);
  save();
  render();
  toast("Workbook defaults restored.");
};
$("#saveWeights").onclick = () => {
  let valid = true;
  $$(".category").forEach((el) => {
    const c = state.categories.find((x) => x.id === el.dataset.cat);
    c.weight = +el.querySelector(".cat-weight").value;
    el.querySelectorAll(".metric-weight").forEach(
      (i) =>
        (c.metrics.find((x) => x.id === i.dataset.metric).weight = +i.value),
    );
    const sub = c.metrics.reduce((s, m) => s + m.weight, 0);
    if (Math.abs(sub - c.weight) > 0.03) valid = false;
  });
  const total = state.categories.reduce((s, c) => s + c.weight, 0);
  if (Math.abs(total - 100) > 0.03 || !valid)
    return toast(
      "Category weights must total 100%, and subweights must match each category.",
    );
  save();
  render();
  toast("CHI weights saved locally.");
};
document.addEventListener("input", (e) => {
  if (e.target.classList.contains("cat-weight")) refreshWeightTotal();
});
$("#refreshBook").onclick = async () => {
  renderBook();
  if (!state.ai.enabled) return;
  $("#bookMeta").textContent = "Creating AI-assisted portfolio narrative…";
  try {
    const out = await callAi({
      operation: "book-overview",
      portfolio: {
        clients: state.clients.map((c) => ({
          ...c,
          chi: score(c),
          status: status(c),
        })),
        calculated: analysis(),
      },
      methodology: state.categories,
    });
    const keys = [
      ["overview", "Book of Business Overview"],
      ["exceptional", "What are we exceptional at:"],
      ["well", "What we do consistently well:"],
      ["improve", "What needs improvement:"],
      ["recurring", "Areas consistently needing improvement across the book:"],
      ["growth", "Potential areas of opportunity for Growth:"],
    ];
    $("#bookOverview").innerHTML =
      `<article class="bob-grid">${keys.map(([k, h]) => `<article><h3>${h}</h3><p>${esc(out[k] || analysis()[k])}</p></article>`).join("")}</article>`;
    $("#bookMeta").textContent =
      `AI-assisted narrative · Generated ${new Date().toLocaleString()}`;
  } catch (err) {
    $("#bookMeta").textContent = `Calculated fallback used · ${err.message}`;
  }
};
render();
