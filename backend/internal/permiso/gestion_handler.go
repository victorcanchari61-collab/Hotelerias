package permiso

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// Gestor es lo que el handler de gestión necesita de Gestion.
type Gestor interface {
	Excepciones(ctx context.Context, usuarioID int64) ([]ExcepcionDetalle, error)
	Conceder(ctx context.Context, n ExcepcionNueva) (ExcepcionDetalle, error)
	Revocar(ctx context.Context, id, actor int64) error
	Solicitar(ctx context.Context, n SolicitudNueva) (Solicitud, error)
	MisSolicitudes(ctx context.Context, usuarioID int64) ([]Solicitud, error)
	Bandeja(ctx context.Context, soloPendientes bool) ([]Solicitud, error)
	Aprobar(ctx context.Context, id, adminID int64, v Vigencia, expira *time.Time, respuesta string) (Solicitud, error)
	Rechazar(ctx context.Context, id, adminID int64, respuesta string) (Solicitud, error)
	AlcancesDeRol(ctx context.Context, rolID int64) (map[string]Alcance, error)
	GuardarAlcancesRol(ctx context.Context, rolID int64, a map[string]Alcance, actor int64) error
	AlcancesDeUsuario(ctx context.Context, usuarioID int64) (map[string]Alcance, error)
	GuardarAlcancesUsuario(ctx context.Context, usuarioID int64, a map[string]Alcance, actor int64) error
	Mios(ctx context.Context, usuarioID int64) (map[string]Alcance, error)
}

// GestionHandler es la pantalla de Accesos: excepciones por persona, bandeja de
// solicitudes y alcance por sede. Todo lo que modifica exige "editar accesos"
// (a propósito el mismo permiso: conceder permisos ES configurar accesos).
type GestionHandler struct {
	g       Gestor
	accesos httpx.Guardas
}

func NewGestionHandler(g Gestor, accesos httpx.Guardas) *GestionHandler {
	return &GestionHandler{g: g, accesos: accesos}
}

func (h *GestionHandler) Register(r gin.IRouter) {
	p := r.Group("/permiso")

	// Lo que cualquiera con sesión puede hacer: pedir y ver lo suyo.
	p.POST("/solicitar", h.solicitar)
	p.GET("/solicitudes/mias", h.misSolicitudes)
	p.GET("/alcances/mios", h.misAlcances)
	p.GET("/alcances/catalogo", h.catalogoAlcances)

	// El resto es del administrador de accesos.
	p.GET("/usuario/:id", httpx.Cadena(h.accesos.Ver, h.excepciones)...)
	p.POST("/conceder", httpx.Cadena(h.accesos.Editar, h.conceder)...)
	p.PATCH("/excepcion/:id/revocar", httpx.Cadena(h.accesos.Editar, h.revocar)...)

	p.GET("/solicitudes", httpx.Cadena(h.accesos.Ver, h.bandeja)...)
	p.POST("/solicitudes/:id/aprobar", httpx.Cadena(h.accesos.Editar, h.aprobar)...)
	p.POST("/solicitudes/:id/rechazar", httpx.Cadena(h.accesos.Editar, h.rechazar)...)

	p.GET("/alcances/rol/:id", httpx.Cadena(h.accesos.Ver, h.alcancesRol)...)
	p.PUT("/alcances/rol/:id", httpx.Cadena(h.accesos.Editar, h.guardarAlcancesRol)...)
	p.GET("/alcances/usuario/:id", httpx.Cadena(h.accesos.Ver, h.alcancesUsuario)...)
	p.PUT("/alcances/usuario/:id", httpx.Cadena(h.accesos.Editar, h.guardarAlcancesUsuario)...)
}

func idParam(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return 0, false
	}
	return id, true
}

func falla(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrSolicitudNoEncontrada):
		_ = c.Error(httpx.NotFound("La solicitud no existe"))
	case errors.Is(err, ErrExcepcionNoEncontrada):
		_ = c.Error(httpx.NotFound("El permiso no existe"))
	case errors.Is(err, ErrUsuarioNoEncontrado):
		_ = c.Error(httpx.NotFound("El usuario no existe"))
	case errors.Is(err, ErrYaResuelta):
		_ = c.Error(httpx.Conflict("Esa solicitud ya fue resuelta"))
	default:
		_ = c.Error(httpx.Traducir(err))
	}
}

