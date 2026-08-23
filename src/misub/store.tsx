import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
// @ts-ignore - plain JS utility, framework agnostic
import { db } from './lib/db.js'

const VALID_TABS = ['optimizer', 'scanner', 'misub', 'tools', 'settings'] as const
export type MiSubTab = typeof VALID_TABS[number]

export interface FragmentConfig {
  length: string
  interval: string
  packets: string
}

export interface ScanResult {
  ip: string
  latency: number | null
  jitter?: number
  status: 'ok' | 'error' | 'testing'
  colo?: string
  city?: string
  speedMbps?: number
  speedTesting?: boolean
  [key: string]: unknown
}

export interface MiSubNotification {
  id: number
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

interface MiSubState {
  activeTab: MiSubTab
  setActiveTab: (t: MiSubTab) => void

  cleanIp: string; setCleanIp: (v: string) => void
  cleanPort: string; setCleanPort: (v: string) => void
  customSni: string; setCustomSni: (v: string) => void
  prefix: string; setPrefix: (v: string) => void
  inputNodes: string; setInputNodes: (v: string) => void
  fragmentEnabled: boolean; setFragmentEnabled: (v: boolean) => void
  fragmentConfig: FragmentConfig; setFragmentConfig: (v: FragmentConfig) => void
  fpValue: string; setFpValue: (v: string) => void
  csValue: string; setCsValue: (v: string) => void
  fmValue: string; setFmValue: (v: string) => void
  arasMode: boolean; setArasMode: (v: boolean) => void
  activeNodes: string[]; setActiveNodes: (v: string[]) => void
  optimizeErrors: string[]; setOptimizeErrors: (v: string[]) => void
  optimizedPingResults: Record<string, unknown>; setOptimizedPingResults: (v: Record<string, unknown>) => void
  isTestingOptimizedPings: boolean; setIsTestingOptimizedPings: (v: boolean) => void

  scannerIpsInput: string; setScannerIpsInput: (v: string) => void
  scannerResults: ScanResult[]; setScannerResults: (v: ScanResult[] | ((prev: ScanResult[]) => ScanResult[])) => void
  concurrency: number; setConcurrency: (v: number) => void
  timeoutMs: number; setTimeoutMs: (v: number) => void
  isScanning: boolean; setIsScanning: (v: boolean) => void
  shouldStopScanning: boolean; setShouldStopScanning: (v: boolean) => void
  scanProgress: { current: number; total: number }; setScanProgress: (v: { current: number; total: number } | ((prev: { current: number; total: number }) => { current: number; total: number })) => void

  subUrl: string; setSubUrl: (v: string) => void
  subRawInput: string; setSubRawInput: (v: string) => void

  transferredNodes: string; setTransferredNodes: (v: string) => void

  notifications: MiSubNotification[]
  notify: (message: string, type?: MiSubNotification['type']) => void
}

const MiSubContext = createContext<MiSubState | null>(null)

export function MiSubProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<MiSubTab>(() => {
    const saved = db.get('activeTab', 'optimizer')
    return (VALID_TABS as readonly string[]).includes(saved) ? saved : 'optimizer'
  })
  const setActiveTab = (t: MiSubTab) => { setActiveTabState(t); db.set('activeTab', t) }

  const [cleanIp, setCleanIpState] = useState<string>(() => db.get('cleanIp', '104.16.1.1'))
  const setCleanIp = (v: string) => { setCleanIpState(v); db.set('cleanIp', v) }

  const [cleanPort, setCleanPortState] = useState<string>(() => db.get('cleanPort', '443'))
  const setCleanPort = (v: string) => { setCleanPortState(v); db.set('cleanPort', v) }

  const [customSni, setCustomSniState] = useState<string>(() => db.get('customSni', 'speed.cloudflare.com'))
  const setCustomSni = (v: string) => { setCustomSniState(v); db.set('customSni', v) }

  const [prefix, setPrefixState] = useState<string>(() => db.get('prefix', '[CF-Clean]'))
  const setPrefix = (v: string) => { setPrefixState(v); db.set('prefix', v) }

  const [inputNodes, setInputNodesState] = useState<string>(() => db.get('inputNodes', ''))
  const setInputNodes = (v: string) => { setInputNodesState(v); db.set('inputNodes', v) }

  const [fragmentEnabled, setFragmentEnabledState] = useState<boolean>(() => db.get('fragmentEnabled', false))
  const setFragmentEnabled = (v: boolean) => { setFragmentEnabledState(v); db.set('fragmentEnabled', v) }

