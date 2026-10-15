import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from './cn'

/**
 * Aviso momentaneo, arriba del todo y fuera del formulario.
 *
 * Existe porque el error al pie de un formulario largo no se ve: el usuario
 * pulsa Guardar, la pagina no se mueve y parece que el boton no hizo nada.
 * Sale siempre en el mismo sitio, y el campo culpable se marca en rojo aparte
 * — el aviso dice QUE pasa, el campo dice DONDE.
 *
 * Es el hermano de `Aviso` en el APK: mismo sitio (arriba), misma forma y el
 * mismo criterio de color.
 */

type Tono = 'error' | 'exito'

interface Aviso {
  id: number
  mensaje: string
  tono: Tono
}

interface ToastApi {
  /** Un fallo: se queda 6s, que un error hay que alcanzar a leerlo. */
  error: (mensaje: string) => void
  /** Una confirmacion: 3s basta. */
  exito: (mensaje: string) => void
}

const Contexto = createContext<ToastApi | null>(null)

const DURACION: Record<Tono, number> = { error: 6000, exito: 3000 }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguiente = useRef(0)
  const location = useLocation()

  // El acento del modulo en el que se esta: /fact/notaventa -> fact. El aviso
  // cuelga fuera del layout, asi que no hereda su data-sys y se lo pone solo.
  const sys = location.pathname.split('/')[1] || 'brand'

  const cerrar = useCallback((id: number) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const mostrar = useCallback(
    (mensaje: string, tono: Tono) => {
      const id = ++siguiente.current
      setAvisos((prev) => [...prev, { id, mensaje, tono }])
      window.setTimeout(() => cerrar(id), DURACION[tono])
    },
    [cerrar],
  )

  const api = useMemo<ToastApi>(
    () => ({
      error: (mensaje: string) => mostrar(mensaje, 'error'),
      exito: (mensaje: string) => mostrar(mensaje, 'exito'),
    }),
    [mostrar],
  )

  return (
    <Contexto.Provider value={api}>
      {children}

      <div
        data-sys={sys}
        className="pointer-events-none fixed top-20 right-4 z-[200] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {avisos.map((a) => (
          <Tarjeta key={a.id} aviso={a} onClose={() => cerrar(a.id)} />
        ))}
      </div>
    </Contexto.Provider>
  )
}

function Tarjeta({ aviso, onClose }: { aviso: Aviso; onClose: () => void }) {
  // Entra desvanecido: sin esto aparece de golpe y se confunde con un salto
  // del layout.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 10)
    return () => window.clearTimeout(t)
  }, [])

  // Un fallo va en rojo siempre: el color del modulo identifica donde estas,
  // no que algo salio mal, y un error en el rosa de DMS no se lee como error.
  const error = aviso.tono === 'error'

  return (
    <div
      role="alert"
      style={error ? undefined : { backgroundColor: 'rgb(var(--sys-rgb))' }}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-2 rounded-field p-3 text-sm text-white shadow-panel transition-all duration-200',
        visible ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0',
        error && 'bg-red-600',
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="mt-0.5 shrink-0"
      >
        <circle cx="12" cy="12" r="9" />
        {error ? <path d="M12 7.5v5.5M12 16.2v.6" /> : <path d="m8.5 12.3 2.4 2.4 4.6-4.9" />}
      </svg>

      <span className="flex-1">{aviso.mensaje}</span>

      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="cursor-pointer opacity-70 transition-opacity hover:opacity-100"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

/** Avisa fuera del formulario. Sin provider no hace nada: nunca revienta una pantalla por un aviso. */
export function useToast(): ToastApi {
  return useContext(Contexto) ?? { error: () => {}, exito: () => {} }
}
