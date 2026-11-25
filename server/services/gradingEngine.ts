export interface AssessmentCategoryDef {
  key: string;
  label: string;
  type:
    | 'CLASS_EXERCISE'
    | 'QUIZ'
    | 'ASSIGNMENT'
    | 'PROJECT'
    | 'CLASS_TEST'
    | 'PRACTICAL'
    | 'CONTINUOUS_ASSESSMENT'
    | 'END_OF_TERM_EXAM';
  maxMarks: number;
  weightPercent: number;
  isExam: boolean;
}

export interface GradingScaleRule {
  grade: string;
  minScore: number;
  maxScore: number;
  remark: string;
}

export type RoundingMode = 'NEAREST_INT' | 'ONE_DECIMAL' | 'TWO_DECIMAL';
export type MissingMarkPolicy = 'TREAT_AS_INCOMPLETE' | 'TREAT_AS_ZERO';

export interface ScoreInputMap {
  [categoryKey: string]: number | null | undefined;
}

export interface CalculatedScoreResult {
  valid: boolean;
  errors: string[];
  hasMissingMarks: boolean;
  caScore: number | null;
  examScore: number | null;
  finalScore: number | null;
  grade: string;
  remark: string;
  passed: boolean;
  normalizedCategories: Record<
    string,
    { rawScore: number | null; maxMarks: number; isMissing: boolean }
  >;
}

export const DEFAULT_30_70_TEMPLATE = {
  name: 'Standard 30% CA / 70% Exam',
  passMark: 50,
  roundingMode: 'ONE_DECIMAL' as RoundingMode,
  showClassPosition: true,
  missingMarkPolicy: 'TREAT_AS_INCOMPLETE' as MissingMarkPolicy,
  categories: [
    {
      key: 'class_work',
      label: 'Class Exercises & Homework',
      type: 'CLASS_EXERCISE' as const,
      maxMarks: 15,
      weightPercent: 15,
      isExam: false,
    },
    {
      key: 'class_test',
      label: 'Class Tests & Projects',
      type: 'CLASS_TEST' as const,
      maxMarks: 15,
      weightPercent: 15,
      isExam: false,
    },
    {
      key: 'end_term_exam',
      label: 'End-of-Term Examination',
      type: 'END_OF_TERM_EXAM' as const,
      maxMarks: 100,
      weightPercent: 70,
      isExam: true,
    },
  ],
  gradingScale: [
    { grade: 'A1', minScore: 80, maxScore: 100, remark: 'Excellent' },
    { grade: 'B2', minScore: 70, maxScore: 79.99, remark: 'Very Good' },
    { grade: 'B3', minScore: 65, maxScore: 69.99, remark: 'Good' },
    { grade: 'C4', minScore: 60, maxScore: 64.99, remark: 'Credit' },
    { grade: 'C5', minScore: 55, maxScore: 59.99, remark: 'Credit' },
    { grade: 'C6', minScore: 50, maxScore: 54.99, remark: 'Credit' },
    { grade: 'D7', minScore: 45, maxScore: 49.99, remark: 'Pass' },
    { grade: 'E8', minScore: 40, maxScore: 44.99, remark: 'Weak Pass' },
    { grade: 'F9', minScore: 0, maxScore: 39.99, remark: 'Fail' },
  ],
};

