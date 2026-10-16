import { ACCION } from '@/domain/entities/Permiso'
import type { Accion, PermisoSet } from '@/domain/entities/Permiso'

/**
 * Quién puede entrar a una ruta. Cada ruta declara su política; ninguna
 * pantalla hace su propio `if (!sesion) navigate('/login')`.
 *
 *  - public:        cualquiera.
 *  - guest:         solo quien NO tiene sesión (el login: con sesión no tiene sentido).
 *  - authenticated: cualquiera con sesión.
 *  - permiso:       con sesión Y esa acción sobre ese submódulo.
 *  - permisoAlguno: con sesión Y cualquiera de esas acciones (pantallas que
 *                   contienen pestañas de otros submódulos).
 */
export type Access =
  | { kind: 'public' }
  | { kind: 'guest' }
  | { kind: 'authenticated' }
  | { kind: 'permiso'; submodulo: string; accion: Accion }
  | { kind: 'permisoAlguno'; requeridos: readonly PermisoRequerido[] }

export interface PermisoRequerido {
  submodulo: string
  accion: Accion
}

export interface AccessContext {
  auth: 'loading' | 'authenticated' | 'unauthenticated'
  permisos: PermisoSet
  /** Si todavía se están pidiendo los permisos al backend. */
  permisosCargando: boolean
}

/**
 * Qué hacer con la petición de entrar:
 *  - allow:  mostrar la pantalla.
 *  - wait:   todavía no se sabe (restaurando sesión o cargando permisos).
 *  - login:  mandar a iniciar sesión.
 *  - home:   ya tiene sesión, no tiene nada que hacer aquí.
 *  - denied: tiene sesión pero le falta (alguno de) estos permisos.
 */
export type AccessDecision =
  | { type: 'allow' }
  | { type: 'wait' }
  | { type: 'login' }
  | { type: 'home' }
  | { type: 'denied'; requeridos: readonly PermisoRequerido[] }

type Rule<K extends Access['kind']> = (
  access: Extract<Access, { kind: K }>,
  ctx: AccessContext,
) => AccessDecision

const ALLOW: AccessDecision = { type: 'allow' }
const WAIT: AccessDecision = { type: 'wait' }

/** Lo común a toda ruta que exige sesión: devuelve la decisión, o null si ya hay sesión. */
function requiereSesion(ctx: AccessContext): AccessDecision | null {
  if (ctx.auth === 'loading') return WAIT
  if (ctx.auth === 'unauthenticated') return { type: 'login' }
  return null
}

/**
 * Una regla por tipo de acceso. Es un mapa y no un `switch`: agregar una
 * política nueva es agregar una entrada (y el compilador exige que esté), sin
 * tocar las que ya existen.
 */
const RULES: { [K in Access['kind']]: Rule<K> } = {
  public: () => ALLOW,

  guest: (_access, ctx) => {
    if (ctx.auth === 'loading') return WAIT
    return ctx.auth === 'authenticated' ? { type: 'home' } : ALLOW
  },

  authenticated: (_access, ctx) => requiereSesion(ctx) ?? ALLOW,

  permiso: (access, ctx) => {
    const sinSesion = requiereSesion(ctx)
    if (sinSesion) return sinSesion
    if (ctx.permisosCargando) return WAIT
    return ctx.permisos.puede(access.submodulo, access.accion)
      ? ALLOW
      : { type: 'denied', requeridos: [{ submodulo: access.submodulo, accion: access.accion }] }
  },

  permisoAlguno: (access, ctx) => {
    const sinSesion = requiereSesion(ctx)
    if (sinSesion) return sinSesion
    if (ctx.permisosCargando) return WAIT
    const alguno = access.requeridos.some((r) => ctx.permisos.puede(r.submodulo, r.accion))
    return alguno ? ALLOW : { type: 'denied', requeridos: access.requeridos }
  },
}

/** Función pura: se prueba sin React, sin router y sin red. */
export function evaluateAccess(access: Access, ctx: AccessContext): AccessDecision {
  const rule = RULES[access.kind] as Rule<Access['kind']>
  return rule(access, ctx)
}

/** Atajos para declarar rutas sin escribir el objeto a mano. */
export const acceso = {
  publico: (): Access => ({ kind: 'public' }),
  invitado: (): Access => ({ kind: 'guest' }),
  sesion: (): Access => ({ kind: 'authenticated' }),
  puede: (submodulo: string, accion: Accion = ACCION.ver): Access => ({
    kind: 'permiso',
    submodulo,
    accion,
  }),
}
