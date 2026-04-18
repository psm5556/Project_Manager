import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useWebSocket() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
      wsRef.current = ws

      ws.onmessage = e => {
        const msg = JSON.parse(e.data)
        const { type, data } = msg

        if (type.startsWith('project_')) {
          queryClient.invalidateQueries({ queryKey: ['projects'] })
        }
        if (type.startsWith('tech_item_') && data.project_id) {
          queryClient.invalidateQueries({ queryKey: ['tech_items', data.project_id] })
        }
        if (type.startsWith('activity_')) {
          if (data.project_id) {
            queryClient.invalidateQueries({ queryKey: ['activities', 'project', data.project_id] })
          }
          if (data.tech_item_id) {
            queryClient.invalidateQueries({ queryKey: ['activities', 'ti', data.tech_item_id] })
          }
        }
      }

      ws.onclose = () => {
        retryRef.current = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [queryClient])
}