func (h *GestionHandler) excepciones(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	out, err := h.g.Excepciones(c.Request.Context(), id)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

type concederRequest struct {
	UsuarioID int64      `json:"usuarioId"`
	Submodulo string     `json:"submodulo"`
	Accion    string     `json:"accion"`
	Vigencia  Vigencia   `json:"vigencia"`
	ExpiraEn  *time.Time `json:"expiraEn"`
	Motivo    string     `json:"motivo"`
}

func (h *GestionHandler) conceder(c *gin.Context) {
	var req concederRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UsuarioID <= 0 {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.g.Conceder(c.Request.Context(), ExcepcionNueva{
		UsuarioID:   req.UsuarioID,
		Clave:       Clave{Submodulo: req.Submodulo, Accion: Accion(req.Accion)},
		Vigencia:    req.Vigencia,
		ExpiraEn:    req.ExpiraEn,
		Motivo:      req.Motivo,
		OtorgadoPor: auth.UsuarioID(c),
	})
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (h *GestionHandler) revocar(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	if err := h.g.Revocar(c.Request.Context(), id, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

type solicitarRequest struct {
	Submodulo  string `json:"submodulo"`
	Accion     string `json:"accion"`
	Motivo     string `json:"motivo"`
	Referencia string `json:"referencia"`
}

func (h *GestionHandler) solicitar(c *gin.Context) {
	var req solicitarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.g.Solicitar(c.Request.Context(), SolicitudNueva{
		UsuarioID:  auth.UsuarioID(c),
		Clave:      Clave{Submodulo: req.Submodulo, Accion: Accion(req.Accion)},
		Motivo:     req.Motivo,
		Referencia: req.Referencia,
	})
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *GestionHandler) misSolicitudes(c *gin.Context) {
	out, err := h.g.MisSolicitudes(c.Request.Context(), auth.UsuarioID(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *GestionHandler) bandeja(c *gin.Context) {
	soloPendientes, _ := strconv.ParseBool(c.Query("soloPendientes"))
	out, err := h.g.Bandeja(c.Request.Context(), soloPendientes)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

type aprobarRequest struct {
	Vigencia  Vigencia   `json:"vigencia"`
	ExpiraEn  *time.Time `json:"expiraEn"`
	Respuesta string     `json:"respuesta"`
}

func (h *GestionHandler) aprobar(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var req aprobarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.g.Aprobar(c.Request.Context(), id, auth.UsuarioID(c), req.Vigencia, req.ExpiraEn, req.Respuesta)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

type rechazarRequest struct {
	Respuesta string `json:"respuesta"`
}

func (h *GestionHandler) rechazar(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var req rechazarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.g.Rechazar(c.Request.Context(), id, auth.UsuarioID(c), req.Respuesta)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *GestionHandler) catalogoAlcances(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"submodulos": SubmodulosConAlcance,
		"niveles":    []Alcance{TodasLasSedes, MisSedes},
	})
}

func (h *GestionHandler) misAlcances(c *gin.Context) {
	out, err := h.g.Mios(c.Request.Context(), auth.UsuarioID(c))
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *GestionHandler) alcancesRol(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	out, err := h.g.AlcancesDeRol(c.Request.Context(), id)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *GestionHandler) guardarAlcancesRol(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var a map[string]Alcance
	if err := c.ShouldBindJSON(&a); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	if err := h.g.GuardarAlcancesRol(c.Request.Context(), id, a, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *GestionHandler) alcancesUsuario(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	out, err := h.g.AlcancesDeUsuario(c.Request.Context(), id)
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *GestionHandler) guardarAlcancesUsuario(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var a map[string]Alcance
	if err := c.ShouldBindJSON(&a); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	if err := h.g.GuardarAlcancesUsuario(c.Request.Context(), id, a, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
