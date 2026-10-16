package auditoria

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/platform/httpx"
)

// Handler es la pantalla de Auditoría: consulta y depuración.
//
// `actor` dice quién hace la petición (auth.UsuarioID). Se recibe como función
// y no se importa auth: usuario depende de este paquete para registrar sus
// cambios, y auth depende de usuario; importarlo aquí cerraría el ciclo.
type Handler struct {
	svc     *Servicio
	guardas httpx.Guardas
	actor   func(*gin.Context) int64
}

func NewHandler(svc *Servicio, g httpx.Guardas, actor func(*gin.Context) int64) *Handler {
	return &Handler{svc: svc, guardas: g, actor: actor}
}

func (h *Handler) Register(r gin.IRouter) {
	r.POST("/auditoria/listar", httpx.Cadena(h.guardas.Ver, h.listar)...)
	r.GET("/auditoria/resumen", httpx.Cadena(h.guardas.Ver, h.resumen)...)
	r.GET("/auditoria/entidades", httpx.Cadena(h.guardas.Ver, h.entidades)...)
	r.GET("/auditoria/:id", httpx.Cadena(h.guardas.Ver, h.detalle)...)
	r.POST("/auditoria/depurar", httpx.Cadena(h.guardas.Eliminar, h.depurar)...)
}

// listar recibe la consulta de la tabla (POST: los filtros son una lista de
// objetos y armarlos en la query string obligaría a inventar una codificación
// propia y a mantenerla en los dos lados).
func (h *Handler) listar(c *gin.Context) {
	var consulta Consulta
	if err := c.ShouldBindJSON(&consulta); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.svc.Listar(c.Request.Context(), consulta)
	if err != nil {
		_ = c.Error(httpx.Traducir(err))
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) detalle(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return
	}
	d, err := h.svc.PorID(c.Request.Context(), id)
	if errors.Is(err, ErrNoEncontrado) {
		_ = c.Error(httpx.NotFound("No existe ese registro de auditoría"))
		return
	}
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, d)
}

func (h *Handler) resumen(c *gin.Context) {
	r, err := h.svc.Resumen(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, r)
}

func (h *Handler) entidades(c *gin.Context) {
	out, err := h.svc.Entidades(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// depurar borra lo que la consulta deja a la vista (nunca lo de los últimos 30 días).
func (h *Handler) depurar(c *gin.Context) {
	var consulta Consulta
	if err := c.ShouldBindJSON(&consulta); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	n, err := h.svc.Depurar(c.Request.Context(), consulta, h.actor(c))
	if err != nil {
		_ = c.Error(httpx.Traducir(err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"eliminados": n})
}
