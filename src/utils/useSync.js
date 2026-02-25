/**
 * useSync.js
 *
 * Bi-directional synchronisation between the Monaco JSON editor and the
 * form preview panel.
 *
 * JSON → Preview:
 *   When the cursor moves in the editor, find the nearest _id value above
 *   the cursor line, highlight that element in the preview, and scroll it
 *   into view.
 *
 * Preview → JSON:
 *   When a preview element with a data-node-id is clicked, navigate the
 *   editor to the matching _id line and apply a line decoration highlight.
 */

import { useRef, useState, useEffect } from 'react'

export function useSync(jsonString) {
  const editorRef      = useRef(null)
  const monacoRef      = useRef(null)
  const decorationsRef = useRef([])    // holds Monaco decoration IDs for cleanup
  const jsonStringRef  = useRef(jsonString)
  const [activeNodeId, setActiveNodeId] = useState(null)

  // Keep ref in sync with latest jsonString so the cursor listener
  // (which closes over this ref, not the state) never reads stale data.
  useEffect(() => {
    jsonStringRef.current = jsonString
  }, [jsonString])

  /**
   * Called by JsonEditor when Monaco mounts.
   * Stores editor + monaco instances and registers the cursor listener.
   */
  const onEditorMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    editor.onDidChangeCursorPosition((e) => {
      const id = findIdAboveLine(jsonStringRef.current, e.position.lineNumber)
      if (!id) return

      setActiveNodeId(id)

      // Scroll matching preview element into view
      try {
        const selector = `[data-node-id="${CSS.escape(id)}"]`
        const el = document.querySelector(selector)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      } catch (_) { /* degrade gracefully if CSS.escape not supported */ }
    })
  }

  /**
   * Called by DocumentPreview when a node with a _id is clicked.
   * Navigates the editor to the matching line and highlights it.
   */
  const onPreviewNodeClick = (id) => {
    setActiveNodeId(id)

    const lineNumber = findLineForId(jsonStringRef.current, id)
    if (lineNumber === -1) return

    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    editor.revealLineInCenter(lineNumber)
    editor.setPosition({ lineNumber, column: 1 })
    editor.focus()

    // Apply a yellow left-border line decoration
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      [{
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'rf-editor-highlight',
        },
      }]
    )
  }

  return { onEditorMount, onPreviewNodeClick, activeNodeId }
}

// -------------------------------------------------------------------------
// Pure utility functions
// -------------------------------------------------------------------------

/**
 * Scan backward from lineNumber (1-based) to find the nearest _id value
 * at or above the cursor. Handles both:
 *   "_id": "someValue"   (strict JSON)
 *   _id: "someValue"     (MongoDB shell format)
 *
 * Skips ObjectId(...) patterns since those are document-level _id values,
 * not component node IDs (they are not quoted strings).
 *
 * Returns the captured id string, or null if not found.
 */
function findIdAboveLine(jsonString, lineNumber) {
  const lines = jsonString.split('\n').slice(0, lineNumber)
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/"?_id"?\s*:\s*"([^"]+)"/)
    if (m) return m[1]
  }
  return null
}

/**
 * Find the 1-based line number of the first line containing _id: "id".
 * Returns -1 if not found.
 */
function findLineForId(jsonString, id) {
  // Escape the id value so it is safe to use in a RegExp
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`"?_id"?\\s*:\\s*"${escaped}"`)
  const lines = jsonString.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1   // 1-based line number
  }
  return -1
}
