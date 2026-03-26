import type { CRMState, Client, Opportunity, OpportunityStage } from "./types";

const STORAGE_KEY = "kcr-crm-state";

const stageMeta: Record<
  OpportunityStage,
  { label: string; tone: string; probability: number }
> = {
  lead: { label: "Lead", tone: "slate", probability: 15 },
  qualified: { label: "Calificada", tone: "blue", probability: 35 },
  proposal: { label: "Propuesta", tone: "amber", probability: 55 },
  negotiation: { label: "Negociacion", tone: "violet", probability: 75 },
  won: { label: "Ganada", tone: "green", probability: 100 },
  lost: { label: "Perdida", tone: "red", probability: 0 }
};

const initialState: CRMState = loadState();

export function createApp(root: HTMLDivElement): void {
  let state = initialState;

  const render = () => {
    root.innerHTML = buildLayout(state);

    const clientForm = root.querySelector<HTMLFormElement>("#client-form");
    const opportunityForm =
      root.querySelector<HTMLFormElement>("#opportunity-form");
    const searchInput = root.querySelector<HTMLInputElement>("#search");
    const stageFilter = root.querySelector<HTMLSelectElement>("#stage-filter");

    clientForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(clientForm);

      const client: Client = {
        id: crypto.randomUUID(),
        name: readString(formData, "name"),
        company: readString(formData, "company"),
        email: readString(formData, "email"),
        phone: readString(formData, "phone"),
        position: readString(formData, "position"),
        source: readString(formData, "source"),
        notes: readString(formData, "notes"),
        createdAt: new Date().toISOString()
      };

      state = {
        ...state,
        clients: [client, ...state.clients].sort(sortByDateDesc)
      };
      persistState(state);
      render();
    });

    opportunityForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(opportunityForm);

      const opportunity: Opportunity = {
        id: crypto.randomUUID(),
        clientId: readString(formData, "clientId"),
        title: readString(formData, "title"),
        stage: readString(formData, "stage") as OpportunityStage,
        amount: Number(readString(formData, "amount")),
        expectedCloseDate: readString(formData, "expectedCloseDate"),
        owner: readString(formData, "owner"),
        notes: readString(formData, "notes"),
        createdAt: new Date().toISOString()
      };

      state = {
        ...state,
        opportunities: [opportunity, ...state.opportunities].sort(sortByDateDesc)
      };
      persistState(state);
      render();
    });

    searchInput?.addEventListener("input", () => {
      const nextSearch = searchInput.value.trim().toLowerCase();
      const nextStage = stageFilter?.value ?? "all";
      paintOpportunityList(root, state, nextSearch, nextStage);
      paintClientList(root, state, nextSearch);
      bindDeleteActions(root, state, renderState);
    });

    stageFilter?.addEventListener("change", () => {
      const nextSearch = searchInput?.value.trim().toLowerCase() ?? "";
      const nextStage = stageFilter.value;
      paintOpportunityList(root, state, nextSearch, nextStage);
      bindDeleteActions(root, state, renderState);
    });

    const renderState = (nextState: CRMState) => {
      state = nextState;
      persistState(state);
      render();
    };

    bindDeleteActions(root, state, renderState);
  };

  render();
}

function bindDeleteActions(
  root: HTMLDivElement,
  state: CRMState,
  onStateChange: (state: CRMState) => void
): void {
  root.querySelectorAll<HTMLButtonElement>("[data-delete-client]").forEach((button) => {
    button.addEventListener("click", () => {
      const clientId = button.dataset.deleteClient;
      if (!clientId) {
        return;
      }

      onStateChange({
        clients: state.clients.filter((client) => client.id !== clientId),
        opportunities: state.opportunities.filter(
          (opportunity) => opportunity.clientId !== clientId
        )
      });
    });
  });

  root
    .querySelectorAll<HTMLButtonElement>("[data-delete-opportunity]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const opportunityId = button.dataset.deleteOpportunity;
        if (!opportunityId) {
          return;
        }

        onStateChange({
          ...state,
          opportunities: state.opportunities.filter(
            (opportunity) => opportunity.id !== opportunityId
          )
        });
      });
    });
}

