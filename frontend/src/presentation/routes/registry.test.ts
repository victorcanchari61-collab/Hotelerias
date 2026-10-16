// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { NAV_GROUPS } from '@/presentation/layout/navigation'
import { createRouteTable } from './index'
import { RouteTableError, accessForMenuEntry, buildRouteTable } from './registry'
import { acceso } from './access'
import { navRoute, standaloneRoute } from './types'
import type { MenuEntry } from './types'

const Pantalla = () => null
const Construccion = () => null

const menu: MenuEntry[] = [
  { id: 'crm.huespedes' },
  { id: 'inventario.stock' },
  { id: 'finanzas.bancos', incluye: ['finanzas.cobrar'] },
  { id: 'finanzas.cobrar', hidden: true },
  { id: 'facturacion.comprobantes', hidden: true },
]

const construir = (defs: Parameters<typeof buildRouteTable>[0]) =>
  buildRouteTable(defs, menu, { placeholder: Construccion })

describe('buildRouteTable', () => {
  it('una ruta de menú toma su URL y su permiso del id (no se escriben dos veces)', () => {
    const t = construir([navRoute('crm.huespedes', Pantalla)])
    const r = t.find((x) => x.id === 'crm.huespedes')!

    expect(r.path).toBe('/crm/huespedes')
    expect(r.access).toEqual({ kind: 'permiso', submodulo: 'crm.huespedes', accion: 'ver' })
    expect(r.component).toBe(Pantalla)
    expect(r.placeholder).toBe(false)
    expect(r.layout).toBe('shell')
  })

  it('una pantalla con pestañas de otros submódulos se abre con cualquiera de ellos', () => {
    expect(accessForMenuEntry({ id: 'finanzas.bancos', incluye: ['finanzas.cobrar'] })).toEqual({
      kind: 'permisoAlguno',
      requeridos: [
        { submodulo: 'finanzas.bancos', accion: 'ver' },
        { submodulo: 'finanzas.cobrar', accion: 'ver' },
      ],
    })
  })

  it('las entradas visibles que ninguna feature construyó reciben la pantalla "en construcción"', () => {
    const t = construir([navRoute('crm.huespedes', Pantalla)])
    const stock = t.find((x) => x.id === 'inventario.stock')!

    expect(stock.placeholder).toBe(true)
    expect(stock.component).toBe(Construccion)
    // y con su permiso: la pantalla vacía tampoco es para cualquiera
    expect(stock.access).toEqual({ kind: 'permiso', submodulo: 'inventario.stock', accion: 'ver' })
  })

  it('las entradas ocultas del menú NO generan ruta (son pestañas o están reservadas)', () => {
    const ids = construir([]).map((r) => r.id)
    expect(ids).not.toContain('finanzas.cobrar')
    expect(ids).not.toContain('facturacion.comprobantes')
  })

  it('una oculta SÍ puede tener ruta si una feature la declara', () => {
    const t = construir([navRoute('facturacion.comprobantes', Pantalla)])
    expect(t.find((r) => r.id === 'facturacion.comprobantes')?.component).toBe(Pantalla)
  })

  it('el menú nunca lleva a un 404: toda entrada visible tiene ruta', () => {
    const t = construir([])
    for (const e of menu.filter((m) => !m.hidden)) {
      expect(t.some((r) => r.id === e.id)).toBe(true)
    }
  })

  it('las rutas standalone conservan su política y su layout', () => {
    const t = construir([
      standaloneRoute({ id: 'login', path: '/login', access: acceso.invitado(), component: Pantalla, layout: 'bare' }),
    ])
    const r = t.find((x) => x.id === 'login')!
    expect(r).toMatchObject({ path: '/login', layout: 'bare', access: { kind: 'guest' } })
  })

  describe('falla al armarse (no al navegar)', () => {
    it('un id de menú que no existe: un typo se descubre aquí, no con una pantalla en blanco', () => {
      expect(() => construir([navRoute('maestros.clientez', Pantalla)])).toThrow(RouteTableError)
      expect(() => construir([navRoute('maestros.clientez', Pantalla)])).toThrow(/maestros\.clientez/)
    })

    it('un id repetido', () => {
      expect(() =>
        construir([navRoute('inventario.stock', Pantalla), navRoute('inventario.stock', Pantalla)]),
      ).toThrow(/repetido/)
    })

    it('una URL repetida entre dos features', () => {
      expect(() =>
        construir([
          standaloneRoute({ id: 'a', path: '/x', access: acceso.sesion(), component: Pantalla, layout: 'shell' }),
          standaloneRoute({ id: 'b', path: '/x', access: acceso.sesion(), component: Pantalla, layout: 'shell' }),
        ]),
      ).toThrow(/URL "\/x" está repetida/)
    })

    it('una URL standalone que choca con la de una entrada del menú', () => {
      expect(() =>
        construir([
          standaloneRoute({ id: 'otra', path: '/inventario/stock', access: acceso.sesion(), component: Pantalla, layout: 'shell' }),
        ]),
      ).toThrow(/repetida/)
    })

    it('una URL que no empieza con "/"', () => {
      expect(() =>
        construir([
          standaloneRoute({ id: 'a', path: 'sin-barra', access: acceso.sesion(), component: Pantalla, layout: 'shell' }),
        ]),
      ).toThrow(/debe empezar con/)
    })
  })
})

describe('la tabla real de la app', () => {
  const table = createRouteTable()

  it('se arma sin errores con el menú real', () => {
    expect(table.length).toBeGreaterThan(30)
  })

  it('tiene login (sin menú, solo invitados) e inicio (solo sesión)', () => {
    expect(table.find((r) => r.path === '/login')).toMatchObject({ layout: 'bare', access: { kind: 'guest' } })
    expect(table.find((r) => r.path === '/')).toMatchObject({ layout: 'shell', access: { kind: 'authenticated' } })
  })

  it('/config/usuarios es la pantalla real, no la de "en construcción"', () => {
    const r = table.find((x) => x.path === '/config/usuarios')!
    expect(r.placeholder).toBe(false)
    expect(r.access).toEqual({ kind: 'permiso', submodulo: 'config.usuarios', accion: 'ver' })
  })

  it('cada entrada visible del menú real tiene ruta y ninguna URL se repite', () => {
    for (const grupo of NAV_GROUPS) {
      for (const item of grupo.items.filter((i) => !i.hidden)) {
        expect(table.some((r) => r.id === item.id), item.id).toBe(true)
      }
    }
    const paths = table.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('toda ruta del menú exige al menos ver; nada del menú queda abierto', () => {
    const delMenu = table.filter((r) => r.id.includes('.') && r.layout === 'shell' && !r.id.startsWith('home.'))
    for (const r of delMenu) {
      expect(['permiso', 'permisoAlguno'], r.id).toContain(r.access.kind)
    }
  })
})
