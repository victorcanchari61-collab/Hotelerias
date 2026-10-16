/**
 * FACHADA de compatibilidad. El cliente HTTP real vive en `core/network`.
 *
 * Existe porque componentes del kit de UI (AccionPdf, VisorReportePdf) y los
 * clientes de API heredados (alertasApi, consultaApi, ubigeoApi) ya importan
 * de aquí. Código nuevo: recibir el HttpClient del contenedor
 * (`useDependencies().http`) o, mejor, un caso de uso; no importar este archivo.
 */
import { ApiError } from '@/core/errors/exceptions'
import type { PermisoNegado } from '@/core/errors/exceptions'
import type { RequestOptions } from '@/core/network/HttpClient'
import { saveBlob } from '@/core/utils/files'
import { getContainer } from '@/di'

export { ApiError }
export type { PermisoNegado }

let cancelarSuscripcion: (() => void) | null = null

/**
 * A quién avisar cuando el servidor niega una acción. Un solo oyente: llamarla
 * de nuevo reemplaza al anterior, y `null` lo quita.
 */
export function alNegarPermiso(callback: ((permiso: PermisoNegado) => void) | null) {
  cancelarSuscripcion?.()
  cancelarSuscripcion = callback ? getContainer().events.permissionDenied.subscribe(callback) : null
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => getContainer().http.get<T>(path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    getContainer().http.post<T>(path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    getContainer().http.put<T>(path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    getContainer().http.patch<T>(path, body, options),
  del: <T>(path: string, options?: RequestOptions) => getContainer().http.delete<T>(path, options),
}

/** Baja un archivo que sirve la API (hoy, los PDF de los documentos). */
export function obtenerArchivo(path: string, nombrePorDefecto: string) {
  return getContainer().http.download(path, nombrePorDefecto)
}

/** Guarda en el disco un archivo ya traído con {@link obtenerArchivo}. */
export const guardarArchivo = saveBlob
