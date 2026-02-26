/**
 * DocumentPreview.jsx
 *
 * Renders the parsed MongoDB document's `form` array as a live, interactive
 * HTML form using the ReferralFormRenderer — the same rendering approach
 * used by core-web's production ReferralForm component.
 *
 * Bi-directional sync support:
 *   - Each node with a `_id` gets data-node-id and data-occurrence attributes.
 *   - Clicking a node calls onNodeClick(id, occurrence).
 *   - The node matching activeNodeId gets the rf-node-highlight class.
 *   - mapNodeProps handles base components; syncProps handles field components.
 */

import ReferralFormRenderer from './renderer/ReferralFormRenderer'
import FieldRenderer from './FieldRenderer'

/**
 * Walk the form tree depth-first and assign a stable occurrence index
 * to every node with a `_id`. Returns a Map keyed by node object reference.
 */
function buildOccurrenceMap(nodes) {
  const map    = new Map()
  const counts = {}

  function walk(node) {
    if (!node || !node.component) return
    if (node._id != null) {
      const id  = node._id
      const occ = counts[id] ?? 0
      counts[id] = occ + 1
      map.set(node, occ)
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(walk)
    }
  }

  if (Array.isArray(nodes)) nodes.forEach(walk)
  return map
}

function buildSyncProps(node, occurrenceMap, onNodeClick, activeNodeId) {
  if (node._id == null) return undefined

  const occ = occurrenceMap.get(node)
  if (occ == null) return undefined

  const isActive =
    activeNodeId &&
    activeNodeId.id === node._id &&
    activeNodeId.occurrence === occ

  return {
    'data-node-id': node._id,
    'data-occurrence': occ,
    onClick: (e) => {
      e.stopPropagation()
      onNodeClick(node._id, occ)
    },
    className: isActive ? 'rf-node-highlight' : undefined,
  }
}

export default function DocumentPreview({ doc, error, onNodeClick, activeNodeId }) {
  const occurrenceMap = doc && Array.isArray(doc.form)
    ? buildOccurrenceMap(doc.form)
    : new Map()

  const mapNodeProps = (node, domProps) => {
    if (node._id == null) return domProps

    const occ = occurrenceMap.get(node)
    if (occ == null) return domProps

    const isActive =
      activeNodeId &&
      activeNodeId.id === node._id &&
      activeNodeId.occurrence === occ

    return {
      ...domProps,
      'data-node-id': node._id,
      'data-occurrence': occ,
      onClick: (e) => {
        e.stopPropagation()
        onNodeClick(node._id, occ)
      },
      className: [domProps.className, isActive && 'rf-node-highlight']
        .filter(Boolean)
        .join(' ') || undefined,
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2 bg-brand-grey-light border-b border-brand-grey-border flex-none">
        <span className="text-xs font-semibold text-brand-grey-dark uppercase tracking-wide">
          Form Preview
        </span>
        {doc && (
          <span className="text-xs text-gray-400">
            {doc._id || ''}
          </span>
        )}
      </div>

      {/* Error indicator (non-blocking — preview shows last good state) */}
      {error && (
        <div className="px-4 py-1 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs flex-none">
          Preview showing last valid state
        </div>
      )}

      {/* Scrollable preview area */}
      <div className="flex-1 overflow-auto document-preview-scroll">
        {!doc ? (
          <EmptyState />
        ) : (
          <div className="document-preview-inner p-6">
            <ReferralFormRenderer
              form={doc.form}
              mapNodeProps={mapNodeProps}
              renderField={(node, i) => (
                <FieldRenderer
                  key={node._key ?? i}
                  node={node}
                  syncProps={buildSyncProps(node, occurrenceMap, onNodeClick, activeNodeId)}
                />
              )}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------------
// Empty state
// -------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-400">
      <FormIcon />
      <p className="mt-4 text-base font-medium text-gray-500">No form loaded</p>
      <p className="mt-1 text-sm">Upload a DOCX file to see the form preview here</p>
    </div>
  )
}

function FormIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="8" y="4" width="32" height="40" rx="3" stroke="#D1D5DB" strokeWidth="2" fill="#F9FAFB" />
      <rect x="14" y="12" width="20" height="2" rx="1" fill="#D1D5DB" />
      <rect x="14" y="18" width="20" height="2" rx="1" fill="#D1D5DB" />
      <rect x="14" y="24" width="20" height="2" rx="1" fill="#D1D5DB" />
      <rect x="14" y="30" width="12" height="2" rx="1" fill="#D1D5DB" />
    </svg>
  )
}
