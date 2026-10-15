import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from './cn'
import { FIELD_HEIGHT } from './Input'
import type { FieldSize } from './Input'

export interface ItemLista {
  id: string | number
  /** Lo que se lee a la izquierda: el nombre del elemento. */
  label: string
  /** Dato de la derecha, en gris: una equivalencia, un total. */
  detalle?: ReactNode
  /** Etiqueta corta bajo el nombre, para marcar el elemento principal. */
  nota?: string
  /** Se ve pero no se puede elegir: lo ocupado, lo que ya no aplica. */
  deshabilitado?: boolean
  onClick?: () => void
}

export interface ListaDesplegableProps {
  /** Texto del boton cerrado: "4 presentaciones" o el valor elegido. */
  resumen: string
  items: ItemLista[]
  icono?: ReactNode
  /** Titulo dentro del panel. */
  titulo?: string
  vacio?: string

  /**
   * pastilla: para consultar dentro de una celda de tabla.
   * campo: para elegir dentro de un formulario, con la altura de un Input.
   */
  variante?: 'pastilla' | 'campo'

  /** Alto del campo, igual que en un Input. Solo aplica a la variante campo. */
  size?: FieldSize

  /** Item elegido: se marca con un check y se cierra el panel al elegir. */
  seleccionado?: string | number

  /**
   * Varios elegidos: cada uno con su check, y el panel NO se cierra al marcar, para poder elegir de corrido.
   * Es lo que hace `DesplegableMultiple`.
   */
  seleccionados?: Array<string | number>

  deshabilitado?: boolean
  error?: boolean

  /**
   * Buscador dentro del panel. Por defecto aparece solo cuando hay muchas
   * opciones: con cinco estorba, con veintisiete es la unica forma de llegar.
   */
  buscable?: boolean

  className?: string
}

/** Desde cuantas opciones el buscador aparece solo. */
const MINIMO_BUSCADOR = 8

/**
 * Lista corta dentro de una celda.
 *
 * Un `select` nativo no sirve aqui: sugiere que se elige algo, y el sistema
 * operativo decide como se ve el menu, asi que rompe con el resto del panel.
 * Esto es un boton que abre una lista con el diseno del sistema.
 *
 * El panel se pinta con position:fixed sobre document.body, igual que el
 * buscador de columna, porque la tabla necesita overflow-hidden para sincronizar
 * su cabecera y recortaria cualquier cosa que sobresalga de la celda.
 */
