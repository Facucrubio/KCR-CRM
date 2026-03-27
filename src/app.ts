import { supabase } from "./lib/supabase";
import type { CRMState, Client, Opportunity, OpportunityStage } from "./types";

type ViewName =
  | "home"
  | "clients"
  | "clientDetail"
  | "opportunities"
  | "opportunityDetail";

interface AppView {
  name: ViewName;
  id?: string;
}

interface UIState {
  view: AppView;
  clientSearch: string;
  opportunitySearch: string;
  opportunityStageFilter: string;
  showNewClientForm: boolean;
  showNewOpportunityForm: boolean;
  isSaving: boolean;
  feedback: string;
  error: string;
}

interface ClientRow {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  position: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
}

interface OpportunityRow {
  id: string;
  client_id: string;
  title: string;
  stage: OpportunityStage;
  amount: number | string;
  expected_close_date: string | null;
  owner: string;
  notes: string | null;
  created_at: string;
}

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

export async function createApp(root: HTMLDivElement): Promise<void> {
  let state: CRMState = { clients: [], opportunities: [] };
  let ui: UIState = {
    view: { name: "home" },
    clientSearch: "",
    opportunitySearch: "",
    opportunityStageFilter: "all",
    showNewClientForm: false,
    showNewOpportunityForm: false,
    isSaving: false,
    feedback: "",
    error: ""
  };

  const setState = (nextState: CRMState) => {
    state = normalizeState(nextState);
    render();
  };

  const setUI = (nextUI: Partial<UIState>) => {
    ui = { ...ui, ...nextUI };
    render();
  };

  const navigate = (view: AppView) => {
    ui = {
      ...ui,
      view,
      showNewClientForm: false,
      showNewOpportunityForm: false,
      feedback: "",
      error: ""
    };
    render();
  };

  const render = () => {
    root.innerHTML = buildLayout(state, ui);
    bindNavigation(root, state, ui, setState, setUI, navigate);
  };

  root.innerHTML = buildLoadingState("Cargando datos desde Supabase...");

  try {
    state = await fetchState();
    render();
  } catch (error) {
    root.innerHTML = buildLoadingState(
      `No pudimos cargar Supabase. ${formatError(error)}`
    );
  }
}

async function fetchState(): Promise<CRMState> {
  const [clientsResult, opportunitiesResult] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase
      .from("opportunities")
      .select("*")
      .order("created_at", { ascending: false })
  ]);

  if (clientsResult.error) {
    throw clientsResult.error;
  }

  if (opportunitiesResult.error) {
    throw opportunitiesResult.error;
  }

  return normalizeState({
    clients: (clientsResult.data ?? []).map(mapClientRow),
    opportunities: (opportunitiesResult.data ?? []).map(mapOpportunityRow)
  });
}

async function withMutation(
  setUI: (state: Partial<UIState>) => void,
  task: () => Promise<void>
): Promise<void> {
  setUI({ isSaving: true, error: "", feedback: "" });
  try {
    await task();
    setUI({ isSaving: false, feedback: "Cambios guardados en Supabase." });
  } catch (error) {
    setUI({
      isSaving: false,
      error: formatError(error),
      feedback: ""
    });
  }
}

function buildLoadingState(message: string): string {
  return `
    <main class="shell">
      <section class="card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Supabase</span>
            <h2>Estado de conexion</h2>
          </div>
          <p>${escapeHtml(message)}</p>
        </div>
      </section>
    </main>
  `;
}

function mapClientRow(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone ?? "",
    position: row.position ?? "",
    source: row.source ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at
  };
}

