package rol

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// Handler expone /rol. La matriz (PUT /rol/:id/permisos) exige el permiso de
// ACCESOS y no el de roles: configurar qué puede cada rol es configurar
// accesos, y separarlo dejaría la puerta de que alguien se autoconceda lo que
// quiera con solo "editar roles".
type Handler struct {
	svc     *Servicio
	roles   httpx.Guardas
	accesos httpx.Guardas
}

func NewHandler(svc *Servicio, roles, accesos httpx.Guardas) *Handler {
	return &Handler{svc: svc, roles: roles, accesos: accesos}
}

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/rol", httpx.Cadena(h.roles.Ver, h.listar)...)
	r.GET("/rol/:id", httpx.Cadena(h.roles.Ver, h.obtener)...)
	r.POST("/rol", httpx.Cadena(h.roles.Crear, h.crear)...)
	r.PUT("/rol/:id", httpx.Cadena(h.roles.Editar, h.actualizar)...)
	r.PUT("/rol/:id/permisos", httpx.Cadena(h.accesos.Editar, h.guardarPermisos)...)
	r.DELETE("/rol/:id", httpx.Cadena(h.roles.Eliminar, h.eliminar)...)
}

func idDe(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return 0, false
	}
	return id, true
}

func falla(c *gin.Context, err error) {
	if errors.Is(err, ErrNoEncontrado) {
		_ = c.Error(httpx.NotFound("El rol no existe"))
		return
	}
	_ = c.Error(httpx.Traducir(err))
}

func (h *Handler) listar(c *gin.Context) {
	out, err := h.svc.Listar(c.Request.Context())
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) obtener(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	r, err := h.svc.PorID(c.Request.Context(), id)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, r)
}

func (h *Handler) crear(c *gin.Context) {
	var e Entrada
	if err := c.ShouldBindJSON(&e); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	r, err := h.svc.Crear(c.Request.Context(), e, auth.UsuarioID(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusCreated, r)
}

func (h *Handler) actualizar(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	var e Entrada
	if err := c.ShouldBindJSON(&e); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	r, err := h.svc.Actualizar(c.Request.Context(), id, e, auth.UsuarioID(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, r)
}

type permisosRequest struct {
	Permisos []string `json:"permisos"`
}

func (h *Handler) guardarPermisos(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	var req permisosRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	r, err := h.svc.GuardarPermisos(c.Request.Context(), id, req.Permisos, auth.UsuarioID(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, r)
}

func (h *Handler) eliminar(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	if err := h.svc.Eliminar(c.Request.Context(), id, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
