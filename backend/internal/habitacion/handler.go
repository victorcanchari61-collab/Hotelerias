package habitacion

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// Alcance dice qué hoteles alcanza a ver una persona en esta pantalla. nil = todos.
// Una lista vacía es "ninguno": quien tiene "mis sedes" y ninguna asignada no
// ve nada (nunca "todos" por descuido).
type Alcance interface {
	SedesVisibles(ctx context.Context, usuarioID int64) ([]int64, error)
}

// SinRestriccion es el Alcance de quien ve todos los hoteles (y el de las pruebas).
type SinRestriccion struct{}

func (SinRestriccion) SedesVisibles(context.Context, int64) ([]int64, error) { return nil, nil }

type Handler struct {
	svc     *Servicio
	guardas httpx.Guardas
	alcance Alcance
}

func NewHandler(svc *Servicio, g httpx.Guardas, a Alcance) *Handler {
	return &Handler{svc: svc, guardas: g, alcance: a}
}

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/habitacion", httpx.Cadena(h.guardas.Ver, h.listar)...)
	r.GET("/habitacion/opciones", httpx.Cadena(h.guardas.Ver, h.opciones)...)
	r.POST("/habitacion", httpx.Cadena(h.guardas.Crear, h.crear)...)
	r.POST("/habitacion/lote", httpx.Cadena(h.guardas.Crear, h.crearLote)...)
	r.PUT("/habitacion/:id", httpx.Cadena(h.guardas.Editar, h.actualizar)...)
	r.PATCH("/habitacion/:id/estado", httpx.Cadena(h.guardas.Editar, h.cambiarEstado)...)
}

func falla(c *gin.Context, err error) {
	if errors.Is(err, ErrNoEncontrada) {
		_ = c.Error(httpx.NotFound("La habitación no existe"))
		return
	}
	_ = c.Error(httpx.Traducir(err))
}

// sedes: los hoteles que la persona alcanza (nil = todos). Si falla, responde y devuelve false.
func (h *Handler) sedes(c *gin.Context) ([]int64, bool) {
	s, err := h.alcance.SedesVisibles(c.Request.Context(), auth.UsuarioID(c))
	if err != nil {
		_ = c.Error(err)
		return nil, false
	}
	return s, true
}

func idParam(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return 0, false
	}
	return id, true
}

func (h *Handler) listar(c *gin.Context) {
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.Listar(c.Request.Context(), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) opciones(c *gin.Context) {
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.Opciones(c.Request.Context(), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) crear(c *gin.Context) {
	var in Input
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.Crear(c.Request.Context(), in, auth.UsuarioID(c), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (h *Handler) crearLote(c *gin.Context) {
	var in Lote
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	n, err := h.svc.CrearLote(c.Request.Context(), in, auth.UsuarioID(c), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"creadas": n})
}

func (h *Handler) actualizar(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var in Input
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.Actualizar(c.Request.Context(), id, in, auth.UsuarioID(c), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) cambiarEstado(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var in struct {
		Estado Estado `json:"estado"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.CambiarEstado(c.Request.Context(), id, in.Estado, auth.UsuarioID(c), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
