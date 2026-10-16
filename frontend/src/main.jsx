import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { getContainer } from './di'
import { App } from './presentation/App'
import { AppProviders } from './presentation/AppProviders'

// getContainer() y no createContainer(): las fachadas de lib/ (que usan los
// componentes del kit de UI) tienen que compartir ESTE mismo contenedor, o
// hablarían con otro cliente HTTP y otra sesión.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders container={getContainer()}>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
)
