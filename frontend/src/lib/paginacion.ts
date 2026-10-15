/**
 * Una página de un listado que pagina en el servidor.
 *
 * `total` es cuántas filas hay en TODO el listado una vez aplicados búsqueda y
 * filtros — no cuántas trae esta página: es lo que la tabla necesita para
 * saber cuántas páginas dibujar.
 */
export interface PaginaResponse<T> {
  items: T[]
  total: number
  pagina: number
  porPagina: number
}
