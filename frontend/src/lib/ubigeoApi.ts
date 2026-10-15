import { api } from './apiClient'

/**
 * Ubigeo oficial del Perú (INEI/RENIEC): departamento, provincia y distrito.
 * Dato de referencia precargado — no se crea, edita ni elimina desde acá.
 * Compartido por cualquier módulo que necesite un distrito (Cliente hoy,
 * Mercado y Proveedor más adelante).
 */

export interface DepartamentoResponse {
  id: number
  codigo: string
  nombre: string
}

export interface ProvinciaResponse {
  id: number
  codigo: string
  nombre: string
  departamentoId: number
}

export interface DistritoResponse {
  id: number
  codigo: string
  nombre: string
  provinciaId: number
  departamentoId: number
}

export const ubigeoApi = {
  departamentos: () => api.get<DepartamentoResponse[]>('/ubigeo/departamentos'),
  provincias: (departamentoId?: number) =>
    api.get<ProvinciaResponse[]>(
      departamentoId ? `/ubigeo/provincias?departamentoId=${departamentoId}` : '/ubigeo/provincias',
    ),
  distritos: (provinciaId?: number) =>
    api.get<DistritoResponse[]>(
      provinciaId ? `/ubigeo/distritos?provinciaId=${provinciaId}` : '/ubigeo/distritos',
    ),
}
