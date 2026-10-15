import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { DashboardLayout, NAV_GROUPS, NAV_DEFAULT, resolveNav, navPath, navIdFromPath, puedeAbrir } from './components/layout'
import { 
  Button, 
  Card, 
  Input, 
  Badge, 
  Alert, 
  Modal, 
  Select, 
  Tabs, 
  ToastProvider,
  useToast,
  StatCard,
  PageHeader,
  PageSection,
  ModuleIcon,
  ConfirmDialog,
  useConfirmacion,
} from './components/ui'
import { BarChart, LineChart, DonutChart, Heatmap } from './components/charts'

// Simple demo page to show components
function DemoPage() {
  const { toast } = useToast()
  const confirmar = useConfirmacion()
  const [showModal, setShowModal] = useState(false)
  const [selectedTab, setSelectedTab] = useState('tab1')
  const [selectedValue, setSelectedValue] = useState('opcion1')

  const handleToast = () => {
    toast.success('¡Componente funcionando!', 'Los componentes reutilizables están listos.')
  }

  const handleConfirm = async () => {
    const ok = await confirmar({
      titulo: 'Confirmar acción',
      mensaje: '¿Estás seguro de que quieres continuar?',
      tono: 'peligro',
    })
    if (ok) {
      toast.success('Confirmado', 'La acción ha sido confirmada.')
    }
  }

  // Sample data for charts
  const barData = [
    { label: 'Ene', value: 45 },
    { label: 'Feb', value: 52 },
    { label: 'Mar', value: 38 },
    { label: 'Abr', value: 61 },
    { label: 'May', value: 55 },
    { label: 'Jun', value: 67 },
  ]

  const lineData = [
    { label: 'Sem 1', series: { ventas: 120, gastos: 80 } },
    { label: 'Sem 2', series: { ventas: 150, gastos: 95 } },
    { label: 'Sem 3', series: { ventas: 130, gastos: 85 } },
    { label: 'Sem 4', series: { ventas: 180, gastos: 110 } },
  ]

  const donutData = [
    { label: 'Ventas', value: 45, color: '#3b82f6' },
    { label: 'Compras', value: 30, color: '#8b5cf6' },
    { label: 'Gastos', value: 25, color: '#ef4444' },
  ]

  const heatmapData = [
    { x: 'Lun', y: 'Sem 1', value: 80 },
    { x: 'Mar', y: 'Sem 1', value: 65 },
    { x: 'Mié', y: 'Sem 1', value: 90 },
    { x: 'Jue', y: 'Sem 1', value: 75 },
    { x: 'Vie', y: 'Sem 1', value: 85 },
    { x: 'Lun', y: 'Sem 2', value: 70 },
    { x: 'Mar', y: 'Sem 2', value: 85 },
    { x: 'Mié', y: 'Sem 2', value: 95 },
    { x: 'Jue', y: 'Sem 2', value: 60 },
    { x: 'Vie', y: 'Sem 2', value: 80 },
  ]

  return (
    <div className="p-6 space-y-8">
      <PageHeader 
        titulo="Componentes Reutilizables" 
        subtitulo="Demostración de los componentes copiados del proyecto Distribuidor"
        icono={<ModuleIcon key="dashboard" size={28} />}
      />

      <PageSection titulo="Botones y Alertas">
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleToast} icono="check-circle">
            Toast Success
          </Button>
          <Button onClick={handleConfirm} icono="alert-triangle" variante="peligro">
            Confirmar
          </Button>
          <Button onClick={() => setShowModal(true)} icono="plus" variante="secundario">
            Abrir Modal
          </Button>
        </div>
        
        <div className="mt-4 flex flex-wrap gap-3">
          <Alert tipo="exito" titulo="Éxito">Operación completada correctamente</Alert>
          <Alert tipo="error" titulo="Error">Ha ocurrido un error inesperado</Alert>
          <Alert tipo="advertencia" titulo="Advertencia">Revisa los datos antes de continuar</Alert>
          <Alert tipo="info" titulo="Información">Datos actualizados hace 5 minutos</Alert>
        </div>
      </PageSection>

      <PageSection titulo="Formularios">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label className="ui-label">Input texto</label>
            <Input placeholder="Escribe algo..." />
          </div>
          <div className="space-y-1">
            <label className="ui-label">Select</label>
            <Select
              value={selectedValue}
              onChange={setSelectedValue}
              opciones={[
                { value: 'opcion1', label: 'Opción 1' },
                { value: 'opcion2', label: 'Opción 2' },
                { value: 'opcion3', label: 'Opción 3' },
              ]}
            />
          </div>
          <div className="space-y-1">
            <label className="ui-label">Tabs</label>
            <Tabs
              value={selectedTab}
              onChange={setSelectedTab}
              tabs={[
                { id: 'tab1', label: 'Pestaña 1' },
                { id: 'tab2', label: 'Pestaña 2' },
                { id: 'tab3', label: 'Pestaña 3' },
              ]}
            />
          </div>
          <div className="space-y-1">
            <label className="ui-label">Badges</label>
            <div className="flex gap-2">
              <Badge tono="exito">Activo</Badge>
              <Badge tono="peligro">Inactivo</Badge>
              <Badge tono="advertencia">Pendiente</Badge>
              <Badge tono="info">Info</Badge>
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection titulo="Tarjetas de Estadísticas">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard 
            titulo="Total Ventas" 
            valor="$125,430" 
            cambio="+12.5%" 
            tendencia="sube"
            icono="trending-up"
          />
          <StatCard 
            titulo="Productos" 
            valor="1,234" 
            cambio="-2.1%" 
            tendencia="baja"
            icono="package"
          />
          <StatCard 
            titulo="Clientes" 
            valor="567" 
            cambio="+8.3%" 
            tendencia="sube"
            icono="users"
          />
          <StatCard 
            titulo="Pedidos" 
            valor="89" 
            cambio="0%" 
            tendencia="neutral"
            icono="shopping-cart"
          />
        </div>
      </PageSection>

      <PageSection titulo="Gráficos">
        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <div className="p-4 border-b">
              <h3 className="font-semibold">Gráfico de Barras</h3>
            </div>
            <div className="p-4 h-64">
              <BarChart
                data={barData}
                xKey="label"
                series={[{ key: 'value', label: 'Ventas', color: '#3b82f6' }]}
                height={256}
              />
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b">
              <h3 className="font-semibold">Gráfico de Líneas</h3>
            </div>
            <div className="p-4 h-64">
              <LineChart
                data={lineData}
                xKey="label"
                series={[
                  { key: 'ventas', label: 'Ventas', color: '#3b82f6' },
                  { key: 'gastos', label: 'Gastos', color: '#ef4444' },
                ]}
                height={256}
              />
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b">
              <h3 className="font-semibold">Gráfico de Dona</h3>
            </div>
            <div className="p-4 h-64 flex items-center justify-center">
              <DonutChart
                data={donutData}
                size={200}
                showLegend
              />
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b">
              <h3 className="font-semibold">Heatmap</h3>
            </div>
            <div className="p-4 h-64">
              <Heatmap
                data={heatmapData}
                xKey="x"
                yKey="y"
                valueKey="value"
                xLabels={['Lun', 'Mar', 'Mié', 'Jue', 'Vie']}
                yLabels={['Sem 1', 'Sem 2']}
                height={256}
              />
            </div>
          </Card>
        </div>
      </PageSection>

      <PageSection titulo="Card Simple">
        <Card className="max-w-2xl">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-2">Tarjeta de ejemplo</h3>
            <p className="text-ink-muted mb-4">
              Esta es una tarjeta simple usando el componente Card. 
              Incluye estilos consistentes con el sistema de diseño.
            </p>
            <div className="flex gap-3">
              <Button icono="edit">Editar</Button>
              <Button variante="esquema" icono="trash-2">Eliminar</Button>
            </div>
          </div>
        </Card>
      </PageSection>

      {/* Modal Demo */}
      <Modal
        abierto={showModal}
        onCerrar={() => setShowModal(false)}
        titulo="Modal de Ejemplo"
        accionPrincipal={{ label: 'Guardar', onClick: () => { setShowModal(false); toast.success('Guardado', 'Datos guardados correctamente'); } }}
        accionSecundaria={{ label: 'Cancelar', onClick: () => setShowModal(false) }}
      >
        <p className="text-ink-muted">Este es un modal de ejemplo. Puedes poner cualquier contenido aquí.</p>
        <div className="mt-4 space-y-3">
          <Input label="Nombre" placeholder="Tu nombre" />
          <Input label="Email" type="email" placeholder="tu@email.com" />
        </div>
      </Modal>

      <ConfirmDialog />
    </div>
  )
}

function App() {
  const [activeNav, setActiveNav] = useState('dashboard')

  return (
    <DashboardLayout
      active={activeNav}
      onSelect={setActiveNav}
      userName="Usuario Demo"
      userEmail="demo@hotelerias.com"
      userFoto={null}
      onPerfil={() => console.log('Perfil')}
      onLogout={() => console.log('Logout')}
    >
      <Routes>
        <Route path="/" element={<DemoPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="*" element={<DemoPage />} />
      </Routes>
    </DashboardLayout>
  )
}

export default App