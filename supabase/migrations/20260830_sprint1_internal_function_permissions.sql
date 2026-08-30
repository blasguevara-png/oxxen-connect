-- Internal trigger helpers must never be callable through the exposed RPC surface.
revoke execute on function public.oxxen_connect_sync_slug_aliases() from public, anon, authenticated;
revoke execute on function public.oxxen_connect_protect_public_id() from public, anon, authenticated;
revoke execute on function public.oxxen_connect_set_updated_at() from public, anon, authenticated;
