// Ruta relativa siempre: en dev el proxy de Vite (vite.config.js) la manda al
// backend local, y en producción lo hace Nginx. Así el mismo código sirve sin
// importar el dominio o puerto donde termine publicado.
export const API_BASE_URL = '/api'

/**
 * Las rutas de la API, en un solo sitio. Un datasource no escribe strings
 * sueltos: si el backend renombra un endpoint se cambia aquí.
 */
export const ApiPaths = {
  auth: {
    login: '/auth/login',
    me: '/auth/me',
  },
  permiso: {
    mios: '/permiso/mios',
    catalogo: '/permiso/catalogo',
  },
  usuario: {
    base: '/usuario',
    porId: (id: number) => `/usuario/${id}`,
    estado: (id: number) => `/usuario/${id}/estado`,
  },
} as const
