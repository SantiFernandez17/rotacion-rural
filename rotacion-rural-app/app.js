const STORAGE_KEY = "rotacionRuralApp:v1";
const AUTH_STORAGE_KEY = "rotacionRuralApp:awsAuth:v1";
const PKCE_STORAGE_KEY = "rotacionRuralApp:pkce:v1";
const ROTATION_END_DATE = "2026-08-28";
const awsConfig = window.ROTACION_AWS_CONFIG || { enabled: false };

const seedData = {
  profile: {
    name: "Mi doctora",
    destination: "Santiago del Estero",
    startDate: "2026-07-01",
    endDate: ROTATION_END_DATE,
    signature: "Santi"
  },
  checklist: [
    item("doc-1", "Documentos", "DNI y fotocopia", true),
    item("doc-2", "Documentos", "Credencial o constancia de estudiante/profesional", false),
    item("doc-3", "Documentos", "Carnet de vacunas y obra social", false),
    item("med-1", "Medico", "Estetoscopio", true),
    item("med-2", "Medico", "Ambo y calzado comodo", false),
    item("med-3", "Medico", "Linterna chica y lapiceras", false),
    item("med-4", "Medico", "Alcohol en gel, barbijo y guantes", false),
    item("viaje-1", "Viaje", "Cargador, power bank y cable extra", false),
    item("viaje-2", "Viaje", "Repelente y protector solar", false),
    item("viaje-3", "Viaje", "Botella reutilizable", false),
    item("casa-1", "Casa", "Mate, yerba y algo rico para el camino", false),
    item("casa-2", "Casa", "Abrigo liviano y ropa fresca", false)
  ],
  diary: [],
  messages: [
    {
      id: uid(),
      title: "Abrir cuando llegues",
      body: "Llegaste a una experiencia enorme. Respira, acomodate y acordate de que no tenes que resolver todo el primer dia. Estoy con vos.",
      opened: false
    },
    {
      id: uid(),
      title: "Abrir despues de una guardia pesada",
      body: "Hiciste lo que pudiste con lo que habia. Eso tambien es medicina. Dormi, toma agua y escribime cuando puedas.",
      opened: false
    },
    {
      id: uid(),
      title: "Abrir si extranas casa",
      body: "La distancia dura un rato. Lo que estas construyendo queda. Te espero con abrazo, comida rica y ganas de escucharte.",
      opened: false
    }
  ],
  plans: [],
  contacts: [
    contact("Emergencias", "Numero general", "911", ""),
    contact("Hospital / centro de salud", "Guardia o coordinacion", "", ""),
    contact("Hospedaje", "Direccion y referente", "", ""),
    contact("Santi", "Casa", "", "")
  ],
  agenda: [
    agenda("2026-07-01", "08:00", "Llegada y acreditacion", "Centro de salud", "Rotacion", "Presentarse, confirmar horarios y referentes."),
    agenda("2026-07-02", "07:30", "Primer dia de consultorio", "Centro de salud", "Practica", "Llevar ambo, estetoscopio y libreta."),
    agenda("2026-07-05", "20:30", "Llamada tranquila", "WhatsApp", "Personal", "Contar como viene la primera semana.")
  ]
};

let state = loadState();
let activeTab = "home";
let checklistFilter = "all";
let planFilter = "pending";
let cloudStatus = {
  enabled: Boolean(awsConfig.enabled),
  signedIn: false,
  email: "",
  syncing: false,
  lastSync: "",
  updatedBy: "",
  error: ""
};
let notificationStatus = {
  supported: "serviceWorker" in navigator && "PushManager" in window,
  subscribed: false,
  loading: false,
  message: "Buen dia, mi amor. Espero que tengas un lindo dia.",
  time: "10:00",
  receivedMessage: "",
  receivedAt: "",
  actionMessage: "",
  error: ""
};
let saveTimer = null;

const app = document.querySelector("#app");
const navButtons = [...document.querySelectorAll(".nav-button")];

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    navButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  });
});

document.addEventListener("submit", handleSubmit);
document.addEventListener("click", handleClick);
document.addEventListener("change", handleChange);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "notification-received") return;
    notificationStatus.receivedMessage = event.data.body || "";
    notificationStatus.receivedAt = event.data.sentAt || new Date().toISOString();
    render();
  });
}

initCloudSync();
render();

function item(id, category, text, done = false) {
  return { id, category, text, done };
}

function contact(name, role, phone, notes) {
  return { id: uid(), name, role, phone, notes };
}

function agenda(date, time, title, place, type, notes) {
  return { id: uid(), date, time, title, place, type, notes, done: false };
}

