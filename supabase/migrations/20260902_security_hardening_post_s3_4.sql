-- OXXEN Connect — post-S3.4 security hardening
-- Defense-in-depth only: reduce authenticated SQL privileges to the operations
-- actually used by the application. This migration does NOT modify rows,
-- public_id, slugs, aliases, QR/NFC destinations, RLS semantics or RBAC.

-- Cards are administered by direct SELECT/INSERT/UPDATE. Hard delete is not an
-- application operation; archive/restore are UPDATEs.
revoke delete, truncate, references, trigger
  on table public.oxxen_connect_cards
  from authenticated;

-- Alias history is append-only from the card slug synchronization trigger.
-- The frontend only reads aliases to prevent historical alias reuse.
revoke insert, update, delete, truncate, references, trigger
  on table public.oxxen_connect_card_aliases
  from authenticated;

-- Public analytics writes go through record_public_event(); administrative UI
-- consumes aggregates/read access only.
revoke insert, update, delete, truncate, references, trigger
  on table public.oxxen_connect_analytics_events
  from authenticated;

-- Audit rows are written by trusted triggers/RPCs. Admin UI is read-only.
revoke truncate, references, trigger
  on table public.oxxen_connect_audit_logs
  from authenticated;

-- Orders and NFC asset numbers are generated inside SECURITY DEFINER RPCs.
-- Direct authenticated callers do not need sequence USAGE for those flows.
revoke usage on sequence public.oxxen_connect_orders_order_number_seq
  from authenticated;
revoke usage on sequence public.oxxen_connect_nfc_assets_asset_number_seq
  from authenticated;

-- Keep customer sequence USAGE because CustomerEditor inserts customers through
-- the authenticated role and customer_code depends on this sequence.

-- Reassert the intended RPC exposure explicitly. No public/default EXECUTE is
-- allowed on administrative functions; authenticated can invoke them, while the
-- functions themselves continue to enforce admin role and OWNER/AAL2.
revoke all on function public.oxxen_connect_bulk_create_nfc_assets(text,integer,text,text,numeric,text)
  from public, anon;
revoke all on function public.oxxen_connect_reserve_nfc_assets(uuid,integer,uuid)
  from public, anon;
revoke all on function public.oxxen_connect_create_order_with_items(uuid,jsonb,numeric,text,text)
  from public, anon;
revoke all on function public.oxxen_connect_get_operational_dashboard()
  from public, anon;

grant execute on function public.oxxen_connect_bulk_create_nfc_assets(text,integer,text,text,numeric,text)
  to authenticated;
grant execute on function public.oxxen_connect_reserve_nfc_assets(uuid,integer,uuid)
  to authenticated;
grant execute on function public.oxxen_connect_create_order_with_items(uuid,jsonb,numeric,text,text)
  to authenticated;
grant execute on function public.oxxen_connect_get_operational_dashboard()
  to authenticated;

-- Public profile RPCs are intentionally callable by both anonymous visitors and
-- signed-in users. Their result/input surfaces are constrained and their
-- search_path is already locked to ''. Keep this contract explicit.
revoke all on function public.get_public_card(text) from public;
revoke all on function public.get_public_card_status(text) from public;
revoke all on function public.record_public_event(text,text,jsonb,text) from public;

grant execute on function public.get_public_card(text) to anon, authenticated;
grant execute on function public.get_public_card_status(text) to anon, authenticated;
grant execute on function public.record_public_event(text,text,jsonb,text) to anon, authenticated;
