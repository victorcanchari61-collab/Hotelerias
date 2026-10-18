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
    de: (usuarioId: number) => `/permiso/usuario/${usuarioId}`,
    conceder: '/permiso/conceder',
    revocar: (id: number) => `/permiso/excepcion/${id}/revocar`,
    solicitar: '/permiso/solicitar',
    solicitudes: '/permiso/solicitudes',
    solicitudesMias: '/permiso/solicitudes/mias',
    aprobar: (id: number) => `/permiso/solicitudes/${id}/aprobar`,
    rechazar: (id: number) => `/permiso/solicitudes/${id}/rechazar`,
    alcancesCatalogo: '/permiso/alcances/catalogo',
    alcancesRol: (rolId: number) => `/permiso/alcances/rol/${rolId}`,
    alcancesUsuario: (usuarioId: number) => `/permiso/alcances/usuario/${usuarioId}`,
  },
  rol: {
    base: '/rol',
    porId: (id: number) => `/rol/${id}`,
    permisos: (id: number) => `/rol/${id}/permisos`,
  },
  empresa: { base: '/empresa' },
  tipoCambio: { base: '/tipo-cambio' },
  parametro: { base: '/parametro' },
  sitio: {
    banner: '/sitio/banner',
    bannerPorId: (id: number) => `/sitio/banner/${id}`,
    medio: '/sitio/medio',
    medioPorId: (id: number) => `/sitio/medio/${id}`,
    destinos: '/sitio/galerias-destinos',
    galeria: (entidad: string, id: number) => `/sitio/galeria/${entidad}/${id}`,
    experiencia: '/sitio/experiencia',
    experienciaPorId: (id: number) => `/sitio/experiencia/${id}`,
    entrada: '/sitio/entrada',
    entradaPorId: (id: number) => `/sitio/entrada/${id}`,
    entradaEstado: (id: number, publicar: boolean) => `/sitio/entrada/${id}/${publicar ? 'publicar' : 'despublicar'}`,
    pagina: (clave: string) => `/sitio/pagina/${clave}`,
    mensaje: '/sitio/mensaje',
    mensajePorId: (id: number) => `/sitio/mensaje/${id}`,
    mensajeEstado: (id: number) => `/sitio/mensaje/${id}/estado`,
  },
  limpieza: {
    base: '/limpieza',
    historial: '/limpieza/historial',
    personal: '/limpieza/personal',
    asignacion: (habitacionId: number) => `/limpieza/${habitacionId}/asignacion`,
    iniciar: (habitacionId: number) => `/limpieza/${habitacionId}/iniciar`,
    terminar: (habitacionId: number) => `/limpieza/${habitacionId}/terminar`,
  },
  estancia: {
    base: '/estancia',
    habitaciones: '/estancia/habitaciones',
    checkOut: (id: number) => `/estancia/${id}/check-out`,
  },
  ficha: { porEstancia: (id: number) => `/ficha-registro/${id}` },
  habitacion: {
    base: '/habitacion',
    opciones: '/habitacion/opciones',
    lote: '/habitacion/lote',
    porId: (id: number) => `/habitacion/${id}`,
    estado: (id: number) => `/habitacion/${id}/estado`,
  },
  sede: {
    base: '/sede',
    porId: (id: number) => `/sede/${id}`,
  },
  auditoria: {
    listar: '/auditoria/listar',
    porId: (id: number) => `/auditoria/${id}`,
    resumen: '/auditoria/resumen',
    entidades: '/auditoria/entidades',
    depurar: '/auditoria/depurar',
  },
  // Lo que ve y usa el huésped en la web pública.
  portal: {
    sedes: '/portal/sedes',
    monedas: '/portal/monedas',
    parametros: '/portal/parametros',
    membresias: '/portal/membresias',
    portada: '/portal/portada',
    experiencias: '/portal/experiencias',
    entradas: '/portal/entradas',
    entrada: (slug: string) => `/portal/entradas/${encodeURIComponent(slug)}`,
    pagina: (clave: string) => `/portal/paginas/${clave}`,
    galeria: (entidad: string, id: number) => `/portal/galeria/${entidad}/${id}`,
    mensajeContacto: '/portal/contacto/mensaje',
    contacto: '/portal/contacto',
    sede: (id: number) => `/portal/sedes/${id}`,
    disponibilidad: (id: number) => `/portal/sedes/${id}/disponibilidad`,
    promociones: '/portal/promociones',
    cotizar: '/portal/cotizar',
    registro: '/portal/registro',
    login: '/portal/login',
    me: '/portal/me',
    reservas: '/portal/reservas',
    cancelar: (codigo: string) => `/portal/reservas/${encodeURIComponent(codigo)}/cancelar`,
  },
  // Lo que administra el personal desde el panel.
  promocion: {
    base: '/promocion',
    porId: (id: number) => `/promocion/${id}`,
  },
  tipoCliente: {
    base: '/tipo-cliente',
    porId: (id: number) => `/tipo-cliente/${id}`,
  },
  cliente: {
    base: '/cliente',
    tipo: (id: number) => `/cliente/${id}/tipo`,
  },
  reserva: {
    base: '/reserva',
    cancelar: (id: number) => `/reserva/${id}/cancelar`,
  },
  usuario: {
    base: '/usuario',
    porId: (id: number) => `/usuario/${id}`,
    estado: (id: number) => `/usuario/${id}/estado`,
  },
} as const
