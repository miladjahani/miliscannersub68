import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import Tokens from './pages/Tokens'
import Deployments from './pages/Deployments'
import DeployWizard from './pages/DeployWizard'
import BotUsers from './pages/BotUsers'
import BotConfig from './pages/BotConfig'
import ActivityLogs from './pages/ActivityLogs'
import MiSubLayoutRoute from './misub/MiSubLayoutRoute'
import OptimizerView from './misub/views/OptimizerView'
import ScannerView from './misub/views/ScannerView'
import SubscriptionsView from './misub/views/SubscriptionsView'
import ToolsView from './misub/views/ToolsView'
import SettingsView from './misub/views/SettingsView'
import Layout from './components/Layout'

function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-brand-400 text-lg">در حال بارگذاری...</div></div>
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950"><div className="animate-pulse text-brand-400 text-lg">در حال بارگذاری...</div></div>
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="tokens" element={<Tokens />} />
        <Route path="deployments" element={<Deployments />} />
        <Route path="deploy" element={<DeployWizard />} />
        <Route element={<MiSubLayoutRoute />}>
          <Route path="misub/optimizer" element={<OptimizerView />} />
          <Route path="misub/scanner" element={<ScannerView />} />
          <Route path="misub/subscriptions" element={<SubscriptionsView />} />
          <Route path="misub/tools" element={<ToolsView />} />
          <Route path="misub/settings" element={<SettingsView />} />
        </Route>
        <Route path="bot-users" element={<BotUsers />} />
        <Route path="bot-config" element={<BotConfig />} />
        <Route path="logs" element={<ActivityLogs />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
