package sitio

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"io"
	"strings"
	"testing"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

func validacion(err error) bool {
	var v httpx.Validacion
	return errors.As(err, &v)
}

func conflicto(err error) bool {
	var c httpx.Conflicto
	return errors.As(err, &c)
}

// ---- bytes de archivos de verdad (solo la cabecera que identifica el formato) ----

func pngReal(t *testing.T, ancho, alto int) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, ancho, alto))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

var (
	jpeg   = append([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00}, make([]byte, 64)...)
	gif    = append([]byte("GIF89a"), make([]byte, 64)...)
	webp   = append([]byte("RIFF\x24\x00\x00\x00WEBPVP8 "), make([]byte, 64)...)
	mp4    = append([]byte{0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0}, make([]byte, 64)...)
	webm   = append([]byte{0x1A, 0x45, 0xDF, 0xA3}, make([]byte, 64)...)
	svg    = []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
	html   = []byte(`<!DOCTYPE html><html><body><script>alert(1)</script></body></html>`)
	pdf    = []byte("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n")
	exe    = append([]byte("MZ"), make([]byte, 128)...)
	texto_ = []byte("hola, esto es solo texto")
)

// ---- almacén y repositorio falsos ----

type almacenFalso struct {
	archivos map[string][]byte
}

func nuevoAlmacen() *almacenFalso { return &almacenFalso{archivos: map[string][]byte{}} }

func (a *almacenFalso) Guardar(nombre string, r io.Reader, max int64) (int64, error) {
	b, err := io.ReadAll(io.LimitReader(r, max+1))
	if err != nil {
		return 0, err
	}
	if int64(len(b)) > max {
		return 0, ErrDemasiadoGrande
	}
	a.archivos[nombre] = b
	return int64(len(b)), nil
}

func (a *almacenFalso) Abrir(nombre string) (io.ReadCloser, error) {
	b, ok := a.archivos[nombre]
	if !ok {
		return nil, errors.New("no existe")
	}
	return io.NopCloser(bytes.NewReader(b)), nil
}

func (a *almacenFalso) Borrar(nombre string) error {
	delete(a.archivos, nombre)
	return nil
}

// repoFalso implementa lo que cada prueba usa; el resto entra por la interfaz embebida (nil) y
// pánico si una prueba toca algo que no armó: así no se prueba por accidente contra nada.
type repoFalso struct {
	Repositorio
	medios       map[int64]Medio
	archivos     map[int64]string
	creadosMedio []NuevoMedio
	errCrear     error
	usos         map[int64][]string
	entradas     map[int64]Entrada
	mensajes     []MensajeInput
	slugsTomados map[string]bool
	estados      []string
}

func nuevoRepo() *repoFalso {
	return &repoFalso{
		medios: map[int64]Medio{}, archivos: map[int64]string{}, usos: map[int64][]string{},
		entradas: map[int64]Entrada{}, slugsTomados: map[string]bool{},
	}
}

func (r *repoFalso) CrearMedio(_ context.Context, m NuevoMedio) (int64, error) {
	if r.errCrear != nil {
		return 0, r.errCrear
	}
	r.creadosMedio = append(r.creadosMedio, m)
	id := int64(len(r.medios) + 1)
	r.medios[id] = Medio{MedioRef: MedioRef{ID: id, Tipo: m.Tipo, URL: PrefijoURL + m.Archivo, Ancho: m.Ancho, Alto: m.Alto},
		NombreOriginal: m.NombreOriginal, Mime: m.Mime, Bytes: m.Bytes}
	r.archivos[id] = m.Archivo
	return id, nil
}

func (r *repoFalso) ObtenerMedio(_ context.Context, id int64) (Medio, error) {
	if m, ok := r.medios[id]; ok {
		return m, nil
	}
	return Medio{}, ErrNoEncontrado
}

func (r *repoFalso) UsosDeMedio(_ context.Context, id int64) ([]string, error) {
	return r.usos[id], nil
}

