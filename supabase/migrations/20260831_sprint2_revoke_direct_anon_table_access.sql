-- Public visitors use the narrow SECURITY DEFINER RPCs, never direct table access.
revoke all on table public.oxxen_connect_cards from anon, public;
revoke all on table public.oxxen_connect_card_aliases from anon, public;
revoke all on table public.oxxen_connect_analytics_events from anon, public;
revoke all on table public.oxxen_connect_admins from anon, public;
revoke all on table public.oxxen_connect_audit_logs from anon, public;

-- Keep only the public functions required by a public card.
revoke all on function public.get_public_card(text) from public;
revoke all on function public.get_public_card_status(text) from public;
revoke all on function public.record_public_event(text, text, jsonb, text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;
grant execute on function public.get_public_card_status(text) to anon, authenticated;
grant execute on function public.record_public_event(text, text, jsonb, text) to anon, authenticated;
