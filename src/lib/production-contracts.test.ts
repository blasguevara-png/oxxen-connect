import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('production contracts', () => {
  it('keeps the legacy Vercel redirect scoped to public profile routes', () => {
    const config = JSON.parse(read('vercel.json')) as {
      redirects?: Array<{ source: string; destination: string; permanent?: boolean; has?: Array<{ type: string; value: string }> }>
    }
    const redirects = config.redirects || []
    expect(redirects).toHaveLength(1)
    expect(redirects[0]).toMatchObject({
      source: '/p/:identifier',
      destination: 'https://connect.oxxengroup.com/p/:identifier',
      permanent: true,
    })
    expect(redirects[0].has).toContainEqual({ type: 'host', value: 'oxxen-connect.vercel.app' })
    expect(redirects.some(rule => rule.source.includes('/admin'))).toBe(false)
    expect(redirects.some(rule => rule.source.includes('/api'))).toBe(false)
  })

  it('protects permanent public IDs and reserves historical aliases in the database migration', () => {
    const sql = read('supabase/migrations/20260830_sprint1_production_hardening.sql')
    expect(sql).toContain('create unique index if not exists idx_oxxen_connect_cards_public_id')
    expect(sql).toContain('alter column public_id set not null')
    expect(sql).toContain("raise exception 'public_id is permanent and cannot be changed'")
    expect(sql).toContain('before update of public_id on public.oxxen_connect_cards')
    expect(sql).toContain('alias text not null unique')
    expect(sql).toContain('Preserve the old slug and reserve the new one for this same card.')
    expect(sql).toContain('This slug was previously assigned to another card and cannot be reused')
  })

  it('keeps public analytics constrained and rate limited', () => {
    const sql = read('supabase/migrations/20260830_sprint1_production_hardening.sql')
    for (const event of ['view','whatsapp','phone','email','website','instagram','facebook','tiktok','linkedin','maps','vcard','share']) {
      expect(sql).toContain(`'${event}'`)
    }
    expect(sql).toContain("octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 2048")
    expect(sql).toContain('length(p_session_id) > 100')
    expect(sql).toContain('if v_recent_count >= 30 then')
    expect(sql).toContain("now() - interval '10 minutes'")
    expect(sql).toContain('raw IP addresses are never persisted')
  })

  it('requires aal2 for OWNER access to operational data', () => {
    const sql = read('supabase/migrations/20260831_sprint2_closeout_mfa.sql')
    expect(sql).toContain("a.role in ('OWNER')")
    expect(sql).toContain("(select auth.jwt()->>'aal') = 'aal2'")
    for (const table of ['oxxen_connect_cards', 'oxxen_connect_card_aliases', 'oxxen_connect_analytics_events', 'oxxen_connect_audit_logs']) {
      expect(sql).toContain(`on public.${table}`)
    }
    expect(sql).toContain("bucket_id <> 'oxxen-connect-media'")
  })

  it('restores original card identities instead of generating replacements', () => {
    const restore = read('scripts/restore-backup.mjs')
    expect(restore).toContain("const publicIds = new Set(cards.map(card => card.public_id))")
    expect(restore).toContain("const aliasValues = new Set(aliases.map(alias => alias.alias))")
    expect(restore).toContain('Preserve original card id, public_id and aliases. Never generate replacements during restore.')
    expect(restore).toContain("await upsertBatches('oxxen_connect_cards', cards)")
    expect(restore).toContain("await upsertBatches('oxxen_connect_card_aliases', aliases)")
  })
})
