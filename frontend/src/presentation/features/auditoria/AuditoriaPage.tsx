import { useState } from 'react'
import { FaEye } from 'react-icons/fa6'
import { FilePlus2, FilePen, FileX2, ScrollText, Trash2 } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type {
  AccionAuditoria,
  ConsultaListado,
  DetalleAuditoria,
  PaginaAuditoria,
  RegistroAuditoria,
  ResumenAuditoria,
} from '@/domain/entities/Configuracion'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, ListPage, Modal, StatCard, useConfirmacion, useToast } from '@/shared/ui'
import type { BadgeTone, DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
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

const CONSULTA_INICIAL: ConsultaListado = {
  pagina: 1,
  porPagina: POR_PAGINA,
  buscar: '',
  orden: null,
  sentido: null,
  filtros: [],
}

const PAGINA_VACIA: PaginaAuditoria = { items: [], total: 0, pagina: 1, porPagina: POR_PAGINA }

function valorTexto(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * La bitácora: quién cambió qué y cuándo. Solo lectura; los registros nunca
 * contienen claves. La tabla trabaja contra el servidor (modo servidor de
 * SysDataTable): una bitácora crece sin tope y traerla entera no tiene sentido.
 */
export function AuditoriaPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeDepurar = puede(SUBMODULO, ACCION.eliminar)

  // Lo que la tabla está mostrando: es también lo que "Depurar" va a borrar.
  const [consulta, setConsulta] = useState<ConsultaListado>(CONSULTA_INICIAL)

  const pagina = useCarga<PaginaAuditoria>(() => useCases.listarAuditoria.execute(consulta), [useCases, consulta], PAGINA_VACIA)
  const entidades = useCarga<string[]>(() => useCases.entidadesAuditoria.execute(), [useCases], [])
  const resumen = useCarga<ResumenAuditoria | null>(
    () => useCases.resumenAuditoria.execute(),
    [useCases, pagina.datos.total],
    null,
  )

  const [detalle, setDetalle] = useState<DetalleAuditoria | null>(null)
  const [abriendo, setAbriendo] = useState<number | null>(null)

  async function verCambios(r: RegistroAuditoria) {
    setAbriendo(r.id)
    const res = await useCases.detalleAuditoria.execute(r.id)
    setAbriendo(null)
    if (res.isLeft()) {
      toast.error(describeFailure(res.value))
      return
    }
    setDetalle(res.value)
  }

  function pedirDepurar() {
    const vista = consulta
    const filtros = vista.filtros.filter((f) => f.valor.trim() !== '')
    confirmar({
      titulo: 'Depurar auditoría',
      mensaje:
        `Se eliminarán los ${pagina.datos.total} registros que ves ahora` +
        (vista.buscar.trim() || filtros.length ? ' (con tu búsqueda y tus filtros)' : ' (sin ningún filtro: toda la bitácora)') +
        '. Nunca se borra lo de los últimos 30 días. Queda un registro que dice qué se depuró. Esta acción no se puede deshacer.',
      confirmar: 'Depurar',
      tono: 'danger',
      accion: async () => {
        const r = await useCases.depurarAuditoria.execute(vista)
        if (r.isLeft()) {
          toast.error(describeFailure(r.value))
          return
        }
        toast.exito(r.value === 0 ? 'No había registros para depurar.' : `${r.value} registro(s) eliminados.`)
        await pagina.recargar()
      },
    })
  }

  const columnas: DataTableColumn<RegistroAuditoria>[] = [
    {
      key: 'fecha',
      label: 'Fecha',
      sortable: true,
      filterType: 'date',
      value: (r) => r.fecha?.getTime() ?? 0,
      render: (r) => <span className="whitespace-nowrap">{r.fecha?.toLocaleString('es-PE') ?? '—'}</span>,
    },
    { key: 'usuario', label: 'Quién', sortable: true, render: (r) => r.usuario || 'Sistema' },
    {
      key: 'entidad',
      label: 'Entidad',
      sortable: true,
      filterType: 'select',
      filterOptions: entidades.datos.map((e) => ({ value: e, label: e })),
    },
    {
      key: 'entidadId',
      label: 'Registro',
      sortable: true,
      render: (r) => <span className="font-mono text-xs">{r.entidadId}</span>,
    },
    {
      key: 'accion',
      label: 'Acción',
      sortable: true,
      filterType: 'select',
      filterOptions: (Object.keys(ACCIONES) as AccionAuditoria[]).map((a) => ({ value: a, label: ACCIONES[a].texto })),
      render: (r) => <Badge tone={ACCIONES[r.accion].tono}>{ACCIONES[r.accion].texto}</Badge>,
    },
    {
      key: 'campos',
      label: 'Datos',
      filterable: false,
      value: (r) => r.campos,
      render: (r) => (r.campos === 1 ? '1 dato' : `${r.campos} datos`),
    },
  ]

  const claves = detalle
    ? [...new Set([...Object.keys(detalle.valoresAnteriores ?? {}), ...Object.keys(detalle.valoresNuevos ?? {})])]
    : []

  return (
    <ListPage
      icon={<ScrollText size={20} />}
      title="Auditoría"
      description="Quién cambió qué y cuándo en la configuración, los accesos y las reservas del panel."
      actions={
        puedeDepurar ? (
          <Button size="sm" variant="secondary" iconRight={<Trash2 size={15} />} onClick={pedirDepurar}>
            Depurar
          </Button>
        ) : undefined
      }
      alert={pagina.error ? <Alert>{pagina.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Registros" value={String(resumen.datos?.total ?? 0)} icon={<ScrollText size={18} />} />
          <StatCard label="Altas" value={String(resumen.datos?.creados ?? 0)} icon={<FilePlus2 size={18} />} />
          <StatCard label="Cambios" value={String(resumen.datos?.actualizados ?? 0)} icon={<FilePen size={18} />} />
          <StatCard label="Bajas" value={String(resumen.datos?.eliminados ?? 0)} icon={<FileX2 size={18} />} tono="danger" />
        </>
      }
      columns={columnas}
      rows={pagina.datos.items}
      rowKey="id"
      cardIcon={ScrollText}
      pageSize={POR_PAGINA}
      servidor={{ total: pagina.datos.total, onConsulta: setConsulta, cargando: pagina.cargando }}
      actionsWidth={90}
      searchPlaceholder="Buscar por entidad, registro, acción o persona..."
      empty={pagina.cargando ? 'Cargando registros...' : 'No hay registros con esos filtros.'}
      rowActions={(r) => (
        <FilaAcciones>
          <BotonFila color="info" titulo={`Ver cambios del registro ${r.entidadId}`} loading={abriendo === r.id} onClick={() => void verCambios(r)}>
            <FaEye />
          </BotonFila>
        </FilaAcciones>
      )}
    >
      <Modal
        open={detalle !== null}
        title={detalle ? `${ACCIONES[detalle.accion].texto} · ${detalle.entidad} ${detalle.entidadId}` : ''}
        description={detalle ? `${detalle.usuario || 'Sistema'} · ${detalle.fecha?.toLocaleString('es-PE') ?? ''}` : undefined}
        size="lg"
        onClose={() => setDetalle(null)}
        footer={
          <Button variant="secondary" size="sm" onClick={() => setDetalle(null)}>
            Cerrar
          </Button>
        }
      >
        {detalle && claves.length === 0 && <p className="text-sm text-ink-muted">Este registro no guardó valores.</p>}
        {detalle && claves.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink-soft">
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

      {dialogo}
    </ListPage>
  )
}
