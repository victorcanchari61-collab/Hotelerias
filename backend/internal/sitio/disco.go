package sitio

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

// Disco guarda los archivos subidos en una carpeta.
type Disco struct{ Dir string }

// reArchivo: lo único que existe en la carpeta es lo que subimos nosotros: 32 hex y una extensión
// conocida. Cualquier otro nombre (rutas con .., absolutas, ocultas) es rechazado antes de tocar el disco.
var reArchivo = regexp.MustCompile(`^[a-f0-9]{32}\.(jpg|png|gif|webp|mp4|webm)$`)

func (d Disco) ruta(archivo string) (string, error) {
	if !reArchivo.MatchString(archivo) {
		return "", fmt.Errorf("sitio: nombre de archivo no válido")
	}
	return filepath.Join(d.Dir, archivo), nil
}

func (d Disco) Guardar(archivo string, r io.Reader, max int64) (int64, error) {
	ruta, err := d.ruta(archivo)
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(d.Dir, 0o755); err != nil {
		return 0, err
	}
	f, err := os.OpenFile(ruta, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(f, io.LimitReader(r, max+1))
	cerrar := f.Close()
	switch {
	case err != nil:
		_ = os.Remove(ruta)
		return 0, err
	case cerrar != nil:
		_ = os.Remove(ruta)
		return 0, cerrar
	case n > max:
		_ = os.Remove(ruta)
		return 0, ErrDemasiadoGrande
	}
	return n, nil
}

func (d Disco) Abrir(archivo string) (io.ReadCloser, error) {
	ruta, err := d.ruta(archivo)
	if err != nil {
		return nil, err
	}
	return os.Open(ruta)
}

func (d Disco) Borrar(archivo string) error {
	ruta, err := d.ruta(archivo)
	if err != nil {
		return err
	}
	if err := os.Remove(ruta); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// Servir entrega un archivo de la biblioteca en GET /uploads/sitio/:archivo.
//
// El nombre se valida con una lista cerrada; el tipo de contenido sale de la extensión que
// pusimos nosotros (nunca de lo que diga el cliente); y `nosniff` impide que el navegador lo
// reinterprete. El nombre es único (al azar) y nunca cambia, así que se puede cachear por un año.
// http.ServeFile atiende «Range», que los videos necesitan para poder saltar a un punto.
func Servir(dir string) gin.HandlerFunc {
	d := Disco{Dir: dir}
	return func(c *gin.Context) {
		archivo := c.Param("archivo")
		ruta, err := d.ruta(archivo)
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		if _, err := os.Stat(ruta); err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
		h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
		h.Set("Content-Disposition", "inline")
		h.Set("Content-Type", tipoPorExtension(archivo))
		http.ServeFile(c.Writer, c.Request, ruta)
	}
}

func tipoPorExtension(archivo string) string {
	switch strings.ToLower(filepath.Ext(archivo)) {
	case ".jpg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	}
	return "application/octet-stream"
}
