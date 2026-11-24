-- RL Championship schema. Idempotent: safe to run on every deploy.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  rl_nickname text not null,
  rl_id text not null,
  platform text not null check (platform in ('pc', 'playstation', 'xbox')),
  contact text not null default '',
  role text not null default 'participant' check (role in ('superadmin', 'admin', 'referee', 'participant')),
  created_at timestamptz not null default now()
);
-- One Rocket League account = one person on the platform.
create unique index if not exists users_rl_account_uniq on users (platform, lower(rl_id));
create unique index if not exists users_nickname_uniq on users (lower(rl_nickname));

create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('league', 'cup')),
  mode text not null check (mode in ('1v1', '2v2')),
  format text not null check (format in ('groups_knockout', 'knockout', 'round_robin')),
  status text not null default 'draft' check (status in ('draft', 'registration', 'closed', 'in_progress', 'playoffs', 'finished')),
  season text not null default '',
  description text not null default '',
  capacity int not null default 32 check (capacity between 2 and 256),
  registration_deadline timestamptz,
  start_at timestamptz,
  timezone text not null default 'Asia/Tashkent',
  region text not null default 'Europe',
  platforms text[] not null default '{pc,playstation,xbox}',
  require_approval boolean not null default false,
  checkin_required boolean not null default false,
  checkin_open boolean not null default false,
  group_count int not null default 4 check (group_count between 1 and 16),
  qualifiers_per_group int not null default 2 check (qualifiers_per_group between 1 and 16),
  seeded_draw boolean not null default false,
  double_round_robin boolean not null default false,
  third_place boolean not null default true,
  group_best_of int not null default 3,
  playoff_best_of int not null default 5,
  final_best_of int not null default 7,
  points_win int not null default 3,
  points_loss int not null default 0,
  tiebreakers text[] not null default '{points,goal_diff,goals_for,head_to_head}',
  draw_seed bigint,
  draw_state text not null default 'none' check (draw_state in ('none', 'preview', 'published')),
  draw_published_at timestamptz,
  playoffs_generated boolean not null default false,
  prize_currency text not null default 'USD',
  prize_pool numeric(12, 2),
  prize_notes text not null default '',
  payout_status text not null default 'not_configured' check (payout_status in ('not_configured', 'pending', 'partially_paid', 'paid')),
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  number int not null,
  name text not null,
  captain_id uuid not null references users(id) on delete cascade,
  status text not null check (status in ('incomplete', 'pending', 'confirmed', 'waitlist', 'cancelled', 'rejected')),
  invite_code text unique,
  seed int,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (competition_id, number)
);
create unique index if not exists entries_name_active_uniq on entries (competition_id, lower(name))
  where status not in ('cancelled', 'rejected');

create table if not exists entry_members (
  entry_id uuid not null references entries(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  competition_id uuid not null references competitions(id) on delete cascade,
  is_captain boolean not null default false,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);
-- A player can be in only one active entry per competition.
create unique index if not exists entry_members_one_per_comp on entry_members (competition_id, user_id) where active;

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  name text not null,
  position int not null
);

create table if not exists group_entries (
  group_id uuid not null references groups(id) on delete cascade,
  entry_id uuid not null references entries(id) on delete cascade,
  competition_id uuid not null references competitions(id) on delete cascade,
  primary key (group_id, entry_id),
  unique (competition_id, entry_id)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  number int not null,
  stage text not null check (stage in ('group', 'league', 'knockout', 'third_place')),
  group_id uuid references groups(id) on delete cascade,
  round int not null,
  bracket_index int,
  bracket_key text,
  home_entry_id uuid references entries(id),
  away_entry_id uuid references entries(id),
  best_of int not null default 1,
  scheduled_at timestamptz,
  status text not null default 'upcoming' check (status in ('upcoming', 'ready', 'live', 'completed', 'under_review', 'postponed')),
  games jsonb,
  home_wins int,
  away_wins int,
  home_goals int,
  away_goals int,
  winner_entry_id uuid references entries(id),
  is_bye boolean not null default false,
  forfeit boolean not null default false,
  next_match_id uuid references matches(id) on delete set null,
  next_side text check (next_side in ('home', 'away')),
  loser_next_match_id uuid references matches(id) on delete set null,
  loser_next_side text check (loser_next_side in ('home', 'away')),
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, number),
  check (home_entry_id is null or away_entry_id is null or home_entry_id <> away_entry_id)
);
create index if not exists matches_comp_idx on matches (competition_id, stage, round);

