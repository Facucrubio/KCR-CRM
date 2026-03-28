do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'opportunity_event_type'
  ) then
    create type public.opportunity_event_type as enum (
      'call',
      'meeting',
      'email',
      'message',
      'other'
    );
  end if;
end $$;

create table if not exists public.opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  seller_id uuid references public.sellers(id) on delete restrict,
  event_type public.opportunity_event_type not null,
  event_date timestamptz not null,
  comment text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_opportunity_event_context()
returns trigger
language plpgsql
as $$
declare
  linked_opportunity public.opportunities%rowtype;
begin
  select *
  into linked_opportunity
  from public.opportunities
  where id = new.opportunity_id;

  if linked_opportunity.id is null then
    raise exception 'Opportunity % does not exist', new.opportunity_id;
  end if;

  new.client_id = linked_opportunity.client_id;
  new.seller_id = linked_opportunity.seller_id;
  return new;
end;
$$;

create index if not exists idx_opportunity_events_opportunity_id
  on public.opportunity_events(opportunity_id);

create index if not exists idx_opportunity_events_event_date
  on public.opportunity_events(event_date desc);

create index if not exists idx_opportunity_events_client_id
  on public.opportunity_events(client_id);

create index if not exists idx_opportunity_events_seller_id
  on public.opportunity_events(seller_id);

drop trigger if exists set_opportunity_events_context on public.opportunity_events;
create trigger set_opportunity_events_context
before insert or update of opportunity_id
on public.opportunity_events
for each row
execute function public.set_opportunity_event_context();

drop trigger if exists set_opportunity_events_updated_at on public.opportunity_events;
create trigger set_opportunity_events_updated_at
before update on public.opportunity_events
for each row
execute function public.set_updated_at();