func (r *repoFalso) EliminarMedio(_ context.Context, id int64) (string, error) {
	a := r.archivos[id]
	delete(r.medios, id)
	return a, nil
}

func (r *repoFalso) ExisteMedio(_ context.Context, id int64) (bool, error) {
	_, ok := r.medios[id]
	return ok, nil
}

func (r *repoFalso) ExisteSlug(_ context.Context, _ string, slug string, _ int64) (bool, error) {
	return r.slugsTomados[slug], nil
}

func (r *repoFalso) CrearEntrada(_ context.Context, slug string, in EntradaInput, _ int64) (int64, error) {
	id := int64(len(r.entradas) + 1)
	r.entradas[id] = Entrada{ID: id, Slug: slug, Titulo: in.Titulo, Resumen: in.Resumen, Cuerpo: in.Cuerpo, Estado: Borrador}
	return id, nil
}

func (r *repoFalso) ObtenerEntrada(_ context.Context, id int64) (Entrada, error) {
	if e, ok := r.entradas[id]; ok {
		return e, nil
	}
	return Entrada{}, ErrNoEncontrado
}

func (r *repoFalso) ActualizarEntrada(_ context.Context, id int64, slug string, in EntradaInput) error {
	e := r.entradas[id]
	e.Titulo, e.Resumen, e.Cuerpo, e.Slug = in.Titulo, in.Resumen, in.Cuerpo, slug
	r.entradas[id] = e
	return nil
}

func (r *repoFalso) CambiarEstadoEntrada(_ context.Context, id int64, publicar bool, ahora time.Time) error {
	e := r.entradas[id]
	if publicar {
		e.Estado, e.PublicadaEn = Publicada, &ahora
		r.estados = append(r.estados, "publicar")
	} else {
		e.Estado, e.PublicadaEn = Borrador, nil
		r.estados = append(r.estados, "despublicar")
	}
	r.entradas[id] = e
	return nil
}

func (r *repoFalso) CrearMensaje(_ context.Context, in MensajeInput) (int64, error) {
	r.mensajes = append(r.mensajes, in)
	return int64(len(r.mensajes)), nil
}

type bitacoraFalsa struct{ eventos []auditoria.Evento }

func (b *bitacoraFalsa) Registrar(_ context.Context, e auditoria.Evento) {
	b.eventos = append(b.eventos, e)
}

func armar() (*Servicio, *repoFalso, *almacenFalso, *bitacoraFalsa) {
	repo, alm, bit := nuevoRepo(), nuevoAlmacen(), &bitacoraFalsa{}
	return NewServicio(repo, alm, func() fecha.Fecha { return fecha.Nueva(2026, 11, 1) }, bit), repo, alm, bit
}

var ctx = context.Background()

// ---- slug y enlaces ----

func TestSlug(t *testing.T) {
	casos := map[string]string{
		"Una noche en Cusco":           "una-noche-en-cusco",
		"  Año nuevo: ¡Bienvenidos!  ": "ano-nuevo-bienvenidos",
		"Spa & Bienestar":              "spa-bienestar",
		"CAFÉ — pisco/vino":            "cafe-pisco-vino",
		"¿¡?!":                         "sin-titulo",
		"":                             "sin-titulo",
	}
	for entrada, quiero := range casos {
		if got := Slug(entrada); got != quiero {
			t.Errorf("Slug(%q) = %q; quiero %q", entrada, got, quiero)
		}
	}
	if got := Slug(strings.Repeat("a", 200)); len(got) > 80 {
		t.Errorf("slug de %d caracteres", len(got))
	}
}