function plan(title, category, date, createdBy) {
  return { id: uid(), title, category, date, createdBy, done: false };
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return normalizeState(seedData);

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(seedData);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSave();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeState(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = {
    ...clone(seedData),
    ...clone(source),
    profile: {
      ...clone(seedData.profile),
      ...(source.profile || {})
    }
  };

  normalized.profile.endDate = ROTATION_END_DATE;
  normalized.plans = Array.isArray(normalized.plans) ? normalized.plans : [];
  return normalized;
}

function render() {
  const views = {
    home: renderHome,
    checklist: renderChecklist,
    diary: renderDiary,
    love: renderLove,
    contacts: renderContacts,
    agenda: renderAgenda,
    plans: renderPlans
  };

  app.innerHTML = views[activeTab]();
}

function renderHome() {
  const nextEvent = getNextEvent();
  const lastEntry = [...state.diary].sort((a, b) => b.date.localeCompare(a.date))[0];
  const primaryContact = state.contacts.find((entry) => entry.phone);
  const unopenedMessages = state.messages.filter((message) => !message.opened).length;

  return `
    ${sectionHead(`Hola, ${escapeHtml(state.profile.name)}`, "Un tablero corto para acompanar la rotacion, escribir lo vivido y tener lo importante a mano.")}
    ${renderCloudPanel()}
    ${renderDashboardWidgets(nextEvent)}
    <section class="grid three home-actions">
      <article class="card entry">
        <div class="row">
          <span class="pill">Diario</span>
          <button class="button ghost" data-go="diary">Escribir</button>
        </div>
        ${
          lastEntry
            ? `<h3>${escapeHtml(lastEntry.title || "Ultima entrada")}</h3><p>${escapeHtml(lastEntry.learned || lastEntry.good || "Hay una entrada guardada.")}</p>`
            : `<h3>Todavia no hay entradas</h3><p>Puede guardar aprendizajes, momentos lindos y cosas para conversar despues.</p>`
        }
      </article>
      <article class="card entry">
        <div class="row">
          <span class="pill">Mensajes</span>
          <button class="button ghost" data-go="love">Abrir</button>
        </div>
        <h3>${unopenedMessages ? `${unopenedMessages} por abrir` : "Todos abiertos"}</h3>
        <p>${unopenedMessages ? "Hay cartas cortas para cuando necesite una pausa, un mimo o cerrar un dia largo." : "Podes agregarle un mensaje nuevo para que aparezca aca."}</p>
      </article>
      <article class="card entry">
        <div class="row">
          <span class="pill">SOS</span>
          <button class="button ghost" data-go="contacts">Contactos</button>
        </div>
        <h3>${primaryContact ? escapeHtml(primaryContact.name) : "Sin telefono cargado"}</h3>
        <p>${primaryContact ? escapeHtml(primaryContact.role || primaryContact.phone) : "Carga al menos un numero importante para llamar desde la app."}</p>
        ${primaryContact ? `<a class="button secondary full" href="tel:${cleanPhone(primaryContact.phone)}">☎ Llamar</a>` : ""}
      </article>
    </section>
  `;
}

function renderDashboardWidgets(nextEvent) {
  const remaining = daysLeft();
  const receivedMessage = notificationStatus.receivedMessage;
  const pendingPlans = state.plans.filter((entry) => !entry.done);
  const planPreview = pendingPlans.slice(0, 3);

  return `
    <section class="widget-grid" aria-label="Resumen de la rotacion">
      <article class="dashboard-widget countdown-widget">
        <span class="widget-label">Cuenta regresiva</span>
        <strong class="widget-number">${remaining}</strong>
        <p>${remaining === 1 ? "dia" : "dias"} hasta el 28 de agosto</p>
        <div class="progress" aria-label="${rotationProgress()}% de la rotacion transcurrido"><span style="--value: ${rotationProgress()}%"></span></div>
      </article>
      <article class="dashboard-widget">
        <div class="row">
          <span class="widget-label">Proxima actividad</span>
          <button class="icon-button" data-go="agenda" aria-label="Abrir agenda" title="Abrir agenda">&#8250;</button>
        </div>
        ${
          nextEvent
            ? `<strong class="widget-title">${escapeHtml(nextEvent.title)}</strong><p>${formatDate(nextEvent.date)}${nextEvent.time ? ` a las ${escapeHtml(nextEvent.time)}` : ""}</p><span class="widget-meta">${escapeHtml(nextEvent.place || "Sin lugar cargado")}</span>`
            : `<strong class="widget-title">Sin actividades pendientes</strong><p>La proxima fecha que agreguen aparecera aca.</p>`
        }
      </article>
      <article class="dashboard-widget message-widget">
        <span class="widget-label">Mensaje recibido</span>
        ${
          receivedMessage
            ? `<p class="widget-message">${escapeHtml(receivedMessage)}</p><span class="widget-meta">${notificationStatus.receivedAt ? `Recibido ${formatDateTime(notificationStatus.receivedAt)}` : "Recibido recientemente"}</span>`
            : `<strong class="widget-title">Todavia no llego ninguno</strong><p>El ultimo mensaje diario recibido quedara guardado aca.</p>`
        }
      </article>
      <article class="dashboard-widget plans-widget">
        <div class="row">
          <span class="widget-label">Planes para la vuelta</span>
          <button class="icon-button" data-go="plans" aria-label="Abrir planes" title="Abrir planes">&#8250;</button>
        </div>
        ${
          planPreview.length
            ? `<ul class="widget-list">${planPreview.map((entry) => `<li>${escapeHtml(entry.title)}</li>`).join("")}</ul><span class="widget-meta">${remaining ? `${pendingPlans.length} ${pendingPlans.length === 1 ? "idea" : "ideas"} · faltan ${remaining} dias` : "Ahora si: elijan cual hacer primero"}</span>`
            : `<strong class="widget-title">Todavia no hay planes</strong><p>Guarden salidas, comidas, viajes y sorpresas para la vuelta.</p>`
        }
      </article>
    </section>
  `;
}

function renderPlans() {
  const visiblePlans = [...state.plans]
    .filter((entry) => planFilter === "all" || (planFilter === "pending" ? !entry.done : entry.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31"));

  return `
    <div class="view-back"><button class="icon-button" data-go="home" aria-label="Volver al inicio" title="Volver al inicio">&#8592;</button></div>
    ${sectionHead("Planes para la vuelta", "Una lista compartida para guardar todo lo que quieran hacer cuando termine la rotacion.")}
    <form data-form="plan" class="form-panel">
      <div class="form-grid">
        <label class="field">Plan
          <input name="title" placeholder="Cena, paseo, viaje, tarde de peliculas..." maxlength="120" required />
        </label>
        <label class="field">Categoria
          <select name="category">
            <option>Salida</option>
            <option>Comida</option>
            <option>Viaje</option>
            <option>Casa</option>
            <option>Sorpresa</option>
          </select>
        </label>
        <label class="field">Fecha opcional
          <input name="date" type="date" min="${ROTATION_END_DATE}" />
        </label>
      </div>
      <button class="button" type="submit">＋ Agregar plan</button>
    </form>
    <div class="toolbar plans-toolbar">
      <div class="segmented" aria-label="Filtro de planes">
        <button class="${planFilter === "pending" ? "is-active" : ""}" data-plan-filter="pending">Pendientes</button>
        <button class="${planFilter === "done" ? "is-active" : ""}" data-plan-filter="done">Realizados</button>
        <button class="${planFilter === "all" ? "is-active" : ""}" data-plan-filter="all">Todos</button>
      </div>
      <span class="muted">${state.plans.filter((entry) => !entry.done).length} por hacer</span>
    </div>
    <section class="grid two">
      ${visiblePlans.map(renderPlan).join("") || emptyState("No hay planes en esta vista", "Agreguen la primera idea para despues de la rotacion.")}
    </section>
  `;
}

function renderPlan(entry) {
  return `
    <article class="card entry plan-item ${entry.done ? "done" : ""}">
      <div class="row">
        <span class="pill">${escapeHtml(entry.category || "Plan")}</span>
        <div class="item-actions">
          <button class="icon-button" data-toggle-plan="${entry.id}" aria-label="${entry.done ? "Marcar pendiente" : "Marcar realizado"}" title="${entry.done ? "Marcar pendiente" : "Marcar realizado"}">${entry.done ? "&#8634;" : "&#10003;"}</button>
          <button class="icon-button danger" data-delete-plan="${entry.id}" aria-label="Borrar plan" title="Borrar">&#215;</button>
        </div>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${entry.date ? formatDate(entry.date) : "Sin fecha definida"}<br>${escapeHtml(planAuthor(entry.createdBy))}</p>
    </article>
  `;
}

function renderCloudPanel() {
  if (!cloudStatus.enabled) {
    return `
      <section class="sync-panel">
        <div>
          <strong>Modo local</strong>
          <p>La app esta lista para AWS. Falta cargar la configuracion en aws-config.js.</p>
        </div>
      </section>
    `;
  }

  if (!cloudStatus.signedIn) {
    return `
      <section class="sync-panel">
        <div>
          <strong>Nube AWS</strong>
          <p>Inicia sesion para sincronizar diario, mensajes, agenda y contactos.</p>
          ${cloudStatus.error ? `<p class="sync-error">${escapeHtml(cloudStatus.error)}</p>` : ""}
        </div>
        <button class="button" data-login>Iniciar sesion</button>
      </section>
    `;
  }

  return `
    <section class="sync-panel">
      <div>
        <strong>${escapeHtml(cloudStatus.email || "Sesion activa")}</strong>
        <p>${cloudStatus.syncing ? "Sincronizando..." : cloudStatus.lastSync ? `Ultima sincronizacion: ${formatDateTime(cloudStatus.lastSync)}` : "Sesion iniciada."}</p>
        ${cloudStatus.updatedBy ? `<p class="muted">Ultimo cambio: ${escapeHtml(cloudStatus.updatedBy)}</p>` : ""}
        ${cloudStatus.error ? `<p class="sync-error">${escapeHtml(cloudStatus.error)}</p>` : ""}
      </div>
      <div class="sync-actions">
        <button class="button secondary" data-sync-now>Sincronizar</button>
        <button class="button ghost" data-logout>Salir</button>
      </div>
    </section>
    ${renderNotificationPanel()}
  `;
}

function renderNotificationPanel() {
  if (!notificationStatus.supported) {
    return `<section class="sync-panel"><div><strong>Notificaciones</strong><p>Este navegador no permite Web Push. Probá con Chrome, Edge o una app agregada a la pantalla de inicio en iPhone.</p></div></section>`;
  }

  return `
    <section class="form-panel notification-panel">
      <div class="row"><div><strong>Tu mensaje diario</strong><p>Se enviará a la otra persona todos los días a la hora que elijas.</p></div><span class="pill">${notificationStatus.subscribed ? "Activo" : "Sin activar"}</span></div>
      <label class="field">Mensaje para la otra persona
        <textarea data-notification-message maxlength="500">${escapeHtml(notificationStatus.message)}</textarea>
      </label>
      <label class="field">Hora de envío
        <input type="time" data-notification-time value="${escapeAttr(notificationStatus.time)}" required />
      </label>
      <div class="row notification-actions">
        <button class="button" data-enable-notifications ${notificationStatus.loading ? "disabled" : ""}>${notificationStatus.subscribed ? "Notificaciones activas" : "Activar en este navegador"}</button>
        <button class="button secondary" data-save-notification ${notificationStatus.loading ? "disabled" : ""}>Guardar mensaje</button>
        <button class="button ghost" data-test-notification ${notificationStatus.loading ? "disabled" : ""}>Enviar prueba ahora</button>
      </div>
      ${notificationStatus.actionMessage ? `<p class="sync-success">${escapeHtml(notificationStatus.actionMessage)}</p>` : ""}
      ${notificationStatus.error ? `<p class="sync-error">${escapeHtml(notificationStatus.error)}</p>` : ""}
    </section>
  `;
}

function renderChecklist() {
  const progress = checklistProgress(state.checklist);
  const categories = [...new Set(state.checklist.map((entry) => entry.category))].sort();
  const visibleItems = state.checklist.filter((entry) => checklistFilter === "all" || !entry.done);

  return `
    ${sectionHead("Checklist practico", "Marca lo que ya esta listo y mira el avance general o por categoria.")}
    <section class="grid two">
      ${stat(`${progress.percent}%`, "Preparado", progress.percent)}
      ${stat(`${progress.done}/${progress.total}`, "Items completos", progress.percent)}
    </section>
    <div class="toolbar">
      <div class="segmented" aria-label="Filtro de checklist">
        <button class="${checklistFilter === "all" ? "is-active" : ""}" data-filter="all">Todo</button>
        <button class="${checklistFilter === "pending" ? "is-active" : ""}" data-filter="pending">Pendiente</button>
      </div>
    </div>
    <details class="form-panel">
      <summary>Agregar item</summary>
      <form data-form="checklist" class="form-grid" style="margin-top: 10px;">
        <label class="field">Categoria
          <input name="category" list="categories" placeholder="Documentos" required />
          <datalist id="categories">
            ${categories.map((category) => `<option value="${escapeHtml(category)}"></option>`).join("")}
          </datalist>
        </label>
        <label class="field">Item
          <input name="text" placeholder="Ej: receta o medicacion personal" required />
        </label>
        <button class="button" type="submit">＋ Agregar</button>
      </form>
    </details>
    <section class="grid">
      ${
        categories
          .map((category) => {
            const categoryItems = visibleItems.filter((entry) => entry.category === category);
            if (!categoryItems.length) return "";
            const categoryProgress = checklistProgress(state.checklist.filter((entry) => entry.category === category));
            return `
              <article class="card category">
                <h3>
                  ${escapeHtml(category)}
                  <span class="pill">${categoryProgress.percent}%</span>
                </h3>
                <div class="progress" aria-label="${categoryProgress.percent}% completo">
                  <span style="--value: ${categoryProgress.percent}%"></span>
                </div>
                ${categoryItems.map(renderChecklistItem).join("")}
              </article>
            `;
          })
          .join("") || emptyState("No hay pendientes", "El filtro actual no tiene items para mostrar.")
      }
    </section>
  `;
}

function renderChecklistItem(entry) {
  return `
    <div class="check-item ${entry.done ? "done" : ""}">
      <input id="${entry.id}" type="checkbox" data-check-id="${entry.id}" ${entry.done ? "checked" : ""} />
      <label for="${entry.id}">${escapeHtml(entry.text)}</label>
      <button class="icon-button danger" data-delete-check="${entry.id}" aria-label="Borrar item" title="Borrar">×</button>
    </div>
  `;
}

function renderDiary() {
  const entries = [...state.diary].sort((a, b) => b.date.localeCompare(a.date));

  return `
    ${sectionHead("Diario de experiencia", "Un lugar privado para registrar aprendizajes, momentos dificiles y cosas lindas.")}
    <form data-form="diary" class="form-panel">
      <div class="form-grid">
        <label class="field">Fecha
          <input name="date" type="date" value="${todayISO()}" required />
        </label>
        <label class="field">Titulo
          <input name="title" placeholder="Dia de consultorio, guardia, visita..." required />
        </label>
      </div>
      <label class="field">Que aprendi
        <textarea name="learned" placeholder="Algo clinico, humano o del lugar"></textarea>
      </label>
      <label class="field">Algo lindo
        <textarea name="good" placeholder="Una charla, un paciente, un paisaje, una comida"></textarea>
      </label>
      <label class="field">Algo dificil
        <textarea name="hard" placeholder="Para soltarlo aca y retomarlo con calma"></textarea>
      </label>
      <button class="button" type="submit">＋ Guardar entrada</button>
    </form>
    <section class="grid">
      ${entries.map(renderDiaryEntry).join("") || emptyState("Todavia no escribiste", "La primera entrada puede ser corta. Una linea tambien cuenta.")}
    </section>
  `;
}

function renderDiaryEntry(entry) {
  return `
    <article class="card entry">
      <div class="row">
        <span class="pill">${formatDate(entry.date)}</span>
        <button class="icon-button danger" data-delete-diary="${entry.id}" aria-label="Borrar entrada" title="Borrar">×</button>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      ${entry.learned ? `<p><strong>Aprendi:</strong> ${escapeHtml(entry.learned)}</p>` : ""}
      ${entry.good ? `<p><strong>Lindo:</strong> ${escapeHtml(entry.good)}</p>` : ""}
      ${entry.hard ? `<p><strong>Dificil:</strong> ${escapeHtml(entry.hard)}</p>` : ""}
    </article>
  `;
}

function renderLove() {
  return `
    ${sectionHead("Mensajes para abrir cuando haga falta", "Una parte mas tuya: cartas cortas para dias puntuales, editables y offline.")}
    <form data-form="message" class="form-panel">
      <div class="form-grid">
        <label class="field">Titulo
          <input name="title" placeholder="Abrir cuando..." required />
        </label>
        <label class="field">Firma
          <input name="signature" value="${escapeAttr(state.profile.signature)}" />
        </label>
      </div>
      <label class="field">Mensaje
        <textarea name="body" placeholder="Escribi algo que le quieras dejar a mano" required></textarea>
      </label>
      <button class="button" type="submit">♡ Agregar mensaje</button>
    </form>
    <section class="grid two">
      ${state.messages.map(renderMessage).join("")}
    </section>
  `;
}

function renderMessage(message) {
  const body = `${message.body}\n\n-${state.profile.signature || "Santi"}`;
  return `
    <article class="card entry message-card ${message.opened ? "" : "is-closed"}">
      <div class="row">
        <span class="pill">${message.opened ? "Abierto" : "Cerrado"}</span>
        <button class="icon-button danger" data-delete-message="${message.id}" aria-label="Borrar mensaje" title="Borrar">×</button>
      </div>
      <h3>${escapeHtml(message.title)}</h3>
      <p>${escapeHtml(body)}</p>
      <button class="button secondary" data-toggle-message="${message.id}">${message.opened ? "Cerrar" : "Abrir"}</button>
    </article>
  `;
}

function renderContacts() {
  return `
    ${sectionHead("Contactos de emergencia", "Telefonos y datos clave para llamar o mandar WhatsApp rapido.")}
    <form data-form="contact" class="form-panel">
      <div class="form-grid">
        <label class="field">Nombre
          <input name="name" placeholder="Coordinadora, hospedaje, familia..." required />
        </label>
        <label class="field">Rol
          <input name="role" placeholder="Guardia, referente, casa" />
        </label>
        <label class="field">Telefono
          <input name="phone" inputmode="tel" placeholder="+54..." />
        </label>
        <label class="field">Notas
          <input name="notes" placeholder="Direccion, horarios, aclaraciones" />
        </label>
      </div>
      <button class="button" type="submit">＋ Agregar contacto</button>
    </form>
    <section class="grid two">
      ${state.contacts.map(renderContact).join("") || emptyState("Sin contactos", "Agrega al menos un telefono importante.")}
    </section>
  `;
}

function renderContact(contactEntry) {
  const phone = cleanPhone(contactEntry.phone);
  return `
    <article class="card entry">
      <div class="row">
        <span class="pill">${escapeHtml(contactEntry.role || "Contacto")}</span>
        <button class="icon-button danger" data-delete-contact="${contactEntry.id}" aria-label="Borrar contacto" title="Borrar">×</button>
      </div>
      <h3>${escapeHtml(contactEntry.name)}</h3>
      <p>${escapeHtml(contactEntry.phone || "Sin telefono cargado")}${contactEntry.notes ? `<br>${escapeHtml(contactEntry.notes)}` : ""}</p>
      <div class="contact-actions">
        <a class="button secondary" ${phone ? `href="tel:${phone}"` : "aria-disabled=\"true\""}>☎ Llamar</a>
        <a class="button secondary" ${phone ? `href="https://wa.me/${phone.replace("+", "")}" target="_blank" rel="noreferrer"` : "aria-disabled=\"true\""}>↗ WhatsApp</a>
      </div>
    </article>
  `;
}

function renderAgenda() {
  const entries = [...state.agenda].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  return `
    ${sectionHead("Agenda de rotacion", "Fechas, guardias, practicas, viajes y recordatorios personales.")}
    <form data-form="agenda" class="form-panel">
      <div class="form-grid">
        <label class="field">Fecha
          <input name="date" type="date" required />
        </label>
        <label class="field">Hora
          <input name="time" type="time" />
        </label>
        <label class="field">Titulo
          <input name="title" placeholder="Guardia, viaje, entrega..." required />
        </label>
        <label class="field">Lugar
          <input name="place" placeholder="Hospital, terminal, hospedaje" />
        </label>
        <label class="field">Tipo
          <select name="type">
            <option>Rotacion</option>
            <option>Guardia</option>
            <option>Viaje</option>
            <option>Personal</option>
          </select>
        </label>
      </div>
      <label class="field">Notas
        <textarea name="notes" placeholder="Que llevar, con quien hablar, detalle importante"></textarea>
      </label>
      <button class="button" type="submit">＋ Agregar evento</button>
    </form>
    <section class="grid">
      ${entries.map(renderAgendaItem).join("") || emptyState("Sin agenda", "Carga el viaje, la primera practica o una guardia.")}
    </section>
  `;
}

function renderAgendaItem(entry) {
  return `
    <article class="card entry agenda-item ${entry.done ? "done" : ""}">
      <div class="row">
        <span class="pill">${escapeHtml(entry.type || "Evento")}</span>
        <div class="item-actions">
          <button class="icon-button" data-toggle-agenda="${entry.id}" aria-label="Marcar evento" title="Marcar">${entry.done ? "↺" : "✓"}</button>
          <button class="icon-button danger" data-delete-agenda="${entry.id}" aria-label="Borrar evento" title="Borrar">×</button>
        </div>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${formatDate(entry.date)} ${entry.time ? `- ${escapeHtml(entry.time)}` : ""}${entry.place ? `<br>${escapeHtml(entry.place)}` : ""}${entry.notes ? `<br>${escapeHtml(entry.notes)}` : ""}</p>
    </article>
  `;
}

function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;

  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());

  if (form.dataset.form === "checklist") {
    state.checklist.push(item(uid(), data.category.trim(), data.text.trim()));
  }

  if (form.dataset.form === "diary") {
    state.diary.push({
      id: uid(),
      date: data.date,
      title: data.title.trim(),
      learned: data.learned.trim(),
      good: data.good.trim(),
      hard: data.hard.trim()
    });
  }

  if (form.dataset.form === "message") {
    state.profile.signature = data.signature.trim() || state.profile.signature;
    state.messages.unshift({
      id: uid(),
      title: data.title.trim(),
      body: data.body.trim(),
      opened: false
    });
  }

  if (form.dataset.form === "contact") {
    state.contacts.push(contact(data.name.trim(), data.role.trim(), data.phone.trim(), data.notes.trim()));
  }

  if (form.dataset.form === "agenda") {
    state.agenda.push(agenda(data.date, data.time, data.title.trim(), data.place.trim(), data.type, data.notes.trim()));
  }

  if (form.dataset.form === "plan") {
    addPlanToCloud(data, form);
    return;
  }

  saveState();
  form.reset();
  render();
}

function handleClick(event) {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.dataset.login !== undefined) {
    startLogin();
    return;
  }

  if (target.dataset.logout !== undefined) {
    logout();
    return;
  }

  if (target.dataset.syncNow !== undefined) {
    refreshFromCloud();
    return;
  }

  if (target.dataset.enableNotifications !== undefined) {
    enableNotifications();
    return;
  }

  if (target.dataset.saveNotification !== undefined) {
    saveNotificationSettings();
    return;
  }

  if (target.dataset.testNotification !== undefined) {
    sendTestNotification();
    return;
  }

  if (target.dataset.go) {
    activeTab = target.dataset.go;
    navButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.tab === activeTab));
    render();
  }

  if (target.dataset.filter) {
    checklistFilter = target.dataset.filter;
    render();
  }

  if (target.dataset.planFilter) {
    planFilter = target.dataset.planFilter;
    render();
    return;
  }

  if (target.dataset.deletePlan) {
    deletePlanFromCloud(target.dataset.deletePlan);
    return;
  }

  if (target.dataset.togglePlan) {
    togglePlanInCloud(target.dataset.togglePlan);
    return;
  }

  removeByDataset(target, "deleteCheck", "checklist");
  removeByDataset(target, "deleteDiary", "diary");
  removeByDataset(target, "deleteMessage", "messages");
  removeByDataset(target, "deleteContact", "contacts");
  removeByDataset(target, "deleteAgenda", "agenda");

  if (target.dataset.toggleMessage) {
    const message = state.messages.find((entry) => entry.id === target.dataset.toggleMessage);
    if (message) message.opened = !message.opened;
    saveState();
    render();
  }

  if (target.dataset.toggleAgenda) {
    const agendaEntry = state.agenda.find((entry) => entry.id === target.dataset.toggleAgenda);
    if (agendaEntry) agendaEntry.done = !agendaEntry.done;
    saveState();
    render();
  }

}