function mapOpportunityRow(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    stage: row.stage,
    amount: Number(row.amount),
    expectedCloseDate: row.expected_close_date ?? "",
    owner: row.owner,
    notes: row.notes ?? "",
    createdAt: row.created_at
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function toNullable(value: string): string | null {
  return value || null;
}

function buildClientPayload(formData: FormData) {
  return {
    name: readString(formData, "name"),
    company: readString(formData, "company"),
    email: readString(formData, "email"),
    phone: toNullable(readString(formData, "phone")),
    position: toNullable(readString(formData, "position")),
    source: toNullable(readString(formData, "source")),
    notes: toNullable(readString(formData, "notes"))
  };
}

function buildOpportunityPayload(formData: FormData) {
  return {
    client_id: readString(formData, "clientId"),
    title: readString(formData, "title"),
    stage: readStage(formData, "stage"),
    amount: readNumber(formData, "amount"),
    expected_close_date: toNullable(readString(formData, "expectedCloseDate")),
    owner: readString(formData, "owner"),
    notes: toNullable(readString(formData, "notes"))
  };
}

function bindNavigation(
  root: HTMLDivElement,
  state: CRMState,
  ui: UIState,
  setState: (state: CRMState) => void,
  setUI: (state: Partial<UIState>) => void,
  navigate: (view: AppView) => void
): void {
  root.querySelectorAll<HTMLElement>("[data-view]").forEach((element) => {
    element.addEventListener("click", () => {
      const name = element.dataset.view as ViewName | undefined;
      if (name) {
        navigate({ name });
      }
    });
  });

  root.querySelectorAll<HTMLElement>("[data-open-client]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.openClient;
      if (id) {
        navigate({ name: "clientDetail", id });
      }
    });
  });

  root.querySelectorAll<HTMLElement>("[data-open-opportunity]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.openOpportunity;
      if (id) {
        navigate({ name: "opportunityDetail", id });
      }
    });
  });

  root.querySelector<HTMLElement>("[data-toggle-new-client]")?.addEventListener("click", () => {
    setUI({
      showNewClientForm: !ui.showNewClientForm,
      showNewOpportunityForm: false
    });
  });

  root
    .querySelector<HTMLElement>("[data-toggle-new-opportunity]")
    ?.addEventListener("click", () => {
      setUI({
        showNewOpportunityForm: !ui.showNewOpportunityForm,
        showNewClientForm: false
      });
    });

  root.querySelector<HTMLInputElement>("#client-search")?.addEventListener("input", (event) => {
    ui.clientSearch = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
    updateClientList(root, state, ui.clientSearch, navigate);
  });

  root
    .querySelector<HTMLInputElement>("#opportunity-search")
    ?.addEventListener("input", (event) => {
      ui.opportunitySearch = (event.currentTarget as HTMLInputElement).value
        .trim()
        .toLowerCase();
      updateOpportunityList(
        root,
        state,
        ui.opportunitySearch,
        ui.opportunityStageFilter,
        navigate
      );
    });

  root
    .querySelector<HTMLSelectElement>("#opportunity-stage-filter")
    ?.addEventListener("change", (event) => {
      ui.opportunityStageFilter = (event.currentTarget as HTMLSelectElement).value;
      updateOpportunityList(
        root,
        state,
        ui.opportunitySearch,
        ui.opportunityStageFilter,
        navigate
      );
    });

  bindCreateForms(root, state, ui, setState, setUI, navigate);
  bindDetailForms(root, state, ui, setState, setUI, navigate);
}

function bindCreateForms(
  root: HTMLDivElement,
  state: CRMState,
  ui: UIState,
  setState: (state: CRMState) => void,
  setUI: (state: Partial<UIState>) => void,
  navigate: (view: AppView) => void
): void {
  const clientForm = root.querySelector<HTMLFormElement>("#new-client-form");
  clientForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ui.isSaving) {
      return;
    }

    await withMutation(setUI, async () => {
      const { data, error } = await supabase
        .from("clients")
        .insert(buildClientPayload(new FormData(clientForm)))
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const client = mapClientRow(data as ClientRow);
      setState({ ...state, clients: [client, ...state.clients] });
      navigate({ name: "clientDetail", id: client.id });
    });
  });

  const opportunityForm = root.querySelector<HTMLFormElement>("#new-opportunity-form");
  opportunityForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ui.isSaving) {
      return;
    }

    await withMutation(setUI, async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .insert(buildOpportunityPayload(new FormData(opportunityForm)))
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const opportunity = mapOpportunityRow(data as OpportunityRow);
      setState({
        ...state,
        opportunities: [opportunity, ...state.opportunities]
      });
      navigate({ name: "opportunityDetail", id: opportunity.id });
    });
  });
}

