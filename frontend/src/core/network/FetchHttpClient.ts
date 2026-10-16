import { ApiError } from '../errors/exceptions'
import type { PermisoNegado } from '../errors/exceptions'
import type { FileTransfer, HttpClient, QueryParams, RequestOptions } from './HttpClient'

/**
 * A quién avisar de lo que el cliente HTTP no sabe resolver solo.
 *
 * El cliente no sabe qué es una sesión ni un modal: avisa, y quien le importe
 * decide qué hacer. Es un solo enganche en vez de un try/catch en cada
 * pantalla — hay decenas de sitios que pueden toparse con un 401 o un 403, y
 * pedirle a cada uno que se acuerde garantiza que la mitad no lo haga.
 */
export interface HttpEvents {
  /** Una llamada CON token recibió 401: la sesión ya no sirve. */
  onSessionExpired?: () => void
  /** Una acción que la persona pulsó (no un "ver") recibió 403 del guard. */
  onPermissionDenied?: (permiso: PermisoNegado) => void
}

export interface FetchHttpClientConfig {
  baseUrl: string
  /** De dónde sale el token. Se consulta en cada petición, no al construir. */
  tokenProvider: () => string | null
  events?: HttpEvents
  /** Inyectable para pruebas. */
  fetchImpl?: typeof fetch
}

interface ProblemBody {
  statusCode?: number
  message?: string
  errors?: string[] | null
  /** Solo en los 403 del guard de permisos. */
  submodulo?: string
  accion?: string
}

const SIN_CONEXION = 'No pudimos conectar con el servidor. Revisa tu conexión.'

/** Implementa los dos puertos con `fetch`. */
export class FetchHttpClient implements HttpClient, FileTransfer {
  private readonly baseUrl: string
  private readonly tokenProvider: () => string | null
  private readonly events: HttpEvents
  private readonly fetchImpl: typeof fetch

  constructor(config: FetchHttpClientConfig) {
    this.baseUrl = config.baseUrl
    this.tokenProvider = config.tokenProvider
    this.events = config.events ?? {}
    // Sin el bind, `fetch` pierde su `this` (window) al llamarse como método.
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.json<T>('GET', path, undefined, options)
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.json<T>('POST', path, body, options)
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.json<T>('PUT', path, body, options)
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.json<T>('PATCH', path, body, options)
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.json<T>('DELETE', path, undefined, options)
  }

  async upload<T>(path: string, form: FormData, options?: RequestOptions): Promise<T> {
    // Sin Content-Type: el navegador lo pone con el boundary del formulario.
    const response = await this.send('POST', path, form, options, false)
    return (await this.readBody(response)) as T
  }

  async download(path: string, defaultName: string, options?: RequestOptions) {
    const response = await this.send('GET', path, undefined, options, false)
    // El backend ya eligió el nombre (con el número del documento dentro); el
    // de aquí solo cubre el caso de que no venga la cabecera.
    const disposicion = response.headers.get('Content-Disposition') ?? ''
    const nombre = /filename="?([^";]+)"?/i.exec(disposicion)?.[1] ?? defaultName
    return { blob: await response.blob(), nombre }
  }

  // --- internos ---

  private async json<T>(
    method: string,
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const response = await this.send(method, path, body, options, true)
    return (await this.readBody(response)) as T
  }

  /** Arma la petición, la envía y levanta un ApiError si no fue un 2xx. */
  private async send(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions | undefined,
    asJson: boolean,
  ): Promise<Response> {
    const headers = new Headers(options?.headers)
    if (asJson) headers.set('Accept', 'application/json')

    const token = options?.auth === false ? null : this.tokenProvider()
    if (token) headers.set('Authorization', `Bearer ${token}`)

    let payload: BodyInit | undefined
    if (body instanceof FormData) {
      payload = body
    } else if (body !== undefined) {
      headers.set('Content-Type', 'application/json')
      payload = JSON.stringify(body)
    }

    let response: Response
    try {
      response = await this.fetchImpl(this.url(path, options?.query), {
        method,
        headers,
        body: payload,
        signal: options?.signal,
      })
    } catch (error) {
      // Una petición cancelada a propósito no es "sin conexión".
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new ApiError(SIN_CONEXION, 0)
    }

    if (!response.ok) await this.fail(response, token !== null)
    return response
  }

  private async fail(response: Response, hadToken: boolean): Promise<never> {
    const problem = await this.readProblem(response)

    // El 403 del guard trae qué faltaba; cualquier otro 403 (o un 401) no, y
    // ahí no hay nada que solicitar.
    const permiso: PermisoNegado | undefined =
      response.status === 403 && problem.submodulo && problem.accion
        ? { submodulo: problem.submodulo, accion: problem.accion }
        : undefined

    /*
     * Solo se ofrece pedir permiso para lo que la persona pulsó. Un "ver"
     * negado casi nunca lo pidió ella: las pantallas cargan de paso catálogos
     * de otros módulos, y saltarle un modal por cada uno al abrir una vista
     * es ruido que además desconcierta. Entrar a una pantalla se pide desde
     * la propia pantalla bloqueada.
     */
    if (permiso && permiso.accion !== 'ver') this.events.onPermissionDenied?.(permiso)

    // Solo si la llamada llevaba token: un 401 SIN token (el login con la
    // clave mal escrita) es "credenciales inválidas", no "sesión vencida".
    if (response.status === 401 && hadToken) this.events.onSessionExpired?.()

    throw new ApiError(
      problem.message ?? `Error ${response.status}`,
      problem.statusCode ?? response.status,
      problem.errors ?? [],
      permiso,
    )
  }

  private async readProblem(response: Response): Promise<ProblemBody> {
    try {
      const raw = await response.text()
      const parsed: unknown = raw ? JSON.parse(raw) : null
      return parsed && typeof parsed === 'object' ? (parsed as ProblemBody) : {}
    } catch {
      // Un 502 de un proxy responde HTML: no es JSON y no debe romper el manejo.
      return {}
    }
  }

  private async readBody(response: Response): Promise<unknown> {
    const raw = await response.text()
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      throw new ApiError('El servidor respondió algo que no se pudo leer.', response.status)
    }
  }

  private url(path: string, query?: QueryParams): string {
    const base = `${this.baseUrl}${path}`
    if (!query) return base
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.set(key, String(value))
    }
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }
}
