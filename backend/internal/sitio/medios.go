package sitio

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"image"
	_ "image/gif" // registra el decodificador para leer el tamaño
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/httpx"
)

// Tope por archivo. Un video de muestra pesa decenas de MB; una foto web, pocos.
const (
	MaxImagen int64 = 8 << 20
	MaxVideo  int64 = 60 << 20
)

// ErrDemasiadoGrande lo da el almacén cuando el archivo pasa del tope.
var ErrDemasiadoGrande = errors.New("sitio: archivo demasiado grande")

// formatos que se aceptan, por lo que el archivo ES (su contenido), nunca por su nombre.
// SVG queda fuera a propósito: un SVG puede llevar scripts.
var formatos = map[string]struct{ tipo, ext string }{
	"image/jpeg": {"imagen", ".jpg"},
	"image/png":  {"imagen", ".png"},
	"image/gif":  {"imagen", ".gif"},
	"image/webp": {"imagen", ".webp"},
	"video/mp4":  {"video", ".mp4"},
	"video/webm": {"video", ".webm"},
}

func nombreAlAzar(ext string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b) + ext, nil
}

// nombreVisible deja un nombre original apto para mostrar: sin carpetas ni caracteres de control.
func nombreVisible(n string) string {
	n = filepath.Base(strings.ReplaceAll(n, "\\", "/"))
	n = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, n)
	r := []rune(strings.TrimSpace(n))
	if len(r) > 120 {
		r = r[:120]
	}
	if len(r) == 0 {
		return "archivo"
	}
	return string(r)
}

// sniffear dice qué es el archivo mirando sus primeros bytes. MP4 y WebM los reconoce
// http.DetectContentType; WebP también (RIFF....WEBP).
func sniffear(cabecera []byte) (mime string, ok bool) {
	m := http.DetectContentType(cabecera)
	if i := strings.IndexByte(m, ';'); i >= 0 {
		m = m[:i]
	}
	// La biblioteca estándar solo reconoce un MP4 cuya marca empieza con «mp4»; muchos videos
	// de verdad (celulares, editores) declaran «isom», «iso2» o «avc1». Se lee la caja «ftyp».
	if m == "application/octet-stream" && esMP4(cabecera) {
		m = "video/mp4"
	}
	_, ok = formatos[m]
	return m, ok
}

// marcasMP4 son las marcas principales (los 4 bytes tras «ftyp») de los MP4 de video.
var marcasMP4 = map[string]bool{
	"isom": true, "iso2": true, "iso4": true, "iso5": true, "iso6": true,
	"mp41": true, "mp42": true, "avc1": true, "dash": true, "M4V ": true,
}

func esMP4(b []byte) bool {
	return len(b) >= 12 && string(b[4:8]) == "ftyp" && marcasMP4[string(b[8:12])]
}

// Subir guarda un archivo en la biblioteca. Valida su contenido y su tamaño; el nombre que
// trae solo se guarda para mostrarlo.
func (s *Servicio) Subir(ctx context.Context, nombre string, r io.Reader, actor int64) (Medio, error) {
	cabecera := make([]byte, 512)
	n, err := io.ReadFull(r, cabecera)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return Medio{}, err
	}
	cabecera = cabecera[:n]
	if n == 0 {
		return Medio{}, httpx.Validacion("El archivo está vacío")
	}

	mime, ok := sniffear(cabecera)
	if !ok {
		return Medio{}, httpx.Validacion("Ese formato no se acepta. Sube una foto (JPG, PNG, WebP o GIF) o un video (MP4 o WebM)")
	}
	f := formatos[mime]
	max := MaxImagen
	if f.tipo == "video" {
		max = MaxVideo
	}

	archivo, err := nombreAlAzar(f.ext)
	if err != nil {
		return Medio{}, err
	}
	bytesEscritos, err := s.almacen.Guardar(archivo, io.MultiReader(bytes.NewReader(cabecera), r), max)
	if errors.Is(err, ErrDemasiadoGrande) {
		return Medio{}, httpx.Validacion("El archivo es demasiado grande: " + limiteTexto(f.tipo, max))
	}
	if err != nil {
		return Medio{}, err
	}

	// El tamaño de la imagen, para que la página reserve su espacio sin saltos. WebP y video: no se lee.
	var ancho, alto *int
	if f.tipo == "imagen" {
		if rd, err := s.almacen.Abrir(archivo); err == nil {
			if cfg, _, err := image.DecodeConfig(rd); err == nil {
				a, h := cfg.Width, cfg.Height
				ancho, alto = &a, &h
			}
			_ = rd.Close()
		}
	}

	id, err := s.repo.CrearMedio(ctx, NuevoMedio{
		Tipo: f.tipo, Archivo: archivo, NombreOriginal: nombreVisible(nombre), Mime: mime,
		Bytes: bytesEscritos, Ancho: ancho, Alto: alto, CreadoPor: actor,
	})
	if err != nil {
		_ = s.almacen.Borrar(archivo) // no dejar un archivo huérfano
		return Medio{}, err
	}
	m, err := s.repo.ObtenerMedio(ctx, id)
	if err != nil {
		return Medio{}, err
	}
	s.registrar(ctx, actor, "Medio", id, auditoria.Creado, nil, map[string]any{"tipo": f.tipo, "nombre": m.NombreOriginal, "bytes": bytesEscritos})
	return m, nil
}