function updateClientList(
  root: HTMLDivElement,
  state: CRMState,
  search: string,
  navigate: (view: AppView) => void
): void {
  const container = root.querySelector<HTMLElement>("[data-client-list]");
  if (!container) {
    return;
  }

  container.innerHTML = renderClientList(state, search);
  root.querySelectorAll<HTMLElement>("[data-open-client]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.openClient;
      if (id) {
        navigate({ name: "clientDetail", id });
      }
    });
  });
}

function updateOpportunityList(
  root: HTMLDivElement,
  state: CRMState,
  search: string,
  stage: string,
  navigate: (view: AppView) => void
): void {
  const container = root.querySelector<HTMLElement>("[data-opportunity-list]");
  if (!container) {
    return;
  }

  container.innerHTML = renderOpportunityList(state, search, stage);
  root.querySelectorAll<HTMLElement>("[data-open-opportunity]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.openOpportunity;
      if (id) {
        navigate({ name: "opportunityDetail", id });
      }
    });
  });
}

function bindDetailForms(
  root: HTMLDivElement,
  state: CRMState,
  ui: UIState,
  setState: (state: CRMState) => void,
  setUI: (state: Partial<UIState>) => void,
  navigate: (view: AppView) => void
): void {
  const clientDetailForm = root.querySelector<HTMLFormElement>("#client-detail-form");
  clientDetailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ui.isSaving) {
      return;
    }

    const formData = new FormData(clientDetailForm);
    const clientId = readString(formData, "id");
    const current = state.clients.find((item) => item.id === clientId);
    if (!current) {
      return;
    }

    await withMutation(setUI, async () => {
      const { data, error } = await supabase
        .from("clients")
        .update(buildClientPayload(formData))
        .eq("id", clientId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const next = mapClientRow(data as ClientRow);
      setState({
        ...state,
        clients: state.clients.map((item) => (item.id === clientId ? next : item))
      });
      navigate({ name: "clientDetail", id: clientId });
    });
  });
  
  root.querySelector<HTMLElement>("[data-delete-client]")?.addEventListener("click", async () => {
    if (ui.isSaving) {
      return;
    }

    const id = root.querySelector<HTMLElement>("[data-delete-client]")?.dataset.deleteClient;
    if (!id) {
      return;
    }

    await withMutation(setUI, async () => {
      const { error } = await supabase.from("clients").delete().eq("id", id);

      if (error) {
        throw error;
      }

      setState({
        clients: state.clients.filter((item) => item.id !== id),
        opportunities: state.opportunities.filter((item) => item.clientId !== id)
      });
      navigate({ name: "clients" });
    });
  });

  const opportunityDetailForm = root.querySelector<HTMLFormElement>(
    "#opportunity-detail-form"
  );
  opportunityDetailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ui.isSaving) {
      return;
    }

    const formData = new FormData(opportunityDetailForm);
    const opportunityId = readString(formData, "id");
    const current = state.opportunities.find((item) => item.id === opportunityId);
    if (!current) {
      return;
    }

    await withMutation(setUI, async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .update(buildOpportunityPayload(formData))
        .eq("id", opportunityId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const next = mapOpportunityRow(data as OpportunityRow);
      setState({
        ...state,
        opportunities: state.opportunities.map((item) =>
          item.id === opportunityId ? next : item
        )
      });
      navigate({ name: "opportunityDetail", id: opportunityId });
    });
  });

  root
    .querySelector<HTMLElement>("[data-delete-opportunity]")
    ?.addEventListener("click", async () => {
      if (ui.isSaving) {
        return;
      }

      const id = root.querySelector<HTMLElement>(
        "[data-delete-opportunity]"
      )?.dataset.deleteOpportunity;
      if (!id) {
        return;
      }

      await withMutation(setUI, async () => {
        const { error } = await supabase.from("opportunities").delete().eq("id", id);

        if (error) {
          throw error;
        }

        setState({
          ...state,
          opportunities: state.opportunities.filter((item) => item.id !== id)
        });
        navigate({ name: "opportunities" });
      });
    });
}

