package parametro

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// Handler son los parámetros para el personal (Configuración).
type Handler struct {
	svc     *Servicio
	guardas httpx.Guardas
}

func NewHandler(svc *Servicio, g httpx.Guardas) *Handler { return &Handler{svc: svc, guardas: g} }

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/parametro", httpx.Cadena(h.guardas.Ver, h.listar)...)
	r.PUT("/parametro", httpx.Cadena(h.guardas.Editar, h.guardar)...)
}

func (h *Handler) listar(c *gin.Context) {
	out, err := h.svc.Listar(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// entrada: los valores van como TEXTO, igual que se guardan.
type entrada struct {
	Valores map[string]string `json:"valores"`
}

func (h *Handler) guardar(c *gin.Context) {
	var in entrada
	if err := c.ShouldBindJSON(&in); err != nil || len(in.Valores) == 0 {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.svc.Guardar(c.Request.Context(), in.Valores, auth.UsuarioID(c))
	if err != nil {
		_ = c.Error(httpx.Traducir(err))
		return
	}
	c.JSON(http.StatusOK, out)
}
