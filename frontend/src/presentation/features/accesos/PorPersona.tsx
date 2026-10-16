import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { right } from '@/core/utils/either'
import type {
  Alcance,
  Alcances,
  CatalogoAlcances,
  Excepcion,
  Rol,
  Vigencia,
} from '@/domain/entities/Configuracion'
import type { SubmoduloCatalogo } from '@/domain/entities/Permiso'
import type { Usuario } from '@/domain/entities/Usuario'
import { nombreCompleto } from '@/domain/entities/Usuario'
import { FaBan } from 'react-icons/fa6'
import { Alert, Badge, Button, Card, Input, Select, SysDataTable, useConfirmacion, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { ETIQUETA_ACCION, agruparCatalogo, etiquetaSubmodulo } from './matriz'

const VIGENCIA: Record<Vigencia, string> = {
  una_vez: 'Una sola vez',
  temporal: 'Hasta una fecha',
  permanente: 'Permanente',
}

function estadoExcepcion(e: Excepcion): { texto: string; tono: 'sys' | 'neutral' | 'warning' } {
  if (e.revocado) return { texto: 'Revocada', tono: 'neutral' }
  if (e.vigente) return { texto: 'Vigente', tono: 'sys' }
  if (e.vigencia === 'una_vez' && e.usos > 0) return { texto: 'Gastada', tono: 'neutral' }
  return { texto: 'Vencida', tono: 'warning' }
}

/** datetime-local ("2026-11-05T18:30") → ISO con la zona del navegador. */
function aIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Lo propio de una persona: los permisos que su rol no le da (excepciones) y
 * su alcance. Las excepciones SOLO suman: no existe la que quita algo.
 */
export function PorPersona({ roles }: { roles: Rol[] }) {
  const { useCases } = useDependencies()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()

  const usuarios = useCarga<Usuario[]>(() => useCases.listarUsuarios.execute(), [useCases], [])
  const catalogo = useCarga<SubmoduloCatalogo[]>(() => useCases.getCatalogoPermisos.execute(), [useCases], [])
  const catAlcances = useCarga<CatalogoAlcances>(
    () => useCases.catalogoAlcances.execute(),
    [useCases],
    { submodulos: [], niveles: [] },
  )

  const [usuarioId, setUsuarioId] = useState<number | null>(null)
  const persona = usuarios.datos.find((u) => u.id === usuarioId) ?? null

  const excepciones = useCarga<Excepcion[]>(
    () => (usuarioId === null ? Promise.resolve(right<Excepcion[]>([])) : useCases.excepcionesDe.execute(usuarioId)),
    [useCases, usuarioId],
    [],
  )

  // --- conceder ---
  const [submodulo, setSubmodulo] = useState('')
  const [accion, setAccion] = useState('')
  const [vigencia, setVigencia] = useState<Vigencia>('una_vez')
  const [expira, setExpira] = useState('')
  const [motivo, setMotivo] = useState('')
  const [concediendo, setConcediendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const grupos = useMemo(() => agruparCatalogo(catalogo.datos), [catalogo.datos])
  const accionesDe = catalogo.datos.find((c) => c.submodulo === submodulo)?.acciones ?? []

  async function conceder() {
    if (usuarioId === null) return
    setConcediendo(true)
    setError(null)
    const r = await useCases.concederPermiso.execute({
      usuarioId,
      submodulo,
      accion,
      vigencia,
      expiraEn: aIso(expira),
      motivo,
    })
    setConcediendo(false)
    if (r.isLeft()) {
      setError(describeFailure(r.value))
      return
    }
    toast.exito('Permiso concedido.')
    setMotivo('')
    setExpira('')
    await excepciones.recargar()
  }

  function pedirRevocar(e: Excepcion) {
    confirmar({
      titulo: 'Revocar permiso',
      mensaje: `La persona dejará de poder «${ETIQUETA_ACCION[e.accion as keyof typeof ETIQUETA_ACCION] ?? e.accion}» en ${etiquetaSubmodulo(e.submodulo)}.`,
      confirmar: 'Revocar',
      tono: 'danger',
      accion: async () => {
        const r = await useCases.revocarPermiso.execute(e.id)
        if (r.isLeft()) {
          toast.error(describeFailure(r.value))
          return
        }
        toast.exito('Permiso revocado.')
        await excepciones.recargar()
      },
    })
  }

  // --- alcance propio ---
  const [alcances, setAlcances] = useState<Alcances>({})
  const [alcancesOriginales, setAlcancesOriginales] = useState<Alcances>({})
  const [guardandoAlcance, setGuardandoAlcance] = useState(false)

  useEffect(() => {
    setAlcances({})
    setAlcancesOriginales({})
    if (usuarioId === null) return
    let vigente = true
    void useCases.alcancesDeUsuario.execute(usuarioId).then((r) =>
      r.fold(
        () => undefined,
        (a) => {
          if (!vigente) return
          setAlcances(a)
          setAlcancesOriginales(a)
        },
      ),
    )
    return () => {
      vigente = false
    }
  }, [useCases, usuarioId])

  async function guardarAlcance() {
    if (usuarioId === null) return
    setGuardandoAlcance(true)
    const r = await useCases.guardarAlcancesUsuario.execute({ usuarioId, alcances })
    setGuardandoAlcance(false)
    if (r.isLeft()) {
      toast.error(describeFailure(r.value))
      return
    }
    setAlcancesOriginales(alcances)
    toast.exito('Alcance guardado.')
  }

  const columnasExcepciones: DataTableColumn<Excepcion>[] = [
    {
      key: 'permiso',
      label: 'Permiso',
      render: (e) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{etiquetaSubmodulo(e.submodulo)}</div>
          <div className="text-xs text-ink-soft">
            {ETIQUETA_ACCION[e.accion as keyof typeof ETIQUETA_ACCION] ?? e.accion}
            {e.motivo && ` · ${e.motivo}`}
          </div>
        </div>
      ),
    },
    {
      key: 'vigencia',
      label: 'Vigencia',
      render: (e) => (
        <div>
          {VIGENCIA[e.vigencia]}
          {e.expiraEn && <div className="text-xs text-ink-soft">{e.expiraEn.toLocaleString('es-PE')}</div>}
        </div>
      ),
    },
    { key: 'otorgadoPor', label: 'Otorgado por', render: (e) => e.otorgadoPor || '—' },
    {
      key: 'estado',
      label: 'Estado',
      value: (e) => estadoExcepcion(e).texto,
      render: (e) => <Badge tone={estadoExcepcion(e).tono}>{estadoExcepcion(e).texto}</Badge>,
    },
  ]

  const rolesDe = (u: Usuario) => roles.filter((r) => u.rolIds.includes(r.id)).map((r) => r.nombre)

  return (
    <div className="space-y-4">
      <Card>
        <Select
          label="Persona"
          value={usuarioId === null ? '' : String(usuarioId)}
          onChange={(e) => setUsuarioId(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">Elige una persona…</option>
          {usuarios.datos.map((u) => (
            <option key={u.id} value={u.id}>
              {nombreCompleto(u)} — {u.email}
            </option>
          ))}
        </Select>
        {usuarios.error && <div className="mt-3"><Alert>{usuarios.error}</Alert></div>}
        {persona && (
          <p className="mt-3 text-sm text-ink-muted">
            Roles: <strong className="text-ink">{rolesDe(persona).join(', ') || '—'}</strong>. Aquí se ve lo
            que tiene <em>además</em> de lo que sus roles le dan.
          </p>
        )}
      </Card>

      {persona && (
        <>
          <Card className="space-y-4">
            <h3 className="font-bold text-ink">Conceder un permiso</h3>
            {error && <Alert>{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Pantalla"
                value={submodulo}
                onChange={(e) => {
                  setSubmodulo(e.target.value)
                  setAccion('')
                }}
              >
                <option value="">Elige…</option>
                {grupos.map((g) => (
                  <optgroup key={g.modulo} label={g.etiqueta}>
                    {g.filas.map((f) => (
                      <option key={f.submodulo} value={f.submodulo}>
                        {etiquetaSubmodulo(f.submodulo)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              <Select label="Acción" value={accion} onChange={(e) => setAccion(e.target.value)} disabled={!submodulo}>
                <option value="">Elige…</option>
                {accionesDe.map((a) => (
                  <option key={a} value={a}>{ETIQUETA_ACCION[a]}</option>
                ))}
              </Select>
              <Select label="Vigencia" value={vigencia} onChange={(e) => setVigencia(e.target.value as Vigencia)}>
                {(Object.keys(VIGENCIA) as Vigencia[]).map((v) => (
                  <option key={v} value={v}>{VIGENCIA[v]}</option>
                ))}
              </Select>
              {vigencia === 'temporal' && (
                <Input label="Vence" type="datetime-local" value={expira} onChange={(e) => setExpira(e.target.value)} />
              )}
            </div>
            <Input label="Motivo" optional value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Para qué lo necesita" />
            <div className="flex justify-end">
              <Button loading={concediendo} disabled={!submodulo || !accion} onClick={() => void conceder()}>
                Conceder
              </Button>
            </div>
          </Card>

          <div className="space-y-2">
            <h3 className="font-bold text-ink">Permisos concedidos a esta persona</h3>
            <SysDataTable
              columns={columnasExcepciones}
              rows={excepciones.datos}
              rowKey="id"
              cardIcon={ShieldCheck}
              toolbar={false}
              paginacion={false}
              actionsWidth={80}
              empty={excepciones.cargando ? 'Cargando...' : 'No tiene permisos extra.'}
              actions={(e) => (
                <FilaAcciones>
                  <BotonFila
                    color="danger"
                    titulo={`Revocar ${etiquetaSubmodulo(e.submodulo)}`}
                    disabled={!e.vigente}
                    onClick={() => pedirRevocar(e)}
                  >
                    <FaBan />
                  </BotonFila>
                </FilaAcciones>
              )}
            />
          </div>

          {catAlcances.datos.submodulos.length > 0 && (
            <Card className="space-y-3">
              <div>
                <h3 className="font-bold text-ink">Alcance propio</h3>
                <p className="text-sm text-ink-muted">
                  Lo de la persona manda sobre lo de su rol: sirve para ampliar o acotar solo a ella.
                </p>
              </div>
              {catAlcances.datos.submodulos.map((sub) => (
                <div key={sub} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
                  <span className="text-sm text-ink">{etiquetaSubmodulo(sub)}</span>
                  <Select
                    size="sm"
                    aria-label={`Alcance propio de ${etiquetaSubmodulo(sub)}`}
                    value={alcances[sub] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setAlcances((a) => {
                        const next = { ...a }
                        if (v === '') delete next[sub]
                        else next[sub] = v as Alcance
                        return next
                      })
                    }}
                  >
                    <option value="">Según su rol</option>
                    <option value="todas">Todas las sedes</option>
                    <option value="mis_sedes">Solo sus sedes</option>
                  </Select>
                </div>
              ))}
              <div className="flex justify-end">
                <Button
                  loading={guardandoAlcance}
                  disabled={JSON.stringify(alcances) === JSON.stringify(alcancesOriginales)}
                  onClick={() => void guardarAlcance()}
                >
                  Guardar alcance
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {dialogo}
    </div>
  )
}
