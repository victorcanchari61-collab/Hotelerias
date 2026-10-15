/**
 * Un identificador único para una fila que todavía no existe en la base.
 *
 * `crypto.randomUUID()` solo existe en contextos seguros: HTTPS o localhost.
 * En un servidor servido por HTTP plano —una IP y un puerto, como el panel
 * interno— el navegador simplemente no expone esa función, y la llamada
 * revienta en pleno render: React desmonta esa parte de la pantalla y quedan
 * botones que no responden y tablas vacías, sin más pista que un
 * "randomUUID is not a function" en la consola.
 *
 * Aquí se prueba primero la del navegador y, si no está, se arma el UUID con
 * `getRandomValues`, que sí está disponible sin HTTPS. El último recurso es
 * `Math.random`: no sirve para criptografía, pero estos ids no protegen nada
 * —solo distinguen filas de un formulario abierto— y es mejor que una
 * pantalla rota.
 */
export function idUnico(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))

    // Los dos campos que marcan "UUID versión 4, variante RFC 4122".
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80

    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
