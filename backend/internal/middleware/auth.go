package middleware

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/config"
	"hotelerias/backend/pkg/auth"
)

// ContextKeyUsuarioID guarda el id del usuario autenticado en el contexto.
const ContextKeyUsuarioID = "usuarioID"

// ContextKeyUsuarioEmail guarda el email para trazas.
const ContextKeyUsuarioEmail = "usuarioEmail"

// RequiereAuth valida el token Bearer y deja el id del usuario en el contexto.
func RequiereAuth(cfg config.JwtSettings) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"statusCode": http.StatusUnauthorized,
				"message":    "No autenticado",
			})
			return
		}

		claims, err := auth.ParseToken(cfg, strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"statusCode": http.StatusUnauthorized,
				"message":    "Sesión inválida o vencida",
			})
			return
		}

		id, err := strconv.ParseInt(claims.Subject, 10, 64)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"statusCode": http.StatusUnauthorized,
				"message":    "Sesión inválida",
			})
			return
		}

		c.Set(ContextKeyUsuarioID, id)
		c.Set(ContextKeyUsuarioEmail, claims.Email)
		c.Next()
	}
}

// UsuarioID recupera el id del usuario autenticado desde el contexto.
func UsuarioID(c *gin.Context) int64 {
	if v, ok := c.Get(ContextKeyUsuarioID); ok {
		if id, ok := v.(int64); ok {
			return id
		}
	}
	return 0
}
