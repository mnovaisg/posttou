export function SliderControl({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  label: string
  leftLabel: string
  rightLabel: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-ink-200 accent-brand-600 dark:bg-ink-700"
      />
      <div className="flex justify-between text-xs text-ink-400">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )
}
