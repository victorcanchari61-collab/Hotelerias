package routes

import (
	"github.com/gin-gonic/gin"
	"hotelerias/backend/config"
	"hotelerias/backend/internal/db"
)

func SetupRoutes(r *gin.Engine, databases *db.Databases, cfg *config.Config) {
	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"status": "ok",
				"message": "Hoteleria API is running",
			})
		})
	}
}