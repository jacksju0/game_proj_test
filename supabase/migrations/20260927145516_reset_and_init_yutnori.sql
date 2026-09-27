-- 윷놀이 게임 초기 스키마 (기존 프로젝트 내용 삭제 후 새로 구성)
drop table if exists public.guestbook cascade;

-- ===== profiles: 이름 / 아이디 + 총 게임 수, 승/패, 잔여 아이템, 잔여 포인트 =====
-- 비밀번호는 Supabase Auth(auth.users)에 해시로 저장된다.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{4,16}$'),
  name text not null check (char_length(name) between 1 and 20),
  total_games int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  points int not null default 0 check (points >= 0),
  item_extra_throw int not null default 0 check (item_extra_throw >= 0),
  item_revive int not null default 0 check (item_revive >= 0),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles for select to authenticated using (id = (select auth.uid()));

-- ===== rooms =====
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  mode text not null check (mode in ('pvp','pvc')),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','playing')),
  state jsonb,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rooms enable row level security;
create policy "rooms: read" on public.rooms for select to authenticated using (true);

create table public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  name text not null,
  seat int not null check (seat in (0,1)),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);
create index room_players_user_idx on public.room_players(user_id);
alter table public.room_players enable row level security;
create policy "room_players: read" on public.room_players for select to authenticated using (true);

create or replace function public.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.room_players where room_id = p_room and user_id = (select auth.uid()));
$$;
revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

-- ===== chat =====
create table public.chat_messages (
  id bigint generated always as identity primary key,
  channel text not null,                 -- 'lobby' | 'room:<uuid>'
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  name text not null,
  content text not null,
  filtered boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_channel_idx on public.chat_messages(channel, id desc);
create index chat_room_idx on public.chat_messages(room_id);
create index chat_user_idx on public.chat_messages(user_id);
alter table public.chat_messages enable row level security;
-- 대기실 채팅은 모든 회원, 방 채팅은 그 방 참가자만 읽을 수 있다
create policy "chat: read lobby or own room" on public.chat_messages for select to authenticated
  using (room_id is null or public.is_room_member(room_id));

-- ===== payments (토스페이먼츠 테스트 결제) =====
create table public.payments (
  order_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount int not null check (amount > 0),
  order_name text not null,
  status text not null default 'READY' check (status in ('READY','DONE','FAILED')),
  payment_key text,
  method text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_user_idx on public.payments(user_id, created_at desc);
alter table public.payments enable row level security;
create policy "payments: read own" on public.payments for select to authenticated using (user_id = (select auth.uid()));

-- ===== item shop (points -> items) =====
create or replace function public.buy_item(p_item text, p_qty int)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_price int;
  v_row public.profiles;
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다.'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then raise exception '수량이 올바르지 않습니다.'; end if;
  v_price := case p_item when 'extra_throw' then 500 when 'revive' then 1000 else null end;
  if v_price is null then raise exception '존재하지 않는 아이템입니다.'; end if;

  update public.profiles set
    points = points - v_price * p_qty,
    item_extra_throw = item_extra_throw + case when p_item = 'extra_throw' then p_qty else 0 end,
    item_revive = item_revive + case when p_item = 'revive' then p_qty else 0 end
  where id = (select auth.uid()) and points >= v_price * p_qty
  returning * into v_row;

  if v_row.id is null then raise exception '포인트가 부족합니다.'; end if;
  return v_row;
end $$;
revoke all on function public.buy_item(text, int) from public, anon;
grant execute on function public.buy_item(text, int) to authenticated;

-- ===== Edge Function(service_role) 전용 헬퍼 =====
create or replace function public.credit_points(p_user uuid, p_amount int)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set points = points + p_amount where id = p_user;
$$;
revoke all on function public.credit_points(uuid, int) from public, anon, authenticated;

create or replace function public.consume_item(p_user uuid, p_item text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_item = 'extra_throw' then
    update public.profiles set item_extra_throw = item_extra_throw - 1 where id = p_user and item_extra_throw > 0;
  elsif p_item = 'revive' then
    update public.profiles set item_revive = item_revive - 1 where id = p_user and item_revive > 0;
  else return false; end if;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.consume_item(uuid, text) from public, anon, authenticated;

create or replace function public.record_result(p_user uuid, p_win boolean)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set total_games = total_games + 1,
    wins = wins + case when p_win then 1 else 0 end,
    losses = losses + case when p_win then 0 else 1 end
  where id = p_user;
$$;
revoke all on function public.record_result(uuid, boolean) from public, anon, authenticated;

-- realtime
alter publication supabase_realtime add table public.rooms, public.room_players, public.chat_messages, public.profiles;
