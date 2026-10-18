import { useRef, useState } from 'react'
import { FaPencil, FaTrashCan } from 'react-icons/fa6'
import { Film, HardDrive, Images, Upload } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Medio } from '@/domain/entities/Sitio'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Input, ListPage, Modal, StatCard, useConfirmacion, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { MedioMiniatura } from '../../components/MedioMiniatura'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'sitio.medios'

/** 1.234.567 bytes → «1,2 MB». */
function peso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** La biblioteca de fotos y videos que usan la portada, las galerías, las experiencias y el blog. */
export function MediosPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeSubir = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)
  const puedeEliminar = puede(SUBMODULO, ACCION.eliminar)
  const entrada = useRef<HTMLInputElement>(null)

  const medios = useCarga<Medio[]>(() => useCases.listarMedios.execute(undefined), [useCases], [])
  const [subiendo, setSubiendo] = useState(false)
  const [editando, setEditando] = useState<{ medio: Medio; descripcion: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const lista = medios.datos
  const fotos = lista.filter((m) => m.tipo === 'imagen').length
  const total = lista.reduce((s, m) => s + m.bytes, 0)

  /** Sube uno por uno: así un archivo malo no frena a los demás y cada error dice cuál fue. */
  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return
    setSubiendo(true)
    let subidos = 0
    for (const archivo of Array.from(archivos)) {
      const r = await useCases.subirMedio.execute(archivo)
      if (r.isLeft()) {
        toast.error(`${archivo.name}: ${describeFailure(r.value)}`)
      } else {
        subidos++
      }
    }
    setSubiendo(false)
    if (entrada.current) entrada.current.value = ''
    if (subidos > 0) toast.exito(subidos === 1 ? 'Archivo subido.' : `${subidos} archivos subidos.`)
    await medios.recargar()
  }

  async function guardarDescripcion() {
    if (!editando) return
    setGuardando(true)
    setErrorForm(null)
    const r = await useCases.actualizarMedio.execute({ id: editando.medio.id, descripcion: editando.descripcion })
    setGuardando(false)
    if (r.isLeft()) {
      setErrorForm(describeFailure(r.value))
      return
    }
    toast.exito('Descripción guardada.')
    setEditando(null)
    await medios.recargar()
  }

  function pedirEliminar(m: Medio) {
    confirmar({
      titulo: 'Eliminar archivo',
      mensaje: `Se borrará «${m.nombreOriginal}» de la biblioteca y del servidor. No se puede deshacer.`,
      confirmar: 'Eliminar',
      cancelar: 'Cancelar',
      tono: 'danger',
      accion: async () => {
        const r = await useCases.eliminarMedio.execute(m.id)
        if (r.isLeft()) {
          toast.error(describeFailure(r.value))
          return
        }
        toast.exito('Archivo eliminado.')
        await medios.recargar()
      },
    })
  }

  const columnas: DataTableColumn<Medio>[] = [
    {
      key: 'archivo',
      label: 'Archivo',
      filterable: false,
      value: (m) => `${m.nombreOriginal} ${m.descripcion}`,
      render: (m) => (
        <div className="flex min-w-0 items-center gap-3">
          <MedioMiniatura medio={m} className="size-12" />
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{m.nombreOriginal}</div>
            <div className="truncate text-xs text-ink-soft">{m.descripcion || 'Sin descripción'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'tipo',
      label: 'Tipo',
      filterType: 'select',
      filterOptions: [
        { value: 'Foto', label: 'Foto' },
        { value: 'Video', label: 'Video' },
      ],
      value: (m) => (m.tipo === 'imagen' ? 'Foto' : 'Video'),
      render: (m) => <Badge tone={m.tipo === 'imagen' ? 'info' : 'accent'}>{m.tipo === 'imagen' ? 'Foto' : 'Video'}</Badge>,
    },
    {
      key: 'tamano',
      label: 'Tamaño',
      align: 'right',
      filterable: false,
      value: (m) => m.bytes,
      render: (m) => (
        <div className="whitespace-nowrap">
          <div>{peso(m.bytes)}</div>
          {m.ancho && m.alto && <div className="text-xs text-ink-soft">{m.ancho} × {m.alto}</div>}
        </div>
      ),
    },
    {
      key: 'usos',
      label: 'En uso',
      align: 'right',
      filterable: false,
      value: (m) => m.usos,
      render: (m) => (m.usos === 0 ? <span className="text-ink-soft">Libre</span> : `${m.usos} ${m.usos === 1 ? 'lugar' : 'lugares'}`),
    },
  ]

  return (
    <ListPage
      icon={<Images size={20} />}
      title="Fotos y videos"
      description="La biblioteca de la web. Sube aquí y luego elige desde la portada, las galerías, las experiencias o el blog."
      actions={
        puedeSubir ? (
          <>
            <input
              ref={entrada}
              type="file"
              multiple
              hidden
              aria-label="Elegir archivos para subir"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
              onChange={(e) => void subir(e.target.files)}
            />
            <Button size="sm" loading={subiendo} iconRight={<Upload size={15} />} onClick={() => entrada.current?.click()}>
              Subir archivos
            </Button>
          </>
        ) : undefined
      }
      alert={medios.error ? <Alert>{medios.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Fotos" value={String(fotos)} icon={<Images size={18} />} />
          <StatCard label="Videos" value={String(lista.length - fotos)} icon={<Film size={18} />} />
          <StatCard label="Espacio usado" value={peso(total)} icon={<HardDrive size={18} />} hint="fotos hasta 8 MB, videos hasta 60 MB" />
        </>
      }
      columns={columnas}
      rows={lista}
      rowKey="id"
      cardIcon={Images}
      actionsWidth={puedeEditar || puedeEliminar ? 100 : 0}
      searchPlaceholder="Buscar por nombre o descripción..."
      empty={medios.cargando ? 'Cargando la biblioteca...' : 'Todavía no hay archivos. Sube la primera foto.'}
      rowActions={(m) => (
        <FilaAcciones>
          {puedeEditar && (
            <BotonFila
              color="info"
              titulo={`Describir ${m.nombreOriginal}`}
              onClick={() => {
                setErrorForm(null)
                setEditando({ medio: m, descripcion: m.descripcion })
              }}
            >
              <FaPencil />
            </BotonFila>
          )}
          {puedeEliminar && (
            <BotonFila
              color="danger"
              titulo={m.usos > 0 ? `${m.nombreOriginal} está en uso: no se puede borrar` : `Eliminar ${m.nombreOriginal}`}
              disabled={m.usos > 0}
              onClick={() => pedirEliminar(m)}
            >
              <FaTrashCan />
            </BotonFila>
          )}
        </FilaAcciones>
      )}
    >
      <Modal
        open={editando !== null}
        title="Describir el archivo"
        description="El texto alternativo: lo lee un lector de pantalla y se ve si la imagen no carga. Describe lo que se ve, en una frase."
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardarDescripcion()}>
              Guardar
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <MedioMiniatura medio={editando.medio} className="h-40 w-full" />
            <Input
              label="Descripción"
              maxLength={200}
              value={editando.descripcion}
              placeholder="Fachada del hotel al atardecer, con la plaza al frente"
              onChange={(e) => setEditando((x) => (x ? { ...x, descripcion: e.target.value } : x))}
            />
          </div>
        )}
      </Modal>
      {dialogo}
    </ListPage>
  )
}
