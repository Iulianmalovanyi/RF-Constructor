import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * Resizable split pane.
 * Expects exactly two children: [leftPanel, rightPanel].
 * Default split is 50/50, clamped to 20%–80%.
 */
export default function SplitPane({ children, defaultSplit = 0.5 }) {
  const [split, setSplit] = useState(defaultSplit)
  const containerRef = useRef(null)
  const isDragging = useRef(false)

  const startDrag = useCallback((e) => {
    e.preventDefault()
    isDragging.current = true

    const onMove = (e) => {
      if (!isDragging.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newSplit = (e.clientX - rect.left) / rect.width
      setSplit(Math.min(Math.max(newSplit, 0.2), 0.8))
    }

    const onUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Prevent text selection during drag
  useEffect(() => {
    const prevent = (e) => { if (isDragging.current) e.preventDefault() }
    window.addEventListener('selectstart', prevent)
    return () => window.removeEventListener('selectstart', prevent)
  }, [])

  const [left, right] = children

  return (
    <div
      ref={containerRef}
      className="flex flex-row w-full h-full overflow-hidden"
    >
      {/* Left panel */}
      <div
        style={{ width: `${split * 100}%` }}
        className="h-full overflow-hidden flex flex-col"
      >
        {left}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        className="w-1 flex-none cursor-col-resize bg-brand-grey-border hover:bg-brand-blue transition-colors duration-150 select-none"
        title="Drag to resize"
      />

      {/* Right panel */}
      <div className="flex-1 h-full overflow-hidden flex flex-col">
        {right}
      </div>
    </div>
  )
}