func limiteTexto(tipo string, max int64) string {
	if tipo == "video" {
		return "los videos pueden pesar hasta " + mb(max)
	}
	return "las fotos pueden pesar hasta " + mb(max)
}

func mb(b int64) string { return itoa(int(b>>20)) + " MB" }

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var d []byte
	for ; n > 0; n /= 10 {
		d = append([]byte{byte('0' + n%10)}, d...)
	}
	return string(d)
}

func (s *Servicio) Medios(ctx context.Context, tipo string, limite int) ([]Medio, error) {
	if tipo != "" && tipo != "imagen" && tipo != "video" {
		return nil, httpx.Validacion("Tipo de archivo no válido")
	}
	if limite < 1 || limite > 500 {
		limite = 200
	}
	return s.repo.ListarMedios(ctx, tipo, limite)
}

// ActualizarMedio cambia el texto alternativo: lo que lee un lector de pantalla y se ve si la imagen no carga.
func (s *Servicio) ActualizarMedio(ctx context.Context, id int64, descripcion string, actor int64) (Medio, error) {
	d, err := texto("Descripción", descripcion, 200, false)
	if err != nil {
		return Medio{}, err
	}
	antes, err := s.repo.ObtenerMedio(ctx, id)
	if err != nil {
		return Medio{}, err
	}
	if err := s.repo.ActualizarMedio(ctx, id, d); err != nil {
		return Medio{}, err
	}
	if antes.Descripcion != d {
		s.registrar(ctx, actor, "Medio", id, auditoria.Actualizado,
			map[string]any{"descripción": antes.Descripcion}, map[string]any{"descripción": d})
	}
	return s.repo.ObtenerMedio(ctx, id)
}

// EliminarMedio borra el archivo de la biblioteca y del disco. Si algo lo usa, no: dice dónde.
func (s *Servicio) EliminarMedio(ctx context.Context, id int64, actor int64) error {
	m, err := s.repo.ObtenerMedio(ctx, id)
	if err != nil {
		return err
	}
	usos, err := s.repo.UsosDeMedio(ctx, id)
	if err != nil {
		return err
	}
	if len(usos) > 0 {
		return httpx.Conflicto("No se puede borrar: se usa en " + strings.Join(usos, ", "))
	}
	archivo, err := s.repo.EliminarMedio(ctx, id)
	var enUso ErrEnUso
	if errors.As(err, &enUso) {
		return httpx.Conflicto("No se puede borrar: se usa en " + strings.Join(enUso.Usos, ", "))
	}
	if err != nil {
		return err
	}
	_ = s.almacen.Borrar(archivo) // si el disco falla, queda un archivo suelto, no un dato roto
	s.registrar(ctx, actor, "Medio", id, auditoria.Eliminado, map[string]any{"tipo": m.Tipo, "nombre": m.NombreOriginal}, nil)
	return nil
}
