create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.clients
  alter column email drop not null;

alter table public.clients
  add column if not exists social_networks text;

alter table public.opportunities
  add column if not exists seller_id uuid references public.sellers(id) on delete restrict;

insert into public.sellers (name)
select distinct trim(o.owner)
from public.opportunities o
where coalesce(trim(o.owner), '') <> ''
  and not exists (
    select 1
    from public.sellers s
    where lower(s.name) = lower(trim(o.owner))
  );

update public.opportunities o
set seller_id = s.id
from public.sellers s
where o.seller_id is null
  and lower(s.name) = lower(trim(o.owner));

create index if not exists idx_sellers_name on public.sellers(name);
create index if not exists idx_opportunities_seller_id on public.opportunities(seller_id);

drop trigger if exists set_sellers_updated_at on public.sellers;
create trigger set_sellers_updated_at
before update on public.sellers
for each row
execute function public.set_updated_at();
