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
}

/** Lo que se manda al crear o editar. La contraseña es opcional al editar. */
export interface UsuarioInput {
  rolId: number | null
  nombre: string
  apellido: string
  email: string
  telefono: string
  foto: string
  password?: string
}

/** Apellidos y nombres listos para mostrar en una cabecera. */
export function nombreCompleto(u: Pick<Usuario, 'nombre' | 'apellido'>): string {
  return [u.nombre, u.apellido].filter((parte) => parte.trim() !== '').join(' ')
}