function buildLayout(state: CRMState): string {
  const dashboard = buildDashboard(state);
  const clientOptions = state.clients
    .map(
      (client) =>
        `<option value="${client.id}">${escapeHtml(client.name)} - ${escapeHtml(
          client.company
        )}</option>`
    )
    .join("");

  return `
    <main class="shell">
      <section class="hero">
        <div>
          <span class="eyebrow">CRM interno</span>
          <h1>Seguimiento comercial simple, claro y listo para crecer.</h1>
          <p>
            Gestiona clientes, registra oportunidades y visualiza el pipeline de ventas
            en una sola pantalla.
          </p>
        </div>
        <div class="hero-card">
          <p class="hero-card__label">Pipeline activo</p>
          <strong>${formatCurrency(totalOpenPipeline(state))}</strong>
          <span>${countOpenOpportunities(state)} oportunidades abiertas</span>
        </div>
      </section>

      <section class="dashboard-grid">
        ${dashboard}
      </section>

      <section class="toolbar card">
        <div>
          <label for="search">Buscar</label>
          <input id="search" type="search" placeholder="Cliente, empresa u oportunidad" />
        </div>
        <div>
          <label for="stage-filter">Filtrar por stage</label>
          <select id="stage-filter">
            <option value="all">Todos</option>
            ${Object.entries(stageMeta)
              .map(
                ([value, meta]) =>
                  `<option value="${value}">${meta.label}</option>`
              )
              .join("")}
          </select>
        </div>
      </section>

      <section class="content-grid">
        <article class="card form-card">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Objeto 1</span>
              <h2>Clientes</h2>
            </div>
            <p>Datos de contacto y contexto comercial.</p>
          </div>

          <form id="client-form" class="form-grid">
            <label>
              Nombre
              <input name="name" type="text" placeholder="Ana Perez" required />
            </label>
            <label>
              Empresa
              <input name="company" type="text" placeholder="Acme SA" required />
            </label>
            <label>
              Email
              <input name="email" type="email" placeholder="ana@empresa.com" required />
            </label>
            <label>
              Telefono
              <input name="phone" type="tel" placeholder="+54 11 5555 5555" />
            </label>
            <label>
              Cargo
              <input name="position" type="text" placeholder="Gerencia Comercial" />
            </label>
            <label>
              Origen
              <input name="source" type="text" placeholder="Referido, web, evento..." />
            </label>
            <label class="full">
              Notas
              <textarea name="notes" rows="3" placeholder="Contexto, dolores, proxima accion..."></textarea>
            </label>
            <button type="submit">Guardar cliente</button>
          </form>
        </article>

        <article class="card form-card">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Objeto 2</span>
              <h2>Oportunidades</h2>
            </div>
            <p>Vinculadas a clientes, con monto, owner y stage.</p>
          </div>

          <form id="opportunity-form" class="form-grid">
            <label class="full">
              Cliente
              <select name="clientId" required ${state.clients.length === 0 ? "disabled" : ""}>
                ${
                  state.clients.length === 0
                    ? '<option value="">Primero crea un cliente</option>'
                    : `<option value="">Selecciona un cliente</option>${clientOptions}`
                }
              </select>
            </label>
            <label>
              Nombre de la oportunidad
              <input name="title" type="text" placeholder="Implementacion CRM 2026" required />
            </label>
            <label>
              Stage
              <select name="stage" required>
                ${Object.entries(stageMeta)
                  .map(
                    ([value, meta]) =>
                      `<option value="${value}">${meta.label}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label>
              Monto estimado
              <input name="amount" type="number" min="0" step="0.01" placeholder="2500" required />
            </label>
            <label>
              Fecha estimada de cierre
              <input name="expectedCloseDate" type="date" required />
            </label>
            <label>
              Owner
              <input name="owner" type="text" placeholder="Equipo ventas" required />
            </label>
            <label class="full">
              Notas
              <textarea name="notes" rows="3" placeholder="Siguiente paso, competencia, decisor..."></textarea>
            </label>
            <button type="submit" ${state.clients.length === 0 ? "disabled" : ""}>
              Guardar oportunidad
            </button>
          </form>
        </article>
      </section>

      <section class="lists-grid">
        <article class="card">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Base</span>
              <h2>Clientes cargados</h2>
            </div>
          </div>
          <div id="client-list">
            ${renderClientList(state.clients, state, "")}
          </div>
        </article>

        <article class="card">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Pipeline</span>
              <h2>Oportunidades</h2>
            </div>
          </div>
          <div id="opportunity-list">
            ${renderOpportunityList(state.opportunities, state, "", "all")}
          </div>
        </article>
      </section>
    </main>
  `;
}

function buildDashboard(state: CRMState): string {
  const cards = Object.entries(stageMeta).map(([stage, meta]) => {
    const opportunities = state.opportunities.filter(
      (item) => item.stage === stage
    );
    const total = opportunities.reduce((sum, item) => sum + item.amount, 0);

    return `
      <article class="card metric">
        <span class="metric__tone metric__tone--${meta.tone}"></span>
        <p>${meta.label}</p>
        <strong>${opportunities.length}</strong>
        <span>${formatCurrency(total)}</span>
      </article>
    `;
  });

  return cards.join("");
}

function paintOpportunityList(
  root: HTMLDivElement,
  state: CRMState,
  search: string,
  stage: string
): void {
  const container = root.querySelector<HTMLDivElement>("#opportunity-list");
  if (!container) {
    return;
  }

  container.innerHTML = renderOpportunityList(
    state.opportunities,
    state,
    search,
    stage
  );
}

function paintClientList(
  root: HTMLDivElement,
  state: CRMState,
  search: string
): void {
  const container = root.querySelector<HTMLDivElement>("#client-list");
  if (!container) {
    return;
  }

  container.innerHTML = renderClientList(state.clients, state, search);
}

function renderClientList(
  clients: Client[],
  state: CRMState,
  search: string
): string {
  const filteredClients = clients.filter((client) => {
    if (!search) {
      return true;
    }

    return [client.name, client.company, client.email, client.phone]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });

  if (filteredClients.length === 0) {
    return `<p class="empty-state">No hay clientes para mostrar con ese filtro.</p>`;
  }

  return filteredClients
    .map((client) => {
      const relatedOpportunities = state.opportunities.filter(
        (opportunity) => opportunity.clientId === client.id
      );

      return `
        <article class="list-item">
          <div class="list-item__header">
            <div>
              <strong>${escapeHtml(client.name)}</strong>
              <p>${escapeHtml(client.company)} · ${escapeHtml(client.position || "Sin cargo")}</p>
            </div>
            <button class="ghost-button" data-delete-client="${client.id}">Eliminar</button>
          </div>
          <div class="list-item__meta">
            <span>${escapeHtml(client.email)}</span>
            <span>${escapeHtml(client.phone || "Sin telefono")}</span>
            <span>${relatedOpportunities.length} oportunidades</span>
          </div>
          <p>${escapeHtml(client.notes || "Sin notas cargadas.")}</p>
        </article>
      `;
    })
    .join("");
}

function renderOpportunityList(
  opportunities: Opportunity[],
  state: CRMState,
  search: string,
  stage: string
): string {
  const filteredOpportunities = opportunities.filter((opportunity) => {
    const client = state.clients.find((item) => item.id === opportunity.clientId);
    const matchesSearch = !search
      ? true
      : [opportunity.title, client?.name ?? "", client?.company ?? "", opportunity.owner]
          .join(" ")
          .toLowerCase()
          .includes(search);
    const matchesStage = stage === "all" ? true : opportunity.stage === stage;

    return matchesSearch && matchesStage;
  });

  if (filteredOpportunities.length === 0) {
    return `<p class="empty-state">No hay oportunidades para mostrar con ese filtro.</p>`;
  }

  return filteredOpportunities
    .map((opportunity) => {
      const client = state.clients.find((item) => item.id === opportunity.clientId);
      const meta = stageMeta[opportunity.stage];

      return `
        <article class="list-item">
          <div class="list-item__header">
            <div>
              <strong>${escapeHtml(opportunity.title)}</strong>
              <p>${escapeHtml(client?.name ?? "Cliente eliminado")} · ${escapeHtml(
                client?.company ?? "Sin empresa"
              )}</p>
            </div>
            <button class="ghost-button" data-delete-opportunity="${opportunity.id}">Eliminar</button>
          </div>
          <div class="list-item__meta">
            <span class="badge badge--${meta.tone}">${meta.label}</span>
            <span>${formatCurrency(opportunity.amount)}</span>
            <span>Cierre: ${formatDate(opportunity.expectedCloseDate)}</span>
            <span>Prob.: ${meta.probability}%</span>
          </div>
          <p>${escapeHtml(opportunity.notes || "Sin notas cargadas.")}</p>
        </article>
      `;
    })
    .join("");
}

function loadState(): CRMState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return buildSeedState();
  }

  try {
    return JSON.parse(raw) as CRMState;
  } catch {
    return buildSeedState();
  }
}

function persistState(state: CRMState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildSeedState(): CRMState {
  const clientAId = crypto.randomUUID();
  const clientBId = crypto.randomUUID();

  return {
    clients: [
      {
        id: clientAId,
        name: "Mariana Torres",
        company: "Logistica Atlas",
        email: "mariana@atlas.com",
        phone: "+54 11 4000 1234",
        position: "Gerente Comercial",
        source: "Referido",
        notes: "Busca ordenar el seguimiento de leads del equipo.",
        createdAt: "2026-03-01T10:00:00.000Z"
      },
      {
        id: clientBId,
        name: "Santiago Ruiz",
        company: "Industrias Norte",
        email: "sruiz@norte.com",
        phone: "+54 351 555 9898",
        position: "Director General",
        source: "LinkedIn",
        notes: "Interesado en tableros de pipeline y trazabilidad.",
        createdAt: "2026-03-12T14:30:00.000Z"
      }
    ],
    opportunities: [
      {
        id: crypto.randomUUID(),
        clientId: clientAId,
        title: "CRM para equipo de ventas",
        stage: "proposal",
        amount: 4800,
        expectedCloseDate: "2026-04-20",
        owner: "Carla",
        notes: "Enviar propuesta final con onboarding incluido.",
        createdAt: "2026-03-15T09:00:00.000Z"
      },
      {
        id: crypto.randomUUID(),
        clientId: clientBId,
        title: "Automatizacion de seguimiento",
        stage: "negotiation",
        amount: 9200,
        expectedCloseDate: "2026-04-10",
        owner: "Diego",
        notes: "Pendiente validacion del alcance tecnico.",
        createdAt: "2026-03-18T16:00:00.000Z"
      }
    ]
  };
}

function totalOpenPipeline(state: CRMState): number {
  return state.opportunities
    .filter((item) => item.stage !== "won" && item.stage !== "lost")
    .reduce((sum, item) => sum + item.amount, 0);
}

function countOpenOpportunities(state: CRMState): number {
  return state.opportunities.filter(
    (item) => item.stage !== "won" && item.stage !== "lost"
  ).length;
}

function sortByDateDesc<T extends { createdAt: string }>(a: T, b: T): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(value: string): string {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-AR").format(new Date(value));
}
