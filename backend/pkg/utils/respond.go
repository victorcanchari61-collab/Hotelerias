package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ErrorBody es la forma de error que espera el apiClient del frontend.
type ErrorBody struct {
	StatusCode int      `json:"statusCode"`
	Message    string   `json:"message"`
	Errors     []string `json:"errors,omitempty"`
}

// Ok responde 200 con el cuerpo JSON dado.
func Ok(c *gin.Context, data any) {
	c.JSON(http.StatusOK, data)
}

// Creado responde 201 con el cuerpo JSON dado.
func Creado(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, data)
}

// Error responde con el código y el mensaje en la forma que entiende el frontend.
func Error(c *gin.Context, status int, message string) {
	c.JSON(status, ErrorBody{StatusCode: status, Message: message})
}

// ErrorConDetalles incluye la lista de errores de validación.
func ErrorConDetalles(c *gin.Context, status int, message string, details []string) {
	c.JSON(status, ErrorBody{StatusCode: status, Message: message, Errors: details})
}
