package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/models"
	"hotelerias/backend/pkg/utils"
)

// extensiones permitidas para el logo.
var extensionesLogo = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".svg": true,
}

// ObtenerEmpresa devuelve los datos de la empresa.
func (h *Handlers) ObtenerEmpresa(c *gin.Context) {
	e, err := h.Svc.ObtenerEmpresa(c.Request.Context())
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "No se pudo leer la empresa")
		return
	}
	utils.Ok(c, e)
}

// ActualizarEmpresa guarda los datos de la empresa.
func (h *Handlers) ActualizarEmpresa(c *gin.Context) {
	var e models.Empresa
	if err := c.ShouldBindJSON(&e); err != nil {
		utils.Error(c, http.StatusBadRequest, "Datos inválidos")
		return
	}

	out, err := h.Svc.ActualizarEmpresa(c.Request.Context(), e)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "No se pudo guardar la empresa")
		return
	}
	utils.Ok(c, out)
}

// SubirLogo recibe el archivo del logo y guarda su ruta.
func (h *Handlers) SubirLogo(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "No se recibió ningún archivo")
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !extensionesLogo[ext] {
		utils.Error(c, http.StatusBadRequest, "Formato no permitido (usa PNG, JPG, WEBP o SVG)")
		return
	}
	if file.Size > 5<<20 { // 5 MB
		utils.Error(c, http.StatusBadRequest, "El archivo supera los 5 MB")
		return
	}

	dir := h.Svc.Cfg.Server.UploadsDir
	if err := os.MkdirAll(dir, 0o755); err != nil {
		utils.Error(c, http.StatusInternalServerError, "No se pudo preparar el almacenamiento")
		return
	}

	nombre := fmt.Sprintf("logo-%d%s", time.Now().UnixNano(), ext)
	ruta := filepath.Join(dir, nombre)
	if err := c.SaveUploadedFile(file, ruta); err != nil {
		utils.Error(c, http.StatusInternalServerError, "No se pudo guardar el archivo")
		return
	}

	relativa := filepath.ToSlash(filepath.Join(dir, nombre))
	if err := h.Svc.ActualizarLogoEmpresa(c.Request.Context(), relativa); err != nil {
		utils.Error(c, http.StatusInternalServerError, "No se pudo registrar el logo")
		return
	}

	utils.Ok(c, gin.H{"logo": relativa})
}
