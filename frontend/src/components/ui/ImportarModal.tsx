import { useRef, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { Alert } from './Alert'
import { Button } from './Button'
import { cn } from './cn'
import { Modal } from './Modal'
import { leerExcel } from '../../lib/excel'
import type { FilaExcel } from '../../lib/excel'

/** Lo que el backend responde por cada importacion. */
export interface ResultadoImportacion {
  creados: number
  actualizados: number
  omitidos: number
  errores: { fila: number; documento: string; motivo: string }[]
}

export interface ImportarModalProps<T> {
  open: boolean
  onClose: () => void
  /** Que se importa: "clientes", "proveedores"... */
  titulo: string
  /** Columnas que se esperan del archivo, para mostrarlas como ayuda. */
  columnasEsperadas: string[]
  /** Convierte una fila del archivo al cuerpo que espera la API. */
  mapear: (fila: FilaExcel) => T
  /** Envia las filas ya mapeadas. */
  onImportar: (filas: T[], actualizarExistentes: boolean) => Promise<ResultadoImportacion>
  /** Se llama al cerrar si algo se guardo, para recargar el listado. */
  onListo: () => void
}

export function ImportarModal<T>({
  open,
  onClose,
  titulo,
  columnasEsperadas,
  mapear,
  onImportar,
  onListo,
}: ImportarModalProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [archivo, setArchivo] = useState<File | null>(null)
  const [filas, setFilas] = useState<FilaExcel[]>([])
  const [columnas, setColumnas] = useState<string[]>([])
  const [actualizar, setActualizar] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)

  const limpiar = () => {
    setArchivo(null)
    setFilas([])
    setColumnas([])
    setResultado(null)
    setError('')
    setActualizar(false)
  }

  const cerrar = () => {
    if (resultado && resultado.creados + resultado.actualizados > 0) onListo()
    limpiar()
    onClose()
  }

  const elegir = async (elegido: File | undefined) => {
    if (!elegido) return
    setLeyendo(true)
    setError('')
    setResultado(null)
    try {
      const { filas: leidas, columnas: titulos } = await leerExcel(elegido)
      if (leidas.length === 0) {
        setError('El archivo no tiene filas con datos.')
        return
      }
      setArchivo(elegido)
      setFilas(leidas)
      setColumnas(titulos)
    } catch {
      setError('No pudimos leer el archivo. Debe ser .xlsx, .xls o .csv.')
    } finally {
      setLeyendo(false)
    }
  }

  const importar = async () => {
    setEnviando(true)
    setError('')
    try {
      setResultado(await onImportar(filas.map(mapear), actualizar))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos importar el archivo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      open={open}
      title={`Importar ${titulo}`}
      description="Desde un archivo de Excel o CSV. Cada fila se procesa por separado."
      size="lg"
      onClose={cerrar}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={cerrar}>
            {resultado ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!resultado && (
            <Button
              size="sm"
              disabled={filas.length === 0}
              loading={enviando}
              onClick={() => void importar()}
            >
              Importar {filas.length > 0 ? `${filas.length} filas` : ''}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        {/* Resultado */}
        {resultado ? (
          <>
            <div className="flex items-center gap-3 rounded-panel border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 size={22} className="shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-800">
                <b>{resultado.creados}</b> creados
                {resultado.actualizados > 0 && (
                  <>
                    , <b>{resultado.actualizados}</b> actualizados
                  </>
                )}
                {resultado.omitidos > 0 && (
                  <>
                    , <b>{resultado.omitidos}</b> omitidos
                  </>
                )}
                .
              </p>
            </div>

            {resultado.errores.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">
                  Filas que no se guardaron ({resultado.errores.length})
                </p>
                <div className="max-h-64 overflow-y-auto rounded-field border border-line">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-alt">
                      <tr className="text-left text-[11px] tracking-wider text-ink-muted uppercase">
                        <th className="px-3 py-2">Fila</th>
                        <th className="px-3 py-2">Documento</th>
                        <th className="px-3 py-2">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.errores.map((e, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-3 py-1.5 tabular-nums text-ink-muted">{e.fila}</td>
                          <td className="px-3 py-1.5 font-medium text-ink">{e.documento || '—'}</td>
                          <td className="px-3 py-1.5 text-ink-muted">{e.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-ink-soft">
                  El número de fila corresponde a la posición dentro del archivo, sin contar los
                  encabezados.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Selector de archivo */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-2 rounded-panel border-2 border-dashed p-6 transition-colors',
                archivo
                  ? 'border-[rgb(var(--sys-rgb)/0.4)] bg-[rgb(var(--sys-rgb)/0.05)]'
                  : 'border-line-strong hover:border-ink-soft hover:bg-surface-alt',
              )}
            >
              {archivo ? (
                <>
                  <FileSpreadsheet size={26} className="text-[rgb(var(--sys-ink-rgb))]" />
                  <span className="text-sm font-semibold text-ink">{archivo.name}</span>
                  <span className="text-xs text-ink-muted">
                    {filas.length} filas · {columnas.length} columnas · toca para cambiarlo
                  </span>
                </>
              ) : (
                <>
                  <Upload size={26} className="text-ink-soft" />
                  <span className="text-sm font-semibold text-ink">
                    {leyendo ? 'Leyendo el archivo...' : 'Elige un archivo .xlsx, .xls o .csv'}
                  </span>
                  <span className="text-xs text-ink-muted">
                    Se detecta solo la fila de encabezados
                  </span>
                </>
              )}
            </button>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void elegir(e.target.files?.[0])}
            />

            {/* Vista previa */}
            {filas.length > 0 && (
              <>
                <div>
                  <p className="mb-2 text-sm font-semibold text-ink">
                    Vista previa (primeras 5 de {filas.length})
                  </p>
                  <div className="overflow-x-auto rounded-field border border-line">
                    <table className="w-full text-[12px] whitespace-nowrap">
                      <thead className="bg-surface-alt">
                        <tr className="text-left text-[11px] tracking-wider text-ink-muted uppercase">
                          {columnas.map((c) => (
                            <th key={c} className="px-3 py-2">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filas.slice(0, 5).map((fila, i) => (
                          <tr key={i} className="border-t border-line">
                            {columnas.map((c) => (
                              <td key={c} className="max-w-40 truncate px-3 py-1.5 text-ink-muted">
                                {fila[
                                  c
                                    .normalize('NFD')
                                    .replace(/[̀-ͯ]/g, '')
                                    .replace(/\s+/g, ' ')
                                    .trim()
                                    .toLowerCase()
                                ] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={actualizar}
                    onChange={(e) => setActualizar(e.target.checked)}
                    className="size-4 cursor-pointer rounded border-line-strong accent-[rgb(var(--sys-rgb))]"
                  />
                  Si el documento ya existe, actualizar sus datos en vez de omitirlo
                </label>
              </>
            )}

            <p className="text-xs text-ink-soft">
              Columnas que se leen: {columnasEsperadas.join(' · ')}. Las demás se ignoran.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
