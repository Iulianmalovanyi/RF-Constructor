/**
 * docxParser.js
 *
 * Converts a DOCX ArrayBuffer into a MongoDB-format JS object matching
 * the schema defined in /examples/json/.
 *
 * Strategy:
 *   1. Extract raw OOXML styles from the DOCX ZIP (cell backgrounds, text colours)
 *   2. mammoth.convertToHtml() → raw HTML string (with alignment via transformDocument)
 *   3. DOMParser → browser DOM tree
 *   4. Walk DOM → component tree, injecting OOXML styles positionally
 *   5. Wrap in MongoDB document envelope
 */

import mammoth from 'mammoth'
import JSZip from 'jszip'
import { MongoLiteral } from './mongoParser.js'

// OOXML WordprocessingML namespace
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

// Module-level counters, reset before each parse call
let inputCounter = 0
let tableCounter = 0

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
  tableCounter = 0

  // Run OOXML extraction and mammoth conversion in parallel
  const [ooxmlStyles, mammothResult] = await Promise.all([
    extractOoxmlStyles(arrayBuffer),
    mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.dataUri,
        styleMap: [
          'b => b',
          'i => i',
          'u => u',
          'p[style-name="align-center"]  => p.align-center',
          'p[style-name="align-right"]   => p.align-right',
          'p[style-name="align-justify"] => p.align-justify',
          'p[style-name="align-both"]    => p.align-justify',
        ],
        transformDocument: mammoth.transforms.paragraph(para => {
          if (para.alignment && para.alignment !== 'left' && para.alignment !== null) {
            return { ...para, styleName: `align-${para.alignment}` }
          }
          return para
        }),
      }
    ),
  ])

  const parser = new DOMParser()
  const doc = parser.parseFromString(mammothResult.value, 'text/html')
  const bodyChildren = Array.from(doc.body.childNodes)

  // Reset table counter before DOM walk (must match OOXML walk order)
  tableCounter = 0

  const formArray = bodyChildren
    .map(node => walkNode(node, ooxmlStyles))
    .filter(Boolean)

  return buildEnvelope(formArray, fileName)
}

// -------------------------------------------------------------------------
// OOXML style extraction
// -------------------------------------------------------------------------

/**
 * Extract cell background colours and run text colours directly from the
 * DOCX OOXML XML, which mammoth does not expose.
 *
 * Returns:
 *   cellStyles[tableIdx][rowIdx][cellIdx] = { backgroundColor?, color?, textAlign? }
 */
