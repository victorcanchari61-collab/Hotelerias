import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from './cn'
import { useDismiss } from './useDismiss'

/**
 * Selector de rango de fechas: un campo con "desde → hasta" que abre un
 * calendario de dos meses con atajos comunes (esta semana, este mes...).
 *
 * El valor entra y sale como fechas yyyy-mm-dd (mismo formato que
 * `<input type="date">`), para no romper nada de lo que ya las consume.
 */

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const pad = (n: number) => String(n).padStart(2, '0')

/** yyyy-mm-dd, en hora local: evita el corrimiento de un dia que da toISOString. */
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const formatDisplay = (iso: string) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Rangos de uso frecuente, calculados desde hoy. */
function presets(): { label: string; from: string; to: string }[] {
  const hoy = new Date()
  const y = hoy.getFullYear()

  const inicioSemana = (fecha: Date) => {
    const d = new Date(fecha)
    const dia = (d.getDay() + 6) % 7 // lunes = 0
    d.setDate(d.getDate() - dia)
    return d
  }

  const esteInicioSemana = inicioSemana(hoy)
  const semanaPasadaFin = new Date(esteInicioSemana)
  semanaPasadaFin.setDate(semanaPasadaFin.getDate() - 1)
  const semanaPasadaInicio = inicioSemana(semanaPasadaFin)

  const esteMesInicio = new Date(y, hoy.getMonth(), 1)
  const mesPasadoFin = new Date(y, hoy.getMonth(), 0)
  const mesPasadoInicio = new Date(mesPasadoFin.getFullYear(), mesPasadoFin.getMonth(), 1)

  const ayer = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)

  return [
    { label: 'Hoy', from: toIso(hoy), to: toIso(hoy) },
    { label: 'Ayer', from: toIso(ayer), to: toIso(ayer) },
    { label: 'Esta semana', from: toIso(esteInicioSemana), to: toIso(hoy) },
    { label: 'Última semana', from: toIso(semanaPasadaInicio), to: toIso(semanaPasadaFin) },
    { label: 'Este mes', from: toIso(esteMesInicio), to: toIso(hoy) },
    { label: 'Último mes', from: toIso(mesPasadoInicio), to: toIso(mesPasadoFin) },
    { label: 'Este año', from: toIso(new Date(y, 0, 1)), to: toIso(hoy) },
    { label: 'Último año', from: toIso(new Date(y - 1, 0, 1)), to: toIso(new Date(y - 1, 11, 31)) },
  ]
}

export interface DateRangePickerProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  placeholder?: string
}

