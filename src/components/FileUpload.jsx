import { useRef, useState, useCallback } from 'react'

/**
 * Persistent upload bar — always visible at the top of the page.
 *
 * Props:
 *   onFile(file: File)  — called when a valid .docx file is selected
 *   fileName: string    — currently loaded file name ('' if none)
 *   isLoading: boolean  — show spinner while parsing
 */
export default function FileUpload({ onFile, fileName, isLoading }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.docx')) {
      alert('Please upload a .docx file')
      return
    }
    onFile(file)
  }, [onFile])

  const handleInputChange = (e) => {
    handleFile(e.target.files?.[0])
    // Reset so the same file can be re-uploaded
    e.target.value = ''
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }, [handleFile])

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={[
        'flex items-center gap-4 px-6 py-3 border-b transition-colors duration-150',
        'bg-white border-brand-grey-border',
        isDragOver ? 'bg-blue-50 border-brand-blue' : '',
      ].join(' ')}
    >
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Upload button */}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isLoading}
        className={[
          'flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-medium text-white',
          'bg-brand-blue hover:bg-blue-800 active:bg-blue-900',
          'transition-colors duration-150 select-none',
          'focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-1',
          isLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        {isLoading ? (
          <>
            <Spinner />
            <span>Parsing…</span>
          </>
        ) : (
          <>
            <UploadIcon />
            <span>Upload DOCX</span>
          </>
        )}
      </button>

      {/* Current file name */}
      {fileName ? (
        <div className="flex items-center gap-2 min-w-0">
          <DocIcon />
          <span
            className="text-sm text-brand-grey-dark font-medium truncate max-w-xs"
            title={fileName}
          >
            {fileName}
          </span>
        </div>
      ) : (
        <span className="text-sm text-gray-400">
          {isDragOver ? 'Drop to upload' : 'No file loaded — drag & drop or click Upload'}
        </span>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------
// Inline SVG icons (no external icon library dependency)
// -------------------------------------------------------------------------

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="text-brand-blue flex-none" aria-hidden="true">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
