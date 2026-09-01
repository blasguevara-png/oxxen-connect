-- S3.3 production rollout safety snapshot.
-- Applied before NFC inventory DDL with reason: pre-migracion-s3.3.
create schema if not exists oxxen_connect_backup_20260901_pre_s3_3;

create table if not exists oxxen_connect_backup_20260901_pre_s3_3.customers as
select * from public.oxxen_connect_customers;

create table if not exists oxxen_connect_backup_20260901_pre_s3_3.orders as
select * from public.oxxen_connect_orders;

create table if not exists oxxen_connect_backup_20260901_pre_s3_3.cards as
select * from public.oxxen_connect_cards;

create table if not exists oxxen_connect_backup_20260901_pre_s3_3.order_items as
select * from public.oxxen_connect_order_items;

create table if not exists oxxen_connect_backup_20260901_pre_s3_3.aliases as
select * from public.oxxen_connect_card_aliases;

create table if not exists oxxen_connect_backup_20260901_pre_s3_3.admins as
select * from public.oxxen_connect_admins;

create table if not exists oxxen_connect_backup_20260901_pre_s3_3.analytics_events as
select * from public.oxxen_connect_analytics_events;

create table if not exists oxxen_connect_backup_20260901_pre_s3_3.audit_logs as
select * from public.oxxen_connect_audit_logs;

create table if not exists oxxen_connect_backup_20260901_pre_s3_3.manifest as
select
  now() as created_at,
  'pre-migracion-s3.3'::text as reason,
  (select count(*) from public.oxxen_connect_customers) as customers_count,
  (select count(*) from public.oxxen_connect_orders) as orders_count,
  (select count(*) from public.oxxen_connect_cards) as cards_count,
  (select count(*) from public.oxxen_connect_order_items) as order_items_count,
  (select count(*) from public.oxxen_connect_card_aliases) as aliases_count,
  (select count(*) from public.oxxen_connect_admins) as admins_count,
  (select count(*) from public.oxxen_connect_analytics_events) as analytics_count,
  (select count(*) from public.oxxen_connect_audit_logs) as audit_count;

revoke all on schema oxxen_connect_backup_20260901_pre_s3_3 from public, anon, authenticated;
revoke all on all tables in schema oxxen_connect_backup_20260901_pre_s3_3 from public, anon, authenticated;

comment on schema oxxen_connect_backup_20260901_pre_s3_3 is
  'OXXEN Connect backup pre-migracion-s3.3; operational rollback snapshot created before NFC inventory DDL.';
