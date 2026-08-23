import { useMiSubStore } from '../store'
import QuickOptimizer from '../components/optimizer/QuickOptimizer'

export default function OptimizerView() {
  const s = useMiSubStore()

  return (
    <div className="view-container">
      <QuickOptimizer initialCleanIp={s.cleanIp} initialNodes={s.transferredNodes} />
    </div>
  )
}