create table if not exists match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  entry_id uuid not null references entries(id) on delete cascade,
  reporter_id uuid not null references users(id) on delete cascade,
  games jsonb not null,
  proof_url text not null default '',
  comment text not null default '',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'disputed', 'superseded')),
  responded_by uuid references users(id) on delete set null,
  response_comment text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists match_events (
  id bigserial primary key,
  match_id uuid not null references matches(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists prizes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  place int,
  title text not null,
  amount numeric(12, 2),
  description text not null default '',
  recipient_entry_id uuid references entries(id) on delete set null,
  paid boolean not null default false,
  position int not null default 0
);

create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  body text not null,
  position int not null default 0,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  author_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null default '',
  link text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists activity_log (
  id bigserial primary key,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value text not null
);

-- i18n: notifications and match history are stored as Russian templates + params
alter table notifications add column if not exists params jsonb not null default '{}';
alter table match_events add column if not exists params jsonb not null default '{}';

-- Discord integration
alter table users alter column password_hash drop not null;
alter table users add column if not exists discord_id text;
alter table users add column if not exists discord_username text;
alter table users add column if not exists discord_dm boolean not null default true;
alter table users add column if not exists locale text not null default 'ru';
create unique index if not exists users_discord_uniq on users (discord_id) where discord_id is not null;

create table if not exists discord_outbox (
  id bigserial primary key,
  kind text not null check (kind in ('channel', 'dm', 'role')),
  target text not null,
  payload jsonb not null,
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists discord_outbox_pending on discord_outbox (created_at) where sent_at is null;

-- ELO rating. A player's rating in a mode = 1000 + sum of deltas, so deleting
-- a competition (cascade through matches) cleanly takes its rating changes away.
alter table matches add column if not exists completed_at timestamptz;
update matches set completed_at = updated_at where status = 'completed' and completed_at is null;
create table if not exists rating_changes (
  id bigserial primary key,
  match_id uuid not null references matches(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  mode text not null check (mode in ('1v1', '2v2')),
  entry_id uuid not null references entries(id) on delete cascade,
  before int not null,
  delta int not null,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);
create index if not exists rating_changes_user on rating_changes (user_id, mode, created_at);

-- Champions and titles (Discord roles, hall of fame).
alter table competitions add column if not exists champion_entry_id uuid references entries(id) on delete set null;
alter table competitions add column if not exists finished_at timestamptz;
update competitions c set finished_at = c.updated_at where c.status = 'finished' and c.finished_at is null;
update competitions c set champion_entry_id = p.recipient_entry_id
  from prizes p where p.competition_id = c.id and p.place = 1 and c.status = 'finished' and c.champion_entry_id is null and p.recipient_entry_id is not null;
-- Role keys the bot has given each linked user, so syncs only send differences.
alter table users add column if not exists discord_roles text[] not null default '{}';
alter table discord_outbox drop constraint if exists discord_outbox_kind_check;
alter table discord_outbox add constraint discord_outbox_kind_check check (kind in ('channel', 'dm', 'role', 'board'));

-- Match time negotiation, check-in and automatic forfeits.
alter table competitions add column if not exists noshow_minutes int not null default 15;
alter table competitions add column if not exists deadline_forfeit boolean not null default true;
alter table matches add column if not exists play_by timestamptz;
alter table matches add column if not exists time_confirmed boolean not null default false;
alter table matches add column if not exists home_checkin_at timestamptz;
alter table matches add column if not exists away_checkin_at timestamptz;
alter table matches add column if not exists remind60_at timestamptz;
alter table matches add column if not exists remind10_at timestamptz;
alter table matches add column if not exists auto_handled_at timestamptz;
create table if not exists match_proposals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  entry_id uuid not null references entries(id) on delete cascade,
  proposed_by uuid references users(id) on delete set null,
  at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  responded_by uuid references users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists match_proposals_match on match_proposals (match_id, status);
