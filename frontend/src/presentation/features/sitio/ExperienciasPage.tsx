import { useState } from 'react'
import { FaPencil, FaTrashCan } from 'react-icons/fa6'
import { Compass, Plus } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Experiencia, ExperienciaInput, MedioRef } from '@/domain/entities/Sitio'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Checkbox, Input, ListPage, Modal, StatCard, useConfirmacion, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { AreaTexto } from '../../components/AreaTexto'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { MedioMiniatura } from '../../components/MedioMiniatura'
import { SelectorMedio } from '../../components/SelectorMedio'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'sitio.experiencias'

interface Formulario {
  titulo: string
  resumen: string
  texto: string
  /** Un ejemplo por línea. */
  ejemplos: string
  medio: MedioRef | null
  orden: string
  activo: boolean
}

const vacio = (orden: number): Formulario => ({ titulo: '', resumen: '', texto: '', ejemplos: '', medio: null, orden: String(orden), activo: true })

const deExperiencia = (e: Experiencia): Formulario => ({
  titulo: e.titulo, resumen: e.resumen, texto: e.texto, ejemplos: e.ejemplos.join('\n'), medio: e.medio, orden: String(e.orden), activo: e.activo,
})

/** Las experiencias que se ofrecen a los huéspedes: lo que se ve en la página «Experiencias». */
export function ExperienciasPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeCrear = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)
  const puedeEliminar = puede(SUBMODULO, ACCION.eliminar)

  const experiencias = useCarga<Experiencia[]>(() => useCases.listarExperiencias.execute(), [useCases], [])
  const [editando, setEditando] = useState<{ id: number | null; form: Formulario } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const lista = experiencias.datos

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  const aDatos = (f: Formulario): ExperienciaInput => ({
    titulo: f.titulo,
    resumen: f.resumen,
    texto: f.texto,
    ejemplos: f.ejemplos.split('\n').map((x) => x.trim()).filter(Boolean),
    medioId: f.medio?.id ?? null,
    orden: Number(f.orden) || 0,
    activo: f.activo,
  })

  async function guardar() {
    if (!editando) return
    const datos = aDatos(editando.form)
    setGuardando(true)
    setErrorForm(null)
    const r =
      editando.id === null
        ? await useCases.crearExperiencia.execute(datos)
        : await useCases.actualizarExperiencia.execute({ id: editando.id, datos })
    setGuardando(false)
    if (r.isLeft()) {
      setErrorForm(describeFailure(r.value))
      return
    }
    toast.exito(editando.id === null ? 'Experiencia creada.' : 'Experiencia guardada.')
    setEditando(null)
    await experiencias.recargar()
  }

  function pedirEliminar(e: Experiencia) {
    confirmar({
      titulo: 'Eliminar experiencia',
      mensaje: `Se quitará «${e.titulo}» de la web.`,
      confirmar: 'Eliminar',
      cancelar: 'Cancelar',
      tono: 'danger',
      accion: async () => {
        const r = await useCases.eliminarExperiencia.execute(e.id)
        if (r.isLeft()) {
          toast.error(describeFailure(r.value))
          return
        }
        toast.exito('Experiencia eliminada.')
        await experiencias.recargar()
      },
    })
  }

  const columnas: DataTableColumn<Experiencia>[] = [
    { key: 'orden', label: 'Orden', filterable: false, value: (e) => e.orden, render: (e) => e.orden },
    {
      key: 'titulo',
      label: 'Experiencia',
      filterable: false,
      value: (e) => `${e.titulo} ${e.resumen}`,
      render: (e) => (
        <div className="flex min-w-0 items-center gap-3">
          <MedioMiniatura medio={e.medio} className="h-12 w-16" />
          <div className="min-w-0">
            <div className="font-medium text-ink">{e.titulo}</div>
            <div className="truncate text-xs text-ink-soft">{e.resumen}</div>
          </div>
        </div>
      ),
    },
    { key: 'ejemplos', label: 'Ejemplos', align: 'right', filterable: false, value: (e) => e.ejemplos.length, render: (e) => e.ejemplos.length },
    {
      key: 'estado',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        { value: 'Visible', label: 'Visible' },
        { value: 'Oculta', label: 'Oculta' },
      ],
      value: (e) => (e.activo ? 'Visible' : 'Oculta'),
      render: (e) => <Badge tone={e.activo ? 'success' : 'neutral'}>{e.activo ? 'Visible' : 'Oculta'}</Badge>,
    },
  ]

  return (
    <ListPage
      icon={<Compass size={20} />}
      title="Experiencias"
      description="Lo que los huéspedes pueden vivir además de dormir: gastronomía, excursiones, bienestar. Se ven en la página «Experiencias» de la web."
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
            Nueva experiencia
          </Button>
        ) : undefined
      }
      alert={experiencias.error ? <Alert>{experiencias.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Experiencias" value={String(lista.length)} icon={<Compass size={18} />} />
          <StatCard label="Visibles" value={String(lista.filter((e) => e.activo).length)} icon={<Compass size={18} />} />
        </>
      }
      columns={columnas}
      rows={lista}
      rowKey="id"
      cardIcon={Compass}
      actionsWidth={puedeEditar || puedeEliminar ? 100 : 0}
      searchPlaceholder="Buscar una experiencia..."
      empty={experiencias.cargando ? 'Cargando experiencias...' : 'Todavía no hay experiencias.'}
      rowActions={(e) => (
        <FilaAcciones>
          {puedeEditar && (
            <BotonFila
              color="info"
              titulo={`Editar ${e.titulo}`}
              onClick={() => {
                setErrorForm(null)
                setEditando({ id: e.id, form: deExperiencia(e) })
              }}
            >
              <FaPencil />
            </BotonFila>
          )}
          {puedeEliminar && (
            <BotonFila color="danger" titulo={`Eliminar ${e.titulo}`} onClick={() => pedirEliminar(e)}>
              <FaTrashCan />
            </BotonFila>
          )}
        </FilaAcciones>
      )}
    >
      <Modal
        open={editando !== null}
        title={editando?.id === null ? 'Nueva experiencia' : 'Editar experiencia'}
        size="lg"
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardar()}>
              {editando?.id === null ? 'Crear experiencia' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <Input label="Título" value={editando.form.titulo} maxLength={80} onChange={(e) => set('titulo', e.target.value)} />
            <Input label="Resumen" optional value={editando.form.resumen} maxLength={160} onChange={(e) => set('resumen', e.target.value)} />
            <AreaTexto label="Descripción" optional rows={5} maxLength={3000} value={editando.form.texto} onChange={(v) => set('texto', v)} />
            <AreaTexto
              label="Ejemplos"
              optional
              rows={4}
              value={editando.form.ejemplos}
              onChange={(v) => set('ejemplos', v)}
              placeholder={'Cena de degustación\nClase de cocina criolla'}
              ayuda="Uno por línea, hasta 8."
            />
            <SelectorMedio etiqueta="Foto" valor={editando.form.medio} onChange={(m) => set('medio', m)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Orden" type="number" value={editando.form.orden} onChange={(e) => set('orden', e.target.value)} />
              <div className="flex items-end pb-2">
                <Checkbox label="Visible en la web" checked={editando.form.activo} onChange={(e) => set('activo', e.target.checked)} />
              </div>
            </div>
          </div>
        )}
      </Modal>
      {dialogo}
    </ListPage>
  )
}
