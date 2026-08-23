import { useMiSubStore } from '../store'
import SubscriptionHub from '../components/misub/SubscriptionHub'

export default function SubscriptionsView() {
  const s = useMiSubStore()

  const handleSendAll = (rawNodes: string) => {
    s.setTransferredNodes(rawNodes)
    s.setActiveTab('optimizer')
  }

  const handleSelectOne = (rawNode: string) => {
    s.setTransferredNodes(rawNode)
    s.setActiveTab('optimizer')
  }

  return (
    <div className="view-container">
      <SubscriptionHub onSendToOptimizer={handleSendAll} onSelectNodeToOptimize={handleSelectOne} />
    </div>
  )
}
