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
      className="flex items-center gap-2.5 px-7 py-4 rounded-2xl text-base font-bold text-white shadow-xl shadow-primary/30 transition-all duration-200 active:scale-[0.96] hover:shadow-primary/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
      style={{
        background: disabled ? '#ccc' : 'linear-gradient(135deg, #FF6B6B 0%, #ee5a24 100%)',
      }}
    >
      <Sparkles size={20} className="drop-shadow-sm" />
      {label}
    </button>
  )
}
