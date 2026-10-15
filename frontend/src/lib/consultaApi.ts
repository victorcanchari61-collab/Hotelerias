import { api } from './apiClient'

export interface ConsultaRucResponse {
  ruc: string
  razonSocial: string
  nombreComercial: string | null
  direccion: string | null
  departamento: string | null
  provincia: string | null
  distrito: string | null
  /** ACTIVO / BAJA DE OFICIO / etc. */
  estado: string | null
  /** HABIDO / NO HABIDO. */
  condicion: string | null
}

export interface ConsultaDniResponse {
  dni: string
  nombres: string
  apellidoPaterno: string
  apellidoMaterno: string
  /** Apellidos y nombres listos para usar. */
  nombreCompleto: string
}

/**
 * Consulta de documentos. Va contra nuestro backend, que a su vez llama al
 * proveedor: el token del servicio externo nunca llega al navegador.
 */
export const consultaApi = {
  /** GET /api/consulta/ruc/{ruc} — datos de SUNAT. */
  ruc: (ruc: string) => api.get<ConsultaRucResponse>(`/consulta/ruc/${ruc}`),

  /** GET /api/consulta/dni/{dni} — datos de RENIEC. */
  dni: (dni: string) => api.get<ConsultaDniResponse>(`/consulta/dni/${dni}`),
}
