-- S3.5 transactional order-update regression probe.
-- Run ONLY after the S3.5 migration on staging, or during an explicitly
-- authorized production rollout after a validated encrypted backup.
-- Synthetic rows are enclosed in one outer transaction and always ROLLBACK.

begin;

do $$
declare
  v_owner uuid;
  v_customer_a uuid := gen_random_uuid();
  v_customer_b uuid := gen_random_uuid();
  v_card_b uuid;
  v_order_a uuid;
  v_order_b uuid;
  v_item_a uuid;
  v_item_b uuid;
  v_order_updated_at timestamptz;
  v_notes_before text;
  v_quantity_before integer;
  v_card_before uuid;
begin
  select user_id into v_owner
  from public.oxxen_connect_admins
  where role = 'OWNER'
  order by created_at
  limit 1;

  if v_owner is null then
    raise exception 'TEST BLOCKED: no OWNER admin exists';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated', 'aal', 'aal2')::text,
    true
  );

  insert into public.oxxen_connect_customers(id, business_name, status)
  values
    (v_customer_a, 'S3.5 PROBE CUSTOMER A', 'active'),
    (v_customer_b, 'S3.5 PROBE CUSTOMER B', 'active');

  insert into public.oxxen_connect_cards(slug, full_name, customer_id)
  values ('s35-probe-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'S3.5 PROBE CARD B', v_customer_b)
  returning id into v_card_b;

  v_order_a := public.oxxen_connect_create_order_with_items(
    v_customer_a,
    '[{"item_type":"nfc_card","description":"probe A","quantity":1,"unit_price":10,"card_id":null}]'::jsonb,
    0,
    'before',
    'PEN'
  );

  v_order_b := public.oxxen_connect_create_order_with_items(
    v_customer_a,
    '[{"item_type":"nfc_card","description":"probe B","quantity":1,"unit_price":20,"card_id":null}]'::jsonb,
    0,
    'other order',
    'PEN'
  );

  select id, quantity, card_id into v_item_a, v_quantity_before, v_card_before
  from public.oxxen_connect_order_items where order_id = v_order_a limit 1;
  select id into v_item_b from public.oxxen_connect_order_items where order_id = v_order_b limit 1;
  select updated_at, notes into v_order_updated_at, v_notes_before
  from public.oxxen_connect_orders where id = v_order_a;

  -- Atomicity: the first item is a valid mutation; the second item is invalid.
  -- The function call must roll the first mutation back as part of the same call.
  begin
    perform public.oxxen_connect_update_order_with_items(
      v_order_a,
      v_customer_a,
      jsonb_build_array(
        jsonb_build_object('id', v_item_a, 'item_type', 'nfc_card', 'description', 'would-change', 'quantity', 2, 'unit_price', 10, 'card_id', null),
        jsonb_build_object('id', null, 'item_type', 'nfc_card', 'description', 'invalid', 'quantity', 0, 'unit_price', 10, 'card_id', null)
      ),
      0, 'would-change', 'PEN', 'draft', 'pending', v_order_updated_at
    );
    raise exception 'TEST FAILED: invalid mixed update unexpectedly succeeded';
  exception when sqlstate '22023' then
    null;
  end;

  if (select notes from public.oxxen_connect_orders where id = v_order_a) is distinct from v_notes_before then
    raise exception 'TEST FAILED: order notes partially changed after invalid update';
  end if;
  if (select quantity from public.oxxen_connect_order_items where id = v_item_a) is distinct from v_quantity_before then
    raise exception 'TEST FAILED: valid item mutation survived failed atomic update';
  end if;

  -- Cross-customer Card must be rejected with zero item change.
  select updated_at into v_order_updated_at from public.oxxen_connect_orders where id = v_order_a;
  begin
    perform public.oxxen_connect_update_order_with_items(
      v_order_a, v_customer_a,
      jsonb_build_array(jsonb_build_object('id', v_item_a, 'item_type', 'nfc_card', 'description', 'probe A', 'quantity', 1, 'unit_price', 10, 'card_id', v_card_b)),
      0, 'before', 'PEN', 'draft', 'pending', v_order_updated_at
    );
    raise exception 'TEST FAILED: cross-customer card unexpectedly accepted';
  exception when sqlstate '23514' then
    null;
  end;
  if (select card_id from public.oxxen_connect_order_items where id = v_item_a) is distinct from v_card_before then
    raise exception 'TEST FAILED: cross-customer card assignment partially persisted';
  end if;

  -- An item ID belonging to another Order must be rejected.
  select updated_at into v_order_updated_at from public.oxxen_connect_orders where id = v_order_a;
  begin
    perform public.oxxen_connect_update_order_with_items(
      v_order_a, v_customer_a,
      jsonb_build_array(jsonb_build_object('id', v_item_b, 'item_type', 'nfc_card', 'description', 'foreign item', 'quantity', 1, 'unit_price', 20, 'card_id', null)),
      0, 'before', 'PEN', 'draft', 'pending', v_order_updated_at
    );
    raise exception 'TEST FAILED: foreign order item unexpectedly accepted';
  exception when sqlstate '23514' then
    null;
  end;

  -- Invalid discount must be rejected.
  select updated_at into v_order_updated_at from public.oxxen_connect_orders where id = v_order_a;
  begin
    perform public.oxxen_connect_update_order_with_items(
      v_order_a, v_customer_a,
      jsonb_build_array(jsonb_build_object('id', v_item_a, 'item_type', 'nfc_card', 'description', 'probe A', 'quantity', 1, 'unit_price', 10, 'card_id', null)),
      999, 'before', 'PEN', 'draft', 'pending', v_order_updated_at
    );
    raise exception 'TEST FAILED: discount above subtotal unexpectedly accepted';
  exception when sqlstate '22023' then
    null;
  end;

  -- OWNER AAL1 must fail closed.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );
  select updated_at into v_order_updated_at from public.oxxen_connect_orders where id = v_order_a;
  begin
    perform public.oxxen_connect_update_order_with_items(
      v_order_a, v_customer_a,
      jsonb_build_array(jsonb_build_object('id', v_item_a, 'item_type', 'nfc_card', 'description', 'probe A', 'quantity', 1, 'unit_price', 10, 'card_id', null)),
      0, 'before', 'PEN', 'draft', 'pending', v_order_updated_at
    );
    raise exception 'TEST FAILED: OWNER AAL1 unexpectedly allowed';
  exception when sqlstate '42501' then
    null;
  end;

  -- A signed-in identity with no admin row must fail closed.
  -- auth.uid() reads request.jwt.claim.sub, so update both legacy sub and claims.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009999', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000009999","role":"authenticated","aal":"aal2"}',
    true
  );
  begin
    perform public.oxxen_connect_update_order_with_items(
      v_order_a, v_customer_a,
      jsonb_build_array(jsonb_build_object('id', v_item_a, 'item_type', 'nfc_card', 'description', 'probe A', 'quantity', 1, 'unit_price', 10, 'card_id', null)),
      0, 'before', 'PEN', 'draft', 'pending', v_order_updated_at
    );
    raise exception 'TEST FAILED: unaffiliated authenticated identity unexpectedly allowed';
  exception when sqlstate '42501' then
    null;
  end;

  if has_function_privilege('anon', 'public.oxxen_connect_update_order_with_items(uuid,uuid,jsonb,numeric,text,text,text,text,timestamptz)', 'EXECUTE') then
    raise exception 'TEST FAILED: anon can execute S3.5 update RPC';
  end if;

  raise notice 'S3.5 atomic/security probe OK';
end;
$$;

rollback;
