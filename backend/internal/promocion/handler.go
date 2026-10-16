package promocion

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/platform/httpx"
)

// Handler es el CRUD que usa el personal para crear las ofertas. Las ofertas no
// se borran (las reservas ya hechas las referencian): se desactivan.
type Handler struct {
	svc     *Servicio
	guardas httpx.Guardas
}

func NewHandler(svc *Servicio, g httpx.Guardas) *Handler { return &Handler{svc: svc, guardas: g} }

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/promocion", httpx.Cadena(h.guardas.Ver, h.listar)...)
	r.POST("/promocion", httpx.Cadena(h.guardas.Crear, h.crear)...)
	r.PUT("/promocion/:id", httpx.Cadena(h.guardas.Editar, h.actualizar)...)
}

func (h *Handler) listar(c *gin.Context) {
	out, err := h.svc.Listar(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) crear(c *gin.Context) {
	var p Promocion
	if err := c.ShouldBindJSON(&p); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	p.ID = 0
	out, err := h.svc.Crear(c.Request.Context(), p)
	if err != nil {
		_ = c.Error(traducir(err))
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (h *Handler) actualizar(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return
	}
	var p Promocion
	if err := c.ShouldBindJSON(&p); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	p.ID = id
	out, err := h.svc.Actualizar(c.Request.Context(), p)
	if err != nil {
		_ = c.Error(traducir(err))
		return
	}
	c.JSON(http.StatusOK, out)
}

// traducir pasa un error del servicio a su respuesta HTTP.
func traducir(err error) error {
	var v httpx.Validacion
	switch {
	case errors.Is(err, ErrNoEncontrada):
		return httpx.NotFound("La oferta no existe")
	case errors.Is(err, ErrCodigoUsado):
		return httpx.Conflict("Ya existe una oferta con ese código")
	case errors.Is(err, ErrReferencia):
		return httpx.BadRequest("La sede o el tipo de cliente elegido no existe")
	case errors.As(err, &v):
		return httpx.BadRequest(v.Error())
	}
	return err
}