  const [fragmentConfig, setFragmentConfigState] = useState<FragmentConfig>(() => db.get('fragmentConfig', { length: '10-50', interval: '10-20', packets: 'tlshello' }))
  const setFragmentConfig = (v: FragmentConfig) => { setFragmentConfigState(v); db.set('fragmentConfig', v) }

  const [fpValue, setFpValueState] = useState<string>(() => db.get('fpValue', 'unsafe'))
  const setFpValue = (v: string) => { setFpValueState(v); db.set('fpValue', v) }

  const [csValue, setCsValueState] = useState<string>(() => db.get('csValue', ''))
  const setCsValue = (v: string) => { setCsValueState(v); db.set('csValue', v) }

  const [fmValue, setFmValueState] = useState<string>(() => db.get('fmValue', ''))
  const setFmValue = (v: string) => { setFmValueState(v); db.set('fmValue', v) }

  const [arasMode, setArasMode] = useState<boolean>(false)
  const [activeNodes, setActiveNodes] = useState<string[]>([])
  const [optimizeErrors, setOptimizeErrors] = useState<string[]>([])
  const [optimizedPingResults, setOptimizedPingResults] = useState<Record<string, unknown>>({})
  const [isTestingOptimizedPings, setIsTestingOptimizedPings] = useState(false)

  const [scannerIpsInput, setScannerIpsInputState] = useState<string>(() => db.get('scannerIpsInput', '104.16.1.1\n104.16.12.1\n172.64.80.1\n104.16.2.1\n172.67.1.1\n162.158.5.1\n198.41.129.1'))
  const setScannerIpsInput = (v: string) => { setScannerIpsInputState(v); db.set('scannerIpsInput', v) }

  const [scannerResults, setScannerResultsState] = useState<ScanResult[]>(() => db.get('scannerResults', []))
  const setScannerResults = (v: ScanResult[] | ((prev: ScanResult[]) => ScanResult[])) => {
    setScannerResultsState((prev) => {
      const next = typeof v === 'function' ? (v as (p: ScanResult[]) => ScanResult[])(prev) : v
      db.set('scannerResults', next)
      return next
    })
  }

  const [concurrency, setConcurrencyState] = useState<number>(() => db.get('concurrency', 8))
  const setConcurrency = (v: number) => { setConcurrencyState(v); db.set('concurrency', v) }

  const [timeoutMs, setTimeoutMsState] = useState<number>(() => db.get('timeoutMs', 2500))
  const setTimeoutMs = (v: number) => { setTimeoutMsState(v); db.set('timeoutMs', v) }

  const [isScanning, setIsScanning] = useState(false)
  const [shouldStopScanning, setShouldStopScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 })

  const [subUrl, setSubUrlState] = useState<string>(() => db.get('subUrl', ''))
  const setSubUrl = (v: string) => { setSubUrlState(v); db.set('subUrl', v) }

  const [subRawInput, setSubRawInputState] = useState<string>(() => db.get('subRawInput', ''))
  const setSubRawInput = (v: string) => { setSubRawInputState(v); db.set('subRawInput', v) }

  const [transferredNodes, setTransferredNodes] = useState('')

  const [notifications, setNotifications] = useState<MiSubNotification[]>([])
  const notifyIdRef = useRef(0)
  const notify = (message: string, type: MiSubNotification['type'] = 'info') => {
    const id = ++notifyIdRef.current
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 4000)
  }

  const value: MiSubState = {
    activeTab, setActiveTab,
    cleanIp, setCleanIp,
    cleanPort, setCleanPort,
    customSni, setCustomSni,
    prefix, setPrefix,
    inputNodes, setInputNodes,
    fragmentEnabled, setFragmentEnabled,
    fragmentConfig, setFragmentConfig,
    fpValue, setFpValue,
    csValue, setCsValue,
    fmValue, setFmValue,
    arasMode, setArasMode,
    activeNodes, setActiveNodes,
    optimizeErrors, setOptimizeErrors,
    optimizedPingResults, setOptimizedPingResults,
    isTestingOptimizedPings, setIsTestingOptimizedPings,
    scannerIpsInput, setScannerIpsInput,
    scannerResults, setScannerResults,
    concurrency, setConcurrency,
    timeoutMs, setTimeoutMs,
    isScanning, setIsScanning,
    shouldStopScanning, setShouldStopScanning,
    scanProgress, setScanProgress,
    subUrl, setSubUrl,
    subRawInput, setSubRawInput,
    transferredNodes, setTransferredNodes,
    notifications, notify,
  }

  return <MiSubContext.Provider value={value}>{children}</MiSubContext.Provider>
}

export function useMiSubStore(): MiSubState {
  const ctx = useContext(MiSubContext)
  if (!ctx) throw new Error('useMiSubStore must be used within <MiSubProvider>')
  return ctx
}
