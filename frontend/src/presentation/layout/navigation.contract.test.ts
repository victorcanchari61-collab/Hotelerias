import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAV_GROUPS } from './navigation'

/**
 * El menú del frontend y el catálogo de permisos del backend son DOS listas de
 * lo mismo: cada pantalla es un submódulo con su permiso. Si se separan, pasa
 * una de dos cosas malas: una pantalla en el menú que nadie puede abrir (el
 * backend no conoce su permiso) o un permiso que se puede conceder y no lleva
 * a ninguna parte.
 *
 * Esto lee el catálogo real del backend y exige que coincidan, en orden.
 */

const CATALOGO = resolve(__dirname, '../../../../backend/internal/permiso/catalogo.go')

function idsDelCatalogo(): string[] {
  const fuente = readFileSync(CATALOGO, 'utf-8')
  // Solo dentro del catálogo (después de `var Permisos`), una `sub("modulo.vista", ...)` por línea.
  const desde = fuente.indexOf('var Permisos')
  expect(desde, 'no encontré "var Permisos" en catalogo.go').toBeGreaterThan(-1)
  return [...fuente.slice(desde).matchAll(/^\s*sub\("([a-z]+\.[a-z]+)"/gm)].map((m) => m[1])
}

describe('el menú coincide con el catálogo de permisos del backend', () => {
  const catalogo = idsDelCatalogo()
  const menu = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id))

  it('lee un catálogo no vacío (la prueba no es vacía)', () => {
    expect(catalogo.length).toBeGreaterThan(30)
  })

  it('toda entrada del menú tiene su permiso en el backend', () => {
    const sinPermiso = menu.filter((id) => !catalogo.includes(id))
    expect(sinPermiso, `en el menú pero NO en el catálogo: ${sinPermiso.join(', ')}`).toEqual([])
  })

  it('todo permiso del backend tiene su entrada en el menú', () => {
    const sinPantalla = catalogo.filter((id) => !menu.includes(id))
    expect(sinPantalla, `en el catálogo pero NO en el menú: ${sinPantalla.join(', ')}`).toEqual([])
  })

  it('mismo orden (el del catálogo es el del menú)', () => {
    expect(menu).toEqual(catalogo)
  })

  it('cada grupo del menú es un módulo del catálogo (su id es el prefijo de sus entradas)', () => {
    for (const g of NAV_GROUPS) {
      for (const item of g.items) {
        expect(item.id.startsWith(`${g.id}.`), `${item.id} no pertenece al grupo ${g.id}`).toBe(true)
      }
    }
  })

  it('no hay ids repetidos', () => {
    expect(new Set(menu).size).toBe(menu.length)
  })
})
