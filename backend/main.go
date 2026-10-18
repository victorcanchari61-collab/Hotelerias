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

	"github.com/gin-gonic/gin"
	"hotelerias/backend/config"
	"hotelerias/backend/internal/auditoria"
	auditoriapg "hotelerias/backend/internal/auditoria/postgres"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/cliente"
	clientepg "hotelerias/backend/internal/cliente/postgres"
	"hotelerias/backend/internal/db"
	"hotelerias/backend/internal/demo"
	"hotelerias/backend/internal/empresa"
	empresapg "hotelerias/backend/internal/empresa/postgres"
	"hotelerias/backend/internal/estancia"
	estanciapg "hotelerias/backend/internal/estancia/postgres"
	"hotelerias/backend/internal/habitacion"
	habitacionpg "hotelerias/backend/internal/habitacion/postgres"
	"hotelerias/backend/internal/hotel"
	hotelpg "hotelerias/backend/internal/hotel/postgres"
	"hotelerias/backend/internal/limpieza"
	limpiezapg "hotelerias/backend/internal/limpieza/postgres"
	"hotelerias/backend/internal/moneda"
	monedapg "hotelerias/backend/internal/moneda/postgres"
	"hotelerias/backend/internal/parametro"
	parametropg "hotelerias/backend/internal/parametro/postgres"
	"hotelerias/backend/internal/permiso"
	permisopg "hotelerias/backend/internal/permiso/postgres"
	"hotelerias/backend/internal/platform/cache"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/platform/migrate"
	"hotelerias/backend/internal/portal"
	"hotelerias/backend/internal/promocion"
	promocionpg "hotelerias/backend/internal/promocion/postgres"
	"hotelerias/backend/internal/reserva"
	reservapg "hotelerias/backend/internal/reserva/postgres"
	"hotelerias/backend/internal/rol"
	rolpg "hotelerias/backend/internal/rol/postgres"
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

	// --- Bitácora: la usan los módulos de configuración para dejar constancia ---
	bitacora := auditoria.NewServicio(auditoriapg.NewStore(dbs.Postgres))

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
	gestionPermisos := permiso.NewGestion(store, permiso.Permisos, store, bitacora)

	// --- Portal de reservas ---
	if cfg.Demo.Datos {
		sembrado, err := demo.Sembrar(ctx, dbs.Postgres, hotel.Hoy())
		if err != nil {
			return fmt.Errorf("datos de muestra: %w", err)
		}
		if sembrado {
			log.Println("datos de muestra creados (Demo.Datos): sedes, habitaciones, tipos de cliente y ofertas")
		}
	}

	hoteles := hotelpg.NewStore(dbs.Postgres)
	parametroSvc := parametro.NewServicio(parametropg.NewStore(dbs.Postgres), bitacora)
	hotelSvc := hotel.NewServicio(hoteles, hotel.Hoy).ConParametros(parametroSvc)

	promoSvc := promocion.NewServicio(promocionpg.NewStore(dbs.Postgres), hotel.Hoy)

	clienteSvc, err := cliente.NewServicio(clientepg.NewStore(dbs.Postgres), hasher, tokens,
		auth.NuevoLimitador(5, 15*time.Minute))
	if err != nil {
		return err
	}

	reservaRepo := reservapg.NewStore(dbs.Postgres)
	monedaSvc := moneda.NewServicio(monedapg.NewStore(dbs.Postgres), hotel.Hoy, bitacora).ConParametros(parametroSvc)
	reservaSvc := reserva.NewServicio(reservaRepo, hoteles, promoSvc, clienteSvc, monedaSvc, hotel.Hoy).ConParametros(parametroSvc)

	portalHandler := portal.NewHandler(hotelSvc, promoSvc, clienteSvc, reservaSvc, monedaSvc, hotel.Hoy,
		auth.ClienteOpcional(tokens)).ConParametros(parametroSvc)

	// Los permisos del panel por recurso: quien los arma decide qué exige cada
	// uno. Solo se arma el guard de las acciones que ese submódulo admite; las
	// demás quedan CERRADAS (nunca "sin filtro"): una ruta que pida una acción que
	// el catálogo no tiene debe negar, no dejar pasar.
	cerrado := func(c *gin.Context) { httpx.Abort(c, http.StatusForbidden, "Acción no disponible.") }
	guardas := func(submodulo string) httpx.Guardas {
		sub, ok := permiso.Permisos.Submodulo(submodulo)
		if !ok {
			panic("main: submódulo desconocido en guardas: " + submodulo)
		}
		para := func(a permiso.Accion) gin.HandlerFunc {
			if !sub.Admite(a) {
				return cerrado
			}
			return guard.Require(submodulo, a)
		}
		return httpx.Guardas{
			Ver: para(permiso.Ver), Crear: para(permiso.Crear), Editar: para(permiso.Editar),
			Eliminar: para(permiso.Eliminar), Anular: para(permiso.Anular), Confirmar: para(permiso.Confirmar),
		}
	}

	// --- Configuración: empresa, sedes, roles, accesos y auditoría ---
	adminSedes := hotel.NewAdmin(hoteles, hotel.Hoy, bitacora)
	empresaSvc := empresa.NewServicio(empresapg.NewStore(dbs.Postgres), bitacora)
	rolSvc := rol.NewServicio(rolpg.NewStore(dbs.Postgres), permiso.Permisos, rolesConCache, bitacora)
	gestionUsuarios := usuario.NewGestion(cuentas, hasher, bitacora)

	// --- Reservas del panel, acotadas por las sedes de quien mira ---
	alcanceReservas := alcanceSedes{g: gestionPermisos, submodulo: "reservas.reservas"}
	alcanceHabitaciones := alcanceSedes{g: gestionPermisos, submodulo: "habitaciones.habitaciones"}
	habitacionSvc := habitacion.NewServicio(habitacionpg.NewStore(dbs.Postgres), hotel.Hoy, bitacora)
	alcanceRecepcion := alcanceSedes{g: gestionPermisos, submodulo: "recepcion.estancias"}
	estanciaSvc := estancia.NewServicio(estanciapg.NewStore(dbs.Postgres), hotel.Hoy, bitacora)
	alcanceLimpieza := alcanceSedes{g: gestionPermisos, submodulo: "habitaciones.housekeeping"}
	limpiezaSvc := limpieza.NewServicio(limpiezapg.NewStore(dbs.Postgres), hotel.Hoy, bitacora)

	// --- HTTP ---
	router := httpx.NewRouter(cfg.AllowedOrigins)
	routes.Register(router, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Public: []routes.Module{
			authHandler.Publico(),
			portalHandler.Publico(),
		},
		Modules: []routes.Module{
			authHandler.Privado(),
			permiso.NewHandler(permiso.Permisos, permisos),
			permiso.NewGestionHandler(gestionPermisos, guardas("config.accesos")),
			usuario.NewHandler(gestionUsuarios, guardas("config.usuarios"), auth.UsuarioID),
			rol.NewHandler(rolSvc, guardas("config.roles"), guardas("config.accesos")),
			empresa.NewHandler(empresaSvc, guardas("config.empresa")),
			parametro.NewHandler(parametroSvc, guardas("config.parametros")),
			hotel.NewAdminHandler(adminSedes, guardas("config.sedes")),
			auditoria.NewHandler(bitacora, guardas("config.auditoria"), auth.UsuarioID),
			promocion.NewHandler(promoSvc, guardas("reservas.paquetes")),
			cliente.NewAdminHandler(clienteSvc, guardas("crm.huespedes"), guardas("crm.fidelizacion")),
			moneda.NewHandler(monedaSvc, guardas("finanzas.tipocambio")),
			estancia.NewHandler(estanciaSvc, guardas("recepcion.estancias"), guardas("recepcion.fichas"), alcanceRecepcion),
			limpieza.NewHandler(limpiezaSvc, guardas("habitaciones.housekeeping"), alcanceLimpieza),
			habitacion.NewHandler(habitacionSvc, guardas("habitaciones.habitaciones"), alcanceHabitaciones),
			reserva.NewAdminHandler(reservaSvc, guardas("reservas.reservas"), alcanceReservas, bitacora),
		},
		Cliente: auth.AuthenticateCliente(tokens),
		ClienteModules: []routes.Module{
			portalHandler.ConSesion(),
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

// alcanceSedes adapta la gestión de permisos a lo que el módulo de reservas
// pregunta: "¿qué sedes alcanza a ver esta persona?". nil = todas.
type alcanceSedes struct {
	g         *permiso.Gestion
	submodulo string
}

func (a alcanceSedes) SedesVisibles(ctx context.Context, usuarioID int64) ([]int64, error) {
	f, err := a.g.Sedes(ctx, usuarioID, a.submodulo)
	if err != nil {
		return nil, err
	}
	if f.Todas {
		return nil, nil
	}
	if f.SedeIDs == nil {
		return []int64{}, nil // "mis sedes" sin ninguna asignada: no ve nada
	}
	return f.SedeIDs, nil
}
