/** El huésped que reserva por la web. Cuenta aparte del personal del hotel. */
export interface Cliente {
  id: number
  nombre: string
  apellido: string
  email: string
  telefono: string
  pais: string
  tipoClienteId: number | null
  /** "Regular", "Frecuente", "VIP"... según cómo lo clasifica el hotel. */
  tipoCliente: string
  /** El descuento base de su tipo, en %. */
  descuentoPct: number
  /** El personal fijó el tipo a mano y la regla automática no lo mueve. */
  tipoManual: boolean
  activo: boolean
  /** Reservas vigentes o cumplidas: las que cuentan para subir de tipo. */
  reservas: number
  creadoEn: Date | null
}

export interface SesionCliente {
  token: string
  cliente: Cliente
}

export interface RegistroCliente {
  nombre: string
  apellido: string
  email: string
  password: string
  telefono: string
  pais: string
}

export interface CredencialesCliente {
  email: string
  password: string
}

/** Cómo el hotel clasifica a sus huéspedes. */
export interface TipoCliente {
  id: number
  nombre: string
  descripcion: string
  descuentoPct: number
  /** Al llegar a esta cantidad de reservas el huésped sube solo. null = solo a mano. */
  reservasMinimas: number | null
  orden: number
  activo: boolean
}

export type TipoClienteInput = Omit<TipoCliente, 'id'>

export function nombreCompletoCliente(c: Pick<Cliente, 'nombre' | 'apellido'>): string {
  return [c.nombre, c.apellido].filter(Boolean).join(' ')
}