function buildLayout(state: CRMState, ui: UIState): string {
  return `
    <main class="shell">
      ${buildHero(state)}
      ${buildFeedback(ui)}
      ${buildTabs(ui.view)}
      ${buildCurrentView(state, ui)}
    </main>
  `;
}

function buildFeedback(ui: UIState): string {
  if (!ui.isSaving && !ui.feedback && !ui.error) {
    return "";
  }

  const title = ui.error ? "Error de sincronizacion" : ui.isSaving ? "Guardando" : "Supabase";
  const message = ui.error || ui.feedback || "Guardando cambios en Supabase...";

  return `
    <section class="card">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Estado</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p>${escapeHtml(message)}</p>
      </div>
    </section>
  `;
}

function buildHero(state: CRMState): string {
  return `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">CRM interno</span>
        <h1>Seguimiento comercial con foco, contexto y menos ruido visual.</h1>
        <p>
          La portada se concentra en lectura rapida del pipeline. La gestion vive
          en Clientes y Oportunidades.
        </p>
      </div>
      <div class="hero-card">
        <p class="hero-card__label">Pipeline activo</p>
        <strong>${formatCurrency(totalOpenPipeline(state))}</strong>
        <span>${countOpenOpportunities(state)} oportunidades abiertas</span>
      </div>
    </section>
  `;
}

function buildTabs(view: AppView): string {
  const isActive = (tab: "home" | "clients" | "opportunities") => {
    if (tab === "clients" && view.name === "clientDetail") {
      return "tab-button--active";
    }
    if (tab === "opportunities" && view.name === "opportunityDetail") {
      return "tab-button--active";
    }
    return view.name === tab ? "tab-button--active" : "";
  };

  return `
    <nav class="tabs card">
      <button type="button" class="tab-button ${isActive("home")}" data-view="home">Inicio</button>
      <button type="button" class="tab-button ${isActive("clients")}" data-view="clients">Clientes</button>
      <button type="button" class="tab-button ${isActive("opportunities")}" data-view="opportunities">Oportunidades</button>
    </nav>
  `;
}

function buildCurrentView(state: CRMState, ui: UIState): string {
  switch (ui.view.name) {
    case "clients":
      return buildClientsView(state, ui);
    case "clientDetail":
      return buildClientDetailView(state, ui.view.id ?? "");
    case "opportunities":
      return buildOpportunitiesView(state, ui);
    case "opportunityDetail":
      return buildOpportunityDetailView(state, ui.view.id ?? "");
    case "home":
    default:
      return buildHomeView(state);
  }
}

function buildHomeView(state: CRMState): string {
  return `
    <section class="dashboard-grid">
      ${buildMetrics(state)}
    </section>
    <section class="home-grid">
      <article class="card chart-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Inicio</span>
            <h2>Valor por stage</h2>
          </div>
          <p>Monto total acumulado por etapa del pipeline.</p>
        </div>
        ${buildBarChart(state)}
      </article>
      <article class="card summary-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Accesos rapidos</span>
            <h2>Ultimos registros</h2>
          </div>
          <p>Atajos a clientes y oportunidades recientes.</p>
        </div>
        <div class="summary-columns">
          <section class="summary-group">
            <h3>Clientes</h3>
            ${renderRecentClients(state)}
          </section>
          <section class="summary-group">
            <h3>Oportunidades</h3>
            ${renderRecentOpportunities(state)}
          </section>
        </div>
      </article>
    </section>
  `;
}

