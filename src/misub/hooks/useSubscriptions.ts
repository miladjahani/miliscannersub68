import { useEffect, useMemo, useState } from 'react'
import { useMiSubStore } from '../store'
// @ts-ignore plain JS
import { parseMultipleNodes } from '../lib/protocols/index.js'
// @ts-ignore plain JS
import { deduplicateNodes } from '../lib/operators/operatorChains.js'
// @ts-ignore plain JS
import { fetchSubscriptionSmart } from '../lib/optimizer/araEngine.js'
// @ts-ignore plain JS
import { getWorkerUrl } from '../lib/workerApi.js'

interface ParsedNode {
  id: string
  protocol: string
  name: string
  address: string
  port: number | string
  sni?: string
  raw: string
  [key: string]: unknown
}

/**
 * React port of the Vue useSubscriptions composable — same real fetch
 * chain (your Worker -> direct -> public CORS proxies) and real
 * base64/raw/ZEUS format auto-detection.
 */
export function useSubscriptions() {
  const s = useMiSubStore()

  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProto, setSelectedProto] = useState('all')
  const [parsedNodes, setParsedNodes] = useState<ParsedNode[]>(() => parseMultipleNodes(s.subRawInput) as unknown as ParsedNode[])
  const [fetchStatus, setFetchStatus] = useState('')

  useEffect(() => {
    setParsedNodes(parseMultipleNodes(s.subRawInput) as unknown as ParsedNode[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.subRawInput])

  const protoCounts = useMemo(() => {
    const map: Record<string, number> = {}
    parsedNodes.forEach((n) => { map[n.protocol] = (map[n.protocol] || 0) + 1 })
    return map
  }, [parsedNodes])

  const filteredNodes = useMemo(() => {
    let list = parsedNodes
    if (selectedProto !== 'all') {
      list = list.filter((n) => n.protocol === selectedProto)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((n) =>
        n.name.toLowerCase().includes(q) ||
        n.address.toLowerCase().includes(q) ||
        (n.sni && n.sni.toLowerCase().includes(q)) ||
        String(n.port).includes(q)
      )
    }
    return list
  }, [parsedNodes, selectedProto, searchQuery])

  const fetchRemote = async (workerUrlOverride?: string) => {
    if (!s.subUrl.trim()) return
    setLoading(true)
    setFetchStatus('')
    try {
      const worker = workerUrlOverride || getWorkerUrl()
      const { lines, via } = await fetchSubscriptionSmart(s.subUrl.trim(), worker)
      s.setSubRawInput(lines.join('\n'))
      const viaLabel = via === 'worker' ? 'Cloudflare Worker شما'
        : via === 'direct' ? 'اتصال مستقیم'
        : `پراکسی عمومی (${via})`
      setFetchStatus(`✅ ${lines.length} کانفیگ دریافت شد — از طریق ${viaLabel}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setFetchStatus(`❌ ${msg}`)
      alert('خطا در دریافت سابسکریپشن: ' + msg)
    } finally {
      setLoading(false)
    }
  }

  const removeDuplicates = () => {
    const deduped = deduplicateNodes(parsedNodes)
    setParsedNodes(deduped)
    s.setSubRawInput(deduped.map((n: ParsedNode) => n.raw).join('\n'))
  }

  return {
    subUrl: s.subUrl, setSubUrl: s.setSubUrl,
    rawInput: s.subRawInput, setRawInput: s.setSubRawInput,
    loading,
    fetchStatus,
    searchQuery, setSearchQuery,
    selectedProto, setSelectedProto,
    parsedNodes,
    protoCounts,
    filteredNodes,
    fetchRemote,
    removeDuplicates,
  }
}
