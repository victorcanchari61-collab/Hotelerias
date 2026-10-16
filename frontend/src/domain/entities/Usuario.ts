/** Una cuenta que entra al sistema. */
export interface Usuario {
  id: number
  rolId: number | null
  rolNombre: string
  nombre: string
  apellido: string
  email: string
  telefono: string
  /** Ruta de la foto de perfil; vacía si no tiene. */
  foto: string
  activo: boolean
  creadoEn: Date | null
  /** TODOS sus roles (sus permisos son la unión). `rolId` es solo el principal. */
  rolIds: number[]
  /** Las sedes que atiende: lo que limita el alcance "mis sedes". */
  sedeIds: number[]
}

/** Lo que se manda al crear o editar. La contraseña es opcional al editar. */
export interface UsuarioInput {
  nombre: string
  apellido: string
  email: string
  telefono: string
  rolIds: number[]
  sedeIds: number[]
  activo: boolean
  password?: string
}

/** Apellidos y nombres listos para mostrar en una cabecera. */
export function nombreCompleto(u: Pick<Usuario, 'nombre' | 'apellido'>): string {
  return [u.nombre, u.apellido].filter((parte) => parte.trim() !== '').join(' ')
}
