import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

describe('card editor preview layout', () => {
  it('keeps the QR panel reachable on short desktop viewports', () => {
    const css = read('src/editor-preview-fix.css')
    const entry = read('src/main.tsx')

    expect(entry).toContain("import './editor-preview-fix.css'")
    expect(css).toContain('@media (min-width: 1051px) and (max-height: 900px)')
    expect(css).toMatch(/\.sticky-preview\s*\{\s*position:\s*static;/)
    expect(css).toMatch(/#qr\s*\{\s*scroll-margin-top:\s*24px;/)
  })
})
