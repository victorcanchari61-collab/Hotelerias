import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  LockKeyhole,
  LogOut,
  PackageCheck,
  PackageX,
  UserRound,
} from 'lucide-react'
import { cn } from '../ui'
import { alertaApi } from '../../lib/alertasApi'
import type { AlertaResponse } from '../../lib/alertasApi'
import { alertasLeidas, marcarLeida, marcarTodasLeidas } from '../../lib/alertasLeidas'
import { useRealtime } from '../../lib/realtime'
import { resolveNav } from './navigation'
import { urlImagen } from '../../lib/utils'

/** Como se lee la accion pedida, sin la pantalla al lado. */
const ACCION_PEDIDA: Record<string, string> = {
  ver: 'entrar',
  crear: 'crear',
  editar: 'editar',
  anular: 'anular',
  eliminar: 'eliminar',
  exportar: 'exportar',
  importar: 'importar',
  confirmar: 'confirmar',
  cobrar: 'cobrar',
}

/** Cierra un panel al tocar fuera de él. */
function useCerrarAlTocarFuera(abierto: boolean, ref: RefObject<HTMLElement | null>, cerrar: () => void) {
  useEffect(() => {
    if (!abierto) return
    const onClickFuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar()
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [abierto, ref, cerrar])
}

/** El botón redondo blanco de la cabecera: la campana. */
const BOTON_REDONDO =
  'relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-ink-muted shadow-sm transition-colors hover:text-ink'

/**
 * La campana de alertas, en la cabecera de cada vista (ya no hay barra superior).
 *
 * Stock bajo, lotes por vencer, accesos pedidos: tocar una lleva a donde se
 * resuelve. Las leídas no desaparecen del todo, se pueden volver a ver.
 */
export function CampanaAlertas({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [alertas, setAlertas] = useState<AlertaResponse[]>([])
  const [abierto, setAbierto] = useState(false)
  // Ids marcados como leidos, por dispositivo: mientras la causa no cambie, dejan de insistir.
  const [leidas, setLeidas] = useState<Record<string, number>>(() => alertasLeidas())
  const [verLeidas, setVerLeidas] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)

  const cargar = useCallback(() => {
    void alertaApi.getAll().then(setAlertas).catch(() => {
      // Sin alertas la app sigue funcionando: solo no avisa.
    })
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Cualquiera de estos módulos puede crear, resolver o vencer una alerta.
  // 'permisos' está porque un acceso pedido desde el móvil es una alerta más.
  useRealtime(['stock', 'compras', 'recepciones', 'notasventa', 'pedidos', 'permisos'], cargar)

  const cerrar = useCallback(() => setAbierto(false), [])
  useCerrarAlTocarFuera(abierto, contenedorRef, cerrar)

  const sinLeer = alertas.filter((a) => !leidas[a.id])
  const criticas = sinLeer.filter((a) => a.severidad === 'CRITICA').length
  const advertencias = sinLeer.filter((a) => a.severidad === 'ADVERTENCIA').length
  const colorContador = criticas > 0 ? 'bg-red-600' : advertencias > 0 ? 'bg-amber-500' : 'bg-emerald-600'
  const visibles = verLeidas ? alertas : sinLeer

  const marcar = (id: string) => {
    marcarLeida(id)
    setLeidas((prev) => ({ ...prev, [id]: Date.now() }))
  }

  const marcarTodas = () => {
    const ids = sinLeer.map((a) => a.id)
    marcarTodasLeidas(ids)
    setLeidas((prev) => {
      const ahora = Date.now()
      const siguiente = { ...prev }
      for (const id of ids) siguiente[id] = ahora
      return siguiente
    })
  }

  /*
    El acceso pedido llega con los ids del backend —"fact.precios · ver"—,
    que es lo unico que el servidor conoce: los nombres de las pantallas viven
    en el menu, aqui. Se traducen al leerlos y no antes.
  */
  const detalleDe = (a: AlertaResponse) => {
    if (a.tipo !== 'SOLICITUD_ACCESO') return a.detalle

    const [submodulo, accion, ...resto] = a.detalle.split(' · ')
    const pantalla = resolveNav(submodulo).item?.label ?? submodulo
    return [pantalla, ACCION_PEDIDA[accion] ?? accion, ...resto].join(' · ')
  }

  const irA = (a: AlertaResponse) => {
    setAbierto(false)
    if (!a.ruta) return

    onNavigate(a.ruta)

    // Accesos abre por la matriz de roles; el acceso pedido vive en la bandeja.
    if (a.tipo === 'SOLICITUD_ACCESO') window.location.hash = 'solicitudes'
  }

  return (
    <div ref={contenedorRef} className="relative">
      <button type="button" aria-label="Notificaciones" onClick={() => setAbierto((a) => !a)} className={BOTON_REDONDO}>
        <Bell size={19} />
        {sinLeer.length > 0 && (
          <span
            className={cn(
              'absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white',
              colorContador,
            )}
          >
            {sinLeer.length > 9 ? '9+' : sinLeer.length}
          </span>
        )}
      </button>

      {abierto && (
        // Cuelga de la campana hacia la izquierda: va pegada al borde derecho de la pantalla.
        <div className="absolute top-full right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-panel border border-line bg-white shadow-panel">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-ink">Alertas</h3>
              <p className="text-xs text-ink-soft">
                {alertas.length === 0
                  ? 'Todo en orden'
                  : sinLeer.length === 0
                    ? 'Ya revisaste todo'
                    : criticas > 0 || advertencias > 0
                      ? `${sinLeer.length} cosas para revisar`
                      : `${sinLeer.length} novedades`}
              </p>
            </div>
            {sinLeer.length > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                title="Marcar todas como leídas"
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
              >
                <CheckCheck size={13} />
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {visibles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-soft">
                {alertas.length === 0 ? 'No hay nada pendiente.' : 'No queda nada sin leer.'}
              </p>
            ) : (
              visibles.map((a) => {
                const leida = Boolean(leidas[a.id])
                return (
                  <div
                    key={a.id}
                    className={cn(
                      'flex w-full items-start gap-2 border-b border-line px-4 py-3 last:border-0',
                      leida && 'opacity-60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => irA(a)}
                      disabled={!a.ruta}
                      className={cn(
                        'flex min-w-0 flex-1 items-start gap-3 text-left',
                        a.ruta ? 'cursor-pointer' : 'cursor-default',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 shrink-0 rounded-full p-1.5',
                          a.severidad === 'CRITICA'
                            ? 'bg-red-50 text-red-600'
                            : a.severidad === 'ADVERTENCIA'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-emerald-50 text-emerald-600',
                        )}
                      >
                        {a.tipo === 'STOCK_REPUESTO' ? (
                          <PackageCheck size={14} />
                        ) : a.tipo === 'LOTE_POR_VENCER' ? (
                          <PackageX size={14} />
                        ) : a.tipo === 'SOLICITUD_ACCESO' ? (
                          <LockKeyhole size={14} />
                        ) : (
                          <AlertTriangle size={14} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{a.titulo}</span>
                        <span className="block truncate text-xs text-ink-soft">{detalleDe(a)}</span>
                      </span>
                    </button>
                    {/* Marcar como leída sin navegar: por eso va fuera del boton que abre la alerta. */}
                    {!leida && (
                      <button
                        type="button"
                        onClick={() => marcar(a.id)}
                        title="Marcar como leída"
                        className="shrink-0 cursor-pointer rounded-md p-1.5 text-ink-soft transition-colors hover:bg-surface-alt hover:text-ink"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {alertas.length > 0 && alertas.length !== sinLeer.length && (
            <button
              type="button"
              onClick={() => setVerLeidas((v) => !v)}
              className="w-full cursor-pointer border-t border-line px-4 py-2 text-center text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
            >
              {verLeidas ? 'Ocultar las leídas' : `Ver también las leídas (${alertas.length - sinLeer.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export interface MenuCuentaProps {
  nombre: string
  email: string
  /** Ruta de la foto de perfil, o null si no tiene. */
  foto: string | null
  onPerfil: () => void
  onLogout: () => void
}

/**
 * La cuenta del usuario: una pastilla blanca con la foto, el nombre y el
 * correo. Al tocarla se abre Mi perfil y Cerrar sesión. En el celular solo va
 * la foto: el nombre no entra junto al título.
 */
export function MenuCuenta({ nombre, email, foto, onPerfil, onLogout }: MenuCuentaProps) {
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const cerrar = useCallback(() => setAbierto(false), [])
  useCerrarAlTocarFuera(abierto, contenedorRef, cerrar)

  const elegir = (accion: () => void) => {
    setAbierto(false)
    accion()
  }

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-label="Mi cuenta"
        className="flex cursor-pointer items-center gap-3 rounded-full border border-line bg-white py-1.5 pr-3 pl-1.5 shadow-sm transition-shadow hover:shadow-md"
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgb(var(--sys-rgb))] text-sm font-bold text-[var(--sys-on)]">
          {foto ? (
            <img src={urlImagen(foto)} alt={nombre} className="size-full object-cover" />
          ) : (
            nombre.charAt(0).toUpperCase()
          )}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-44 truncate text-sm leading-tight font-semibold text-ink">{nombre}</span>
          <span className="block max-w-44 truncate text-[11px] text-ink-muted">{email}</span>
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-ink-soft transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="absolute top-full right-0 z-30 mt-2 w-52 overflow-hidden rounded-panel border border-line bg-white py-1 shadow-panel">
          {/* En el celular la pastilla no dice quién es: el menú sí. */}
          <div className="border-b border-line px-4 py-2 sm:hidden">
            <p className="truncate text-sm font-semibold text-ink">{nombre}</p>
            <p className="truncate text-[11px] text-ink-muted">{email}</p>
          </div>
          <button
            type="button"
            onClick={() => elegir(onPerfil)}
            className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm text-ink hover:bg-surface-alt"
          >
            <UserRound size={16} className="text-ink-soft" />
            Mi perfil
          </button>
          <button
            type="button"
            onClick={() => elegir(onLogout)}
            className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm text-ink hover:bg-surface-alt"
          >
            <LogOut size={16} className="text-ink-soft" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
