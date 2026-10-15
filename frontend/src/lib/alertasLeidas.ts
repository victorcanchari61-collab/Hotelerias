/**
 * Qué alertas ya se marcaron como leídas.
 *
 * Las alertas del backend no tienen estado: cada `GET /alertas` recalcula lo que sigue mal ahora
 * mismo (el mismo stock bajo, el mismo lote por vencer), así que el panel salía siempre igual — no
 * había forma de decir "ya lo vi" y que dejara de insistir mientras el problema no cambiara.
 *
 * Cada alerta tiene un id estable por lo que la causa ("stock-45", "lote-812"): marcar uno como
 * leído se guarda aquí, por dispositivo, y vuelve a aparecer solo si:
 *   - la causa se resuelve y vuelve a repetirse más adelante (nunca deja de avisar del todo), o
 *   - pasa más de una semana marcada, para que un problema que sigue sin arreglarse no quede
 *     silenciado para siempre por haberlo visto una vez.
 */

const CLAVE = 'distributor.alertasLeidas'

/** Una semana: pasado ese tiempo, una alerta que sigue existiendo vuelve a avisar. */
const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000

function leer(): Record<string, number> {
  try {
    const crudo = localStorage.getItem(CLAVE)
    return crudo ? (JSON.parse(crudo) as Record<string, number>) : {}
  } catch {
    // Almacenamiento bloqueado o corrupto: se sigue sin marcar nada como leído, no se rompe la app.
    return {}
  }
}

function escribir(leidas: Record<string, number>) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(leidas))
  } catch {
    // Igual: si no se puede guardar, la alerta simplemente vuelve a salir la próxima vez.
  }
}

/** Todas las marcas vigentes (sin las que ya vencieron), tal como quedan tras limpiarlas. */
export function alertasLeidas(): Record<string, number> {
  const ahora = Date.now()
  const guardadas = leer()
  const vigentes = Object.fromEntries(
    Object.entries(guardadas).filter(([, marcada]) => ahora - marcada < VIGENCIA_MS),
  )
  // Se reescribe solo si de verdad se limpió algo: evita un write en cada lectura.
  if (Object.keys(vigentes).length !== Object.keys(guardadas).length) escribir(vigentes)
  return vigentes
}

export function marcarLeida(id: string) {
  escribir({ ...leer(), [id]: Date.now() })
}

export function marcarTodasLeidas(ids: string[]) {
  const ahora = Date.now()
  const guardadas = leer()
  for (const id of ids) guardadas[id] = ahora
  escribir(guardadas)
}
