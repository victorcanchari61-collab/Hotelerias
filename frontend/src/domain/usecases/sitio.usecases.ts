import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import { esFechaISO } from '../fechas'
import { MAX_GALERIA, MAX_IMAGEN_BYTES, MAX_VIDEO_BYTES } from '../entities/Sitio'
import type {
  Banner,
  BannerInput,
  EntidadGaleria,
  Entrada,
  EntradaInput,
  Experiencia,
  ExperienciaInput,
  Medio,
  MedioRef,
  MensajeContactoInput,
  Pagina,
  PaginaInput,
  ClavePagina,
} from '../entities/Sitio'
import type { SitioPublicoRepository, SitioRepository } from '../repositories/SitioRepository'
import { esEmail } from '../validation'
import type { UseCase } from './UseCase'

type Res<T> = Promise<Either<Failure, T>>

/**
 * Un caso de uso que solo pasa la consulta al repositorio. Los que SÍ tienen reglas
 * (validar antes de ir al servidor) son clases propias, abajo.
 */
export class Directo<I, O> implements UseCase<I, O> {
  constructor(private readonly f: (entrada: I) => Res<O>) {}
  execute(entrada: I): Res<O> {
    return this.f(entrada)
  }
}

// ---------------------------------------------------------------- validaciones (puras)

const falla = (m: string) => new ValidationFailure(m)

/** Un enlace de la web: una ruta propia («/ofertas») o una dirección https. Lo demás, no. */
export function enlaceValido(valor: string): boolean {
  const v = valor.trim()
  if (v === '') return true
  if (v.startsWith('/')) return !v.startsWith('//') && !/[\\\s]/.test(v)
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && u.host !== '' && !/\s/.test(v)
  } catch {
    return false
  }
}

const FORMATOS: Record<string, 'imagen' | 'video'> = {
  'image/jpeg': 'imagen',
  'image/png': 'imagen',
  'image/webp': 'imagen',
  'image/gif': 'imagen',
  'video/mp4': 'video',
  'video/webm': 'video',
}

/** Avisa ANTES de subir un archivo que el servidor va a rechazar. El servidor decide por el contenido. */
export function validarArchivo(a: { name: string; size: number; type: string }): ValidationFailure | null {
  const tipo = FORMATOS[a.type]
  if (!tipo) return falla('Sube una foto (JPG, PNG, WebP o GIF) o un video (MP4 o WebM).')
  if (a.size <= 0) return falla('El archivo está vacío.')
  const max = tipo === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGEN_BYTES
  if (a.size > max) {
    return falla(`${tipo === 'video' ? 'Los videos' : 'Las fotos'} pueden pesar hasta ${Math.round(max / 1024 / 1024)} MB.`)
  }
  return null
}

export function validarBanner(i: BannerInput): ValidationFailure | null {
  const titulo = i.titulo.trim()
  if (titulo === '') return falla('Ponle un título al banner.')
  if ([...titulo].length > 120) return falla('El título no puede pasar de 120 caracteres.')
  if ([...i.subtitulo.trim()].length > 200) return falla('El subtítulo no puede pasar de 200 caracteres.')
  if ([...i.enlaceTexto.trim()].length > 40) return falla('El texto del botón no puede pasar de 40 caracteres.')
  const url = i.enlaceUrl.trim()
  if (!enlaceValido(url)) return falla('El enlace debe empezar con / (una página de la web) o con https://.')
  if (url !== '' && i.enlaceTexto.trim() === '') return falla('Ponle un texto al botón, o quita el enlace.')
  if (url === '' && i.enlaceTexto.trim() !== '') return falla('El botón necesita un enlace, o quita su texto.')
  for (const f of [i.desde, i.hasta]) if (f && !esFechaISO(f)) return falla('Las fechas no son válidas.')
  if (i.desde && i.hasta && i.hasta < i.desde) return falla('«Hasta» no puede ser anterior a «Desde».')
  return null
}

