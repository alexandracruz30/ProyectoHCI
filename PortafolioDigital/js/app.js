/* =========================================================
   PORTAFOLIO DIGITAL HCI
   Lógica de la aplicación: estado, persistencia (localStorage)
   y renderizado de vistas (Dashboard, Unidad > Integrante, Acerca).
   ========================================================= */

const STORAGE_KEY = "hci_portafolio_v2";
const OLD_STORAGE_KEY = "hci_portafolio_v1";

/* ---------- Datos semilla (solo se usan la primera vez) ---------- */
const SEED_DATA = {
  sections: [
    { id: "s1", name: "Unidad 1 - Fundamentos de HCI", description: "Conceptos base de interacción humano-computador.", color: "#4f6df5" },
    { id: "s2", name: "Unidad 2 - Diseño Centrado en el Usuario", description: "Investigación, personas, escenarios y necesidades del usuario.", color: "#ff8a3d" },
    { id: "s3", name: "Unidad 3 - Prototipado y Usabilidad", description: "Wireframes, prototipos y evaluación heurística.", color: "#2fab66" }
  ],
  members: [
    { id: "m1", name: "Integrante 1" },
    { id: "m2", name: "Integrante 2" },
    { id: "m3", name: "Integrante 3" },
    { id: "m4", name: "Integrante 4" },
    { id: "m5", name: "Integrante 5" }
  ],
  entries: [
    {
      id: "e0", sectionId: "s1", memberId: null, title: "Material de clase - Introducción a HCI",
      type: "Material de clase", date: "2026-04-10",
      description: "Diapositivas y guía compartidas por el profesor para la Unidad 1.",
      tags: ["material", "profesor"], attachment: null
    },
    {
      id: "e1", sectionId: "s1", memberId: "m1", title: "Heurísticas de Nielsen aplicadas",
      type: "Actividad", date: "2026-04-14",
      description: "Evaluación de una interfaz utilizando las 10 heurísticas de usabilidad de Nielsen, identificando hallazgos y severidad.",
      tags: ["usabilidad", "heurísticas"], attachment: null
    },
    {
      id: "eA", sectionId: "s2", memberId: null, title: "Material de clase - Técnicas de DCU",
      type: "Material de clase", date: "2026-04-28",
      description: "Guía del profesor sobre entrevistas, personas y escenarios.",
      tags: ["material", "profesor"], attachment: null
    },
    {
      id: "e2", sectionId: "s2", memberId: "m2", title: "Entrevistas a usuarios objetivo",
      type: "Evidencia", date: "2026-05-02",
      description: "Registro de entrevistas semiestructuradas para identificar necesidades y puntos de dolor del usuario.",
      tags: ["dcu", "entrevistas"], attachment: null
    },
    {
      id: "e3", sectionId: "s3", memberId: "m3", title: "Wireframes de baja fidelidad",
      type: "Evidencia", date: "2026-05-20",
      description: "Bocetos iniciales de pantallas principales antes de pasar a alta fidelidad.",
      tags: ["wireframe", "prototipo"], attachment: null
    }
  ]
};

/* ---------- Estado ---------- */
let state = loadState();

// Navegación: currentPage = 'dashboard' | 'acerca' | 'section'
// Cuando currentPage === 'section': currentSectionId siempre presente.
// currentMemberId === null  -> vista general de la unidad (material + integrantes)
// currentMemberId === id    -> bitácora individual de ese integrante en esa unidad
let currentPage = "dashboard";
let currentSectionId = null;
let currentMemberId = null;

let editingEntryId = null;
let pendingAttachment = null;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4MB: localStorage solo tiene ~5-10MB en total

