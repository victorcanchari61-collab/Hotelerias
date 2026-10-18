import { useState } from 'react'
import { FaPencil, FaTrashCan } from 'react-icons/fa6'
import { GalleryHorizontal, Plus } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Banner, BannerInput, MedioRef } from '@/domain/entities/Sitio'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Checkbox, Input, ListPage, Modal, StatCard, useConfirmacion, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { MedioMiniatura } from '../../components/MedioMiniatura'
import { SelectorMedio } from '../../components/SelectorMedio'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import { fechaCorta } from '../portal/format'

const SUBMODULO = 'sitio.portada'

interface Formulario {
  titulo: string
  subtitulo: string
  medio: MedioRef | null
  enlaceTexto: string
  enlaceUrl: string
  desde: string
  hasta: string
  orden: string
  activo: boolean
}

const vacio = (orden: number): Formulario => ({
  titulo: '', subtitulo: '', medio: null, enlaceTexto: '', enlaceUrl: '', desde: '', hasta: '', orden: String(orden), activo: true,
})

const deBanner = (b: Banner): Formulario => ({
  titulo: b.titulo, subtitulo: b.subtitulo, medio: b.medio, enlaceTexto: b.enlaceTexto, enlaceUrl: b.enlaceUrl,
  desde: b.desde ?? '', hasta: b.hasta ?? '', orden: String(b.orden), activo: b.activo,
})

/** Cuándo se ve: «siempre», «desde el 5 nov», «hasta el 20 nov» o un rango. */
function vigencia(b: Banner): string {
  if (b.desde && b.hasta) return `${fechaCorta(b.desde)} → ${fechaCorta(b.hasta)}`
  if (b.desde) return `Desde el ${fechaCorta(b.desde)}`
  if (b.hasta) return `Hasta el ${fechaCorta(b.hasta)}`
  return 'Siempre'
}

/**
 * El carrusel de la portada de la web. Cada banner lleva una foto o un video, un título,
 * un botón opcional y, si se quiere, fechas entre las que se muestra.
 */
