/**
 * La fecha de HOY tal como la ve quien está frente a la pantalla.
 *
 * `toISOString()` pasa el momento a UTC antes de recortarlo, así que en Perú
 * —cinco horas detrás— a partir de las 7 de la tarde devolvía el día
 * siguiente: a las 22:00 del 12 de setiembre decía "2026-09-13", y las visitas
 * del día salían con la agenda de mañana. Aquí se toma el día del reloj local,
 * que es el que cuenta para el negocio.
 */
export function hoyLocal(): string {
  return fechaLocal(new Date())
}

/** Una fecha cualquiera como YYYY-MM-DD, en el día local y no en el de UTC. */
export function fechaLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

/** Hoy más (o menos) N días, en local. */
export function desplazarDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return fechaLocal(d)
}

/*
 * Una marca de tiempo del servidor, en la hora de aquí.
 *
 * El backend guarda en UTC pero la serializa sin la "Z" que lo dice, así que
 * el navegador la tomaba por hora local y no convertía nada: una venta de las
 * 6:18 de la tarde salía como 11:18 de la noche. Aquí se le pone la marca que
 * le falta y el navegador ya hace la cuenta.
 *
 * Solo para instantes. Una fecha suelta —"2026-09-13", el día de un
 * documento— no lleva hora ni zona y se muestra tal cual: tratarla como UTC
 * la correría al día anterior.
 */
/** Una fecha del servidor como epoch, leída igual que para mostrarla. */
export function instanteMs(valor: string): number {
  return comoInstante(valor).getTime()
}

export function fechaHora(valor: string): string {
  return comoInstante(valor).toLocaleString('es-PE')
}

/** El día de una fecha del servidor, en el calendario de aquí. */
export function fechaCorta(valor: string): string {
  return comoInstante(valor).toLocaleDateString('es-PE')
}

/**
 * El día de una fecha del servidor como YYYY-MM-DD, en el calendario de aquí.
 *
 * Para comparar contra lo que devuelve un <input type="date">. Recortar el
 * texto del servidor no sirve: un pedido del viernes a las 9 de la noche viaja
 * como sábado 02:00 en UTC, y caería en el día equivocado.
 */
export function diaLocal(valor: string): string {
  return fechaLocal(comoInstante(valor))
}

/*
 * El sistema guarda dos cosas distintas en el mismo tipo de campo.
 *
 * Un INSTANTE —cuándo se registró un pago, cuándo salió el stock— se guarda en
 * UTC: hay que traerlo a la hora de aquí o se ve cinco horas adelantado.
 *
 * Un DÍA —la fecha que alguien escribió en el formulario de una compra— se
 * guarda a las 00:00 sin zona, y es el día que esa persona quiso decir: si se
 * tratara como UTC se correría al día anterior a las 7 de la tarde.
 *
 * Se distinguen por la hora: las 00:00:00 clavadas son un día escrito a mano.
 * Un instante que caiga justo en ese segundo —las 7 p. m. exactas de aquí— se
 * leería como día; es un segundo de cada 86 400 y el precio de no tener que
 * migrar lo ya guardado.
 */
function comoInstante(valor: string): Date {
  const tieneZona = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(valor)
  const esDiaSuelto = !valor.includes('T') || /T00:00:00(\.0+)?$/.test(valor)

  if (esDiaSuelto && !tieneZona) {
    // "2026-09-13" a secas lo parsea el navegador como UTC, y en Perú eso es
    // el día anterior a las 7 de la tarde. Se arma a mano como medianoche de
    // aquí, que es lo que esa fecha significa.
    const [anio, mes, dia] = valor.slice(0, 10).split('-').map(Number)
    return new Date(anio, mes - 1, dia)
  }

  return new Date(tieneZona ? valor : `${valor}Z`)
}
