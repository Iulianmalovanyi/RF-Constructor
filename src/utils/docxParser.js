/**
 * docxParser.js
 *
 * Converts a DOCX ArrayBuffer into a MongoDB-format JS object matching
 * the schema defined in /examples/json/.
 *
 * Strategy:
 *   1. mammoth.convertToHtml() → raw HTML string
 *   2. DOMParser → browser DOM tree
 *   3. Walk DOM → component tree (matching the JSON schema)
 *   4. Wrap in MongoDB document envelope
 *
 * Limitations:
 *   - mammoth does not preserve table cell background colours from DOCX
 *   - Some complex DOCX formatting may not map 1:1
 *   - Input field IDs are derived from adjacent label text (best-effort)
 */

import mammoth from 'mammoth'
import { MongoLiteral } from './mongoParser.js'

// Module-level counter, reset before each parse call
let inputCounter = 0

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Parse a DOCX file into a MongoDB-format JS object.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} fileName  e.g. "BRADFORD_TEACHING_US_PELVIS.docx"
 * @returns {Promise<object>}  MongoDB document envelope
 */
export async function docxParser(arrayBuffer, fileName) {
  inputCounter = 0

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        'b => b',
        'i => i',
        'u => u',
      ]
    }
  )

  const parser = new DOMParser()
  const doc = parser.parseFromString(result.value, 'text/html')
  const bodyChildren = Array.from(doc.body.childNodes)

  const formArray = bodyChildren
    .map(walkNode)
    .filter(Boolean)

  return buildEnvelope(formArray, fileName)
}

// -------------------------------------------------------------------------
// Envelope builder
// -------------------------------------------------------------------------

function buildEnvelope(formArray, fileName) {
  const id = fileName.replace(/\.docx$/i, '').toUpperCase()
  const now = new Date().toISOString()

  return {
    _id: id,
    version: new MongoLiteral('NumberLong(1)'),
    type: 'REFERRAL',
    name: '',
    description: '',
    ccgs: [],
    excludedCcgs: [],
    hospitals: [],
    factors: [],
    formS3Key: fileName,
    formVersion: '1.0',
    form: formArray,
    ccgResources: {},
    deleted: false,
    createdAt: new MongoLiteral(`ISODate("${now}")`),
    updatedOn: new MongoLiteral(`ISODate("${now}")`),
    createdBy: 'system',
    updatedBy: 'system',
    _class: 'ReferralForm',
  }
}

// -------------------------------------------------------------------------
// DOM walker
// -------------------------------------------------------------------------

function walkNode(domNode) {
  // Text node
  if (domNode.nodeType === Node.TEXT_NODE) {
    const text = domNode.textContent.trim()
    if (!text) return null
    return { component: 'span', props: { text } }
  }

  // Only process element nodes
  if (domNode.nodeType !== Node.ELEMENT_NODE) return null

  const tag = domNode.tagName.toLowerCase()
  const children = Array.from(domNode.childNodes)
    .map(walkNode)
    .filter(Boolean)

  switch (tag) {
    case 'p':
      return buildParagraph(domNode, children)
    case 'div':
      return buildDiv(domNode, children)
    case 'table':
      return buildTable(domNode, children)
    case 'thead':
      return { component: 'thead', children }
    case 'tbody':
      return { component: 'tbody', children }
    case 'tr':
      return buildTr(domNode, children)
    case 'td':
      return buildTd(domNode, children)
    case 'th':
      return buildTh(domNode, children)
    case 'strong':
    case 'b':
      return buildBoldSpan(domNode)
    case 'em':
    case 'i':
      return buildItalicSpan(domNode)
    case 'u':
      return buildUnderlineSpan(domNode)
    case 'span':
      return buildSpan(domNode, children)
    case 'a':
      return buildLink(domNode, children)
    case 'img':
      return buildImage(domNode)
    case 'h1':
    case 'h2':
    case 'h3':
      return buildHeading('h1', domNode, children)
    case 'h4':
    case 'h5':
    case 'h6':
      return buildHeading('h4', domNode, children)
    case 'ul':
      return { component: 'ul', children }
    case 'ol':
      return { component: 'ol', children }
    case 'li':
      return { component: 'li', children: children.length ? children : undefined, props: { text: domNode.textContent.trim() } }
    case 'br':
      return null
    default:
      return children.length ? { component: 'div', children } : null
  }
}

// -------------------------------------------------------------------------
// Element builders
// -------------------------------------------------------------------------

function buildParagraph(domNode, children) {
  const style = extractInlineStyle(domNode)
  const text = domNode.textContent.trim()

  if (!children.length && !text) return null

  const node = { component: 'div' }
  if (Object.keys(style).length) node.props = { style }

  if (children.length) {
    node.children = children
  } else {
    node.props = { ...(node.props || {}), text }
  }

  return node
}

function buildDiv(domNode, children) {
  const style = extractInlineStyle(domNode)
  const className = domNode.getAttribute('class') || undefined
  const text = domNode.textContent.trim()

  if (!children.length && !text) return null

  const props = {}
  if (Object.keys(style).length) props.style = style
  if (className) props.className = className

  const node = { component: 'div', props }

  if (children.length) {
    node.children = children
  } else {
    props.text = text
  }

  return node
}

