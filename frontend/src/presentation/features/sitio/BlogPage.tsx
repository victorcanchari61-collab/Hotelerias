import { useState } from 'react'
import { FaEyeSlash, FaGlobe, FaPencil, FaTrashCan } from 'react-icons/fa6'
import { Newspaper, Plus } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Entrada, EntradaInput, MedioRef } from '@/domain/entities/Sitio'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Input, ListPage, Modal, StatCard, Tabs, useConfirmacion, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { AreaTexto } from '../../components/AreaTexto'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { MedioMiniatura } from '../../components/MedioMiniatura'
import { SelectorMedio } from '../../components/SelectorMedio'
import { TextoRico } from '../../components/TextoRico'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'sitio.blog'

interface Formulario {
  titulo: string
  resumen: string
  cuerpo: string
  portada: MedioRef | null
}

const vacio: Formulario = { titulo: '', resumen: '', cuerpo: '', portada: null }

const fecha = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }).format(d) : '—'

const AYUDA_FORMATO = '## Subtítulo · - para una lista · **negrita** · *cursiva* · [texto](/ruta o https://…)'

/** Las historias del blog: se escriben como borrador y se publican cuando están listas. */
export function BlogPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeCrear = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)
  const puedeEliminar = puede(SUBMODULO, ACCION.eliminar)
  const puedePublicar = puede(SUBMODULO, ACCION.confirmar)

  const entradas = useCarga<Entrada[]>(() => useCases.listarEntradas.execute(), [useCases], [])
  const [editando, setEditando] = useState<{ id: number | null; form: Formulario } | null>(null)
  const [vista, setVista] = useState<'escribir' | 'previa'>('escribir')
  const [abriendo, setAbriendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const lista = entradas.datos

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  /** La lista no trae el texto completo: se pide la historia entera al abrirla. */
  async function abrir(e: Entrada | null) {
    setErrorForm(null)
    setVista('escribir')
    if (!e) {
      setEditando({ id: null, form: vacio })
      return
    }
    setAbriendo(true)
    const r = await useCases.verEntrada.execute(e.id)
    setAbriendo(false)
    if (r.isLeft()) {
      toast.error(describeFailure(r.value))
      return
    }
    setEditando({ id: e.id, form: { titulo: r.value.titulo, resumen: r.value.resumen, cuerpo: r.value.cuerpo, portada: r.value.portada } })
  }

  async function guardar() {
    if (!editando) return
    const f = editando.form
    const datos: EntradaInput = { titulo: f.titulo, resumen: f.resumen, cuerpo: f.cuerpo, portadaId: f.portada?.id ?? null }
    setGuardando(true)
    setErrorForm(null)
    const r =
      editando.id === null
        ? await useCases.crearEntrada.execute(datos)
        : await useCases.actualizarEntrada.execute({ id: editando.id, datos })
    setGuardando(false)
    if (r.isLeft()) {
      setErrorForm(describeFailure(r.value))
      return
    }
    toast.exito(editando.id === null ? 'Historia guardada como borrador.' : 'Historia guardada.')
    setEditando(null)
    await entradas.recargar()
  }

  function pedirPublicar(e: Entrada, publicar: boolean) {
    confirmar({
      titulo: publicar ? 'Publicar historia' : 'Quitar de la web',
      mensaje: publicar
        ? `«${e.titulo}» será visible para todos los visitantes de la web.`
        : `«${e.titulo}» volverá a borrador y dejará de verse en la web.`,
      confirmar: publicar ? 'Publicar' : 'Quitar',
      cancelar: 'Cancelar',
      tono: publicar ? 'pregunta' : 'warning',
      accion: async () => {
        const r = await useCases.publicarEntrada.execute({ id: e.id, publicar })
        if (r.isLeft()) {
          toast.error(describeFailure(r.value))
          return
        }
        toast.exito(publicar ? 'Historia publicada.' : 'Historia en borrador.')
        await entradas.recargar()
      },
    })
  }

  function pedirEliminar(e: Entrada) {
    confirmar({
      titulo: 'Eliminar historia',
      mensaje: `Se borrará «${e.titulo}». No se puede deshacer.`,
      confirmar: 'Eliminar',
      cancelar: 'Cancelar',
      tono: 'danger',
      accion: async () => {
        const r = await useCases.eliminarEntrada.execute(e.id)
        if (r.isLeft()) {
          toast.error(describeFailure(r.value))
          return
        }
        toast.exito('Historia eliminada.')
        await entradas.recargar()
      },
    })
  }

  const columnas: DataTableColumn<Entrada>[] = [
    {
      key: 'titulo',
      label: 'Historia',
      filterable: false,
      value: (e) => `${e.titulo} ${e.resumen}`,
      render: (e) => (
        <div className="flex min-w-0 items-center gap-3">
          <MedioMiniatura medio={e.portada} className="h-12 w-16" />
          <div className="min-w-0">
            <div className="font-medium text-ink">{e.titulo}</div>
            <div className="truncate text-xs text-ink-soft">{e.resumen}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        { value: 'Publicada', label: 'Publicada' },
        { value: 'Borrador', label: 'Borrador' },
      ],
      value: (e) => (e.estado === 'publicada' ? 'Publicada' : 'Borrador'),
      render: (e) => <Badge tone={e.estado === 'publicada' ? 'success' : 'warning'}>{e.estado === 'publicada' ? 'Publicada' : 'Borrador'}</Badge>,
    },
    { key: 'autor', label: 'Autor', filterable: false, value: (e) => e.autor, render: (e) => e.autor || '—' },
    {
      key: 'fecha',
      label: 'Fecha',
      filterable: false,
      value: (e) => (e.publicadaEn ?? e.actualizadoEn)?.getTime() ?? 0,
      render: (e) => <span className="whitespace-nowrap">{e.estado === 'publicada' ? fecha(e.publicadaEn) : `Editada ${fecha(e.actualizadoEn)}`}</span>,
    },
  ]

  return (
    <ListPage
      icon={<Newspaper size={20} />}
      title="Blog e historias"
      description="Noticias, crónicas y novedades de los hoteles. Una historia en borrador no se ve en la web hasta que se publica."
      actions={
        puedeCrear ? (
          <Button size="sm" iconRight={<Plus size={15} />} onClick={() => void abrir(null)}>
            Nueva historia
          </Button>
        ) : undefined
      }
      alert={entradas.error ? <Alert>{entradas.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Publicadas" value={String(lista.filter((e) => e.estado === 'publicada').length)} icon={<Newspaper size={18} />} />
          <StatCard label="Borradores" value={String(lista.filter((e) => e.estado === 'borrador').length)} icon={<Newspaper size={18} />} />
        </>
      }
      columns={columnas}
      rows={lista}
      rowKey="id"
      cardIcon={Newspaper}
      actionsWidth={puedeEditar || puedeEliminar || puedePublicar ? 140 : 0}
      searchPlaceholder="Buscar una historia..."
      empty={entradas.cargando ? 'Cargando historias...' : 'Todavía no hay historias. Escribe la primera.'}
      rowActions={(e) => (
        <FilaAcciones>
          {puedePublicar && (
            <BotonFila
              color={e.estado === 'publicada' ? 'warning' : 'success'}
              titulo={e.estado === 'publicada' ? `Quitar ${e.titulo} de la web` : `Publicar ${e.titulo}`}
              onClick={() => pedirPublicar(e, e.estado !== 'publicada')}
            >
              {e.estado === 'publicada' ? <FaEyeSlash /> : <FaGlobe />}
            </BotonFila>
          )}
          {puedeEditar && (
            <BotonFila color="info" titulo={`Editar ${e.titulo}`} disabled={abriendo} onClick={() => void abrir(e)}>
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
        title={editando?.id === null ? 'Nueva historia' : 'Editar historia'}
        size="lg"
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardar()}>
              {editando?.id === null ? 'Guardar borrador' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <Input label="Título" value={editando.form.titulo} maxLength={120} onChange={(e) => set('titulo', e.target.value)} />
            <Input label="Resumen" optional value={editando.form.resumen} maxLength={240} onChange={(e) => set('resumen', e.target.value)} />
            <SelectorMedio etiqueta="Foto de portada" valor={editando.form.portada} onChange={(m) => set('portada', m)} />
            <div>
              <Tabs
                items={[
                  { id: 'escribir', label: 'Escribir' },
                  { id: 'previa', label: 'Vista previa' },
                ]}
                active={vista}
                onChange={(id) => setVista(id as 'escribir' | 'previa')}
              />
              <div className="pt-3">
                {vista === 'escribir' ? (
                  <AreaTexto label="Texto" rows={12} maxLength={20000} value={editando.form.cuerpo} onChange={(v) => set('cuerpo', v)} ayuda={AYUDA_FORMATO} />
                ) : (
                  <div className="velothr v-papel min-h-48 rounded-md border border-line p-5">
                    {editando.form.cuerpo.trim() ? <TextoRico texto={editando.form.cuerpo} /> : <p className="text-sm text-ink-soft">Todavía no escribiste nada.</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
      {dialogo}
    </ListPage>
  )
}
