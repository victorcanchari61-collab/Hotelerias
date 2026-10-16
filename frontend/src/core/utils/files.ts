/** Guarda en el disco un archivo ya traído con FileTransfer.download. */
export function saveBlob(blob: Blob, nombre: string): void {
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
