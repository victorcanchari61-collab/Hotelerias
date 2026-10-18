import { useState } from 'react'
import type { FormEvent } from 'react'
import { Mail, Phone } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { ContactoEmpresa } from '@/domain/entities/Portal'
import type { MensajeContactoInput, Pagina } from '@/domain/entities/Sitio'
import { Alert, Button, Input } from '@/shared/ui'
import { AreaTexto } from '../../components/AreaTexto'
import { TextoRico } from '../../components/TextoRico'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { Papel, Sello } from './components/mundo'

const VACIO: MensajeContactoInput = { nombre: '', email: '', telefono: '', asunto: '', mensaje: '' }

/**
 * «Contacto»: el texto lo edita el personal, los datos salen de la empresa (Configuración)
 * y lo que se escribe aquí llega al panel (Sitio web → Mensajes recibidos).
 */
export function ContactoPage() {
  const { useCases } = useDependencies()
  const pagina = useCarga<Pagina | null>(() => useCases.paginaPublica.execute('contacto'), [useCases], null)
  const empresa = useCarga<ContactoEmpresa | null>(() => useCases.obtenerContacto.execute(), [useCases], null)

  const [form, setForm] = useState<MensajeContactoInput>(VACIO)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof MensajeContactoInput>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    const r = await useCases.enviarMensajeContacto.execute(form)
    setEnviando(false)
    if (r.isLeft()) {
      setError(describeFailure(r.value))
      return
    }
    setEnviado(true)
    setForm(VACIO)
  }

  const c = empresa.datos
  const p = pagina.datos

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h1 className="v-etq text-[clamp(2.7rem,7vw,4.6rem)] leading-[0.9]">{p?.titulo || 'Escríbenos'}</h1>
          {p?.cuerpo.trim() ? (
            <TextoRico texto={p.cuerpo} className="mt-6" />
          ) : (
            <p className="v-nota mt-5 text-xl leading-snug text-[var(--color-ink-muted)]">Una pregunta, un grupo, un evento: cuéntanos y te respondemos.</p>
          )}
          {c && (c.telefono || c.email) && (
            <ul className="mt-8 space-y-3 border-t-2 border-dashed border-[var(--v-hilo-suave)] pt-6">
              {c.telefono && (
                <li className="flex items-center gap-3">
                  <Phone size={18} aria-hidden="true" className="text-[var(--v-hilo)]" />
                  <a className="hover:underline" href={`tel:${c.telefono.replace(/[^\d+]/g, '')}`}>
                    {c.telefono}
                  </a>
                </li>
              )}
              {c.email && (
                <li className="flex items-center gap-3">
                  <Mail size={18} aria-hidden="true" className="text-[var(--v-hilo)]" />
                  <a className="hover:underline" href={`mailto:${c.email}`}>
                    {c.email}
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>

        <Papel className="p-7 sm:p-9">
          {enviado ? (
            <div role="status" className="flex flex-col items-start gap-5 py-4">
              <Sello titulo="Recibido" detalle="Te respondemos pronto" cae />
              <p className="v-nota text-xl leading-snug">Gracias por escribirnos. Te contestamos al correo que nos dejaste.</p>
              <Button variant="secondary" onClick={() => setEnviado(false)}>
                Enviar otro mensaje
              </Button>
            </div>
          ) : (
            <form noValidate onSubmit={(e) => void enviar(e)} aria-label="Enviar un mensaje" className="space-y-4">
              <h2 className="v-etq text-3xl">Tu mensaje</h2>
              {error && <Alert>{error}</Alert>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Nombre" value={form.nombre} maxLength={80} autoComplete="name" onChange={(e) => set('nombre', e.target.value)} />
                <Input label="Correo" type="email" value={form.email} autoComplete="email" onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Teléfono" optional value={form.telefono} maxLength={30} autoComplete="tel" onChange={(e) => set('telefono', e.target.value)} />
                <Input label="Asunto" optional value={form.asunto} maxLength={120} onChange={(e) => set('asunto', e.target.value)} />
              </div>
              <AreaTexto label="Mensaje" rows={6} maxLength={2000} value={form.mensaje} onChange={(v) => set('mensaje', v)} />
              <Button type="submit" loading={enviando}>
                Enviar mensaje
              </Button>
            </form>
          )}
        </Papel>
      </div>
    </div>
  )
}
