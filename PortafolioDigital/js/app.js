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
      id: "e0", sectionId: "s1", memberIds: [], title: "Material de clase - Introducción a HCI",
      type: "Material de clase", date: "2026-04-10",
      description: "Diapositivas y guía compartidas por el profesor para la Unidad 1.",
      tags: ["material", "profesor"], attachment: null
    },
    {
      id: "e1", sectionId: "s1", memberIds: ["m1"], title: "Heurísticas de Nielsen aplicadas",
      type: "Actividad", date: "2026-04-14",
      description: "Evaluación de una interfaz utilizando las 10 heurísticas de usabilidad de Nielsen, identificando hallazgos y severidad.",
      tags: ["usabilidad", "heurísticas"], attachment: null
    },
    {
      id: "eA", sectionId: "s2", memberIds: [], title: "Material de clase - Técnicas de DCU",
      type: "Material de clase", date: "2026-04-28",
      description: "Guía del profesor sobre entrevistas, personas y escenarios.",
      tags: ["material", "profesor"], attachment: null
    },
    {
      id: "e2", sectionId: "s2", memberIds: ["m2"], title: "Entrevistas a usuarios objetivo",
      type: "Evidencia", date: "2026-05-02",
      description: "Registro de entrevistas semiestructuradas para identificar necesidades y puntos de dolor del usuario.",
      tags: ["dcu", "entrevistas"], attachment: null
    },
    {
      id: "e3", sectionId: "s3", memberIds: ["m3"], title: "Wireframes de baja fidelidad",
      type: "Evidencia", date: "2026-05-20",
      description: "Bocetos iniciales de pantallas principales antes de pasar a alta fidelidad.",
      tags: ["wireframe", "prototipo"], attachment: null
    }
  ]
};

/* ---------- Estado ---------- */
// Se inicializa con los datos semilla y se reemplaza al cargar desde el
// servidor en init() (ver el final del archivo).
let state = structuredClone(SEED_DATA);

// Navegación: currentPage = 'dashboard' | 'acerca' | 'section'
// Cuando currentPage === 'section': currentSectionId siempre presente.
// currentMemberId === null  -> vista general de la unidad (material + integrantes)
// currentMemberId === id    -> bitácora individual de ese integrante en esa unidad
let currentPage = "dashboard";
let currentSectionId = null;
let currentMemberId = null;

let editingEntryId = null;
let pendingAttachment = null;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB por archivo

/* ---------- Persistencia (Supabase: base de datos + storage en la nube) ----------
   Los datos viven en Supabase, así todos los compañeros comparten el mismo
   portafolio y ven los cambios en tiempo real. Los archivos subidos van al
   bucket de Storage; en cada entrada solo se guarda su URL pública.
   La configuración (URL y clave anónima) está en js/config.js. */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = "evidencias"; // nombre del bucket de Storage en Supabase

// Devuelve la fuente de un adjunto (URL pública del archivo).
function attachmentSrc(att) {
  if (!att) return "";
  return att.url || att.data || "";
}

// Convierte una fila de la tabla "entries" al formato que usa la app.
function rowToEntry(e) {
  return {
    id: e.id,
    sectionId: e.section_id,
    memberIds: e.member_ids || [],
    title: e.title,
    type: e.type,
    date: e.date,
    description: e.description,
    tags: e.tags || [],
    attachment: e.attachment || null
  };
}

// Carga TODO el estado (secciones, integrantes, entradas) desde Supabase.
async function loadState() {
  try {
    const [secRes, memRes, entRes] = await Promise.all([
      sb.from("sections").select("*").order("position", { ascending: true }),
      sb.from("members").select("*").order("position", { ascending: true }),
      sb.from("entries").select("*").order("created_at", { ascending: true })
    ]);
    const err = secRes.error || memRes.error || entRes.error;
    if (err) throw err;
    return {
      sections: secRes.data.map(s => ({ id: s.id, name: s.name, description: s.description, color: s.color })),
      members: memRes.data.map(m => ({ id: m.id, name: m.name })),
      entries: entRes.data.map(rowToEntry)
    };
  } catch (e) {
    console.warn("No se pudo cargar desde Supabase", e);
    showToast("No se pudo conectar a Supabase. Revisa js/config.js");
    return { sections: [], members: [], entries: [] };
  }
}

// Recarga el estado desde la nube y vuelve a dibujar la interfaz.
async function reload() {
  state = await loadState();
  render();
}

// Escucha cambios en la base de datos: cuando un compañero edita algo,
// a todos se les actualiza la vista en tiempo real.
function subscribeRealtime() {
  sb.channel("portafolio")
    .on("postgres_changes", { event: "*", schema: "public", table: "sections" }, reload)
    .on("postgres_changes", { event: "*", schema: "public", table: "members" }, reload)
    .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, reload)
    .subscribe();
}

