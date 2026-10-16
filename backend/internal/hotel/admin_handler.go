package hotel

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// AdminHandler es la pantalla de Sedes del panel.
type AdminHandler struct {
	svc     *Admin
	guardas httpx.Guardas
}

func NewAdminHandler(svc *Admin, g httpx.Guardas) *AdminHandler {
	return &AdminHandler{svc: svc, guardas: g}
}

func (h *AdminHandler) Register(r gin.IRouter) {
	r.GET("/sede", httpx.Cadena(h.guardas.Ver, h.listar)...)
	r.POST("/sede", httpx.Cadena(h.guardas.Crear, h.crear)...)
	r.PUT("/sede/:id", httpx.Cadena(h.guardas.Editar, h.actualizar)...)
}

func falla(c *gin.Context, err error) {
	if errors.Is(err, ErrNoEncontrada) {
		_ = c.Error(httpx.NotFound("La sede no existe"))
		return
	}
	_ = c.Error(httpx.Traducir(err))
}

func (h *AdminHandler) listar(c *gin.Context) {
	out, err := h.svc.Listar(c.Request.Context())
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *AdminHandler) crear(c *gin.Context) {
	var in SedeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.svc.Crear(c.Request.Context(), in, auth.UsuarioID(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (h *AdminHandler) actualizar(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return
	}
	var in SedeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.svc.Actualizar(c.Request.Context(), id, in, auth.UsuarioID(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