export function ListaDesplegable({
  resumen,
  items,
  icono,
  titulo,
  vacio = 'Sin elementos',
  variante = 'pastilla',
  size = 'md',
  seleccionado,
  seleccionados,
  deshabilitado,
  error,
  buscable,
  className,
}: ListaDesplegableProps) {
  const [abierto, setAbierto] = useState(false)
  const [visible, setVisible] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; ancho: number } | null>(null)
  const botonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buscadorRef = useRef<HTMLInputElement>(null)

  const conBuscador = buscable ?? items.length >= MINIMO_BUSCADOR
  const multiple = seleccionados !== undefined
  const marcado = (id: string | number) => (multiple ? seleccionados.includes(id) : id === seleccionado)
  const conChecks = multiple || seleccionado !== undefined

  // Busca en el nombre y tambien en el dato de la derecha, que suele ser el
  // codigo: escribir "KG" tiene que encontrar "Kilogramo".
  const texto = filtro.trim().toLowerCase()
  const visibles = texto
    ? items.filter((i) =>
        `${i.label} ${i.nota ?? ''} ${typeof i.detalle === 'string' ? i.detalle : ''}`
          .toLowerCase()
          .includes(texto),
      )
    : items

  useEffect(() => {
    if (!abierto) {
      setVisible(false)
      // El filtro no sobrevive al cierre: al volver a abrir se ve la lista
      // completa, que es lo que uno espera.
      setFiltro('')
      return
    }

    /*
     * Dentro de un modal con scroll (el panel de Filtros, por ejemplo), un
     * campo cerca del borde inferior "no cabe abajo" para la ventana, pero sí
     * cabría si el propio panel se desplazara un poco: sin esto se abría
     * hacia arriba y tapaba los campos de encima, cuando alcanzaba con correr
     * la pantalla. Se centra el campo primero, y recién con eso se mide.
     */
    botonRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })

    const colocar = () => {
      const boton = botonRef.current
      if (!boton) return

      const r = boton.getBoundingClientRect()
      /*
       * De campo, el panel mide lo mismo que el campo: se lee como su
       * continuacion y no como una ventana suelta.
       *
       * Con un minimo, eso si: metido en una celda de tabla el campo puede
       * quedar en 120 px, y entonces el menu salia tan angosto que todas las
       * opciones se leian iguales — "Transferencia ...", "Transferencia ..." —
       * y no habia forma de elegir. El campo sigue truncando; el menu, no.
       */
      const ancho = variante === 'campo' ? Math.max(r.width, 240) : 260
      // Alto real del panel: la lista no pasa de max-h-[16rem] y el titulo
      // ocupa 33px. Estimarlo de mas hacia que se abriera hacia arriba sin
      // necesidad, tapando lo que hay encima del campo.
      const alto =
        Math.min(items.length * 40 + 8, 256) + (titulo ? 33 : 0) + (conBuscador ? 45 : 0)

      // Si no cabe debajo, se abre hacia arriba.
      const cabeAbajo = r.bottom + alto < window.innerHeight
      setPos({
        top: cabeAbajo ? r.bottom + 6 : Math.max(8, r.top - alto - 6),
        left: Math.min(Math.max(8, r.left), window.innerWidth - ancho - 8),
        ancho,
      })
    }

    colocar()
    const id = requestAnimationFrame(() => setVisible(true))

    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !botonRef.current?.contains(t)) {
        setAbierto(false)
      }
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)

    window.addEventListener('resize', colocar)
    window.addEventListener('scroll', colocar, true)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)

    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', colocar)
      window.removeEventListener('scroll', colocar, true)
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto, items.length, variante, titulo, conBuscador])

  /*
    El cursor entra en el buscador al abrir: se abre y se escribe, sin un clic
    mas. Va en su propio efecto y no junto al calculo de posicion, porque el
    input todavia no existe cuando aquel corre: el panel se pinta recien cuando
    `pos` deja de ser null.
  */
  useEffect(() => {
    if (abierto && pos) buscadorRef.current?.focus()
    // Solo al abrir: pos cambia tambien al hacer scroll y no hay que robar el
    // foco cada vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, pos !== null])

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        disabled={deshabilitado}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        onClick={(e) => {
          e.stopPropagation()
          setAbierto((v) => !v)
        }}
        className={cn(
          'flex items-center transition-colors duration-150 disabled:opacity-50',
          variante === 'campo' &&
            'w-full justify-between gap-2 rounded-field border bg-surface px-3 text-left text-ink',
          variante === 'campo' && FIELD_HEIGHT[size],
          variante === 'campo' && (size === 'sm' ? 'text-[13px]' : 'text-sm'),
          variante === 'campo' &&
            (error ? 'border-red-600' : abierto ? 'border-ink-soft' : 'border-line'),

          variante === 'pastilla' &&
            'inline-flex max-w-full gap-1.5 rounded-full border px-2.5 py-1 text-[12px]',
          variante === 'pastilla' &&
            (abierto
              ? 'border-[rgb(var(--sys-rgb))] bg-[rgb(var(--sys-rgb)/0.08)] text-[rgb(var(--sys-ink-rgb))]'
              : 'border-line bg-white text-ink-muted hover:border-line-strong'),
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {icono}
          <span className="truncate">{resumen}</span>
        </span>
        <ChevronDown
          size={variante === 'campo' ? 16 : 13}
          className={cn(
            'shrink-0 text-ink-soft transition-transform duration-150',
            abierto && 'rotate-180',
          )}
        />
      </button>

      {abierto &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            data-floating-panel
            style={{ top: pos.top, left: pos.left, width: pos.ancho }}
            className={cn(
              'fixed z-50 max-w-[calc(100vw-2rem)] origin-top overflow-hidden',
              // rounded-field y no rounded-panel: los 20px del panel son para
              // un modal grande, y en una lista de 200 px dejan un marco vacio
              // alrededor de la unica fila. Ademas asi el menu tiene el mismo
              // radio que el campo del que sale.
              'rounded-field bg-white shadow-xl shadow-zinc-900/20 ring-1 ring-zinc-200',
              'transition-all duration-150',
              visible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-95 opacity-0',
            )}
          >
            {titulo && (
              <p className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                {titulo}
              </p>
            )}

            {conBuscador && items.length > 0 && (
              <div className="relative border-b border-line p-2">
                <Search
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft"
                />
                <input
                  ref={buscadorRef}
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter elige lo unico que quedo: buscar y confirmar sin
                    // levantar la mano del teclado.
                    if (e.key === 'Enter' && visibles.length === 1) {
                      visibles[0].onClick?.()
                      if (!multiple) setAbierto(false)
                    }
                  }}
                  placeholder="Buscar..."
                  className="w-full rounded-field border border-line py-1.5 pr-7 pl-7 text-[13px] text-ink outline-none focus:border-ink-soft"
                />
                {filtro && (
                  <button
                    type="button"
                    onClick={() => {
                      setFiltro('')
                      buscadorRef.current?.focus()
                    }}
                    aria-label="Limpiar búsqueda"
                    className="absolute top-1/2 right-4 -translate-y-1/2 rounded p-0.5 text-ink-soft transition-colors hover:text-ink"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {items.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-ink-soft">{vacio}</p>
            ) : visibles.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-ink-soft">
                Nada coincide con «{filtro}»
              </p>
            ) : (
              <ul className="max-h-[16rem] overflow-y-auto py-1">
                {visibles.map((item) => (
                  <li key={item.id}>
                    <div
                      role={item.onClick ? 'option' : undefined}
                      aria-selected={marcado(item.id)}
                      aria-disabled={item.deshabilitado || undefined}
                      onClick={() => {
                        item.onClick?.()
                        // Elegir cierra: en un campo, el panel ya cumplio. Con varios elegidos no, y lo
                        // deshabilitado no elige nada, asi que tampoco cierra.
                        if (seleccionado !== undefined && item.onClick) setAbierto(false)
                      }}
                      className={cn(
                        'flex items-center justify-between gap-3 px-3 py-2',
                        item.onClick && 'cursor-pointer hover:bg-slate-50',
                        item.deshabilitado && 'cursor-not-allowed opacity-50',
                        marcado(item.id) && 'bg-[rgb(var(--sys-rgb)/0.08)]',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {conChecks && (
                          <Check
                            size={14}
                            className={cn(
                              'shrink-0 text-[rgb(var(--sys-ink-rgb))]',
                              !marcado(item.id) && 'invisible',
                            )}
                          />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-ink">{item.label}</span>
                          {item.nota && (
                            <span className="block text-[11px] text-ink-soft">{item.nota}</span>
                          )}
                        </span>
                      </span>
                      {item.detalle && (
                        <span className="shrink-0 text-[12px] font-medium text-ink-muted">
                          {item.detalle}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
