// Package empresa son los datos de la empresa dueña de la cadena. Hay UNA con
// varias sedes (las sedes viven en hotel): se edita, no se crean más.
package empresa

import (
	"context"
	"fmt"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/httpx"
)

type Empresa struct {
	RazonSocial        string    `json:"razonSocial"`
	NombreComercial    string    `json:"nombreComercial"`
	Ruc                string    `json:"ruc"`
	Direccion          string    `json:"direccion"`
	Departamento       string    `json:"departamento"`
	Provincia          string    `json:"provincia"`
	Distrito           string    `json:"distrito"`
	Telefono           string    `json:"telefono"`
	Email              string    `json:"email"`
	SitioWeb           string    `json:"sitioWeb"`
	RepresentanteLegal string    `json:"representanteLegal"`
	ActualizadoEn      time.Time `json:"actualizadoEn"`
}

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	Obtener(ctx context.Context) (Empresa, error)
	Guardar(ctx context.Context, e Empresa) error
}

var reRUC = regexp.MustCompile(`^\d{11}$`)

type Servicio struct {
	repo      Repositorio
	auditoria auditoria.Registrador
}

func NewServicio(repo Repositorio, aud auditoria.Registrador) *Servicio {
	return &Servicio{repo: repo, auditoria: aud}
}

func (s *Servicio) Obtener(ctx context.Context) (Empresa, error) { return s.repo.Obtener(ctx) }

func normalizar(e *Empresa) error {
	for _, campo := range []*string{
		&e.RazonSocial, &e.NombreComercial, &e.Ruc, &e.Direccion, &e.Departamento, &e.Provincia,
		&e.Distrito, &e.Telefono, &e.Email, &e.SitioWeb, &e.RepresentanteLegal,
	} {
		*campo = strings.TrimSpace(*campo)
	}

	if e.NombreComercial == "" {
		return httpx.Validacion("El nombre comercial es obligatorio")
	}
	// El RUC es opcional mientras se arma la empresa, pero si está, debe ser un RUC.
	if e.Ruc != "" && !reRUC.MatchString(e.Ruc) {
		return httpx.Validacion("El RUC debe tener 11 dígitos")
	}
	if e.Email != "" {
		if a, err := mail.ParseAddress(e.Email); err != nil || a.Name != "" {
			return httpx.Validacion("El correo de la empresa no es válido")
		}
	}
	// Sin esquema, el navegador lo trata como una ruta relativa de nuestro propio sitio.
	if w := strings.ToLower(e.SitioWeb); w != "" && !strings.HasPrefix(w, "http://") && !strings.HasPrefix(w, "https://") {
		e.SitioWeb = "https://" + e.SitioWeb
	}
	return nil
}

func (s *Servicio) campos(e Empresa) map[string]any {
	return map[string]any{
		"razonSocial": e.RazonSocial, "nombreComercial": e.NombreComercial, "ruc": e.Ruc,
		"direccion": e.Direccion, "departamento": e.Departamento, "provincia": e.Provincia,
		"distrito": e.Distrito, "telefono": e.Telefono, "email": e.Email, "sitioWeb": e.SitioWeb,
		"representanteLegal": e.RepresentanteLegal,
	}
}

func (s *Servicio) Guardar(ctx context.Context, e Empresa, actor int64) (Empresa, error) {
	if err := normalizar(&e); err != nil {
		return Empresa{}, err
	}
	actual, err := s.repo.Obtener(ctx)
	if err != nil {
		return Empresa{}, err
	}
	if err := s.repo.Guardar(ctx, e); err != nil {
		return Empresa{}, err
	}

	antes, despues := auditoria.Diferencia(s.campos(actual), s.campos(e))
	if len(despues) > 0 {
		s.auditoria.Registrar(ctx, auditoria.Evento{
			UsuarioID: actor, Entidad: "Empresa", EntidadID: fmt.Sprint(1), Accion: auditoria.Actualizado,
			Antes: antes, Despues: despues,
		})
	}
	return s.repo.Obtener(ctx)
}
