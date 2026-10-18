// Package sitio es el contenido de la web pública, administrable desde el panel:
// portada con carrusel, fotos y videos, galerías de hoteles y habitaciones,
// experiencias, blog (historias y noticias), las páginas «Nosotros» y «Contacto»,
// y los mensajes que llegan por el formulario de contacto.
//
// Principios:
//   - Nada de lo que escribe el personal se inyecta como HTML en la web: los textos
//     viajan como texto y el frontend los dibuja sin HTML (ver frontend, TextoRico).
//   - Los archivos subidos se validan por su CONTENIDO (no por su nombre ni su
//     extensión), se guardan con un nombre al azar y se sirven con `nosniff`.
//   - Un medio en uso no se borra: el servicio dice dónde se usa.
//   - Lo público solo ve lo activo, lo vigente y lo publicado.
package sitio

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

// PrefijoURL es donde se sirven los archivos subidos (Apache y Nginx ya reenvían /uploads al backend).
const PrefijoURL = "/uploads/sitio/"

var (
	ErrNoEncontrado = errors.New("sitio: no encontrado")
	// ErrSlugRepetido lo da el repositorio si dos escritos simultáneos eligen el mismo.
	ErrSlugRepetido = errors.New("sitio: slug repetido")
)

// ErrEnUso: el medio no se puede borrar porque algo lo usa.
type ErrEnUso struct{ Usos []string }

func (e ErrEnUso) Error() string { return "sitio: medio en uso: " + strings.Join(e.Usos, ", ") }

// MedioRef es lo que se muestra de un medio dentro de otra cosa (un banner, una entrada…).
type MedioRef struct {
	ID          int64  `json:"id"`
	Tipo        string `json:"tipo"`
	URL         string `json:"url"`
	Descripcion string `json:"descripcion"`
	Ancho       *int   `json:"ancho"`
	Alto        *int   `json:"alto"`
}

// Medio es un archivo de la biblioteca, como lo ve el personal.
type Medio struct {
	MedioRef
	NombreOriginal string    `json:"nombreOriginal"`
	Mime           string    `json:"mime"`
	Bytes          int64     `json:"bytes"`
	Usos           int       `json:"usos"`
	CreadoEn       time.Time `json:"creadoEn"`
}

// NuevoMedio es lo que el repositorio guarda tras escribir el archivo en disco.
type NuevoMedio struct {
	Tipo, Archivo, NombreOriginal, Mime string
	Bytes                               int64
	Ancho, Alto                         *int
	CreadoPor                           int64
}

type Banner struct {
	ID          int64        `json:"id"`
	Orden       int          `json:"orden"`
	Titulo      string       `json:"titulo"`
	Subtitulo   string       `json:"subtitulo"`
	MedioID     *int64       `json:"medioId"`
	Medio       *MedioRef    `json:"medio"`
	EnlaceTexto string       `json:"enlaceTexto"`
	EnlaceURL   string       `json:"enlaceUrl"`
	Activo      bool         `json:"activo"`
	Desde       *fecha.Fecha `json:"desde"`
	Hasta       *fecha.Fecha `json:"hasta"`
}

type BannerInput struct {
	Orden       int          `json:"orden"`
	Titulo      string       `json:"titulo"`
	Subtitulo   string       `json:"subtitulo"`
	MedioID     *int64       `json:"medioId"`
	EnlaceTexto string       `json:"enlaceTexto"`
	EnlaceURL   string       `json:"enlaceUrl"`
	Activo      bool         `json:"activo"`
	Desde       *fecha.Fecha `json:"desde"`
	Hasta       *fecha.Fecha `json:"hasta"`
}

type Experiencia struct {
	ID       int64     `json:"id"`
	Slug     string    `json:"slug"`
	Titulo   string    `json:"titulo"`
	Resumen  string    `json:"resumen"`
	Texto    string    `json:"texto"`
	Ejemplos []string  `json:"ejemplos"`
	MedioID  *int64    `json:"medioId"`
	Medio    *MedioRef `json:"medio"`
	Orden    int       `json:"orden"`
	Activo   bool      `json:"activo"`
}