function buildClientsView(state: CRMState, ui: UIState): string {
  return `
    <section class="page-grid">
      <article class="card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Clientes</span>
            <h2>Base de contactos</h2>
          </div>
          <p>Abre un cliente para editarlo y ver su historial comercial.</p>
        </div>
        <div class="toolbar toolbar--single">
          <label>
            Buscar cliente
            <input
              id="client-search"
              type="search"
              placeholder="Nombre, empresa, email o telefono"
              value="${escapeHtmlAttribute(ui.clientSearch)}"
            />
          </label>
        </div>
        <div class="list-stack" data-client-list>
          ${renderClientList(state, ui.clientSearch)}
        </div>
      </article>
      <aside class="card side-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Accion</span>
            <h2>Nuevo cliente</h2>
          </div>
          <p>El alta queda fuera de la portada para mantener la vista principal limpia.</p>
        </div>
        <button type="button" data-toggle-new-client>
          ${ui.showNewClientForm ? "Cerrar formulario" : "Crear cliente"}
        </button>
        ${
          ui.showNewClientForm
            ? buildClientForm()
            : '<p class="empty-state side-copy">Abre el formulario solo cuando necesites dar de alta un cliente.</p>'
        }
      </aside>
    </section>
  `;
}

function buildClientDetailView(state: CRMState, clientId: string): string {
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) {
    return buildMissingCard("Cliente no encontrado", "El registro ya no existe.");
  }

  const related = state.opportunities.filter((item) => item.clientId === client.id);

  return `
    <section class="detail-grid">
      <article class="card detail-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Cliente</span>
            <h2>${escapeHtml(client.name)}</h2>
          </div>
          <p>Edita cualquier dato del cliente sin salir de su ficha.</p>
        </div>
        <form id="client-detail-form" class="form-grid">
          <input type="hidden" name="id" value="${client.id}" />
          <label>
            Nombre
            <input name="name" type="text" value="${escapeHtmlAttribute(client.name)}" required />
          </label>
          <label>
            Empresa
            <input name="company" type="text" value="${escapeHtmlAttribute(client.company)}" required />
          </label>
          <label>
            Email
            <input name="email" type="email" value="${escapeHtmlAttribute(client.email)}" required />
          </label>
          <label>
            Telefono
            <input name="phone" type="tel" value="${escapeHtmlAttribute(client.phone)}" />
          </label>
          <label>
            Cargo
            <input name="position" type="text" value="${escapeHtmlAttribute(client.position)}" />
          </label>
          <label>
            Origen
            <input name="source" type="text" value="${escapeHtmlAttribute(client.source)}" />
          </label>
          <label class="full">
            Notas
            <textarea name="notes" rows="5">${escapeHtml(client.notes)}</textarea>
          </label>
          <div class="form-actions full">
            <button type="submit">Guardar cambios</button>
            <button type="button" class="ghost-button" data-delete-client="${client.id}">Eliminar cliente</button>
          </div>
        </form>
      </article>
      <aside class="card related-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Relacionadas</span>
            <h2>Oportunidades del cliente</h2>
          </div>
          <p>${related.length} registradas para ${escapeHtml(client.company)}.</p>
        </div>
        <div class="list-stack">
          ${
            related.length === 0
              ? '<p class="empty-state">Este cliente todavia no tiene oportunidades asociadas.</p>'
              : related.map((item) => renderRelatedOpportunity(item)).join("")
          }
        </div>
      </aside>
    </section>
  `;
}

