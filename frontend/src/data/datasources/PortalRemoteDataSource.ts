import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type { BusquedaEstadia, PromocionInput } from '@/domain/entities/Portal'
import type { RegistroCliente, TipoClienteInput } from '@/domain/entities/Cliente'
import type { MonedasPublicasDto } from '../models/moneda.model'
import type {
  ClienteDto,
  CotizacionDto,
  DetalleSedeDto,
  HabitacionDisponibleDto,
  PromocionDto,
  ReservaDto,
  SedeDto,
  SesionClienteDto,
  TipoClienteDto,
} from '../models/portal.model'

/** Lo que el portal público le pide al servidor (con la sesión del huésped, si hay). */
export interface PortalRemoteDataSource {
  sedes(): Promise<SedeDto[] | null>
  sede(id: number): Promise<DetalleSedeDto>
  disponibilidad(sedeId: number, busqueda: BusquedaEstadia): Promise<HabitacionDisponibleDto[] | null>
  monedas(): Promise<MonedasPublicasDto>
  promociones(): Promise<PromocionDto[] | null>
  cotizar(body: unknown): Promise<CotizacionDto>
  reservar(body: unknown): Promise<ReservaDto>
  misReservas(): Promise<ReservaDto[] | null>
  cancelar(codigo: string): Promise<ReservaDto>

  registrar(body: RegistroCliente): Promise<SesionClienteDto>
  login(body: { email: string; password: string }): Promise<SesionClienteDto>
  me(): Promise<ClienteDto>
}

export class PortalRemoteDataSourceImpl implements PortalRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  sedes() {
    return this.http.get<SedeDto[] | null>(ApiPaths.portal.sedes)
  }

  sede(id: number) {
    return this.http.get<DetalleSedeDto>(ApiPaths.portal.sede(id))
  }

  disponibilidad(sedeId: number, b: BusquedaEstadia) {
    return this.http.get<HabitacionDisponibleDto[] | null>(ApiPaths.portal.disponibilidad(sedeId), {
      query: { entrada: b.entrada, salida: b.salida, huespedes: b.huespedes },
    })
  }

  monedas() {
    return this.http.get<MonedasPublicasDto>(ApiPaths.portal.monedas)
  }

  promociones() {
    return this.http.get<PromocionDto[] | null>(ApiPaths.portal.promociones)
  }

  cotizar(body: unknown) {
    return this.http.post<CotizacionDto>(ApiPaths.portal.cotizar, body)
  }

  reservar(body: unknown) {
    return this.http.post<ReservaDto>(ApiPaths.portal.reservas, body)
  }

  misReservas() {
    return this.http.get<ReservaDto[] | null>(ApiPaths.portal.reservas)
  }

  cancelar(codigo: string) {
    return this.http.post<ReservaDto>(ApiPaths.portal.cancelar(codigo))
  }

  registrar(body: RegistroCliente) {
    // Sin token: un 401 aquí no puede ser "sesión vencida".
    return this.http.post<SesionClienteDto>(ApiPaths.portal.registro, body, { auth: false })
  }

  login(body: { email: string; password: string }) {
    return this.http.post<SesionClienteDto>(ApiPaths.portal.login, body, { auth: false })
  }

  me() {
    return this.http.get<ClienteDto>(ApiPaths.portal.me)
  }
}

/** Lo que el personal administra desde el panel (con la sesión del personal). */
export interface GestionRemoteDataSource {
  promociones(): Promise<PromocionDto[] | null>
  crearPromocion(body: PromocionInput): Promise<PromocionDto>
  actualizarPromocion(id: number, body: PromocionInput): Promise<PromocionDto>

  tipos(): Promise<TipoClienteDto[] | null>
  crearTipo(body: TipoClienteInput): Promise<TipoClienteDto>
  actualizarTipo(id: number, body: TipoClienteInput): Promise<TipoClienteDto>
  clientes(): Promise<ClienteDto[] | null>
  asignarTipo(clienteId: number, tipoId: number | null): Promise<ClienteDto>

  reservas(estado?: string): Promise<ReservaDto[] | null>
  cancelarReserva(id: number): Promise<ReservaDto>
}

export class GestionRemoteDataSourceImpl implements GestionRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  promociones() {
    return this.http.get<PromocionDto[] | null>(ApiPaths.promocion.base)
  }

  crearPromocion(body: PromocionInput) {
    return this.http.post<PromocionDto>(ApiPaths.promocion.base, body)
  }

  actualizarPromocion(id: number, body: PromocionInput) {
    return this.http.put<PromocionDto>(ApiPaths.promocion.porId(id), body)
  }

  tipos() {
    return this.http.get<TipoClienteDto[] | null>(ApiPaths.tipoCliente.base)
  }

  crearTipo(body: TipoClienteInput) {
    return this.http.post<TipoClienteDto>(ApiPaths.tipoCliente.base, body)
  }

  actualizarTipo(id: number, body: TipoClienteInput) {
    return this.http.put<TipoClienteDto>(ApiPaths.tipoCliente.porId(id), body)
  }

  clientes() {
    return this.http.get<ClienteDto[] | null>(ApiPaths.cliente.base)
  }

  asignarTipo(clienteId: number, tipoId: number | null) {
    return this.http.put<ClienteDto>(ApiPaths.cliente.tipo(clienteId), { tipoClienteId: tipoId })
  }

  reservas(estado?: string) {
    return this.http.get<ReservaDto[] | null>(ApiPaths.reserva.base, {
      query: { estado },
    })
  }

  cancelarReserva(id: number) {
    return this.http.post<ReservaDto>(ApiPaths.reserva.cancelar(id))
  }
}
