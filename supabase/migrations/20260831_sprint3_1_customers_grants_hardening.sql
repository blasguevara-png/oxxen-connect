-- OXXEN Connect — Sprint 3.1 post-migration least-privilege hardening.
-- Supabase default grants on newly created tables/sequences are broader than the intended customer API surface.

revoke all on table public.oxxen_connect_customers from anon, authenticated;
grant select, insert, update on table public.oxxen_connect_customers to authenticated;

revoke all on sequence public.oxxen_connect_customers_customer_number_seq from public, anon, authenticated;
grant usage, select on sequence public.oxxen_connect_customers_customer_number_seq to authenticated;
