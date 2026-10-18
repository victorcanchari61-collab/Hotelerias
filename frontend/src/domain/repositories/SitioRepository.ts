import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type {
  Banner,
  BannerInput,
  ClavePagina,
  Destino,
  EntidadGaleria,
  Entrada,
  EntradaInput,
  EstadoMensaje,
  Experiencia,
  ExperienciaInput,
  Medio,
  MedioRef,
  Mensaje,
  MensajeContactoInput,
  Pagina,
  PaginaInput,
  TipoMedio,
} from '../entities/Sitio'

/** La administración del contenido de la web pública, para el personal. */
export interface SitioRepository {
  banners(): Promise<Either<Failure, Banner[]>>
  crearBanner(input: BannerInput): Promise<Either<Failure, Banner>>
  actualizarBanner(id: number, input: BannerInput): Promise<Either<Failure, Banner>>
  eliminarBanner(id: number): Promise<Either<Failure, void>>

  medios(tipo?: TipoMedio): Promise<Either<Failure, Medio[]>>
  subirMedio(archivo: File): Promise<Either<Failure, Medio>>
  actualizarMedio(id: number, descripcion: string): Promise<Either<Failure, Medio>>
  eliminarMedio(id: number): Promise<Either<Failure, void>>

  destinos(): Promise<Either<Failure, Destino[]>>
  galeria(entidad: EntidadGaleria, id: number): Promise<Either<Failure, MedioRef[]>>
  guardarGaleria(entidad: EntidadGaleria, id: number, medioIds: number[]): Promise<Either<Failure, MedioRef[]>>

  experiencias(): Promise<Either<Failure, Experiencia[]>>
  crearExperiencia(input: ExperienciaInput): Promise<Either<Failure, Experiencia>>
  actualizarExperiencia(id: number, input: ExperienciaInput): Promise<Either<Failure, Experiencia>>
  eliminarExperiencia(id: number): Promise<Either<Failure, void>>

  entradas(): Promise<Either<Failure, Entrada[]>>
  entrada(id: number): Promise<Either<Failure, Entrada>>
  crearEntrada(input: EntradaInput): Promise<Either<Failure, Entrada>>
  actualizarEntrada(id: number, input: EntradaInput): Promise<Either<Failure, Entrada>>
  publicarEntrada(id: number, publicar: boolean): Promise<Either<Failure, Entrada>>
  eliminarEntrada(id: number): Promise<Either<Failure, void>>

  pagina(clave: ClavePagina): Promise<Either<Failure, Pagina>>
  guardarPagina(clave: ClavePagina, input: PaginaInput): Promise<Either<Failure, Pagina>>

  mensajes(estado?: EstadoMensaje): Promise<Either<Failure, Mensaje[]>>
  cambiarEstadoMensaje(id: number, estado: EstadoMensaje): Promise<Either<Failure, void>>
  eliminarMensaje(id: number): Promise<Either<Failure, void>>
}

/** Lo que lee la web pública, sin sesión: solo lo activo, vigente y publicado. */
export interface SitioPublicoRepository {
  portada(): Promise<Either<Failure, Banner[]>>
  experiencias(): Promise<Either<Failure, Experiencia[]>>
  entradas(limite: number, desde: number): Promise<Either<Failure, Entrada[]>>
  entrada(slug: string): Promise<Either<Failure, Entrada>>
  pagina(clave: ClavePagina): Promise<Either<Failure, Pagina>>
  galeria(entidad: EntidadGaleria, id: number): Promise<Either<Failure, MedioRef[]>>
  enviarMensaje(input: MensajeContactoInput): Promise<Either<Failure, void>>
}
