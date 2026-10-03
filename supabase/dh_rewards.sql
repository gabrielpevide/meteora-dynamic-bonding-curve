-- Diamond Hands keeper state (Supabase / Postgres). All of it derives from public on-chain data, so reads
-- are public. Writes only go through the dh_* functions, which check the keeper's secret against a stored hash.

create table public.dh_rounds (
  mint text primary key,
  snapshot_at timestamptz not null default now(), -- last accrual
  paid_at timestamptz not null default now(),     -- last fee claim; payouts follow it
  owed bigint not null default 0                  -- lamports claimed from platform fees, not paid out yet
);

create table public.dh_accruals (
  mint text not null,
  owner text not null,
  weight double precision not null default 0, -- tokens above the price × seconds since the owner's last payout
  primary key (mint, owner)
);

create table public.dh_payouts (
  id bigint generated always as identity primary key,
  mint text not null,
  owner text not null,
  lamports bigint not null,
  signature text not null,
  paid_at timestamptz not null default now()
);
create index dh_payouts_mint_owner on public.dh_payouts (mint, owner);

create table public.dh_keeper_auth (hash bytea primary key);

alter table public.dh_rounds enable row level security;
alter table public.dh_accruals enable row level security;
alter table public.dh_payouts enable row level security;
alter table public.dh_keeper_auth enable row level security;
create policy "public read" on public.dh_rounds for select using (true);
create policy "public read" on public.dh_accruals for select using (true);
create policy "public read" on public.dh_payouts for select using (true);

-- Store the SHA-256 of the keeper's secret (the value of KEEPER_DB_SECRET), never the secret itself:
-- insert into public.dh_keeper_auth values (decode('<sha256 hex>', 'hex'));

create function public.dh_check(secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.dh_keeper_auth where hash = extensions.digest(secret, 'sha256')) then
    raise exception 'not the keeper';
  end if;
end $$;

-- p_rows: [{owner, tokens}] = each owner's tokens above the price right now.
create function public.dh_accrue(secret text, p_mint text, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare dt double precision;
begin
  perform public.dh_check(secret);
  -- Capped at 15 minutes so a keeper outage doesn't land as one giant snapshot.
  select least(extract(epoch from now() - snapshot_at), 900) into dt from public.dh_rounds where mint = p_mint for update;
  insert into public.dh_rounds (mint) values (p_mint) on conflict (mint) do update set snapshot_at = now();
  if dt > 0 then
    insert into public.dh_accruals (mint, owner, weight)
    select p_mint, r->>'owner', (r->>'tokens')::double precision * dt from jsonb_array_elements(p_rows) r
    on conflict (mint, owner) do update set weight = public.dh_accruals.weight + excluded.weight;
  end if;
end $$;

create function public.dh_claimed(secret text, p_mint text, p_lamports bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.dh_check(secret);
  update public.dh_rounds set owed = owed + p_lamports, paid_at = now() where mint = p_mint;
end $$;

-- p_rows: [{owner, lamports}] sent in the transaction p_signature.
create function public.dh_paid(secret text, p_mint text, p_signature text, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.dh_check(secret);
  insert into public.dh_payouts (mint, owner, lamports, signature)
  select p_mint, r->>'owner', (r->>'lamports')::bigint, p_signature from jsonb_array_elements(p_rows) r;
  update public.dh_accruals a set weight = 0
  from jsonb_array_elements(p_rows) r where a.mint = p_mint and a.owner = r->>'owner';
  update public.dh_rounds
  set owed = owed - (select coalesce(sum((r->>'lamports')::bigint), 0) from jsonb_array_elements(p_rows) r)
  where mint = p_mint;
end $$;

-- The keeper calls these with the publishable key (anon role).
revoke all on function public.dh_check(text) from public, anon, authenticated;
revoke execute on function public.dh_accrue(text, text, jsonb), public.dh_claimed(text, text, bigint),
  public.dh_paid(text, text, text, jsonb) from public, authenticated;
grant execute on function public.dh_accrue(text, text, jsonb), public.dh_claimed(text, text, bigint),
  public.dh_paid(text, text, text, jsonb) to anon;
