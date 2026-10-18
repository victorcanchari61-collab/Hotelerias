import { ApiPaths } from '@/core/constants/api'
import type { FileTransfer, HttpClient } from '@/core/network/HttpClient'
import type {
  BannerInput,
  ClavePagina,
  Destino,
  EntidadGaleria,
  EntradaInput,
  EstadoMensaje,
  ExperienciaInput,
  MensajeContactoInput,
  PaginaInput,
  TipoMedio,
} from '@/domain/entities/Sitio'
import type {
  BannerDto,
  EntradaDto,
  ExperienciaDto,
  MedioDto,
  MedioRefDto,
  MensajeDto,
  PaginaDto,
} from '../models/sitio.model'

/** Lo que el panel le pide al servidor para administrar el sitio (con la sesión del personal). */
export class SitioRemoteDataSource {
  constructor(private readonly http: HttpClient & FileTransfer) {}

  banners() {
    return this.http.get<BannerDto[] | null>(ApiPaths.sitio.banner)
  }
  crearBanner(body: BannerInput) {
    return this.http.post<BannerDto>(ApiPaths.sitio.banner, body)
  }
  actualizarBanner(id: number, body: BannerInput) {
    return this.http.put<BannerDto>(ApiPaths.sitio.bannerPorId(id), body)
  }
  async eliminarBanner(id: number) {
    await this.http.delete<void>(ApiPaths.sitio.bannerPorId(id))
  }

  medios(tipo?: TipoMedio) {
    return this.http.get<MedioDto[] | null>(ApiPaths.sitio.medio, { query: { tipo } })
  }
  subirMedio(archivo: File) {
    const form = new FormData()
    form.append('archivo', archivo)
    return this.http.upload<MedioDto>(ApiPaths.sitio.medio, form)
  }
  actualizarMedio(id: number, descripcion: string) {
    return this.http.put<MedioDto>(ApiPaths.sitio.medioPorId(id), { descripcion })
  }
  async eliminarMedio(id: number) {
    await this.http.delete<void>(ApiPaths.sitio.medioPorId(id))
  }

  destinos() {
    return this.http.get<Destino[] | null>(ApiPaths.sitio.destinos)
  }
  galeria(entidad: EntidadGaleria, id: number) {
    return this.http.get<MedioRefDto[] | null>(ApiPaths.sitio.galeria(entidad, id))
  }
  guardarGaleria(entidad: EntidadGaleria, id: number, medioIds: number[]) {
    return this.http.put<MedioRefDto[] | null>(ApiPaths.sitio.galeria(entidad, id), { medioIds })
  }

  experiencias() {
    return this.http.get<ExperienciaDto[] | null>(ApiPaths.sitio.experiencia)
  }
  crearExperiencia(body: ExperienciaInput) {
    return this.http.post<ExperienciaDto>(ApiPaths.sitio.experiencia, body)
  }
  actualizarExperiencia(id: number, body: ExperienciaInput) {
    return this.http.put<ExperienciaDto>(ApiPaths.sitio.experienciaPorId(id), body)
  }
  async eliminarExperiencia(id: number) {
    await this.http.delete<void>(ApiPaths.sitio.experienciaPorId(id))
  }

  entradas() {
    return this.http.get<EntradaDto[] | null>(ApiPaths.sitio.entrada)
  }
  entrada(id: number) {
    return this.http.get<EntradaDto>(ApiPaths.sitio.entradaPorId(id))
  }
  crearEntrada(body: EntradaInput) {
    return this.http.post<EntradaDto>(ApiPaths.sitio.entrada, body)
  }
  actualizarEntrada(id: number, body: EntradaInput) {
    return this.http.put<EntradaDto>(ApiPaths.sitio.entradaPorId(id), body)
  }
  publicarEntrada(id: number, publicar: boolean) {
    return this.http.post<EntradaDto>(ApiPaths.sitio.entradaEstado(id, publicar))
  }
  async eliminarEntrada(id: number) {
    await this.http.delete<void>(ApiPaths.sitio.entradaPorId(id))
  }

  pagina(clave: ClavePagina) {
    return this.http.get<PaginaDto>(ApiPaths.sitio.pagina(clave))
  }
  guardarPagina(clave: ClavePagina, body: PaginaInput) {
    return this.http.put<PaginaDto>(ApiPaths.sitio.pagina(clave), body)
  }

  mensajes(estado?: EstadoMensaje) {
    return this.http.get<MensajeDto[] | null>(ApiPaths.sitio.mensaje, { query: { estado } })
  }
  async cambiarEstadoMensaje(id: number, estado: EstadoMensaje) {
    await this.http.patch<void>(ApiPaths.sitio.mensajeEstado(id), { estado })
  }
  async eliminarMensaje(id: number) {
    await this.http.delete<void>(ApiPaths.sitio.mensajePorId(id))
  }
}

/** Lo que la web pública lee, sin sesión. */
export class SitioPublicoRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  portada() {
    return this.http.get<BannerDto[] | null>(ApiPaths.portal.portada)
  }
  experiencias() {
    return this.http.get<ExperienciaDto[] | null>(ApiPaths.portal.experiencias)
  }
  entradas(limite: number, desde: number) {
    return this.http.get<EntradaDto[] | null>(ApiPaths.portal.entradas, { query: { limite, desde } })
  }
  entrada(slug: string) {
    return this.http.get<EntradaDto>(ApiPaths.portal.entrada(slug))
  }
  pagina(clave: ClavePagina) {
    return this.http.get<PaginaDto>(ApiPaths.portal.pagina(clave))
  }
  galeria(entidad: EntidadGaleria, id: number) {
    return this.http.get<MedioRefDto[] | null>(ApiPaths.portal.galeria(entidad, id))
  }
  async enviarMensaje(body: MensajeContactoInput & { sitio: string }) {
    await this.http.post<void>(ApiPaths.portal.mensajeContacto, body, { auth: false })
  }
}
