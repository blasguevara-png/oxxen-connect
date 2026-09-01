-- OXXEN Connect — Sprint 3.4: Operational Closure
-- Additive migration only. It MUST NOT mutate existing public_id, slugs, aliases,
-- public QR/NFC destinations, public RPC resolution, or legacy redirects.

-- -----------------------------------------------------------------------------
-- Customer audit trail
-- -----------------------------------------------------------------------------
create or replace function public.oxxen_connect_audit_customer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'customer.created';
  elsif old.status is distinct from new.status then
    v_action := 'customer.status_changed';
  elsif old.business_name is distinct from new.business_name
     or old.contact_name is distinct from new.contact_name
     or old.email is distinct from new.email
     or old.phone is distinct from new.phone
     or old.whatsapp is distinct from new.whatsapp
     or old.document_type is distinct from new.document_type
     or old.document_number is distinct from new.document_number
     or old.address is distinct from new.address
     or old.notes is distinct from new.notes then
    v_action := 'customer.updated';
  else
    return new;
  end if;

  insert into public.oxxen_connect_audit_logs(
    admin_id, action, entity_type, entity_id, old_value, new_value, metadata
  ) values (
    auth.uid(),
    v_action,
    'customer',
    new.id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    jsonb_build_object('customer_code', new.customer_code)
  );
  return new;
end;
$$;

revoke all on function public.oxxen_connect_audit_customer_change() from public, anon, authenticated;

drop trigger if exists trg_oxxen_connect_audit_customer_change on public.oxxen_connect_customers;
create trigger trg_oxxen_connect_audit_customer_change
after insert or update on public.oxxen_connect_customers
for each row execute function public.oxxen_connect_audit_customer_change();

-- -----------------------------------------------------------------------------
-- Commercial relation consistency
-- Legacy cards with customer_id IS NULL remain valid by design.
-- -----------------------------------------------------------------------------
create or replace function public.oxxen_connect_validate_order_item_card_customer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_customer uuid;
  v_card_customer uuid;
begin
  if new.card_id is null then
    return new;
  end if;

  select o.customer_id into v_order_customer
  from public.oxxen_connect_orders o
  where o.id = new.order_id;

  if v_order_customer is null then
    raise exception 'Pedido no encontrado' using errcode = '23503';
  end if;

  select c.customer_id into v_card_customer
  from public.oxxen_connect_cards c
  where c.id = new.card_id;

  if not found then
    raise exception 'Tarjeta no encontrada' using errcode = '23503';
  end if;

  if v_card_customer is not null and v_card_customer <> v_order_customer then
    raise exception 'La tarjeta pertenece a un cliente distinto al pedido' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.oxxen_connect_validate_order_item_card_customer() from public, anon, authenticated;

drop trigger if exists trg_oxxen_connect_validate_order_item_card_customer on public.oxxen_connect_order_items;
create trigger trg_oxxen_connect_validate_order_item_card_customer
before insert or update of order_id, card_id on public.oxxen_connect_order_items
for each row execute function public.oxxen_connect_validate_order_item_card_customer();

create or replace function public.oxxen_connect_validate_order_customer_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.customer_id is not distinct from new.customer_id then
    return new;
  end if;

  if exists (
    select 1
    from public.oxxen_connect_order_items i
    join public.oxxen_connect_cards c on c.id = i.card_id
    where i.order_id = new.id
      and c.customer_id is not null
      and c.customer_id <> new.customer_id
  ) then
    raise exception 'El pedido contiene una tarjeta vinculada a otro cliente' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.oxxen_connect_validate_order_customer_change() from public, anon, authenticated;

drop trigger if exists trg_oxxen_connect_validate_order_customer_change on public.oxxen_connect_orders;
create trigger trg_oxxen_connect_validate_order_customer_change
before update of customer_id on public.oxxen_connect_orders
for each row execute function public.oxxen_connect_validate_order_customer_change();

create or replace function public.oxxen_connect_validate_card_customer_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.customer_id is not distinct from new.customer_id or new.customer_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.oxxen_connect_order_items i
    join public.oxxen_connect_orders o on o.id = i.order_id
    where i.card_id = new.id
      and o.customer_id <> new.customer_id
  ) then
    raise exception 'La tarjeta ya está asociada a un pedido de otro cliente' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.oxxen_connect_validate_card_customer_change() from public, anon, authenticated;

drop trigger if exists trg_oxxen_connect_validate_card_customer_change on public.oxxen_connect_cards;
create trigger trg_oxxen_connect_validate_card_customer_change
before update of customer_id on public.oxxen_connect_cards
for each row execute function public.oxxen_connect_validate_card_customer_change();

