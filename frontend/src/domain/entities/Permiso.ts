/**
 * Lo que se puede hacer sobre un submódulo. Los nombres son los del catálogo
 * del backend (internal/permiso/catalogo.go): si cambian allá, cambian aquí.
 */
export const ACCION = {
  ver: 'ver',
  crear: 'crear',
  editar: 'editar',
  anular: 'anular',
  eliminar: 'eliminar',
  exportar: 'exportar',
  importar: 'importar',
  confirmar: 'confirmar',
  cobrar: 'cobrar',
} as const

export type Accion = (typeof ACCION)[keyof typeof ACCION]

/** Un submódulo del catálogo y las acciones que admite. */
export interface SubmoduloCatalogo {
  submodulo: string
  modulo: string
  acciones: Accion[]
}

/** "submodulo:accion", la forma en que viajan los permisos desde el backend. */
export const clavePermiso = (submodulo: string, accion: string) => `${submodulo}:${accion}`

/**
 * Todo lo que una persona puede hacer ahora mismo.
 *
 * Es inmutable y tiene su propia lógica ("¿puede?"), en vez de ser un
 * `Set<string>` suelto que cada pantalla consulta armando la clave a mano.
 *
 * Esconder lo que no se puede es comodidad, no seguridad: el guard del
 * backend rechaza igual a quien llame al endpoint directo. Aquí solo se evita
 * ofrecer un botón que terminaría en un 403.
 */
export class PermisoSet {
  private readonly claves: ReadonlySet<string>

  constructor(claves: Iterable<string> = []) {
    this.claves = new Set(claves)
  }

  static vacio(): PermisoSet {
    return new PermisoSet()
  }

  puede(submodulo: string, accion: Accion): boolean {
    return this.claves.has(clavePermiso(submodulo, accion))
  }

  /** Si la pantalla se puede abrir siquiera. */
  puedeVer(submodulo: string): boolean {
    return this.puede(submodulo, ACCION.ver)
  }

  get tamano(): number {
    return this.claves.size
  }

  toArray(): string[] {
    return [...this.claves].sort()
  }
}