type ExperienciaInput struct {
	Titulo   string   `json:"titulo"`
	Resumen  string   `json:"resumen"`
	Texto    string   `json:"texto"`
	Ejemplos []string `json:"ejemplos"`
	MedioID  *int64   `json:"medioId"`
	Orden    int      `json:"orden"`
	Activo   bool     `json:"activo"`
}

type Estado string

const (
	Borrador  Estado = "borrador"
	Publicada Estado = "publicada"
)

type Entrada struct {
	ID            int64      `json:"id"`
	Slug          string     `json:"slug"`
	Titulo        string     `json:"titulo"`
	Resumen       string     `json:"resumen"`
	Cuerpo        string     `json:"cuerpo"`
	PortadaID     *int64     `json:"portadaId"`
	Portada       *MedioRef  `json:"portada"`
	Estado        Estado     `json:"estado"`
	PublicadaEn   *time.Time `json:"publicadaEn"`
	Autor         string     `json:"autor"`
	CreadoEn      time.Time  `json:"creadoEn"`
	ActualizadoEn time.Time  `json:"actualizadoEn"`
}

type EntradaInput struct {
	Titulo    string `json:"titulo"`
	Resumen   string `json:"resumen"`
	Cuerpo    string `json:"cuerpo"`
	PortadaID *int64 `json:"portadaId"`
}

type Pagina struct {
	Clave         string    `json:"clave"`
	Titulo        string    `json:"titulo"`
	Cuerpo        string    `json:"cuerpo"`
	MedioID       *int64    `json:"medioId"`
	Medio         *MedioRef `json:"medio"`
	ActualizadaEn time.Time `json:"actualizadaEn"`
}

type PaginaInput struct {
	Titulo  string `json:"titulo"`
	Cuerpo  string `json:"cuerpo"`
	MedioID *int64 `json:"medioId"`
}

type EstadoMensaje string

const (
	Nuevo      EstadoMensaje = "nuevo"
	Leido      EstadoMensaje = "leido"
	Respondido EstadoMensaje = "respondido"
)

type Mensaje struct {
	ID       int64         `json:"id"`
	Nombre   string        `json:"nombre"`
	Email    string        `json:"email"`
	Telefono string        `json:"telefono"`
	Asunto   string        `json:"asunto"`
	Mensaje  string        `json:"mensaje"`
	Estado   EstadoMensaje `json:"estado"`
	CreadoEn time.Time     `json:"creadoEn"`
}

type MensajeInput struct {
	Nombre   string `json:"nombre"`
	Email    string `json:"email"`
	Telefono string `json:"telefono"`
	Asunto   string `json:"asunto"`
	Mensaje  string `json:"mensaje"`
	// Sitio es el cebo para robots: un campo que una persona no ve y por eso deja vacío.
	Sitio string `json:"sitio"`
}

// Destino es algo que puede tener galería: un hotel o un tipo de habitación.
type Destino struct {
	Entidad string `json:"entidad"`
	ID      int64  `json:"id"`
	Nombre  string `json:"nombre"`
	// Detalle: la ciudad del hotel o el hotel del tipo de habitación.
	Detalle string `json:"detalle"`
}