function buildOpportunitiesView(state: CRMState, ui: UIState): string {
  return `
    <section class="page-grid">
      <article class="card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Oportunidades</span>
            <h2>Pipeline comercial</h2>
          </div>
          <p>Abre una oportunidad para editar cliente, stage, monto y notas.</p>
        </div>
        <div class="toolbar">
          <label>
            Buscar oportunidad
            <input
              id="opportunity-search"
              type="search"
              placeholder="Titulo, cliente, empresa u owner"
              value="${escapeHtmlAttribute(ui.opportunitySearch)}"
            />
          </label>
          <label>
            Filtrar por stage
            <select id="opportunity-stage-filter">
              <option value="all" ${ui.opportunityStageFilter === "all" ? "selected" : ""}>Todos</option>
              ${Object.entries(stageMeta)
                .map(
                  ([value, meta]) =>
                    `<option value="${value}" ${
                      ui.opportunityStageFilter === value ? "selected" : ""
                    }>${meta.label}</option>`
                )
                .join("")}
            </select>
          </label>
        </div>
        <div class="list-stack" data-opportunity-list>
          ${renderOpportunityList(state, ui.opportunitySearch, ui.opportunityStageFilter)}
        </div>
      </article>
      <aside class="card side-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Accion</span>
            <h2>Nueva oportunidad</h2>
          </div>
          <p>La carga queda en su pestaña y ya no invade la pantalla inicial.</p>
        </div>
        <button type="button" data-toggle-new-opportunity ${state.clients.length === 0 ? "disabled" : ""}>
          ${ui.showNewOpportunityForm ? "Cerrar formulario" : "Crear oportunidad"}
        </button>
        ${
          ui.showNewOpportunityForm
            ? buildOpportunityForm(state)
            : `<p class="empty-state side-copy">${
                state.clients.length === 0
                  ? "Primero necesitas al menos un cliente para crear oportunidades."
                  : "Abre el formulario solo cuando quieras dar de alta una oportunidad."
              }</p>`
        }
      </aside>
    </section>
  `;
}

