import { attempt } from '@/core/errors/failures'
import type {
  BannerInput,
  ClavePagina,
  EntidadGaleria,
  EntradaInput,
  EstadoMensaje,
  ExperienciaInput,
  MensajeContactoInput,
  PaginaInput,
  TipoMedio,
} from '@/domain/entities/Sitio'
import type { SitioPublicoRepository, SitioRepository } from '@/domain/repositories/SitioRepository'
import type { SitioPublicoRemoteDataSource, SitioRemoteDataSource } from '../datasources/SitioRemoteDataSource'
import {
  bannerFromDto,
  entradaFromDto,
  experienciaFromDto,
  medioFromDto,
  medioRefFromDto,
  mensajeFromDto,
  paginaFromDto,
} from '../models/sitio.model'
import type { MedioRefDto } from '../models/sitio.model'

const refs = (dtos: MedioRefDto[] | null) =>
  (dtos ?? []).map((d) => medioRefFromDto(d)).filter((m): m is NonNullable<typeof m> => m !== null)

export class SitioRepositoryImpl implements SitioRepository {
  constructor(private readonly remote: SitioRemoteDataSource) {}

  banners() {
    return attempt(async () => ((await this.remote.banners()) ?? []).map(bannerFromDto))
  }
  crearBanner(input: BannerInput) {
    return attempt(async () => bannerFromDto(await this.remote.crearBanner(input)))
  }
  actualizarBanner(id: number, input: BannerInput) {
    return attempt(async () => bannerFromDto(await this.remote.actualizarBanner(id, input)))
  }
  eliminarBanner(id: number) {
    return attempt(() => this.remote.eliminarBanner(id))
  }

  medios(tipo?: TipoMedio) {
    return attempt(async () => ((await this.remote.medios(tipo)) ?? []).map(medioFromDto))
  }
  subirMedio(archivo: File) {
    return attempt(async () => medioFromDto(await this.remote.subirMedio(archivo)))
  }
  actualizarMedio(id: number, descripcion: string) {
    return attempt(async () => medioFromDto(await this.remote.actualizarMedio(id, descripcion)))
  }
  eliminarMedio(id: number) {
    return attempt(() => this.remote.eliminarMedio(id))
  }

  destinos() {
    return attempt(async () => (await this.remote.destinos()) ?? [])
  }
  galeria(entidad: EntidadGaleria, id: number) {
    return attempt(async () => refs(await this.remote.galeria(entidad, id)))
  }
  guardarGaleria(entidad: EntidadGaleria, id: number, medioIds: number[]) {
    return attempt(async () => refs(await this.remote.guardarGaleria(entidad, id, medioIds)))
  }

  experiencias() {
    return attempt(async () => ((await this.remote.experiencias()) ?? []).map(experienciaFromDto))
  }
  crearExperiencia(input: ExperienciaInput) {
    return attempt(async () => experienciaFromDto(await this.remote.crearExperiencia(input)))
  }
  actualizarExperiencia(id: number, input: ExperienciaInput) {
    return attempt(async () => experienciaFromDto(await this.remote.actualizarExperiencia(id, input)))
  }
  eliminarExperiencia(id: number) {
    return attempt(() => this.remote.eliminarExperiencia(id))
  }

  entradas() {
    return attempt(async () => ((await this.remote.entradas()) ?? []).map(entradaFromDto))
  }
  entrada(id: number) {
    return attempt(async () => entradaFromDto(await this.remote.entrada(id)))
  }
  crearEntrada(input: EntradaInput) {
    return attempt(async () => entradaFromDto(await this.remote.crearEntrada(input)))
  }
  actualizarEntrada(id: number, input: EntradaInput) {
    return attempt(async () => entradaFromDto(await this.remote.actualizarEntrada(id, input)))
  }
  publicarEntrada(id: number, publicar: boolean) {
    return attempt(async () => entradaFromDto(await this.remote.publicarEntrada(id, publicar)))
  }
  eliminarEntrada(id: number) {
    return attempt(() => this.remote.eliminarEntrada(id))
  }

  pagina(clave: ClavePagina) {
    return attempt(async () => paginaFromDto(await this.remote.pagina(clave)))
  }
  guardarPagina(clave: ClavePagina, input: PaginaInput) {
    return attempt(async () => paginaFromDto(await this.remote.guardarPagina(clave, input)))
  }

  mensajes(estado?: EstadoMensaje) {
    return attempt(async () => ((await this.remote.mensajes(estado)) ?? []).map(mensajeFromDto))
  }
  cambiarEstadoMensaje(id: number, estado: EstadoMensaje) {
    return attempt(() => this.remote.cambiarEstadoMensaje(id, estado))
  }
  eliminarMensaje(id: number) {
    return attempt(() => this.remote.eliminarMensaje(id))
  }
}

export class SitioPublicoRepositoryImpl implements SitioPublicoRepository {
  constructor(private readonly remote: SitioPublicoRemoteDataSource) {}

  portada() {
    return attempt(async () => ((await this.remote.portada()) ?? []).map(bannerFromDto))
  }
  experiencias() {
    return attempt(async () => ((await this.remote.experiencias()) ?? []).map(experienciaFromDto))
  }
  entradas(limite: number, desde: number) {
    return attempt(async () => ((await this.remote.entradas(limite, desde)) ?? []).map(entradaFromDto))
  }
  entrada(slug: string) {
    return attempt(async () => entradaFromDto(await this.remote.entrada(slug)))
  }
  pagina(clave: ClavePagina) {
    return attempt(async () => paginaFromDto(await this.remote.pagina(clave)))
  }
  galeria(entidad: EntidadGaleria, id: number) {
    return attempt(async () => refs(await this.remote.galeria(entidad, id)))
  }
  enviarMensaje(input: MensajeContactoInput) {
    // `sitio` es el cebo para robots: una persona no lo ve y no lo llena.
    return attempt(() => this.remote.enviarMensaje({ ...input, sitio: '' }))
  }
}