// Sube un archivo al Storage de Supabase y devuelve { name, type, url }.
async function uploadFile(file) {
  const clean = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${clean}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false
  });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { name: file.name, type: file.type || "application/octet-stream", url: data.publicUrl };
}

/* ---------- Autenticación y control de acceso ----------
   Cada persona se registra eligiendo qué integrante del grupo es.
   El admin aprueba esa solicitud desde "Solicitudes de acceso" antes de
   que pueda agregar o editar entradas; mientras tanto (y cualquier
   visitante sin cuenta) solo puede ver la bitácora completa. */

let authUser = null;       // usuario de Supabase Auth (null si no hay sesión)
let myProfile = null;      // fila de "profiles" del usuario actual
let pendingProfiles = [];  // todas las solicitudes (solo se cargan si soy admin)

function isAdmin() { return !!myProfile && myProfile.role === "admin" && myProfile.status === "approved"; }
function isApprovedMember() { return !!myProfile && myProfile.role === "member" && myProfile.status === "approved"; }
function canWrite() { return isAdmin() || isApprovedMember(); }
// Un integrante aprobado solo puede crear/editar entradas donde él mismo figura como autor.
function canEditEntry(entry) {
  if (isAdmin()) return true;
  if (!isApprovedMember()) return false;
  return entryMemberIds(entry).includes(myProfile.member_id);
}

// Crea la fila de "profiles" si todavía no existe (primer login tras
// confirmar el correo, o justo después de registrarse).
async function ensureProfile(user) {
  const { data: existing } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (existing) return existing;
  const meta = user.user_metadata || {};
  const row = { id: user.id, email: user.email, full_name: meta.full_name || "", member_id: meta.member_id || null };
  const { data, error } = await sb.from("profiles").insert(row).select().maybeSingle();
  if (error) { console.warn("No se pudo crear el perfil", error); return null; }
  return data;
}

// Carga el usuario autenticado y su perfil (rol/estado) desde Supabase.
async function loadMyProfile() {
  const { data: { user } } = await sb.auth.getUser();
  authUser = user || null;
  myProfile = authUser ? await ensureProfile(authUser) : null;
}

// Solo el admin necesita ver todas las solicitudes para aprobarlas.
async function loadPendingProfiles() {
  if (!isAdmin()) { pendingProfiles = []; return; }
  const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: true });
  pendingProfiles = error ? [] : data;
}

// Cuenta cuántas solicitudes están pendientes (para el badge del menú).
async function updatePendingBadge() {
  const badge = document.getElementById("pendingCount");
  if (!isAdmin()) { badge.classList.add("hidden"); return; }
  const { count } = await sb.from("profiles").select("*", { count: "exact", head: true }).eq("status", "pending");
  if (count) { badge.textContent = String(count); badge.classList.remove("hidden"); }
  else { badge.classList.add("hidden"); }
}

// Refleja la sesión actual en el header, el banner y el modo de solo lectura.
function refreshAuthUI() {
  const btnOpenAuth = document.getElementById("btnOpenAuth");
  const chip = document.getElementById("userChip");
  const banner = document.getElementById("statusBanner");

  document.body.classList.toggle("no-write", !canWrite());
  document.body.classList.toggle("member-mode", isApprovedMember() && !isAdmin());

  if (!authUser) {
    btnOpenAuth.classList.remove("hidden");
    chip.classList.add("hidden");
    banner.classList.add("hidden");
  } else {
    btnOpenAuth.classList.add("hidden");
    chip.classList.remove("hidden");
    const name = (myProfile && myProfile.full_name) || authUser.email;
    document.getElementById("userChipAvatar").textContent = initials(name);
    document.getElementById("userChipName").textContent = name;
    const statusEl = document.getElementById("userChipStatus");
    if (isAdmin()) { statusEl.textContent = "Administrador"; statusEl.className = "user-chip-status status-admin"; }
    else if (isApprovedMember()) { statusEl.textContent = "Aprobado"; statusEl.className = "user-chip-status status-approved"; }
    else if (myProfile && myProfile.status === "rejected") { statusEl.textContent = "Solicitud rechazada"; statusEl.className = "user-chip-status status-rejected"; }
    else { statusEl.textContent = "Pendiente de aprobación"; statusEl.className = "user-chip-status status-pending"; }

    if (myProfile && myProfile.status === "pending") {
      banner.textContent = "⏳ Tu cuenta está pendiente de aprobación del administrador. Mientras tanto puedes ver toda la bitácora, pero no agregar ni editar entradas.";
      banner.classList.remove("hidden");
    } else if (myProfile && myProfile.status === "rejected") {
      banner.textContent = "🚫 El administrador rechazó tu solicitud de acceso. Contáctalo si crees que es un error.";
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }

  document.getElementById("btnSolicitudes").classList.toggle("hidden", !isAdmin());
  document.getElementById("adminGroupLabel").classList.toggle("hidden", !isAdmin());
  updatePendingBadge();
}

/* ---------- Modal de inicio de sesión / registro ---------- */
function populateSignupMemberSelect() {
  const sel = document.getElementById("signupMember");
  sel.innerHTML = state.members.length
    ? state.members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")
    : `<option value="">No hay integrantes registrados todavía</option>`;
}

function setAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("loginForm").classList.toggle("hidden", tab !== "login");
  document.getElementById("signupForm").classList.toggle("hidden", tab !== "signup");
  document.getElementById("authModalTitle").textContent = tab === "login" ? "Iniciar sesión" : "Crear cuenta";
}

