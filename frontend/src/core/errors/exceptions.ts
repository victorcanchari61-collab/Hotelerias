/** La acción que el servidor negó, tal como la nombra el catálogo de permisos. */
export interface PermisoNegado {
  submodulo: string
  accion: string
}

/**
 * Lo que se LANZA desde la capa de datos. El repositorio las atrapa y las
 * convierte en Failure: hacia arriba nunca sube una excepción.
 */
export class AppException extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

/**
 * Error de una llamada HTTP, con la forma que devuelve el backend
 * ({ statusCode, message, errors, submodulo, accion }).
 *
 * `statusCode` 0 significa que ni siquiera hubo respuesta (sin red).
 *
 * Es la misma clase que ya importan los componentes del kit de UI
 * (AccionPdf, VisorReportePdf) a través de lib/apiClient.
 */
export class ApiError extends AppException {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly errors: string[] = [],
    /** Qué permiso faltaba, cuando el servidor devolvió un 403 del guard. */
    readonly permiso?: PermisoNegado,
  ) {
    super(message, String(statusCode))
    this.name = 'ApiError'
  }
}

/** El almacenamiento local falló o devolvió algo que no se puede leer. */
export class StorageException extends AppException {}
