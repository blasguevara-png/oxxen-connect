-- Pre-change Sprint 2 snapshot. Operational safety net only; external backups remain required.
create schema if not exists oxxen_connect_backup_20260831_sprint2;

create table if not exists oxxen_connect_backup_20260831_sprint2.cards as
select * from public.oxxen_connect_cards;

create table if not exists oxxen_connect_backup_20260831_sprint2.aliases as
select * from public.oxxen_connect_card_aliases;

create table if not exists oxxen_connect_backup_20260831_sprint2.admins as
select * from public.oxxen_connect_admins;

create table if not exists oxxen_connect_backup_20260831_sprint2.analytics_events as
select * from public.oxxen_connect_analytics_events;

revoke all on schema oxxen_connect_backup_20260831_sprint2 from public, anon, authenticated;
revoke all on all tables in schema oxxen_connect_backup_20260831_sprint2 from public, anon, authenticated;

comment on schema oxxen_connect_backup_20260831_sprint2 is 'Pre-change Sprint 2 snapshot. Do not use as the only backup strategy.';
