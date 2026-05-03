/**
 * AccrediSmart — varied auto-recommendations for weak CLOs.
 *
 * Goal: instead of one repeated placeholder for every weak CLO, produce
 * recommendations that change with the size of the gap, the NCAAA / SAQF
 * domain, and any low-attainment items mapped to that CLO.
 *
 * Output is intentionally short and editable — instructors are expected to
 * adjust it through the manual recommendation field, which is stored alongside
 * the auto-text so future model training can compare them.
 */

const GAP_TIERS = [
  { max:  5, severity: 'slight',
    base: 'CLO is just below target — a small adjustment to a single mapped item often closes the gap.' },
  { max: 15, severity: 'moderate',
    base: 'CLO is moderately below target — review the assessment items mapped to this CLO and the related teaching activities.' },
  { max: 100, severity: 'significant',
    base: 'CLO is significantly below target — a structural review of teaching strategy, item alignment, and prerequisite preparation is needed.' },
]

const DOMAIN_HINTS = {
  'Knowledge':                              'Add concept-check questions, short formative quizzes, and worked examples in lectures.',
  'Cognitive Skills':                       'Add scaffolded problem-solving practice, case-based exercises, and step-by-step rubrics.',
  'Interpersonal Skills & Responsibility':  'Strengthen team-based deliverables and peer-evaluation rubrics; revisit collaboration ground rules.',
  'Communication, IT & Numerical Skills':   'Add written/oral communication checkpoints earlier in the term and provide rubric feedback before final submission.',
  'Psychomotor Skills':                     'Increase guided lab/practice time and provide structured demonstrations before assessments.',
}

const SAQF_HINTS = {
  'knowledge_understanding':  'Reinforce foundational definitions and add low-stakes recall checks before higher-order assessments.',
  'cognitive_skills':         'Add analysis/evaluation tasks with explicit reasoning rubrics.',
  'practical_physical':       'Increase hands-on lab repetitions and add self-assessment checklists.',
  'communication_ict':        'Add staged writing/presentation deliverables with formative feedback.',
  'values_ethics':            'Embed reflective discussion prompts and ethics scenarios into assessments.',
  'autonomy_responsibility':  'Add independent-learning milestones and self-managed deliverables with deadlines.',
}

function severityFor(gap) {
  for (const tier of GAP_TIERS) if (gap <= tier.max) return tier
  return GAP_TIERS[GAP_TIERS.length - 1]
}

/**
 * Generate a varied recommendation for a single CLO result.
 *
 * @param {object} cloResult  one entry of report.clo_results
 * @param {object} [opts]
 * @param {Array}  [opts.weakItems]   mapped items with low average attainment
 * @returns {string}
 */
export function recommendationFor(cloResult, opts = {}) {
  if (!cloResult || cloResult.no_mapping) return ''
  if (cloResult.status === 'Achieved')    return ''

  const target = Number(cloResult.target_attainment) || 0
  const actual = Number(cloResult.attainment_percentage) || 0
  const gap    = Math.max(0, target - actual)
  const tier   = severityFor(gap)

  const parts = [
    `Gap: ${gap.toFixed(1)} pts (${tier.severity}).`,
    tier.base,
  ]

  // Domain-specific tactic
  const hint = DOMAIN_HINTS[cloResult.ncaaa_domain]
  if (hint) parts.push(hint)

  // If any specific item is dragging the CLO down, flag it
  const weakItems = (opts.weakItems || []).filter(Boolean)
  if (weakItems.length) {
    const list = weakItems.slice(0, 3).map(i =>
      `${i.assessment_name ? i.assessment_name + ' → ' : ''}${i.name}`
    ).join('; ')
    parts.push(`Watch the lowest-performing mapped item${weakItems.length === 1 ? '' : 's'}: ${list}.`)
  }

  return parts.join(' ')
}

/** Variant for SAQF / NCAAA domain rows — uses the SAQF hint table. */
export function saqfRecommendationFor({ avg, label, code, status }) {
  if (status === 'D') return ''
  const sev = avg < 60 ? 'significant' : 'moderate'
  const hint = SAQF_HINTS[code] || ''
  const lead = sev === 'significant'
    ? `${label} is below 60% — structural intervention is needed.`
    : `${label} is partially demonstrated (60–<70%) — targeted improvements should close the gap.`
  return [lead, hint].filter(Boolean).join(' ')
}
