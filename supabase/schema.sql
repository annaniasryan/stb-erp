-- =====================================================================
-- Kalender & Fasilitas Taruna Bangsa — database setup for Supabase
-- Run this whole file once in Supabase: SQL Editor → New query → Run.
-- Before running, change the two values in section 0.
-- =====================================================================

-- ---------- 0. EDIT THESE TWO LINES ----------------------------------
-- Your own Google email becomes the first admin.
-- The domain limits sign-in to school accounts (leave '' to allow any Google account).
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  allowed_domain text not null default ''
);
insert into public.settings (id, allowed_domain)
values (1, 'taruna-bangsa.sch.id')                    -- ← your school's email domain
on conflict (id) do update set allowed_domain = excluded.allowed_domain;

create table if not exists public.members (
  email text primary key,
  role  text not null check (role in ('admin','editor','viewer')),
  unit  text check (unit in ('TK','SD','SMP','SMA','YYS')),
  created_at timestamptz not null default now()
);
insert into public.members (email, role)
values ('ryan.insan@taruna-bangsa.sch.id', 'admin')           -- ← first admin
on conflict (email) do update set role = 'admin';

-- ---------- 1. Roles ------------------------------------------------
-- members table wins; otherwise anyone signed in with the school domain is an editor.
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$
  with me as (select lower(coalesce(auth.jwt() ->> 'email', '')) as email)
  select coalesce(
    (select m.role from members m, me where lower(m.email) = me.email),
    (select 'editor' from settings s, me
      where me.email <> ''
        and (s.allowed_domain = '' or me.email like '%@' || lower(s.allowed_domain)))
  );
$$;
grant execute on function public.my_role() to authenticated;

-- What the app asks on sign-in: my role, and my unit if an admin set one.
create or replace function public.my_profile()
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'role', public.my_role(),
    'unit', (select m.unit from members m
              where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))),
    'allowed_domain', (select allowed_domain from settings where id = 1)
  );
$$;
grant execute on function public.my_profile() to authenticated;

-- ---------- 2. Tables -----------------------------------------------
create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  location text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  unit text not null check (unit in ('TK','SD','SMP','SMA','YYS')),
  title text not null check (length(title) between 1 and 120),
  kind text not null default 'kegiatan' check (kind in ('kegiatan','akademik','libur')),
  date date not null,
  end_date date not null,
  all_day boolean not null default false,
  start_time time,
  end_time time,
  facility_id uuid references public.facilities(id) on delete set null,
  needs text not null default '',
  docs boolean not null default false,
  pic text not null default '',
  notes text not null default '',
  source text not null default 'manual',
  created_by uuid default auth.uid(),
  created_by_email text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= date),
  check (all_day or (start_time is not null and end_time is not null and start_time < end_time))
);
create index if not exists events_date_idx on public.events (date);
create index if not exists events_fac_idx on public.events (facility_id);

-- ---------- 3. Stamp who created / edited ----------------------------
create or replace function public.events_stamp()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_email := auth.jwt() ->> 'email';
    new.created_by_name := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name',
                                    auth.jwt() -> 'user_metadata' ->> 'name',
                                    auth.jwt() ->> 'email');
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_by_email := old.created_by_email;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  if new.all_day then new.start_time := null; new.end_time := null; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists events_stamp on public.events;
create trigger events_stamp before insert or update on public.events
for each row execute function public.events_stamp();

-- ---------- 4. No double booking (enforced by the database) ----------
-- Same facility + overlapping dates + overlapping hours = refused.
-- A per-facility lock means two people saving at the same second can't both win.
create or replace function public.events_no_clash()
returns trigger language plpgsql security definer set search_path = public
as $$
declare c record;
begin
  if new.facility_id is null or new.kind = 'libur' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.facility_id::text));
  select e.unit, e.title, e.date, e.end_date, e.all_day, e.start_time, e.end_time, e.pic
    into c
    from events e
   where e.facility_id = new.facility_id
     and e.id <> new.id
     and e.kind <> 'libur'
     and e.date <= new.end_date and new.date <= e.end_date
     and (case when e.all_day then time '00:00' else e.start_time end)
         < (case when new.all_day then time '24:00' else new.end_time end)
     and (case when new.all_day then time '00:00' else new.start_time end)
         < (case when e.all_day then time '24:00' else e.end_time end)
   limit 1;
  if found then
    raise exception 'BENTROK'
      using errcode = '23P01',
            detail = json_build_object('unit', c.unit, 'title', c.title, 'date', c.date,
                       'all_day', c.all_day, 'start', to_char(c.start_time, 'HH24:MI'),
                       'end', to_char(c.end_time, 'HH24:MI'), 'pic', c.pic)::text;
  end if;
  return new;
end $$;
drop trigger if exists events_no_clash on public.events;
create trigger events_no_clash before insert or update on public.events
for each row execute function public.events_no_clash();

-- ---------- 5. Access rules (Row Level Security) ---------------------
alter table public.settings   enable row level security;
alter table public.members    enable row level security;
alter table public.facilities enable row level security;
alter table public.events     enable row level security;

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (public.my_role() is not null);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for update to authenticated using (public.my_role() = 'admin');

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (public.my_role() = 'admin');
drop policy if exists members_admin on public.members;
create policy members_admin on public.members for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists fac_read on public.facilities;
create policy fac_read on public.facilities for select to authenticated using (public.my_role() is not null);
drop policy if exists fac_admin on public.facilities;
create policy fac_admin on public.facilities for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists ev_read on public.events;
create policy ev_read on public.events for select to authenticated using (public.my_role() is not null);
drop policy if exists ev_insert on public.events;
create policy ev_insert on public.events for insert to authenticated
  with check (public.my_role() in ('editor','admin'));
drop policy if exists ev_update on public.events;
create policy ev_update on public.events for update to authenticated
  using (public.my_role() = 'admin' or (public.my_role() = 'editor' and created_by = auth.uid()))
  with check (public.my_role() = 'admin' or (public.my_role() = 'editor' and created_by = auth.uid()));
drop policy if exists ev_delete on public.events;
create policy ev_delete on public.events for delete to authenticated
  using (public.my_role() = 'admin' or (public.my_role() = 'editor' and created_by = auth.uid()));

-- ---------- 6. Live updates ------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.events, public.facilities;
exception when duplicate_object then null; end $$;

-- ---------- 7. First facility ----------------------------------------
insert into public.facilities (name, sort)
select 'Lapangan Basket', 1
where not exists (select 1 from public.facilities);
