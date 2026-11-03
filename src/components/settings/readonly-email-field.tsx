import { EMAIL_OWNER_ONLY_HINT } from "@/lib/profile-form";
import { cn } from "@/lib/utils";

interface ReadonlyEmailFieldProps {
  id: string;
  email: string | null | undefined;
  labelClassName: string;
  inputClassName: string;
}

/** «Почта» of the administrator and the teacher: shown, not editable; the hint says who changes it (the owner of the centre). */
export function ReadonlyEmailField({ id, email, labelClassName, inputClassName }: ReadonlyEmailFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>Почта</label>
      <input
        id={id}
        value={email ?? ""}
        readOnly
        aria-describedby={`${id}-hint`}
        type="email"
        className={cn(inputClassName, "cursor-not-allowed bg-slate-50 text-slate-500")}
      />
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">{EMAIL_OWNER_ONLY_HINT}</p>
    </div>
  );
}
