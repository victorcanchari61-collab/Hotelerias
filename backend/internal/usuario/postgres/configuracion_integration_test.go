package postgres_test

// De punta a punta, contra PostgreSQL real: roles, usuarios, accesos
// (excepciones, solicitudes, alcance por sede), empresa, sedes y auditoría.
// Se salta sola sin TEST_DATABASE_URL (ver store_integration_test.go).

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/usuario"
	"hotelerias/backend/internal/usuario/postgres"
)

type entorno struct {
	t       *testing.T
	pool    *pgxpool.Pool
	srv     func(metodo, ruta, cuerpo, token string) (int, []byte)
	tokens  *auth.Tokens
	admin   string // token del super administrador
	adminID int64
}

func nuevoEntorno(t *testing.T) *entorno {
	t.Helper()
	pool := nuevoPool(t)
	srv, tokens := montarAPI(t, pool)
	ctx := context.Background()

	if _, err := usuario.AsegurarAdministrador(ctx, postgres.NewStore(pool), barato, usuario.Inicial{
		Email: "admin@hotelerias.test", Nombre: "Super Admin", Password: "clave-inicial-larga",
	}); err != nil {
		t.Fatal(err)
	}
	var id int64
	if err := pool.QueryRow(ctx, `SELECT id FROM usuario WHERE email = 'admin@hotelerias.test'`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	tok, _ := tokens.Emitir(id)

	return &entorno{
		t: t, pool: pool, tokens: tokens, admin: tok, adminID: id,
		srv: func(m, r, c, k string) (int, []byte) { return llamar(t, srv, m, r, c, k) },
	}
}

// persona inserta una cuenta directamente (sin pasar por la API) y devuelve su
// id y un token.
func (e *entorno) persona(email string, roles ...string) (int64, string) {
	e.t.Helper()
	hash, _ := barato.Hash("clave-de-prueba-1")
	var id int64
	if err := e.pool.QueryRow(context.Background(),
		`INSERT INTO usuario (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
		strings.Split(email, "@")[0], email, hash).Scan(&id); err != nil {
		e.t.Fatal(err)
	}
	for _, r := range roles {
		if _, err := e.pool.Exec(context.Background(),
			`INSERT INTO usuario_rol SELECT $1, id FROM rol WHERE nombre = $2`, id, r); err != nil {
			e.t.Fatal(err)
		}
	}
	tok, _ := e.tokens.Emitir(id)
	return id, tok
}

func (e *entorno) json(metodo, ruta, cuerpo, token string, wantCode int) map[string]any {
	e.t.Helper()
	code, body := e.srv(metodo, ruta, cuerpo, token)
	if code != wantCode {
		e.t.Fatalf("%s %s: %d (esperaba %d) %s", metodo, ruta, code, wantCode, body)
	}
	var out map[string]any
	_ = json.Unmarshal(body, &out)
	return out
}

func (e *entorno) lista(metodo, ruta, token string, wantCode int) []map[string]any {
	e.t.Helper()
	code, body := e.srv(metodo, ruta, "", token)
	if code != wantCode {
		e.t.Fatalf("%s %s: %d (esperaba %d) %s", metodo, ruta, code, wantCode, body)
	}
	var out []map[string]any
	_ = json.Unmarshal(body, &out)
	return out
}

func (e *entorno) codigo(metodo, ruta, cuerpo, token string) int {
	e.t.Helper()
	code, _ := e.srv(metodo, ruta, cuerpo, token)
	return code
}

func num(v any) int64 { f, _ := v.(float64); return int64(f) }

func TestRolesYMatrizDePuntaAPunta(t *testing.T) {
	e := nuevoEntorno(t)

	// El admin crea un rol, lo configura y crea una persona con él.
	rol := e.json("POST", "/api/rol", `{"nombre":"Concierge","descripcion":"Atención al huésped","activo":true}`, e.admin, 201)
	rolID := num(rol["id"])

	e.json("PUT", fmt.Sprintf("/api/rol/%d/permisos", rolID),
		`{"permisos":["reservas.reservas:anular","config.usuarios:ver","inventada.cosa:ver","reservas.reservas:volar"]}`, e.admin, 200)

	persona := e.json("POST", "/api/usuario", fmt.Sprintf(
		`{"nombre":"Rosa","apellido":"Quispe","email":"rosa@hotel.pe","password":"clave-rosa-123","activo":true,"rolIds":[%d],"sedeIds":[]}`, rolID),
		e.admin, 201)
	if strings.Contains(fmt.Sprint(persona), "clave") || strings.Contains(strings.ToLower(fmt.Sprint(persona)), "hash") {
		t.Fatalf("la respuesta expone la clave: %v", persona)
	}

	// Rosa inicia sesión (la clave quedó hasheada y funciona) y ve lo que el rol le da.
	login := e.json("POST", "/api/auth/login", `{"email":"rosa@hotel.pe","password":"clave-rosa-123"}`, "", 200)
	tok := login["token"].(string)

	code, body := e.srv("GET", "/api/permiso/mios", "", tok)
	if code != 200 {
		t.Fatalf("mios: %d", code)
	}
	var mios []string
	_ = json.Unmarshal(body, &mios)
	esperado := map[string]bool{"config.usuarios:ver": true, "reservas.reservas:anular": true, "reservas.reservas:ver": true}
	if len(mios) != len(esperado) {
		t.Fatalf("permisos = %v (solo debía quedar lo válido + 'ver' implícito)", mios)
	}
	for _, m := range mios {
		if !esperado[m] {
			t.Fatalf("permiso inesperado %q en %v", m, mios)
		}
	}

	// Con "ver usuarios" lista; sin "ver roles" no.
	e.lista("GET", "/api/usuario", tok, 200)
	if c := e.codigo("GET", "/api/rol", "", tok); c != 403 {
		t.Fatalf("roles sin permiso: %d", c)
	}

	// El cambio de matriz surte efecto de inmediato, sin que Rosa vuelva a entrar.
	e.json("PUT", fmt.Sprintf("/api/rol/%d/permisos", rolID), `{"permisos":["config.roles:ver"]}`, e.admin, 200)
	e.lista("GET", "/api/rol", tok, 200)
	if c := e.codigo("GET", "/api/usuario", "", tok); c != 403 {
		t.Fatalf("usuarios tras quitarlo: %d", c)
	}

	// Rosa puede VER roles pero no configurar accesos: separar "roles" de "accesos" evita el autoconcederse.
	if c := e.codigo("PUT", fmt.Sprintf("/api/rol/%d/permisos", rolID), `{"permisos":["config.usuarios:ver"]}`, tok); c != 403 {
		t.Fatalf("matriz sin permiso de accesos: %d", c)
	}
}

func TestProteccionesDeRoles(t *testing.T) {
	e := nuevoEntorno(t)
	roles := e.lista("GET", "/api/rol", e.admin, 200)

	var adminRol, recep map[string]any
	for _, r := range roles {
		switch r["nombre"] {
		case "Administrador":
			adminRol = r
		case "Recepcionista":
			recep = r
		}
	}
	if adminRol["accesoTotal"] != true || adminRol["usuarios"].(float64) != 1 {
		t.Fatalf("%+v", adminRol)
	}

	idAdmin := num(adminRol["id"])
	if c := e.codigo("DELETE", fmt.Sprintf("/api/rol/%d", idAdmin), "", e.admin); c != 409 {
		t.Fatalf("eliminar el de acceso total: %d", c)
	}
	if c := e.codigo("PUT", fmt.Sprintf("/api/rol/%d", idAdmin), `{"nombre":"Administrador","activo":false}`, e.admin); c != 409 {
		t.Fatalf("desactivar el de acceso total: %d", c)
	}
	if c := e.codigo("PUT", fmt.Sprintf("/api/rol/%d/permisos", idAdmin), `{"permisos":["config.usuarios:ver"]}`, e.admin); c != 409 {
		t.Fatalf("configurar su matriz: %d", c)
	}
	if c := e.codigo("DELETE", fmt.Sprintf("/api/rol/%d", num(recep["id"])), "", e.admin); c != 409 {
		t.Fatalf("eliminar uno del sistema: %d", c)
	}

	// Un rol con gente no se elimina; sin gente, sí.
	nuevo := e.json("POST", "/api/rol", `{"nombre":"Temporal","activo":true}`, e.admin, 201)
	id := num(nuevo["id"])
	e.persona("t@hotel.pe", "Temporal")
	if c := e.codigo("DELETE", fmt.Sprintf("/api/rol/%d", id), "", e.admin); c != 409 {
		t.Fatalf("rol con usuarios: %d", c)
	}
	if c := e.codigo("POST", "/api/rol", `{"nombre":"temporal"}`, e.admin); c != 409 {
		t.Fatalf("nombre repetido sin distinguir mayúsculas: %d", c)
	}
}

func TestElUltimoAdministradorNoSePuedeDejarSinAcceso(t *testing.T) {
	e := nuevoEntorno(t)

	// Un gerente que puede editar usuarios.
	rol := e.json("POST", "/api/rol", `{"nombre":"Gerencia","activo":true}`, e.admin, 201)
	e.json("PUT", fmt.Sprintf("/api/rol/%d/permisos", num(rol["id"])),
		`{"permisos":["config.usuarios:editar","config.usuarios:eliminar"]}`, e.admin, 200)
	_, gerente := e.persona("gerente@hotel.pe", "Gerencia")

	// No puede desactivar ni eliminar al único administrador.
	if c := e.codigo("PATCH", fmt.Sprintf("/api/usuario/%d/estado", e.adminID), `{"activo":false}`, gerente); c != 409 {
		t.Fatalf("desactivar al último admin: %d", c)
	}
	if c := e.codigo("DELETE", fmt.Sprintf("/api/usuario/%d", e.adminID), "", gerente); c != 409 {
		t.Fatalf("eliminar al último admin: %d", c)
	}

	// Ni quitarle el rol de acceso total editándolo.
	if c := e.codigo("PUT", fmt.Sprintf("/api/usuario/%d", e.adminID),
		fmt.Sprintf(`{"nombre":"Super Admin","email":"admin@hotelerias.test","activo":true,"rolIds":[%d]}`, num(rol["id"])), gerente); c != 409 {
		t.Fatalf("quitarle el acceso total: %d", c)
	}

	// Nadie desactiva ni elimina su propia cuenta.
	if c := e.codigo("PATCH", fmt.Sprintf("/api/usuario/%d/estado", e.adminID), `{"activo":false}`, e.admin); c != 409 {
		t.Fatalf("autodesactivarse: %d", c)
	}

	// Con un segundo administrador activo, sí se puede dar de baja al primero.
	_, otro := e.persona("admin2@hotel.pe", "Administrador")
	_ = otro
	e.json("PATCH", fmt.Sprintf("/api/usuario/%d/estado", e.adminID), `{"activo":false}`, gerente, 200)
}

func TestExcepcionesYSolicitudes(t *testing.T) {
	e := nuevoEntorno(t)
	id, tok := e.persona("pepe@hotel.pe", "Recepcionista")

	// Sin permiso: 403, y el cuerpo dice qué faltaba.
	if c := e.codigo("GET", "/api/rol", "", tok); c != 403 {
		t.Fatalf("antes: %d", c)
	}

	// Pide el acceso; pedirlo dos veces devuelve la MISMA solicitud abierta.
	s1 := e.json("POST", "/api/permiso/solicitar", `{"submodulo":"config.roles","accion":"ver","motivo":"necesito revisar"}`, tok, 200)
	s2 := e.json("POST", "/api/permiso/solicitar", `{"submodulo":"config.roles","accion":"ver"}`, tok, 200)
	if s1["id"] != s2["id"] {
		t.Fatalf("duplicó la solicitud: %v / %v", s1["id"], s2["id"])
	}
	if c := e.codigo("POST", "/api/permiso/solicitar", `{"submodulo":"config.roles","accion":"volar"}`, tok); c != 400 {
		t.Fatalf("acción inexistente: %d", c)
	}

	// Pepe no ve la bandeja del admin (pedir no exige permiso; resolver sí).
	if c := e.codigo("GET", "/api/permiso/solicitudes", "", tok); c != 403 {
		t.Fatalf("bandeja sin permiso: %d", c)
	}
	bandeja := e.lista("GET", "/api/permiso/solicitudes?soloPendientes=true", e.admin, 200)
	if len(bandeja) != 1 || bandeja[0]["estado"] != "pendiente" || bandeja[0]["usuario"] == "" {
		t.Fatalf("%+v", bandeja)
	}

	// Aprobar temporal sin fecha: 400. Con vigencia permanente: concede.
	solID := num(s1["id"])
	if c := e.codigo("POST", fmt.Sprintf("/api/permiso/solicitudes/%d/aprobar", solID), `{"vigencia":"temporal"}`, e.admin); c != 400 {
		t.Fatalf("temporal sin fecha: %d", c)
	}
	e.json("POST", fmt.Sprintf("/api/permiso/solicitudes/%d/aprobar", solID), `{"vigencia":"permanente","respuesta":"ok"}`, e.admin, 200)

	e.lista("GET", "/api/rol", tok, 200) // ahora sí puede
	// Dos admins con la bandeja abierta: el segundo no concede otra vez.
	if c := e.codigo("POST", fmt.Sprintf("/api/permiso/solicitudes/%d/aprobar", solID), `{"vigencia":"permanente"}`, e.admin); c != 409 {
		t.Fatalf("doble resolución: %d", c)
	}

	// Las excepciones se listan y se revocan; la fila queda.
	exc := e.lista("GET", fmt.Sprintf("/api/permiso/usuario/%d", id), e.admin, 200)
	if len(exc) != 1 || exc[0]["vigente"] != true {
		t.Fatalf("%+v", exc)
	}
	e.codigo("PATCH", fmt.Sprintf("/api/permiso/excepcion/%d/revocar", num(exc[0]["id"])), "", e.admin)
	if c := e.codigo("GET", "/api/rol", "", tok); c != 403 {
		t.Fatalf("tras revocar: %d", c)
	}
	exc = e.lista("GET", fmt.Sprintf("/api/permiso/usuario/%d", id), e.admin, 200)
	if len(exc) != 1 || exc[0]["revocado"] != true || exc[0]["vigente"] != false {
		t.Fatalf("la fila debe quedar, revocada: %+v", exc)
	}

	// Una de un solo uso se gasta con la primera acción exitosa.
	e.json("POST", "/api/permiso/conceder",
		fmt.Sprintf(`{"usuarioId":%d,"submodulo":"config.roles","accion":"ver","vigencia":"una_vez"}`, id), e.admin, 201)
	if c := e.codigo("GET", "/api/rol", "", tok); c != 200 {
		t.Fatalf("la de un solo uso: %d", c)
	}
	if c := e.codigo("GET", "/api/rol", "", tok); c != 403 {
		t.Fatalf("ya gastada: %d", c)
	}
}

func TestAlcancePorSedeEnReservas(t *testing.T) {
	e := nuevoEntorno(t)
	ctx := context.Background()

	// Dos sedes con una reserva cada una.
	var sedes [2]int64
	var tipos [2]int64
	var cliente int64
	_ = e.pool.QueryRow(ctx, `INSERT INTO cliente (nombre, email, password_hash) VALUES ('C','c@x.pe','x') RETURNING id`).Scan(&cliente)
	for i := range sedes {
		_ = e.pool.QueryRow(ctx, `INSERT INTO sede (nombre, ciudad) VALUES ($1, 'Lima') RETURNING id`, fmt.Sprintf("Sede %d", i+1)).Scan(&sedes[i])
		_ = e.pool.QueryRow(ctx, `INSERT INTO tipo_habitacion (sede_id, nombre, capacidad, precio_noche_cent, cantidad)
			VALUES ($1, 'Deluxe', 2, 10000, 5) RETURNING id`, sedes[i]).Scan(&tipos[i])
		if _, err := e.pool.Exec(ctx, `
			INSERT INTO reserva (codigo, cliente_id, sede_id, tipo_habitacion_id, check_in, check_out, huespedes, noches,
			                     precio_noche_cent, subtotal_cent, descuento_cent, total_cent)
			VALUES ($1, $2, $3, $4, current_date + 10, current_date + 12, 2, 2, 10000, 20000, 0, 20000)`,
			fmt.Sprintf("HV-TEST-%04d", i), cliente, sedes[i], tipos[i]); err != nil {
			t.Fatal(err)
		}
	}

	rol := e.json("POST", "/api/rol", `{"nombre":"Gerente de sede 2","activo":true}`, e.admin, 201)
	rolID := num(rol["id"])
	e.json("PUT", fmt.Sprintf("/api/rol/%d/permisos", rolID), `{"permisos":["reservas.reservas:ver","reservas.reservas:anular"]}`, e.admin, 200)
	persona := e.json("POST", "/api/usuario", fmt.Sprintf(
		`{"nombre":"Gerente","email":"g@hotel.pe","password":"clave-gerente-1","activo":true,"rolIds":[%d],"sedeIds":[%d]}`,
		rolID, sedes[0]), e.admin, 201)
	pid := num(persona["id"])
	tok, _ := e.tokens.Emitir(pid)

	// Sin restricción en el rol: ve las dos.
	if n := len(e.lista("GET", "/api/reserva", tok, 200)); n != 2 {
		t.Fatalf("sin restricción: %d", n)
	}

	// El rol limita a "mis sedes": solo la suya.
	e.codigo("PUT", fmt.Sprintf("/api/permiso/alcances/rol/%d", rolID), `{"reservas.reservas":"mis_sedes"}`, e.admin)
	vistas := e.lista("GET", "/api/reserva", tok, 200)
	if len(vistas) != 1 || num(vistas[0]["sedeId"]) != sedes[0] {
		t.Fatalf("con mis_sedes: %+v", vistas)
	}

	// Y no puede cancelar la de la otra sede: responde como si no existiera.
	todas := e.lista("GET", "/api/reserva", e.admin, 200)
	var ajena int64
	for _, r := range todas {
		if num(r["sedeId"]) == sedes[1] {
			ajena = num(r["id"])
		}
	}
	if c := e.codigo("POST", fmt.Sprintf("/api/reserva/%d/cancelar", ajena), "", tok); c != 404 {
		t.Fatalf("cancelar la de otra sede: %d", c)
	}

	// La persona manda sobre el rol: se le ensancha a "todas".
	e.codigo("PUT", fmt.Sprintf("/api/permiso/alcances/usuario/%d", pid), `{"reservas.reservas":"todas"}`, e.admin)
	if n := len(e.lista("GET", "/api/reserva", tok, 200)); n != 2 {
		t.Fatalf("persona con todas: %d", n)
	}

	// Un alcance inventado o en una pantalla que no lo admite se rechaza.
	if c := e.codigo("PUT", fmt.Sprintf("/api/permiso/alcances/rol/%d", rolID), `{"config.usuarios":"mis_sedes"}`, e.admin); c != 400 {
		t.Fatalf("submódulo sin alcance: %d", c)
	}

	// Sin ninguna sede asignada y con "mis sedes": no ve NADA (nunca "todas" por descuido).
	e.codigo("PUT", fmt.Sprintf("/api/permiso/alcances/usuario/%d", pid), `{}`, e.admin)
	e.json("PUT", fmt.Sprintf("/api/usuario/%d", pid), fmt.Sprintf(
		`{"nombre":"Gerente","email":"g@hotel.pe","activo":true,"rolIds":[%d],"sedeIds":[]}`, rolID), e.admin, 200)
	if n := len(e.lista("GET", "/api/reserva", tok, 200)); n != 0 {
		t.Fatalf("sin sedes asignadas: %d", n)
	}
}

func TestEmpresaYSedes(t *testing.T) {
	e := nuevoEntorno(t)

	emp := e.json("GET", "/api/empresa", "", e.admin, 200)
	if emp["nombreComercial"] != "Hotel Velothr" {
		t.Fatalf("%+v", emp)
	}
	if c := e.codigo("PUT", "/api/empresa", `{"nombreComercial":"X","ruc":"123"}`, e.admin); c != 400 {
		t.Fatalf("RUC inválido: %d", c)
	}
	if c := e.codigo("PUT", "/api/empresa", `{"nombreComercial":"","ruc":""}`, e.admin); c != 400 {
		t.Fatalf("sin nombre: %d", c)
	}
	out := e.json("PUT", "/api/empresa",
		`{"razonSocial":"Velothr S.A.C.","nombreComercial":"Hotel Velothr","ruc":"20123456789","sitioWeb":"velothr.pe","email":"hola@velothr.pe"}`, e.admin, 200)
	if out["sitioWeb"] != "https://velothr.pe" {
		t.Fatalf("sitio web sin esquema: %v", out["sitioWeb"])
	}

	// Sedes: crear, validar y desactivar (no se borran).
	if c := e.codigo("POST", "/api/sede", `{"nombre":"Cusco","ciudad":"Cusco","estrellas":9,"activo":true}`, e.admin); c != 400 {
		t.Fatalf("estrellas: %d", c)
	}
	sede := e.json("POST", "/api/sede",
		`{"nombre":"Velothr Cusco","ciudad":"Cusco","estrellas":5,"imagen":"andino","servicios":["Spa"," spa ","Mayordomo",""],"activo":true}`, e.admin, 201)
	servicios := fmt.Sprint(sede["servicios"])
	if servicios != "[Spa Mayordomo]" {
		t.Fatalf("servicios sin vacíos ni repetidos: %s", servicios)
	}
	id := num(sede["id"])

	// Con una reserva vigente no se desactiva.
	ctx := context.Background()
	var cliente, tipo int64
	_ = e.pool.QueryRow(ctx, `INSERT INTO cliente (nombre, email, password_hash) VALUES ('C','c@x.pe','x') RETURNING id`).Scan(&cliente)
	_ = e.pool.QueryRow(ctx, `INSERT INTO tipo_habitacion (sede_id, nombre, capacidad, precio_noche_cent, cantidad)
		VALUES ($1, 'Deluxe', 2, 10000, 5) RETURNING id`, id).Scan(&tipo)
	_, _ = e.pool.Exec(ctx, `
		INSERT INTO reserva (codigo, cliente_id, sede_id, tipo_habitacion_id, check_in, check_out, huespedes, noches,
		                     precio_noche_cent, subtotal_cent, descuento_cent, total_cent)
		VALUES ('HV-VIGENTE', $1, $2, $3, current_date + 5, current_date + 7, 2, 2, 10000, 20000, 0, 20000)`, cliente, id, tipo)

	cuerpo := `{"nombre":"Velothr Cusco","ciudad":"Cusco","estrellas":5,"imagen":"andino","activo":false}`
	if c := e.codigo("PUT", fmt.Sprintf("/api/sede/%d", id), cuerpo, e.admin); c != 409 {
		t.Fatalf("desactivar con reservas vigentes: %d", c)
	}
	_, _ = e.pool.Exec(ctx, `UPDATE reserva SET estado = 'cancelada' WHERE codigo = 'HV-VIGENTE'`)
	e.json("PUT", fmt.Sprintf("/api/sede/%d", id), cuerpo, e.admin, 200)

	// La web pública ya no la lista (solo en el panel).
	for _, s := range e.lista("GET", "/api/sede", e.admin, 200) {
		if num(s["id"]) == id && s["activo"] != false {
			t.Fatalf("debía quedar inactiva: %+v", s)
		}
	}
}

func TestAuditoriaDejaConstanciaSinSecretos(t *testing.T) {
	e := nuevoEntorno(t)

	rol := e.json("POST", "/api/rol", `{"nombre":"Auditado","activo":true}`, e.admin, 201)
	e.json("PUT", fmt.Sprintf("/api/rol/%d", num(rol["id"])), `{"nombre":"Auditado 2","activo":true}`, e.admin, 200)
	u := e.json("POST", "/api/usuario",
		fmt.Sprintf(`{"nombre":"Ana","email":"ana@hotel.pe","password":"super-secreta-123","activo":true,"rolIds":[%d]}`, num(rol["id"])), e.admin, 201)
	e.json("PUT", fmt.Sprintf("/api/usuario/%d", num(u["id"])),
		fmt.Sprintf(`{"nombre":"Ana","email":"ana@hotel.pe","password":"otra-secreta-1234","activo":true,"rolIds":[%d]}`, num(rol["id"])), e.admin, 200)

	// La auditoría es asíncrona respecto a la respuesta? No: se registra antes de responder.
	pagina := e.json("POST", "/api/auditoria/listar", `{"pagina":1,"porPagina":50}`, e.admin, 200)
	items := pagina["items"].([]any)
	if len(items) < 4 {
		t.Fatalf("faltan registros: %d", len(items))
	}

	// Ningún registro, de ninguna entidad, contiene la clave ni su hash.
	var rolEditado int64
	for _, it := range items {
		fila := it.(map[string]any)
		id := int64(fila["id"].(float64))
		code, body := e.srv("GET", fmt.Sprintf("/api/auditoria/%d", id), "", e.admin)
		if code != 200 {
			t.Fatalf("detalle %d: %d", id, code)
		}
		texto := strings.ToLower(string(body))
		if strings.Contains(texto, "secreta") || strings.Contains(texto, "$2a$") || strings.Contains(texto, "password_hash") {
			t.Fatalf("la bitácora expone un secreto: %s", body)
		}
		if fila["entidad"] == "Rol" && fila["accion"] == "ACTUALIZADO" {
			rolEditado = id
		}
	}

	// Una edición registra SOLO lo que cambió.
	d := e.json("GET", fmt.Sprintf("/api/auditoria/%d", rolEditado), "", e.admin, 200)
	antes, _ := d["valoresAnteriores"].(map[string]any)
	despues, _ := d["valoresNuevos"].(map[string]any)
	if fmt.Sprint(antes) != "map[nombre:Auditado]" || fmt.Sprint(despues) != "map[nombre:Auditado 2]" {
		t.Fatalf("antes=%v despues=%v", antes, despues)
	}

	// Filtros.
	f := e.json("POST", "/api/auditoria/listar",
		`{"pagina":1,"porPagina":50,"filtros":[{"columna":"entidad","operador":"equals","valor":"Usuario"},{"columna":"accion","operador":"equals","valor":"CREADO"}]}`, e.admin, 200)
	if len(f["items"].([]any)) != 1 {
		t.Fatalf("filtrado: %+v", f)
	}

	// El buscador mira entidad, registro, acción y persona; una fecha mal escrita es un 400.
	b := e.json("POST", "/api/auditoria/listar", `{"pagina":1,"porPagina":50,"buscar":"super"}`, e.admin, 200)
	if len(b["items"].([]any)) == 0 {
		t.Fatalf("el buscador no encontró nada: %+v", b)
	}
	if c := e.codigo("POST", "/api/auditoria/listar",
		`{"orden":"fecha; DROP TABLE auditoria","filtros":[{"columna":"fecha","valor":"ayer"}]}`, e.admin); c != 400 {
		t.Fatalf("una fecha mal escrita: %d", c)
	}

	// Depurar borra lo que se ve, pero NUNCA lo reciente: nada de lo de hoy se va.
	totalAntes := e.json("GET", "/api/auditoria/resumen", "", e.admin, 200)
	dep := e.json("POST", "/api/auditoria/depurar", `{"filtros":[]}`, e.admin, 200)
	if dep["eliminados"].(float64) != 0 {
		t.Fatalf("depuró lo reciente: %+v", dep)
	}
	totalDespues := e.json("GET", "/api/auditoria/resumen", "", e.admin, 200)
	if totalAntes["total"] != totalDespues["total"] {
		t.Fatalf("la bitácora cambió: %v → %v", totalAntes["total"], totalDespues["total"])
	}

	// Con registros viejos sí: se borran solo los que casan con el filtro y se deja constancia.
	_, _ = e.pool.Exec(context.Background(), `
		INSERT INTO auditoria (fecha, entidad, entidad_id, accion) VALUES
		(now() - interval '90 days', 'Vieja', '1', 'CREADO'), (now() - interval '91 days', 'Otra', '2', 'CREADO')`)
	dep = e.json("POST", "/api/auditoria/depurar",
		`{"filtros":[{"columna":"entidad","operador":"equals","valor":"Vieja"}]}`, e.admin, 200)
	if dep["eliminados"].(float64) != 1 {
		t.Fatalf("debía borrar solo 'Vieja': %+v", dep)
	}
	var quedan int
	_ = e.pool.QueryRow(context.Background(), `SELECT count(*) FROM auditoria WHERE entidad = 'Otra'`).Scan(&quedan)
	if quedan != 1 {
		t.Fatalf("'Otra' no debía tocarse: %d", quedan)
	}
	var constancia int
	_ = e.pool.QueryRow(context.Background(), `SELECT count(*) FROM auditoria WHERE entidad = 'Auditoria' AND accion = 'ELIMINADO'`).Scan(&constancia)
	if constancia != 1 {
		t.Fatalf("la depuración debía dejar un registro: %d", constancia)
	}

	// Y quien no tiene permiso, ni la ve.
	_, tok := e.persona("curioso@hotel.pe", "Recepcionista")
	if c := e.codigo("POST", "/api/auditoria/listar", `{}`, tok); c != 403 {
		t.Fatalf("sin permiso: %d", c)
	}
}
