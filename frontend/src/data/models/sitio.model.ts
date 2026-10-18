import type {
  Banner,
  ClavePagina,
  Entrada,
  EstadoEntrada,
  EstadoMensaje,
  Experiencia,
  Medio,
  MedioRef,
  Mensaje,
  Pagina,
  TipoMedio,
} from '@/domain/entities/Sitio'

/** Cómo viaja el contenido del sitio por el cable (contrato del backend). */

export interface MedioRefDto {
  id: number
  tipo: TipoMedio
  url: string
  descripcion?: string
  ancho?: number | null
  alto?: number | null
}

export interface MedioDto extends MedioRefDto {
  nombreOriginal: string
  mime: string
  bytes: number
  usos?: number
  creadoEn?: string
}

export interface BannerDto {
  id: number
  orden: number
  titulo: string
  subtitulo?: string
  medioId: number | null
  medio: MedioRefDto | null
  enlaceTexto?: string
  enlaceUrl?: string
  activo: boolean
  desde: string | null
  hasta: string | null
}

export interface ExperienciaDto {
  id: number
  slug: string
  titulo: string
  resumen?: string
  texto?: string
  ejemplos: string[] | null
  medioId: number | null
  medio: MedioRefDto | null
  orden: number
  activo: boolean
}

export interface EntradaDto {
  id: number
  slug: string
  titulo: string
  resumen?: string
  cuerpo?: string
  portadaId: number | null
  portada: MedioRefDto | null
  estado: EstadoEntrada
  publicadaEn: string | null
  autor?: string
  creadoEn?: string
  actualizadoEn?: string
}

export interface PaginaDto {
  clave: ClavePagina
  titulo: string
  cuerpo?: string
  medioId: number | null
  medio: MedioRefDto | null
  actualizadaEn?: string
}

export interface MensajeDto {
  id: number
  nombre: string
  email: string
  telefono?: string
  asunto?: string
  mensaje: string
  estado: EstadoMensaje
  creadoEn?: string
}

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

export function medioRefFromDto(dto: MedioRefDto | null): MedioRef | null {
  if (!dto) return null
  return {
    id: dto.id,
    tipo: dto.tipo,
    url: dto.url,
    descripcion: dto.descripcion ?? '',
    ancho: dto.ancho ?? null,
    alto: dto.alto ?? null,
  }
}

export function medioFromDto(dto: MedioDto): Medio {
  return {
    ...(medioRefFromDto(dto) as MedioRef),
    nombreOriginal: dto.nombreOriginal,
    mime: dto.mime,
    bytes: dto.bytes,
    usos: dto.usos ?? 0,
    creadoEn: fecha(dto.creadoEn),
  }
}

export function bannerFromDto(dto: BannerDto): Banner {
  return {
    id: dto.id,
    orden: dto.orden,
    titulo: dto.titulo,
    subtitulo: dto.subtitulo ?? '',
    medioId: dto.medioId ?? null,
    medio: medioRefFromDto(dto.medio),
    enlaceTexto: dto.enlaceTexto ?? '',
    enlaceUrl: dto.enlaceUrl ?? '',
    activo: dto.activo,
    desde: dto.desde ?? null,
    hasta: dto.hasta ?? null,
  }
}

export function experienciaFromDto(dto: ExperienciaDto): Experiencia {
  return {
    id: dto.id,
    slug: dto.slug,
    titulo: dto.titulo,
    resumen: dto.resumen ?? '',
    texto: dto.texto ?? '',
    ejemplos: dto.ejemplos ?? [],
    medioId: dto.medioId ?? null,
    medio: medioRefFromDto(dto.medio),
    orden: dto.orden,
    activo: dto.activo,
  }
}

export function entradaFromDto(dto: EntradaDto): Entrada {
  return {
    id: dto.id,
    slug: dto.slug,
    titulo: dto.titulo,
    resumen: dto.resumen ?? '',
    cuerpo: dto.cuerpo ?? '',
    portadaId: dto.portadaId ?? null,
    portada: medioRefFromDto(dto.portada),
    estado: dto.estado,
    publicadaEn: fecha(dto.publicadaEn),
    autor: dto.autor ?? '',
    creadoEn: fecha(dto.creadoEn),
    actualizadoEn: fecha(dto.actualizadoEn),
  }
}

export function paginaFromDto(dto: PaginaDto): Pagina {
  return {
    clave: dto.clave,
    titulo: dto.titulo,
    cuerpo: dto.cuerpo ?? '',
    medioId: dto.medioId ?? null,
    medio: medioRefFromDto(dto.medio),
    actualizadaEn: fecha(dto.actualizadaEn),
  }
}

export function mensajeFromDto(dto: MensajeDto): Mensaje {
  return {
    id: dto.id,
    nombre: dto.nombre,
    email: dto.email,
    telefono: dto.telefono ?? '',
    asunto: dto.asunto ?? '',
    mensaje: dto.mensaje,
    estado: dto.estado,
    creadoEn: fecha(dto.creadoEn),
  }
}
