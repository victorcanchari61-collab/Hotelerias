package main

import (
	"context"
	"log"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/config"
	"hotelerias/backend/internal/db"
	"hotelerias/backend/internal/routes"
)

func main() {
	cfg, err := config.LoadConfig("config.yaml")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	databases, err := db.NewDatabases(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to databases: %v", err)
	}
	defer databases.Close()

	// Crea las tablas y siembra el administrador inicial si no existen.
	if databases.Postgres != nil {
		if err := db.Migrar(context.Background(), databases.Postgres); err != nil {
			log.Fatalf("Failed to migrate database: %v", err)
		}
	} else {
		log.Fatal("PostgreSQL no está disponible: la API no puede arrancar")
	}

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	routes.SetupRoutes(r, databases, cfg)

	log.Printf("Server starting on %s", cfg.Server.Port)
	if err := r.Run(cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
