import { API_BASE_URL } from './const_glob'
import { clearSession, getToken } from './authStorage'

/** La acción que el servidor negó, tal como la nombra el catálogo de permisos. */
export interface PermisoNegado {
  submodulo: string
  accion: string
}

/** Error tipado con la forma que devuelve ExceptionMiddleware del backend. */
export class ApiError extends Error {
  readonly statusCode: number
  readonly errors: string[]

  /** Qué permiso faltaba, cuando el servidor devolvió un 403 del filtro. */
  readonly permiso?: PermisoNegado

  constructor(message: string, statusCode: number, errors: string[] = [], permiso?: PermisoNegado) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.errors = errors
    this.permiso = permiso
  }
}

interface ApiErrorBody {
  statusCode?: number
  message?: string
  errors?: string[] | null
  /** Solo en los 403 del filtro de permisos. */
  submodulo?: string
  accion?: string
}

/**
 * A quién avisar cuando el servidor niega una acción.
 *
 * Es un solo enganche global en vez de un try/catch en cada pantalla: hay
 * decenas de sitios que pueden toparse con un 403, y pedirle a cada uno que se
 * acuerde de abrir el modal garantiza que la mitad no lo haga. Aquí se avisa
 * una vez y quien escucha decide qué mostrar.
 */
let avisarPermisoNegado: ((permiso: PermisoNegado) => void) | null = null

export function alNegarPermiso(callback: ((permiso: PermisoNegado) => void) | null) {
  avisarPermisoNegado = callback
}

/*
 * Sesion vencida.
 *
 * El token dura unos dias y al caducar TODAS las pantallas empiezan a decir
 * "Error 401" sin explicar nada: la de perfil se ve vacia, el stock sin
 * filas, y parece que el sistema se rompio. Como el token ya no sirve, lo
 * unico que queda es soltar la sesion y mandar a entrar de nuevo. Se hace
 * aqui, una vez, porque el 401 puede caer en cualquiera de las decenas de
 * llamadas.
 */
let sesionVencida = false

function avisarSesionVencida() {
  // Una sola vez: una pantalla dispara cinco llamadas y las cinco fallan.
  if (sesionVencida) return
  sesionVencida = true

  clearSession()
  // Recarga entera y a la raiz: sin sesion, App muestra el login. Recargar
  // ademas tira el estado a medio cargar de la pantalla que fallo.
  window.location.assign('/')
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Adjunta el token guardado en la cabecera Authorization. Por defecto true. */
  auth?: boolean
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options

  const finalHeaders = new Headers(headers)
  finalHeaders.set('Accept', 'application/json')
  if (body !== undefined) finalHeaders.set('Content-Type', 'application/json')

  const token = auth ? getToken() : null
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('No pudimos conectar con el servidor. Revisa tu conexión.', 0)
  }

  const raw = await response.text()
  const data = raw ? (JSON.parse(raw) as unknown) : null

  if (!response.ok) {
    const problem = (data ?? {}) as ApiErrorBody

    // El 403 del filtro de permisos trae qué faltaba; el resto de 403 (o un
    // 401 de sesion vencida) no, y ahi no hay nada que solicitar.
    const permiso =
      response.status === 403 && problem.submodulo && problem.accion
        ? { submodulo: problem.submodulo, accion: problem.accion }
        : undefined

    /*
     * Solo se ofrece pedir permiso para lo que la persona pulsó. Un "ver"
     * negado casi nunca lo pidió ella: las pantallas cargan de paso catálogos
     * de otros módulos — métodos de pago, almacenes — y saltarle un modal por
     * cada uno al abrir una vista es ruido que además desconcierta ("¿por qué
     * me habla de Métodos de pago si abrí Notas de venta?"). Entrar a una
     * pantalla se pide desde la propia pantalla bloqueada.
     */
    if (permiso && permiso.accion !== 'ver') avisarPermisoNegado?.(permiso)
    // Solo si la llamada llevaba un token: un 401 SIN token (el login con la clave mal escrita, por
    // ejemplo) es "credenciales inválidas", no "sesión vencida". Tratarlo como vencida recargaba toda
    // la pagina antes de que el formulario alcanzara a mostrar el error, y este desaparecia sin
    // explicacion.
    if (response.status === 401 && token) avisarSesionVencida()

    throw new ApiError(
      problem.message ?? `Error ${response.status}`,
      problem.statusCode ?? response.status,
      problem.errors ?? [],
      permiso,
    )
  }

  return data as T
}

/**
 * Baja un archivo que sirve la API — hoy, los PDF de los documentos.
 *
 * No usa apiFetch porque aquello lee la respuesta como JSON y aquí llega un
 * binario. Y no puede ser un enlace normal: el endpoint pide el token, y un
 * `<a href>` no manda cabeceras, así que hay que traer el archivo y entregarlo
 * desde memoria.
 *
 * El error sí viene en JSON: si falla, el cuerpo es el mismo problema de
 * siempre y se levanta como ApiError, incluido el 403 que abre el modal de
 * pedir permiso.
 */
export async function obtenerArchivo(
  path: string,
  nombrePorDefecto: string,
): Promise<{ blob: Blob; nombre: string }> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers })
  } catch {
    throw new ApiError('No pudimos conectar con el servidor. Revisa tu conexión.', 0)
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as ApiErrorBody
    const permiso =
      response.status === 403 && problem.submodulo && problem.accion
        ? { submodulo: problem.submodulo, accion: problem.accion }
        : undefined

    if (permiso && permiso.accion !== 'ver') avisarPermisoNegado?.(permiso)
    if (response.status === 401) avisarSesionVencida()

    throw new ApiError(
      problem.message ?? `Error ${response.status}`,
      problem.statusCode ?? response.status,
      problem.errors ?? [],
      permiso,
    )
  }

  // El backend ya eligió el nombre del archivo, con el número del documento
  // dentro; el de aquí solo cubre el caso de que no venga la cabecera.
  const disposicion = response.headers.get('Content-Disposition') ?? ''
  const nombre = /filename="?([^";]+)"?/i.exec(disposicion)?.[1] ?? nombrePorDefecto

  return { blob: await response.blob(), nombre }
}

/** Guarda en el disco un archivo ya traído con {@link obtenerArchivo}. */
export function guardarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombre
    enlace.click()
  } finally {
    // Sin esto el archivo se queda en memoria hasta recargar la página, y
    // quien imprime veinte documentos seguidos los acumula todos.
    URL.revokeObjectURL(url)
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  del: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
}