/* ---------- Persistencia ---------- */
// Versiones anteriores guardaban solo imágenes en entry.image (dataURL).
// Se convierten a la forma actual: entry.attachment = { name, type, data }.
function normalizeEntries(entries) {
  return (entries || []).map(e => {
    if (e.attachment !== undefined) return e;
    if (e.image) {
      const { image, ...rest } = e;
      return { ...rest, attachment: { name: "imagen", type: "image/*", data: image } };
    }
    return { ...e, attachment: null };
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.entries = normalizeEntries(parsed.entries);
      return parsed;
    }
  } catch (e) { console.warn("No se pudo leer localStorage", e); }

  // Migración desde una versión anterior sin integrantes
  try {
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      const migrated = {
        sections: old.sections || structuredClone(SEED_DATA.sections),
        members: structuredClone(SEED_DATA.members),
        entries: normalizeEntries((old.entries || []).map(e => ({ ...e, memberId: null })))
      };
      return migrated;
    }
  } catch (e) { console.warn("No se pudo migrar datos anteriores", e); }

  return structuredClone(SEED_DATA);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage", e);
    showToast("No se pudo guardar: se acabó el espacio disponible en el navegador");
  }
}

/* ---------- Utilidades ---------- */
function uid(prefix) { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function formatDate(iso) {
  if (!iso) return "Sin fecha";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2200);
}
function getMember(id) { return state.members.find(m => m.id === id) || null; }
function getSection(id) { return state.sections.find(s => s.id === id) || null; }
function isImageAttachment(att) { return !!att && /^image\//.test(att.type); }
function attachmentIcon(att) {
  if (!att) return "📎";
  if (/^image\//.test(att.type)) return "🖼️";
  if (att.type === "application/pdf") return "📕";
  if (/word/.test(att.type)) return "📝";
  if (/zip|compressed/.test(att.type)) return "🗜️";
  return "📄";
}

/* ---------- Render: Sidebar ---------- */
function renderSidebar() {
  const list = document.getElementById("sectionList");
  list.innerHTML = "";
  state.sections.forEach(sec => {
    const count = state.entries.filter(e => e.sectionId === sec.id).length;
    const li = document.createElement("li");
    const isActive = currentPage === "section" && currentSectionId === sec.id;
    li.innerHTML = `
      <button class="nav-item ${isActive ? "active" : ""}" data-section="${sec.id}">
        <span class="section-name-wrap">
          <span class="section-dot" style="background:${sec.color}"></span>
          <span>${escapeHtml(sec.name)}</span>
        </span>
        <span class="section-count">${count}</span>
      </button>`;
    list.appendChild(li);
  });

  list.querySelectorAll(".nav-item[data-section]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentPage = "section";
      currentSectionId = btn.dataset.section;
      currentMemberId = null;
      render();
      if (window.innerWidth <= 860) document.getElementById("sidebar").classList.remove("mobile-open");
    });
  });

  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.classList.toggle("active", currentPage === btn.dataset.view);
  });
}

/* ---------- Render: Vistas principales ---------- */
function render() {
  renderSidebar();
  const main = document.getElementById("mainContent");

  if (currentPage === "dashboard") {
    main.innerHTML = renderDashboard();
  } else if (currentPage === "acerca") {
    main.innerHTML = renderAcerca();
  } else if (currentPage === "section") {
    main.innerHTML = currentMemberId
      ? renderMemberBitacora(currentSectionId, currentMemberId)
      : renderSectionOverview(currentSectionId);
  }
  attachContentEvents();
}

