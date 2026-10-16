import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Download, FileText, PackageCheck, Printer } from 'lucide-react'
import { Alert } from './Alert'
import { Button } from './Button'
import { Modal } from './Modal'
import { VisorPdfMovil } from './VisorPdfMovil'
import { RowAction } from './RowAction'
import { cn } from './cn'
import { ApiError, guardarArchivo, obtenerArchivo } from '../../lib/apiClient'

/** Los documentos que se pueden imprimir, con la ruta que los sirve. */
export type DocumentoPdf =
  | 'pedido'
  | 'notaventa'
  | 'ordencompra'
  | 'compra'
  | 'ajustes'
  | 'transferencias'
  | 'recepciones'
  | 'prestamos'
  | 'devolucionesprestamo'
  | 'despacho'

type Formato = 'a4' | 'ticket' | 'copias'

const TITULOS: Record<DocumentoPdf, string> = {
  pedido: 'Pedido',
  notaventa: 'Nota de venta',
  ordencompra: 'Orden de compra',
  compra: 'Compra',
  ajustes: 'Ajuste',
  transferencias: 'Transferencia',
  recepciones: 'Recepción',
  prestamos: 'Préstamo',
  devolucionesprestamo: 'Devolución de préstamo',
  despacho: 'Despacho',
}

/*
 * Los de inventario cuelgan de /inventario porque comparten tabla y numeracion
 * de id: cada tipo necesita su propia ruta para que el backend sepa que
 * permiso exigir antes de leer el documento.
 */
const INVENTARIO: DocumentoPdf[] = ['ajustes', 'transferencias', 'recepciones', 'prestamos']

/*
 * Documentos que solo existen en hoja.
 *
 * El despacho son los pedidos de la carga, dos copias por hoja apaisada: en un
 * rollo de 80 mm no se puede cortar por la mitad, asi que ofrecer "ticket"
 * seria ofrecer algo que no existe.
 */
const SOLO_A4: DocumentoPdf[] = ['despacho']

/*
 * Documentos que además tienen hoja de dos copias.
 *
 * Solo el pedido: es el papel que se entrega en mano y que el repartidor
 * pierde, así que hay que poder reponer los dos — el del cliente y el que
 * vuelve firmado — sin imprimir dos veces y recortar.
 */
const CON_COPIAS: DocumentoPdf[] = ['pedido']

const rutaDe = (documento: DocumentoPdf) =>
  // La devolución de préstamo cuelga de su propio préstamo, no de /inventario
  // a secas: comparte tabla y numeración con los otros documentos de
  // inventario, pero su ruta va anidada bajo prestamos/devoluciones.
  documento === 'devolucionesprestamo'
    ? '/inventario/prestamos/devoluciones'
    : INVENTARIO.includes(documento)
      ? `/inventario/${documento}`
      : `/${documento}`

/**
 * Reportes que salen de un documento, aparte de su PDF.
 *
 * Del despacho salen dos papeles distintos: los pedidos para entregar y el
 * detalle por cliente, con el que se cuadra lo que se cobra. Cada uno lleva su
 * propio icono en la fila: son para personas distintas y se buscan por
 * separado, no uno escondido dentro del otro.
 */
export type ReportePdf = 'clientes' | 'carga'

const REPORTES: Record<ReportePdf, { titulo: string; icono: React.ReactNode }> = {
  clientes: { titulo: 'Detalle por cliente', icono: <ClipboardList size={15} /> },
  carga: { titulo: 'Reporte de carga', icono: <PackageCheck size={15} /> },
}

export interface AccionPdfProps {
  documento: DocumentoPdf
  id: number
  /** El número visible — encabeza el visor y nombra el archivo. */
  numero: string
  /** Si es un reporte del documento y no su PDF propio. */
  reporte?: ReportePdf
}

/**
 * El botón de PDF de la columna Acciones: abre el documento en un visor.
 *
 * Se ve antes de imprimir porque un documento se revisa: que el cliente sea el
 * que toca, que no falte una línea. Bajar el archivo a ciegas obliga a salir
 * del sistema, abrirlo, comprobar y volver — y si algo estaba mal, repetirlo.
 *
 * Los dos formatos conviven en pestañas y no en dos botones porque son el
 * mismo documento: se compara uno con otro y se imprime el que toque, la hoja
 * A4 para archivar o el ticket de 80 mm para el rollo de la camioneta.
 */
export function AccionPdf({ documento, id, numero, reporte }: AccionPdfProps) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <RowAction
        label={reporte ? `${REPORTES[reporte].titulo} de ${numero}` : `PDF de ${numero}`}
        tone="neutral"
        onClick={() => setAbierto(true)}
      >
        {reporte ? REPORTES[reporte].icono : <FileText size={15} />}
      </RowAction>

      {/* Se monta solo al abrir: si no, cada fila de la tabla pediría su PDF. */}
      {abierto && (
        <VisorPdf
          documento={documento}
          id={id}
          numero={numero}
          reporte={reporte}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  )
}

