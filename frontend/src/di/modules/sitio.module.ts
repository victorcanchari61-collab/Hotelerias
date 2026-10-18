import { SitioPublicoRemoteDataSource, SitioRemoteDataSource } from '@/data/datasources/SitioRemoteDataSource'
import { SitioPublicoRepositoryImpl, SitioRepositoryImpl } from '@/data/repositories/SitioRepositoryImpl'
import { casosDeSitio, casosPublicosDeSitio } from '@/domain/usecases/sitio.usecases'
import type { ModuleContext } from './types'

/** Los casos de uso del sitio web: la administración (panel) y la lectura pública. */
export type SitioUseCases = ReturnType<typeof casosDeSitio> & ReturnType<typeof casosPublicosDeSitio>

export function sitioModule({ http, portalHttp, overrides }: ModuleContext): SitioUseCases {
  const admin = overrides.sitio ?? new SitioRepositoryImpl(new SitioRemoteDataSource(http))
  const publico = overrides.sitioPublico ?? new SitioPublicoRepositoryImpl(new SitioPublicoRemoteDataSource(portalHttp))
  return { ...casosDeSitio(admin), ...casosPublicosDeSitio(publico) }
}
