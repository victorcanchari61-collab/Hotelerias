import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El contrato visual: Hotelerias usa UN SOLO COLOR, y los iconos y las letras
 * del menú lateral son de ese único color (sin degradados ni un color por módulo,
 * como sí tiene el kit de Ecommerce del que se copió).
 *
 * Esto es una prueba y no un comentario porque el kit se re-sincroniza copiando
 * archivos de Ecommerce: la próxima copia traería de vuelta los degradados sin
 * que nadie lo notara. Si falla, no es un bug de la prueba: la copia pisó el
 * requisito.
 */

const SRC = resolve(__dirname, '..')
const leer = (...ruta: string[]) => readFileSync(join(SRC, ...ruta), 'utf-8')
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('tema: un solo color', () => {
  const themes = sinComentarios(leer('styles', 'themes.css'))

  it('hay UN color de entrada y el segundo extremo es el mismo', () => {
    const inicio = [...themes.matchAll(/--grad-start:\s*([^;]+);/g)].map((m) => m[1].trim())
    const fin = [...themes.matchAll(/--grad-end:\s*([^;]+);/g)].map((m) => m[1].trim())

    expect(inicio).toHaveLength(1)
    expect(fin).toEqual(inicio)
  })

  it('no define un color por módulo (data-sys) ni usa degradados de texto', () => {
    expect(themes).not.toMatch(/\[data-sys=['"]/)
    expect(themes).not.toMatch(/--grad-text|--icon-a|--icon-b|--icon-m|text-grad/)
  })

  it('el menú tiene un único token de color', () => {
    expect(themes).toMatch(/--nav-ink:/)
  })

  it('conserva las animaciones del kit', () => {
    const index = leer('index.css')
    expect(index).toMatch(/@keyframes ui-fade-up/)
    expect(index).toMatch(/prefers-reduced-motion/) // y respeta a quien no quiere movimiento
    expect(themes).toMatch(/@keyframes fadeIn/)
  })
})

describe('menú lateral: iconos y letras de un solo color', () => {
  const dir = join(SRC, 'shared', 'layout')
  const archivos = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f))

  it('hay archivos de layout (la prueba no es vacía)', () => {
    expect(archivos.length).toBeGreaterThan(5)
  })

  it.each(archivos)('%s no usa degradados de icono ni de texto', (archivo) => {
    const codigo = leer('shared', 'layout', archivo)
    expect(codigo).not.toMatch(/text-grad|IconGradientDefs|gradientId|url\(#|--icon-[amb]\b|linear-gradient/)
  })

  it('ThemedIcon pinta con currentColor, el mismo color que la letra', () => {
    const icono = leer('shared', 'ui', 'ThemedIcon.tsx')
    expect(icono).toMatch(/stroke="currentColor"/)
    expect(icono).not.toMatch(/gradient/i)
  })

  it('las filas del menú leen el color de --nav-ink', () => {
    const estilos = leer('shared', 'layout', 'nav-styles.ts')
    expect(estilos).toMatch(/text-\(--nav-ink\)/)
  })
})
