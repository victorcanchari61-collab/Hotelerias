import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { Alert } from './Alert'
import { Button } from './Button'
import { Modal } from './Modal'
import { VisorPdfMovil } from './VisorPdfMovil'
import { ApiError, guardarArchivo, obtenerArchivo } from '../../lib/apiClient'

export interface VisorReportePdfProps {
  /** La ruta del reporte en el API, ya con sus filtros en la query. */
  ruta: string
  titulo: string
  /** El nombre del archivo si el servidor no manda uno. */
  nombreArchivo: string
  onCerrar: () => void
}

/**
 * El visor de un reporte de listado: el PDF de lo que la tabla está mostrando.
 *
 * Hermano de `VisorPdf`, que es el de un documento con su número. Un reporte
 * no tiene id: se pide a una ruta con los filtros de la tabla en la query, y
 * se ve antes de imprimir para comprobar que el recorte es el que se quería.
 */
export function VisorReportePdf({ ruta, titulo, nombreArchivo, onCerrar }: VisorReportePdfProps) {
  const [url, setUrl] = useState('')
  const [nombre, setNombre] = useState('')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const marco = useRef<HTMLIFrameElement>(null)

  // En el teléfono el PDF no va en un <iframe>: se pinta con pdf.js.
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

  useEffect(() => {
    let vivo = true
    let creada = ''

    const traer = async () => {
      setCargando(true)
      setError('')
      setVisorFallo(false)
      try {
        const archivo = await obtenerArchivo(ruta, nombreArchivo)
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
      // Sin soltarlo, el archivo en memoria se queda hasta recargar la página.
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [ruta, nombreArchivo])

  const imprimir = useCallback(() => {
    // Se imprime el propio visor incrustado; si el navegador no deja llegar al
    // documento de dentro, se abre en otra pestaña, que trae su botón.
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
      size="xl"
      title={titulo}
      description="Con los filtros que tienes puestos. Revísalo antes de imprimirlo o guardarlo."
      onClose={onCerrar}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button variant="secondary" size="sm" disabled={!url} onClick={imprimir} iconRight={<Printer size={15} />}>
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
        {error && <Alert>{error}</Alert>}

        <div className="relative h-[68vh] min-h-[360px] overflow-hidden rounded-field border border-line bg-surface-alt">
          {cargando && (
            <div className="absolute inset-0 grid place-items-center text-sm text-ink-soft">
              Generando el reporte...
            </div>
          )}

          {url && !error && !esMovil && (
            <iframe ref={marco} src={url} title={titulo} className="h-full w-full" />
          )}

          {url && !error && esMovil && !visorFallo && (
            <VisorPdfMovil url={url} onError={() => setVisorFallo(true)} />
          )}

          {url && !error && esMovil && visorFallo && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-ink-soft">
                No pudimos dibujar el reporte aquí. Ábrelo con el visor del teléfono.
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