function handleChange(event) {
  const checkbox = event.target.closest("[data-check-id]");
  if (!checkbox) return;

  const entry = state.checklist.find((itemEntry) => itemEntry.id === checkbox.dataset.checkId);
  if (entry) entry.done = checkbox.checked;
  saveState();
  render();
}

function removeByDataset(target, datasetKey, collectionKey) {
  const id = target.dataset[datasetKey];
  if (!id) return;

  state[collectionKey] = state[collectionKey].filter((entry) => entry.id !== id);
  saveState();
  render();
}

function sectionHead(title, text) {
  return `
    <section class="section-head">
      <div>
        <h2>${title}</h2>
        <p>${text}</p>
      </div>
    </section>
  `;
}

function stat(value, label, percent) {
  return `
    <article class="stat">
      <strong>${value}</strong>
      <span>${label}</span>
      <div class="progress" aria-hidden="true"><span style="--value: ${percent}%"></span></div>
    </article>
  `;
}

function emptyState(title, text) {
  return `<div class="empty-state"><strong>${title}</strong><p>${text}</p></div>`;
}

function checklistProgress(items) {
  const total = items.length;
  const done = items.filter((entry) => entry.done).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { total, done, percent };
}

function daysLeft() {
  const start = new Date(`${state.profile.startDate}T00:00:00`);
  const end = new Date(`${state.profile.endDate}T00:00:00`);
  const today = new Date();
  const from = today < start ? start : today;
  const diff = Math.ceil((end - from) / 86400000);
  return Math.max(diff, 0);
}

