package main

import (
	"context"
<<<<<<< HEAD
	"errors"
	"fmt"
=======
>>>>>>> b68c3e61192092d61a613dd53006379ece524134
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"hotelerias/backend/config"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/db"
	"hotelerias/backend/internal/permiso"
	permisopg "hotelerias/backend/internal/permiso/postgres"
	"hotelerias/backend/internal/platform/cache"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/platform/migrate"
	"hotelerias/backend/internal/routes"
	"hotelerias/backend/migrations"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("error fatal: %v", err)
	}
}

// run es el composition root: el ÚNICO sitio donde se eligen las
// implementaciones concretas y se cablean. Todo lo demás depende de
// interfaces. Devuelve error en vez de log.Fatal para que los defer
// (cierre de conexiones) sí corran.
func run() error {
	cfg, err := config.LoadConfig("config.yaml")
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dbs, err := db.Connect(ctx, cfg)
	if err != nil {
		return fmt.Errorf("bases de datos: %w", err)
	}
	defer dbs.Close()

<<<<<<< HEAD
	applied, err := migrate.Up(ctx, dbs.Postgres, migrations.FS)
	if err != nil {
		return err
	}
	for _, v := range applied {
		log.Printf("migración aplicada: %s", v)
	}
=======
	// Crea las tablas y siembra el administrador inicial si no existen.
	if databases.Postgres != nil {
		if err := db.Migrar(context.Background(), databases.Postgres); err != nil {
			log.Fatalf("Failed to migrate database: %v", err)
		}
	} else {
		log.Fatal("PostgreSQL no está disponible: la API no puede arrancar")
	}

	r := gin.Default()
>>>>>>> b68c3e61192092d61a613dd53006379ece524134

	// --- Infraestructura elegida ---
	var permisosCache permiso.Cache = cache.Nop{}
	if dbs.Redis != nil {
		permisosCache = cache.NewRedis(dbs.Redis)
	}

	tokens, err := auth.NewTokens(cfg.JwtSettings)
	if err != nil {
		return err
	}

	// --- Módulo permiso ---
	store := permisopg.NewStore(dbs.Postgres)
	rolesConCache := permiso.NewCachedRoles(store, permisosCache)
	permisos := permiso.NewService(permiso.Permisos, store, rolesConCache, store)
	guard := permiso.NewGuard(permiso.Permisos, permisos, permisos)
	_ = guard // lo usarán los módulos de negocio: guard.Require("fact.notaventa", permiso.Anular)

	// --- HTTP ---
	router := httpx.NewRouter(cfg.AllowedOrigins)
	routes.Register(router, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Modules: []routes.Module{
			permiso.NewHandler(permiso.Permisos, permisos),
		},
	})

<<<<<<< HEAD
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("Server starting on %s", srv.Addr)
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Println("apagando...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
=======
	routes.SetupRoutes(r, databases, cfg)

	log.Printf("Server starting on %s", cfg.Server.Port)
	if err := r.Run(cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
>>>>>>> b68c3e61192092d61a613dd53006379ece524134
}
