import { Outlet } from 'react-router-dom'
import { MiSubProvider } from './store'
import './misub-scope.css'
import './misub-components.css'

export default function MiSubLayoutRoute() {
  return (
    <MiSubProvider>
      <div className="misub-scope">
        <Outlet />
      </div>
    </MiSubProvider>
  )
}