function renderDashboard() {
  const totalEntries = state.entries.length;
  const totalSections = state.sections.length;
  const totalMembers = state.members.length;
  const lastEntry = [...state.entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];

  const sectionsHtml = state.sections.map(sec => {
    const entries = state.entries.filter(e => e.sectionId === sec.id);
    return `
      <div class="section-block">
        <div class="section-block-header">
          <span class="section-dot" style="background:${sec.color}"></span>
          <span class="section-block-title">${escapeHtml(sec.name)}</span>
          <span class="section-count">${entries.length} entrada(s)</span>
        </div>
        ${entries.length === 0
          ? `<div class="empty-state"><span class="big-icon">🗂️</span>Aún no hay entradas en esta sección.</div>`
          : `<div class="entries-grid">${entries.slice(0, 3).map(e => renderEntryCard(e, true)).join("")}</div>`}
      </div>`;
  }).join("");

  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">Panel general</div>
        <div class="page-subtitle">Resumen del portafolio grupal del curso de Interacción Humano-Computador</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalEntries}</div><div class="stat-label">Entradas registradas</div></div>
      <div class="stat-card"><div class="stat-value">${totalSections}</div><div class="stat-label">Secciones / unidades</div></div>
      <div class="stat-card"><div class="stat-value">${totalMembers}</div><div class="stat-label">Integrantes del grupo</div></div>
      <div class="stat-card"><div class="stat-value">${lastEntry ? formatDate(lastEntry.date) : "—"}</div><div class="stat-label">Última actividad</div></div>
    </div>

    ${state.sections.length === 0
      ? `<div class="empty-state"><span class="big-icon">📂</span>Crea tu primera sección para comenzar a organizar el portafolio.</div>`
      : sectionsHtml}
  `;
}

function renderSectionOverview(sectionId) {
  const sec = getSection(sectionId);
  if (!sec) { currentPage = "dashboard"; return renderDashboard(); }

  const material = state.entries.filter(e => e.sectionId === sectionId && !e.memberId);

  const memberCards = state.members.map(m => {
    const count = state.entries.filter(e => e.sectionId === sectionId && e.memberId === m.id).length;
    return `
      <div class="member-card" data-member="${m.id}">
        <div class="member-avatar">${initials(m.name)}</div>
        <div>
          <div class="member-card-name">${escapeHtml(m.name)}</div>
          <div class="member-card-count">${count} entrada(s) en esta unidad</div>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">${escapeHtml(sec.name)}</div>
        <div class="page-subtitle">${escapeHtml(sec.description || "Sin descripción")}</div>
      </div>
      <button class="btn btn-ghost btn-sm" id="btnDeleteSection">🗑 Eliminar sección</button>
    </div>

    <div class="material-block">
      <div class="material-block-header">
        <div class="material-block-title">📎 Material de clase</div>
        <button class="btn btn-ghost btn-sm" id="btnAddMaterial">+ Agregar material</button>
      </div>
      ${material.length === 0
        ? `<div class="empty-state"><span class="big-icon">📄</span>El profesor aún no ha compartido material para esta unidad.</div>`
        : `<div class="entries-grid">${material.map(e => renderEntryCard(e, false)).join("")}</div>`}
    </div>

    <div class="section-block-header" style="margin-bottom:12px;">
      <span class="section-block-title">👥 Bitácoras de los integrantes</span>
    </div>
    <div class="members-grid">${memberCards}</div>
  `;
}

function renderMemberBitacora(sectionId, memberId) {
  const sec = getSection(sectionId);
  const member = getMember(memberId);
  if (!sec || !member) { currentMemberId = null; return renderSectionOverview(sectionId); }

  const entries = state.entries.filter(e => e.sectionId === sectionId && e.memberId === memberId);

  return `
    <div class="breadcrumb">
      <button id="btnBackToSection">← ${escapeHtml(sec.name)}</button>
      <span>/</span>
      <span>${escapeHtml(member.name)}</span>
    </div>
    <div class="page-title-row">
      <div>
        <div class="page-title">Bitácora de ${escapeHtml(member.name)}</div>
        <div class="page-subtitle">${escapeHtml(sec.name)}</div>
      </div>
    </div>

    ${entries.length === 0
      ? `<div class="empty-state"><span class="big-icon">🗂️</span>${escapeHtml(member.name)} todavía no ha registrado entradas en esta unidad. Usa "+ Nueva entrada" para agregar la primera.</div>`
      : `<div class="entries-grid">${entries.map(e => renderEntryCard(e, false)).join("")}</div>`}
  `;
}

function renderAcerca() {
  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">Acerca del proyecto</div>
        <div class="page-subtitle">Proyecto Final - Curso de Interacción Humano-Computador (HCI)</div>
      </div>
    </div>
    <div class="entry-card" style="cursor:default;">
      <p><strong>Sistema:</strong> Portafolio Digital grupal tipo bitácora.</p>
      <p><strong>Organización:</strong> cada unidad contiene el material compartido por el profesor y la bitácora individual de cada integrante del grupo con sus laboratorios y actividades.</p>
      <p><strong>Objetivo:</strong> documentar, organizar y presentar evidencias y actividades del curso aplicando principios de HCI y Diseño Centrado en el Usuario.</p>
      <p><strong>Principios aplicados:</strong> jerarquía visual, navegación clara y consistente (unidad → integrante), retroalimentación inmediata (toasts y confirmaciones), prevención de errores (confirmación antes de eliminar), y diseño accesible (contraste, etiquetas en formularios).</p>
    </div>
  `;
}

