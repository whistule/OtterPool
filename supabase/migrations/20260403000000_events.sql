-- ============================================================
-- OtterPool — Events schema (Phase 1)
-- ============================================================

-- ---------- enums ----------

create type public.member_status as enum (
  'active', 'aspirant', 'lapsed', 'suspended'
);

create type public.progression_level as enum (
  'frog', 'duck', 'otter', 'dolphin', 'selkie'
);

create type public.event_status as enum (
  'draft', 'open', 'full', 'closed', 'cancelled'
);

create type public.signup_status as enum (
  'confirmed', 'pending_review', 'waitlisted', 'declined', 'withdrawn'
);

create type public.approval_mode as enum (
  'auto', 'manual_all'
);

-- ---------- profiles (minimal, extends auth.users) ----------

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  display_name  text,
  level         public.progression_level not null default 'frog',
  status        public.member_status not null default 'aspirant',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- event categories ----------

create table public.event_categories (
  id              serial primary key,
  name            text not null unique,
  default_min_level public.progression_level not null default 'frog',
  default_cost    numeric(6,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now()
);

-- seed the categories from the spec
insert into public.event_categories (name, default_min_level, default_cost, notes) values
  ('Tuesday Evening - Loch Lomond',  'frog', 5,  'Default weekly session'),
  ('Tuesday Evening - All Away',     'frog', 5,  'Away variant, group splitting rules apply'),
  ('Night Paddle',                   'duck', 0,  null),
  ('Pinkston - 1 Pump',             'duck', 0,  'Pre-filled location: Pinkston Watersports Centre'),
  ('Pinkston - 2 Pumps',            'duck', 0,  'Pre-filled location: Pinkston Watersports Centre'),
  ('Pinkston - 3 Pumps',            'duck', 0,  'Pre-filled location: Pinkston Watersports Centre'),
  ('Pool / Loch Sessions',          'frog', 0,  null),
  ('River Trip',                     'duck', 0,  'River grade set separately'),
  ('Sea Kayak - A Trip',            'duck', 0,  null),
  ('Sea Kayak - B Trip',            'duck', 0,  null),
  ('Sea Kayak - C Trip',            'otter', 0, null),
  ('Second Saturday Paddle',        'duck', 0,  'Animal level read from member profile'),
  ('Skills Sessions / MicroSessions','frog', 0,  null),
  ('Training / Qualifications',     'frog', 0,  null);

-- ---------- events ----------

create table public.events (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  category_id       int references public.event_categories(id),
  description       text,
  photo_url         text,
  grade_advertised  text,            -- e.g. 'Sea B', 'G3', 'P2'
  grade_actual      text,            -- set post-event, defaults to advertised
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  location          text,
  meeting_point     text,
  min_level         public.progression_level not null default 'frog',
  max_participants  int,
  approval_mode     public.approval_mode not null default 'auto',
  cost              numeric(6,2) not null default 0,
  status            public.event_status not null default 'draft',
  leader_id         uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_events_starts_at on public.events (starts_at);
create index idx_events_status    on public.events (status);
create index idx_events_leader    on public.events (leader_id);

-- ---------- event sign-ups ----------

create table public.event_signups (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  status      public.signup_status not null default 'pending_review',
  signed_up_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  notes       text,

  unique (event_id, member_id)
);

create index idx_signups_event  on public.event_signups (event_id);
create index idx_signups_member on public.event_signups (member_id);

-- ---------- RLS ----------

alter table public.profiles       enable row level security;
alter table public.event_categories enable row level security;
alter table public.events          enable row level security;
alter table public.event_signups   enable row level security;

-- profiles: anyone authenticated can read, own row editable
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

-- event categories: readable by all authenticated
create policy "Categories are viewable by authenticated users"
  on public.event_categories for select
  to authenticated
  using (true);

-- events: readable by all authenticated, insertable by selkie/dolphin (leaders)
create policy "Events are viewable by authenticated users"
  on public.events for select
  to authenticated
  using (true);

create policy "Leaders can create events"
  on public.events for insert
  to authenticated
  with check (leader_id = auth.uid());

create policy "Leaders can update own events"
  on public.events for update
  to authenticated
  using (leader_id = auth.uid());

-- signups: members see own, leaders see their event's signups
create policy "Members can view own signups"
  on public.event_signups for select
  to authenticated
  using (member_id = auth.uid());

create policy "Leaders can view signups for their events"
  on public.event_signups for select
  to authenticated
  using (
    event_id in (
      select id from public.events where leader_id = auth.uid()
    )
  );

create policy "Members can sign up for events"
  on public.event_signups for insert
  to authenticated
  with check (member_id = auth.uid());

create policy "Leaders can update signups for their events"
  on public.event_signups for update
  to authenticated
  using (
    event_id in (
      select id from public.events where leader_id = auth.uid()
    )
  );

-- ---------- updated_at triggers ----------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------- helper views ----------

-- calendar view: upcoming open events with signup counts
create view public.calendar_events as
select
  e.id,
  e.title,
  c.name as category,
  e.grade_advertised,
  e.starts_at,
  e.ends_at,
  e.location,
  e.min_level,
  e.max_participants,
  e.cost,
  e.status,
  e.leader_id,
  p.display_name as leader_name,
  count(s.id) filter (where s.status = 'confirmed') as confirmed_count
from public.events e
join public.event_categories c on c.id = e.category_id
join public.profiles p on p.id = e.leader_id
left join public.event_signups s on s.event_id = e.id
where e.status in ('open', 'full')
group by e.id, c.name, p.display_name;
