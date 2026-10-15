import * as XLSX from 'xlsx'

/**
 * Lectura de hojas de calculo para importar datos.
 *
 * Los archivos reales del negocio no vienen limpios: traen un titulo antes de
 * los encabezados, columnas con nombres distintos a los del sistema, celdas con
 * el texto "NULL" y espacios de sobra. Todo eso se resuelve aqui, para que las
 * pantallas solo se ocupen de mapear columnas.
 */

/** Fila leida: nombre de columna normalizado -> valor. */
export type FilaExcel = Record<string, string>

/** Quita tildes, espacios de mas y pasa a minusculas, para comparar titulos. */
export function normalizarTitulo(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Descarta vacios y el literal "NULL" que arrastran las exportaciones viejas. */
function limpiar(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor).trim()
  return texto.toUpperCase() === 'NULL' ? '' : texto
}

export interface LecturaExcel {
  /** Titulos tal como aparecen en el archivo. */
  columnas: string[]
  filas: FilaExcel[]
  /** Numero de fila del archivo donde estaban los encabezados. */
  filaEncabezado: number
}

/**
 * Encuentra la fila de encabezados y devuelve los datos que vienen debajo.
 *
 * No se asume que los titulos esten en la primera fila: estas hojas suelen
 * empezar con un titulo como "Reporte de Clientes". Se toma como encabezado la
 * primera fila con al menos dos celdas con texto.
 */
export async function leerExcel(archivo: File): Promise<LecturaExcel> {
  const buffer = await archivo.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  })

  const indice = matriz.findIndex(
    (fila) => fila.filter((celda) => limpiar(celda).length > 0).length >= 2,
  )

  if (indice === -1) return { columnas: [], filas: [], filaEncabezado: 0 }

  const columnas = matriz[indice].map((celda) => limpiar(celda))

  const filas: FilaExcel[] = []
  for (const cruda of matriz.slice(indice + 1)) {
    const fila: FilaExcel = {}
    let tieneDatos = false

    columnas.forEach((columna, i) => {
      if (!columna) return
      const valor = limpiar(cruda[i])
      fila[normalizarTitulo(columna)] = valor
      if (valor) tieneDatos = true
    })

    if (tieneDatos) filas.push(fila)
  }

  return { columnas: columnas.filter(Boolean), filas, filaEncabezado: indice + 1 }
}

/**
 * Busca el valor de una fila probando varios nombres de columna, para tolerar
 * que el archivo diga "DOCUMENTO", "Documento" o "N° Doc".
 */
export function valorDe(fila: FilaExcel, ...posiblesNombres: string[]): string {
  for (const nombre of posiblesNombres) {
    const valor = fila[normalizarTitulo(nombre)]
    if (valor) return valor
  }
  return ''
}

/** Descarga una lista de filas como un .xlsx, una hoja, encabezados en la primera fila. */
export function exportarExcel(nombreArchivo: string, filas: Record<string, unknown>[]) {
  const hoja = XLSX.utils.json_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos')
  XLSX.writeFile(libro, nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`)
}
