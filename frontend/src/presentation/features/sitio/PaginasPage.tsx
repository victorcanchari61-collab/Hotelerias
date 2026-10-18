import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { ClavePagina, MedioRef, Pagina } from '@/domain/entities/Sitio'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Button, Card, Input, PageHeader, Tabs, useToast } from '@/shared/ui'
import { AreaTexto } from '../../components/AreaTexto'
import { SelectorMedio } from '../../components/SelectorMedio'
import { TextoRico } from '../../components/TextoRico'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'sitio.paginas'

const PAGINAS: { id: ClavePagina; label: string; ayuda: string }[] = [
  { id: 'nosotros', label: 'Nosotros', ayuda: 'La historia de la casa y lo que la distingue. Se ve en /nosotros.' },
  { id: 'contacto', label: 'Contacto', ayuda: 'El texto de bienvenida de la página de contacto. Los datos de la empresa (teléfono, correo) salen de Configuración.' },
]

interface Formulario {
  titulo: string
  cuerpo: string
  medio: MedioRef | null
}

/** Las páginas fijas de la web («Nosotros» y «Contacto») con su texto y su foto editables. */
export function PaginasPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const [clave, setClave] = useState<ClavePagina>('nosotros')
  const [form, setForm] = useState<Formulario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [sucio, setSucio] = useState(false)

  useEffect(() => {
    let vigente = true
    setForm(null)
    setError(null)
    setSucio(false)
    void useCases.verPagina.execute(clave).then((r) => {
      if (!vigente) return
      if (r.isLeft()) setError(describeFailure(r.value))
      else {
        const p: Pagina = r.value
        setForm({ titulo: p.titulo, cuerpo: p.cuerpo, medio: p.medio })
      }
    })
    return () => {
      vigente = false
    }
  }, [useCases, clave])

  const cambiar = (parcial: Partial<Formulario>) => {
    setForm((f) => (f ? { ...f, ...parcial } : f))
    setSucio(true)
  }

  async function guardar() {
    if (!form) return
    setGuardando(true)
    setError(null)
    const r = await useCases.guardarPagina.execute({ clave, datos: { titulo: form.titulo, cuerpo: form.cuerpo, medioId: form.medio?.id ?? null } })
    setGuardando(false)
    if (r.isLeft()) {
      setError(describeFailure(r.value))
      return
    }
    toast.exito('Página guardada.')
    setSucio(false)
  }

  const actual = PAGINAS.find((p) => p.id === clave)!

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<FileText size={20} />}
        title="Nosotros y contacto"
        description="Las páginas fijas de la web. Cambia el texto y la foto; el diseño se mantiene."
        actions={
          puedeEditar ? (
            <Button size="sm" loading={guardando} disabled={!sucio || form === null} onClick={() => void guardar()}>
              Guardar cambios
            </Button>
          ) : undefined
        }
      />
      <Tabs
        items={PAGINAS.map((p) => ({ id: p.id, label: p.label }))}
        active={clave}
        onChange={(id) => {
          if (sucio && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return
          setClave(id as ClavePagina)
        }}
      />
      {error && <Alert>{error}</Alert>}
      {form === null && !error && <p className="py-8 text-center text-sm text-ink-muted">Cargando la página...</p>}
      {form && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="flex flex-col gap-4 p-5">
            <p className="text-sm text-ink-muted">{actual.ayuda}</p>
            <Input label="Título" value={form.titulo} maxLength={80} disabled={!puedeEditar} onChange={(e) => cambiar({ titulo: e.target.value })} />
            <SelectorMedio etiqueta="Foto de la página" valor={form.medio} onChange={(medio) => cambiar({ medio })} />
            <AreaTexto
              label="Texto"
              rows={14}
              maxLength={10000}
              value={form.cuerpo}
              onChange={(cuerpo) => cambiar({ cuerpo })}
              ayuda="## Subtítulo · - para una lista · **negrita** · *cursiva* · [texto](/ruta)"
            />
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-xs font-medium tracking-wide text-ink-soft uppercase">Así se ve</p>
            <div className="velothr v-papel rounded-md border border-line p-5">
              <h2 className="v-etq text-3xl">{form.titulo || 'Sin título'}</h2>
              {form.cuerpo.trim() ? <TextoRico texto={form.cuerpo} className="mt-4" /> : <p className="mt-4 text-sm text-ink-soft">Todavía no escribiste nada.</p>}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