export function applyRounding(value: number, mode: RoundingMode): number {
  if (mode === 'NEAREST_INT') {
    return Math.round(value);
  }
  if (mode === 'ONE_DECIMAL') {
    return Math.round((value + Number.EPSILON) * 10) / 10;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lookupGrade(
  score: number,
  scale: GradingScaleRule[]
): { grade: string; remark: string } {
  const sorted = [...scale].sort((a, b) => b.minScore - a.minScore);
  for (const rule of sorted) {
    if (score >= rule.minScore && score <= rule.maxScore) {
      return { grade: rule.grade, remark: rule.remark };
    }
  }
  // Fallback boundary match if rounding pushes slightly between rules
  for (const rule of sorted) {
    if (score >= rule.minScore) {
      return { grade: rule.grade, remark: rule.remark };
    }
  }
  const lowest = sorted[sorted.length - 1];
  return lowest ? { grade: lowest.grade, remark: lowest.remark } : { grade: '-', remark: 'Unrated' };
}

export function calculateStudentSubjectScore(params: {
  categories: AssessmentCategoryDef[];
  gradingScale: GradingScaleRule[];
  passMark: number;
  roundingMode: RoundingMode;
  missingMarkPolicy: MissingMarkPolicy;
  inputScores: ScoreInputMap;
}): CalculatedScoreResult {
  const errors: string[] = [];
  const normalizedCategories: Record<
    string,
    { rawScore: number | null; maxMarks: number; isMissing: boolean }
  > = {};

  const totalWeight = params.categories.reduce((sum, c) => sum + c.weightPercent, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    errors.push(`Assessment category weights must sum to 100% (currently ${totalWeight}%).`);
  }

  let hasMissingMarks = false;
  let caWeighted = 0;
  let examWeighted = 0;

  for (const cat of params.categories) {
    const raw = params.inputScores[cat.key];
    // Explicitly distinguish null/undefined/'' (missing) from numeric 0!
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw === '')) {
      hasMissingMarks = true;
      normalizedCategories[cat.key] = {
        rawScore: null,
        maxMarks: cat.maxMarks,
        isMissing: true,
      };
      if (params.missingMarkPolicy === 'TREAT_AS_ZERO') {
        // contributes 0
      }
      continue;
    }

    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      errors.push(`Invalid numeric score for ${cat.label}.`);
      continue;
    }
    if (numeric < 0) {
      errors.push(`${cat.label} score cannot be negative.`);
      continue;
    }
    if (numeric > cat.maxMarks) {
      errors.push(`${cat.label} score (${numeric}) exceeds maximum allowed marks (${cat.maxMarks}).`);
      continue;
    }

    normalizedCategories[cat.key] = {
      rawScore: numeric,
      maxMarks: cat.maxMarks,
      isMissing: false,
    };

    const contribution = (numeric / cat.maxMarks) * cat.weightPercent;
    if (cat.isExam) {
      examWeighted += contribution;
    } else {
      caWeighted += contribution;
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      hasMissingMarks,
      caScore: null,
      examScore: null,
      finalScore: null,
      grade: '',
      remark: '',
      passed: false,
      normalizedCategories,
    };
  }

  if (hasMissingMarks && params.missingMarkPolicy === 'TREAT_AS_INCOMPLETE') {
    return {
      valid: true,
      errors: [],
      hasMissingMarks: true,
      caScore: applyRounding(caWeighted, params.roundingMode),
      examScore: applyRounding(examWeighted, params.roundingMode),
      finalScore: null,
      grade: 'INC',
      remark: 'Incomplete Marks',
      passed: false,
      normalizedCategories,
    };
  }

  const caScore = applyRounding(caWeighted, params.roundingMode);
  const examScore = applyRounding(examWeighted, params.roundingMode);
  const finalScore = applyRounding(caWeighted + examWeighted, params.roundingMode);
  const { grade, remark } = lookupGrade(finalScore, params.gradingScale);

  return {
    valid: true,
    errors: [],
    hasMissingMarks,
    caScore,
    examScore,
    finalScore,
    grade,
    remark,
    passed: finalScore >= params.passMark,
    normalizedCategories,
  };
}

export interface RankedItem {
  studentId: string;
  averageScore: number;
  position: number;
}

/**
 * Standard competition ranking with tie handling (e.g. 1, 2, 2, 4).
 */
export function calculateClassRankings(
  entries: Array<{ studentId: string; averageScore: number }>
): RankedItem[] {
  const sorted = [...entries].sort((a, b) => b.averageScore - a.averageScore);
  const results: RankedItem[] = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && Math.abs(sorted[i].averageScore - sorted[i - 1].averageScore) > 0.0001) {
      currentRank = i + 1;
    }
    results.push({
      studentId: sorted[i].studentId,
      averageScore: sorted[i].averageScore,
      position: currentRank,
    });
  }
  return results;
}
