package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/platform/httpx"
)

const usuarioKey = "auth.usuarioID"

// Verifier es lo único que el middleware necesita del emisor de tokens.
type Verifier interface {
	Validar(raw string) (int64, error)
}

// Authenticate exige un "Authorization: Bearer <jwt>" válido y deja el id del
// usuario en el contexto. Es lo primero que corre en toda ruta protegida; el
// permiso concreto lo decide después el módulo permiso.
func Authenticate(v Verifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, ok := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
		if !ok || raw == "" {
			httpx.Abort(c, http.StatusUnauthorized, "Debes iniciar sesión.")
			return
		}

		id, err := v.Validar(strings.TrimSpace(raw))
		if err != nil {
			httpx.Abort(c, http.StatusUnauthorized, "Tu sesión no es válida o venció.")
			return
		}

		c.Set(usuarioKey, id)
		c.Next()
	}
}

// UsuarioID devuelve quién hace la petición. Si se llama en una ruta sin
// Authenticate devuelve 0, que no es un id válido: el que lo use debe tratarlo
// como "nadie".
func UsuarioID(c *gin.Context) int64 {
	id, _ := c.Get(usuarioKey)
	n, _ := id.(int64)
	return n
}
