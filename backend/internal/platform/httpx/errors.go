// Package httpx concentra lo transversal de HTTP: la forma de los errores, el
// manejo de pánicos y CORS. Los handlers de los módulos no arman JSON de error
// a mano: devuelven un *Error (o cualquier error) y este paquete lo traduce.
package httpx

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Problem es el cuerpo de todo error de la API. Es la misma forma que ya lee
// el frontend en apiClient.ts: statusCode, message, errors.
type Problem struct {
	StatusCode int      `json:"statusCode"`
	Message    string   `json:"message"`
	Errors     []string `json:"errors,omitempty"`
}

// Error es un error de negocio con el status HTTP que le corresponde.
type Error struct {
	Status  int
	Message string
	Errors  []string
}

func (e *Error) Error() string { return e.Message }

func BadRequest(msg string, errs ...string) *Error {
	return &Error{Status: http.StatusBadRequest, Message: msg, Errors: errs}
}
func Unauthorized(msg string) *Error { return &Error{Status: http.StatusUnauthorized, Message: msg} }
func Forbidden(msg string) *Error    { return &Error{Status: http.StatusForbidden, Message: msg} }
func NotFound(msg string) *Error     { return &Error{Status: http.StatusNotFound, Message: msg} }
func Conflict(msg string) *Error     { return &Error{Status: http.StatusConflict, Message: msg} }
func TooManyRequests(msg string) *Error {
	return &Error{Status: http.StatusTooManyRequests, Message: msg}
}

// Abort corta la petición con un Problem. Para los middlewares, que no pueden
// "devolver" un error.
func Abort(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, Problem{StatusCode: status, Message: msg})
}

// ErrorMiddleware convierte en respuesta el último error que un handler dejó
// con c.Error(err). Un *Error conserva su status; cualquier otro es un 500 que
// se registra pero cuyo detalle no se le muestra al cliente.
func ErrorMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		if c.Writer.Written() || len(c.Errors) == 0 {
			return
		}

		err := c.Errors.Last().Err
		var he *Error
		if errors.As(err, &he) {
			c.JSON(he.Status, Problem{StatusCode: he.Status, Message: he.Message, Errors: he.Errors})
			return
		}

		log.Printf("error no controlado en %s %s: %v", c.Request.Method, c.Request.URL.Path, err)
		c.JSON(http.StatusInternalServerError, Problem{
			StatusCode: http.StatusInternalServerError,
			Message:    "Ocurrió un error interno. Intenta de nuevo.",
		})
	}
}

// Recovery atrapa pánicos y responde con el mismo formato que el resto.
func Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		log.Printf("pánico en %s %s: %v", c.Request.Method, c.Request.URL.Path, recovered)
		Abort(c, http.StatusInternalServerError, "Ocurrió un error interno. Intenta de nuevo.")
	})
}
