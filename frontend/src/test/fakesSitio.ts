/**
 * Dobles del sitio web (contenido de la web pública). Implementan la MISMA interfaz
 * que los reales; guardan todo en memoria y exponen las listas para preparar escenarios.
 */
import { NotFoundFailure, ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
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
} from '@/domain/entities/Sitio'
import type { SitioPublicoRepository, SitioRepository } from '@/domain/repositories/SitioRepository'

type R<T> = Promise<Either<Failure, T>>
const noExiste = (que: string) => left<Failure, never>(new NotFoundFailure(`${que} no existe.`))

export function medioDe(parcial: Partial<Medio> = {}): Medio {
  const id = parcial.id ?? 1
  return {
    id,
    tipo: 'imagen',
    url: `/uploads/sitio/${String(id).padStart(32, '0')}.jpg`,
    descripcion: 'Fachada del hotel',
    ancho: 1600,
    alto: 900,
    nombreOriginal: `foto-${id}.jpg`,
    mime: 'image/jpeg',
    bytes: 250_000,
    usos: 0,
    creadoEn: new Date('2026-10-01T10:00:00Z'),
    ...parcial,
  }
}

export function bannerDe(parcial: Partial<Banner> = {}): Banner {
  const medio = parcial.medio === undefined ? medioDe() : parcial.medio
  return {
    id: 1,
    orden: 1,
    titulo: 'Cuatro ciudades, una misma casa',
    subtitulo: 'Lima, Cusco, Arequipa y Paracas',
    medioId: medio?.id ?? null,
    medio,
    enlaceTexto: 'Ver ofertas',
    enlaceUrl: '/ofertas',
    activo: true,
    desde: null,
    hasta: null,
    ...parcial,
  }
}

export function experienciaDe(parcial: Partial<Experiencia> = {}): Experiencia {
  return {
    id: 1,
    slug: 'gastronomia',
    titulo: 'Gastronomía de autor',
    resumen: 'Cocina peruana contemporánea.',
    texto: 'Un menú de degustación con productos de cada región.',
    ejemplos: ['Cena de degustación', 'Clase de cocina criolla'],
    medioId: null,
    medio: null,
    orden: 1,
    activo: true,
    ...parcial,
  }
}

export function entradaDe(parcial: Partial<Entrada> = {}): Entrada {
  return {
    id: 1,
    slug: 'una-noche-en-el-valle',
    titulo: 'Una noche en el Valle Sagrado',
    resumen: 'Lo que vimos desde la terraza.',
    cuerpo: '## Llegada\n\nEl **valle** al atardecer.',
    portadaId: null,
    portada: null,
    estado: 'publicada',
    publicadaEn: new Date('2026-10-10T12:00:00Z'),
    autor: 'Equipo Velothr',
    creadoEn: new Date('2026-10-09T12:00:00Z'),
    actualizadoEn: new Date('2026-10-10T12:00:00Z'),
    ...parcial,
  }
}

export function paginaDe(parcial: Partial<Pagina> = {}): Pagina {
  return { clave: 'nosotros', titulo: 'Nuestra casa', cuerpo: 'Somos cuatro hoteles.', medioId: null, medio: null, actualizadaEn: null, ...parcial }
}

export function mensajeDe(parcial: Partial<Mensaje> = {}): Mensaje {
  return {
    id: 1,
    nombre: 'Lucía Paredes',
    email: 'lucia@correo.pe',
    telefono: '987654321',
    asunto: 'Grupo de 12 personas',
    mensaje: 'Queremos reservar seis habitaciones en diciembre.',
    estado: 'nuevo',
    creadoEn: new Date('2026-10-17T15:30:00Z'),
    ...parcial,
  }
}

const aRef = (m: Medio): MedioRef => ({ id: m.id, tipo: m.tipo, url: m.url, descripcion: m.descripcion, ancho: m.ancho, alto: m.alto })

