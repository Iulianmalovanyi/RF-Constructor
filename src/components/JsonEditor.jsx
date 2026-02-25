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
export default function JsonEditor({ value, onChange, error, onMount }) {
  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2 bg-brand-grey-light border-b border-brand-grey-border flex-none">
        <span className="text-xs font-semibold text-brand-grey-dark uppercase tracking-wide">
          JSON Editor
        </span>
        {value && (
          <span className="text-xs text-gray-400">
            {value.split('\n').length} lines
          </span>
        )}
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

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="flex-none mt-0.5" aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  )
}
