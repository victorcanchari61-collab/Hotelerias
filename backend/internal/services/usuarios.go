package services

import (
	"context"
	"errors"

	"hotelerias/backend/internal/models"
	"hotelerias/backend/pkg/utils"
)

// ErrEmailDuplicado se devuelve cuando el email ya pertenece a otro usuario.
var ErrEmailDuplicado = errors.New("ya existe un usuario con ese correo")

// ListarUsuarios devuelve todos los usuarios con el nombre de su rol.
func (s *Service) ListarUsuarios(ctx context.Context) ([]models.Usuario, error) {
	rows, err := s.Postgres().Pool.Query(ctx,
		`SELECT u.id, u.rol_id, COALESCE(r.nombre, ''), u.nombre, u.apellido, u.email,
		        u.telefono, u.foto, u.activo, u.creado_en
		 FROM usuarios u
		 LEFT JOIN roles r ON r.id = u.rol_id
		 ORDER BY u.nombre, u.apellido`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.Usuario
	for rows.Next() {
		var u models.Usuario
		if err := rows.Scan(&u.ID, &u.RolID, &u.RolNombre, &u.Nombre, &u.Apellido, &u.Email, &u.Telefono, &u.Foto, &u.Activo, &u.CreadoEn); err != nil {
			return nil, err
		}
		list = append(list, u)
	}
	return list, rows.Err()
}

// CrearUsuario crea un usuario. Si password viene vacío se rechaza.
func (s *Service) CrearUsuario(ctx context.Context, input UsuarioInput) (models.Usuario, error) {
	if input.Email == "" || input.Nombre == "" {
		return models.Usuario{}, errors.New("nombre y correo son obligatorios")
	}
	if input.Password == "" {
		return models.Usuario{}, errors.New("la contraseña es obligatoria")
	}

	hash, err := utils.HashPassword(input.Password)
	if err != nil {
		return models.Usuario{}, err
	}

	var u models.Usuario
	err = s.Postgres().Pool.QueryRow(ctx,
		`INSERT INTO usuarios (rol_id, nombre, apellido, email, password_hash, telefono, foto)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, rol_id, nombre, apellido, email, telefono, foto, activo`,
		input.RolID, input.Nombre, input.Apellido, input.Email, hash, input.Telefono, input.Foto,
	).Scan(&u.ID, &u.RolID, &u.Nombre, &u.Apellido, &u.Email, &u.Telefono, &u.Foto, &u.Activo)
	if err != nil {
		if esViolacionUnica(err) {
			return models.Usuario{}, ErrEmailDuplicado
		}
		return models.Usuario{}, err
	}
	return u, nil
}

// ActualizarUsuario modifica datos y, opcionalmente, la contraseña.
func (s *Service) ActualizarUsuario(ctx context.Context, id int64, input UsuarioInput) (models.Usuario, error) {
	if input.Email == "" || input.Nombre == "" {
		return models.Usuario{}, errors.New("nombre y correo son obligatorios")
	}

	// Si viene contraseña nueva, se re-hashea.
	if input.Password != "" {
		hash, err := utils.HashPassword(input.Password)
		if err != nil {
			return models.Usuario{}, err
		}
		var u models.Usuario
		err = s.Postgres().Pool.QueryRow(ctx,
			`UPDATE usuarios SET rol_id = $1, nombre = $2, apellido = $3, email = $4,
			        password_hash = $5, telefono = $6, foto = $7, actualizado_en = now()
			 WHERE id = $8
			 RETURNING id, rol_id, nombre, apellido, email, telefono, foto, activo`,
			input.RolID, input.Nombre, input.Apellido, input.Email, hash, input.Telefono, input.Foto, id,
		).Scan(&u.ID, &u.RolID, &u.Nombre, &u.Apellido, &u.Email, &u.Telefono, &u.Foto, &u.Activo)
		if err != nil {
			if esViolacionUnica(err) {
				return models.Usuario{}, ErrEmailDuplicado
			}
			return models.Usuario{}, err
		}
		return u, nil
	}

	var u models.Usuario
	err := s.Postgres().Pool.QueryRow(ctx,
		`UPDATE usuarios SET rol_id = $1, nombre = $2, apellido = $3, email = $4,
		        telefono = $5, foto = $6, actualizado_en = now()
		 WHERE id = $7
		 RETURNING id, rol_id, nombre, apellido, email, telefono, foto, activo`,
		input.RolID, input.Nombre, input.Apellido, input.Email, input.Telefono, input.Foto, id,
	).Scan(&u.ID, &u.RolID, &u.Nombre, &u.Apellido, &u.Email, &u.Telefono, &u.Foto, &u.Activo)
	if err != nil {
		if esViolacionUnica(err) {
			return models.Usuario{}, ErrEmailDuplicado
		}
		return models.Usuario{}, err
	}
	return u, nil
}

// CambiarEstado activa o desactiva un usuario (baja lógica).
func (s *Service) CambiarEstado(ctx context.Context, id int64, activo bool) error {
	_, err := s.Postgres().Pool.Exec(ctx,
		`UPDATE usuarios SET activo = $1, actualizado_en = now() WHERE id = $2`,
		activo, id,
	)
	return err
}

// EliminarUsuario borra físicamente. No se puede borrar al administrador de
// sistema ni al usuario autenticado.
func (s *Service) EliminarUsuario(ctx context.Context, id int64, quien int64) error {
	if id == quien {
		return errors.New("no puedes eliminar tu propio usuario")
	}
	// Proteger al último administrador: si es el usuario de sistema (email
	// admin) no se elimina. La regla simple: no borrar si es el único activo
	// con rol Administrador. Se mantiene acotado al email sembrado.
	var esAdminSistema bool
	_ = s.Postgres().Pool.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
		   WHERE u.id = $1 AND r.es_sistema
		 )`, id,
	).Scan(&esAdminSistema)
	if esAdminSistema {
		return errors.New("el administrador del sistema no se puede eliminar")
	}

	_, err := s.Postgres().Pool.Exec(ctx, `DELETE FROM usuarios WHERE id = $1`, id)
	return err
}

// UsuarioInput es lo que llega del formulario de creación/edición.
type UsuarioInput struct {
	RolID    *int64 `json:"rolId"`
	Nombre   string `json:"nombre"`
	Apellido string `json:"apellido"`
	Email    string `json:"email"`
	Telefono string `json:"telefono"`
	Foto     string `json:"foto"`
	Password string `json:"password"`
}
