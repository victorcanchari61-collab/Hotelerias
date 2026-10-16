package main

import (
	"context"
	"errors"
	"fmt"
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
	"hotelerias/backend/internal/usuario"
	usuariopg "hotelerias/backend/internal/usuario/postgres"
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

	applied, err := migrate.Up(ctx, dbs.Postgres, migrations.FS)
	if err != nil {
		return err
	}
	for _, v := range applied {
		log.Printf("migración aplicada: %s", v)
	}

	// --- Infraestructura elegida ---
	var permisosCache permiso.Cache = cache.Nop{}
	if dbs.Redis != nil {
		permisosCache = cache.NewRedis(dbs.Redis)
	}

	tokens, err := auth.NewTokens(cfg.JwtSettings)
	if err != nil {
		return err
	}

	// --- Módulo usuario y auth ---
	cuentas := usuariopg.NewStore(dbs.Postgres)
	hasher := auth.NewBcrypt()

	// El administrador inicial sale de la config; sin contraseña no se crea y
	// no hay ninguna por defecto en el código.
	creado, err := usuario.AsegurarAdministrador(ctx, cuentas, hasher, usuario.Inicial{
		Email:    cfg.AdminInicial.Email,
		Nombre:   cfg.AdminInicial.Nombre,
		Password: cfg.AdminInicial.Password,
	})
	if err != nil {
		return err
	}
	switch {
	case creado:
		log.Printf("administrador inicial creado: %s", cfg.AdminInicial.Email)
	case cfg.AdminInicial.Password == "":
		log.Println("aviso: AdminInicial.Password vacío; si no hay usuarios, nadie podrá entrar " +
			"(defínelo en .env como ADMININICIAL_PASSWORD)")
	}

	// 5 fallos seguidos por origen+correo bloquean 15 minutos.
	authSvc, err := auth.NewServicio(cuentas, hasher, tokens, auth.NuevoLimitador(5, 15*time.Minute))
	if err != nil {
		return err
	}
	authHandler := auth.NewHandler(authSvc)

	// --- Módulo permiso ---
	store := permisopg.NewStore(dbs.Postgres)
	rolesConCache := permiso.NewCachedRoles(store, permisosCache)
	permisos := permiso.NewService(permiso.Permisos, store, rolesConCache, store)
	guard := permiso.NewGuard(permiso.Permisos, permisos, permisos)

	// --- HTTP ---
	router := httpx.NewRouter(cfg.AllowedOrigins)
	routes.Register(router, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Public: []routes.Module{
			authHandler.Publico(),
		},
		Modules: []routes.Module{
			authHandler.Privado(),
			permiso.NewHandler(permiso.Permisos, permisos),
			usuario.NewHandler(cuentas, guard.Require("config.usuarios", permiso.Ver)),
		},
	})

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
}