func TestEnlace(t *testing.T) {
	for _, ok := range []string{"", "/ofertas", "/hoteles/3?entrada=2026-11-01", "https://velothr.pe/promo"} {
		if _, err := enlace(ok); err != nil {
			t.Errorf("enlace(%q): %v", ok, err)
		}
	}
	for _, malo := range []string{
		"javascript:alert(1)", "data:text/html,<script>", "http://inseguro.pe", "//otro.sitio/x", "/\\otro.sitio",
		"ofertas", "https://", "/a b", "/a\nb", "ftp://x.pe", strings.Repeat("/a", 200),
	} {
		if got, err := enlace(malo); err == nil {
			t.Errorf("enlace(%q) = %q; debió fallar", malo, got)
		}
	}
}

// ---- subir archivos ----

func TestSubirAceptaLosFormatosYGuardaConNombreAlAzar(t *testing.T) {
	casos := map[string]struct {
		bytes []byte
		tipo  string
		ext   string
	}{
		"png":  {pngReal(t, 30, 20), "imagen", ".png"},
		"jpeg": {jpeg, "imagen", ".jpg"},
		"gif":  {gif, "imagen", ".gif"},
		"webp": {webp, "imagen", ".webp"},
		"mp4":  {mp4, "video", ".mp4"},
		"webm": {webm, "video", ".webm"},
	}
	for nombre, c := range casos {
		s, repo, alm, bit := armar()
		// El nombre que trae el navegador es una trampa: la extensión no manda, el contenido sí.
		m, err := s.Subir(ctx, "../../etc/pasaporte.exe", bytes.NewReader(c.bytes), 4)
		if err != nil {
			t.Fatalf("%s: %v", nombre, err)
		}
		if m.Tipo != c.tipo {
			t.Errorf("%s: tipo %q", nombre, m.Tipo)
		}
		guardado := repo.creadosMedio[0].Archivo
		if !strings.HasSuffix(guardado, c.ext) || len(guardado) != 32+len(c.ext) {
			t.Errorf("%s: nombre guardado %q", nombre, guardado)
		}
		if strings.Contains(guardado, "pasaporte") || strings.Contains(guardado, "..") {
			t.Errorf("%s: el nombre guardado heredó el del cliente: %q", nombre, guardado)
		}
		if m.NombreOriginal != "pasaporte.exe" {
			t.Errorf("%s: nombre para mostrar %q (sin carpetas)", nombre, m.NombreOriginal)
		}
		if len(alm.archivos) != 1 {
			t.Errorf("%s: archivos en disco %d", nombre, len(alm.archivos))
		}
		if len(bit.eventos) != 1 || bit.eventos[0].UsuarioID != 4 {
			t.Errorf("%s: auditoría %+v", nombre, bit.eventos)
		}
	}
}

func TestSubirLeeElTamanoDeLaImagen(t *testing.T) {
	s, _, _, _ := armar()
	m, err := s.Subir(ctx, "foto.png", bytes.NewReader(pngReal(t, 30, 20)), 1)
	if err != nil {
		t.Fatal(err)
	}
	if m.Ancho == nil || m.Alto == nil || *m.Ancho != 30 || *m.Alto != 20 {
		t.Fatalf("ancho/alto = %v/%v", m.Ancho, m.Alto)
	}
}

func TestSubirRechazaLoQueNoEsFotoNiVideo(t *testing.T) {
	malos := map[string][]byte{
		"svg (puede llevar scripts)": svg,
		"html":                       html,
		"pdf":                        pdf,
		"ejecutable":                 exe,
		"texto":                      texto_,
		"vacío":                      {},
	}
	for nombre, b := range malos {
		s, repo, alm, _ := armar()
		_, err := s.Subir(ctx, "foto.jpg", bytes.NewReader(b), 1) // todos se disfrazan de .jpg
		if !validacion(err) {
			t.Errorf("%s: err = %v; quiero una validación", nombre, err)
		}
		if len(alm.archivos) != 0 || len(repo.creadosMedio) != 0 {
			t.Errorf("%s: no debió guardar nada", nombre)
		}
	}
}