export function validarExperiencia(i: ExperienciaInput): ValidationFailure | null {
  if (i.titulo.trim() === '') return falla('Ponle un título a la experiencia.')
  if ([...i.titulo.trim()].length > 80) return falla('El título no puede pasar de 80 caracteres.')
  if ([...i.resumen.trim()].length > 160) return falla('El resumen no puede pasar de 160 caracteres.')
  if ([...i.texto.trim()].length > 3000) return falla('El texto no puede pasar de 3000 caracteres.')
  if (i.ejemplos.map((e) => e.trim()).filter(Boolean).length > 8) return falla('Una experiencia admite hasta 8 ejemplos.')
  return null
}

export function validarEntrada(i: EntradaInput): ValidationFailure | null {
  if (i.titulo.trim() === '') return falla('Ponle un título a la historia.')
  if ([...i.titulo.trim()].length > 120) return falla('El título no puede pasar de 120 caracteres.')
  if ([...i.resumen.trim()].length > 240) return falla('El resumen no puede pasar de 240 caracteres.')
  if ([...i.cuerpo].length > 20000) return falla('El texto no puede pasar de 20000 caracteres.')
  return null
}

export function validarPagina(i: PaginaInput): ValidationFailure | null {
  if (i.titulo.trim() === '') return falla('Ponle un título a la página.')
  if ([...i.titulo.trim()].length > 80) return falla('El título no puede pasar de 80 caracteres.')
  if ([...i.cuerpo].length > 10000) return falla('El texto no puede pasar de 10000 caracteres.')
  return null
}

export function validarMensaje(i: MensajeContactoInput): ValidationFailure | null {
  if (i.nombre.trim() === '') return falla('Dinos tu nombre.')
  if ([...i.nombre.trim()].length > 80) return falla('El nombre no puede pasar de 80 caracteres.')
  if (!esEmail(i.email.trim())) return falla('El correo no es válido.')
  if ([...i.telefono.trim()].length > 30) return falla('El teléfono no puede pasar de 30 caracteres.')
  if ([...i.asunto.trim()].length > 120) return falla('El asunto no puede pasar de 120 caracteres.')
  const m = [...i.mensaje.trim()].length
  if (m < 10) return falla('Cuéntanos un poco más: el mensaje es muy corto.')
  if (m > 2000) return falla('El mensaje no puede pasar de 2000 caracteres.')
  return null
}

// ---------------------------------------------------------------- casos de uso con reglas

/** Una función que valida y, si pasa, llama al repositorio. */
class Validado<I, O> implements UseCase<I, O> {
  constructor(
    private readonly validar: (entrada: I) => ValidationFailure | null,
    private readonly f: (entrada: I) => Res<O>,
  ) {}
  async execute(entrada: I): Res<O> {
    const mala = this.validar(entrada)
    return mala ? left(mala) : this.f(entrada)
  }
}

export const crearValidado = <I, O>(validar: (e: I) => ValidationFailure | null, f: (e: I) => Res<O>) =>
  new Validado<I, O>(validar, f)

export interface ConId<T> {
  id: number
  datos: T
}