function openAuthModal(tab) {
  populateSignupMemberSelect();
  setAuthTab(tab || "login");
  document.getElementById("authModalOverlay").classList.add("open");
}
function closeAuthModal() { document.getElementById("authModalOverlay").classList.remove("open"); }

async function handleLogin(ev) {
  ev.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { showToast("No se pudo iniciar sesión: " + error.message); return; }
  document.getElementById("loginForm").reset();
  closeAuthModal();
  showToast("Sesión iniciada");
}

async function handleSignup(ev) {
  ev.preventDefault();
  const full_name = document.getElementById("signupName").value.trim();
  const member_id = document.getElementById("signupMember").value;
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  if (!full_name || !member_id) { showToast("Completa tu nombre y elige qué integrante eres"); return; }

  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name, member_id } } });
  if (error) { showToast("No se pudo registrar: " + error.message); return; }

  document.getElementById("signupForm").reset();
  closeAuthModal();
  showToast(data.session
    ? "Cuenta creada. Queda pendiente de aprobación del administrador."
    : "Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
}

async function handleLogout() {
  await sb.auth.signOut();
  showToast("Sesión cerrada");
}

/* ---------- Panel de admin: solicitudes de acceso ---------- */
async function approveProfile(id, memberId) {
  if (!memberId) { showToast("Selecciona qué integrante es antes de aprobar"); return; }
  const { error } = await sb.from("profiles").update({ member_id: memberId, status: "approved" }).eq("id", id);
  if (error) {
    console.warn(error);
    showToast(error.code === "23505" ? "Ese integrante ya tiene una cuenta aprobada" : "No se pudo aprobar la solicitud");
    return;
  }
  showToast("Solicitud aprobada");
  await refreshAdminPanel();
}

async function rejectProfile(id) {
  if (!confirm("¿Rechazar esta solicitud de acceso?")) return;
  const { error } = await sb.from("profiles").update({ status: "rejected" }).eq("id", id);
  if (error) { console.warn(error); showToast("No se pudo rechazar la solicitud"); return; }
  showToast("Solicitud rechazada");
  await refreshAdminPanel();
}

async function revokeProfile(id) {
  if (!confirm("¿Revocar el acceso de edición de este integrante?")) return;
  const { error } = await sb.from("profiles").update({ status: "rejected" }).eq("id", id);
  if (error) { console.warn(error); showToast("No se pudo revocar el acceso"); return; }
  showToast("Acceso revocado");
  await refreshAdminPanel();
}

async function refreshAdminPanel() {
  await loadPendingProfiles();
  if (currentPage === "solicitudes") render();
  updatePendingBadge();
}

