import { useState } from 'react'
import Editor from '@monaco-editor/react'

/**
 * Monaco Editor wrapper.
 *
 * Props:
 *   value: string          — raw MongoDB-format JSON string
 *   onChange(str: string)  — called on every keystroke (parent debounces)
 *   error: string | null   — parse error message to display
 *   onMount(editor, monaco) — called when Monaco mounts (used by useSync)
 */
export default function JsonEditor({ value, onChange, error, onMount, fileName }) {
  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2 bg-brand-grey-light border-b border-brand-grey-border flex-none">
        <span className="text-xs font-semibold text-brand-grey-dark uppercase tracking-wide">
          JSON Editor
        </span>
        <div className="flex items-center gap-3">
          {value && (
            <span className="text-xs text-gray-400">
              {value.split('\n').length} lines
            </span>
          )}
          {value && <DownloadButton value={value} fileName={fileName} />}
          {value && <CopyButton value={value} />}
        </div>
      </div>

      {/* Error banner — non-blocking, sits above the editor */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs flex-none">
          <ErrorIcon />
          <span className="font-medium">Parse error:</span>
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Monaco Editor — fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language="javascript"
          theme="vs"
          value={value}
          onChange={(val) => onChange(val ?? '')}
          onMount={onMount}
          options={{
            minimap: { enabled: false },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            tabSize: 4,
            automaticLayout: true,
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>
    </div>
  )
}

function DownloadButton({ value, fileName }) {
  const handleDownload = () => {
    const baseName = fileName
      ? fileName.replace(/\.(docx|json)$/i, '')
      : 'document'
    const blob = new Blob([value], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${baseName}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleDownload}
      title="Download JSON file"
      className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors
        bg-brand-green-mid text-white hover:bg-brand-green-dark active:opacity-90"
    >
      <DownloadIcon />
      Download JSON
    </button>
  )
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      {/* Toast notification */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
          flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg
          bg-gray-800 text-white text-sm font-medium pointer-events-none
          animate-fade-in">
          <CheckIcon />
          JSON copied to clipboard.
        </div>
      )}

      <button
        onClick={handleCopy}
        title="Copy JSON to clipboard"
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors
          bg-brand-blue text-white hover:bg-blue-800 active:bg-blue-900"
      >
        <CopyIcon />
        Copy JSON
      </button>
    </>
  )
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M8 2a2 2 0 00-2 2v1H5a2 2 0 00-2 2v9a2 2 0 002 2h8a2 2 0 002-2v-1h1a2 2 0 002-2V6a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H8zm0 2h4v1H8V4zm-3 3h10v9H5V7z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="flex-none mt-0.5" aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  )
}
