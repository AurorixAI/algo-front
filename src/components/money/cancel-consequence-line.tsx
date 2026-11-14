import { SkeletonLine } from "@/components/ui/skeleton";
import { useCancelConsequence, type CancelConsequenceTarget } from "@/lib/use-cancel-consequence";

/**
 * What a cancellation does to the students, in the words of the server (Money-1 Г, Р-4).  While it is asked the place is held by a skeleton of the same height, so the window does not jump;
 * nothing (no error, no blocked button) when the server did not answer - the cancellation goes on without the sentence.  The testid is the same in every window that shows it.
 */
export function CancelConsequenceLine({ loading, text }: { loading: boolean; text: string | null }) {
  if (loading) return <div role="status" aria-label="Считаем последствия" data-testid="cancel-consequence-skeleton" className="flex h-5 items-center"><SkeletonLine className="w-2/3" /></div>;
  if (!text) return null;
  return <p data-testid="cancel-consequence" className="text-sm text-slate-800">{text}</p>;
}

/** The line of a window that has no preview of its own: it asks the server for the lesson `target` when it appears (mount it only where the sentence is due). */
export function CancelConsequence({ target }: { target: CancelConsequenceTarget }) {
  const { loading, text } = useCancelConsequence(target);
  return <CancelConsequenceLine loading={loading} text={text} />;
}