function buildOpportunityDetailView(state: CRMState, opportunityId: string): string {
  const opportunity = state.opportunities.find((item) => item.id === opportunityId);
  if (!opportunity) {
    return buildMissingCard("Oportunidad no encontrada", "El registro ya no existe.");
  }

  const client = state.clients.find((item) => item.id === opportunity.clientId);

  return `
    <section class="detail-grid">
      <article class="card detail-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Oportunidad</span>
            <h2>${escapeHtml(opportunity.title)}</h2>
          </div>
          <p>Edita el contexto comercial y la relacion con el cliente.</p>
        </div>
        <form id="opportunity-detail-form" class="form-grid">
          <input type="hidden" name="id" value="${opportunity.id}" />
          <label class="full">
            Cliente
            <select name="clientId" required>
              ${state.clients
                .map(
                  (item) => `
                    <option value="${item.id}" ${item.id === opportunity.clientId ? "selected" : ""}>
                      ${escapeHtml(item.name)} - ${escapeHtml(item.company)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label>
            Nombre de la oportunidad
            <input name="title" type="text" value="${escapeHtmlAttribute(opportunity.title)}" required />
          </label>
          <label>
            Stage
            <select name="stage" required>
              ${Object.entries(stageMeta)
                .map(
                  ([value, meta]) =>
                    `<option value="${value}" ${value === opportunity.stage ? "selected" : ""}>${meta.label}</option>`
                )
                .join("")}
            </select>
          </label>
          <label>
            Monto estimado
            <input name="amount" type="number" min="0" step="0.01" value="${opportunity.amount}" required />
          </label>
          <label>
            Fecha estimada de cierre
            <input name="expectedCloseDate" type="date" value="${escapeHtmlAttribute(opportunity.expectedCloseDate)}" required />
          </label>
          <label>
            Owner
            <input name="owner" type="text" value="${escapeHtmlAttribute(opportunity.owner)}" required />
          </label>
          <label class="full">
            Notas
            <textarea name="notes" rows="5">${escapeHtml(opportunity.notes)}</textarea>
          </label>
          <div class="form-actions full">
            <button type="submit">Guardar cambios</button>
            <button type="button" class="ghost-button" data-delete-opportunity="${opportunity.id}">Eliminar oportunidad</button>
          </div>
        </form>
      </article>
      <aside class="card related-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Contexto</span>
            <h2>Cliente vinculado</h2>
          </div>
          <p>Acceso rapido a la ficha del cliente relacionado.</p>
        </div>
        ${
          client
            ? `
              <button type="button" class="link-card" data-open-client="${client.id}">
                <strong>${escapeHtml(client.name)}</strong>
                <span>${escapeHtml(client.company)}</span>
                <span>${escapeHtml(client.email)}</span>
              </button>
            `
            : '<p class="empty-state">El cliente relacionado fue eliminado.</p>'
        }
      </aside>
    </section>
  `;
}

function buildMetrics(state: CRMState): string {
  return Object.entries(stageMeta)
    .map(([stage, meta]) => {
      const items = state.opportunities.filter((opportunity) => opportunity.stage === stage);
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      return `
        <article class="card metric">
          <span class="metric__tone metric__tone--${meta.tone}"></span>
          <p>${meta.label}</p>
          <strong>${items.length}</strong>
          <span>${formatCurrency(total)}</span>
        </article>
      `;
    })
    .join("");
}

function buildBarChart(state: CRMState): string {
  const values = Object.entries(stageMeta).map(([stage, meta]) => ({
    label: meta.label,
    tone: meta.tone,
    total: state.opportunities
      .filter((opportunity) => opportunity.stage === stage)
      .reduce((sum, item) => sum + item.amount, 0)
  }));
  const maxValue = Math.max(...values.map((item) => item.total), 1);

  return `
    <div class="bar-chart">
      ${values
        .map((item) => {
          const height = item.total === 0 ? 10 : Math.max((item.total / maxValue) * 100, 18);
          return `
            <article class="bar-chart__item">
              <div class="bar-chart__value">${formatCurrency(item.total)}</div>
              <div class="bar-chart__track">
                <div class="bar-chart__bar bar-chart__bar--${item.tone}" style="height: ${height}%"></div>
              </div>
              <div class="bar-chart__label">${item.label}</div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function buildClientForm(): string {
  return `
    <form id="new-client-form" class="form-grid form-grid--stacked">
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
        <textarea name="notes" rows="4" placeholder="Contexto, dolores, proxima accion..."></textarea>
      </label>
      <button type="submit">Guardar cliente</button>
    </form>
  `;
}

function buildOpportunityForm(state: CRMState): string {
  return `
    <form id="new-opportunity-form" class="form-grid form-grid--stacked">
      <label class="full">
        Cliente
        <select name="clientId" required>
          <option value="">Selecciona un cliente</option>
          ${state.clients
            .map(
              (client) =>
                `<option value="${client.id}">${escapeHtml(client.name)} - ${escapeHtml(client.company)}</option>`
            )
            .join("")}
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
            .map(([value, meta]) => `<option value="${value}">${meta.label}</option>`)
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
        <textarea name="notes" rows="4" placeholder="Siguiente paso, competencia, decisor..."></textarea>
      </label>
      <button type="submit">Guardar oportunidad</button>
    </form>
  `;
}

function buildMissingCard(title: string, description: string): string {
  return `
    <section class="card">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Sin datos</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p>${escapeHtml(description)}</p>
      </div>
    </section>
  `;
}

function renderClientList(state: CRMState, search: string): string {
  const clients = state.clients.filter((client) =>
    !search
      ? true
      : [client.name, client.company, client.email, client.phone]
          .join(" ")
          .toLowerCase()
          .includes(search)
  );

  if (clients.length === 0) {
    return '<p class="empty-state">No hay clientes para mostrar con ese filtro.</p>';
  }

  return clients
    .map((client) => {
      const related = state.opportunities.filter((item) => item.clientId === client.id);
      return `
        <button type="button" class="list-item list-button" data-open-client="${client.id}">
          <div class="list-item__header">
            <div>
              <strong>${escapeHtml(client.name)}</strong>
              <p>${escapeHtml(client.company)} - ${escapeHtml(client.position || "Sin cargo")}</p>
            </div>
            <span class="list-link">Abrir</span>
          </div>
          <div class="list-item__meta">
            <span>${escapeHtml(client.email)}</span>
            <span>${escapeHtml(client.phone || "Sin telefono")}</span>
            <span>${related.length} oportunidades</span>
          </div>
          <p>${escapeHtml(client.notes || "Sin notas cargadas.")}</p>
        </button>
      `;
    })
    .join("");
}

function renderOpportunityList(state: CRMState, search: string, stage: string): string {
  const opportunities = state.opportunities.filter((opportunity) => {
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

  if (opportunities.length === 0) {
    return '<p class="empty-state">No hay oportunidades para mostrar con ese filtro.</p>';
  }

  return opportunities
    .map((opportunity) => {
      const client = state.clients.find((item) => item.id === opportunity.clientId);
      const meta = stageMeta[opportunity.stage];
      return `
        <button type="button" class="list-item list-button" data-open-opportunity="${opportunity.id}">
          <div class="list-item__header">
            <div>
              <strong>${escapeHtml(opportunity.title)}</strong>
              <p>${escapeHtml(client?.name ?? "Cliente eliminado")} - ${escapeHtml(client?.company ?? "Sin empresa")}</p>
            </div>
            <span class="list-link">Abrir</span>
          </div>
          <div class="list-item__meta">
            <span class="badge badge--${meta.tone}">${meta.label}</span>
            <span>${formatCurrency(opportunity.amount)}</span>
            <span>Cierre: ${formatDate(opportunity.expectedCloseDate)}</span>
            <span>Prob.: ${meta.probability}%</span>
          </div>
          <p>${escapeHtml(opportunity.notes || "Sin notas cargadas.")}</p>
        </button>
      `;
    })
    .join("");
}

function renderRecentClients(state: CRMState): string {
  return state.clients
    .slice(0, 3)
    .map(
      (client) => `
        <button type="button" class="summary-link" data-open-client="${client.id}">
          <strong>${escapeHtml(client.name)}</strong>
          <span>${escapeHtml(client.company)}</span>
        </button>
      `
    )
    .join("");
}

function renderRecentOpportunities(state: CRMState): string {
  return state.opportunities
    .slice(0, 3)
    .map(
      (opportunity) => `
        <button type="button" class="summary-link" data-open-opportunity="${opportunity.id}">
          <strong>${escapeHtml(opportunity.title)}</strong>
          <span>${formatCurrency(opportunity.amount)}</span>
        </button>
      `
    )
    .join("");
}

function renderRelatedOpportunity(opportunity: Opportunity): string {
  const meta = stageMeta[opportunity.stage];
  return `
    <button type="button" class="list-item list-button" data-open-opportunity="${opportunity.id}">
      <div class="list-item__header">
        <div>
          <strong>${escapeHtml(opportunity.title)}</strong>
          <p>Owner: ${escapeHtml(opportunity.owner)}</p>
        </div>
        <span class="list-link">Abrir</span>
      </div>
      <div class="list-item__meta">
        <span class="badge badge--${meta.tone}">${meta.label}</span>
        <span>${formatCurrency(opportunity.amount)}</span>
        <span>Cierre: ${formatDate(opportunity.expectedCloseDate)}</span>
      </div>
    </button>
  `;
}

function normalizeState(state: CRMState): CRMState {
  return {
    clients: [...state.clients].sort(sortByDateDesc),
    opportunities: [...state.opportunities].sort(sortByDateDesc)
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

function readNumber(formData: FormData, key: string): number {
  const value = Number(readString(formData, key));
  return Number.isFinite(value) ? value : 0;
}

function readStage(formData: FormData, key: string): OpportunityStage {
  const value = readString(formData, key);
  return value in stageMeta ? (value as OpportunityStage) : "lead";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
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
