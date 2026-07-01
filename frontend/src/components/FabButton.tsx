import { Sparkles } from 'lucide-react'

interface FabButtonProps {
  onClick: () => void
  disabled?: boolean
  label?: string
}

export default function FabButton({
  onClick,
  disabled = false,
  label = '운명의 좌표 뽑기',
}: FabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-semibold text-white shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ backgroundColor: disabled ? '#ccc' : '#FF6B6B' }}
    >
      <Sparkles size={20} />
      {label}
    </button>
  )
}
