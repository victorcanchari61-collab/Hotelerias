package httpx

import (
	"net/http"
	"slices"

	"github.com/gin-gonic/gin"
)

// CORS deja pasar solo los orígenes de la lista (AllowedOrigins del config).
// Un origen que no está en la lista no recibe cabeceras: el navegador lo
// bloquea, que es justo lo que se quiere.
func CORS(allowed []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && slices.Contains(allowed, origin) {
			h := c.Writer.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Add("Vary", "Origin")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
