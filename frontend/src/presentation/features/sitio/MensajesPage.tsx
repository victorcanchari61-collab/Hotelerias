import { useState } from 'react'
import { FaCheck, FaEnvelopeOpen, FaReply, FaTrashCan } from 'react-icons/fa6'
import { Inbox, Mail } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { EstadoMensaje, Mensaje } from '@/domain/entities/Sitio'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, ListPage, Modal, StatCard, useConfirmacion, useToast } from '@/shared/ui'
import type { BadgeTone, DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'sitio.mensajes'

const ETIQUETA: Record<EstadoMensaje, string> = { nuevo: 'Nuevo', leido: 'Leído', respondido: 'Respondido' }
const TONO: Record<EstadoMensaje, BadgeTone> = { nuevo: 'warning', leido: 'info', respondido: 'success' }

const cuando = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d) : '—'

/** Lo que los visitantes escriben en el formulario de «Contacto» de la web. */
export function MensajesPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeEditar = puede(SUBMODULO, ACCION.editar)
  const puedeEliminar = puede(SUBMODULO, ACCION.eliminar)

  const mensajes = useCarga<Mensaje[]>(() => useCases.listarMensajes.execute(undefined), [useCases], [])
  const [abierto, setAbierto] = useState<Mensaje | null>(null)
  const lista = mensajes.datos

  async function cambiar(m: Mensaje, estado: EstadoMensaje) {
    const r = await useCases.cambiarEstadoMensaje.execute({ id: m.id, estado })
    if (r.isLeft()) {
      toast.error(describeFailure(r.value))
      return
    }
    setAbierto((a) => (a && a.id === m.id ? { ...a, estado } : a))
    await mensajes.recargar()
  }

  /** Al abrir un mensaje nuevo se marca como leído: lo que se leyó ya no es «nuevo». */
  function abrir(m: Mensaje) {
    setAbierto(m)
    if (puedeEditar && m.estado === 'nuevo') void cambiar(m, 'leido')
  }

  function pedirEliminar(m: Mensaje) {
    confirmar({
      titulo: 'Eliminar mensaje',
      mensaje: `Se borrará el mensaje de ${m.nombre}. No se puede deshacer.`,
      confirmar: 'Eliminar',
      cancelar: 'Cancelar',
      tono: 'danger',
      accion: async () => {
        const r = await useCases.eliminarMensaje.execute(m.id)
        if (r.isLeft()) {
          toast.error(describeFailure(r.value))
          return
        }
        toast.exito('Mensaje eliminado.')
        setAbierto(null)
        await mensajes.recargar()
      },
    })
  }

  const columnas: DataTableColumn<Mensaje>[] = [
    {
      key: 'de',
      label: 'De',
      filterable: false,
      value: (m) => `${m.nombre} ${m.email} ${m.asunto} ${m.mensaje}`,
      render: (m) => (
        <div className="min-w-0">
          <div className={m.estado === 'nuevo' ? 'font-semibold text-ink' : 'font-medium text-ink'}>{m.nombre}</div>
          <div className="truncate text-xs text-ink-soft">{m.email}</div>
        </div>
      ),
    },
    {
      key: 'asunto',
      label: 'Mensaje',
      filterable: false,
      value: (m) => `${m.asunto} ${m.mensaje}`,
      render: (m) => (
        <div className="max-w-md min-w-0">
          {m.asunto && <div className="truncate text-sm font-medium">{m.asunto}</div>}
          <div className="truncate text-xs text-ink-soft">{m.mensaje}</div>
        </div>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      filterType: 'select',
      filterOptions: (Object.keys(ETIQUETA) as EstadoMensaje[]).map((e) => ({ value: ETIQUETA[e], label: ETIQUETA[e] })),
      value: (m) => ETIQUETA[m.estado],
      render: (m) => <Badge tone={TONO[m.estado]}>{ETIQUETA[m.estado]}</Badge>,
    },
    { key: 'cuando', label: 'Recibido', filterable: false, value: (m) => m.creadoEn?.getTime() ?? 0, render: (m) => <span className="whitespace-nowrap">{cuando(m.creadoEn)}</span> },
  ]

  return (
    <ListPage
      icon={<Mail size={20} />}
      title="Mensajes recibidos"
      description="Lo que escriben los visitantes en «Contacto». Respóndelos por correo o teléfono y márcalos como respondidos."
      alert={mensajes.error ? <Alert>{mensajes.error}</Alert> : undefined}
      stats={
        <>
          <StatCard
            label="Nuevos"
            value={String(lista.filter((m) => m.estado === 'nuevo').length)}
            icon={<Inbox size={18} />}
            tono={lista.some((m) => m.estado === 'nuevo') ? 'warning' : 'neutral'}
          />
          <StatCard label="Leídos" value={String(lista.filter((m) => m.estado === 'leido').length)} icon={<FaEnvelopeOpen size={16} />} />
          <StatCard label="Respondidos" value={String(lista.filter((m) => m.estado === 'respondido').length)} icon={<FaCheck size={16} />} />
        </>
      }
      columns={columnas}
      rows={lista}
      rowKey="id"
      cardIcon={Mail}
      actionsWidth={puedeEditar || puedeEliminar ? 100 : 0}
      searchPlaceholder="Buscar por nombre, correo o texto..."
      empty={mensajes.cargando ? 'Cargando mensajes...' : 'Todavía no llegó ningún mensaje.'}
      rowActions={(m) => (
        <FilaAcciones>
          <BotonFila color="info" titulo={`Leer el mensaje de ${m.nombre}`} onClick={() => abrir(m)}>
            <FaEnvelopeOpen />
          </BotonFila>
          {puedeEliminar && (
            <BotonFila color="danger" titulo={`Eliminar el mensaje de ${m.nombre}`} onClick={() => pedirEliminar(m)}>
              <FaTrashCan />
            </BotonFila>
          )}
        </FilaAcciones>
      )}
    >
      <Modal
        open={abierto !== null}
        title={abierto?.asunto || 'Mensaje de contacto'}
        description={abierto ? `${abierto.nombre} · ${cuando(abierto.creadoEn)}` : undefined}
        onClose={() => setAbierto(null)}
        footer={
          abierto && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setAbierto(null)}>
                Cerrar
              </Button>
              {puedeEditar && abierto.estado !== 'respondido' && (
                <Button size="sm" iconRight={<FaCheck size={13} />} onClick={() => void cambiar(abierto, 'respondido')}>
                  Marcar respondido
                </Button>
              )}
              {puedeEditar && abierto.estado === 'respondido' && (
                <Button variant="secondary" size="sm" onClick={() => void cambiar(abierto, 'leido')}>
                  Volver a pendiente
                </Button>
              )}
            </>
          )
        }
      >
        {abierto && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONO[abierto.estado]}>{ETIQUETA[abierto.estado]}</Badge>
              <a className="inline-flex items-center gap-1.5 text-sm text-[var(--accent-ink)] underline underline-offset-4" href={`mailto:${abierto.email}`}>
                <FaReply size={12} /> {abierto.email}
              </a>
              {abierto.telefono && (
                <a className="text-sm text-[var(--accent-ink)] underline underline-offset-4" href={`tel:${abierto.telefono.replace(/[^\d+]/g, '')}`}>
                  {abierto.telefono}
                </a>
              )}
            </div>
            {/* Texto plano con saltos de línea respetados: nada de HTML. */}
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{abierto.mensaje}</p>
          </div>
        )}
      </Modal>
      {dialogo}
    </ListPage>
  )
}
