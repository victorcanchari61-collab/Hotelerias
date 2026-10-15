package permiso

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// Consultor es lo que el handler necesita del servicio.
type Consultor interface {
	Mios(ctx context.Context, usuarioID int64) ([]string, error)
}

// Handler expone lo que el front necesita saber de permisos: qué existe y qué
// tengo. Gestionar roles, excepciones y solicitudes vive en sus propios módulos.
type Handler struct {
	catalogo *Catalogo
	mios     Consultor
}

func NewHandler(cat *Catalogo, mios Consultor) *Handler {
	return &Handler{catalogo: cat, mios: mios}
}

// Register cuelga las rutas de un grupo que ya exige sesión.
func (h *Handler) Register(r gin.IRouter) {
	g := r.Group("/permiso")
	g.GET("/catalogo", h.Catalogo)
	g.GET("/mios", h.Mios)
}

// Catalogo devuelve qué submódulos hay y qué acciones admite cada uno. La
// pantalla de Accesos dibuja su matriz con esto en vez de con una lista
// propia: si la copiara, un submódulo nuevo quedaría invisible en la
// configuración aunque el backend ya lo estuviera exigiendo.
func (h *Handler) Catalogo(c *gin.Context) {
	c.JSON(http.StatusOK, h.catalogo.Submodulos())
}

// Mios devuelve los permisos de quien pregunta como "submodulo:accion".
//
// Con esto el menú esconde lo que no se puede abrir y los botones de anular o
// exportar no se pintan. Es comodidad, no seguridad: quien llame igual al
// endpoint se topa con el Guard del servidor.
func (h *Handler) Mios(c *gin.Context) {
	usuarioID := auth.UsuarioID(c)
	if usuarioID == 0 {
		httpx.Abort(c, http.StatusUnauthorized, "Debes iniciar sesión.")
		return
	}

	claves, err := h.mios.Mios(c.Request.Context(), usuarioID)
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, claves) // [] y no null: el front hace new Set(claves)
}
