package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/platform/httpx"
)

const (
	usuarioKey = "auth.usuarioID"
	clienteKey = "auth.clienteID"
)

// Verifier es lo único que el middleware del PANEL necesita del emisor de tokens.
type Verifier interface {
	Validar(raw string) (int64, error)
}

// ClienteVerifier es lo que el middleware del PORTAL necesita.
type ClienteVerifier interface {
	ValidarCliente(raw string) (int64, error)
}

func bearer(c *gin.Context) (string, bool) {
	raw, ok := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
	raw = strings.TrimSpace(raw)
	return raw, ok && raw != ""
}

// Authenticate exige un "Authorization: Bearer <jwt>" válido de PERSONAL y deja
// el id del usuario en el contexto. Es lo primero que corre en toda ruta
// protegida del panel; el permiso concreto lo decide después el módulo permiso.
func Authenticate(v Verifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, ok := bearer(c)
		if !ok {
			httpx.Abort(c, http.StatusUnauthorized, "Debes iniciar sesión.")
			return
		}

		id, err := v.Validar(raw)
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

// AuthenticateCliente exige un token de HUÉSPED. Es lo que obliga a iniciar
// sesión para reservar.
func AuthenticateCliente(v ClienteVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, ok := bearer(c)
		if !ok {
			httpx.Abort(c, http.StatusUnauthorized, "Inicia sesión para continuar.")
			return
		}

		id, err := v.ValidarCliente(raw)
		if err != nil {
			httpx.Abort(c, http.StatusUnauthorized, "Tu sesión no es válida o venció.")
			return
		}

		c.Set(clienteKey, id)
		c.Next()
	}
}

// ClienteOpcional deja pasar a cualquiera, pero si trae un token de huésped
// válido anota quién es. Sirve para lo que se puede VER sin cuenta (una
// cotización) pero se personaliza con ella (el descuento de su tipo de cliente).
// Un token malo no es un error aquí: se trata como visitante.
func ClienteOpcional(v ClienteVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		if raw, ok := bearer(c); ok {
			if id, err := v.ValidarCliente(raw); err == nil {
				c.Set(clienteKey, id)
			}
		}
		c.Next()
	}
}

// ClienteID devuelve el huésped de la petición, o 0 si es un visitante.
func ClienteID(c *gin.Context) int64 {
	id, _ := c.Get(clienteKey)
	n, _ := id.(int64)
	return n
}
