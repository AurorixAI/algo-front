import { redirect } from "next/navigation";

/**
 * The old «Результаты» copy (no refresh, the word «студенты») is gone: the results live in the tab «Аналитика» of the exam
 * (WB-P5, F-A17).  A bookmark or an old link to /sessions lands there.
 */
export default function ExamSessionsRedirect({ params }: { params: { id: string } }) {
  redirect(`/teacher/exams/${encodeURIComponent(params.id)}?tab=analytics`);
}
