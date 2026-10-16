/**
 * La fecha de HOY en el hotel (Lima), como AAAA-MM-DD.
 *
 * La reserva se decide por el día del hotel, no por el del dispositivo de quien
 * la hace: alguien en otra zona horaria no debe poder reservar "ayer" ni que se
 * le rechace "hoy". Perú no tiene horario de verano, así que la zona es fija.
 */
export function hoyEnHotel(ahora: Date = new Date()): string {
  // El locale en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}
