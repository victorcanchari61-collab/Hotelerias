package httpx

import "github.com/gin-gonic/gin"

// Guardas son los filtros de permiso de un recurso, uno por acción. Los módulos
// los reciben ya armados: no conocen al paquete permiso, solo piden "el que
// protege el listado" o "el que protege la edición". Quien los arma (main)
// decide qué permiso exige cada uno. Un nil se trata como "sin filtro extra".
type Guardas struct {
	Ver, Crear, Editar, Eliminar, Anular, Confirmar gin.HandlerFunc
}

// Cadena devuelve los handlers con el guard (si hay) delante.
func Cadena(guard gin.HandlerFunc, h gin.HandlerFunc) []gin.HandlerFunc {
	if guard == nil {
		return []gin.HandlerFunc{h}
	}
	return []gin.HandlerFunc{guard, h}
}
