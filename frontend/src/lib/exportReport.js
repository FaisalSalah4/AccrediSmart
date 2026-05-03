/**
 * AccrediSmart — FCAR-style XLSX export builder.
 *
 * Builds a multi-sheet workbook that mirrors the structure of the FCAR
 * template: course info, assessments, CLOs, mapping, attainment, ABET SO
 * attainment, SAQF / NCAAA attainment, warnings, recommendations.
 *
 * This is intentionally student-name-light: faculty reviewers care about the
 * course-level FCAR summary, not student rosters.
 *
 * Library is loaded lazily so it doesn't bloat the main bundle.
 */

const NCAAA_TO_SAQF = {
  'Knowledge':                              'knowledge_understanding',
  'Cognitive Skills':                       'cognitive_skills',
  'Interpersonal Skills & Responsibility':  'autonomy_responsibility',
  'Communication, IT & Numerical Skills':   'communication_ict',
  'Psychomotor Skills':                     'practical_physical',
}

const SAQF_LABEL = {
  'knowledge_understanding':  'Knowledge & Understanding',
  'cognitive_skills':         'Cognitive Skills',
  'practical_physical':       'Practical & Physical Skills',
  'communication_ict':        'Communication and ICT Skills',
  'values_ethics':            'Values & Ethics',
  'autonomy_responsibility':  'Autonomy / Responsibility',
}

function saqfStatus(avg) {
  if (avg >= 70) return 'D — Demonstrated'
  if (avg >= 60) return 'PD — Partially Demonstrated'
  return 'ND — Not Demonstrated'
}

function abetStatus(avg) {
  if (avg >= 80) return 'E — Excellent'
  if (avg >= 70) return 'A — Adequate'
  if (avg >= 60) return 'M — Minimal'
  return 'U — Unsatisfactory'
}

function safe(v) { return v === undefined || v === null ? '' : v }

/**
 * Produce and download an XLSX workbook for the given report bundle.
 *
 * @param {object} bundle
 *   bundle.course        — courses row
 *   bundle.clos          — clos rows (with plo/so/ncaaa_domain)
 *   bundle.assessments   — assessments rows
 *   bundle.items         — assessment_items rows
 *   bundle.mapping       — clo_item_map rows
 *   bundle.report        — output of calculateAttainment()
 *   bundle.soAttain      — { [so_code]: { reasons, improvement_action } }
 *   bundle.saqfAttain    — { [domain_code]: { reasons, improvement_action } }
 *   bundle.cloRecs       — { [clo_id]: { auto_text, manual_text } }
 */
