package sitio

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// Guardas son los permisos de cada pantalla del grupo «Sitio web».
type Guardas struct {
	Portada, Medios, Galerias, Experiencias, Blog, Paginas, Mensajes httpx.Guardas
}

// Handler es el panel de administración del sitio.
type Handler struct {
	svc     *Servicio
	guardas Guardas
}

func NewHandler(svc *Servicio, g Guardas) *Handler { return &Handler{svc: svc, guardas: g} }

func (h *Handler) Register(r gin.IRouter) {
	g := h.guardas

	r.GET("/sitio/banner", httpx.Cadena(g.Portada.Ver, h.listarBanners)...)
	r.POST("/sitio/banner", httpx.Cadena(g.Portada.Crear, h.crearBanner)...)
	r.PUT("/sitio/banner/:id", httpx.Cadena(g.Portada.Editar, h.actualizarBanner)...)
	r.DELETE("/sitio/banner/:id", httpx.Cadena(g.Portada.Eliminar, h.eliminarBanner)...)

	r.GET("/sitio/medio", httpx.Cadena(g.Medios.Ver, h.listarMedios)...)
	r.POST("/sitio/medio", httpx.Cadena(g.Medios.Crear, h.subirMedio)...)
	r.PUT("/sitio/medio/:id", httpx.Cadena(g.Medios.Editar, h.actualizarMedio)...)
	r.DELETE("/sitio/medio/:id", httpx.Cadena(g.Medios.Eliminar, h.eliminarMedio)...)

	r.GET("/sitio/galerias-destinos", httpx.Cadena(g.Galerias.Ver, h.destinos)...)
	r.GET("/sitio/galeria/:entidad/:id", httpx.Cadena(g.Galerias.Ver, h.verGaleria)...)
	r.PUT("/sitio/galeria/:entidad/:id", httpx.Cadena(g.Galerias.Editar, h.guardarGaleria)...)

	r.GET("/sitio/experiencia", httpx.Cadena(g.Experiencias.Ver, h.listarExperiencias)...)
	r.POST("/sitio/experiencia", httpx.Cadena(g.Experiencias.Crear, h.crearExperiencia)...)
	r.PUT("/sitio/experiencia/:id", httpx.Cadena(g.Experiencias.Editar, h.actualizarExperiencia)...)
	r.DELETE("/sitio/experiencia/:id", httpx.Cadena(g.Experiencias.Eliminar, h.eliminarExperiencia)...)

	r.GET("/sitio/entrada", httpx.Cadena(g.Blog.Ver, h.listarEntradas)...)
	r.GET("/sitio/entrada/:id", httpx.Cadena(g.Blog.Ver, h.verEntrada)...)
	r.POST("/sitio/entrada", httpx.Cadena(g.Blog.Crear, h.crearEntrada)...)
	r.PUT("/sitio/entrada/:id", httpx.Cadena(g.Blog.Editar, h.actualizarEntrada)...)
	r.POST("/sitio/entrada/:id/publicar", httpx.Cadena(g.Blog.Confirmar, h.publicar(true))...)
	r.POST("/sitio/entrada/:id/despublicar", httpx.Cadena(g.Blog.Confirmar, h.publicar(false))...)
	r.DELETE("/sitio/entrada/:id", httpx.Cadena(g.Blog.Eliminar, h.eliminarEntrada)...)

	r.GET("/sitio/pagina/:clave", httpx.Cadena(g.Paginas.Ver, h.verPagina)...)
	r.PUT("/sitio/pagina/:clave", httpx.Cadena(g.Paginas.Editar, h.guardarPagina)...)

	r.GET("/sitio/mensaje", httpx.Cadena(g.Mensajes.Ver, h.listarMensajes)...)
	r.PATCH("/sitio/mensaje/:id/estado", httpx.Cadena(g.Mensajes.Editar, h.estadoMensaje)...)
	r.DELETE("/sitio/mensaje/:id", httpx.Cadena(g.Mensajes.Eliminar, h.eliminarMensaje)...)
}

func falla(c *gin.Context, err error) {
	if errors.Is(err, ErrNoEncontrado) {
		_ = c.Error(httpx.NotFound("No existe"))
		return
	}
	_ = c.Error(httpx.Traducir(err))
}

func idDe(c *gin.Context, nombre string) (int64, bool) {
	id, err := strconv.ParseInt(c.Param(nombre), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return 0, false
	}
	return id, true
}

// cuerpo lee el JSON; si no se puede, responde 400 y devuelve false.
func cuerpo[T any](c *gin.Context) (T, bool) {
	var in T
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return in, false
	}
	return in, true
}

func (h *Handler) responder(c *gin.Context, codigo int, v any, err error) {
	if err != nil {
		falla(c, err)
		return
	}
	c.JSON(codigo, v)
}

// --- portada ---

func (h *Handler) listarBanners(c *gin.Context) {
	v, err := h.svc.Banners(c.Request.Context())
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) crearBanner(c *gin.Context) {
	in, ok := cuerpo[BannerInput](c)
	if !ok {
		return
	}
	v, err := h.svc.CrearBanner(c.Request.Context(), in, auth.UsuarioID(c))
	h.responder(c, http.StatusCreated, v, err)
}

