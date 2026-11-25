import { GoogleGenAI } from '@google/genai';

export async function generateOptionalDraft(params: {
  task: 'TEACHER_REMARK' | 'ANNOUNCEMENT_DRAFT' | 'ACADEMIC_SUMMARY';
  context: Record<string, string | number>;
}): Promise<{ ok: boolean; text?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: 'Optional Gemini AI integration is not configured.' };
  }

  // Strictly avoid sending identifiable student PII (no names, admission numbers, emails, phones)
  let prompt = '';
  if (params.task === 'TEACHER_REMARK') {
    prompt = `Write one concise, constructive Ghanaian terminal report card remark (max 22 words) for an anonymized learner with overall average ${params.context.average}%, attendance ${params.context.attendancePercent}%, and grade band ${params.context.grade}. Return plain text only.`;
  } else if (params.task === 'ANNOUNCEMENT_DRAFT') {
    prompt = `Draft a clear, respectful school announcement for Ghanaian parents/staff about: "${params.context.topic}". Keep it under 120 words, formal and warm. Return plain text only.`;
  } else {
    prompt = `Summarize aggregated anonymized class performance metrics for school leadership (pass rate ${params.context.passRate}%, mean score ${params.context.meanScore}%, total learners ${params.context.studentCount}). Suggest 3 practical instructional support actions. Plain text only.`;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return { ok: true, text: response.text?.trim() || '' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'AI draft request failed.',
    };
  }
}