function renderEntryCard(entry, showOwner) {
  const sec = getSection(entry.sectionId);
  const member = entry.memberId ? getMember(entry.memberId) : null;
  const ownerPill = showOwner
    ? `<span class="owner-pill ${member ? "" : "material"}">${member ? escapeHtml(member.name) : "Material de clase"}</span>`
    : "";
  return `
    <div class="entry-card" data-entry-id="${entry.id}" data-action="view">
      <div class="entry-card-top">
        <span class="entry-type-badge">${escapeHtml(entry.type)}</span>
        ${ownerPill}
      </div>
      <div class="entry-title">${escapeHtml(entry.title)}</div>
      <div class="entry-meta">${sec ? escapeHtml(sec.name) : ""} · ${formatDate(entry.date)}</div>
      ${entry.description ? `<div class="entry-desc">${escapeHtml(entry.description)}</div>` : ""}
      ${entry.attachment
        ? (isImageAttachment(entry.attachment)
          ? `<img class="entry-thumb" src="${entry.attachment.data}" alt="Imagen de evidencia" />`
          : `<div class="entry-file-chip">${attachmentIcon(entry.attachment)} ${escapeHtml(entry.attachment.name)}</div>`)
        : ""}
      ${entry.tags && entry.tags.length ? `<div class="entry-tags">${entry.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      <div class="entry-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-entry-id="${entry.id}">✏️ Editar</button>
        <button class="btn btn-ghost btn-sm" data-action="delete" data-entry-id="${entry.id}">🗑 Eliminar</button>
      </div>
    </div>`;
}

function attachContentEvents() {
  document.querySelectorAll(".entry-card").forEach(card => {
    card.addEventListener("click", (ev) => {
      const actionBtn = ev.target.closest("[data-action]");
      const id = card.dataset.entryId;
      if (actionBtn && actionBtn.dataset.action === "edit") { ev.stopPropagation(); openEntryModal(id); return; }
      if (actionBtn && actionBtn.dataset.action === "delete") { ev.stopPropagation(); deleteEntry(id); return; }
      openViewModal(id);
    });
  });

  const delSecBtn = document.getElementById("btnDeleteSection");
  if (delSecBtn) delSecBtn.addEventListener("click", () => deleteSection(currentSectionId));

  const addMaterialBtn = document.getElementById("btnAddMaterial");
  if (addMaterialBtn) addMaterialBtn.addEventListener("click", () => openEntryModal(null, { sectionId: currentSectionId, memberId: "" }));

  document.querySelectorAll(".member-card").forEach(card => {
    card.addEventListener("click", () => {
      currentMemberId = card.dataset.member;
      render();
    });
  });

  const backBtn = document.getElementById("btnBackToSection");
  if (backBtn) backBtn.addEventListener("click", () => { currentMemberId = null; render(); });
}

/* ---------- CRUD: Entradas ---------- */
function updateAttachmentPreview() {
  const preview = document.getElementById("entryAttachmentPreview");
  if (!pendingAttachment) { preview.classList.add("hidden"); preview.innerHTML = ""; return; }
  preview.classList.remove("hidden");
  preview.innerHTML = isImageAttachment(pendingAttachment)
    ? `<img src="${pendingAttachment.data}" alt="Vista previa" />
       <button type="button" class="icon-btn" id="btnRemoveAttachment" title="Quitar archivo">✕</button>`
    : `<span>${attachmentIcon(pendingAttachment)} ${escapeHtml(pendingAttachment.name)}</span>
       <button type="button" class="icon-btn" id="btnRemoveAttachment" title="Quitar archivo">✕</button>`;
  document.getElementById("btnRemoveAttachment").addEventListener("click", () => {
    pendingAttachment = null;
    document.getElementById("entryAttachment").value = "";
    updateAttachmentPreview();
  });
}

function openEntryModal(entryId, defaults) {
  editingEntryId = entryId || null;
  pendingAttachment = null;
  document.getElementById("entryAttachment").value = "";
  const overlay = document.getElementById("entryModalOverlay");
  const sectionSelect = document.getElementById("entrySection");
  const memberSelect = document.getElementById("entryMember");

  sectionSelect.innerHTML = state.sections.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  memberSelect.innerHTML = `<option value="">— Material de clase (sin integrante) —</option>` +
    state.members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");

  if (entryId) {
    const entry = state.entries.find(e => e.id === entryId);
    document.getElementById("entryModalTitle").textContent = "Editar entrada";
    document.getElementById("entryId").value = entry.id;
    document.getElementById("entryTitle").value = entry.title;
    sectionSelect.value = entry.sectionId;
    memberSelect.value = entry.memberId || "";
    document.getElementById("entryType").value = entry.type;
    document.getElementById("entryDate").value = entry.date || "";
    document.getElementById("entryDescription").value = entry.description || "";
    document.getElementById("entryTags").value = (entry.tags || []).join(", ");
    pendingAttachment = entry.attachment || null;
    updateAttachmentPreview();
  } else {
    document.getElementById("entryModalTitle").textContent = "Nueva entrada";
    document.getElementById("entryForm").reset();
    document.getElementById("entryId").value = "";

    const defSection = (defaults && defaults.sectionId) || (currentPage === "section" ? currentSectionId : null);
    const defMember = defaults && "memberId" in defaults ? defaults.memberId : (currentMemberId || "");

    if (defSection && state.sections.some(s => s.id === defSection)) sectionSelect.value = defSection;
    memberSelect.value = defMember || "";
    updateAttachmentPreview();
  }
  overlay.classList.add("open");
}

function closeEntryModal() {
  document.getElementById("entryModalOverlay").classList.remove("open");
  editingEntryId = null;
  pendingAttachment = null;
}

function saveEntryFromForm(ev) {
  ev.preventDefault();
  const title = document.getElementById("entryTitle").value.trim();
  const sectionId = document.getElementById("entrySection").value;
  if (!title || !sectionId) return;

  const tags = document.getElementById("entryTags").value
    .split(",").map(t => t.trim()).filter(Boolean);

  const memberId = document.getElementById("entryMember").value || null;

  const data = {
    title,
    sectionId,
    memberId,
    type: document.getElementById("entryType").value,
    date: document.getElementById("entryDate").value,
    description: document.getElementById("entryDescription").value.trim(),
    tags,
    attachment: pendingAttachment
  };

  if (editingEntryId) {
    const idx = state.entries.findIndex(e => e.id === editingEntryId);
    state.entries[idx] = { ...state.entries[idx], ...data };
    showToast("Entrada actualizada");
  } else {
    state.entries.push({ id: uid("e"), ...data });
    showToast("Entrada agregada");
  }

  saveState();
  closeEntryModal();
  render();
}

function deleteEntry(entryId) {
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry) return;
  if (!confirm(`¿Eliminar la entrada "${entry.title}"? Esta acción no se puede deshacer.`)) return;
  state.entries = state.entries.filter(e => e.id !== entryId);
  saveState();
  showToast("Entrada eliminada");
  render();
}

function openViewModal(entryId) {
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry) return;
  const sec = getSection(entry.sectionId);
  const member = entry.memberId ? getMember(entry.memberId) : null;
  document.getElementById("viewModalTitle").textContent = entry.title;
  document.getElementById("viewModalBody").innerHTML = `
    <div class="detail-row"><div class="detail-label">Sección</div><div class="detail-value">${sec ? escapeHtml(sec.name) : "—"}</div></div>
    <div class="detail-row"><div class="detail-label">Bitácora de</div><div class="detail-value">${member ? escapeHtml(member.name) : "Material de clase"}</div></div>
    <div class="detail-row"><div class="detail-label">Tipo</div><div class="detail-value">${escapeHtml(entry.type)}</div></div>
    <div class="detail-row"><div class="detail-label">Fecha</div><div class="detail-value">${formatDate(entry.date)}</div></div>
    <div class="detail-row"><div class="detail-label">Descripción</div><div class="detail-value">${escapeHtml(entry.description) || "Sin descripción"}</div></div>
    ${entry.tags && entry.tags.length ? `<div class="detail-row"><div class="detail-label">Etiquetas</div><div class="entry-tags">${entry.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div></div>` : ""}
    ${entry.attachment
      ? (isImageAttachment(entry.attachment)
        ? `<img class="detail-image" src="${entry.attachment.data}" alt="Imagen de evidencia" />`
        : `<a class="btn btn-ghost btn-sm" href="${entry.attachment.data}" download="${escapeHtml(entry.attachment.name)}">${attachmentIcon(entry.attachment)} Descargar ${escapeHtml(entry.attachment.name)}</a>`)
      : ""}
  `;
  document.getElementById("viewModalOverlay").classList.add("open");
}

/* ---------- CRUD: Secciones ---------- */
function saveSectionFromForm(ev) {
  ev.preventDefault();
  const name = document.getElementById("sectionName").value.trim();
  if (!name) return;
  const section = {
    id: uid("s"),
    name,
    description: document.getElementById("sectionDescription").value.trim(),
    color: document.getElementById("sectionColor").value
  };
  state.sections.push(section);
  saveState();
  document.getElementById("sectionForm").reset();
  document.getElementById("sectionModalOverlay").classList.remove("open");
  currentPage = "section";
  currentSectionId = section.id;
  currentMemberId = null;
  showToast("Sección creada");
  render();
}

function deleteSection(sectionId) {
  const sec = getSection(sectionId);
  if (!sec) return;
  const count = state.entries.filter(e => e.sectionId === sectionId).length;
  const msg = count > 0
    ? `Esta sección tiene ${count} entrada(s). Al eliminarla también se eliminarán esas entradas. ¿Continuar?`
    : `¿Eliminar la sección "${sec.name}"?`;
  if (!confirm(msg)) return;
  state.sections = state.sections.filter(s => s.id !== sectionId);
  state.entries = state.entries.filter(e => e.sectionId !== sectionId);
  saveState();
  currentPage = "dashboard";
  currentSectionId = null;
  currentMemberId = null;
  showToast("Sección eliminada");
  render();
}

/* ---------- CRUD: Integrantes ---------- */
function openMembersModal() {
  renderMembersList();
  document.getElementById("membersModalOverlay").classList.add("open");
}

function renderMembersList() {
  const container = document.getElementById("membersList");
  container.innerHTML = state.members.map(m => `
    <div class="member-row" data-member-id="${m.id}">
      <input type="text" class="member-name-input" value="${escapeHtml(m.name)}" maxlength="60" />
      <button type="button" class="icon-btn btn-remove-member" title="Eliminar integrante">🗑</button>
    </div>
  `).join("");

  container.querySelectorAll(".btn-remove-member").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".member-row");
      row.remove();
    });
  });
}

function saveMembersFromForm(ev) {
  ev.preventDefault();
  const rows = [...document.querySelectorAll("#membersList .member-row")];
  const keptIds = new Set();
  const newMembers = rows.map(row => {
    const id = row.dataset.memberId;
    const name = row.querySelector(".member-name-input").value.trim() || "Integrante";
    keptIds.add(id);
    return { id, name };
  });

  // Los integrantes eliminados en el formulario pasan sus entradas a "material de clase"
  state.entries = state.entries.map(e => e.memberId && !keptIds.has(e.memberId) ? { ...e, memberId: null } : e);
  state.members = newMembers;

  saveState();
  document.getElementById("membersModalOverlay").classList.remove("open");
  showToast("Integrantes actualizados");
  render();
}

function addMemberRow() {
  const container = document.getElementById("membersList");
  const div = document.createElement("div");
  div.className = "member-row";
  div.dataset.memberId = uid("m");
  div.innerHTML = `
    <input type="text" class="member-name-input" value="" maxlength="60" placeholder="Nombre del integrante" />
    <button type="button" class="icon-btn btn-remove-member" title="Eliminar integrante">🗑</button>
  `;
  container.appendChild(div);
  div.querySelector(".btn-remove-member").addEventListener("click", () => div.remove());
  div.querySelector("input").focus();
}

/* ---------- Búsqueda ---------- */
function handleSearch(query) {
  query = query.trim().toLowerCase();
  const main = document.getElementById("mainContent");
  if (!query) { render(); return; }

  const results = state.entries.filter(e =>
    e.title.toLowerCase().includes(query) ||
    (e.description || "").toLowerCase().includes(query) ||
    (e.tags || []).some(t => t.toLowerCase().includes(query))
  );

  main.innerHTML = `
    <div class="page-title-row">
      <div>
        <div class="page-title">Resultados de búsqueda</div>
        <div class="page-subtitle">"${escapeHtml(query)}" — ${results.length} resultado(s)</div>
      </div>
    </div>
    ${results.length === 0
      ? `<div class="empty-state"><span class="big-icon">🔍</span>No se encontraron coincidencias.</div>`
      : `<div class="entries-grid">${results.map(e => renderEntryCard(e, true)).join("")}</div>`}
  `;
  attachContentEvents();
}

/* ---------- Eventos globales ---------- */
document.getElementById("btnNuevaEntrada").addEventListener("click", () => openEntryModal(null));
document.getElementById("closeEntryModal").addEventListener("click", closeEntryModal);
document.getElementById("cancelEntry").addEventListener("click", closeEntryModal);
document.getElementById("entryForm").addEventListener("submit", saveEntryFromForm);

document.getElementById("closeViewModal").addEventListener("click", () => document.getElementById("viewModalOverlay").classList.remove("open"));

document.getElementById("btnNuevaSeccion").addEventListener("click", () => document.getElementById("sectionModalOverlay").classList.add("open"));
document.getElementById("closeSectionModal").addEventListener("click", () => document.getElementById("sectionModalOverlay").classList.remove("open"));
document.getElementById("cancelSection").addEventListener("click", () => document.getElementById("sectionModalOverlay").classList.remove("open"));
document.getElementById("sectionForm").addEventListener("submit", saveSectionFromForm);

document.getElementById("btnGestionarIntegrantes").addEventListener("click", openMembersModal);
document.getElementById("closeMembersModal").addEventListener("click", () => document.getElementById("membersModalOverlay").classList.remove("open"));
document.getElementById("cancelMembers").addEventListener("click", () => document.getElementById("membersModalOverlay").classList.remove("open"));
document.getElementById("membersForm").addEventListener("submit", saveMembersFromForm);
document.getElementById("btnAddMember").addEventListener("click", addMemberRow);

document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", (ev) => { if (ev.target === overlay) overlay.classList.remove("open"); });
});

document.getElementById("entryAttachment").addEventListener("change", (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    showToast("El archivo supera el límite de 4MB");
    ev.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingAttachment = { name: file.name, type: file.type || "application/octet-stream", data: reader.result };
    updateAttachmentPreview();
  };
  reader.readAsDataURL(file);
});

document.getElementById("searchInput").addEventListener("input", (ev) => handleSearch(ev.target.value));

document.getElementById("menuToggle").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  if (window.innerWidth <= 860) sidebar.classList.toggle("mobile-open");
  else sidebar.classList.toggle("collapsed");
});

document.querySelectorAll('.nav-item[data-view="dashboard"], .nav-item[data-view="acerca"]').forEach(btn => {
  btn.addEventListener("click", () => {
    currentPage = btn.dataset.view;
    currentSectionId = null;
    currentMemberId = null;
    render();
  });
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(o => o.classList.remove("open"));
});

/* ---------- Inicio ---------- */
saveState(); // asegura que los datos semilla/migrados queden guardados
render();