-- -----------------------------------------------------------------------------
-- Atomic order creation. PostgreSQL function execution is transactional: any
-- exception raised below rolls back both the order and every item in the call.
-- Existing order/item audit triggers continue to create the audit records.
-- -----------------------------------------------------------------------------
create or replace function public.oxxen_connect_create_order_with_items(
  p_customer_id uuid,
  p_items jsonb,
  p_discount numeric default 0,
  p_notes text default null,
  p_currency text default 'PEN'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_order_id uuid;
  v_item jsonb;
  v_item_type text;
  v_description text;
  v_quantity integer;
  v_unit_price numeric;
  v_card_id uuid;
  v_card_customer uuid;
begin
  select a.role into v_role
  from public.oxxen_connect_admins a
  where a.user_id = auth.uid();

  if v_role is null or v_role not in ('OWNER', 'ADMIN', 'SALES') then
    raise exception 'Permiso insuficiente para crear pedidos' using errcode = '42501';
  end if;

  if v_role = 'OWNER' and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'OWNER requiere AAL2' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.oxxen_connect_customers c
    where c.id = p_customer_id
      and c.status <> 'blocked'
  ) then
    raise exception 'Cliente no disponible para pedidos' using errcode = '23503';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido requiere al menos un item' using errcode = '22023';
  end if;

  if p_discount is null or p_discount < 0 then
    raise exception 'Descuento inválido' using errcode = '22023';
  end if;

  if p_currency is null or upper(trim(p_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Moneda inválida' using errcode = '22023';
  end if;

  insert into public.oxxen_connect_orders(
    customer_id, status, payment_status, currency, discount, notes
  ) values (
    p_customer_id, 'draft', 'pending', upper(trim(p_currency)), p_discount,
    nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Item inválido' using errcode = '22023';
    end if;

    v_item_type := v_item->>'item_type';
    if v_item_type not in ('digital_card', 'nfc_card', 'service', 'other') then
      raise exception 'Tipo de item inválido' using errcode = '22023';
    end if;

    begin
      v_quantity := (v_item->>'quantity')::integer;
      v_unit_price := (v_item->>'unit_price')::numeric;
      v_card_id := nullif(v_item->>'card_id', '')::uuid;
    exception when others then
      raise exception 'Cantidad, precio o card_id inválido' using errcode = '22023';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'La cantidad del item debe ser mayor que cero' using errcode = '22023';
    end if;
    if v_unit_price is null or v_unit_price < 0 then
      raise exception 'El precio unitario no puede ser negativo' using errcode = '22023';
    end if;

    if v_item_type in ('service', 'other') and v_card_id is not null then
      raise exception 'Servicios y otros items no pueden asociarse a una tarjeta' using errcode = '23514';
    end if;

    if v_card_id is not null then
      select c.customer_id into v_card_customer
      from public.oxxen_connect_cards c
      where c.id = v_card_id and c.deleted_at is null;

      if not found then
        raise exception 'Tarjeta no disponible' using errcode = '23503';
      end if;

      if v_card_customer is not null and v_card_customer <> p_customer_id then
        raise exception 'La tarjeta pertenece a un cliente distinto al pedido' using errcode = '23514';
      end if;
    end if;

    v_description := nullif(trim(coalesce(v_item->>'description', '')), '');

    insert into public.oxxen_connect_order_items(
      order_id, item_type, description, quantity, unit_price, card_id
    ) values (
      v_order_id, v_item_type, v_description, v_quantity, v_unit_price, v_card_id
    );
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.oxxen_connect_create_order_with_items(uuid,jsonb,numeric,text,text)
  from public, anon, authenticated;
grant execute on function public.oxxen_connect_create_order_with_items(uuid,jsonb,numeric,text,text)
  to authenticated;

comment on function public.oxxen_connect_create_order_with_items(uuid,jsonb,numeric,text,text) is
  'Atomically creates one OXXEN Connect commercial order and all line items. Any validation/insert failure rolls the full function call back.';

-- -----------------------------------------------------------------------------
-- Operational dashboard aggregation. This is intentionally small operational
-- reporting, not advanced analytics.
-- -----------------------------------------------------------------------------
create or replace function public.oxxen_connect_get_operational_dashboard()
returns table (
  customers_active bigint,
  orders_open bigint,
  orders_pending_delivery bigint,
  orders_pending_payment bigint,
  nfc_available bigint,
  nfc_reserved bigint,
  nfc_defective bigint,
  profiles_active bigint,
  views_7d bigint,
  views_30d bigint,
  vcards_7d bigint,
  vcards_30d bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select a.role into v_role
  from public.oxxen_connect_admins a
  where a.user_id = auth.uid();

  if v_role is null or v_role not in ('OWNER', 'ADMIN', 'EDITOR', 'SUPPORT', 'SALES') then
    raise exception 'Acceso administrativo requerido' using errcode = '42501';
  end if;
  if v_role = 'OWNER' and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'OWNER requiere AAL2' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.oxxen_connect_customers c where c.status = 'active')::bigint,
    (select count(*) from public.oxxen_connect_orders o where o.status not in ('delivered','cancelled'))::bigint,
    (select count(*) from public.oxxen_connect_orders o where o.status in ('confirmed','in_production','ready'))::bigint,
    (select count(*) from public.oxxen_connect_orders o where o.status <> 'cancelled' and o.payment_status in ('pending','partial'))::bigint,
    (select count(*) from public.oxxen_connect_nfc_assets a where a.status = 'available')::bigint,
    (select count(*) from public.oxxen_connect_nfc_assets a where a.status = 'reserved')::bigint,
    (select count(*) from public.oxxen_connect_nfc_assets a where a.status = 'defective')::bigint,
    (select count(*) from public.oxxen_connect_cards c where c.active and c.deleted_at is null)::bigint,
    (select count(*) from public.oxxen_connect_analytics_events e where e.event_type = 'view' and e.created_at >= now() - interval '7 days')::bigint,
    (select count(*) from public.oxxen_connect_analytics_events e where e.event_type = 'view' and e.created_at >= now() - interval '30 days')::bigint,
    (select count(*) from public.oxxen_connect_analytics_events e where e.event_type = 'vcard' and e.created_at >= now() - interval '7 days')::bigint,
    (select count(*) from public.oxxen_connect_analytics_events e where e.event_type = 'vcard' and e.created_at >= now() - interval '30 days')::bigint;
end;
$$;

revoke all on function public.oxxen_connect_get_operational_dashboard() from public, anon, authenticated;
grant execute on function public.oxxen_connect_get_operational_dashboard() to authenticated;
