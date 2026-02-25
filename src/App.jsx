import { useState, useCallback, useRef } from 'react'
import FileUpload from './components/FileUpload.jsx'
import SplitPane from './components/SplitPane.jsx'
import JsonEditor from './components/JsonEditor.jsx'
import DocumentPreview from './components/DocumentPreview.jsx'
import { docxParser } from './utils/docxParser.js'
import { mongoParser, mongoStringify } from './utils/mongoParser.js'

const DEBOUNCE_MS = 300

export default function App() {
  const [jsonString, setJsonString]   = useState('')
  const [parsedDoc, setParsedDoc]     = useState(null)
  const [parseError, setParseError]   = useState(null)
  const [fileName, setFileName]       = useState('')
  const [isLoading, setIsLoading]     = useState(false)

  const debounceTimer = useRef(null)

  // ------------------------------------------------------------------
  // Upload flow: file → docxParser → mongoStringify → editor + preview
  // ------------------------------------------------------------------
  const handleFile = useCallback(async (file) => {
    setIsLoading(true)
    setParseError(null)

    try {
      const arrayBuffer = await readAsArrayBuffer(file)
      const envelope = await docxParser(arrayBuffer, file.name)
      const str = mongoStringify(envelope, 4)

      setJsonString(str)
      setParsedDoc(envelope)
      setFileName(file.name)
    } catch (err) {
      console.error('DOCX parse error:', err)
      setParseError(`Failed to parse DOCX: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ------------------------------------------------------------------
  // Editor change flow: text → debounced mongoParser → preview update
  // ------------------------------------------------------------------
  const handleEditorChange = useCallback((newStr) => {
    setJsonString(newStr)

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      const result = mongoParser(newStr)
      if (result.ok) {
        setParsedDoc(result.value)
        setParseError(null)
      } else {
        setParseError(result.error)
        // Preview stays on last successfully parsed doc
      }
    }, DEBOUNCE_MS)
  }, [])

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------
  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans">
      <Header />
      <FileUpload
        onFile={handleFile}
        fileName={fileName}
        isLoading={isLoading}
      />
      <div className="flex-1 overflow-hidden">
        <SplitPane>
          <JsonEditor
            value={jsonString}
            onChange={handleEditorChange}
            error={parseError}
          />
          <DocumentPreview
            doc={parsedDoc}
            error={parseError}
          />
        </SplitPane>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Header — dark green bar with white butterfly logo
// ------------------------------------------------------------------
function Header() {
  return (
    <header className="flex items-center gap-3 px-6 py-3 bg-brand-green-dark flex-none">
      {/* Butterfly logo (brand purple background, white icon) */}
      <div
        className="flex items-center justify-center rounded-md flex-none"
        style={{ width: 32, height: 32, backgroundColor: '#7B00E0' }}
        aria-hidden="true"
      >
        <ButterflyIcon />
      </div>

      <span className="text-white font-semibold text-base tracking-wide">
        RF Constructor
      </span>
    </header>
  )
}

function ButterflyIcon() {
  // Simplified butterfly / double-fan icon matching the brand logo
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="white" aria-hidden="true">
      <path d="M10 10 C6 7, 2 5, 2 2 C5 2, 8 5, 10 10Z" />
      <path d="M10 10 C14 7, 18 5, 18 2 C15 2, 12 5, 10 10Z" />
      <path d="M10 10 C6 13, 2 15, 2 18 C5 18, 8 15, 10 10Z" />
      <path d="M10 10 C14 13, 18 15, 18 18 C15 18, 12 15, 10 10Z" />
    </svg>
  )
}

// ------------------------------------------------------------------
// Helper: read File as ArrayBuffer
// ------------------------------------------------------------------
function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}
