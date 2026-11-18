-- Cap Budget : synchronisation entre appareils.
-- Un « coffre » par utilisateur : l'état complet de l'application (JSON, chiffré ou non côté client).
create table public.vaults (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1,
  device text,
  updated_at timestamptz not null default now()
);

comment on table public.vaults is 'Cap Budget : état synchronisé de chaque utilisateur.';

alter table public.vaults enable row level security;

create policy "vaults_select_own" on public.vaults
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "vaults_insert_own" on public.vaults
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "vaults_update_own" on public.vaults
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "vaults_delete_own" on public.vaults
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Écriture atomique avec contrôle de concurrence optimiste :
-- l'écriture n'aboutit que si la révision distante est celle sur laquelle le client s'est basé.
create or replace function public.push_vault(p_payload jsonb, p_base_revision bigint, p_device text)
returns table (ok boolean, revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select v.revision into v_current from public.vaults v where v.user_id = v_uid for update;

  if v_current is null then
    if p_base_revision <> 0 then
      return query select false, 0::bigint, null::timestamptz;
      return;
    end if;
    insert into public.vaults (user_id, payload, revision, device)
      values (v_uid, p_payload, 1, p_device);
    return query select true, 1::bigint, now();
    return;
  end if;

  if v_current <> p_base_revision then
    return query select false, v_current, null::timestamptz;
    return;
  end if;

  update public.vaults v
     set payload = p_payload, revision = v_current + 1, device = p_device, updated_at = now()
   where v.user_id = v_uid;
  return query select true, v_current + 1, now();
end;
$$;

revoke all on function public.push_vault(jsonb, bigint, text) from public, anon;
grant execute on function public.push_vault(jsonb, bigint, text) to authenticated;
grant select, insert, update, delete on public.vaults to authenticated;
