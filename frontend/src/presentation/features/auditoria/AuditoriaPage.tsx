import { useState } from 'react'
import { ScrollText, Trash2 } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type {
  AccionAuditoria,
  DetalleAuditoria,
  FiltroAuditoria,
  PaginaAuditoria,
  RegistroAuditoria,
  ResumenAuditoria,
} from '@/domain/entities/Configuracion'
import { sumarDias } from '@/domain/fechas'
import { ACCION } from '@/domain/entities/Permiso'
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Select,
  useConfirmacion,
  useToast,
} from '@/shared/ui'
import type { BadgeTone } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'config.auditoria'
const POR_PAGINA = 25

const ACCIONES: Record<AccionAuditoria, { texto: string; tono: BadgeTone }> = {
  CREADO: { texto: 'Creado', tono: 'success' },
  ACTUALIZADO: { texto: 'Modificado', tono: 'info' },
  ELIMINADO: { texto: 'Eliminado', tono: 'danger' },
}

const FILTRO_VACIO: FiltroAuditoria = {
  entidad: '',
  accion: '',
  desde: '',
  hasta: '',
  buscar: '',
  pagina: 1,
  porPagina: POR_PAGINA,
}

const PAGINA_VACIA: PaginaAuditoria = { items: [], total: 0, pagina: 1, porPagina: POR_PAGINA }

