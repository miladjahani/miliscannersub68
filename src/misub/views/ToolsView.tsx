import DohLab from '../components/tools/DohLab'
import GeoIpInspector from '../components/tools/GeoIpInspector'

export default function ToolsView() {
  return (
    <div className="view-container tools-layout">
      <DohLab />
      <GeoIpInspector />
    </div>
  )
}
