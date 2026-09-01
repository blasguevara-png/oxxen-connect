-- S3.4 atomic-order regression probe.
-- Run ONLY against an isolated/staging database after the S3.4 migration, or
-- during an explicitly authorized production rollout after encrypted backup.
-- The outer transaction always rolls back synthetic rows.
--
-- The probe reuses an existing OWNER identity only for transaction-local JWT
-- claims. It does not create, update or delete auth users/admins.

begin;

do $$
declare
  v_owner uuid;
  v_customer uuid := gen_random_uuid();
  v_orders_before bigint;
  v_items_before bigint;
  v_orders_after bigint;
  v_items_after bigint;
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
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'aal', 'aal2'
    )::text,
    true
  );

  insert into public.oxxen_connect_customers(id, business_name, status)
  values (v_customer, 'S3.4 TRANSACTION PROBE', 'active');

  select count(*) into v_orders_before
  from public.oxxen_connect_orders
  where customer_id = v_customer;

  select count(*) into v_items_before
  from public.oxxen_connect_order_items i
  join public.oxxen_connect_orders o on o.id = i.order_id
  where o.customer_id = v_customer;

  begin
    perform public.oxxen_connect_create_order_with_items(
      v_customer,
      '[{"item_type":"nfc_card","description":"invalid rollback probe","quantity":0,"unit_price":10,"card_id":null}]'::jsonb,
      0,
      'S3.4 rollback-only test',
      'PEN'
    );
    raise exception 'TEST FAILED: invalid item unexpectedly created an order';
  exception
    when sqlstate '22023' then
      null; -- expected validation failure; function call subtransaction is rolled back.
  end;

  select count(*) into v_orders_after
  from public.oxxen_connect_orders
  where customer_id = v_customer;

  select count(*) into v_items_after
  from public.oxxen_connect_order_items i
  join public.oxxen_connect_orders o on o.id = i.order_id
  where o.customer_id = v_customer;

  if v_orders_after <> v_orders_before or v_items_after <> v_items_before then
    raise exception 'TEST FAILED: partial order/item rows survived invalid atomic call';
  end if;

  if v_orders_after <> 0 or v_items_after <> 0 then
    raise exception 'TEST FAILED: unexpected synthetic order rows exist';
  end if;

  raise notice 'S3.4 atomic rollback OK: orders %, items %', v_orders_after, v_items_after;
end;
$$;

rollback;
