import { attempt } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type {
  BusquedaEstadia,
  Cotizacion,
  DetalleSede,
  HabitacionDisponible,
  Promocion,
  Reserva,
  Sede,
  SolicitudReserva,
} from '@/domain/entities/Portal'
import type { MonedasPublicas } from '@/domain/entities/Moneda'
import type { ContactoEmpresa, Membresia } from '@/domain/entities/Portal'
import type { ParametrosPublicos } from '@/domain/entities/Parametro'
import type { PortalRepository } from '@/domain/repositories/PortalRepository'
import type { PortalRemoteDataSource } from '../datasources/PortalRemoteDataSource'
import { monedasPublicasFromDto } from '../models/moneda.model'
import {
  cotizacionFromDto,
  detalleFromDto,
  disponibleFromDto,
  promocionFromDto,
  reservaFromDto,
  sedeFromDto,
  solicitudToDto,
} from '../models/portal.model'

export class PortalRepositoryImpl implements PortalRepository {
  constructor(private readonly remote: PortalRemoteDataSource) {}

  sedes(): Promise<Either<Failure, Sede[]>> {
    return attempt(async () => ((await this.remote.sedes()) ?? []).map(sedeFromDto))
  }

  sede(id: number): Promise<Either<Failure, DetalleSede>> {
    return attempt(async () => detalleFromDto(await this.remote.sede(id)))
  }

  disponibilidad(sedeId: number, busqueda: BusquedaEstadia): Promise<Either<Failure, HabitacionDisponible[]>> {
    return attempt(async () =>
      ((await this.remote.disponibilidad(sedeId, busqueda)) ?? []).map(disponibleFromDto),
    )
  }

  monedas(): Promise<Either<Failure, MonedasPublicas>> {
    return attempt(async () => monedasPublicasFromDto(await this.remote.monedas()))
  }

  membresias(): Promise<Either<Failure, Membresia[]>> {
    return attempt(async () =>
      ((await this.remote.membresias()) ?? []).map((m) => ({ ...m, reservasMinimas: m.reservasMinimas ?? null })),
    )
  }

  contacto(): Promise<Either<Failure, ContactoEmpresa>> {
    return attempt(async () => {
      const c = (await this.remote.contacto()) ?? {}
      return { nombre: c.nombre ?? '', telefono: c.telefono ?? '', email: c.email ?? '', sitioWeb: c.sitioWeb ?? '' }
    })
  }

  parametros(): Promise<Either<Failure, ParametrosPublicos>> {
    return attempt(async () => ({ ...((await this.remote.parametros()) ?? {}) }))
  }

  promociones(): Promise<Either<Failure, Promocion[]>> {
    return attempt(async () => ((await this.remote.promociones()) ?? []).map(promocionFromDto))
  }

  cotizar(solicitud: SolicitudReserva): Promise<Either<Failure, Cotizacion>> {
    return attempt(async () => cotizacionFromDto(await this.remote.cotizar(solicitudToDto(solicitud))))
  }

  reservar(solicitud: SolicitudReserva): Promise<Either<Failure, Reserva>> {
    return attempt(async () => reservaFromDto(await this.remote.reservar(solicitudToDto(solicitud))))
  }

  misReservas(): Promise<Either<Failure, Reserva[]>> {
    return attempt(async () => ((await this.remote.misReservas()) ?? []).map(reservaFromDto))
  }

  cancelar(codigo: string): Promise<Either<Failure, Reserva>> {
    return attempt(async () => reservaFromDto(await this.remote.cancelar(codigo)))
  }
}
