export type OpportunityStage =
  | "lead"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export type OpportunityEventType = "call" | "meeting" | "email" | "message" | "other";

export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  position: string;
  source: string;
  socialNetworks: string;
  notes: string;
  createdAt: string;
}

export interface Seller {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  clientId: string;
  sellerId: string;
  title: string;
  stage: OpportunityStage;
  amount: number;
  expectedCloseDate: string;
  owner: string;
  notes: string;
  createdAt: string;
}

export interface OpportunityEvent {
  id: string;
  opportunityId: string;
  clientId: string;
  sellerId: string;
  type: OpportunityEventType;
  eventDate: string;
  comment: string;
  createdAt: string;
}

export interface CRMState {
  clients: Client[];
  sellers: Seller[];
  opportunities: Opportunity[];
  opportunityEvents: OpportunityEvent[];
}