// Escucha cambios en "profiles": si me aprueban/rechazan en otro
// dispositivo se actualiza mi acceso al instante; si soy admin, el
// panel de solicitudes se refresca cuando alguien se registra.
function subscribeAuthRealtime() {
  sb.channel("profiles")
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, async (payload) => {
      const affectedId = (payload.new && payload.new.id) || (payload.old && payload.old.id);
      if (authUser && affectedId === authUser.id) {
        await loadMyProfile();
        refreshAuthUI();
        render();
      }
      if (isAdmin()) await refreshAdminPanel();
    })
    .subscribe();
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
// Lista de ids de integrantes de una entrada (tolera datos viejos con memberId único).
function entryMemberIds(entry) {
  if (Array.isArray(entry.memberIds)) return entry.memberIds;
  if (entry.memberId) return [entry.memberId];
  return [];
}
// Lista de objetos integrante (nombres) vinculados a una entrada.
function entryMembers(entry) {
  return entryMemberIds(entry).map(getMember).filter(Boolean);
}
// Una entrada es "material de clase" cuando no tiene ningún integrante.
function isMaterial(entry) { return entryMemberIds(entry).length === 0; }
function getSection(id) { return state.sections.find(s => s.id === id) || null; }
function isImageAttachment(att) { return !!att && /^image\//.test(att.type); }
function isPdfAttachment(att) {
  return !!att && (att.type === "application/pdf" || /\.pdf$/i.test(att.name || ""));
}
// Vista previa embebida de un adjunto para el modal de detalle.
// Imágenes y PDFs se muestran dentro de la página (sin descargar);
// otros tipos ofrecen abrir en pestaña nueva o descargar.
function renderAttachmentPreview(att) {
  if (!att) return "";
  const src = attachmentSrc(att);
  const name = escapeHtml(att.name);
  if (isImageAttachment(att)) {
    return `<img class="detail-image" src="${src}" alt="Imagen de evidencia" />`;
  }
  if (isPdfAttachment(att)) {
    return `
      <iframe class="detail-pdf" src="${src}" title="Vista previa de ${name}"></iframe>
      <div class="detail-file-actions">
        <a class="btn btn-ghost btn-sm" href="${src}" target="_blank" rel="noopener">🔗 Abrir en pestaña nueva</a>
        <a class="btn btn-ghost btn-sm" href="${src}" download="${name}">⬇ Descargar ${name}</a>
      </div>`;
  }
  return `
    <div class="detail-file-actions">
      <a class="btn btn-ghost btn-sm" href="${src}" target="_blank" rel="noopener">${attachmentIcon(att)} Abrir ${name}</a>
      <a class="btn btn-ghost btn-sm" href="${src}" download="${name}">⬇ Descargar</a>
    </div>`;
}
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
  } else if (currentPage === "solicitudes") {
    main.innerHTML = renderSolicitudes();
  }
  attachContentEvents();
  // Tras dibujar, ajusta las etiquetas de integrantes que no quepan (+N).
  requestAnimationFrame(collapseOwnerPills);
}

// Si las etiquetas de integrantes no caben en una línea, oculta las que
// sobran y muestra un cuadrito "+N" (con la lista completa en el tooltip).
function collapseOwnerPills() {
  document.querySelectorAll(".owner-pills").forEach(container => {
    // Reinicia: quita el "+N" anterior y muestra todas las etiquetas.
    container.querySelector(".owner-more")?.remove();
    const pills = [...container.querySelectorAll(".owner-pill")];
    pills.forEach(p => (p.style.display = ""));
    if (pills.length <= 1) return;

    const gap = 4;
    const available = container.clientWidth;
    let total = 0;
    pills.forEach((p, i) => { total += p.offsetWidth + (i ? gap : 0); });
    if (total <= available) return; // todas caben, nada que hacer

    // Prepara el cuadrito "+N" para reservar su ancho.
    const more = document.createElement("span");
    more.className = "owner-pill owner-more";
    more.textContent = "+0";
    container.appendChild(more);
    const moreW = more.offsetWidth + gap;

    let used = 0, shown = 0;
    for (let i = 0; i < pills.length; i++) {
      const w = pills[i].offsetWidth + (i ? gap : 0);
      if (used + w + moreW > available) break;
      used += w; shown++;
    }
    if (shown === 0) shown = 1; // muestra al menos una

    const hidden = pills.slice(shown);
    hidden.forEach(p => (p.style.display = "none"));
    more.textContent = "+" + hidden.length;
    more.title = "También: " + hidden.map(p => p.textContent).join(", ");
  });
}

// Reajusta al cambiar el tamaño de la ventana (cambia el espacio disponible).
window.addEventListener("resize", () => requestAnimationFrame(collapseOwnerPills));