export function VisorPdf({
  documento,
  id,
  numero,
  reporte,
  consulta,
  onCerrar,
}: AccionPdfProps & {
  /** Filtros del reporte, ya armados como query: `mercados=1,2&unidades=BOL`. */
  consulta?: string
  onCerrar: () => void
}) {
  const [formato, setFormato] = useState<Formato>('a4')
  const [url, setUrl] = useState('')
  const [nombre, setNombre] = useState('')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const marco = useRef<HTMLIFrameElement>(null)

  /*
   * En el telefono el PDF no va en un <iframe>: ningun navegador movil lo
   * dibuja ahi. Se pinta con pdf.js sobre un canvas, y si eso tambien falla
   * quedan los botones de descargar y abrir en el visor del sistema.
   */
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  )
  const [visorFallo, setVisorFallo] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const sincronizar = () => setEsMovil(mq.matches)
    mq.addEventListener('change', sincronizar)
    return () => mq.removeEventListener('change', sincronizar)
  }, [])

  // Al cambiar de documento o de formato se reintenta dibujar.
  useEffect(() => setVisorFallo(false), [documento, id, formato])
  const soloA4 = SOLO_A4.includes(documento)
  const conCopias = CON_COPIAS.includes(documento)

  useEffect(() => {
    let vivo = true
    let creada = ''

    const traer = async () => {
      setCargando(true)
      setError('')
      try {
        // Un reporte propio va en su ruta; un formato del mismo papel, en la query.
        const sufijo = reporte
          ? `/${reporte}${consulta ? `?${consulta}` : ''}`
          : formato === 'a4' ? '' : `?formato=${formato}`
        const archivo = await obtenerArchivo(
          `${rutaDe(documento)}/${id}/pdf${sufijo}`,
          `${documento}-${numero}.pdf`,
        )
        if (!vivo) return
        creada = URL.createObjectURL(archivo.blob)
        setUrl(creada)
        setNombre(archivo.nombre)
        setBlob(archivo.blob)
      } catch (e) {
        // El 403 ya abre por su cuenta el modal de pedir permiso; aquí solo
        // queda decir por qué no se ve nada.
        if (vivo) setError(e instanceof ApiError ? e.message : 'No pudimos generar el PDF.')
      } finally {
        if (vivo) setCargando(false)
      }
    }

    void traer()
    return () => {
      vivo = false
      // Cada cambio de formato crea un archivo en memoria; sin soltarlo, se
      // acumulan hasta recargar la página.
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [documento, id, numero, formato, reporte, consulta])

  const imprimir = useCallback(() => {
    // Se imprime el propio visor incrustado. Algunos navegadores no dejan
    // llegar al documento de dentro; entonces se abre en otra pestaña, donde
    // el lector trae su propio botón de imprimir.
    try {
      const ventana = marco.current?.contentWindow
      if (!ventana) throw new Error('sin marco')
      ventana.focus()
      ventana.print()
    } catch {
      window.open(url, '_blank', 'noopener')
    }
  }, [url])

  return (
    <Modal
      open
      size="lg"
      title={reporte ? `${REPORTES[reporte].titulo} — ${numero}` : `${TITULOS[documento]} ${numero}`}
      description="Revísalo antes de imprimirlo o guardarlo."
      onClose={onCerrar}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!url}
            onClick={imprimir}
            iconRight={<Printer size={15} />}
          >
            Imprimir
          </Button>
          <Button
            size="sm"
            disabled={!blob}
            onClick={() => blob && guardarArchivo(blob, nombre)}
            iconRight={<Download size={15} />}
          >
            Descargar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!soloA4 && !reporte && (
          <div className="flex gap-1.5">
            <Pestana activa={formato === 'a4'} onClick={() => setFormato('a4')}>
              A4
            </Pestana>
            {conCopias && (
              <Pestana activa={formato === 'copias'} onClick={() => setFormato('copias')}>
                Dos copias
              </Pestana>
            )}
            <Pestana activa={formato === 'ticket'} onClick={() => setFormato('ticket')}>
              Ticket 80 mm
            </Pestana>
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        <div className="relative h-[65vh] min-h-[360px] overflow-hidden rounded-field border border-line bg-surface-alt">
          {cargando && (
            <div className="absolute inset-0 grid place-items-center text-sm text-ink-soft">
              Generando el documento...
            </div>
          )}
          {url && !error && !esMovil && (
            <iframe
              ref={marco}
              src={url}
              title={reporte ? `${REPORTES[reporte].titulo} — ${numero}` : `${TITULOS[documento]} ${numero}`}
              className="h-full w-full"
            />
          )}

          {url && !error && esMovil && !visorFallo && (
            <VisorPdfMovil url={url} onError={() => setVisorFallo(true)} />
          )}

          {url && !error && esMovil && visorFallo && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-ink-soft">
                No pudimos dibujar el documento aquí. Ábrelo con el visor del teléfono.
              </p>
              <Button size="sm" onClick={() => blob && guardarArchivo(blob, nombre)}>
                Descargar
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Pestana({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-field px-3 py-1.5 text-xs font-semibold transition',
        activa ? 'bg-ink text-surface' : 'bg-surface-alt text-ink-soft hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