/** El panel del sitio web, en memoria. */
export class FakeSitioRepository implements SitioRepository {
  banners_: Banner[] = []
  medios_: Medio[] = []
  experiencias_: Experiencia[] = []
  entradas_: Entrada[] = []
  paginas: Record<ClavePagina, Pagina> = {
    nosotros: paginaDe(),
    contacto: paginaDe({ clave: 'contacto', titulo: 'Escríbenos', cuerpo: '' }),
  }
  mensajes_: Mensaje[] = []
  destinos_: Destino[] = [
    { entidad: 'sede', id: 1, nombre: 'Velothr Miraflores', detalle: 'Lima' },
    { entidad: 'tipo_habitacion', id: 10, nombre: 'Habitación Deluxe', detalle: 'Velothr Miraflores' },
  ]
  galerias: Record<string, MedioRef[]> = {}
  subidos: string[] = []
  private siguiente = 100

  private medioPorId(id: number | null): MedioRef | null {
    const m = this.medios_.find((x) => x.id === id)
    return m ? aRef(m) : null
  }

  async banners(): R<Banner[]> {
    return right([...this.banners_].sort((a, b) => a.orden - b.orden))
  }
  async crearBanner(i: BannerInput): R<Banner> {
    const b: Banner = { ...i, id: this.siguiente++, medio: this.medioPorId(i.medioId) }
    this.banners_.push(b)
    return right(b)
  }
  async actualizarBanner(id: number, i: BannerInput): R<Banner> {
    const idx = this.banners_.findIndex((b) => b.id === id)
    if (idx < 0) return noExiste('El banner')
    this.banners_[idx] = { ...i, id, medio: this.medioPorId(i.medioId) }
    return right(this.banners_[idx])
  }
  async eliminarBanner(id: number): R<void> {
    this.banners_ = this.banners_.filter((b) => b.id !== id)
    return right(undefined)
  }

  async medios(tipo?: TipoMedio): R<Medio[]> {
    return right(this.medios_.filter((m) => !tipo || m.tipo === tipo).map((m) => ({ ...m })))
  }
  async subirMedio(archivo: File): R<Medio> {
    this.subidos.push(archivo.name)
    const m = medioDe({ id: this.siguiente++, nombreOriginal: archivo.name, tipo: archivo.type.startsWith('video') ? 'video' : 'imagen', bytes: archivo.size })
    this.medios_.push(m)
    return right(m)
  }
  async actualizarMedio(id: number, descripcion: string): R<Medio> {
    const m = this.medios_.find((x) => x.id === id)
    if (!m) return noExiste('El archivo')
    m.descripcion = descripcion
    return right(m)
  }
  async eliminarMedio(id: number): R<void> {
    const m = this.medios_.find((x) => x.id === id)
    if (m && m.usos > 0) return left(new ValidationFailure('El archivo está en uso y no se puede eliminar.'))
    this.medios_ = this.medios_.filter((x) => x.id !== id)
    return right(undefined)
  }

  async destinos(): R<Destino[]> {
    return right([...this.destinos_])
  }
  async galeria(entidad: EntidadGaleria, id: number): R<MedioRef[]> {
    return right(this.galerias[`${entidad}:${id}`] ?? [])
  }
  async guardarGaleria(entidad: EntidadGaleria, id: number, medioIds: number[]): R<MedioRef[]> {
    const fotos = medioIds.map((i) => this.medioPorId(i)).filter((m): m is MedioRef => m !== null)
    this.galerias[`${entidad}:${id}`] = fotos
    return right(fotos)
  }

  async experiencias(): R<Experiencia[]> {
    return right([...this.experiencias_].sort((a, b) => a.orden - b.orden))
  }
  async crearExperiencia(i: ExperienciaInput): R<Experiencia> {
    const e: Experiencia = { ...i, id: this.siguiente++, slug: i.titulo.toLowerCase().replace(/\s+/g, '-'), medio: this.medioPorId(i.medioId) }
    this.experiencias_.push(e)
    return right(e)
  }
  async actualizarExperiencia(id: number, i: ExperienciaInput): R<Experiencia> {
    const idx = this.experiencias_.findIndex((e) => e.id === id)
    if (idx < 0) return noExiste('La experiencia')
    this.experiencias_[idx] = { ...this.experiencias_[idx], ...i, medio: this.medioPorId(i.medioId) }
    return right(this.experiencias_[idx])
  }
  async eliminarExperiencia(id: number): R<void> {
    this.experiencias_ = this.experiencias_.filter((e) => e.id !== id)
    return right(undefined)
  }

