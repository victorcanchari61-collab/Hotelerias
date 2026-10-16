/**
 * Utilidades compartidas
 */

export function urlImagen(ruta: string | null | undefined): string {
  if (!ruta) return ''
  // Si ya es una URL absoluta (data: o http), devolverla tal cual
  if (ruta.startsWith('data:') || ruta.startsWith('http')) return ruta
  // Ruta relativa a la raíz: en dev el proxy de Vite (/uploads) la manda al
  // backend y en producción lo hace Nginx. Con el host del backend escrito
  // aquí, las fotos dejarían de verse en cualquier otro entorno.
  return `/${ruta.replace(/^\/+/, '')}`
}