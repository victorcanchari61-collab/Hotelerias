package sitio

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// Publico es lo que lee la web SIN sesión: solo lo activo, lo vigente y lo publicado.
type Publico struct {
	svc *Servicio
	// mensajes frena a quien mande mensajes en cantidad desde una misma dirección.
	mensajes *auth.Limitador
}

func NewPublico(svc *Servicio) *Publico {
	return &Publico{svc: svc, mensajes: auth.NuevoLimitador(5, time.Hour)}
}

func (p *Publico) Register(r gin.IRouter) {
	r.GET("/portal/portada", p.portada)
	r.GET("/portal/experiencias", p.experiencias)
	r.GET("/portal/entradas", p.entradas)
	r.GET("/portal/entradas/:slug", p.entrada)
	r.GET("/portal/paginas/:clave", p.pagina)
	r.GET("/portal/galeria/:entidad/:id", p.galeria)
	r.POST("/portal/contacto/mensaje", p.enviarMensaje)
}

func (p *Publico) responder(c *gin.Context, v any, err error) {
	if err != nil {
		if errors.Is(err, ErrNoEncontrado) {
			_ = c.Error(httpx.NotFound("No existe"))
			return
		}
		_ = c.Error(httpx.Traducir(err))
		return
	}
	// Lo público cambia poco: el navegador puede guardarlo un momento.
	c.Header("Cache-Control", "public, max-age=30")
	c.JSON(http.StatusOK, v)
}

func (p *Publico) portada(c *gin.Context) {
	v, err := p.svc.BannersVigentes(c.Request.Context())
	p.responder(c, v, err)
}

func (p *Publico) experiencias(c *gin.Context) {
	v, err := p.svc.ExperienciasActivas(c.Request.Context())
	p.responder(c, v, err)
}

func (p *Publico) entradas(c *gin.Context) {
	limite, _ := strconv.Atoi(c.Query("limite"))
	desde, _ := strconv.Atoi(c.Query("desde"))
	v, err := p.svc.EntradasPublicadas(c.Request.Context(), limite, desde)
	p.responder(c, v, err)
}

func (p *Publico) entrada(c *gin.Context) {
	v, err := p.svc.EntradaPublicada(c.Request.Context(), c.Param("slug"))
	p.responder(c, v, err)
}

func (p *Publico) pagina(c *gin.Context) {
	v, err := p.svc.Pagina(c.Request.Context(), c.Param("clave"))
	p.responder(c, v, err)
}

func (p *Publico) galeria(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return
	}
	v, err := p.svc.Galeria(c.Request.Context(), c.Param("entidad"), id)
	p.responder(c, v, err)
}

func (p *Publico) enviarMensaje(c *gin.Context) {
	clave := c.ClientIP()
	if !p.mensajes.Permitir(clave) {
		_ = c.Error(httpx.TooManyRequests("Enviaste muchos mensajes. Inténtalo más tarde"))
		return
	}
	var in MensajeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	p.mensajes.Fallo(clave) // cada intento cuenta, salga bien o mal
	if err := p.svc.RecibirMensaje(c.Request.Context(), in); err != nil {
		_ = c.Error(httpx.Traducir(err))
		return
	}
	c.Status(http.StatusNoContent)
}
