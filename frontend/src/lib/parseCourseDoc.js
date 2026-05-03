/**
 * AccrediSmart — Course-information document parser.
 *
 * Reads a PDF (.pdf) or Word (.docx) file the user uploaded and extracts the
 * fields needed to pre-fill the New Course form:
 *
 *   code, name, credit_hours, department, semester, year, description
 *
 * The parser is intentionally simple — regex-based on the raw text — so it
 * works without any backend. The user always reviews/edits parsed values
 * before saving the course.
 *
 * Heavy parser libraries are loaded lazily so they don't bloat the main
 * bundle for users who never open this dialog.
 */

import { DEPARTMENTS } from '../constants'

// Pull plain text out of a PDF using pdfjs-dist.
async function pdfToText(file) {
  const pdfjs = await import('pdfjs-dist/build/pdf')
  // We don't need the worker for short course-info PDFs — disable it to avoid
  // the worker-URL setup dance.
  pdfjs.GlobalWorkerOptions.workerSrc = ''
  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf, useWorker: false }).promise
  let out = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    out += content.items.map(it => it.str).join(' ') + '\n'
  }
  return out
}

// Pull plain text out of a .docx using mammoth.
async function docxToText(file) {
  const mammoth = await import('mammoth/mammoth.browser')
  const buf = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf })
  return value || ''
}

/** Detect format and dispatch. Returns the plain-text body. */
export async function readCourseDocText(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf')  return pdfToText(file)
  if (ext === 'docx') return docxToText(file)
  if (ext === 'doc')  throw new Error('Legacy .doc is not supported. Please save as .docx and re-upload.')
  throw new Error(`Unsupported file type: .${ext}. Use .pdf or .docx.`)
}

// ── Field extractors ─────────────────────────────────────────────────────────

const lc = (s) => (s || '').toLowerCase()

function findCode(text) {
  // A typical course code is 2–5 capital letters then 2–4 digits, e.g.
  // "SE495", "CS 101", "MATH-200". Prefer matches that follow a "code:" label.
  const labelled = text.match(/(?:course\s*code|code)\s*[:\-]\s*([A-Z]{2,5}\s?-?\s?\d{2,4})/i)
  if (labelled) return labelled[1].replace(/\s+/g, '').replace('-', '')
  const generic = text.match(/\b([A-Z]{2,5}\s?-?\s?\d{2,4})\b/)
  return generic ? generic[1].replace(/\s+/g, '').replace('-', '') : ''
}

function findName(text) {
  const m = text.match(/(?:course\s*(?:name|title))\s*[:\-]\s*([^\n\r]{2,120})/i)
  return m ? m[1].trim().replace(/\s{2,}/g, ' ') : ''
}

function findCreditHours(text) {
  const m = text.match(/(?:credit\s*hours?|credits?|ch)\s*[:\-]?\s*(\d{1,2})/i)
  if (m) {
    const n = Number(m[1])
    if (n >= 1 && n <= 6) return n
  }
  return 3
}

function findDepartment(text) {
  // Prefer an explicit "Department:" line, otherwise look for any of the known
  // department codes appearing as whole words.
  const labelled = text.match(/department\s*[:\-]\s*([^\n\r,;]{2,80})/i)
  if (labelled) {
    const v = labelled[1].trim().toUpperCase()
    const hit = DEPARTMENTS.find(d => v.includes(d))
    if (hit) return hit
  }
  for (const d of DEPARTMENTS) {
    if (new RegExp(`\\b${d}\\b`).test(text)) return d
  }
  return ''
}

function findSemester(text) {
  const t = lc(text)
  if (/\bspring\b/.test(t)) return 'Spring'
  if (/\bsummer\b/.test(t)) return 'Summer'
  if (/\bfall\b|\bautumn\b/.test(t)) return 'Fall'
  return ''
}

function findYear(text) {
  // Prefer a 4-digit year between 2000 and 2099 close to the word "year".
  const labelled = text.match(/year\s*[:\-]?\s*(20\d{2})/i)
  if (labelled) return Number(labelled[1])
  const m = text.match(/\b(20\d{2})\b/)
  return m ? Number(m[1]) : new Date().getFullYear()
}

/**
 * Run all extractors against a free-text body and return a partial course
 * object. Caller merges into form state and lets the user review.
 */
export function extractCourseFields(text) {
  return {
    code:         findCode(text),
    name:         findName(text),
    credit_hours: findCreditHours(text),
    department:   findDepartment(text),
    semester:     findSemester(text),
    year:         findYear(text),
    // Description is intentionally left for the user to write/edit manually.
  }
}

/** End-to-end convenience: file → extracted fields. */
export async function parseCourseDoc(file) {
  const text   = await readCourseDocText(file)
  const fields = extractCourseFields(text)
  return { fields, text }
}
