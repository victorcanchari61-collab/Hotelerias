package httpx

import "github.com/gin-gonic/gin"

// NewRouter arma el engine con lo transversal ya puesto. Las rutas de negocio
// las agrega quien lo llama.
func NewRouter(allowedOrigins []string) *gin.Engine {
	r := gin.New()
	// Sin proxy delante, X-Forwarded-For lo puede falsificar cualquiera. Si se
	// publica detrás de Nginx, se declara aquí su IP.
	_ = r.SetTrustedProxies(nil)
	r.Use(gin.Logger(), Recovery(), CORS(allowedOrigins), ErrorMiddleware())
	return r
}
