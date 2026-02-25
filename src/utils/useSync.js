/**
 * useSync.js
 *
 * Bi-directional synchronisation between the Monaco JSON editor and the
 * form preview panel.
 *
 * activeNodeId shape: { id: string, occurrence: number } | null
 *
 * The `occurrence` is the zero-indexed count of how many times that _id
 * value appeared in the JSON *before* this instance. This makes the key
 * unique even when structural nodes share the same _id string (e.g. all
 * tables have _id: "table").
 *
 * JSON → Preview:
 *   Monaco cursor position event → findIdAboveLine → { id, occurrence }
 *   → querySelector([data-node-id][data-occurrence]) → scrollIntoView +
 *   rf-node-highlight class on the exact matching preview element.
 *
 * Preview → JSON:
 *   Click on a preview element → onNodeClick(id, occurrence) →
 *   findLineForId(id, occurrence) → editor.revealLineInCenter() +
 *   deltaDecorations line highlight.
 *
 * The fix does NOT modify jsonString in any way — it only reads it.
 * JSON file uploads remain byte-for-byte identical in the editor.
 */

import { useRef, useState, useEffect } from 'react'

export function useSync(jsonString) {
  const editorRef      = useRef(null)
  const monacoRef      = useRef(null)
  const decorationsRef = useRef([])    // Monaco decoration IDs for cleanup
  const jsonStringRef  = useRef(jsonString)
  // activeNodeId: { id: string, occurrence: number } | null
  const [activeNodeId, setActiveNodeId] = useState(null)

  // Keep ref in sync so the cursor listener (which closes over this ref,
  // not the state value) never reads stale data after an upload or edit.
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
      const result = findIdAboveLine(jsonStringRef.current, e.position.lineNumber)
      if (!result) return

      setActiveNodeId(result)   // { id, occurrence }

      try {
        const selector = `[data-node-id="${CSS.escape(result.id)}"][data-occurrence="${result.occurrence}"]`
        const el = document.querySelector(selector)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      } catch (_) { /* degrade gracefully if CSS.escape not available */ }
    })
  }

  /**
   * Called by DocumentPreview when a node with a _id is clicked.
   * `occurrence` is the zero-indexed occurrence of that _id in the rendered
   * component tree — passed from `data-occurrence` on the DOM element.
   */
  const onPreviewNodeClick = (id, occurrence) => {
    setActiveNodeId({ id, occurrence })

    const lineNumber = findLineForId(jsonStringRef.current, id, occurrence)
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
 * at or above the cursor. Returns { id, occurrence } where occurrence is
 * how many times that same id appeared in the JSON before the matched line.
 *
 * Design: simple backward scan — finds the nearest `_id` line above the
 * cursor, then counts prior occurrences of that same id. This is reliable
 * because `_id` always appears at the top of its JSON object (before
 * `component`, `props`, and `children`), so the nearest `_id` above the
 * cursor is always the direct enclosing component's id.
 *
 * Handles both:
 *   "_id": "someValue"  (strict JSON)
 *   _id: "someValue"    (MongoDB shell format)
 *
 * ObjectId("...") patterns are not captured because they are not quoted
 * strings matching ([^"]+), so the top-level document _id is safely skipped.
 */
function findIdAboveLine(jsonString, lineNumber) {
  const lines = jsonString.split('\n').slice(0, lineNumber)
  const idRe  = /"?_id"?\s*:\s*"([^"]+)"/

  // Walk backward to find the nearest _id line
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(idRe)
    if (!m) continue

    const id = m[1]

    // Count how many times this same _id appeared before line i
    const escaped  = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const countRe  = new RegExp(`"?_id"?\\s*:\\s*"${escaped}"`)
    let occurrence = 0
    for (let j = 0; j < i; j++) {
      if (countRe.test(lines[j])) occurrence++
    }

    return { id, occurrence }
  }

  return null
}

/**
 * Return the 1-based line number of the Nth (zero-indexed) occurrence of
 * _id: "id" in the jsonString, or -1 if not found.
 *
 * `occurrence` ensures we navigate to the exact JSON block that corresponds
 * to the clicked or cursor-targeted component — not just the first match.
 */
function findLineForId(jsonString, id, occurrence) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re      = new RegExp(`"?_id"?\\s*:\\s*"${escaped}"`)
  const lines   = jsonString.split('\n')
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      if (count === occurrence) return i + 1   // 1-based
      count++
    }
  }
  return -1
}