export function casosDeSitio(repo: SitioRepository) {
  return {
    listarBanners: new Directo<void, Banner[]>(() => repo.banners()),
    crearBanner: crearValidado(validarBanner, (i: BannerInput) => repo.crearBanner(i)),
    actualizarBanner: crearValidado(
      ({ datos }: ConId<BannerInput>) => validarBanner(datos),
      ({ id, datos }) => repo.actualizarBanner(id, datos),
    ),
    eliminarBanner: new Directo<number, void>((id) => repo.eliminarBanner(id)),

    listarMedios: new Directo<'imagen' | 'video' | undefined, Medio[]>((tipo) => repo.medios(tipo)),
    subirMedio: crearValidado(validarArchivo, (a: File) => repo.subirMedio(a)),
    actualizarMedio: new Directo<{ id: number; descripcion: string }, Medio>(({ id, descripcion }) =>
      repo.actualizarMedio(id, descripcion.trim()),
    ),
    eliminarMedio: new Directo<number, void>((id) => repo.eliminarMedio(id)),

    destinosGaleria: new Directo<void, Awaited<ReturnType<SitioRepository['destinos']>> extends Either<Failure, infer D> ? D : never>(() =>
      repo.destinos(),
    ),
    verGaleria: new Directo<{ entidad: EntidadGaleria; id: number }, MedioRef[]>(({ entidad, id }) => repo.galeria(entidad, id)),
    guardarGaleria: crearValidado(
      ({ medioIds }: { entidad: EntidadGaleria; id: number; medioIds: number[] }) =>
        medioIds.length > MAX_GALERIA
          ? falla(`Una galería admite hasta ${MAX_GALERIA} archivos.`)
          : new Set(medioIds).size !== medioIds.length
            ? falla('Un mismo archivo no puede estar dos veces en la galería.')
            : null,
      ({ entidad, id, medioIds }) => repo.guardarGaleria(entidad, id, medioIds),
    ),

    listarExperiencias: new Directo<void, Experiencia[]>(() => repo.experiencias()),
    crearExperiencia: crearValidado(validarExperiencia, (i: ExperienciaInput) => repo.crearExperiencia(i)),
    actualizarExperiencia: crearValidado(
      ({ datos }: ConId<ExperienciaInput>) => validarExperiencia(datos),
      ({ id, datos }) => repo.actualizarExperiencia(id, datos),
    ),
    eliminarExperiencia: new Directo<number, void>((id) => repo.eliminarExperiencia(id)),

    listarEntradas: new Directo<void, Entrada[]>(() => repo.entradas()),
    verEntrada: new Directo<number, Entrada>((id) => repo.entrada(id)),
    crearEntrada: crearValidado(validarEntrada, (i: EntradaInput) => repo.crearEntrada(i)),
    actualizarEntrada: crearValidado(
      ({ datos }: ConId<EntradaInput>) => validarEntrada(datos),
      ({ id, datos }) => repo.actualizarEntrada(id, datos),
    ),
    publicarEntrada: new Directo<{ id: number; publicar: boolean }, Entrada>(({ id, publicar }) => repo.publicarEntrada(id, publicar)),
    eliminarEntrada: new Directo<number, void>((id) => repo.eliminarEntrada(id)),

    verPagina: new Directo<ClavePagina, Pagina>((clave) => repo.pagina(clave)),
    guardarPagina: crearValidado(
      ({ datos }: { clave: ClavePagina; datos: PaginaInput }) => validarPagina(datos),
      ({ clave, datos }) => repo.guardarPagina(clave, datos),
    ),

    listarMensajes: new Directo<'nuevo' | 'leido' | 'respondido' | undefined, Awaited<ReturnType<SitioRepository['mensajes']>> extends Either<Failure, infer M> ? M : never>((estado) =>
      repo.mensajes(estado),
    ),
    cambiarEstadoMensaje: new Directo<{ id: number; estado: 'nuevo' | 'leido' | 'respondido' }, void>(({ id, estado }) =>
      repo.cambiarEstadoMensaje(id, estado),
    ),
    eliminarMensaje: new Directo<number, void>((id) => repo.eliminarMensaje(id)),
  }
}

export function casosPublicosDeSitio(repo: SitioPublicoRepository) {
  return {
    portadaPublica: new Directo<void, Banner[]>(() => repo.portada()),
    experienciasPublicas: new Directo<void, Experiencia[]>(() => repo.experiencias()),
    entradasPublicas: new Directo<{ limite: number; desde: number }, Entrada[]>(({ limite, desde }) => repo.entradas(limite, desde)),
    entradaPublica: new Directo<string, Entrada>((slug) => repo.entrada(slug)),
    paginaPublica: new Directo<ClavePagina, Pagina>((clave) => repo.pagina(clave)),
    galeriaPublica: new Directo<{ entidad: EntidadGaleria; id: number }, MedioRef[]>(({ entidad, id }) => repo.galeria(entidad, id)),
    enviarMensajeContacto: crearValidado(validarMensaje, (i: MensajeContactoInput) =>
      repo.enviarMensaje({
        nombre: i.nombre.trim(),
        email: i.email.trim(),
        telefono: i.telefono.trim(),
        asunto: i.asunto.trim(),
        mensaje: i.mensaje.trim(),
      }),
    ),
  }
}
