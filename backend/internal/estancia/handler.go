package estancia

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

// Handler es recepción: el panel de llegadas y huéspedes en casa, el check-in y el check-out.
// La ficha lleva datos personales, así que tiene su propio permiso (recepcion.fichas).
type Handler struct {
	svc      *Servicio
	estancia Guardas
	fichas   Guardas
	alcance  Alcance
}

// Guardas son los filtros de permiso de un recurso, por acción.
type Guardas = httpx.Guardas

func NewHandler(svc *Servicio, estancias, fichas Guardas, a Alcance) *Handler {
	return &Handler{svc: svc, estancia: estancias, fichas: fichas, alcance: a}
}

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/estancia", httpx.Cadena(h.estancia.Ver, h.panel)...)
	r.GET("/estancia/habitaciones", httpx.Cadena(h.estancia.Ver, h.libres)...)
	r.POST("/estancia", httpx.Cadena(h.estancia.Confirmar, h.checkIn)...)
	r.POST("/estancia/:id/check-out", httpx.Cadena(h.estancia.Confirmar, h.checkOut)...)
	r.GET("/ficha-registro/:id", httpx.Cadena(h.fichas.Ver, h.ficha)...)
}

func falla(c *gin.Context, err error) {
	if errors.Is(err, ErrNoEncontrada) {
		_ = c.Error(httpx.NotFound("La reserva o la estancia no existe"))
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

func idDe(c *gin.Context, valor string) (int64, bool) {
	id, err := strconv.ParseInt(valor, 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return 0, false
	}
	return id, true
}

func (h *Handler) panel(c *gin.Context) {
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.Panel(c.Request.Context(), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) libres(c *gin.Context) {
	reserva, ok := idDe(c, c.Query("reservaId"))
	if !ok {
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.HabitacionesLibres(c.Request.Context(), reserva, sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) checkIn(c *gin.Context) {
	var in CheckIn
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.CheckIn(c.Request.Context(), in, auth.UsuarioID(c), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (h *Handler) checkOut(c *gin.Context) {
	id, ok := idDe(c, c.Param("id"))
	if !ok {
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.CheckOut(c.Request.Context(), id, auth.UsuarioID(c), sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) ficha(c *gin.Context) {
	id, ok := idDe(c, c.Param("id"))
	if !ok {
		return
	}
	sedes, ok := h.sedes(c)
	if !ok {
		return
	}
	out, err := h.svc.Ficha(c.Request.Context(), id, sedes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