export function DateRangePicker({ from, to, onChange, placeholder = 'Selecciona un rango' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const [mesIzq, setMesIzq] = useState(() => {
    const base = from ? fromIso(from) : new Date()
    return { anio: base.getFullYear(), mes: base.getMonth() }
  })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const ref = useDismiss(() => setOpen(false))

  const abrir = () => {
    const base = from ? fromIso(from) : new Date()
    setMesIzq({ anio: base.getFullYear(), mes: base.getMonth() })
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) {
      const ancho = Math.min(720, window.innerWidth - 24)
      setPos({ top: r.bottom + 6, left: Math.min(Math.max(12, r.left), window.innerWidth - ancho - 12), width: ancho })
    }
    setOpen(true)
  }

  /*
   * Si no cabe debajo, se coloca encima del campo.
   *
   * El calendario se anclaba siempre bajo el campo, y dentro de un modal el
   * campo suele quedar a media pantalla: el panel se salía por abajo y se veía
   * cortado justo por los días, que es lo único que hay que tocar. Se corrige
   * despues de montarlo porque hasta entonces no se sabe cuanto mide.
   */
  useLayoutEffect(() => {
    if (!open || !pos) return

    const panel = ref.current?.getBoundingClientRect()
    const campo = triggerRef.current?.getBoundingClientRect()
    if (!panel || !campo) return

    const margen = 12
    const cabeDebajo = pos.top + panel.height <= window.innerHeight - margen
    if (cabeDebajo) return

    // Encima si hay sitio; si tampoco, pegado al borde y que scrollee.
    const arriba = campo.top - panel.height - 6
    const top = arriba >= margen ? arriba : Math.max(margen, window.innerHeight - panel.height - margen)

    if (Math.abs(top - pos.top) > 1) setPos({ ...pos, top })
  }, [open, pos, ref])

  const elegir = (iso: string) => {
    if (!from || (from && to)) {
      onChange(iso, '')
      return
    }
    if (iso >= from) {
      onChange(from, iso)
    } else {
      onChange(iso, from)
    }
    setOpen(false)
  }

  const aplicarPreset = (p: { from: string; to: string }) => {
    onChange(p.from, p.to)
    setOpen(false)
  }

  const cambiarMes = (delta: number) =>
    setMesIzq((prev) => {
      const total = prev.anio * 12 + prev.mes + delta
      return { anio: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 }
    })

  const cambiarAnio = (delta: number) => setMesIzq((prev) => ({ ...prev, anio: prev.anio + delta }))

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : abrir())}
        className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-zinc-400"
      >
        <span className={cn('flex-1 truncate text-left', !from && !to && 'text-zinc-400')}>
          {from || to ? (
            <>
              {formatDisplay(from) || '...'} <span className="text-zinc-400">→</span> {formatDisplay(to) || '...'}
            </>
          ) : (
            placeholder
          )}
        </span>
        <Calendar size={14} className="shrink-0 text-zinc-400" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={ref}
            data-floating-panel
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: 'calc(100vh - 24px)',
            }}
            className="fixed z-[60] flex overflow-auto rounded-xl bg-white shadow-xl shadow-zinc-900/20 ring-1 ring-zinc-200"
          >
            {/* atajos */}
            <div className="hidden w-36 shrink-0 flex-col gap-0.5 border-r border-zinc-100 p-2 sm:flex">
              {presets().map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => aplicarPreset(p)}
                  className="rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* dos meses */}
            <div className="flex flex-1 flex-col gap-2 p-3 sm:flex-row sm:gap-1">
              <Mes
                anio={mesIzq.anio}
                mes={mesIzq.mes}
                from={from}
                to={to}
                onPick={elegir}
                nav={{ onPrevAnio: () => cambiarAnio(-1), onPrevMes: () => cambiarMes(-1) }}
              />
              <Mes
                anio={mesIzq.mes === 11 ? mesIzq.anio + 1 : mesIzq.anio}
                mes={(mesIzq.mes + 1) % 12}
                from={from}
                to={to}
                onPick={elegir}
                nav={{ onNextMes: () => cambiarMes(1), onNextAnio: () => cambiarAnio(1) }}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function Mes({
  anio,
  mes,
  from,
  to,
  onPick,
  nav,
}: {
  anio: number
  mes: number
  from: string
  to: string
  onPick: (iso: string) => void
  nav: { onPrevAnio?: () => void; onPrevMes?: () => void; onNextMes?: () => void; onNextAnio?: () => void }
}) {
  const primerDia = new Date(anio, mes, 1)
  const offset = (primerDia.getDay() + 6) % 7 // lunes = 0
  const inicioGrilla = new Date(anio, mes, 1 - offset)

  const celdas = Array.from({ length: 42 }, (_, i) => {
    const fecha = new Date(inicioGrilla)
    fecha.setDate(fecha.getDate() + i)
    return fecha
  })

  return (
    <div className="flex-1">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-0.5">
          {nav.onPrevAnio && (
            <IconBtn onClick={nav.onPrevAnio} label="Año anterior">
              <ChevronsLeft size={14} />
            </IconBtn>
          )}
          {nav.onPrevMes && (
            <IconBtn onClick={nav.onPrevMes} label="Mes anterior">
              <ChevronLeft size={14} />
            </IconBtn>
          )}
        </div>
        <p className="text-[13px] font-semibold text-zinc-800">
          {MESES[mes]} {anio}
        </p>
        <div className="flex items-center gap-0.5">
          {nav.onNextMes && (
            <IconBtn onClick={nav.onNextMes} label="Mes siguiente">
              <ChevronRight size={14} />
            </IconBtn>
          )}
          {nav.onNextAnio && (
            <IconBtn onClick={nav.onNextAnio} label="Año siguiente">
              <ChevronsRight size={14} />
            </IconBtn>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 px-1 text-center text-[11px]">
        {DIAS.map((d) => (
          <span key={d} className="py-1 font-medium text-zinc-400">
            {d}
          </span>
        ))}

        {celdas.map((fecha) => {
          const iso = toIso(fecha)
          const fueraDeMes = fecha.getMonth() !== mes
          const esInicio = iso === from
          const esFin = iso === to
          const enRango = !!from && !!to && iso > from && iso < to

          return (
            <button
              key={iso}
              type="button"
              disabled={fueraDeMes}
              onClick={() => onPick(iso)}
              className={cn(
                'relative py-1 text-[12.5px] transition-colors',
                fueraDeMes ? 'cursor-default text-zinc-300' : 'text-zinc-700 hover:bg-zinc-100',
                enRango && 'bg-[rgb(var(--sys-rgb)/0.12)] text-[rgb(var(--sys-ink-rgb))] hover:bg-[rgb(var(--sys-rgb)/0.18)]',
                (esInicio || esFin) &&
                  'rounded-full bg-[rgb(var(--sys-rgb))] font-semibold text-[var(--sys-on)] hover:bg-[rgb(var(--sys-rgb))]',
              )}
            >
              {fecha.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
    >
      {children}
    </button>
  )
}
