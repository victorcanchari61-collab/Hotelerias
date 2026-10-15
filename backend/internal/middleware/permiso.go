package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/services"
)

// RequierePermiso protege una ruta: exige que el usuario autenticado tenga la
// acción sobre el submódulo. El 403 lleva submodulo y accion para que el
// frontend pueda abrir el modal de "pedir acceso".
func RequierePermiso(svc *services.Service, submodulo, accion string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := UsuarioID(c)
		if id == 0 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"statusCode": http.StatusUnauthorized,
				"message":    "No autenticado",
			})
			return
		}

		puede, err := svc.Puede(c.Request.Context(), id, submodulo, accion)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"statusCode": http.StatusInternalServerError,
				"message":    "No se pudo verificar el permiso",
			})
			return
		}
		if !puede {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"statusCode": http.StatusForbidden,
				"message":    "No tienes permiso para esta acción",
				"submodulo":  submodulo,
				"accion":     accion,
			})
			return
		}

		c.Next()
	}
}