func (h *Handler) actualizarBanner(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	in, ok := cuerpo[BannerInput](c)
	if !ok {
		return
	}
	v, err := h.svc.ActualizarBanner(c.Request.Context(), id, in, auth.UsuarioID(c))
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) eliminarBanner(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	if err := h.svc.EliminarBanner(c.Request.Context(), id, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// --- medios ---

func (h *Handler) listarMedios(c *gin.Context) {
	limite, _ := strconv.Atoi(c.Query("limite"))
	v, err := h.svc.Medios(c.Request.Context(), c.Query("tipo"), limite)
	h.responder(c, http.StatusOK, v, err)
}

// subirMedio lee el multipart en flujo: el archivo pasa de la conexión al disco sin copiarse entero a memoria.
func (h *Handler) subirMedio(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxVideo+(1<<20))
	lector, err := c.Request.MultipartReader()
	if err != nil {
		_ = c.Error(httpx.BadRequest("Sube el archivo como formulario (multipart)"))
		return
	}
	for {
		parte, err := lector.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			var tope *http.MaxBytesError
			if errors.As(err, &tope) {
				_ = c.Error(httpx.BadRequest("El archivo es demasiado grande"))
				return
			}
			_ = c.Error(httpx.BadRequest("No se pudo leer el archivo"))
			return
		}
		if parte.FormName() != "archivo" || parte.FileName() == "" {
			continue
		}
		m, err := h.svc.Subir(c.Request.Context(), parte.FileName(), parte, auth.UsuarioID(c))
		var tope *http.MaxBytesError
		if errors.As(err, &tope) {
			_ = c.Error(httpx.BadRequest("El archivo es demasiado grande"))
			return
		}
		h.responder(c, http.StatusCreated, m, err)
		return
	}
	_ = c.Error(httpx.BadRequest("Falta el archivo"))
}

func (h *Handler) actualizarMedio(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	in, ok := cuerpo[struct {
		Descripcion string `json:"descripcion"`
	}](c)
	if !ok {
		return
	}
	v, err := h.svc.ActualizarMedio(c.Request.Context(), id, in.Descripcion, auth.UsuarioID(c))
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) eliminarMedio(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	if err := h.svc.EliminarMedio(c.Request.Context(), id, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// --- galerías ---

func (h *Handler) destinos(c *gin.Context) {
	v, err := h.svc.Destinos(c.Request.Context())
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) verGaleria(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	v, err := h.svc.Galeria(c.Request.Context(), c.Param("entidad"), id)
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) guardarGaleria(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	in, ok := cuerpo[struct {
		MedioIDs []int64 `json:"medioIds"`
	}](c)
	if !ok {
		return
	}
	v, err := h.svc.GuardarGaleria(c.Request.Context(), c.Param("entidad"), id, in.MedioIDs, auth.UsuarioID(c))
	h.responder(c, http.StatusOK, v, err)
}

// --- experiencias ---

func (h *Handler) listarExperiencias(c *gin.Context) {
	v, err := h.svc.Experiencias(c.Request.Context())
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) crearExperiencia(c *gin.Context) {
	in, ok := cuerpo[ExperienciaInput](c)
	if !ok {
		return
	}
	v, err := h.svc.CrearExperiencia(c.Request.Context(), in, auth.UsuarioID(c))
	h.responder(c, http.StatusCreated, v, err)
}

func (h *Handler) actualizarExperiencia(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	in, ok := cuerpo[ExperienciaInput](c)
	if !ok {
		return
	}
	v, err := h.svc.ActualizarExperiencia(c.Request.Context(), id, in, auth.UsuarioID(c))
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) eliminarExperiencia(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	if err := h.svc.EliminarExperiencia(c.Request.Context(), id, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// --- blog ---

func (h *Handler) listarEntradas(c *gin.Context) {
	v, err := h.svc.Entradas(c.Request.Context())
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) verEntrada(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	v, err := h.svc.ObtenerEntrada(c.Request.Context(), id)
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) crearEntrada(c *gin.Context) {
	in, ok := cuerpo[EntradaInput](c)
	if !ok {
		return
	}
	v, err := h.svc.CrearEntrada(c.Request.Context(), in, auth.UsuarioID(c))
	h.responder(c, http.StatusCreated, v, err)
}

func (h *Handler) actualizarEntrada(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	in, ok := cuerpo[EntradaInput](c)
	if !ok {
		return
	}
	v, err := h.svc.ActualizarEntrada(c.Request.Context(), id, in, auth.UsuarioID(c))
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) publicar(publicar bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := idDe(c, "id")
		if !ok {
			return
		}
		v, err := h.svc.PublicarEntrada(c.Request.Context(), id, publicar, auth.UsuarioID(c))
		h.responder(c, http.StatusOK, v, err)
	}
}

func (h *Handler) eliminarEntrada(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	if err := h.svc.EliminarEntrada(c.Request.Context(), id, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// --- páginas ---

func (h *Handler) verPagina(c *gin.Context) {
	v, err := h.svc.Pagina(c.Request.Context(), c.Param("clave"))
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) guardarPagina(c *gin.Context) {
	in, ok := cuerpo[PaginaInput](c)
	if !ok {
		return
	}
	v, err := h.svc.GuardarPagina(c.Request.Context(), c.Param("clave"), in, auth.UsuarioID(c))
	h.responder(c, http.StatusOK, v, err)
}

// --- mensajes ---

func (h *Handler) listarMensajes(c *gin.Context) {
	v, err := h.svc.Mensajes(c.Request.Context(), EstadoMensaje(c.Query("estado")))
	h.responder(c, http.StatusOK, v, err)
}

func (h *Handler) estadoMensaje(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	in, ok := cuerpo[struct {
		Estado EstadoMensaje `json:"estado"`
	}](c)
	if !ok {
		return
	}
	if err := h.svc.CambiarEstadoMensaje(c.Request.Context(), id, in.Estado, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) eliminarMensaje(c *gin.Context) {
	id, ok := idDe(c, "id")
	if !ok {
		return
	}
	if err := h.svc.EliminarMensaje(c.Request.Context(), id, auth.UsuarioID(c)); err != nil {
		falla(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
