// Shared definition of the paddling-experience questionnaire. One source of
// truth so the member's form and the admin's review view stay in sync, and
// so answers can be stored as a compact jsonb map keyed by `key`.
//
// The questions are deliberately specific: things that are cheap for an honest
// paddler to answer but expensive to fake (named put-ins, boat models, roll
// honesty, a nameable referee). Adapted from the prototype's approval
// questionnaire (docs/otter-pool-approval.html).

export type ExperienceQuestion = {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
};

export const EXPERIENCE_QUESTIONS: ExperienceQuestion[] = [
  {
    key: 'disciplines',
    label: 'What kinds of paddling do you do?',
    placeholder: 'e.g. sea, river / white water, surf, touring, pool',
  },
  {
    key: 'years',
    label: 'How long have you been paddling, and how often?',
    placeholder: 'e.g. 5 years, ~30 days a year',
  },
  {
    key: 'trips',
    label: 'Your last three trips — where, and roughly when?',
    placeholder: 'Put-in → take-out, and the month / year',
    multiline: true,
  },
  {
    key: 'conditions',
    label: 'Toughest conditions you’ve met — where, what happened, and what did you do?',
    multiline: true,
  },
  {
    key: 'boat',
    label: 'Your boat(s) — make and model',
    placeholder: 'e.g. P&H Cetus MV',
  },
  {
    key: 'skills',
    label:
      'Roll & rescues — reliable roll both sides (white water / surf, or pool only)? Done real deep-water or moving-water rescues, not just practised?',
    multiline: true,
  },
  {
    key: 'awards',
    label:
      'Awards / quals, and who with — Paddle UK (ex-BC), FSRT/WWSR. A coach or provider who could be a referee?',
    multiline: true,
  },
  {
    key: 'comfort',
    label: 'The trips you enjoy, your favourite group size, and what you’re comfortable on',
    multiline: true,
  },
];

export type ExperienceAnswers = Record<string, string>;

/** Trim answers and drop blanks, so an all-empty form stores nothing. */
export function cleanAnswers(draft: ExperienceAnswers): ExperienceAnswers {
  const out: ExperienceAnswers = {};
  for (const q of EXPERIENCE_QUESTIONS) {
    const v = (draft[q.key] ?? '').trim();
    if (v) {
      out[q.key] = v;
    }
  }
  return out;
}

/** True if at least one question has an answer. */
export function hasAnyAnswer(answers: ExperienceAnswers | null | undefined): boolean {
  if (!answers) {
    return false;
  }
  return EXPERIENCE_QUESTIONS.some((q) => (answers[q.key] ?? '').trim().length > 0);
}
