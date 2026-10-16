// Package auth emite y valida los JWT y expone quién hace la petición.
//
// Es a propósito mínimo: el token solo dice QUIÉN es (claim "sub") y DE QUÉ
// TIPO de cuenta ("typ"). Qué puede hacer se resuelve contra la base en el
// módulo permiso, para que conceder o quitar un permiso surta efecto sin que la
// persona vuelva a entrar.
//
// Hay dos tipos de cuenta y NO son intercambiables: el personal del hotel
// ("staff", tabla usuario) y el huésped que reserva por la web ("cliente",
// tabla cliente). Sus ids viven en tablas distintas y pueden coincidir: sin
// distinguir el tipo, el token del huésped nº 5 serviría como el del empleado
// nº 5. Cada validador exige SU tipo.
package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"hotelerias/backend/config"
)

// ErrTokenInvalido cubre todo lo que haga que un token no sirva (firma, vencido,
// emisor, audiencia, tipo equivocado, sub ilegible). Al cliente le da igual
// cuál; es un 401.
var ErrTokenInvalido = errors.New("token inválido")

// Tipos de cuenta que puede representar un token.
const (
	TipoStaff   = "staff"
	TipoCliente = "cliente"
)

type claims struct {
	jwt.RegisteredClaims
	Tipo string `json:"typ,omitempty"`
}

type Tokens struct {
	secret   []byte
	issuer   string
	audience string
	ttl      time.Duration
	now      func() time.Time
}

func NewTokens(cfg config.JwtSettings) (*Tokens, error) {
	if len(cfg.SecretKey) < 32 {
		return nil, errors.New("auth: la clave JWT necesita al menos 32 bytes")
	}
	if cfg.ExpirationHours <= 0 {
		return nil, errors.New("auth: ExpirationHours debe ser mayor que 0")
	}
	return &Tokens{
		secret:   []byte(cfg.SecretKey),
		issuer:   cfg.Issuer,
		audience: cfg.Audience,
		ttl:      time.Duration(cfg.ExpirationHours) * time.Hour,
		now:      time.Now,
	}, nil
}

// Emitir firma un token de PERSONAL para el usuario.
func (t *Tokens) Emitir(usuarioID int64) (string, error) { return t.emitir(usuarioID, TipoStaff) }

// EmitirCliente firma un token de HUÉSPED. No sirve en ninguna ruta del panel.
func (t *Tokens) EmitirCliente(clienteID int64) (string, error) {
	return t.emitir(clienteID, TipoCliente)
}

func (t *Tokens) emitir(id int64, tipo string) (string, error) {
	now := t.now()
	c := claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(id, 10),
			Issuer:    t.issuer,
			Audience:  jwt.ClaimStrings{t.audience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(t.ttl)),
		},
		Tipo: tipo,
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(t.secret)
}

// Validar devuelve el id del usuario de PERSONAL del token, o ErrTokenInvalido.
// Un token de huésped no vale aquí.
func (t *Tokens) Validar(raw string) (int64, error) { return t.validar(raw, TipoStaff) }

// ValidarCliente devuelve el id del HUÉSPED del token, o ErrTokenInvalido. Un
// token de personal no vale aquí.
func (t *Tokens) ValidarCliente(raw string) (int64, error) { return t.validar(raw, TipoCliente) }

func (t *Tokens) validar(raw, esperado string) (int64, error) {
	var c claims
	_, err := jwt.ParseWithClaims(raw, &c,
		func(*jwt.Token) (any, error) { return t.secret, nil },
		// Fijar el algoritmo evita el ataque de "alg: none" y de cambio de algoritmo.
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(t.issuer),
		jwt.WithAudience(t.audience),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(t.now),
	)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrTokenInvalido, err)
	}

	// Sin "typ" es un token de personal emitido antes de que existiera el tipo:
	// sigue valiendo como tal (y SOLO como tal).
	tipo := c.Tipo
	if tipo == "" {
		tipo = TipoStaff
	}
	if tipo != esperado {
		return 0, fmt.Errorf("%w: es un token de %q y aquí se esperaba %q", ErrTokenInvalido, tipo, esperado)
	}

	id, err := strconv.ParseInt(c.Subject, 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("%w: sub ilegible", ErrTokenInvalido)
	}
	return id, nil
}
