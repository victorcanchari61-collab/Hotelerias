import { enlaceValido } from './usecases/sitio.usecases'

/**
 * El formato simple de los textos del blog y de las páginas. NUNCA es HTML: lo que escribe
 * el personal se convierte en datos (bloques y trozos) y la pantalla los dibuja con sus
 * propios elementos, así que ningún texto puede traer una etiqueta, un script ni un
 * manejador de eventos.
 *
 *   ## Título          → subtítulo grande          ### Título → subtítulo chico
 *   - elemento         → lista (cada línea empieza con «- »)
 *   **negrita**  *cursiva*  [texto](https://… o /ruta)
 *   una línea en blanco separa los párrafos
 */

export type Trozo =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'negrita'; texto: string }
  | { tipo: 'cursiva'; texto: string }
  | { tipo: 'enlace'; texto: string; url: string }

export type Bloque =
  | { tipo: 'titulo'; nivel: 2 | 3; trozos: Trozo[] }
  | { tipo: 'parrafo'; lineas: Trozo[][] }
  | { tipo: 'lista'; elementos: Trozo[][] }

const INLINE = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g

/** Convierte una línea en trozos. Un enlace con dirección no permitida queda como texto. */
export function parsearLinea(linea: string): Trozo[] {
  const trozos: Trozo[] = []
  let cursor = 0
  for (const m of linea.matchAll(INLINE)) {
    const inicio = m.index ?? 0
    if (inicio > cursor) trozos.push({ tipo: 'texto', texto: linea.slice(cursor, inicio) })
    if (m[1] !== undefined) {
      trozos.push({ tipo: 'negrita', texto: m[1] })
    } else if (m[2] !== undefined) {
      trozos.push({ tipo: 'cursiva', texto: m[2] })
    } else if (enlaceValido(m[4]) && m[4].trim() !== '') {
      trozos.push({ tipo: 'enlace', texto: m[3], url: m[4] })
    } else {
      trozos.push({ tipo: 'texto', texto: m[0] })
    }
    cursor = inicio + m[0].length
  }
  if (cursor < linea.length) trozos.push({ tipo: 'texto', texto: linea.slice(cursor) })
  return trozos
}

export function parsearTextoRico(texto: string): Bloque[] {
  const bloques: Bloque[] = []
  for (const crudo of texto.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const bloque = crudo.trim()
    if (bloque === '') continue
    const lineas = bloque.split('\n').map((l) => l.trimEnd())

    if (lineas.length === 1 && /^###\s+\S/.test(lineas[0])) {
      bloques.push({ tipo: 'titulo', nivel: 3, trozos: parsearLinea(lineas[0].replace(/^###\s+/, '')) })
    } else if (lineas.length === 1 && /^##\s+\S/.test(lineas[0])) {
      bloques.push({ tipo: 'titulo', nivel: 2, trozos: parsearLinea(lineas[0].replace(/^##\s+/, '')) })
    } else if (lineas.every((l) => /^-\s+\S/.test(l))) {
      bloques.push({ tipo: 'lista', elementos: lineas.map((l) => parsearLinea(l.replace(/^-\s+/, ''))) })
    } else {
      bloques.push({ tipo: 'parrafo', lineas: lineas.map(parsearLinea) })
    }
  }
  return bloques
}
