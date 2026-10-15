package services

import (
	"context"
	"errors"

	"hotelerias/backend/internal/models"
	"hotelerias/backend/pkg/auth"
	"hotelerias/backend/pkg/utils"
)

// Credenciales inválidas: se devuelve como 401 genérico para no revelar si
// falló el email o la contraseña.
var ErrCredencialesInvalidas = errors.New("email o contraseña incorrectos")

// Login valida las credenciales y devuelve el token y el usuario.
func (s *Service) Login(ctx context.Context, email, password string) (string, models.Usuario, error) {
	var u models.Usuario
	var hash string
	err := s.Postgres().Pool.QueryRow(ctx,
		`SELECT u.id, u.rol_id, COALESCE(r.nombre, ''), u.nombre, u.apellido, u.email,
		        u.telefono, u.foto, u.activo, u.password_hash
		 FROM usuarios u
		 LEFT JOIN roles r ON r.id = u.rol_id
		 WHERE u.email = $1`,
		email,
	).Scan(&u.ID, &u.RolID, &u.RolNombre, &u.Nombre, &u.Apellido, &u.Email, &u.Telefono, &u.Foto, &u.Activo, &hash)
	if err != nil {
		return "", u, ErrCredencialesInvalidas
	}

	if !u.Activo {
		return "", u, ErrCredencialesInvalidas
	}
	if !utils.CheckPassword(hash, password) {
		return "", u, ErrCredencialesInvalidas
	}

	token, err := auth.GenerateToken(s.Cfg.JwtSettings, u.ID, u.Email, u.NombreCompleto(), u.RolNombre)
	if err != nil {
		return "", u, err
	}

	return token, u, nil
}

// UsuarioPorID trae un usuario con el nombre de su rol.
func (s *Service) UsuarioPorID(ctx context.Context, id int64) (models.Usuario, error) {
	var u models.Usuario
	err := s.Postgres().Pool.QueryRow(ctx,
		`SELECT u.id, u.rol_id, COALESCE(r.nombre, ''), u.nombre, u.apellido, u.email,
		        u.telefono, u.foto, u.activo
		 FROM usuarios u
		 LEFT JOIN roles r ON r.id = u.rol_id
		 WHERE u.id = $1`,
		id,
	).Scan(&u.ID, &u.RolID, &u.RolNombre, &u.Nombre, &u.Apellido, &u.Email, &u.Telefono, &u.Foto, &u.Activo)
	return u, err
}
