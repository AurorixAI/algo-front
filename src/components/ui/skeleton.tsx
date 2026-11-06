/** Loading of a block or a list is a skeleton (a spinner `Loader2` lives only inside a button).  `animate-pulse`, one neutral grey. */
const BONE = "animate-pulse rounded-tag bg-slate-200";

export function SkeletonLine({ className = "w-full" }: { className?: string }) {
  return <div aria-hidden="true" className={`h-3.5 ${BONE} ${className}`} />;
}

export function SkeletonBlock({ className = "h-24 w-full" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-control animate-pulse bg-slate-200 ${className}`} />;
}

/** `count` rows of a list, each a title line and a shorter one; `label` is what a screen reader hears. */
export function SkeletonRows({ count = 3, label = "Загружаем…", testId }: { count?: number; label?: string; testId?: string }) {
  return (
    <div role="status" aria-label={label} data-testid={testId} className="space-y-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-2 rounded-control border border-slate-100 bg-white p-3">
          <SkeletonLine className="w-2/3" />
          <SkeletonLine className="w-1/3" />
        </div>
      ))}
    </div>
  );
}
