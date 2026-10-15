// Ruta relativa siempre: en dev el proxy de Vite (vite.config.ts) la manda al
// backend local, y en producción lo hace Nginx. Así el mismo código sirve sin
// importar el dominio o puerto donde termine publicado.
export const API_BASE_URL = '/api'