  async entradas(): R<Entrada[]> {
    return right([...this.entradas_])
  }
  async entrada(id: number): R<Entrada> {
    const e = this.entradas_.find((x) => x.id === id)
    return e ? right(e) : noExiste('La historia')
  }
  async crearEntrada(i: EntradaInput): R<Entrada> {
    const e = entradaDe({ ...i, id: this.siguiente++, slug: i.titulo.toLowerCase().replace(/\s+/g, '-'), estado: 'borrador', publicadaEn: null, portada: this.medioPorId(i.portadaId) })
    this.entradas_.push(e)
    return right(e)
  }
  async actualizarEntrada(id: number, i: EntradaInput): R<Entrada> {
    const idx = this.entradas_.findIndex((e) => e.id === id)
    if (idx < 0) return noExiste('La historia')
    this.entradas_[idx] = { ...this.entradas_[idx], ...i, portada: this.medioPorId(i.portadaId) }
    return right(this.entradas_[idx])
  }
  async publicarEntrada(id: number, publicar: boolean): R<Entrada> {
    const idx = this.entradas_.findIndex((e) => e.id === id)
    if (idx < 0) return noExiste('La historia')
    this.entradas_[idx] = { ...this.entradas_[idx], estado: publicar ? 'publicada' : 'borrador', publicadaEn: publicar ? new Date('2026-11-01T12:00:00Z') : null }
    return right(this.entradas_[idx])
  }
  async eliminarEntrada(id: number): R<void> {
    this.entradas_ = this.entradas_.filter((e) => e.id !== id)
    return right(undefined)
  }

  async pagina(clave: ClavePagina): R<Pagina> {
    return right(this.paginas[clave])
  }
  async guardarPagina(clave: ClavePagina, i: PaginaInput): R<Pagina> {
    this.paginas[clave] = { ...this.paginas[clave], ...i, medio: this.medioPorId(i.medioId) }
    return right(this.paginas[clave])
  }

  async mensajes(estado?: EstadoMensaje): R<Mensaje[]> {
    return right(this.mensajes_.filter((m) => !estado || m.estado === estado).map((m) => ({ ...m })))
  }
  async cambiarEstadoMensaje(id: number, estado: EstadoMensaje): R<void> {
    const m = this.mensajes_.find((x) => x.id === id)
    if (!m) return noExiste('El mensaje')
    m.estado = estado
    return right(undefined)
  }
  async eliminarMensaje(id: number): R<void> {
    this.mensajes_ = this.mensajes_.filter((m) => m.id !== id)
    return right(undefined)
  }
}

/** Lo que lee la web pública. Por defecto, una portada vacía: la web cae a su portada básica. */
export class FakeSitioPublicoRepository implements SitioPublicoRepository {
  portada_: Banner[] = []
  experiencias_: Experiencia[] = []
  entradas_: Entrada[] = []
  paginas: Partial<Record<ClavePagina, Pagina>> = {}
  galerias: Record<string, MedioRef[]> = {}
  enviados: MensajeContactoInput[] = []
  falloAlEnviar: Failure | null = null

  async portada(): R<Banner[]> {
    return right(this.portada_)
  }
  async experiencias(): R<Experiencia[]> {
    return right(this.experiencias_)
  }
  async entradas(limite: number, desde: number): R<Entrada[]> {
    return right(this.entradas_.slice(desde, desde + limite))
  }
  async entrada(slug: string): R<Entrada> {
    const e = this.entradas_.find((x) => x.slug === slug)
    return e ? right(e) : noExiste('La historia')
  }
  async pagina(clave: ClavePagina): R<Pagina> {
    const p = this.paginas[clave]
    return p ? right(p) : noExiste('La página')
  }
  async galeria(entidad: EntidadGaleria, id: number): R<MedioRef[]> {
    return right(this.galerias[`${entidad}:${id}`] ?? [])
  }
  async enviarMensaje(input: MensajeContactoInput): R<void> {
    if (this.falloAlEnviar) return left(this.falloAlEnviar)
    this.enviados.push(input)
    return right(undefined)
  }
}
