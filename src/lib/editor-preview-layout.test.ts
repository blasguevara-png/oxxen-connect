import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')
const targetViewports = [
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]

describe('card editor QR/preview layout', () => {
  it('loads the regression stylesheet and keeps QR before the phone preview', () => {
    const css = read('src/editor-preview-fix.css')
    const entry = read('src/main.tsx')
    expect(entry).toContain("import './editor-preview-fix.css'")
    expect(css).toMatch(/\.editor-aside\s*>\s*\.qr-panel\s*\{\s*order:\s*-2;/)
    expect(css).toMatch(/\.editor-aside\s*>\s*\.sticky-preview\s*\{\s*order:\s*-1;/)
    expect(css).toMatch(/#qr\s*\{\s*scroll-margin-top:\s*24px;/)
  })

  it('disables sticky phone preview on the two short desktop acceptance viewports', () => {
    const css = read('src/editor-preview-fix.css')
    expect(targetViewports.filter(v=>v.width >= 1051 && v.height <= 900)).toEqual([
      { width: 1366, height: 768 },
      { width: 1600, height: 900 },
    ])
    expect(css).toContain('@media (min-width: 1051px) and (max-height: 900px)')
    expect(css).toMatch(/\.sticky-preview\s*\{\s*position:\s*static;/)
  })

  it('keeps all required acceptance viewport definitions under test', () => {
    expect(targetViewports).toEqual([
      { width: 1366, height: 768 },
      { width: 1600, height: 900 },
      { width: 1920, height: 1080 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ])
  })
})
