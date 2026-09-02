-- Rollback-only probe for 20260902_fix_nfc_overreservation.sql.
-- Safe to run after the migration: creates no persistent rows and does not consume
-- production sequences because explicit high test numbers are used.

begin;

do $probe$
declare
  v_owner uuid;
  v_customer uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_item_a uuid := gen_random_uuid();
  v_item_b uuid := gen_random_uuid();
  v_item_c uuid := gen_random_uuid();
  v_asset_base integer;
  v_reserved integer;
  v_fourth_rejected boolean := false;
  v_specific_overfill_rejected boolean := false;
begin
  select a.user_id into strict v_owner
  from public.oxxen_connect_admins a
  where a.role = 'OWNER'
  order by a.created_at
  limit 1;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated', 'aal', 'aal2')::text, true);

  select coalesce(max(asset_number), 0) + 100000 into v_asset_base
  from public.oxxen_connect_nfc_assets;

  insert into public.oxxen_connect_customers(
    id, customer_number, business_name, contact_name, status, notes
  ) values (
    v_customer, 990001, 'Probe NFC overreservation', 'Rollback only', 'active', 'ROLLBACK ONLY'
  );

  insert into public.oxxen_connect_orders(
    id, order_number, customer_id, status, payment_status, currency, discount, notes, created_by
  ) values (
    v_order, 990001, v_customer, 'draft', 'pending', 'PEN', 0, 'ROLLBACK ONLY', v_owner
  );

  insert into public.oxxen_connect_order_items(
    id, order_id, item_type, description, quantity, unit_price
  ) values
    (v_item_a, v_order, 'nfc_card', 'Probe A', 1, 0),
    (v_item_b, v_order, 'nfc_card', 'Probe B', 1, 0),
    (v_item_c, v_order, 'nfc_card', 'Probe C', 1, 0);

  insert into public.oxxen_connect_nfc_assets(
    asset_number, chip_type, status, batch_code, notes
  ) values
    (v_asset_base + 1, 'NTAG213', 'available', 'ROLLBACK-OVERRESERVE', 'ROLLBACK ONLY'),
    (v_asset_base + 2, 'NTAG213', 'available', 'ROLLBACK-OVERRESERVE', 'ROLLBACK ONLY'),
    (v_asset_base + 3, 'NTAG213', 'available', 'ROLLBACK-OVERRESERVE', 'ROLLBACK ONLY'),
    (v_asset_base + 4, 'NTAG213', 'available', 'ROLLBACK-OVERRESERVE', 'ROLLBACK ONLY');

  perform * from public.oxxen_connect_reserve_nfc_assets(v_order, 3, null);

  select count(*) into v_reserved
  from public.oxxen_connect_nfc_assets a
  where a.order_id = v_order
    and a.status = 'reserved';

  if v_reserved <> 3 then
    raise exception 'PROBE FAIL: expected 3 reserved assets, got %', v_reserved;
  end if;

  if exists (
    select 1 from public.oxxen_connect_nfc_assets a
    where a.order_id = v_order
      and a.status = 'reserved'
      and a.order_item_id is null
  ) then
    raise exception 'PROBE FAIL: automatic reservation left Order Item = NULL';
  end if;

  if (select count(distinct a.order_item_id) from public.oxxen_connect_nfc_assets a where a.order_id = v_order and a.status = 'reserved') <> 3 then
    raise exception 'PROBE FAIL: expected one reservation per NFC order item';
  end if;

  begin
    perform * from public.oxxen_connect_reserve_nfc_assets(v_order, 1, null);
  exception when check_violation then
    v_fourth_rejected := true;
  end;

  if not v_fourth_rejected then
    raise exception 'PROBE FAIL: fourth NFC reservation was not rejected';
  end if;

  begin
    perform * from public.oxxen_connect_reserve_nfc_assets(v_order, 1, v_item_a);
  exception when check_violation then
    v_specific_overfill_rejected := true;
  end;

  if not v_specific_overfill_rejected then
    raise exception 'PROBE FAIL: overfilling a specific Order Item was not rejected';
  end if;

  if (select count(*) from public.oxxen_connect_nfc_assets a where a.batch_code = 'ROLLBACK-OVERRESERVE' and a.status = 'available') <> 1 then
    raise exception 'PROBE FAIL: expected exactly one unused available NFC after covering 3/3';
  end if;
end
$probe$;

rollback;