async function extractOoxmlStyles(arrayBuffer) {
  const cellStyles = {}

  try {
    const zip = await JSZip.loadAsync(arrayBuffer)
    const xmlFile = zip.file('word/document.xml')
    if (!xmlFile) return { cellStyles }

    const xmlStr = await xmlFile.async('string')
    const xmlDoc = new DOMParser().parseFromString(xmlStr, 'text/xml')

    const tables = xmlDoc.getElementsByTagNameNS(W_NS, 'tbl')

    Array.from(tables).forEach((tbl, tblIdx) => {
      cellStyles[tblIdx] = {}

      // Only direct child rows of this table (not nested tables)
      const rows = directChildren(tbl, 'tr', W_NS)

      rows.forEach((row, rowIdx) => {
        cellStyles[tblIdx][rowIdx] = {}

        const cells = directChildren(row, 'tc', W_NS)

        cells.forEach((cell, cellIdx) => {
          const style = {}

          // --- Cell background colour (w:tcPr > w:shd @w:fill) ---
          try {
            const tcPr = firstChildNS(cell, 'tcPr', W_NS)
            if (tcPr) {
              const shd = firstChildNS(tcPr, 'shd', W_NS)
              if (shd) {
                const fill = shd.getAttributeNS(W_NS, 'fill') || shd.getAttribute('w:fill')
                if (fill && fill !== 'auto' && !/^[Ff]{6}$/.test(fill) && fill.length === 6) {
                  style.backgroundColor = `#${fill}`
                }
              }
            }
          } catch (_) { /* degrade gracefully */ }

          // --- Dominant text colour in this cell (first coloured run) ---
          try {
            const runs = cell.getElementsByTagNameNS(W_NS, 'r')
            for (const run of Array.from(runs)) {
              const rPr = firstChildNS(run, 'rPr', W_NS)
              if (rPr) {
                const colorEl = firstChildNS(rPr, 'color', W_NS)
                if (colorEl) {
                  const val = colorEl.getAttributeNS(W_NS, 'val') || colorEl.getAttribute('w:val')
                  if (val && val !== 'auto' && val !== '000000' && val.length === 6) {
                    style.color = `#${val}`
                    break // use first coloured run as representative
                  }
                }
              }
            }
          } catch (_) { /* degrade gracefully */ }

          // --- Cell paragraph alignment (first paragraph's w:jc) ---
          try {
            const paras = cell.getElementsByTagNameNS(W_NS, 'p')
            if (paras.length > 0) {
              const pPr = firstChildNS(paras[0], 'pPr', W_NS)
              if (pPr) {
                const jc = firstChildNS(pPr, 'jc', W_NS)
                if (jc) {
                  const val = jc.getAttributeNS(W_NS, 'val') || jc.getAttribute('w:val')
                  if (val === 'center') style.textAlign = 'center'
                  else if (val === 'right') style.textAlign = 'right'
                  else if (val === 'both') style.textAlign = 'justify'
                }
              }
            }
          } catch (_) { /* degrade gracefully */ }

          cellStyles[tblIdx][rowIdx][cellIdx] = style
        })
      })
    })
  } catch (err) {
    console.warn('OOXML style extraction failed:', err.message)
  }

  return { cellStyles }
}

// --- XML helpers ---

/** Get direct children of an element by local name and namespace */
function directChildren(el, localName, ns) {
  return Array.from(el.childNodes).filter(
    n => n.nodeType === 1 && n.localName === localName && n.namespaceURI === ns
  )
}

