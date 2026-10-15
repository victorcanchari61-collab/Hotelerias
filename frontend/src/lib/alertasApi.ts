import { api } from './apiClient'

export type SeveridadAlerta = 'CRITICA' | 'ADVERTENCIA' | 'INFO'

export type TipoAlerta =
  | 'STOCK_BAJO'
  | 'LOTE_POR_VENCER'
  | 'COMPRA_PENDIENTE'
  | 'CREDITO_PENDIENTE'
  | 'RESERVA_VENCIDA'
  | 'STOCK_REPUESTO'
  | 'DOCUMENTO_VEHICULO'
  | 'LICENCIA_CONDUCTOR'
  | 'SOLICITUD_ACCESO'

export interface AlertaResponse {
  id: string
  tipo: TipoAlerta
  severidad: SeveridadAlerta
  titulo: string
  detalle: string
  /** Id de vista del menú ("inv.stock") para navegar al hacer clic. */
  ruta: string | null
  fecha: string | null
}

export const alertaApi = {
  getAll: () => api.get<AlertaResponse[]>('/alertas'),
}