function buildTable(domNode, children) {
  inputCounter++
  return {
    _id: 'table',
    component: 'table',
    children,
    props: {
      className: 'oxford-table',
      style: { margin: '15px 0' }
    }
  }
}

function buildTr(domNode, children) {
  const style = extractInlineStyle(domNode)
  const node = { component: 'tr', children }
  if (Object.keys(style).length) node.props = { style }
  return node
}

function buildTd(domNode, children) {
  return buildCell('td', domNode, children)
}

function buildTh(domNode, children) {
  return buildCell('th', domNode, children)
}

function buildCell(component, domNode, children) {
  const colSpan = domNode.getAttribute('colspan') || domNode.getAttribute('colSpan')
  const rowSpan = domNode.getAttribute('rowspan') || domNode.getAttribute('rowSpan')
  const style = extractInlineStyle(domNode)

  const props = {}
  if (colSpan && colSpan !== '1') props.colSpan = colSpan
  if (rowSpan && rowSpan !== '1') props.rowSpan = rowSpan
  if (Object.keys(style).length) props.style = style

  // Input inference: if this cell is empty, check previous sibling for a label
  let resolvedChildren = children
  if (children.length === 0) {
    const prevSibling = domNode.previousElementSibling
    const labelText = prevSibling?.textContent?.trim()

    if (labelText && labelText.length > 0 && !/^[\s\d]*$/.test(labelText)) {
      inputCounter++
      const fieldId = toCamelCase(labelText) || `input_${inputCounter}`
      const isMultiLine = multiLineHeuristic(labelText)

      const inputNode = isMultiLine
        ? {
            _id: fieldId,
            component: 'textarea',
            props: {
              id: fieldId,
              className: 'input-block'
            }
          }
        : {
            _id: fieldId,
            component: 'input',
            props: {
              type: 'text',
              className: 'input-block',
              id: fieldId
            }
          }

      resolvedChildren = [inputNode]
      const node = { _id: `td${inputCounter}`, component, children: resolvedChildren, props }
      return node
    }
  }

  const node = { component, children: resolvedChildren, props }
  return node
}

function buildBoldSpan(domNode) {
  const children = Array.from(domNode.childNodes).map(walkNode).filter(Boolean)
  const text = domNode.textContent

  if (children.length > 1) {
    return { component: 'span', props: { style: { fontWeight: 'bold' } }, children }
  }
  return { component: 'span', props: { text, style: { fontWeight: 'bold' } } }
}

function buildItalicSpan(domNode) {
  const text = domNode.textContent
  return { component: 'span', props: { text, style: { fontStyle: 'italic' } } }
}

function buildUnderlineSpan(domNode) {
  const text = domNode.textContent
  return { component: 'span', props: { text, style: { textDecoration: 'underline' } } }
}

function buildSpan(domNode, children) {
  const style = extractInlineStyle(domNode)
  const text = domNode.textContent.trim()
  const props = {}
  if (Object.keys(style).length) props.style = style

  if (children.length) {
    return { component: 'span', props, children }
  }
  if (text) {
    props.text = text
    return { component: 'span', props }
  }
  return null
}

function buildLink(domNode, children) {
  inputCounter++
  const href = domNode.getAttribute('href') || ''
  const text = domNode.textContent.trim()
  const style = extractInlineStyle(domNode)
  const props = {
    href,
    target: '_blank',
    text,
    className: 'link-default'
  }
  if (Object.keys(style).length) props.style = style

  return {
    _id: `a${inputCounter}`,
    component: 'a',
    props
  }
}

function buildImage(domNode) {
  const src = domNode.getAttribute('src') || ''
  const style = extractInlineStyle(domNode)
  const props = { src }
  if (Object.keys(style).length) props.style = style
  else props.style = { maxWidth: '100%' }

  return { component: 'img', props }
}

function buildHeading(level, domNode, children) {
  const text = domNode.textContent.trim()
  const _id = toCamelCase(text) || `heading_${inputCounter}`
  const node = { _id, component: level, props: { text } }
  if (children.length) node.children = children
  return node
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function extractInlineStyle(domNode) {
  const style = {}
  const s = domNode.style
  if (!s) return style

  const props = [
    'fontWeight', 'fontStyle', 'textDecoration', 'textAlign',
    'color', 'backgroundColor', 'fontSize', 'width', 'margin',
    'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
    'padding', 'paddingTop', 'paddingBottom',
    'display', 'alignItems', 'justifyContent', 'gap',
    'gridTemplateColumns', 'float', 'border', 'borderColor',
    'verticalAlign', 'whiteSpace', 'lineHeight',
  ]

  for (const prop of props) {
    if (s[prop]) style[prop] = s[prop]
  }

  return style
}

/**
 * Convert a label string to camelCase field ID.
 * e.g. "NHS Number" → "nhsNumber"
 *      "DOB" → "dob"
 */
function toCamelCase(str) {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('')
}

/**
 * Heuristic: should this field be a textarea instead of an input?
 */
function multiLineHeuristic(labelText) {
  const keywords = [
    'address', 'reason', 'clinical', 'history', 'notes',
    'comments', 'details', 'symptoms', 'findings', 'medication',
    'information', 'description', 'allergies', 'reaction',
    'text', 'free', 'area', 'summary',
  ]
  const lower = labelText.toLowerCase()
  return keywords.some(k => lower.includes(k))
}
