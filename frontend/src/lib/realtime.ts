import { useEffect, useRef } from 'react'
import { HttpTransportType, HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr'
import { getToken } from './authStorage'

// Relativa, igual que API_BASE_URL: el proxy de Vite la resuelve en dev y
// Nginx en producción, sin depender de en qué máquina termine publicada.
const HUB_URL = '/hubs/cambios'

export type CambioEvento = {
  modulo: string
  accion: string
  datos: unknown
  fecha: string
}

type Escucha = (evento: CambioEvento) => void

let conexion: HubConnection | null = null
const escuchas = new Set<Escucha>()

/**
 * Una sola conexión para toda la app: cada página se suscribe con
 * suscribirCambios en vez de abrir su propio socket.
 */
function obtenerConexion(): HubConnection {
  if (conexion) return conexion

  conexion = new HubConnectionBuilder()
    .withUrl(HUB_URL, {
      accessTokenFactory: () => getToken() ?? '',
      transport: HttpTransportType.WebSockets,
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  conexion.on('cambio', (evento: CambioEvento) => {
    for (const escucha of escuchas) escucha(evento)
  })

  void conexion.start().catch(() => {
    // Sin conexión en tiempo real la app sigue funcionando: solo no se
    // actualiza sola. El usuario puede recargar como antes.
  })

  return conexion
}

/**
 * Escucha cambios de uno o varios módulos ("clientes", "stock"...) y llama a
 * `onCambio` cuando alguno ocurre. Devuelve la función para dejar de
 * escuchar; se llama en el cleanup del efecto de React.
 */
export function suscribirCambios(modulos: string | string[], onCambio: (evento: CambioEvento) => void) {
  const lista = Array.isArray(modulos) ? modulos : [modulos]
  obtenerConexion()

  const escucha: Escucha = evento => {
    if (lista.includes(evento.modulo)) onCambio(evento)
  }

  escuchas.add(escucha)
  return () => {
    escuchas.delete(escucha)
  }
}

/**
 * Cuánto se espera a que termine una ráfaga de avisos antes de recargar. Una
 * venta avisa a la vez "notasventa", "stock", "kardex" y "cuentasfinancieras":
 * una pantalla que escucha varios recargaba una vez por cada aviso.
 */
const ESPERA_RAFAGA_MS = 400

/** Pero nunca más que esto: una seguidilla de cambios no puede dejarla sin recargar. */
const ESPERA_MAXIMA_MS = 2000

/**
 * Vuelve a llamar `recargar` cuando algún otro cliente cambia algo en
 * `modulos`. Se usa junto al cargar() que cada página ya tiene:
 *
 *   useRealtime('clientes', cargar)
 *
 * Los avisos que llegan juntos se juntan en una sola recarga.
 */
export function useRealtime(modulos: string | string[], recargar: () => void) {
  const recargarRef = useRef(recargar)
  recargarRef.current = recargar

  // Se compara como texto: un array nuevo en cada render no debe reabrir
  // la suscripción, solo un cambio real en la lista de módulos.
  const clave = Array.isArray(modulos) ? modulos.join(',') : modulos

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let primerAviso = 0

    const disparar = () => {
      temporizador = undefined
      primerAviso = 0
      recargarRef.current()
    }

    const cancelar = suscribirCambios(clave.split(','), () => {
      const ahora = Date.now()
      if (!primerAviso) primerAviso = ahora
      clearTimeout(temporizador)
      // Si la ráfaga ya lleva el máximo, se recarga ahora; si no, se espera un poco más.
      const espera = ahora - primerAviso >= ESPERA_MAXIMA_MS ? 0 : ESPERA_RAFAGA_MS
      temporizador = setTimeout(disparar, espera)
    })

    return () => {
      clearTimeout(temporizador)
      cancelar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
}
