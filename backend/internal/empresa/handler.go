package empresa

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

type Handler struct {
	svc     *Servicio
	guardas httpx.Guardas
}

func NewHandler(svc *Servicio, g httpx.Guardas) *Handler { return &Handler{svc: svc, guardas: g} }

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/empresa", httpx.Cadena(h.guardas.Ver, h.obtener)...)
	r.PUT("/empresa", httpx.Cadena(h.guardas.Editar, h.guardar)...)
}

func (h *Handler) obtener(c *gin.Context) {
	e, err := h.svc.Obtener(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, e)
}

func (h *Handler) guardar(c *gin.Context) {
	var e Empresa
	if err := c.ShouldBindJSON(&e); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.svc.Guardar(c.Request.Context(), e, auth.UsuarioID(c))
	if err != nil {
		_ = c.Error(httpx.Traducir(err))
		return
	}
	c.JSON(http.StatusOK, out)
}