func TestSubirRespetaElTopeDeCadaTipo(t *testing.T) {
	grandeImagen := append(append([]byte{}, jpeg...), make([]byte, MaxImagen)...)
	s, _, alm, _ := armar()
	if _, err := s.Subir(ctx, "grande.jpg", bytes.NewReader(grandeImagen), 1); !validacion(err) {
		t.Fatalf("imagen de más de 8 MB: %v", err)
	}
	if len(alm.archivos) != 0 {
		t.Fatal("no debe dejar el archivo a medias")
	}

	// Un video sí puede pasar de 8 MB (hasta 60).
	medioVideo := append(append([]byte{}, mp4...), make([]byte, 9<<20)...)
	if _, err := s.Subir(ctx, "v.mp4", bytes.NewReader(medioVideo), 1); err != nil {
		t.Fatalf("video de 9 MB: %v", err)
	}
}

func TestSiLaBaseFallaNoQuedaElArchivoHuerfano(t *testing.T) {
	s, repo, alm, _ := armar()
	repo.errCrear = errors.New("base caída")
	if _, err := s.Subir(ctx, "foto.png", bytes.NewReader(pngReal(t, 5, 5)), 1); err == nil {
		t.Fatal("debió fallar")
	}
	if len(alm.archivos) != 0 {
		t.Fatalf("quedaron %d archivos sueltos en el disco", len(alm.archivos))
	}
}

func TestEliminarMedioEnUsoDiceDondeSeUsa(t *testing.T) {
	s, repo, alm, _ := armar()
	m, _ := s.Subir(ctx, "a.png", bytes.NewReader(pngReal(t, 5, 5)), 1)
	repo.usos[m.ID] = []string{"la portada «Verano»", "la historia «Cusco»"}

	err := s.EliminarMedio(ctx, m.ID, 1)
	if !conflicto(err) || !strings.Contains(err.Error(), "la portada «Verano»") {
		t.Fatalf("err = %v", err)
	}
	if len(alm.archivos) != 1 {
		t.Fatal("el archivo en uso no se debe borrar del disco")
	}

	repo.usos[m.ID] = nil
	if err := s.EliminarMedio(ctx, m.ID, 1); err != nil {
		t.Fatal(err)
	}
	if len(alm.archivos) != 0 {
		t.Fatal("al borrarlo también se va del disco")
	}
}

// ---- banners ----

func TestBannerValidaSusCampos(t *testing.T) {
	ok := BannerInput{Titulo: "Verano en Paracas", EnlaceTexto: "Ver oferta", EnlaceURL: "/ofertas", Activo: true}
	if err := normalizarBanner(&ok); err != nil {
		t.Fatal(err)
	}
	desde, hasta := fecha.Nueva(2026, 12, 1), fecha.Nueva(2026, 11, 1)
	for nombre, in := range map[string]BannerInput{
		"sin título":           {},
		"título largo":         {Titulo: strings.Repeat("x", 121)},
		"botón sin enlace":     {Titulo: "x", EnlaceTexto: "Ver"},
		"enlace sin botón":     {Titulo: "x", EnlaceURL: "/ofertas"},
		"enlace peligroso":     {Titulo: "x", EnlaceTexto: "Ir", EnlaceURL: "javascript:alert(1)"},
		"orden fuera de rango": {Titulo: "x", Orden: 5000},
		"fechas al revés":      {Titulo: "x", Desde: &desde, Hasta: &hasta},
	} {
		in := in
		if err := normalizarBanner(&in); !validacion(err) {
			t.Errorf("%s: err = %v", nombre, err)
		}
	}
}

// ---- blog ----

