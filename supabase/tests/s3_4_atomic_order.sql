-- S3.4 atomic-order regression probe.
-- Run ONLY against an isolated/staging database after the S3.4 migration, or
-- during the explicitly authorized production rollout after encrypted backup.
-- The outer transaction always rolls back synthetic rows.

begin;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000341', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000341","role":"authenticated","aal":"aal2"}', true);

insert into public.oxxen_connect_admins(user_id, role)
values ('00000000-0000-4000-8000-000000000341', 'OWNER');

insert into public.oxxen_connect_customers(id, business_name, status)
values ('00000000-0000-4000-8000-000000000342', 'S3.4 TRANSACTION PROBE', 'active');

do $$
declare
  v_orders_before bigint;
  v_items_before bigint;
  v_orders_after bigint;
  v_items_after bigint;
begin
  select count(*) into v_orders_before
  from public.oxxen_connect_orders
  where customer_id = '00000000-0000-4000-8000-000000000342';

  select count(*) into v_items_before
  from public.oxxen_connect_order_items i
  join public.oxxen_connect_orders o on o.id = i.order_id
  where o.customer_id = '00000000-0000-4000-8000-000000000342';

  begin
    perform public.oxxen_connect_create_order_with_items(
      '00000000-0000-4000-8000-000000000342',
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
  where customer_id = '00000000-0000-4000-8000-000000000342';

  select count(*) into v_items_after
  from public.oxxen_connect_order_items i
  join public.oxxen_connect_orders o on o.id = i.order_id
  where o.customer_id = '00000000-0000-4000-8000-000000000342';

  if v_orders_after <> v_orders_before or v_items_after <> v_items_before then
    raise exception 'TEST FAILED: partial order/item rows survived invalid atomic call';
  end if;

  raise notice 'S3.4 atomic rollback OK: orders %, items %', v_orders_after, v_items_after;
end;
$$;

rollback;
