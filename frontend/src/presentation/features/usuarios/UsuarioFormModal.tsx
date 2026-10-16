import { useState } from 'react'
import { describeFailure } from '@/core/errors/failures'
import type { Rol } from '@/domain/entities/Configuracion'
import type { Sede } from '@/domain/entities/Portal'
import type { Usuario } from '@/domain/entities/Usuario'
import { PASSWORD_MINIMA } from '@/domain/validation'
import { Alert, Button, Checkbox, Input, Modal, useToast } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'

interface Props {
  /** null = alta. */
  usuario: Usuario | null
  onClose: () => void
  onGuardado: () => void
}

/**
 * Alta y edición de una cuenta. Los roles y las sedes se piden al abrir (no
 * antes): quien solo mira el listado no necesita permiso de "ver roles".
 */
export function UsuarioFormModal({ usuario, onClose, onGuardado }: Props) {
  const { useCases } = useDependencies()
  const toast = useToast()
  const esAlta = usuario === null

  const roles = useCarga<Rol[]>(() => useCases.listarRoles.execute(), [useCases], [])
  const sedes = useCarga<Sede[]>(() => useCases.listarSedes.execute(), [useCases], [])

  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? '',
    apellido: usuario?.apellido ?? '',
    email: usuario?.email ?? '',
    telefono: usuario?.telefono ?? '',
    password: '',
    rolIds: usuario?.rolIds ?? [],
    sedeIds: usuario?.sedeIds ?? [],
    activo: usuario?.activo ?? true,
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alternar = (campo: 'rolIds' | 'sedeIds', id: number) =>
    setForm((f) => ({
      ...f,
      [campo]: f[campo].includes(id) ? f[campo].filter((x) => x !== id) : [...f[campo], id],
    }))

  async function guardar() {
    setGuardando(true)
    setError(null)

    const datos = {
      nombre: form.nombre,
      apellido: form.apellido,
      email: form.email,
      telefono: form.telefono,
      rolIds: form.rolIds,
      sedeIds: form.sedeIds,
      activo: form.activo,
      password: form.password,
    }
    const resultado = esAlta
      ? await useCases.crearUsuario.execute(datos)
      : await useCases.actualizarUsuario.execute({ id: usuario.id, datos })
    setGuardando(false)

    if (resultado.isLeft()) {
      setError(describeFailure(resultado.value))
      return
    }
    toast.exito(esAlta ? 'Usuario creado.' : 'Usuario guardado.')
    onGuardado()
  }

  return (
    <Modal
      open
      size="lg"
      title={esAlta ? 'Nuevo usuario' : 'Editar usuario'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={guardando} onClick={() => void guardar()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <Input label="Apellido" optional value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} />
          <Input label="Correo" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Teléfono" optional type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        </div>

        <Input
          label={esAlta ? 'Contraseña' : 'Nueva contraseña'}
          type="password"
          autoComplete="new-password"
          revealable
          optional={!esAlta}
          hint={esAlta ? `Mínimo ${PASSWORD_MINIMA} caracteres` : 'Vacía = no se cambia'}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        <fieldset>
          <legend className="ui-label">Roles</legend>
          <p className="mb-2 text-xs text-ink-muted">Sus permisos son la suma de los de todos sus roles.</p>
          {roles.error && <Alert tone="warning">{roles.error}</Alert>}
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.datos
              .filter((r) => r.activo || form.rolIds.includes(r.id))
              .map((r) => (
                <Checkbox
                  key={r.id}
                  label={r.activo ? r.nombre : `${r.nombre} (desactivado)`}
                  checked={form.rolIds.includes(r.id)}
                  onChange={() => alternar('rolIds', r.id)}
                />
              ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="ui-label">Sedes que atiende</legend>
          <p className="mb-2 text-xs text-ink-muted">
            Solo importa si su rol limita lo que ve a «mis sedes» (se configura en Accesos).
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {sedes.datos.map((s) => (
              <Checkbox
                key={s.id}
                label={s.nombre}
                checked={form.sedeIds.includes(s.id)}
                onChange={() => alternar('sedeIds', s.id)}
              />
            ))}
          </div>
        </fieldset>

        <Checkbox
          label="Cuenta activa"
          checked={form.activo}
          onChange={(e) => setForm({ ...form, activo: e.target.checked })}
        />
      </div>
    </Modal>
  )
}
