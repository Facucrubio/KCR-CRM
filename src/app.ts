import { supabase } from "./lib/supabase";
import type {
  CRMState,
  Client,
  Opportunity,
  OpportunityStage,
  Seller
} from "./types";

type ViewName =
  | "home"
  | "clients"
  | "clientDetail"
  | "sellers"
  | "sellerDetail"
  | "opportunities"
  | "opportunityDetail";

interface AppView {
  name: ViewName;
  id?: string;
}

interface UIState {
  view: AppView;
  clientSearch: string;
  sellerSearch: string;
  opportunitySearch: string;
  opportunityStageFilter: string;
  showNewClientForm: boolean;
  showNewSellerForm: boolean;
  showNewOpportunityForm: boolean;
  isSaving: boolean;
  feedback: string;
  error: string;
}

interface ClientRow {
  id: string;
  name: string;
  company: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  source: string | null;
  social_networks: string | null;
  notes: string | null;
  created_at: string;
}

interface SellerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

interface OpportunityRow {
  id: string;
  client_id: string;
  seller_id: string | null;
  title: string;
  stage: OpportunityStage;
  amount: number | string;
  expected_close_date: string | null;
  owner: string | null;
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
  let state: CRMState = { clients: [], sellers: [], opportunities: [] };
  let ui: UIState = {
    view: { name: "home" },
    clientSearch: "",
    sellerSearch: "",
    opportunitySearch: "",
    opportunityStageFilter: "all",
    showNewClientForm: false,
    showNewSellerForm: false,
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
      showNewSellerForm: false,
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
  } catch (error) {
    ui.error = `No pudimos cargar Supabase. ${formatError(error)}`;
  }

  render();
}

async function fetchState(): Promise<CRMState> {
  const [clientsResult, sellersResult, opportunitiesResult] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase.from("sellers").select("*").order("created_at", { ascending: false }),
    supabase
      .from("opportunities")
      .select("*")
      .order("created_at", { ascending: false })
  ]);

  if (clientsResult.error) {
    throw clientsResult.error;
  }

  if (sellersResult.error) {
    throw sellersResult.error;
  }

  if (opportunitiesResult.error) {
    throw opportunitiesResult.error;
  }

  return normalizeState({
    clients: (clientsResult.data ?? []).map(mapClientRow),
    sellers: (sellersResult.data ?? []).map(mapSellerRow),
    opportunities: (opportunitiesResult.data ?? []).map(mapOpportunityRow)
  });
}

async function refreshState(
  setState: (state: CRMState) => void,
  setUI: (state: Partial<UIState>) => void
): Promise<CRMState> {
  const nextState = await fetchState();
  setState(nextState);
  setUI({ error: "" });
  return nextState;
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
    email: row.email ?? "",
    phone: row.phone ?? "",
    position: row.position ?? "",
    source: row.source ?? "",
    socialNetworks: row.social_networks ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at
  };
}

function mapSellerRow(row: SellerRow): Seller {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at
  };
}

function mapOpportunityRow(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    clientId: row.client_id,
    sellerId: row.seller_id ?? "",
    title: row.title,
    stage: row.stage,
    amount: Number(row.amount),
    expectedCloseDate: row.expected_close_date ?? "",
    owner: row.owner ?? "",
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
    email: toNullable(readString(formData, "email")),
    phone: toNullable(readString(formData, "phone")),
    position: toNullable(readString(formData, "position")),
    source: toNullable(readString(formData, "source")),
    social_networks: toNullable(readString(formData, "socialNetworks")),
    notes: toNullable(readString(formData, "notes"))
  };
}

function buildSellerPayload(formData: FormData) {
  return {
    name: readString(formData, "name"),
    email: toNullable(readString(formData, "email")),
    phone: toNullable(readString(formData, "phone")),
    notes: toNullable(readString(formData, "notes"))
  };
}