export async function exportFcarReport(bundle) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  const {
    course, clos = [], assessments = [], items = [], mapping = [],
    report = {}, soAttain = {}, saqfAttain = {}, cloRecs = {},
  } = bundle

  const cloResults = report.clo_results || []
  const warnings   = report.warnings    || []

  // 1) Course Info
  const courseRows = [
    ['Course Code',     safe(course?.code)],
    ['Course Name',     safe(course?.name)],
    ['Department',      safe(course?.department)],
    ['Credit Hours',    safe(course?.credit_hours)],
    ['Semester',        safe(course?.semester)],
    ['Year',            safe(course?.year)],
    ['Description',     safe(course?.description)],
    ['Total Students',  safe(report.total_students)],
    ['Overall Attainment %', safe(report.overall_attainment)],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(courseRows), 'Course Info')

  // 2) Assessments + Items
  const itemsByAss = new Map()
  for (const it of items) {
    if (!itemsByAss.has(it.assessment_id)) itemsByAss.set(it.assessment_id, [])
    itemsByAss.get(it.assessment_id).push(it)
  }
  const assessRows = [
    ['Assessment', 'Type', 'Weight %', 'Total Mark', 'Items Σ', 'Item', 'Full Mark', 'Position'],
  ]
  for (const a of assessments) {
    const aItems = itemsByAss.get(a.id) || []
    const sum    = aItems.reduce((s, it) => s + (Number(it.full_mark) || 0), 0)
    if (aItems.length === 0) {
      assessRows.push([a.name, a.type, a.weight, a.total_mark, sum, '(no items)', '', ''])
    } else {
      aItems.forEach((it, i) => assessRows.push([
        i === 0 ? a.name        : '',
        i === 0 ? a.type        : '',
        i === 0 ? a.weight      : '',
        i === 0 ? a.total_mark  : '',
        i === 0 ? sum           : '',
        it.name, it.full_mark, it.position,
      ]))
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(assessRows), 'Assessments')

  // 3) CLOs
  const cloHeader = ['Code', 'Description', 'NCAAA Domain', 'Bloom', 'Target %', 'Passing %', 'PLO', 'SO']
  const cloRows = [cloHeader, ...clos.map(c => [
    c.code, c.description, c.ncaaa_domain, c.bloom_level,
    c.target_attainment, c.passing_score, c.plo_mapping || '', c.so_mapping || '',
  ])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cloRows), 'CLOs')

  // 4) CLO ↔ Item Mapping (long form)
  const cloById = new Map(clos.map(c => [c.id, c]))
  const itemById = new Map(items.map(i => [i.id, i]))
  const assessById = new Map(assessments.map(a => [a.id, a]))
  const mapHeader = ['CLO', 'Assessment', 'Item', 'Item Full Mark']
  const mapRows = [mapHeader, ...mapping.map(m => {
    const c  = cloById.get(m.clo_id)
    const it = itemById.get(m.item_id)
    const a  = it ? assessById.get(it.assessment_id) : null
    return [c?.code || '', a?.name || '', it?.name || '', it?.full_mark || '']
  })]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mapRows), 'CLO ↔ Item Mapping')

  // 5) CLO Attainment
  const attHeader = ['CLO', 'Domain', 'Bloom', 'Target %', 'Passing %', 'Actual %', 'Avg Score %', 'Passed', 'Total', 'Status']
  const attRows = [attHeader, ...cloResults.map(r => [
    r.clo_code, r.ncaaa_domain, r.bloom_level,
    r.target_attainment, r.passing_score,
    r.no_mapping ? '' : r.attainment_percentage,
    r.no_mapping ? '' : r.average_score,
    r.no_mapping ? '' : r.students_passing,
    r.total_students,
    r.no_mapping ? 'No mapping' : r.status,
  ])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attRows), 'CLO Attainment')

  // 6) ABET SO Attainment (rolled up from CLOs by clos.so_mapping)
  const soAgg = new Map()
  for (const r of cloResults) {
    const c = cloById.get(r.clo_id); if (!c) continue
    const codes = (c.so_mapping || '').split(/[,;\s]+/).filter(Boolean)
    for (const so of codes) {
      if (!soAgg.has(so)) soAgg.set(so, { acts: [], total: 0, met: 0 })
      const e = soAgg.get(so)
      if (!r.no_mapping) {
        e.acts.push(r.attainment_percentage)
        e.total++
        if (r.status === 'Achieved') e.met++
      }
    }
  }
  const abetHeader = ['SO', 'Avg Attainment %', '% CLOs Met', 'Status', 'Reasons', 'Improvement Action']
  const abetRows = [abetHeader, ...[...soAgg.entries()].sort().map(([so, e]) => {
    const avg = e.acts.length ? e.acts.reduce((a, b) => a + b, 0) / e.acts.length : 0
    const pctMet = e.total ? (e.met / e.total) * 100 : 0
    const stored = soAttain[so] || {}
    return [
      so,
      Math.round(avg * 100) / 100,
      Math.round(pctMet * 100) / 100,
      abetStatus(avg),
      stored.reasons             || '',
      stored.improvement_action  || '',
    ]
  })]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abetRows), 'ABET SO Attainment')

  // 7) SAQF / NCAAA Attainment
  const saqfAgg = {}
  for (const r of cloResults) {
    const code = NCAAA_TO_SAQF[r.ncaaa_domain]
    if (!code) continue
    if (!saqfAgg[code]) saqfAgg[code] = []
    if (!r.no_mapping) saqfAgg[code].push(r.attainment_percentage)
  }
  const saqfHeader = ['Domain', 'Avg Attainment %', 'Status', 'Reasons', 'Improvement Action']
  const saqfRows = [saqfHeader, ...Object.keys(SAQF_LABEL).map(code => {
    const arr = saqfAgg[code] || []
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const stored = saqfAttain[code] || {}
    return [
      SAQF_LABEL[code],
      arr.length ? Math.round(avg * 100) / 100 : '',
      arr.length ? saqfStatus(avg) : '',
      stored.reasons             || '',
      stored.improvement_action  || '',
    ]
  })]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(saqfRows), 'SAQF Attainment')

  // 8) Warnings
  const wHeader = ['Kind', 'Message']
  const wRows = [wHeader, ...warnings.map(w => [w.kind, w.message])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wRows), 'Warnings')

  // 9) Recommendations / Action Plan
  const recHeader = ['CLO', 'Status', 'Auto Recommendation', 'Manual Recommendation (Faculty)']
  const recRows = [recHeader, ...cloResults.map(r => {
    const stored = cloRecs[r.clo_id] || {}
    return [
      r.clo_code,
      r.no_mapping ? 'No mapping' : r.status,
      stored.auto_text   || '',
      stored.manual_text || '',
    ]
  })]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recRows), 'Recommendations')

  const filename = `FCAR_${(course?.code || 'course').replace(/\s+/g, '_')}_${course?.semester || ''}_${course?.year || ''}.xlsx`
  XLSX.writeFile(wb, filename.replace(/_+/g, '_').replace(/_\.xlsx$/, '.xlsx'))
}
