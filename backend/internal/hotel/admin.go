package hotel

import (
	"context"
	"fmt"
	"strings"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

// ImagenesValidas son las claves de ilustración que la web sabe pintar (ver
// Visual.tsx en el frontend). Una clave desconocida no rompe nada, pero
// dejaría la sede con la imagen por defecto sin que nadie lo notara.
var ImagenesValidas = []string{"ciudad", "andino", "colonial", "costa"}

// SedeAdmin es una sede tal como la ve el personal: activa o no, con sus cuentas.
type SedeAdmin struct {
	Sede
	Habitaciones     int `json:"habitaciones"`
	ReservasVigentes int `json:"reservasVigentes"`
}

// SedeInput es lo que se envía al crear o editar una sede.
type SedeInput struct {
	Nombre      string   `json:"nombre"`
	Ciudad      string   `json:"ciudad"`
	Direccion   string   `json:"direccion"`
	Descripcion string   `json:"descripcion"`
	Estrellas   int      `json:"estrellas"`
	Imagen      string   `json:"imagen"`
	Servicios   []string `json:"servicios"`
	Activo      bool     `json:"activo"`
}

// AdminRepositorio es lo que la gestión de sedes necesita de la base.
type AdminRepositorio interface {
	TodasLasSedes(ctx context.Context, desde fecha.Fecha) ([]SedeAdmin, error)
	SedeAdmin(ctx context.Context, id int64, desde fecha.Fecha) (SedeAdmin, error)
	CrearSede(ctx context.Context, in SedeInput) (int64, error)
	ActualizarSede(ctx context.Context, id int64, in SedeInput) error
	// ReservasVigentes cuenta las confirmadas que todavía no terminaron.
	ReservasVigentes(ctx context.Context, sedeID int64, desde fecha.Fecha) (int, error)
}

// Admin es la gestión de sedes del personal. Las sedes no se borran (tienen
// reservas y habitaciones detrás): se desactivan.
type Admin struct {
	repo      AdminRepositorio
	hoy       func() fecha.Fecha
	auditoria auditoria.Registrador
}

func NewAdmin(repo AdminRepositorio, hoy func() fecha.Fecha, aud auditoria.Registrador) *Admin {
	return &Admin{repo: repo, hoy: hoy, auditoria: aud}
}

func (a *Admin) Listar(ctx context.Context) ([]SedeAdmin, error) {
	return a.repo.TodasLasSedes(ctx, a.hoy())
}

func normalizarSede(in *SedeInput) error {
	in.Nombre = strings.TrimSpace(in.Nombre)
	in.Ciudad = strings.TrimSpace(in.Ciudad)
	in.Direccion = strings.TrimSpace(in.Direccion)
	in.Descripcion = strings.TrimSpace(in.Descripcion)
	in.Imagen = strings.TrimSpace(in.Imagen)

	switch {
	case in.Nombre == "":
		return httpx.Validacion("Ponle un nombre a la sede")
	case in.Ciudad == "":
		return httpx.Validacion("Indica la ciudad")
	case in.Estrellas < 1 || in.Estrellas > 5:
		return httpx.Validacion("Las estrellas van de 1 a 5")
	}
	if in.Imagen != "" {
		ok := false
		for _, v := range ImagenesValidas {
			ok = ok || v == in.Imagen
		}
		if !ok {
			return httpx.Validacion("La ilustración debe ser una de: " + strings.Join(ImagenesValidas, ", "))
		}
	}

	// Servicios: sin vacíos ni repetidos, y con tope (es una lista de etiquetas, no un documento).
	vistos := map[string]bool{}
	limpios := make([]string, 0, len(in.Servicios))
	for _, s := range in.Servicios {
		s = strings.TrimSpace(s)
		clave := strings.ToLower(s)
		if s == "" || vistos[clave] {
			continue
		}
		vistos[clave] = true
		limpios = append(limpios, s)
	}
	if len(limpios) > 20 {
		return httpx.Validacion("Una sede puede listar hasta 20 servicios")
	}
	in.Servicios = limpios
	return nil
}

func camposSede(s Sede) map[string]any {
	servicios := s.Servicios
	if servicios == nil {
		servicios = []string{}
	}
	return map[string]any{
		"nombre": s.Nombre, "ciudad": s.Ciudad, "direccion": s.Direccion, "descripcion": s.Descripcion,
		"estrellas": s.Estrellas, "imagen": s.Imagen, "servicios": servicios, "activo": s.Activo,
	}
}

func (a *Admin) Crear(ctx context.Context, in SedeInput, actor int64) (SedeAdmin, error) {
	if err := normalizarSede(&in); err != nil {
		return SedeAdmin{}, err
	}
	id, err := a.repo.CrearSede(ctx, in)
	if err != nil {
		return SedeAdmin{}, err
	}
	creada, err := a.repo.SedeAdmin(ctx, id, a.hoy())
	if err != nil {
		return SedeAdmin{}, err
	}
	a.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Sede", EntidadID: fmt.Sprint(id), Accion: auditoria.Creado,
		Despues: camposSede(creada.Sede),
	})
	return creada, nil
}

func (a *Admin) Actualizar(ctx context.Context, id int64, in SedeInput, actor int64) (SedeAdmin, error) {
	if err := normalizarSede(&in); err != nil {
		return SedeAdmin{}, err
	}
	actual, err := a.repo.SedeAdmin(ctx, id, a.hoy())
	if err != nil {
		return SedeAdmin{}, err
	}

	// Desactivar una sede la saca de la web: con reservas por cumplirse dejaría
	// huéspedes con una reserva en un hotel que ya no aparece en ningún lado.
	if actual.Activo && !in.Activo && actual.ReservasVigentes > 0 {
		return SedeAdmin{}, httpx.Conflicto(fmt.Sprintf(
			"La sede tiene %d reserva(s) vigente(s). Cancélalas o espera a que terminen antes de desactivarla",
			actual.ReservasVigentes))
	}

	if err := a.repo.ActualizarSede(ctx, id, in); err != nil {
		return SedeAdmin{}, err
	}
	nueva, err := a.repo.SedeAdmin(ctx, id, a.hoy())
	if err != nil {
		return SedeAdmin{}, err
	}

	antes, despues := auditoria.Diferencia(camposSede(actual.Sede), camposSede(nueva.Sede))
	if len(despues) > 0 {
		a.auditoria.Registrar(ctx, auditoria.Evento{
			UsuarioID: actor, Entidad: "Sede", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
			Antes: antes, Despues: despues,
		})
	}
	return nueva, nil
}
