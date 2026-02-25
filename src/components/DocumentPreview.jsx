/**
 * DocumentPreview.jsx
 *
 * Renders the parsed MongoDB document's `form` array as a live, interactive
 * HTML form. Components are rendered exactly as specified by the JSON —
 * styles, classNames, and structure from the DOCX template are preserved.
 *
 * The brand design system is NOT applied here. The preview must match the
 * original DOCX template as closely as possible.
 *
 * Bi-directional sync support:
 *   - Each component node with a `_id` gets a `data-node-id` attribute so
 *     the editor cursor listener can find it via querySelector.
 *   - Clicking a node with a `_id` calls onNodeClick(id) to navigate the editor.
 *   - The node matching `activeNodeId` receives the `rf-node-highlight` class.
 */

/**
 * Main preview component.
 * Props:
 *   doc: object | null        — parsed MongoDB document JS object
 *   error: string | null      — parse error (preview stays on last good doc)
 *   onNodeClick(id: string)   — called when a node with _id is clicked
 *   activeNodeId: string|null — _id of the currently highlighted node
 */
export default function DocumentPreview({ doc, error, onNodeClick, activeNodeId }) {
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
          <div
            className="document-preview-inner p-6"
            style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px' }}
          >
            {Array.isArray(doc.form) && doc.form.map((node, i) => (
              <ComponentNode
                key={i}
                node={node}
                onNodeClick={onNodeClick}
                activeNodeId={activeNodeId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------------
// Recursive component renderer
// -------------------------------------------------------------------------

function ComponentNode({ node, onNodeClick, activeNodeId }) {
  if (!node || !node.component) return null

  const { component, props = {}, children } = node

  // --- Bi-directional sync ---
  // Nodes with a _id get a data-node-id attribute, a click handler, and the
  // rf-node-highlight class when they match the currently active node.
  const nodeId   = node._id ?? null
  const isActive = nodeId !== null && nodeId === activeNodeId

  // Destructure known props — everything else is ignored
  const {
    text,
    style,
    className,
    id,
    type,
    href,
    target,
    src,
    name,
    value,
    checked,
    htmlFor,
    // Handle both camelCase and lowercase variants (both exist in JSON examples)
    colSpan,
    colspan,
    rowSpan,
    rowspan,
  } = props ?? {}

  const domProps = {}
  if (style)     domProps.style = style
  if (className) domProps.className = className

  // Merge highlight class with any existing className from JSON
  const mergedClassName = [domProps.className, isActive ? 'rf-node-highlight' : '']
    .filter(Boolean).join(' ') || undefined

  // Build sync-related props — only attach to nodes that have a _id
  const syncProps = {}
  if (nodeId) {
    syncProps['data-node-id'] = nodeId
    syncProps.onClick = (e) => { e.stopPropagation(); onNodeClick?.(nodeId) }
  }
  if (mergedClassName) syncProps.className = mergedClassName

  // Render children recursively, or fall back to text content
  const hasChildren = Array.isArray(children) && children.length > 0
  const renderedChildren = hasChildren
    ? children.map((child, i) => (
        <ComponentNode
          key={i}
          node={child}
          onNodeClick={onNodeClick}
          activeNodeId={activeNodeId}
        />
      ))
    : null

  // Rule: if children exist, render them (text prop is secondary)
  // If no children, render text as a text node
  const content = renderedChildren ?? (text != null ? text : null)

  switch (component) {
    case 'div':
      return <div {...domProps} {...syncProps}>{content}</div>

    case 'span':
      return <span {...domProps} {...syncProps}>{content}</span>

    case 'text':
      // Rare component type — render as inline span
      return <span {...domProps} {...syncProps}>{content}</span>

    case 'table':
      return <table {...domProps} {...syncProps}>{content}</table>

    case 'thead':
      return <thead {...domProps} {...syncProps}>{content}</thead>

    case 'tbody':
      return <tbody {...domProps} {...syncProps}>{content}</tbody>

    case 'tr':
      return <tr {...domProps} {...syncProps}>{content}</tr>

    case 'td':
      return (
        <td
          {...domProps}
          {...syncProps}
          colSpan={colSpan ?? colspan}
          rowSpan={rowSpan ?? rowspan}
        >
          {content}
        </td>
      )

    case 'th':
      return (
        <th
          {...domProps}
          {...syncProps}
          colSpan={colSpan ?? colspan}
          rowSpan={rowSpan ?? rowspan}
        >
          {content}
        </th>
      )

    case 'h1':
      return <h1 {...domProps} {...syncProps}>{content}</h1>

    case 'h4':
      return <h4 {...domProps} {...syncProps}>{content}</h4>

    case 'ul':
      return <ul {...domProps} {...syncProps}>{content}</ul>

    case 'ol':
      return <ol {...domProps} {...syncProps}>{content}</ol>

    case 'li':
      return <li {...domProps} {...syncProps}>{content}</li>

    case 'a':
      return (
        <a
          href={href}
          target={target}
          rel="noreferrer"
          {...domProps}
          {...syncProps}
        >
          {text ?? content}
        </a>
      )

    case 'img':
    case 'image':
      return <img src={src} alt="" {...domProps} {...syncProps} />

    case 'input':
      // Use defaultValue/defaultChecked (uncontrolled) so the user can type
      // into the form fields without React managing per-field state.
      // Attach sync props directly (no domProps wrapper — input is a void element).
      if (type === 'checkbox' || type === 'radio') {
        return (
          <input
            type={type}
            id={id}
            name={name}
            defaultValue={value}
            defaultChecked={checked}
            className={[className ?? '', isActive ? 'rf-node-highlight' : ''].filter(Boolean).join(' ') || undefined}
            style={style}
            data-node-id={nodeId ?? undefined}
            onClick={nodeId ? (e) => { e.stopPropagation(); onNodeClick?.(nodeId) } : undefined}
          />
        )
      }
      return (
        <input
          type={type ?? 'text'}
          id={id}
          name={name}
          defaultValue={value ?? ''}
          className={[className ?? '', isActive ? 'rf-node-highlight' : ''].filter(Boolean).join(' ') || undefined}
          style={style}
          data-node-id={nodeId ?? undefined}
          onClick={nodeId ? (e) => { e.stopPropagation(); onNodeClick?.(nodeId) } : undefined}
        />
      )

    case 'textarea':
      return (
        <textarea
          id={id}
          name={name}
          className={[className ?? '', isActive ? 'rf-node-highlight' : ''].filter(Boolean).join(' ') || undefined}
          style={style}
          defaultValue={value ?? ''}
          data-node-id={nodeId ?? undefined}
          onClick={nodeId ? (e) => { e.stopPropagation(); onNodeClick?.(nodeId) } : undefined}
        />
      )

    case 'label':
      return (
        <label htmlFor={htmlFor} {...domProps} {...syncProps}>
          {text ?? content}
        </label>
      )

    default:
      // Unknown component: render as div so the tree doesn't break
      return (
        <div data-unknown-component={component} {...domProps} {...syncProps}>
          {content}
        </div>
      )
  }
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
