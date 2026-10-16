/**
 * Los puertos de red. Los datasources dependen de ESTAS interfaces, no de
 * `fetch`: así una prueba les pasa un fake de cuatro líneas, y cambiar de
 * `fetch` a otra cosa no toca ningún datasource.
 *
 * Son dos interfaces y no una porque casi nadie necesita las dos: un
 * datasource de JSON no tiene por qué ver cómo se descarga un PDF.
 */

export type QueryParams = Record<string, string | number | boolean | null | undefined>

export interface RequestOptions {
  query?: QueryParams
  headers?: Record<string, string>
  /**
   * Adjunta el token guardado. Por defecto true. El login lo apaga: un 401
   * SIN token es "credenciales inválidas", no "sesión vencida".
   */
  auth?: boolean
  signal?: AbortSignal
}

/** Peticiones JSON contra la API. */
export interface HttpClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  delete<T>(path: string, options?: RequestOptions): Promise<T>
}

/** Archivos: bajar un binario que sirve la API y subir un formulario. */
export interface FileTransfer {
  /**
   * Trae un archivo. No puede ser un `<a href>`: el endpoint pide el token y
   * un enlace no manda cabeceras.
   */
  download(
    path: string,
    defaultName: string,
    options?: RequestOptions,
  ): Promise<{ blob: Blob; nombre: string }>

  upload<T>(path: string, form: FormData, options?: RequestOptions): Promise<T>
}
