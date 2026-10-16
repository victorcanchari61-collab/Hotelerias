import { describe, expect, it } from 'vitest'
import { PermisoSet } from '@/domain/entities/Permiso'
import { acceso, evaluateAccess } from './access'
import type { Access, AccessContext, AccessDecision } from './access'

const permisos = new PermisoSet(['config.usuarios:ver', 'config.usuarios:editar', 'inventario.stock:ver'])

const ctx = (parcial: Partial<AccessContext> = {}): AccessContext => ({
  auth: 'authenticated',
  permisos,
  permisosCargando: false,
  ...parcial,
})

const tipo = (a: Access, c: AccessContext): AccessDecision['type'] => evaluateAccess(a, c).type

describe('evaluateAccess', () => {
  describe('public', () => {
    it('deja pasar siempre, incluso mientras se restaura la sesión', () => {
      for (const auth of ['loading', 'authenticated', 'unauthenticated'] as const) {
        expect(tipo(acceso.publico(), ctx({ auth }))).toBe('allow')
      }
    })
  })

  describe('guest (el login)', () => {
    it.each([
      ['loading', 'wait'],
      ['unauthenticated', 'allow'],
      // Con sesión no tiene sentido ver el login: se manda adentro.
      ['authenticated', 'home'],
    ] as const)('auth=%s → %s', (auth, esperado) => {
      expect(tipo(acceso.invitado(), ctx({ auth }))).toBe(esperado)
    })
  })

  describe('authenticated', () => {
    it.each([
      ['loading', 'wait'],
      ['unauthenticated', 'login'],
      ['authenticated', 'allow'],
    ] as const)('auth=%s → %s', (auth, esperado) => {
      expect(tipo(acceso.sesion(), ctx({ auth }))).toBe(esperado)
    })

    it('no espera a los permisos: Inicio es donde llega quien aún no tiene ninguno', () => {
      expect(tipo(acceso.sesion(), ctx({ permisosCargando: true, permisos: PermisoSet.vacio() }))).toBe('allow')
    })
  })

  describe('permiso', () => {
    const verUsuarios = acceso.puede('config.usuarios')

    it('sin sesión va al login, no a "denegado"', () => {
      expect(tipo(verUsuarios, ctx({ auth: 'unauthenticated' }))).toBe('login')
    })

    it('espera mientras se restaura la sesión y mientras se cargan los permisos', () => {
      expect(tipo(verUsuarios, ctx({ auth: 'loading' }))).toBe('wait')
      // Si no esperara, por un instante se vería "acceso denegado" a todo.
      expect(tipo(verUsuarios, ctx({ permisosCargando: true }))).toBe('wait')
    })

    it('permite con el permiso y niega sin él, diciendo QUÉ faltaba', () => {
      expect(tipo(verUsuarios, ctx())).toBe('allow')

      const d = evaluateAccess(acceso.puede('finanzas.cobrar'), ctx())
      expect(d).toEqual({
        type: 'denied',
        requeridos: [{ submodulo: 'finanzas.cobrar', accion: 'ver' }],
      })
    })

    it('distingue la acción: ver no implica editar', () => {
      expect(tipo(acceso.puede('inventario.stock', 'ver'), ctx())).toBe('allow')
      expect(tipo(acceso.puede('inventario.stock', 'editar'), ctx())).toBe('denied')
    })

    it('un permiso de otro submódulo no sirve', () => {
      expect(tipo(acceso.puede('inventario.almacenes'), ctx())).toBe('denied')
    })
  })

  describe('permisoAlguno (una pantalla con pestañas de otros submódulos)', () => {
    const bancos: Access = {
      kind: 'permisoAlguno',
      requeridos: [
        { submodulo: 'finanzas.bancos', accion: 'ver' },
        { submodulo: 'finanzas.cobrar', accion: 'ver' },
      ],
    }

    it('basta con uno', () => {
      expect(tipo(bancos, ctx({ permisos: new PermisoSet(['finanzas.cobrar:ver']) }))).toBe('allow')
    })

    it('sin ninguno se niega y se listan todos los que servían', () => {
      const d = evaluateAccess(bancos, ctx())
      expect(d.type).toBe('denied')
      expect(d.type === 'denied' && d.requeridos).toHaveLength(2)
    })

    it('también espera y también exige sesión', () => {
      expect(tipo(bancos, ctx({ auth: 'unauthenticated' }))).toBe('login')
      expect(tipo(bancos, ctx({ permisosCargando: true }))).toBe('wait')
    })
  })
})
