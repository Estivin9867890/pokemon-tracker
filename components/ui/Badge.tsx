import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'zinc'
  className?: string
}

const variants = {
  green:  'bg-emerald-400/10 text-emerald-400 border-emerald-400/25',
  amber:  'bg-amber-400/10   text-amber-400   border-amber-400/25',
  red:    'bg-red-400/10     text-red-400     border-red-400/25',
  blue:   'bg-blue-400/10   text-blue-400   border-blue-400/25',
  violet: 'bg-violet-400/10 text-violet-400 border-violet-400/25',
  zinc:   'bg-zinc-700/40   text-zinc-400   border-zinc-700',
}

export default function Badge({ children, variant = 'zinc', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}