function renderDashboard() {
  const totalEntries = state.entries.length;
  const totalSections = state.sections.length;
  const totalMembers = state.members.length;
  const lastEntry = [...state.entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];

  // Grupo etiquetado (Material de clase / Actividades) para el panel general.
  const group = (label, list, showOwner, emptyText) => `
    <div class="entry-group-label">${label}</div>
    ${list.length === 0
      ? `<div class="group-empty">${emptyText}</div>`
      : `<div class="entries-grid">${list.slice(0, 3).map(e => renderEntryCard(e, showOwner)).join("")}</div>`}`;

  const sectionsHtml = state.sections.map(sec => {
    const entries = state.entries.filter(e => e.sectionId === sec.id);
    const material = entries.filter(e => isMaterial(e));
    const activities = entries.filter(e => !isMaterial(e));
    return `
      <div class="section-block">
        <div class="section-block-header">
          <span class="section-dot" style="background:${sec.color}"></span>
          <span class="section-block-title">${escapeHtml(sec.name)}</span>
          <span class="section-count">${entries.length} entrada(s)</span>
        </div>
        ${entries.length === 0
          ? `<div class="empty-state"><span class="big-icon">🗂️</span>Aún no hay entradas en esta sección.</div>`
          : group("📎 Material de clase", material, false, "Sin material aún.") +
            group("📝 Actividades", activities, true, "Sin actividades aún.")}
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

  const material = state.entries.filter(e => e.sectionId === sectionId && isMaterial(e));
  const activities = state.entries.filter(e => e.sectionId === sectionId && !isMaterial(e));

  const memberCards = state.members.map(m => {
    const count = state.entries.filter(e => e.sectionId === sectionId && entryMemberIds(e).includes(m.id)).length;
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

    <div class="material-block">
      <div class="material-block-header">
        <div class="material-block-title">📝 Actividades / Trabajos</div>
      </div>
      ${activities.length === 0
        ? `<div class="empty-state"><span class="big-icon">📝</span>Todavía no hay actividades de los integrantes en esta unidad.</div>`
        : `<div class="entries-grid">${activities.map(e => renderEntryCard(e, true)).join("")}</div>`}
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

  const entries = state.entries.filter(e => e.sectionId === sectionId && entryMemberIds(e).includes(memberId));

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
  const members = entryMembers(entry);
  const ownerPill = showOwner
    ? (members.length
        ? `<span class="owner-pills">${members.map(m => `<span class="owner-pill">${escapeHtml(m.name)}</span>`).join("")}</span>`
        : `<span class="owner-pill material">Material de clase</span>`)
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
          ? `<img class="entry-thumb" src="${attachmentSrc(entry.attachment)}" alt="Imagen de evidencia" />`
          : `<div class="entry-file-chip">${attachmentIcon(entry.attachment)} ${escapeHtml(entry.attachment.name)}</div>`)
        : ""}
      ${entry.tags && entry.tags.length ? `<div class="entry-tags">${entry.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      ${canEditEntry(entry) ? `
      <div class="entry-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-entry-id="${entry.id}">✏️ Editar</button>
        <button class="btn btn-ghost btn-sm" data-action="delete" data-entry-id="${entry.id}">🗑 Eliminar</button>
      </div>` : ""}
    </div>`;
}

function renderSolicitudes() {
  if (!isAdmin()) { currentPage = "dashboard"; return renderDashboard(); }

  const pending = pendingProfiles.filter(p => p.status === "pending");
  const others = pendingProfiles.filter(p => p.status !== "pending" && p.id !== myProfile.id);
  const memberOptions = (selectedId) => state.members.map(m =>
    `<option value="${m.id}" ${m.id === selectedId ? "selected" : ""}>${escapeHtml(m.name)}</option>`).join("");

  const row = (p, actionsHtml) => `
    <div class="request-row" data-profile-id="${p.id}">
      <div class="request-info">
        <div class="request-name">${escapeHtml(p.full_name || p.email)}</div>
        <div class="request-email">${escapeHtml(p.email)}</div>
      </div>
      <select class="request-member-select" ${p.role === "admin" ? "disabled" : ""}>
        <option value="">Sin asignar</option>
        ${memberOptions(p.member_id)}
      </select>
      ${actionsHtml}
    </div>`;

  const pendingHtml = pending.length
    ? pending.map(p => row(p, `
        <div class="request-actions">
          <button class="btn btn-primary btn-sm" data-action="approve">✔ Aprobar</button>
          <button class="btn btn-ghost btn-sm" data-action="reject">✕ Rechazar</button>
        </div>`)).join("")
    : `<div class="empty-state"><span class="big-icon">✅</span>No hay solicitudes pendientes.</div>`;

  const othersHtml = others.map(p => row(p, `
      <span class="badge ${p.role === "admin" ? "badge-admin" : p.status === "approved" ? "badge-approved" : "badge-rejected"}">
        ${p.role === "admin" ? "Admin" : p.status === "approved" ? "Aprobado" : "Rechazado"}
      </span>
      <div class="request-actions">
        ${p.status === "approved"
          ? `<button class="btn btn-ghost btn-sm" data-action="revoke">Revocar acceso</button>`
          : p.role !== "admin" ? `<button class="btn btn-ghost btn-sm" data-action="approve">✔ Aprobar</button>` : ""}
      </div>`)).join("");

  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">Solicitudes de acceso</div>
        <div class="page-subtitle">Aprueba a cada integrante para que pueda agregar y editar su propia bitácora.</div>
      </div>
    </div>
    <div class="requests-list">${pendingHtml}</div>
    ${others.length ? `<div class="entry-group-label" style="margin-top:24px;">Cuentas ya gestionadas</div><div class="requests-list">${othersHtml}</div>` : ""}
  `;
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
  if (delSecBtn) delSecBtn.addEventListener("click", () => {
    if (!isAdmin()) { showToast("Solo el administrador puede eliminar secciones"); return; }
    deleteSection(currentSectionId);
  });

  const addMaterialBtn = document.getElementById("btnAddMaterial");
  if (addMaterialBtn) addMaterialBtn.addEventListener("click", () => {
    if (!isAdmin()) { showToast("Solo el administrador puede agregar material de clase"); return; }
    openEntryModal(null, { sectionId: currentSectionId, memberIds: [] });
  });

  document.querySelectorAll(".member-card").forEach(card => {
    card.addEventListener("click", () => {
      currentMemberId = card.dataset.member;
      render();
    });
  });

  const backBtn = document.getElementById("btnBackToSection");
  if (backBtn) backBtn.addEventListener("click", () => { currentMemberId = null; render(); });

  document.querySelectorAll(".request-row").forEach(rowEl => {
    const id = rowEl.dataset.profileId;
    const select = rowEl.querySelector(".request-member-select");
    const approveBtn = rowEl.querySelector('[data-action="approve"]');
    const rejectBtn = rowEl.querySelector('[data-action="reject"]');
    const revokeBtn = rowEl.querySelector('[data-action="revoke"]');
    if (approveBtn) approveBtn.addEventListener("click", () => approveProfile(id, select.value || null));
    if (rejectBtn) rejectBtn.addEventListener("click", () => rejectProfile(id));
    if (revokeBtn) revokeBtn.addEventListener("click", () => revokeProfile(id));
  });
}

/* ---------- CRUD: Entradas ---------- */
function updateAttachmentPreview() {
  const preview = document.getElementById("entryAttachmentPreview");
  if (!pendingAttachment) { preview.classList.add("hidden"); preview.innerHTML = ""; return; }
  preview.classList.remove("hidden");
  preview.innerHTML = isImageAttachment(pendingAttachment)
    ? `<img src="${attachmentSrc(pendingAttachment)}" alt="Vista previa" />
       <button type="button" class="icon-btn" id="btnRemoveAttachment" title="Quitar archivo">✕</button>`
    : `<span>${attachmentIcon(pendingAttachment)} ${escapeHtml(pendingAttachment.name)}</span>
       <button type="button" class="icon-btn" id="btnRemoveAttachment" title="Quitar archivo">✕</button>`;
  document.getElementById("btnRemoveAttachment").addEventListener("click", () => {
    pendingAttachment = null;
    document.getElementById("entryAttachment").value = "";
    updateAttachmentPreview();
  });
}

// Dibuja las casillas de integrantes en el modal, marcando los seleccionados.
function renderMemberChecklist(selectedIds) {
  const set = new Set(selectedIds || []);
  // Un integrante aprobado siempre queda marcado a sí mismo (no puede
  // quitarse), así se prueba que es dueño de la entrada que crea/edita.
  const lockedId = isApprovedMember() ? myProfile.member_id : null;
  if (lockedId) set.add(lockedId);
  const container = document.getElementById("entryMemberList");
  container.innerHTML = state.members.length
    ? state.members.map(m => `
        <label class="member-check">
          <input type="checkbox" value="${m.id}" ${set.has(m.id) ? "checked" : ""} ${m.id === lockedId ? "disabled" : ""} />
          <span>${escapeHtml(m.name)}</span>
        </label>`).join("")
    : `<div class="group-empty">No hay integrantes todavía. Agrégalos en "Gestionar integrantes".</div>`;
}

function openEntryModal(entryId, defaults) {
  editingEntryId = entryId || null;
  pendingAttachment = null;
  document.getElementById("entryAttachment").value = "";
  const overlay = document.getElementById("entryModalOverlay");
  const sectionSelect = document.getElementById("entrySection");

  sectionSelect.innerHTML = state.sections.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");

  if (entryId) {
    const entry = state.entries.find(e => e.id === entryId);
    document.getElementById("entryModalTitle").textContent = "Editar entrada";
    document.getElementById("entryId").value = entry.id;
    document.getElementById("entryTitle").value = entry.title;
    sectionSelect.value = entry.sectionId;
    renderMemberChecklist(entryMemberIds(entry));
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
    const defMemberIds = defaults && "memberIds" in defaults ? defaults.memberIds : (currentMemberId ? [currentMemberId] : []);

    if (defSection && state.sections.some(s => s.id === defSection)) sectionSelect.value = defSection;
    renderMemberChecklist(defMemberIds);
    updateAttachmentPreview();
  }
  overlay.classList.add("open");
}

function closeEntryModal() {
  document.getElementById("entryModalOverlay").classList.remove("open");
  editingEntryId = null;
  pendingAttachment = null;
}

async function saveEntryFromForm(ev) {
  ev.preventDefault();
  if (!canWrite()) { showToast("Debes iniciar sesión con una cuenta aprobada para guardar entradas"); return; }
  if (editingEntryId) {
    const existing = state.entries.find(e => e.id === editingEntryId);
    if (existing && !canEditEntry(existing)) { showToast("No tienes permiso para editar esta entrada"); return; }
  }

  const title = document.getElementById("entryTitle").value.trim();
  const sectionId = document.getElementById("entrySection").value;
  if (!title || !sectionId) return;

  const tags = document.getElementById("entryTags").value
    .split(",").map(t => t.trim()).filter(Boolean);

  const memberIds = [...document.querySelectorAll("#entryMemberList input[type=checkbox]:checked")]
    .map(c => c.value);

  if (isApprovedMember() && !memberIds.includes(myProfile.member_id)) {
    showToast("Debes incluirte como integrante de esta entrada");
    return;
  }

  // Fila con los nombres de columna de la tabla "entries" en Supabase.
  const row = {
    section_id: sectionId,
    member_ids: memberIds,
    title,
    type: document.getElementById("entryType").value,
    date: document.getElementById("entryDate").value || null,
    description: document.getElementById("entryDescription").value.trim(),
    tags,
    attachment: pendingAttachment
  };

  let error;
  if (editingEntryId) {
    ({ error } = await sb.from("entries").update(row).eq("id", editingEntryId));
  } else {
    row.id = uid("e");
    ({ error } = await sb.from("entries").insert(row));
  }
  if (error) { console.warn(error); showToast("No se pudo guardar la entrada"); return; }

  showToast(editingEntryId ? "Entrada actualizada" : "Entrada agregada");
  closeEntryModal();
  await reload();
}

async function deleteEntry(entryId) {
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry) return;
  if (!canEditEntry(entry)) { showToast("No tienes permiso para eliminar esta entrada"); return; }
  if (!confirm(`¿Eliminar la entrada "${entry.title}"? Esta acción no se puede deshacer.`)) return;
  const { error } = await sb.from("entries").delete().eq("id", entryId);
  if (error) { console.warn(error); showToast("No se pudo eliminar la entrada"); return; }
  showToast("Entrada eliminada");
  await reload();
}

function openViewModal(entryId) {
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry) return;
  const sec = getSection(entry.sectionId);
  const members = entryMembers(entry);
  const ownerText = members.length ? members.map(m => escapeHtml(m.name)).join(", ") : "Material de clase";
  document.getElementById("viewModalTitle").textContent = entry.title;
  document.getElementById("viewModalBody").innerHTML = `
    <div class="detail-row"><div class="detail-label">Sección</div><div class="detail-value">${sec ? escapeHtml(sec.name) : "—"}</div></div>
    <div class="detail-row"><div class="detail-label">Integrante(s)</div><div class="detail-value">${ownerText}</div></div>
    <div class="detail-row"><div class="detail-label">Tipo</div><div class="detail-value">${escapeHtml(entry.type)}</div></div>
    <div class="detail-row"><div class="detail-label">Fecha</div><div class="detail-value">${formatDate(entry.date)}</div></div>
    <div class="detail-row"><div class="detail-label">Descripción</div><div class="detail-value">${escapeHtml(entry.description) || "Sin descripción"}</div></div>
    ${entry.tags && entry.tags.length ? `<div class="detail-row"><div class="detail-label">Etiquetas</div><div class="entry-tags">${entry.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div></div>` : ""}
    ${entry.attachment
      ? `<div class="detail-row"><div class="detail-label">Evidencia</div><div class="detail-value">${escapeHtml(entry.attachment.name)}</div></div>${renderAttachmentPreview(entry.attachment)}`
      : ""}
  `;
  document.getElementById("viewModalOverlay").classList.add("open");
}

/* ---------- CRUD: Secciones ---------- */
async function saveSectionFromForm(ev) {
  ev.preventDefault();
  if (!isAdmin()) { showToast("Solo el administrador puede crear secciones"); return; }
  const name = document.getElementById("sectionName").value.trim();
  if (!name) return;
  const section = {
    id: uid("s"),
    name,
    description: document.getElementById("sectionDescription").value.trim(),
    color: document.getElementById("sectionColor").value,
    position: state.sections.length
  };
  const { error } = await sb.from("sections").insert(section);
  if (error) { console.warn(error); showToast("No se pudo crear la sección"); return; }
  document.getElementById("sectionForm").reset();
  document.getElementById("sectionModalOverlay").classList.remove("open");
  currentPage = "section";
  currentSectionId = section.id;
  currentMemberId = null;
  showToast("Sección creada");
  await reload();
}

async function deleteSection(sectionId) {
  if (!isAdmin()) { showToast("Solo el administrador puede eliminar secciones"); return; }
  const sec = getSection(sectionId);
  if (!sec) return;
  const count = state.entries.filter(e => e.sectionId === sectionId).length;
  const msg = count > 0
    ? `Esta sección tiene ${count} entrada(s). Al eliminarla también se eliminarán esas entradas. ¿Continuar?`
    : `¿Eliminar la sección "${sec.name}"?`;
  if (!confirm(msg)) return;
  // Las entradas de la sección se borran solas por la regla ON DELETE CASCADE.
  const { error } = await sb.from("sections").delete().eq("id", sectionId);
  if (error) { console.warn(error); showToast("No se pudo eliminar la sección"); return; }
  currentPage = "dashboard";
  currentSectionId = null;
  currentMemberId = null;
  showToast("Sección eliminada");
  await reload();
}

/* ---------- CRUD: Integrantes ---------- */
function openMembersModal() {
  if (!isAdmin()) { showToast("Solo el administrador puede gestionar integrantes"); return; }
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

async function saveMembersFromForm(ev) {
  ev.preventDefault();
  if (!isAdmin()) { showToast("Solo el administrador puede gestionar integrantes"); return; }
  const rows = [...document.querySelectorAll("#membersList .member-row")];
  const keptIds = new Set();
  const newMembers = rows.map((row, i) => {
    const id = row.dataset.memberId;
    const name = row.querySelector(".member-name-input").value.trim() || "Integrante";
    keptIds.add(id);
    return { id, name, position: i };
  });

  const removedIds = state.members.filter(m => !keptIds.has(m.id)).map(m => m.id);

  // Crea/actualiza los integrantes que se conservan.
  const { error } = await sb.from("members").upsert(newMembers);
  if (error) { console.warn(error); showToast("No se pudieron guardar los integrantes"); return; }

  // Integrantes eliminados: se les quita de la lista de cada trabajo. Si un
  // trabajo se queda sin integrantes, pasa a ser "material de clase".
  if (removedIds.length) {
    const affected = state.entries.filter(e => entryMemberIds(e).some(id => removedIds.includes(id)));
    for (const e of affected) {
      const newIds = entryMemberIds(e).filter(id => !removedIds.includes(id));
      await sb.from("entries").update({ member_ids: newIds }).eq("id", e.id);
    }
    await sb.from("members").delete().in("id", removedIds);
  }

  document.getElementById("membersModalOverlay").classList.remove("open");
  showToast("Integrantes actualizados");
  await reload();
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
document.getElementById("btnNuevaEntrada").addEventListener("click", () => {
  if (!canWrite()) { openAuthModal("login"); return; }
  openEntryModal(null);
});
document.getElementById("closeEntryModal").addEventListener("click", closeEntryModal);
document.getElementById("cancelEntry").addEventListener("click", closeEntryModal);
document.getElementById("entryForm").addEventListener("submit", saveEntryFromForm);

document.getElementById("closeViewModal").addEventListener("click", () => document.getElementById("viewModalOverlay").classList.remove("open"));

document.getElementById("btnOpenAuth").addEventListener("click", () => openAuthModal("login"));
document.getElementById("closeAuthModal").addEventListener("click", closeAuthModal);
document.querySelectorAll(".auth-tab").forEach(tab => tab.addEventListener("click", () => setAuthTab(tab.dataset.tab)));
document.getElementById("loginForm").addEventListener("submit", handleLogin);
document.getElementById("signupForm").addEventListener("submit", handleSignup);
document.getElementById("btnLogout").addEventListener("click", handleLogout);

document.getElementById("btnNuevaSeccion").addEventListener("click", () => {
  if (!isAdmin()) { showToast("Solo el administrador puede crear secciones"); return; }
  document.getElementById("sectionModalOverlay").classList.add("open");
});
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

document.getElementById("entryAttachment").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    showToast("El archivo supera el límite de 25MB");
    ev.target.value = "";
    return;
  }
  showToast("Subiendo archivo…");
  try {
    pendingAttachment = await uploadFile(file);
    updateAttachmentPreview();
    showToast("Archivo subido");
  } catch (e) {
    console.warn("Error al subir el archivo", e);
    showToast("No se pudo subir el archivo");
    ev.target.value = "";
  }
});

document.getElementById("searchInput").addEventListener("input", (ev) => handleSearch(ev.target.value));

document.getElementById("menuToggle").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  if (window.innerWidth <= 860) sidebar.classList.toggle("mobile-open");
  else sidebar.classList.toggle("collapsed");
});

document.querySelectorAll('.nav-item[data-view="dashboard"], .nav-item[data-view="acerca"], .nav-item[data-view="solicitudes"]').forEach(btn => {
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
async function init() {
  await loadMyProfile();
  state = await loadState();
  if (isAdmin()) await loadPendingProfiles();
  render();
  refreshAuthUI();
  subscribeRealtime();     // los cambios de otros compañeros llegan en vivo
  subscribeAuthRealtime(); // aprobaciones/rechazos llegan en vivo

  sb.auth.onAuthStateChange(async () => {
    await loadMyProfile();
    if (isAdmin()) await loadPendingProfiles(); else pendingProfiles = [];
    refreshAuthUI();
    render();
  });
}
init();
