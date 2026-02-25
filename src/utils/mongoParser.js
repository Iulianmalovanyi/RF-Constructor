/**
 * mongoParser.js
 *
 * Converts a MongoDB shell-format document string (as stored in the JSON examples
 * and displayed in Monaco) into a plain JS object that the DocumentPreview can consume.
 *
 * Why new Function() instead of JSON.parse():
 *   The format is not valid JSON — it contains MongoDB shell syntax such as
 *   NumberLong(7), ISODate("2024-..."), ObjectId("..."). These are valid JavaScript
 *   function-call expressions. We pre-process them with regex to produce valid JS,
 *   then evaluate via new Function(). This is intentional: the app is a local
 *   development tool and the content is the user's own DOCX data, not arbitrary code.
 */

/**
 * Sentinel class used during stringification to preserve MongoDB literal syntax
 * (e.g. NumberLong(1), ISODate("...")) without needing eval on the output side.
 */
export class MongoLiteral {
  constructor(raw) {
    this.raw = raw
  }
  toJSON() {
    // Embed the raw string in a marker that JSON.stringify will quote,
    // then we strip the quotes in a post-processing step.
    return `__ML__${this.raw}__`
  }
}

/**
 * Parse a MongoDB shell-format string into a JS object.
 * @param {string} text
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function mongoParser(text) {
  if (!text || !text.trim()) {
    return { ok: false, error: 'Empty input' }
  }

  try {
    const js = text
      // NumberLong(7) → 7
      .replace(/NumberLong\((\d+)\)/g, '$1')
      // NumberInt(7) → 7
      .replace(/NumberInt\((\d+)\)/g, '$1')
      // NumberDecimal("1.5") → 1.5
      .replace(/NumberDecimal\("([^"]+)"\)/g, '$1')
      // ISODate("2024-...") → "2024-..."
      .replace(/ISODate\("([^"]+)"\)/g, '"$1"')
      // ObjectId("abc123") → "abc123"
      .replace(/ObjectId\("([^"]+)"\)/g, '"$1"')
      // Timestamp(0, 0) → 0
      .replace(/Timestamp\(\d+,\s*\d+\)/g, '0')

    // Wrap in parentheses so bare object literals are parsed correctly
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${js})`)()
    return { ok: true, value: result }
  } catch (e) {
    return { ok: false, error: `Parse error: ${e.message}` }
  }
}

/**
 * Stringify a JS object to MongoDB shell format.
 * MongoLiteral instances are emitted without surrounding quotes.
 * @param {object} obj
 * @param {number} indent
 * @returns {string}
 */
export function mongoStringify(obj, indent = 4) {
  const json = JSON.stringify(obj, null, indent)
  // Remove the quotes around MongoLiteral markers
  return json.replace(/"__ML__([^"]+)__"/g, '$1')
}