export function PortadaPage() {
  const { useCases, hoy } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeCrear = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)
  const puedeEliminar = puede(SUBMODULO, ACCION.eliminar)

  const banners = useCarga<Banner[]>(() => useCases.listarBanners.execute(), [useCases], [])
  const [editando, setEditando] = useState<{ id: number | null; form: Formulario } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const hoyISO = hoy()
  const lista = banners.datos
  const visibles = lista.filter((b) => b.activo && (!b.desde || b.desde <= hoyISO) && (!b.hasta || b.hasta >= hoyISO))

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  const aDatos = (f: Formulario): BannerInput => ({
    orden: Number(f.orden) || 0,
    titulo: f.titulo,
    subtitulo: f.subtitulo,
    medioId: f.medio?.id ?? null,
    enlaceTexto: f.enlaceTexto,
    enlaceUrl: f.enlaceUrl,
    activo: f.activo,
    desde: f.desde || null,
    hasta: f.hasta || null,
  })

  async function guardar() {
    if (!editando) return
    const datos = aDatos(editando.form)
    setGuardando(true)
    setErrorForm(null)
    const r =
      editando.id === null
        ? await useCases.crearBanner.execute(datos)
        : await useCases.actualizarBanner.execute({ id: editando.id, datos })
    setGuardando(false)
    if (r.isLeft()) {
      setErrorForm(describeFailure(r.value))
      return
    }
    toast.exito(editando.id === null ? 'Banner creado.' : 'Banner guardado.')
    setEditando(null)
    await banners.recargar()
  }

  function pedirEliminar(b: Banner) {
    confirmar({
      titulo: 'Eliminar banner',
      mensaje: `Se quitará «${b.titulo}» de la portada. La foto o el video siguen en la biblioteca.`,
      confirmar: 'Eliminar',
      cancelar: 'Cancelar',
      tono: 'danger',
      accion: async () => {
        const r = await useCases.eliminarBanner.execute(b.id)
        if (r.isLeft()) {
          toast.error(describeFailure(r.value))
          return
        }
        toast.exito('Banner eliminado.')
        await banners.recargar()
      },
    })
  }

  const columnas: DataTableColumn<Banner>[] = [
    { key: 'orden', label: 'Orden', filterable: false, value: (b) => b.orden, render: (b) => b.orden },
    {
      key: 'titulo',
      label: 'Banner',
      filterable: false,
      value: (b) => `${b.titulo} ${b.subtitulo}`,
      render: (b) => (
        <div className="flex min-w-0 items-center gap-3">
          <MedioMiniatura medio={b.medio} className="h-12 w-20" />
          <div className="min-w-0">
            <div className="font-medium text-ink">{b.titulo}</div>
            {b.subtitulo && <div className="truncate text-xs text-ink-soft">{b.subtitulo}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'boton',
      label: 'Botón',
      filterable: false,
      value: (b) => b.enlaceTexto,
      render: (b) =>
        b.enlaceTexto ? (
          <div>
            <div>{b.enlaceTexto}</div>
            <div className="truncate text-xs text-ink-soft">{b.enlaceUrl}</div>
          </div>
        ) : (
          '—'
        ),
    },
    { key: 'vigencia', label: 'Se muestra', filterable: false, value: vigencia, render: (b) => <span className="whitespace-nowrap">{vigencia(b)}</span> },
    {
      key: 'estado',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        { value: 'En la portada', label: 'En la portada' },
        { value: 'Fuera de fechas', label: 'Fuera de fechas' },
        { value: 'Apagado', label: 'Apagado' },
      ],
      value: (b) => (!b.activo ? 'Apagado' : visibles.includes(b) ? 'En la portada' : 'Fuera de fechas'),
      render: (b) =>
        !b.activo ? (
          <Badge tone="neutral">Apagado</Badge>
        ) : visibles.includes(b) ? (
          <Badge tone="success">En la portada</Badge>
        ) : (
          <Badge tone="warning">Fuera de fechas</Badge>
        ),
    },
  ]

  return (
    <ListPage
      icon={<GalleryHorizontal size={20} />}
      title="Portada y carrusel"
      description="Los banners que rotan en la portada de la web. Se ordenan por el número de «Orden»; un banner apagado o fuera de sus fechas no se muestra."
      actions={
        puedeCrear ? (
          <Button
            size="sm"
            iconRight={<Plus size={15} />}
            onClick={() => {
              setErrorForm(null)
              setEditando({ id: null, form: vacio((lista.at(-1)?.orden ?? 0) + 1) })
            }}
          >
            Nuevo banner
          </Button>
        ) : undefined
      }
      alert={banners.error ? <Alert>{banners.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Banners" value={String(lista.length)} icon={<GalleryHorizontal size={18} />} />
          <StatCard label="En la portada hoy" value={String(visibles.length)} icon={<GalleryHorizontal size={18} />} tono={visibles.length === 0 ? 'warning' : 'neutral'} hint={visibles.length === 0 ? 'la web mostrará su portada básica' : undefined} />
        </>
      }
      columns={columnas}
      rows={lista}
      rowKey="id"
      cardIcon={GalleryHorizontal}
      actionsWidth={puedeEditar || puedeEliminar ? 100 : 0}
      searchPlaceholder="Buscar un banner..."
      empty={banners.cargando ? 'Cargando banners...' : 'Todavía no hay banners.'}
      rowActions={(b) => (
        <FilaAcciones>
          {puedeEditar && (
            <BotonFila
              color="info"
              titulo={`Editar ${b.titulo}`}
              onClick={() => {
                setErrorForm(null)
                setEditando({ id: b.id, form: deBanner(b) })
              }}
            >
              <FaPencil />
            </BotonFila>
          )}
          {puedeEliminar && (
            <BotonFila color="danger" titulo={`Eliminar ${b.titulo}`} onClick={() => pedirEliminar(b)}>
              <FaTrashCan />
            </BotonFila>
          )}
        </FilaAcciones>
      )}
    >
      <Modal
        open={editando !== null}
        title={editando?.id === null ? 'Nuevo banner' : 'Editar banner'}
        description="Lo que se ve en el carrusel de la portada."
        size="lg"
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardar()}>
              {editando?.id === null ? 'Crear banner' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <SelectorMedio
              etiqueta="Foto o video de fondo"
              tipos={['imagen', 'video']}
              valor={editando.form.medio}
              onChange={(m) => set('medio', m)}
              ayuda="Mejor horizontal. Un video se muestra sin sonido y en bucle."
            />
            <Input label="Título" value={editando.form.titulo} maxLength={120} onChange={(e) => set('titulo', e.target.value)} />
            <Input label="Subtítulo" optional value={editando.form.subtitulo} maxLength={200} onChange={(e) => set('subtitulo', e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Texto del botón" optional value={editando.form.enlaceTexto} maxLength={40} placeholder="Ver ofertas" onChange={(e) => set('enlaceTexto', e.target.value)} />
              <Input label="Enlace del botón" optional value={editando.form.enlaceUrl} placeholder="/ofertas  o  https://…" onChange={(e) => set('enlaceUrl', e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Mostrar desde" optional type="date" value={editando.form.desde} onChange={(e) => set('desde', e.target.value)} />
              <Input label="Hasta" optional type="date" min={editando.form.desde || undefined} value={editando.form.hasta} onChange={(e) => set('hasta', e.target.value)} />
              <Input label="Orden" type="number" value={editando.form.orden} onChange={(e) => set('orden', e.target.value)} />
            </div>
            <Checkbox label="Activo (se muestra en la portada)" checked={editando.form.activo} onChange={(e) => set('activo', e.target.checked)} />
          </div>
        )}
      </Modal>
      {dialogo}
    </ListPage>
  )
}