func TestSlugDeUnaHistoriaEsUnicoYNoCambiaAlEditar(t *testing.T) {
	s, repo, _, _ := armar()
	repo.slugsTomados["una-noche-en-cusco"] = true
	repo.slugsTomados["una-noche-en-cusco-2"] = true

	e, err := s.CrearEntrada(ctx, EntradaInput{Titulo: "Una noche en Cusco", Cuerpo: "texto"}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if e.Slug != "una-noche-en-cusco-3" {
		t.Fatalf("slug = %q", e.Slug)
	}
	// Editar el título NO cambia la dirección: los enlaces que ya circulan siguen sirviendo.
	editada, err := s.ActualizarEntrada(ctx, e.ID, EntradaInput{Titulo: "Otra cosa distinta", Cuerpo: "texto"}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if editada.Slug != "una-noche-en-cusco-3" {
		t.Fatalf("el slug cambió: %q", editada.Slug)
	}
}

func TestPublicarExigeTextoYEsIdempotente(t *testing.T) {
	s, repo, _, bit := armar()
	e, _ := s.CrearEntrada(ctx, EntradaInput{Titulo: "Borrador sin texto"}, 1)
	if _, err := s.PublicarEntrada(ctx, e.ID, true, 1); !validacion(err) {
		t.Fatalf("publicar sin texto: %v", err)
	}
	if len(repo.estados) != 0 {
		t.Fatal("no debió publicar")
	}

	e2, _ := s.CrearEntrada(ctx, EntradaInput{Titulo: "Con texto", Cuerpo: "Había una vez…"}, 1)
	pub, err := s.PublicarEntrada(ctx, e2.ID, true, 1)
	if err != nil || pub.Estado != Publicada || pub.PublicadaEn == nil {
		t.Fatalf("publicar: %+v %v", pub, err)
	}
	antes := len(bit.eventos)
	if _, err := s.PublicarEntrada(ctx, e2.ID, true, 1); err != nil {
		t.Fatal(err)
	}
	if len(repo.estados) != 1 || len(bit.eventos) != antes {
		t.Fatal("publicar dos veces no debe repetir ni auditar de nuevo")
	}

	if b, err := s.PublicarEntrada(ctx, e2.ID, false, 1); err != nil || b.Estado != Borrador || b.PublicadaEn != nil {
		t.Fatalf("despublicar: %+v %v", b, err)
	}
}

func TestUnaHistoriaPublicadaNoQuedaSinTexto(t *testing.T) {
	s, _, _, _ := armar()
	e, _ := s.CrearEntrada(ctx, EntradaInput{Titulo: "Historia", Cuerpo: "texto"}, 1)
	_, _ = s.PublicarEntrada(ctx, e.ID, true, 1)
	if _, err := s.ActualizarEntrada(ctx, e.ID, EntradaInput{Titulo: "Historia", Cuerpo: "  "}, 1); !validacion(err) {
		t.Fatalf("err = %v", err)
	}
}

func TestLaListaPublicaNoLlevaElCuerpo(t *testing.T) {
	// El falso no filtra por estado: solo se comprueba que el servicio vacía el cuerpo.
	s := NewServicio(listaFija{}, nuevoAlmacen(), func() fecha.Fecha { return fecha.Nueva(2026, 11, 1) }, &bitacoraFalsa{})
	es, err := s.EntradasPublicadas(ctx, 10, 0)
	if err != nil || len(es) != 1 || es[0].Cuerpo != "" {
		t.Fatalf("%+v %v", es, err)
	}
}

type listaFija struct{ Repositorio }

func (l listaFija) ListarEntradas(context.Context, bool, int, int) ([]Entrada, error) {
	return []Entrada{{ID: 1, Titulo: "A", Cuerpo: "muy largo…"}}, nil
}

// ---- contacto ----

func TestMensajeDeContacto(t *testing.T) {
	buen := MensajeInput{Nombre: "Ana", Email: "ana@correo.pe", Mensaje: "Quisiera una cotización para una boda."}

	t.Run("se guarda recortado", func(t *testing.T) {
		s, repo, _, _ := armar()
		in := buen
		in.Nombre = "  Ana  "
		if err := s.RecibirMensaje(ctx, in); err != nil {
			t.Fatal(err)
		}
		if len(repo.mensajes) != 1 || repo.mensajes[0].Nombre != "Ana" {
			t.Fatalf("%+v", repo.mensajes)
		}
	})

	t.Run("el cebo para robots lleno: se acepta en silencio y NO se guarda", func(t *testing.T) {
		s, repo, _, _ := armar()
		in := buen
		in.Sitio = "http://spam.example"
		if err := s.RecibirMensaje(ctx, in); err != nil {
			t.Fatalf("no debe avisarle al robot: %v", err)
		}
		if len(repo.mensajes) != 0 {
			t.Fatal("se guardó el mensaje de un robot")
		}
	})

	t.Run("datos inválidos", func(t *testing.T) {
		casos := map[string]func(*MensajeInput){
			"sin nombre":        func(m *MensajeInput) { m.Nombre = " " },
			"sin correo":        func(m *MensajeInput) { m.Email = "" },
			"correo malo":       func(m *MensajeInput) { m.Email = "no-es-un-correo" },
			"correo con nombre": func(m *MensajeInput) { m.Email = "Ana <ana@correo.pe>" },
			"sin mensaje":       func(m *MensajeInput) { m.Mensaje = "" },
			"mensaje corto":     func(m *MensajeInput) { m.Mensaje = "hola" },
			"mensaje enorme":    func(m *MensajeInput) { m.Mensaje = strings.Repeat("x", 2001) },
			"teléfono largo":    func(m *MensajeInput) { m.Telefono = strings.Repeat("1", 31) },
		}
		for nombre, cambiar := range casos {
			s, repo, _, _ := armar()
			in := buen
			cambiar(&in)
			if err := s.RecibirMensaje(ctx, in); !validacion(err) {
				t.Errorf("%s: err = %v", nombre, err)
			}
			if len(repo.mensajes) != 0 {
				t.Errorf("%s: no debió guardar", nombre)
			}
		}
	})
}

// ---- galerías ----

type galeriaFalsa struct {
	Repositorio
	medios map[int64]bool
	guardo []int64
}

func (g *galeriaFalsa) ExisteEntidad(context.Context, string, int64) (bool, error) { return true, nil }
func (g *galeriaFalsa) ExisteMedio(_ context.Context, id int64) (bool, error) {
	return g.medios[id], nil
}
func (g *galeriaFalsa) GuardarGaleria(_ context.Context, _ string, _ int64, ids []int64) error {
	g.guardo = ids
	return nil
}
func (g *galeriaFalsa) ObtenerGaleria(context.Context, string, int64) ([]MedioRef, error) {
	return nil, nil
}

func TestGuardarGaleria(t *testing.T) {
	g := &galeriaFalsa{medios: map[int64]bool{1: true, 2: true, 3: true}}
	s := NewServicio(g, nuevoAlmacen(), func() fecha.Fecha { return fecha.Nueva(2026, 11, 1) }, &bitacoraFalsa{})

	if _, err := s.GuardarGaleria(ctx, EntidadSede, 1, []int64{3, 1, 2}, 1); err != nil {
		t.Fatal(err)
	}
	if len(g.guardo) != 3 || g.guardo[0] != 3 || g.guardo[2] != 2 {
		t.Fatalf("el orden elegido se pierde: %v", g.guardo)
	}

	g.guardo = nil
	for nombre, ids := range map[string][]int64{
		"repetido":            {1, 1},
		"medio inexistente":   {1, 99},
		"demasiados archivos": make([]int64, 31),
	} {
		if _, err := s.GuardarGaleria(ctx, EntidadSede, 1, ids, 1); err == nil {
			t.Errorf("%s: debió fallar", nombre)
		}
	}
	if g.guardo != nil {
		t.Fatal("una galería inválida no debe guardarse")
	}
	if _, err := s.GuardarGaleria(ctx, "usuario", 1, nil, 1); !errors.Is(err, ErrNoEncontrado) {
		t.Fatalf("entidad desconocida: %v", err)
	}
}
