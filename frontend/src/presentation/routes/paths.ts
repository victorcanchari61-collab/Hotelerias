/**
 * Las rutas que no salen del menú: se nombran aquí, una sola vez.
 *
 * El sitio tiene dos mitades con sesiones distintas:
 *  - la web pública, donde el huésped mira hoteles y reserva (en la raíz);
 *  - el panel del personal, que vive bajo /admin.
 */
/** Donde cuelga el panel del personal. */
export const PANEL_BASE = '/admin'

export const PATHS = {
  // --- Web pública ---
  portal: '/',
  ofertas: '/ofertas',
  hotel: '/hoteles/:id',
  ingresar: '/ingresar',
  registro: '/registro',
  reservar: '/reservar',
  misReservas: '/mis-reservas',

  // --- Panel del personal ---
  admin: PANEL_BASE,
  adminLogin: `${PANEL_BASE}/login`,
  perfil: `${PANEL_BASE}/perfil`,
} as const

/** La URL de la página de un hotel, con su búsqueda si la hay. */
export function hotelPath(id: number, query?: Record<string, string | number | undefined>): string {
  const base = `/hoteles/${id}`
  if (!query) return base
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `${base}?${s}` : base
}