// Entidades que tienen galería.
const (
	EntidadSede = "sede"
	EntidadTipo = "tipo_habitacion"
)

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	// --- medios ---
	CrearMedio(ctx context.Context, m NuevoMedio) (int64, error)
	ObtenerMedio(ctx context.Context, id int64) (Medio, error)
	ListarMedios(ctx context.Context, tipo string, limite int) ([]Medio, error)
	ActualizarMedio(ctx context.Context, id int64, descripcion string) error
	UsosDeMedio(ctx context.Context, id int64) ([]string, error)
	// EliminarMedio borra la fila y devuelve el archivo para quitarlo del disco.
	// ErrEnUso si algo lo usa (también si otro lo empezó a usar entre la comprobación y el borrado).
	EliminarMedio(ctx context.Context, id int64) (string, error)
	ExisteMedio(ctx context.Context, id int64) (bool, error)

	// --- banners ---
	ListarBanners(ctx context.Context, soloVigentes bool, hoy fecha.Fecha) ([]Banner, error)
	ObtenerBanner(ctx context.Context, id int64) (Banner, error)
	CrearBanner(ctx context.Context, in BannerInput) (int64, error)
	ActualizarBanner(ctx context.Context, id int64, in BannerInput) error
	EliminarBanner(ctx context.Context, id int64) error

	// --- experiencias ---
	ListarExperiencias(ctx context.Context, soloActivas bool) ([]Experiencia, error)
	ObtenerExperiencia(ctx context.Context, id int64) (Experiencia, error)
	CrearExperiencia(ctx context.Context, slug string, in ExperienciaInput) (int64, error)
	ActualizarExperiencia(ctx context.Context, id int64, slug string, in ExperienciaInput) error
	EliminarExperiencia(ctx context.Context, id int64) error

	// --- entradas del blog ---
	ListarEntradas(ctx context.Context, soloPublicadas bool, limite, desplazamiento int) ([]Entrada, error)
	ObtenerEntrada(ctx context.Context, id int64) (Entrada, error)
	EntradaPorSlug(ctx context.Context, slug string, soloPublicadas bool) (Entrada, error)
	CrearEntrada(ctx context.Context, slug string, in EntradaInput, autor int64) (int64, error)
	ActualizarEntrada(ctx context.Context, id int64, slug string, in EntradaInput) error
	CambiarEstadoEntrada(ctx context.Context, id int64, publicar bool, ahora time.Time) error
	EliminarEntrada(ctx context.Context, id int64) error

	// ExisteSlug dice si ya hay otra fila de esa tabla ("experiencia" o "entrada") con ese slug.
	ExisteSlug(ctx context.Context, tabla, slug string, excluirID int64) (bool, error)

	// --- páginas ---
	ObtenerPagina(ctx context.Context, clave string) (Pagina, error)
	GuardarPagina(ctx context.Context, clave string, in PaginaInput) error

	// --- galerías ---
	ObtenerGaleria(ctx context.Context, entidad string, id int64) ([]MedioRef, error)
	// GuardarGaleria reemplaza la galería por exactamente esos medios y en ese orden.
	GuardarGaleria(ctx context.Context, entidad string, id int64, medioIDs []int64) error
	ExisteEntidad(ctx context.Context, entidad string, id int64) (bool, error)
	// Destinos son los hoteles y tipos de habitación a los que se les puede armar una galería.
	Destinos(ctx context.Context) ([]Destino, error)

	// --- mensajes de contacto ---
	CrearMensaje(ctx context.Context, in MensajeInput) (int64, error)
	ListarMensajes(ctx context.Context, estado EstadoMensaje) ([]Mensaje, error)
	CambiarEstadoMensaje(ctx context.Context, id int64, estado EstadoMensaje) error
	EliminarMensaje(ctx context.Context, id int64) error
}

// Almacen es donde se guardan los archivos. En producción es el disco.
type Almacen interface {
	// Guardar escribe el archivo; si pasa de `max` bytes, falla y no deja nada.
	Guardar(archivo string, r io.Reader, max int64) (int64, error)
	Abrir(archivo string) (io.ReadCloser, error)
	Borrar(archivo string) error
}

type Servicio struct {
	repo      Repositorio
	almacen   Almacen
	ahora     func() time.Time
	hoy       func() fecha.Fecha
	auditoria auditoria.Registrador
}

