/**
 * Utilidades compartidas
 */

export function urlImagen(ruta: string | null | undefined): string {
  if (!ruta) return ''
  // Si ya es una URL absoluta (data: o http), devolverla tal cual
  if (ruta.startsWith('data:') || ruta.startsWith('http')) return ruta
  // Si es una ruta relativa, prepender la base del backend
  return `http://127.0.0.1:5220/${ruta.replace(/^\/+/, '')}`
}