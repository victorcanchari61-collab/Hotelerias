package limpieza

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
// Una lista vacía es "ninguno" (nunca "todos" por descuido).
type Alcance interface {
	SedesVisibles(ctx context.Context, usuarioID int64) ([]int64, error)
}

// SinRestriccion es el Alcance de quien ve todos los hoteles (y el de las pruebas).
type SinRestriccion struct{}

func (SinRestriccion) SedesVisibles(context.Context, int64) ([]int64, error) { return nil, nil }

// Handler es el tablero de limpieza. Asignar es "crear", iniciar es "editar" y
// terminar (que deja la habitación limpia) es "confirmar".
type Handler struct {
	svc     *Servicio
	guardas httpx.Guardas
	alcance Alcance
}

func NewHandler(svc *Servicio, g httpx.Guardas, a Alcance) *Handler {
	return &Handler{svc: svc, guardas: g, alcance: a}
}

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/limpieza", httpx.Cadena(h.guardas.Ver, h.tablero)...)
	r.GET("/limpieza/historial", httpx.Cadena(h.guardas.Ver, h.historial)...)
	r.GET("/limpieza/personal", httpx.Cadena(h.guardas.Ver, h.personal)...)
	r.PUT("/limpieza/:habitacionId/asignacion", httpx.Cadena(h.guardas.Crear, h.asignar)...)
	r.POST("/limpieza/:habitacionId/iniciar", httpx.Cadena(h.guardas.Editar, h.iniciar)...)
	r.POST("/limpieza/:habitacionId/terminar", httpx.Cadena(h.guardas.Confirmar, h.terminar)...)
}

func falla(c *gin.Context, err error) {
	if errors.Is(err, ErrNoEncontrada) {
		_ = c.Error(httpx.NotFound("La habitación no existe"))
		return
	}
	_ = c.Error(httpx.Traducir(err))
}

func (h *Handler) sedes(c *gin.Context) ([]int64, bool) {
	s, err := h.alcance.SedesVisibles(c.Request.Context(), auth.UsuarioID(c))
	if err != nil {
		_ = c.Error(err)
		return nil, false
	}
	return s, true
}

func habitacionID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("habitacionId"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return 0, false
	}
	return id, true
}

func (h *Handler) tablero(c *gin.Context) {
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.Tablero(c.Request.Context(), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) historial(c *gin.Context) {
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	limite, _ := strconv.Atoi(c.Query("limite"))
	out, err := h.svc.Historial(c.Request.Context(), sedes, limite)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) personal(c *gin.Context) {
	out, err := h.svc.Personal(c.Request.Context())
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) asignar(c *gin.Context) {
	id, ok := habitacionID(c)
	if !ok {
		return
	}
	// usuarioId: null quita al responsable.
	var in struct {
		UsuarioID *int64 `json:"usuarioId"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	if err := h.svc.Asignar(c.Request.Context(), id, in.UsuarioID, auth.UsuarioID(c), sedes); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) iniciar(c *gin.Context) {
	id, ok := habitacionID(c)
	if !ok {
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	if err := h.svc.Iniciar(c.Request.Context(), id, auth.UsuarioID(c), sedes); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) terminar(c *gin.Context) {
	id, ok := habitacionID(c)
	if !ok {
		return
	}
	var in struct {
		Observaciones string `json:"observaciones"`
	}
	// El cuerpo es opcional: terminar sin observaciones es lo normal.
	_ = c.ShouldBindJSON(&in)
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	if err := h.svc.Terminar(c.Request.Context(), id, in.Observaciones, auth.UsuarioID(c), sedes); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
