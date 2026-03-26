create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'opportunity_stage'
  ) then
    create type opportunity_stage as enum (
      'lead',
      'qualified',
      'proposal',
      'negotiation',
      'won',
      'lost'
    );
  end if;
end $$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null,
  email text not null,
  phone text,
  position text,
  source text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  stage opportunity_stage not null default 'lead',
  amount numeric(12, 2) not null default 0,
  expected_close_date date,
  owner text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_clients_company on public.clients(company);
create index if not exists idx_clients_email on public.clients(email);
create index if not exists idx_opportunities_client_id on public.opportunities(client_id);
create index if not exists idx_opportunities_stage on public.opportunities(stage);
create index if not exists idx_opportunities_expected_close_date on public.opportunities(expected_close_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

drop trigger if exists set_opportunities_updated_at on public.opportunities;
create trigger set_opportunities_updated_at
before update on public.opportunities
for each row
execute function public.set_updated_at();

insert into public.clients (name, company, email, phone, position, source, notes)
values
  (
    'Mariana Torres',
    'Logistica Atlas',
    'mariana@atlas.com',
    '+54 11 4000 1234',
    'Gerente Comercial',
    'Referido',
    'Busca ordenar el seguimiento de leads del equipo.'
  ),
  (
    'Santiago Ruiz',
    'Industrias Norte',
    'sruiz@norte.com',
    '+54 351 555 9898',
    'Director General',
    'LinkedIn',
    'Interesado en tableros de pipeline y trazabilidad.'
  )
on conflict do nothing;

insert into public.opportunities (client_id, title, stage, amount, expected_close_date, owner, notes)
select
  c.id,
  seed.title,
  seed.stage::opportunity_stage,
  seed.amount,
  seed.expected_close_date,
  seed.owner,
  seed.notes
from (
  values
    (
      'Logistica Atlas',
      'CRM para equipo de ventas',
      'proposal',
      4800.00,
      date '2026-04-20',
      'Carla',
      'Enviar propuesta final con onboarding incluido.'
    ),
    (
      'Industrias Norte',
      'Automatizacion de seguimiento',
      'negotiation',
      9200.00,
      date '2026-04-10',
      'Diego',
      'Pendiente validacion del alcance tecnico.'
    )
) as seed(company, title, stage, amount, expected_close_date, owner, notes)
join public.clients c on c.company = seed.company
where not exists (
  select 1
  from public.opportunities o
  where o.title = seed.title
);