func NewServicio(repo Repositorio, almacen Almacen, hoy func() fecha.Fecha, aud auditoria.Registrador) *Servicio {
	return &Servicio{repo: repo, almacen: almacen, ahora: time.Now, hoy: hoy, auditoria: aud}
}

// --- validaciones compartidas ---

// texto recorta y comprueba el largo (en caracteres, no en bytes).
func texto(nombre, valor string, max int, obligatorio bool) (string, error) {
	v := strings.TrimSpace(valor)
	if obligatorio && v == "" {
		return "", httpx.Validacion(fmt.Sprintf("«%s» es obligatorio", nombre))
	}
	if len([]rune(v)) > max {
		return "", httpx.Validacion(fmt.Sprintf("«%s» no puede pasar de %d caracteres", nombre, max))
	}
	return v, nil
}

// enlace acepta una ruta de la propia web ("/ofertas") o una dirección https. Todo lo demás
// (javascript:, data:, //otro.sitio, http sin cifrar) se rechaza: un enlace de la portada lo
// escribe una persona pero lo siguen todos los visitantes.
func enlace(valor string) (string, error) {
	v := strings.TrimSpace(valor)
	if v == "" {
		return "", nil
	}
	if len(v) > 300 {
		return "", httpx.Validacion("El enlace no puede pasar de 300 caracteres")
	}
	if strings.HasPrefix(v, "/") {
		if strings.HasPrefix(v, "//") || strings.ContainsAny(v, "\\\r\n\t ") {
			return "", httpx.Validacion("El enlace no es válido")
		}
		return v, nil
	}
	u, err := url.Parse(v)
	if err != nil || u.Scheme != "https" || u.Host == "" || strings.ContainsAny(v, " \r\n\t") {
		return "", httpx.Validacion("El enlace debe empezar con / (una página de la web) o con https://")
	}
	return v, nil
}

// Slug convierte un título en la parte de la dirección: «Una noche en Cusco» → «una-noche-en-cusco».
func Slug(titulo string) string {
	r := strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n",
		"à", "a", "è", "e", "ì", "i", "ò", "o", "ù", "u", "ä", "a", "ë", "e", "ï", "i", "ö", "o")
	s := r.Replace(strings.ToLower(strings.TrimSpace(titulo)))
	var b strings.Builder
	guion := false
	for _, c := range s {
		switch {
		case (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'):
			b.WriteRune(c)
			guion = false
		case !guion && b.Len() > 0:
			b.WriteByte('-')
			guion = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > 80 {
		out = strings.Trim(out[:80], "-")
	}
	if out == "" {
		return "sin-titulo"
	}
	return out
}

// slugLibre devuelve un slug que no choque con otro: «cusco», «cusco-2», «cusco-3»…
func (s *Servicio) slugLibre(ctx context.Context, tabla, titulo string, excluirID int64) (string, error) {
	base := Slug(titulo)
	for i := 1; i <= 100; i++ {
		candidato := base
		if i > 1 {
			candidato = fmt.Sprintf("%s-%d", base, i)
		}
		existe, err := s.repo.ExisteSlug(ctx, tabla, candidato, excluirID)
		if err != nil {
			return "", err
		}
		if !existe {
			return candidato, nil
		}
	}
	return "", httpx.Conflicto("No se pudo generar una dirección única para ese título: cámbialo un poco")
}

// medioValido comprueba que el medio elegido exista (nil = ninguno).
func (s *Servicio) medioValido(ctx context.Context, id *int64) error {
	if id == nil {
		return nil
	}
	ok, err := s.repo.ExisteMedio(ctx, *id)
	if err != nil {
		return err
	}
	if !ok {
		return httpx.Validacion("El archivo elegido ya no existe en la biblioteca")
	}
	return nil
}

func (s *Servicio) registrar(ctx context.Context, actor int64, entidad string, id int64, accion auditoria.Accion, antes, despues map[string]any) {
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: entidad, EntidadID: fmt.Sprint(id), Accion: accion, Antes: antes, Despues: despues,
	})
}