function buildOpportunityPayload(formData: FormData, sellers: Seller[]) {
  const sellerId = readString(formData, "sellerId");
  const seller = sellers.find((item) => item.id === sellerId);

  return {
    client_id: readString(formData, "clientId"),
    seller_id: sellerId,
    title: readString(formData, "title"),
    stage: readStage(formData, "stage"),
    amount: readNumber(formData, "amount"),
    expected_close_date: toNullable(readString(formData, "expectedCloseDate")),
    owner: seller?.name ?? readString(formData, "owner"),
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

  root.querySelectorAll<HTMLElement>("[data-open-seller]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.openSeller;
      if (id) {
        navigate({ name: "sellerDetail", id });
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
      showNewSellerForm: false,
      showNewOpportunityForm: false
    });
  });

  root.querySelector<HTMLElement>("[data-toggle-new-seller]")?.addEventListener("click", () => {
    setUI({
      showNewClientForm: false,
      showNewSellerForm: !ui.showNewSellerForm,
      showNewOpportunityForm: false
    });
  });

  root
    .querySelector<HTMLElement>("[data-toggle-new-opportunity]")
    ?.addEventListener("click", () => {
      setUI({
        showNewSellerForm: false,
        showNewOpportunityForm: !ui.showNewOpportunityForm,
        showNewClientForm: false
      });
    });

  root.querySelector<HTMLInputElement>("#client-search")?.addEventListener("input", (event) => {
    ui.clientSearch = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
    updateClientList(root, state, ui.clientSearch, navigate);
  });

  root.querySelector<HTMLInputElement>("#seller-search")?.addEventListener("input", (event) => {
    ui.sellerSearch = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
    updateSellerList(root, state, ui.sellerSearch, navigate);
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
      const { error } = await supabase
        .from("clients")
        .insert(buildClientPayload(new FormData(clientForm)));

      if (error) {
        throw error;
      }

      const nextState = await refreshState(setState, setUI);
      const client = nextState.clients[0];
      if (client) {
        navigate({ name: "clientDetail", id: client.id });
      }
    });
  });

  const sellerForm = root.querySelector<HTMLFormElement>("#new-seller-form");
  sellerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ui.isSaving) {
      return;
    }

    await withMutation(setUI, async () => {
      const { error } = await supabase
        .from("sellers")
        .insert(buildSellerPayload(new FormData(sellerForm)));

      if (error) {
        throw error;
      }

      const nextState = await refreshState(setState, setUI);
      const seller = nextState.sellers[0];
      if (seller) {
        navigate({ name: "sellerDetail", id: seller.id });
      }
    });
  });

  const opportunityForm = root.querySelector<HTMLFormElement>("#new-opportunity-form");
  opportunityForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ui.isSaving) {
      return;
    }

    await withMutation(setUI, async () => {
      const { error } = await supabase
        .from("opportunities")
        .insert(buildOpportunityPayload(new FormData(opportunityForm), state.sellers));

      if (error) {
        throw error;
      }

      const nextState = await refreshState(setState, setUI);
      const opportunity = nextState.opportunities[0];
      if (opportunity) {
        navigate({ name: "opportunityDetail", id: opportunity.id });
      }
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

function updateSellerList(
  root: HTMLDivElement,
  state: CRMState,
  search: string,
  navigate: (view: AppView) => void
): void {
  const container = root.querySelector<HTMLElement>("[data-seller-list]");
  if (!container) {
    return;
  }

  container.innerHTML = renderSellerList(state, search);
  root.querySelectorAll<HTMLElement>("[data-open-seller]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.openSeller;
      if (id) {
        navigate({ name: "sellerDetail", id });
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
      const { error } = await supabase
        .from("clients")
        .update(buildClientPayload(formData))
        .eq("id", clientId);

      if (error) {
        throw error;
      }

      await refreshState(setState, setUI);
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

      await refreshState(setState, setUI);
      navigate({ name: "clients" });
    });
  });

  const sellerDetailForm = root.querySelector<HTMLFormElement>("#seller-detail-form");
  sellerDetailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ui.isSaving) {
      return;
    }

    const formData = new FormData(sellerDetailForm);
    const sellerId = readString(formData, "id");
    const current = state.sellers.find((item) => item.id === sellerId);
    if (!current) {
      return;
    }

    await withMutation(setUI, async () => {
      const { error } = await supabase
        .from("sellers")
        .update(buildSellerPayload(formData))
        .eq("id", sellerId);

      if (error) {
        throw error;
      }

      await refreshState(setState, setUI);
      navigate({ name: "sellerDetail", id: sellerId });
    });
  });

  root.querySelector<HTMLElement>("[data-delete-seller]")?.addEventListener("click", async () => {
    if (ui.isSaving) {
      return;
    }

    const id = root.querySelector<HTMLElement>("[data-delete-seller]")?.dataset.deleteSeller;
    if (!id) {
      return;
    }

    await withMutation(setUI, async () => {
      const { error } = await supabase.from("sellers").delete().eq("id", id);

      if (error) {
        throw error;
      }

      await refreshState(setState, setUI);
      navigate({ name: "sellers" });
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
      const { error } = await supabase
        .from("opportunities")
        .update(buildOpportunityPayload(formData, state.sellers))
        .eq("id", opportunityId);

      if (error) {
        throw error;
      }

      await refreshState(setState, setUI);
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

        await refreshState(setState, setUI);
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
    <section class="hero hero--compact">
      <div class="hero-copy">
        <span class="eyebrow">CRM interno</span>
        <h1>Seguimiento comercial claro y accionable.</h1>
        <p>La portada resume el pipeline. La gestion vive en Clientes, Vendedores y Oportunidades.</p>
      </div>
      <div class="hero-card">
        <p class="hero-card__label">Pipeline activo</p>
        <strong>${formatCurrency(totalOpenPipeline(state))}</strong>
        <span>${countOpenOpportunities(state)} oportunidades abiertas</span>
        <span>${state.clients.length} clientes y ${state.sellers.length} vendedores activos</span>
      </div>
    </section>
  `;
}

function buildTabs(view: AppView): string {
  const isActive = (tab: "home" | "clients" | "sellers" | "opportunities") => {
    if (tab === "clients" && view.name === "clientDetail") {
      return "tab-button--active";
    }
    if (tab === "sellers" && view.name === "sellerDetail") {
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
      <button type="button" class="tab-button ${isActive("sellers")}" data-view="sellers">Vendedores</button>
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
    case "sellers":
      return buildSellersView(state, ui);
    case "sellerDetail":
      return buildSellerDetailView(state, ui.view.id ?? "");
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
          <p>Atajos a clientes, vendedores y oportunidades recientes.</p>
        </div>
        <div class="summary-columns summary-columns--three">
          <section class="summary-group">
            <h3>Clientes</h3>
            ${renderRecentClients(state)}
          </section>
          <section class="summary-group">
            <h3>Vendedores</h3>
            ${renderRecentSellers(state)}
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
            <h2>Empresas y contactos</h2>
          </div>
          <p>La empresa pasa a ser el titulo principal de cada cliente.</p>
        </div>
        <div class="toolbar toolbar--single">
          <label>
            Buscar cliente
            <input
              id="client-search"
              type="search"
              placeholder="Empresa, contacto, email o telefono"
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
          <p>Contacto y empresa quedan separados desde el alta inicial.</p>
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

function buildSellersView(state: CRMState, ui: UIState): string {
  return `
    <section class="page-grid">
      <article class="card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Vendedores</span>
            <h2>Owners comerciales</h2>
          </div>
          <p>Cada oportunidad debe quedar asignada a un vendedor existente.</p>
        </div>
        <div class="toolbar toolbar--single">
          <label>
            Buscar vendedor
            <input
              id="seller-search"
              type="search"
              placeholder="Nombre, email o telefono"
              value="${escapeHtmlAttribute(ui.sellerSearch)}"
            />
          </label>
        </div>
        <div class="list-stack" data-seller-list>
          ${renderSellerList(state, ui.sellerSearch)}
        </div>
      </article>
      <aside class="card side-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Accion</span>
            <h2>Nuevo vendedor</h2>
          </div>
          <p>Crealos primero para poder asignarlos desde oportunidades.</p>
        </div>
        <button type="button" data-toggle-new-seller>
          ${ui.showNewSellerForm ? "Cerrar formulario" : "Crear vendedor"}
        </button>
        ${
          ui.showNewSellerForm
            ? buildSellerForm()
            : '<p class="empty-state side-copy">Abre el formulario solo cuando necesites dar de alta un vendedor.</p>'
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
            <h2>${escapeHtml(client.company)}</h2>
            <p class="section-heading__meta">Contacto principal: ${escapeHtml(client.name || "Sin definir")}</p>
          </div>
          <p>Edita empresa, contacto y contexto comercial sin salir de la ficha.</p>
        </div>
        <form id="client-detail-form" class="form-grid">
          <input type="hidden" name="id" value="${client.id}" />
          <label>
            Empresa
            <input name="company" type="text" value="${escapeHtmlAttribute(client.company)}" required />
          </label>
          <label>
            Nombre de contacto
            <input name="name" type="text" value="${escapeHtmlAttribute(client.name)}" required />
          </label>
          <label>
            Email
            <input name="email" type="email" value="${escapeHtmlAttribute(client.email)}" />
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
            Redes sociales
            <input
              name="socialNetworks"
              type="text"
              value="${escapeHtmlAttribute(client.socialNetworks)}"
              placeholder="LinkedIn, Instagram, sitio web..."
            />
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
              : related.map((item) => renderRelatedOpportunity(state, item)).join("")
          }
        </div>
      </aside>
    </section>
  `;
}

function buildSellerDetailView(state: CRMState, sellerId: string): string {
  const seller = state.sellers.find((item) => item.id === sellerId);
  if (!seller) {
    return buildMissingCard("Vendedor no encontrado", "El registro ya no existe.");
  }

  const related = state.opportunities.filter((item) => item.sellerId === seller.id);

  return `
    <section class="detail-grid">
      <article class="card detail-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Vendedor</span>
            <h2>${escapeHtml(seller.name)}</h2>
          </div>
          <p>Gestiona el owner comercial y sus datos de contacto.</p>
        </div>
        <form id="seller-detail-form" class="form-grid">
          <input type="hidden" name="id" value="${seller.id}" />
          <label>
            Nombre
            <input name="name" type="text" value="${escapeHtmlAttribute(seller.name)}" required />
          </label>
          <label>
            Email
            <input name="email" type="email" value="${escapeHtmlAttribute(seller.email)}" />
          </label>
          <label>
            Telefono
            <input name="phone" type="tel" value="${escapeHtmlAttribute(seller.phone)}" />
          </label>
          <label class="full">
            Notas
            <textarea name="notes" rows="5">${escapeHtml(seller.notes)}</textarea>
          </label>
          <div class="form-actions full">
            <button type="submit">Guardar cambios</button>
            <button type="button" class="ghost-button" data-delete-seller="${seller.id}">Eliminar vendedor</button>
          </div>
        </form>
      </article>
      <aside class="card related-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Relacionadas</span>
            <h2>Oportunidades asignadas</h2>
          </div>
          <p>${related.length} oportunidades con este vendedor como owner.</p>
        </div>
        <div class="list-stack">
          ${
            related.length === 0
              ? '<p class="empty-state">Este vendedor todavia no tiene oportunidades asignadas.</p>'
              : related.map((item) => renderRelatedOpportunity(state, item)).join("")
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
          <p>Abre una oportunidad para editar cliente, vendedor, stage, monto y notas.</p>
        </div>
        <div class="toolbar">
          <label>
            Buscar oportunidad
            <input
              id="opportunity-search"
              type="search"
              placeholder="Titulo, empresa, contacto o vendedor"
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
          <p>La carga queda en su pestaña y exige un cliente y un vendedor.</p>
        </div>
        <button
          type="button"
          data-toggle-new-opportunity
          ${state.clients.length === 0 || state.sellers.length === 0 ? "disabled" : ""}
        >
          ${ui.showNewOpportunityForm ? "Cerrar formulario" : "Crear oportunidad"}
        </button>
        ${
          ui.showNewOpportunityForm
            ? buildOpportunityForm(state)
            : `<p class="empty-state side-copy">${
                state.clients.length === 0
                  ? "Primero necesitas al menos un cliente para crear oportunidades."
                  : state.sellers.length === 0
                    ? "Primero necesitas al menos un vendedor para asignar la oportunidad."
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
  const seller = resolveSeller(state, opportunity);

  return `
    <section class="detail-grid">
      <article class="card detail-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Oportunidad</span>
            <h2>${escapeHtml(opportunity.title)}</h2>
          </div>
          <p>Edita el contexto comercial y la relacion con cliente y vendedor.</p>
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
                      ${escapeHtml(item.company)} - ${escapeHtml(item.name)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label class="full">
            Vendedor owner
            <select name="sellerId" required>
              <option value="">Selecciona un vendedor</option>
              ${state.sellers
                .map(
                  (item) => `
                    <option value="${item.id}" ${item.id === opportunity.sellerId ? "selected" : ""}>
                      ${escapeHtml(item.name)}
                    </option>
                  `
                )
                .join("")}
            </select>
            <input type="hidden" name="owner" value="${escapeHtmlAttribute(opportunity.owner)}" />
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
            <h2>Relacionados</h2>
          </div>
          <p>Acceso rapido a la ficha del cliente y del vendedor asignado.</p>
        </div>
        <div class="list-stack">
          ${
            client
              ? `
                <button type="button" class="link-card" data-open-client="${client.id}">
                  <strong>${escapeHtml(client.company)}</strong>
                  <span>${escapeHtml(client.name || "Sin contacto")}</span>
                  <span>${escapeHtml(client.email || client.phone || "Sin datos de contacto")}</span>
                </button>
              `
              : '<p class="empty-state">El cliente relacionado fue eliminado.</p>'
          }
          ${
            seller
              ? `
                <button type="button" class="link-card" data-open-seller="${seller.id}">
                  <strong>${escapeHtml(seller.name)}</strong>
                  <span>Owner comercial</span>
                  <span>${escapeHtml(seller.email || seller.phone || "Sin datos de contacto")}</span>
                </button>
              `
              : '<p class="empty-state">El vendedor relacionado fue eliminado.</p>'
          }
        </div>
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
        Empresa
        <input name="company" type="text" placeholder="Acme SA" required />
      </label>
      <label>
        Nombre de contacto
        <input name="name" type="text" placeholder="Ana Perez" required />
      </label>
      <label>
        Email
        <input name="email" type="email" placeholder="ana@empresa.com" />
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
        Redes sociales
        <input name="socialNetworks" type="text" placeholder="LinkedIn, Instagram, sitio web..." />
      </label>
      <label class="full">
        Notas
        <textarea name="notes" rows="4" placeholder="Contexto, dolores, proxima accion..."></textarea>
      </label>
      <button type="submit">Guardar cliente</button>
    </form>
  `;
}

function buildSellerForm(): string {
  return `
    <form id="new-seller-form" class="form-grid form-grid--stacked">
      <label>
        Nombre
        <input name="name" type="text" placeholder="Carla Gomez" required />
      </label>
      <label>
        Email
        <input name="email" type="email" placeholder="carla@empresa.com" />
      </label>
      <label>
        Telefono
        <input name="phone" type="tel" placeholder="+54 11 4444 1111" />
      </label>
      <label class="full">
        Notas
        <textarea name="notes" rows="4" placeholder="Equipo, seniority, observaciones..."></textarea>
      </label>
      <button type="submit">Guardar vendedor</button>
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
                `<option value="${client.id}">${escapeHtml(client.company)} - ${escapeHtml(client.name)}</option>`
            )
            .join("")}
        </select>
      </label>
      <label class="full">
        Vendedor owner
        <select name="sellerId" required>
          <option value="">Selecciona un vendedor</option>
          ${state.sellers
            .map(
              (seller) => `<option value="${seller.id}">${escapeHtml(seller.name)}</option>`
            )
            .join("")}
        </select>
        <input name="owner" type="hidden" value="" />
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
      : [client.company, client.name, client.email, client.phone, client.socialNetworks]
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
              <strong>${escapeHtml(client.company)}</strong>
              <p>${escapeHtml(client.name || "Sin contacto")} - ${escapeHtml(client.position || "Sin cargo")}</p>
            </div>
            <span class="list-link">Abrir</span>
          </div>
          <div class="list-item__meta">
            <span>${escapeHtml(client.email || "Sin email")}</span>
            <span>${escapeHtml(client.phone || "Sin telefono")}</span>
            <span>${related.length} oportunidades</span>
          </div>
          <p>${escapeHtml(client.notes || "Sin notas cargadas.")}</p>
        </button>
      `;
    })
    .join("");
}

function renderSellerList(state: CRMState, search: string): string {
  const sellers = state.sellers.filter((seller) =>
    !search
      ? true
      : [seller.name, seller.email, seller.phone].join(" ").toLowerCase().includes(search)
  );

  if (sellers.length === 0) {
    return '<p class="empty-state">No hay vendedores para mostrar con ese filtro.</p>';
  }

  return sellers
    .map((seller) => {
      const related = state.opportunities.filter((item) => item.sellerId === seller.id);
      return `
        <button type="button" class="list-item list-button" data-open-seller="${seller.id}">
          <div class="list-item__header">
            <div>
              <strong>${escapeHtml(seller.name)}</strong>
              <p>${related.length} oportunidades asignadas</p>
            </div>
            <span class="list-link">Abrir</span>
          </div>
          <div class="list-item__meta">
            <span>${escapeHtml(seller.email || "Sin email")}</span>
            <span>${escapeHtml(seller.phone || "Sin telefono")}</span>
          </div>
          <p>${escapeHtml(seller.notes || "Sin notas cargadas.")}</p>
        </button>
      `;
    })
    .join("");
}

function renderOpportunityList(state: CRMState, search: string, stage: string): string {
  const opportunities = state.opportunities.filter((opportunity) => {
    const client = state.clients.find((item) => item.id === opportunity.clientId);
    const seller = resolveSeller(state, opportunity);
    const matchesSearch = !search
      ? true
      : [
          opportunity.title,
          client?.company ?? "",
          client?.name ?? "",
          seller?.name ?? opportunity.owner
        ]
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
      const seller = resolveSeller(state, opportunity);
      const meta = stageMeta[opportunity.stage];
      return `
        <button type="button" class="list-item list-button" data-open-opportunity="${opportunity.id}">
          <div class="list-item__header">
            <div>
              <strong>${escapeHtml(opportunity.title)}</strong>
              <p>${escapeHtml(client?.company ?? "Cliente eliminado")} - ${escapeHtml(client?.name ?? "Sin contacto")}</p>
            </div>
            <span class="list-link">Abrir</span>
          </div>
          <div class="list-item__meta">
            <span class="badge badge--${meta.tone}">${meta.label}</span>
            <span>${formatCurrency(opportunity.amount)}</span>
            <span>Vendedor: ${escapeHtml((seller?.name ?? opportunity.owner) || "Sin vendedor")}</span>
            <span>Cierre: ${formatDate(opportunity.expectedCloseDate)}</span>
          </div>
          <p>${escapeHtml(opportunity.notes || "Sin notas cargadas.")}</p>
        </button>
      `;
    })
    .join("");
}

function renderRecentClients(state: CRMState): string {
  if (state.clients.length === 0) {
    return '<p class="empty-state">Todavia no hay clientes cargados.</p>';
  }

  return state.clients
    .slice(0, 3)
    .map(
      (client) => `
        <button type="button" class="summary-link" data-open-client="${client.id}">
          <strong>${escapeHtml(client.company)}</strong>
          <span>${escapeHtml(client.name || "Sin contacto")}</span>
        </button>
      `
    )
    .join("");
}

function renderRecentSellers(state: CRMState): string {
  if (state.sellers.length === 0) {
    return '<p class="empty-state">Todavia no hay vendedores cargados.</p>';
  }

  return state.sellers
    .slice(0, 3)
    .map(
      (seller) => `
        <button type="button" class="summary-link" data-open-seller="${seller.id}">
          <strong>${escapeHtml(seller.name)}</strong>
          <span>${escapeHtml(seller.email || "Sin email")}</span>
        </button>
      `
    )
    .join("");
}

function renderRecentOpportunities(state: CRMState): string {
  if (state.opportunities.length === 0) {
    return '<p class="empty-state">Todavia no hay oportunidades cargadas.</p>';
  }

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

function renderRelatedOpportunity(state: CRMState, opportunity: Opportunity): string {
  const meta = stageMeta[opportunity.stage];
  const seller = resolveSeller(state, opportunity);
  return `
    <button type="button" class="list-item list-button" data-open-opportunity="${opportunity.id}">
      <div class="list-item__header">
        <div>
          <strong>${escapeHtml(opportunity.title)}</strong>
          <p>Vendedor: ${escapeHtml((seller?.name ?? opportunity.owner) || "Sin vendedor")}</p>
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
    sellers: [...state.sellers].sort(sortByDateDesc),
    opportunities: [...state.opportunities].sort(sortByDateDesc)
  };
}

function resolveSeller(state: CRMState, opportunity: Opportunity): Seller | undefined {
  return state.sellers.find((item) => item.id === opportunity.sellerId);
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
