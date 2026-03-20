
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface StatCounterProps {
  label: string
  value: number
  suffix?: string
  color?: 'nzu-green' | 'nzu-gold' | 'white' | 'nzu-live'
}

export function StatCounter({ label, value, suffix = '', color = 'white' }: StatCounterProps) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let start = 0
    const end = value
    const duration = 1500
    const increment = end / (duration / 16)
    
    const timer = setInterval(() => {
      start += increment
      if (start >= end) {
        setCount(end)
        clearInterval(timer)
      } else {
        setCount(Math.floor(start))
      }
    }, 16)

    return () => clearInterval(timer)
  }, [value])

  const colorClasses = {
    'nzu-green': 'text-nzu-green drop-shadow-[0_0_15px_rgba(46,213,115,0.4)]',
    'nzu-gold': 'text-nzu-gold drop-shadow-[0_0_15px_rgba(255,215,0,0.3)]',
    'white': 'text-white/80',
    'nzu-live': 'text-[#ff4757] drop-shadow-[0_0_15px_rgba(255,71,87,0.4)]'
  }

  return (
    <div className="group relative bg-[#0A100D] border border-white/5 p-6 rounded-[2rem] hover:border-white/10 transition-all duration-500 overflow-hidden text-center lg:text-left">
      <div className="absolute top-0 left-0 w-1 h-0 bg-nzu-green group-hover:h-full transition-all duration-700" />
      <div className="relative z-10">
        <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mb-2">{label}</div>
        <div className={cn("text-4xl lg:text-5xl font-black italic tracking-tighter tabular-nums", colorClasses[color])}>
          {count.toLocaleString()}{suffix}
        </div>
      </div>
    </div>
  )
}
