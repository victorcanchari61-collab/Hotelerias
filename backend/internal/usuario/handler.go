package usuario

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler expone el listado de usuarios.
//
// Recibe el guard de "ver" como un gin.HandlerFunc y no el Guard completo:
// este paquete no tiene por qué conocer al módulo permiso. Quien lo arma
// (main) decide qué permiso exige.
type Handler struct {
	lector Lector
	ver    gin.HandlerFunc
}

func NewHandler(lector Lector, ver gin.HandlerFunc) *Handler {
	return &Handler{lector: lector, ver: ver}
}

// Register cuelga las rutas de un grupo que ya exige sesión.
func (h *Handler) Register(r gin.IRouter) {
	r.GET("/usuario", h.ver, h.listar)
}

func (h *Handler) listar(c *gin.Context) {
	cuentas, err := h.lector.Listar(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}

	// [] y no null: el frontend hace .map() sobre la respuesta.
	perfiles := make([]Perfil, len(cuentas))
	for i, cuenta := range cuentas {
		perfiles[i] = cuenta.Perfil()
	}
	c.JSON(http.StatusOK, perfiles)
}