function rotationProgress() {
  const start = new Date(`${state.profile.startDate}T00:00:00`);
  const end = new Date(`${state.profile.endDate}T00:00:00`);
  const today = new Date();
  const total = Math.max(end - start, 1);
  const elapsed = Math.min(Math.max(today - start, 0), total);
  return Math.round((elapsed / total) * 100);
}

function messageProgress() {
  if (!state.messages.length) return 0;
  const opened = state.messages.filter((message) => message.opened).length;
  return Math.round((opened / state.messages.length) * 100);
}

function getNextEvent() {
  const today = todayISO();
  return [...state.agenda]
    .filter((entry) => !entry.done && entry.date >= today)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(new Date(`${value}T00:00:00`));
}

function cleanPhone(value = "") {
  return value.replace(/[^\d+]/g, "");
}

function planAuthor(value = "") {
  if (!value || value === "local") return "Agregado desde este dispositivo";
  if (value.toLowerCase() === cloudStatus.email.toLowerCase()) return "Agregado por vos";
  return `Agregado por ${value.split("@")[0]}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

async function initCloudSync() {
  if (!cloudStatus.enabled || !isAwsConfigReady()) return;

  try {
    await finishLoginIfNeeded();
    const session = getSession();
    if (!session) return;

    cloudStatus.signedIn = true;
    cloudStatus.email = session.email || "";
    await syncFromCloud();
    await loadPlansFromCloud();
    await loadNotificationSettings();
    await loadNotificationInbox();
  } catch (error) {
    cloudStatus.error = error.message || "No se pudo iniciar la sincronizacion.";
    render();
  }
}

async function refreshFromCloud() {
  await syncFromCloud();
  await loadPlansFromCloud();
  await loadNotificationInbox();
}

async function loadPlansFromCloud() {
  const token = await getValidIdToken();
  if (!token) return;

  try {
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/plans`, {
      headers: { authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudieron leer los planes compartidos.");
    state.plans = Array.isArray(data.plans) ? data.plans : [];
    savePlansLocally();
  } catch (error) {
    cloudStatus.error = error.message || "No se pudieron leer los planes compartidos.";
  }
  render();
}

async function addPlanToCloud(data, form) {
  const token = await getValidIdToken();
  if (!token) {
    cloudStatus.error = "Inicia sesion para agregar un plan compartido.";
    render();
    return;
  }

  cloudStatus.error = "";
  try {
    const draft = plan(data.title.trim(), data.category, data.date, cloudStatus.email);
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/plans`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ plan: draft })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "No se pudo guardar el plan.");
    state.plans.unshift(result.plan);
    savePlansLocally();
    form.reset();
  } catch (error) {
    cloudStatus.error = error.message || "No se pudo guardar el plan.";
  }
  render();
}

async function togglePlanInCloud(planId) {
  const entry = state.plans.find((item) => item.id === planId);
  if (!entry) return;

  const token = await getValidIdToken();
  if (!token) {
    cloudStatus.error = "Inicia sesion para actualizar el plan compartido.";
    render();
    return;
  }

  cloudStatus.error = "";
  try {
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/plans/${encodeURIComponent(planId)}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ done: !entry.done })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "No se pudo actualizar el plan.");
    state.plans = state.plans.map((item) => item.id === planId ? result.plan : item);
    savePlansLocally();
  } catch (error) {
    cloudStatus.error = error.message || "No se pudo actualizar el plan.";
  }
  render();
}

async function deletePlanFromCloud(planId) {
  const token = await getValidIdToken();
  if (!token) {
    cloudStatus.error = "Inicia sesion para borrar el plan compartido.";
    render();
    return;
  }

  cloudStatus.error = "";
  try {
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/plans/${encodeURIComponent(planId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "No se pudo borrar el plan.");
    state.plans = state.plans.filter((item) => item.id !== planId);
    savePlansLocally();
  } catch (error) {
    cloudStatus.error = error.message || "No se pudo borrar el plan.";
  }
  render();
}

function savePlansLocally() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function loadNotificationInbox() {
  const token = await getValidIdToken();
  if (!token) return;

  try {
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/notification-inbox`, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error("No se pudo leer el ultimo mensaje recibido.");
    const data = await response.json();
    notificationStatus.receivedMessage = data.message || "";
    notificationStatus.receivedAt = data.sentAt || "";
  } catch (error) {
    notificationStatus.error = error.message || "No se pudo cargar el mensaje recibido.";
  }
  render();
}

async function loadNotificationSettings() {
  const token = await getValidIdToken();
  if (!token) return;

  try {
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/notification-settings`, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error("No se pudo leer la configuracion de notificaciones.");
    const data = await response.json();
    notificationStatus.message = data.message || notificationStatus.message;
    notificationStatus.time = data.time || notificationStatus.time;
    if (notificationStatus.supported) {
      const registration = await navigator.serviceWorker.ready;
      notificationStatus.subscribed = Boolean(await registration.pushManager.getSubscription());
    }
  } catch (error) {
    notificationStatus.error = error.message || "No se pudo cargar el mensaje diario.";
  }
  render();
}

async function saveNotificationSettings() {
  const input = document.querySelector("[data-notification-message]");
  const timeInput = document.querySelector("[data-notification-time]");
  const message = input?.value.trim() || "";
  const time = timeInput?.value || "";
  if (!message) {
    notificationStatus.error = "Escribí un mensaje antes de guardarlo.";
    render();
    return false;
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    notificationStatus.error = "Elegí una hora válida.";
    render();
    return false;
  }

  let saved = false;
  notificationStatus.loading = true;
  notificationStatus.error = "";
  notificationStatus.actionMessage = "";
  render();
  try {
    const token = await getValidIdToken();
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/notification-settings`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message, time, enabled: true })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudo guardar el mensaje diario.");
    notificationStatus.message = message;
    notificationStatus.time = time;
    notificationStatus.actionMessage = "Mensaje y horario guardados.";
    saved = true;
  } catch (error) {
    notificationStatus.error = error.message || "No se pudo guardar el mensaje diario.";
  } finally {
    notificationStatus.loading = false;
    render();
  }
  return saved;
}