/** Get first direct child element by local name and namespace */
function firstChildNS(el, localName, ns) {
  return Array.from(el.childNodes).find(
    n => n.nodeType === 1 && n.localName === localName && n.namespaceURI === ns
  ) || null
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

// Matches ${variableName} — DOCX template placeholders that should render as inputs
const TEMPLATE_VAR_RE = /^\$\{(\w+)\}$/

function walkNode(domNode, ooxmlStyles, tableIdx = null, rowIdx = null, cellIdx = null) {
  // Text node
  if (domNode.nodeType === Node.TEXT_NODE) {
    const text = domNode.textContent.trim()
    if (!text) return null

    // ${varName} → render as text input, not a literal string
    const varMatch = text.match(TEMPLATE_VAR_RE)
    if (varMatch) {
      inputCounter++
      const fieldId = varMatch[1]
      return {
        _id: fieldId,
        component: 'input',
        props: { type: 'text', id: fieldId, name: fieldId, className: 'input-block' },
      }
    }

    return { component: 'span', props: { text } }
  }

  if (domNode.nodeType !== Node.ELEMENT_NODE) return null

  const tag = domNode.tagName.toLowerCase()

  switch (tag) {
    case 'table': {
      const currentTableIdx = tableCounter++
      const children = Array.from(domNode.childNodes)
        .map(n => walkNode(n, ooxmlStyles, currentTableIdx, null, null))
        .filter(Boolean)
      return buildTable(domNode, children, currentTableIdx, ooxmlStyles)
    }
    case 'tr': {
      // rowIdx is tracked by counting tr siblings at the DOM level
      const siblings = domNode.parentElement
        ? Array.from(domNode.parentElement.children).filter(el => el.tagName.toLowerCase() === 'tr')
        : []
      const currentRowIdx = siblings.indexOf(domNode)
      const children = Array.from(domNode.childNodes)
        .map(n => walkNode(n, ooxmlStyles, tableIdx, currentRowIdx, null))
        .filter(Boolean)
      return buildTr(domNode, children)
    }
    case 'td':
    case 'th': {
      const siblings = domNode.parentElement
        ? Array.from(domNode.parentElement.children).filter(el =>
            el.tagName.toLowerCase() === 'td' || el.tagName.toLowerCase() === 'th'
          )
        : []
      const currentCellIdx = siblings.indexOf(domNode)
      const children = Array.from(domNode.childNodes)
        .map(n => walkNode(n, ooxmlStyles, tableIdx, rowIdx, currentCellIdx))
        .filter(Boolean)
      return buildCell(tag, domNode, children, tableIdx, rowIdx, currentCellIdx, ooxmlStyles)
    }
    default: {
      const children = Array.from(domNode.childNodes)
        .map(n => walkNode(n, ooxmlStyles, tableIdx, rowIdx, cellIdx))
        .filter(Boolean)
      return buildElement(tag, domNode, children)
    }
  }
}

function buildElement(tag, domNode, children) {
  switch (tag) {
    case 'p':       return buildParagraph(domNode, children)
    case 'div':     return buildDiv(domNode, children)
    case 'thead':   return { component: 'thead', children }
    case 'tbody':   return { component: 'tbody', children }
    case 'strong':
    case 'b':       return buildBoldSpan(domNode)
    case 'em':
    case 'i':       return buildItalicSpan(domNode)
    case 'u':       return buildUnderlineSpan(domNode)
    case 'span':    return buildSpan(domNode, children)
    case 'a':       return buildLink(domNode)
    case 'img':     return buildImage(domNode)
    case 'h1':
    case 'h2':
    case 'h3':      return buildHeading('h1', domNode, children)
    case 'h4':
    case 'h5':
    case 'h6':      return buildHeading('h4', domNode, children)
    case 'ul':      return { component: 'ul', children }
    case 'ol':      return { component: 'ol', children }
    case 'li':      return buildLi(domNode, children)
    case 'br':      return null
    default:        return children.length ? { component: 'div', children } : null
  }
}

// -------------------------------------------------------------------------
// Element builders
// -------------------------------------------------------------------------

function buildParagraph(domNode, children) {
  const style = extractInlineStyle(domNode)

  // Detect alignment classes injected by mammoth transformDocument
  const cls = domNode.getAttribute('class') || ''
  if (cls.includes('align-center')) style.textAlign = 'center'
  else if (cls.includes('align-right')) style.textAlign = 'right'
  else if (cls.includes('align-justify')) style.textAlign = 'justify'

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

function buildTable(domNode, children, tableIdx, ooxmlStyles) {
  // Layout table = contains an image and no input fields
  // These are header/logo tables that should be borderless
  const layout = isLayoutTable(domNode)

  return {
    _id: 'table',
    component: 'table',
    children,
    props: {
      className: layout ? 'layout-table' : 'oxford-table',
      style: { margin: '15px 0', width: '100%' },
    }
  }
}

function buildTr(domNode, children) {
  const style = extractInlineStyle(domNode)
  const node = { component: 'tr', children }
  if (Object.keys(style).length) node.props = { style }
  return node
}

function buildCell(component, domNode, children, tableIdx, rowIdx, cellIdx, ooxmlStyles) {
  const colSpan = domNode.getAttribute('colspan') || domNode.getAttribute('colSpan')
  const rowSpan = domNode.getAttribute('rowspan') || domNode.getAttribute('rowSpan')
  const style = extractInlineStyle(domNode)

  // Inject OOXML-extracted cell styles (background colour, text colour, alignment)
  try {
    const ooStyle = ooxmlStyles?.cellStyles?.[tableIdx]?.[rowIdx]?.[cellIdx]
    if (ooStyle) {
      if (ooStyle.backgroundColor) style.backgroundColor = ooStyle.backgroundColor
      if (ooStyle.textAlign)       style.textAlign       = ooStyle.textAlign
      // Text colour on the cell: only apply if no children override it
      // We store it and let span-level colour take precedence
      if (ooStyle.color && !style.color) style.color = ooStyle.color
    }
  } catch (_) { /* degrade gracefully */ }

  const props = {}
  if (colSpan && colSpan !== '1') props.colSpan = colSpan
  if (rowSpan && rowSpan !== '1') props.rowSpan = rowSpan
  if (Object.keys(style).length)  props.style   = style

  // --- Yes/No detection ---
  // If the cell text is exactly "YesNo" (merged by mammoth from DOCX radio fields),
  // replace with actual radio button inputs
  const cellText = domNode.textContent.trim()
  if (/^yes\s*no$/i.test(cellText) && children.length <= 1) {
    inputCounter++
    const name = `yesno_${inputCounter}`
    const node = { _id: `td${inputCounter}`, component, props, children: buildYesNoRadios(name) }
    return node
  }

  // --- Input inference: empty cell adjacent to label cell ---
  let resolvedChildren = children
  if (children.length === 0) {
    const prevSibling = domNode.previousElementSibling
    const labelText = prevSibling?.textContent?.trim()

    if (labelText && labelText.length > 0 && !/^[\s\d]*$/.test(labelText)) {
      inputCounter++
      const fieldId = toCamelCase(labelText) || `input_${inputCounter}`
      const isMultiLine = multiLineHeuristic(labelText)

      const inputNode = isMultiLine
        ? { _id: fieldId, component: 'textarea', props: { id: fieldId, className: 'input-block' } }
        : { _id: fieldId, component: 'input', props: { type: 'text', className: 'input-block', id: fieldId } }

      resolvedChildren = [inputNode]
      return { _id: `td${inputCounter}`, component, children: resolvedChildren, props }
    }
  }

  return { component, children: resolvedChildren, props }
}

function buildYesNoRadios(name) {
  return [
    {
      component: 'span',
      props: { style: { marginRight: '8px', whiteSpace: 'nowrap' } },
      children: [
        { component: 'input', props: { type: 'radio', name, value: 'yes', style: { marginRight: '3px' } } },
        { component: 'span', props: { text: 'Yes' } },
      ]
    },
    {
      component: 'span',
      props: { style: { whiteSpace: 'nowrap' } },
      children: [
        { component: 'input', props: { type: 'radio', name, value: 'no', style: { marginRight: '3px' } } },
        { component: 'span', props: { text: 'No' } },
      ]
    },
  ]
}

function buildBoldSpan(domNode) {
  const children = Array.from(domNode.childNodes)
    .map(n => walkNode(n, {}))
    .filter(Boolean)
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

function buildLink(domNode) {
  inputCounter++
  const href = domNode.getAttribute('href') || ''
  const text = domNode.textContent.trim()
  const style = extractInlineStyle(domNode)
  const props = { href, target: '_blank', text, className: 'link-default' }
  if (Object.keys(style).length) props.style = style

  return { _id: `a${inputCounter}`, component: 'a', props }
}

function buildImage(domNode) {
  const src = domNode.getAttribute('src') || ''
  const style = extractInlineStyle(domNode)
  const props = { src }
  props.style = Object.keys(style).length ? style : { maxWidth: '100%' }

  return { component: 'img', props }
}

function buildHeading(level, domNode, children) {
  const text = domNode.textContent.trim()
  const _id = toCamelCase(text) || `heading_${inputCounter}`
  const node = { _id, component: level, props: { text } }
  if (children.length) node.children = children
  return node
}

function buildLi(domNode, children) {
  const text = domNode.textContent.trim()
  return {
    component: 'li',
    ...(children.length ? { children } : { props: { text } })
  }
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * Detect a layout/header table (borderless) vs a data table (oxford-table).
 * Layout tables contain images and no form inputs.
 */
function isLayoutTable(domNode) {
  return (
    domNode.querySelector('img') !== null &&
    domNode.querySelector('input, textarea') === null
  )
}

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
