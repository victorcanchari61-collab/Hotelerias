package usuario

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/platform/httpx"
)

// Gestor es lo que el handler necesita de Gestion.
type Gestor interface {
	Listar(ctx context.Context) ([]Cuenta, error)
	PorID(ctx context.Context, id int64) (Cuenta, error)
	Crear(ctx context.Context, n Nueva, actor int64) (Cuenta, error)
	Actualizar(ctx context.Context, id int64, n Nueva, actor int64) (Cuenta, error)
	CambiarEstado(ctx context.Context, id int64, activo bool, actor int64) (bool, error)
	Eliminar(ctx context.Context, id, actor int64) error
}

// Handler expone /usuario. Recibe los guards ya armados como httpx.Guardas: este
// paquete no tiene por qué conocer al módulo permiso; quien lo arma (main)
// decide qué permiso exige cada acción.
//
// `actor` dice quién hace la petición. Se recibe como función porque auth
// depende de este paquete: importar auth aquí cerraría un ciclo.
type Handler struct {
	g       Gestor
	guardas httpx.Guardas
	actor   func(*gin.Context) int64
}

func NewHandler(g Gestor, guardas httpx.Guardas, actor func(*gin.Context) int64) *Handler {
	return &Handler{g: g, guardas: guardas, actor: actor}
}

// Register cuelga las rutas de un grupo que ya exige sesión.
func (h *Handler) Register(r gin.IRouter) {
	r.GET("/usuario", httpx.Cadena(h.guardas.Ver, h.listar)...)
	r.GET("/usuario/:id", httpx.Cadena(h.guardas.Ver, h.obtener)...)
	r.POST("/usuario", httpx.Cadena(h.guardas.Crear, h.crear)...)
	r.PUT("/usuario/:id", httpx.Cadena(h.guardas.Editar, h.actualizar)...)
	r.PATCH("/usuario/:id/estado", httpx.Cadena(h.guardas.Editar, h.estado)...)
	r.DELETE("/usuario/:id", httpx.Cadena(h.guardas.Eliminar, h.eliminar)...)
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
	if errors.Is(err, ErrNoEncontrada) {
		_ = c.Error(httpx.NotFound("El usuario no existe"))
		return
	}
	_ = c.Error(httpx.Traducir(err))
}

func (h *Handler) listar(c *gin.Context) {
	cuentas, err := h.g.Listar(c.Request.Context())
	if err != nil {
		falla(c, err)
		return
	}

	// [] y no null: el frontend hace .map() sobre la respuesta.
	perfiles := make([]Perfil, len(cuentas))
	for i, cuenta := range cuentas {
		perfiles[i] = cuenta.Perfil()
	}
	c.JSON(http.StatusOK, perfiles)
}

func (h *Handler) obtener(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	cuenta, err := h.g.PorID(c.Request.Context(), id)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, cuenta.Perfil())
}

func (h *Handler) crear(c *gin.Context) {
	var n Nueva
	if err := c.ShouldBindJSON(&n); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	cuenta, err := h.g.Crear(c.Request.Context(), n, h.actor(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusCreated, cuenta.Perfil())
}

func (h *Handler) actualizar(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	var n Nueva
	if err := c.ShouldBindJSON(&n); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	cuenta, err := h.g.Actualizar(c.Request.Context(), id, n, h.actor(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, cuenta.Perfil())
}

type estadoRequest struct {
	Activo bool `json:"activo"`
}

func (h *Handler) estado(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	var req estadoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	activo, err := h.g.CambiarEstado(c.Request.Context(), id, req.Activo, h.actor(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"activo": activo})
}

func (h *Handler) eliminar(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	if err := h.g.Eliminar(c.Request.Context(), id, h.actor(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