async function sendTestNotification() {
  const saved = await saveNotificationSettings();
  if (!saved) return;

  notificationStatus.loading = true;
  notificationStatus.error = "";
  notificationStatus.actionMessage = "";
  render();
  try {
    const token = await getValidIdToken();
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/notification-test`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudo enviar la prueba.");
    const recipients = Number(data.recipients || 0);
    notificationStatus.actionMessage = `Prueba enviada a ${recipients} ${recipients === 1 ? "persona" : "personas"}.`;
  } catch (error) {
    notificationStatus.error = error.message || "No se pudo enviar la prueba.";
  } finally {
    notificationStatus.loading = false;
    render();
  }
}

async function enableNotifications() {
  if (!notificationStatus.supported || !awsConfig.vapidPublicKey) return;
  notificationStatus.loading = true;
  notificationStatus.error = "";
  notificationStatus.actionMessage = "";
  render();

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("El navegador no autorizó las notificaciones.");

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(awsConfig.vapidPublicKey)
      });
    }

    const token = await getValidIdToken();
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/push-subscription`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudo registrar este navegador en AWS.");
    notificationStatus.subscribed = true;
    notificationStatus.actionMessage = "Este dispositivo quedó registrado para recibir notificaciones.";
  } catch (error) {
    notificationStatus.error = error.message || "No se pudieron activar las notificaciones.";
  } finally {
    notificationStatus.loading = false;
    render();
  }
}

