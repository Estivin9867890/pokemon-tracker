import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  suffix?: string
}

export default function Input({ label, hint, error, suffix, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-zinc-400">
          {label}
          {props.required && <span className="text-zinc-600 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          className={cn(
            'w-full bg-zinc-900 border rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600',
            'focus:outline-none focus:ring-1 transition-colors',
            error
              ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
              : 'border-zinc-800 focus:border-zinc-600 focus:ring-zinc-600/20',
            suffix ? 'pr-9' : '',
            className
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && !error && <p className="text-[11px] text-zinc-600">{hint}</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
