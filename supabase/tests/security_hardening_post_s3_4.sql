-- OXXEN Connect — post-S3.4 hardening database probe
-- Run after the hardening migration on staging, or during an explicitly
-- authorized production rollout after a validated encrypted backup.
-- Read-only assertions plus transaction-local JWT claims; no business rows are
-- created, updated or deleted.

begin;

-- Direct anonymous table access must stay fully closed.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'oxxen_connect_cards',
    'oxxen_connect_card_aliases',
    'oxxen_connect_customers',
    'oxxen_connect_orders',
    'oxxen_connect_order_items',
    'oxxen_connect_nfc_assets',
    'oxxen_connect_analytics_events',
    'oxxen_connect_audit_logs'
  ] loop
    if has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
       or has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
       or has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', v_table), 'DELETE')
       or has_table_privilege('anon', format('public.%I', v_table), 'TRUNCATE') then
      raise exception 'TEST FAILED: anon has direct privilege on %', v_table;
    end if;
  end loop;
end;
$$;

-- Authenticated keeps only the card mutations that the current UI actually uses.
do $$
begin
  if not has_table_privilege('authenticated', 'public.oxxen_connect_cards', 'SELECT')
     or not has_table_privilege('authenticated', 'public.oxxen_connect_cards', 'INSERT')
     or not has_table_privilege('authenticated', 'public.oxxen_connect_cards', 'UPDATE') then
    raise exception 'TEST FAILED: required Cards privileges missing';
  end if;

  if has_table_privilege('authenticated', 'public.oxxen_connect_cards', 'DELETE')
     or has_table_privilege('authenticated', 'public.oxxen_connect_cards', 'TRUNCATE') then
    raise exception 'TEST FAILED: destructive Cards privilege survived';
  end if;

  if not has_table_privilege('authenticated', 'public.oxxen_connect_card_aliases', 'SELECT')
     or has_table_privilege('authenticated', 'public.oxxen_connect_card_aliases', 'INSERT')
     or has_table_privilege('authenticated', 'public.oxxen_connect_card_aliases', 'UPDATE')
     or has_table_privilege('authenticated', 'public.oxxen_connect_card_aliases', 'DELETE')
     or has_table_privilege('authenticated', 'public.oxxen_connect_card_aliases', 'TRUNCATE') then
    raise exception 'TEST FAILED: alias privilege surface is not read-only';
  end if;

  if not has_table_privilege('authenticated', 'public.oxxen_connect_analytics_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.oxxen_connect_analytics_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.oxxen_connect_analytics_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.oxxen_connect_analytics_events', 'DELETE')
     or has_table_privilege('authenticated', 'public.oxxen_connect_analytics_events', 'TRUNCATE') then
    raise exception 'TEST FAILED: analytics privilege surface is not read-only';
  end if;

  if not has_table_privilege('authenticated', 'public.oxxen_connect_audit_logs', 'SELECT')
     or has_table_privilege('authenticated', 'public.oxxen_connect_audit_logs', 'TRUNCATE') then
    raise exception 'TEST FAILED: audit privilege surface is not read-only';
  end if;
end;
$$;

-- Public RPCs intentionally remain executable; admin RPCs stay closed to anon.
do $$
begin
  if not has_function_privilege('anon', 'public.get_public_card(text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.get_public_card_status(text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.record_public_event(text,text,jsonb,text)', 'EXECUTE') then
    raise exception 'TEST FAILED: required public RPC access missing';
  end if;

  if has_function_privilege('anon', 'public.oxxen_connect_bulk_create_nfc_assets(text,integer,text,text,numeric,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.oxxen_connect_reserve_nfc_assets(uuid,integer,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.oxxen_connect_create_order_with_items(uuid,jsonb,numeric,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.oxxen_connect_get_operational_dashboard()', 'EXECUTE') then
    raise exception 'TEST FAILED: anon can execute an administrative RPC';
  end if;
end;
$$;

-- Unaffiliated authenticated user must enumerate zero operational rows.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009999","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.oxxen_connect_cards) <> 0
     or (select count(*) from public.oxxen_connect_card_aliases) <> 0
     or (select count(*) from public.oxxen_connect_customers) <> 0
     or (select count(*) from public.oxxen_connect_orders) <> 0
     or (select count(*) from public.oxxen_connect_order_items) <> 0
     or (select count(*) from public.oxxen_connect_nfc_assets) <> 0
     or (select count(*) from public.oxxen_connect_analytics_events) <> 0
     or (select count(*) from public.oxxen_connect_audit_logs) <> 0 then
    raise exception 'TEST FAILED: unaffiliated authenticated user can enumerate operational rows';
  end if;
end;
$$;

reset role;
rollback;