function isAwsConfigReady() {
  return Boolean(
    awsConfig.cognitoDomain &&
      awsConfig.userPoolClientId &&
      awsConfig.apiBaseUrl &&
      awsConfig.redirectUri
  );
}

async function startLogin() {
  if (!isAwsConfigReady()) {
    cloudStatus.error = "Falta completar aws-config.js con los outputs de AWS.";
    render();
    return;
  }

  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = await sha256Base64Url(verifier);
  const loginState = uid();
  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({ verifier, state: loginState }));

  const params = new URLSearchParams({
    client_id: awsConfig.userPoolClientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: getRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state: loginState
  });

  window.location.assign(`${trimSlash(awsConfig.cognitoDomain)}/oauth2/authorize?${params}`);
}

async function finishLoginIfNeeded() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!code) return;

  const pkce = JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) || "null");
  sessionStorage.removeItem(PKCE_STORAGE_KEY);
  clearOAuthParams(url);

  if (!pkce?.verifier || pkce.state !== returnedState) {
    throw new Error("La respuesta de login no pudo validarse.");
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: awsConfig.userPoolClientId,
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: pkce.verifier
  });

  const tokens = await tokenRequest(params);
  saveSession(tokens);
}

function clearOAuthParams(url) {
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

async function tokenRequest(params) {
  const response = await fetch(`${trimSlash(awsConfig.cognitoDomain)}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error("Cognito no devolvio una sesion valida.");
  }

  return response.json();
}

function saveSession(tokens) {
  const claims = parseJwt(tokens.id_token);
  const session = {
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token || getSession()?.refreshToken || "",
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    email: claims.email || ""
  };

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  cloudStatus.signedIn = true;
  cloudStatus.email = session.email;
}

function getSession() {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    return session?.idToken ? session : null;
  } catch {
    return null;
  }
}

async function getValidIdToken() {
  const session = getSession();
  if (!session) return "";

  if (Date.now() < session.expiresAt - 60000) {
    return session.idToken;
  }

  if (!session.refreshToken) {
    logout(false);
    return "";
  }

  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: awsConfig.userPoolClientId,
      refresh_token: session.refreshToken
    })
  );
  saveSession(tokens);
  return getSession()?.idToken || "";
}

async function syncFromCloud() {
  if (!cloudStatus.enabled || !getSession()) return;

  const localPlans = Array.isArray(state.plans) ? state.plans : [];
  cloudStatus.syncing = true;
  cloudStatus.error = "";
  render();

  try {
    const token = await getValidIdToken();
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/state`, {
      headers: { authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error("No se pudo leer la nube AWS.");

    const data = await response.json();
    if (data.state) {
      state = normalizeState(data.state);
      state.plans = localPlans;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      await saveStateToCloud();
    }

    cloudStatus.lastSync = data.updatedAt || new Date().toISOString();
    cloudStatus.updatedBy = data.updatedBy || "";
  } catch (error) {
    cloudStatus.error = error.message || "Fallo la sincronizacion.";
  } finally {
    cloudStatus.syncing = false;
    render();
  }
}

function queueCloudSave() {
  if (!cloudStatus.enabled || !getSession()) return;

  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveStateToCloud();
  }, 700);
}

async function saveStateToCloud() {
  if (!cloudStatus.enabled || !getSession()) return;

  cloudStatus.syncing = true;
  cloudStatus.error = "";
  render();

  try {
    const token = await getValidIdToken();
    const { plans, ...sharedState } = state;
    const response = await fetch(`${trimSlash(awsConfig.apiBaseUrl)}/state`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ state: sharedState })
    });

    if (!response.ok) throw new Error("No se pudo guardar en AWS.");

    const data = await response.json();
    cloudStatus.lastSync = data.updatedAt || new Date().toISOString();
    cloudStatus.updatedBy = data.updatedBy || cloudStatus.email;
  } catch (error) {
    cloudStatus.error = error.message || "Fallo el guardado en AWS.";
  } finally {
    cloudStatus.syncing = false;
    render();
  }
}

function logout(redirect = true) {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  cloudStatus.signedIn = false;
  cloudStatus.email = "";
  cloudStatus.lastSync = "";
  cloudStatus.updatedBy = "";
  cloudStatus.error = "";

  if (redirect && isAwsConfigReady()) {
    const params = new URLSearchParams({
      client_id: awsConfig.userPoolClientId,
      logout_uri: getLogoutUri()
    });
    window.location.assign(`${trimSlash(awsConfig.cognitoDomain)}/logout?${params}`);
    return;
  }

  render();
}

function parseJwt(token = "") {
  const payload = token.split(".")[1];
  if (!payload) return {};
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

function base64UrlToBytes(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getRedirectUri() {
  return awsConfig.redirectUri || `${window.location.origin}${window.location.pathname}`;
}

function getLogoutUri() {
  return awsConfig.logoutUri || getRedirectUri();
}

function trimSlash(value = "") {
  return value.replace(/\/$/, "");
}
