import type { FechaISO } from './Portal'

/**
 * El contenido de la web pública, que el personal administra desde el panel:
 * portada con carrusel, fotos y videos, galerías, experiencias, blog, páginas
 * y los mensajes del formulario de contacto.
 */

export type TipoMedio = 'imagen' | 'video'

/** Un archivo tal como lo usa una pantalla (un banner, una historia…). */
export interface MedioRef {
  id: number
  tipo: TipoMedio
  /** Dirección pública del archivo (/uploads/sitio/…). */
  url: string
  /** Texto alternativo: lo que lee un lector de pantalla y se ve si no carga. */
  descripcion: string
  ancho: number | null
  alto: number | null
}

/** Un archivo de la biblioteca, como lo ve el personal. */
export interface Medio extends MedioRef {
  nombreOriginal: string
  mime: string
  bytes: number
  /** En cuántos lugares se usa; mientras se use no se puede borrar. */
  usos: number
  creadoEn: Date | null
}

export interface Banner {
  id: number
  orden: number
  titulo: string
  subtitulo: string
  medioId: number | null
  medio: MedioRef | null
  enlaceTexto: string
  enlaceUrl: string
  activo: boolean
  desde: FechaISO | null
  hasta: FechaISO | null
}

export type BannerInput = Omit<Banner, 'id' | 'medio'>

export interface Experiencia {
  id: number
  slug: string
  titulo: string
  resumen: string
  texto: string
  ejemplos: string[]
  medioId: number | null
  medio: MedioRef | null
  orden: number
  activo: boolean
}

export type ExperienciaInput = Omit<Experiencia, 'id' | 'slug' | 'medio'>

export type EstadoEntrada = 'borrador' | 'publicada'

export interface Entrada {
  id: number
  slug: string
  titulo: string
  resumen: string
  /** Texto con formato simple (ver `TextoRico`): nunca HTML. */
  cuerpo: string
  portadaId: number | null
  portada: MedioRef | null
  estado: EstadoEntrada
  publicadaEn: Date | null
  autor: string
  creadoEn: Date | null
  actualizadoEn: Date | null
}

export interface EntradaInput {
  titulo: string
  resumen: string
  cuerpo: string
  portadaId: number | null
}

export type ClavePagina = 'nosotros' | 'contacto'

export interface Pagina {
  clave: ClavePagina
  titulo: string
  cuerpo: string
  medioId: number | null
  medio: MedioRef | null
  actualizadaEn: Date | null
}

export interface PaginaInput {
  titulo: string
  cuerpo: string
  medioId: number | null
}

export type EstadoMensaje = 'nuevo' | 'leido' | 'respondido'

export interface Mensaje {
  id: number
  nombre: string
  email: string
  telefono: string
  asunto: string
  mensaje: string
  estado: EstadoMensaje
  creadoEn: Date | null
}

/** Lo que escribe un visitante en «Contacto». */
export interface MensajeContactoInput {
  nombre: string
  email: string
  telefono: string
  asunto: string
  mensaje: string
}

export type EntidadGaleria = 'sede' | 'tipo_habitacion'

/** Algo a lo que se le puede armar una galería: un hotel o un tipo de habitación. */
export interface Destino {
  entidad: EntidadGaleria
  id: number
  nombre: string
  /** La ciudad del hotel, o el hotel de la habitación. */
  detalle: string
}

/** Los topes que el servidor aplica a lo que se sube. */
export const MAX_IMAGEN_BYTES = 8 * 1024 * 1024
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024
export const MAX_GALERIA = 30
