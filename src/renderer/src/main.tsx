import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import DesktopSurface from './plugins/desktop/DesktopSurface'

const surface = new URLSearchParams(location.search).get('surface')
if (surface) document.documentElement.classList.add('desktop-surface-root')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {surface ? <DesktopSurface surface={surface} /> : <App />}
  </React.StrictMode>
)