function valorTexto(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** La bitácora: quién cambió qué y cuándo. Solo lectura; los registros nunca contienen claves. */
export function AuditoriaPage() {
  const { useCases, hoy } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeDepurar = puede(SUBMODULO, ACCION.eliminar)

  const [borrador, setBorrador] = useState<FiltroAuditoria>(FILTRO_VACIO)
  const [filtro, setFiltro] = useState<FiltroAuditoria>(FILTRO_VACIO)

  const pagina = useCarga<PaginaAuditoria>(() => useCases.listarAuditoria.execute(filtro), [useCases, filtro], PAGINA_VACIA)
  const entidades = useCarga<string[]>(() => useCases.entidadesAuditoria.execute(), [useCases], [])
  const resumen = useCarga<ResumenAuditoria | null>(() => useCases.resumenAuditoria.execute(), [useCases, pagina.datos.total], null)

  const [detalle, setDetalle] = useState<DetalleAuditoria | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [depurar, setDepurar] = useState<string | null>(null)

  const totalPaginas = Math.max(1, Math.ceil(pagina.datos.total / pagina.datos.porPagina))

  function buscar() {
    setFiltro({ ...borrador, pagina: 1 })
  }

  function limpiar() {
    setBorrador(FILTRO_VACIO)
    setFiltro(FILTRO_VACIO)
  }

  async function verCambios(r: RegistroAuditoria) {
    setCargandoDetalle(true)
    const res = await useCases.detalleAuditoria.execute(r.id)
    setCargandoDetalle(false)
    if (res.isLeft()) {
      toast.error(describeFailure(res.value))
      return
    }
    setDetalle(res.value)
  }

  function confirmarDepurar() {
    if (depurar === null) return
    const hasta = depurar
    confirmar({
      titulo: 'Depurar auditoría',
      mensaje: `Se eliminarán TODOS los registros anteriores al ${hasta}. Queda un registro que dice qué se depuró. Esta acción no se puede deshacer.`,
      confirmar: 'Depurar',
      tono: 'danger',
      accion: async () => {
        const r = await useCases.depurarAuditoria.execute(hasta)
        if (r.isLeft()) {
          toast.error(describeFailure(r.value))
          return
        }
        toast.exito(r.value === 0 ? 'No había registros para depurar.' : `${r.value} registro(s) eliminados.`)
        setDepurar(null)
        await pagina.recargar()
      },
    })
  }

  const claves = detalle
    ? [...new Set([...Object.keys(detalle.valoresAnteriores ?? {}), ...Object.keys(detalle.valoresNuevos ?? {})])]
    : []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Auditoría"
        description="Quién cambió qué y cuándo en la configuración, los accesos y las reservas del panel."
        icon={<ScrollText size={20} />}
        actions={
          puedeDepurar ? (
            <Button
              variant="secondary"
              iconRight={<Trash2 size={15} />}
              onClick={() => setDepurar(sumarDias(hoy(), -90))}
            >
              Depurar
            </Button>
          ) : undefined
        }
      />

      {resumen.datos && (
        <p className="text-sm text-ink-muted">
          {resumen.datos.total} registros · {resumen.datos.creados} altas · {resumen.datos.actualizados} cambios ·{' '}
          {resumen.datos.eliminados} bajas
          {resumen.datos.ultimo && ` · último: ${resumen.datos.ultimo.toLocaleString('es-PE')}`}
        </p>
      )}

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto] 2xl:items-end sm:p-4">
        <Input
          label="Buscar"
          value={borrador.buscar}
          onChange={(e) => setBorrador({ ...borrador, buscar: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
          placeholder="Persona, registro…"
        />
        <Select label="Entidad" value={borrador.entidad} onChange={(e) => setBorrador({ ...borrador, entidad: e.target.value })}>
          <option value="">Todas</option>
          {entidades.datos.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
        <Select
          label="Acción"
          value={borrador.accion}
          onChange={(e) => setBorrador({ ...borrador, accion: e.target.value as AccionAuditoria | '' })}
        >
          <option value="">Todas</option>
          {(Object.keys(ACCIONES) as AccionAuditoria[]).map((a) => (
            <option key={a} value={a}>{ACCIONES[a].texto}</option>
          ))}
        </Select>
        <Input label="Desde" type="date" value={borrador.desde} onChange={(e) => setBorrador({ ...borrador, desde: e.target.value })} />
        <Input label="Hasta" type="date" value={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, hasta: e.target.value })} />
        <div className="flex gap-2">
          <Button onClick={buscar}>Filtrar</Button>
          <Button variant="secondary" onClick={limpiar}>Limpiar</Button>
        </div>
      </Card>

      {pagina.error && <Alert>{pagina.error}</Alert>}

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Quién</th>
                <th className="px-4 py-3 font-semibold">Entidad</th>
                <th className="px-4 py-3 font-semibold">Registro</th>
                <th className="px-4 py-3 font-semibold">Acción</th>
                <th className="px-4 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pagina.cargando && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">Cargando…</td></tr>
              )}
              {!pagina.cargando && pagina.datos.items.length === 0 && !pagina.error && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">No hay registros con esos filtros.</td></tr>
              )}
              {pagina.datos.items.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{r.fecha?.toLocaleString('es-PE') ?? '—'}</td>
                  <td className="px-4 py-3 text-ink">{r.usuario || 'Sistema'}</td>
                  <td className="px-4 py-3 text-ink-muted">{r.entidad}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-muted">{r.entidadId}</td>
                  <td className="px-4 py-3">
                    <Badge tone={ACCIONES[r.accion].tono}>{ACCIONES[r.accion].texto}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button variant="ghost" disabled={cargandoDetalle} onClick={() => void verCambios(r)}>
                        Ver cambios
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-muted">
          <span>
            Página {pagina.datos.pagina} de {totalPaginas} · {pagina.datos.total} registros
          </span>
          <span className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={filtro.pagina <= 1}
              onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina - 1 })}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={filtro.pagina >= totalPaginas}
              onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina + 1 })}
            >
              Siguiente
            </Button>
          </span>
        </div>
      </Card>

      <Modal
        open={detalle !== null}
        title={detalle ? `${ACCIONES[detalle.accion].texto} · ${detalle.entidad} ${detalle.entidadId}` : ''}
        description={detalle ? `${detalle.usuario || 'Sistema'} · ${detalle.fecha?.toLocaleString('es-PE') ?? ''}` : undefined}
        size="lg"
        onClose={() => setDetalle(null)}
        footer={<Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>}
      >
        {detalle && claves.length === 0 && <p className="text-sm text-ink-muted">Este registro no guardó valores.</p>}
        {detalle && claves.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Campo</th>
                <th className="py-2 pr-3 font-semibold">Antes</th>
                <th className="py-2 font-semibold">Después</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {claves.map((k) => (
                <tr key={k}>
                  <td className="py-2 pr-3 font-medium text-ink">{k}</td>
                  <td className="py-2 pr-3 break-words text-ink-muted">{valorTexto(detalle.valoresAnteriores?.[k])}</td>
                  <td className="py-2 break-words text-ink">{valorTexto(detalle.valoresNuevos?.[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <Modal
        open={depurar !== null}
        title="Depurar auditoría"
        size="sm"
        onClose={() => setDepurar(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDepurar(null)}>Cancelar</Button>
            <Button onClick={confirmarDepurar}>Continuar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Borra los registros <strong>anteriores</strong> a la fecha. Nunca se depura lo de los últimos 30 días.
          </p>
          <Input label="Anteriores a" type="date" value={depurar ?? ''} onChange={(e) => setDepurar(e.target.value)} />
        </div>
      </Modal>

      {dialogo}
    </div>
  )
}
