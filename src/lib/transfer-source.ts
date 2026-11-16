/**
 * Money-2 T1 / Э1: a transfer closes ONE stay - the one the person names.  A student with several active groups must say «Из какой группы» (the server refuses with 422
 * `TRANSFER_SOURCE_REQUIRED` and the list of the groups when it is missing).  Pure: the choice and the reading of that refusal; the words of the money are the server's.
 */
export interface SourceGroup { id: string; name: string }

export const SOURCE_LABEL = "Из какой группы";
export const SOURCE_PLACEHOLDER = "Выберите группу";
export const SOURCE_WHY = "Выберите, из какой группы перевести ученика";

/** The groups the server names in its refusal `TRANSFER_SOURCE_REQUIRED` (`detail.groups[] = {group_id, group_name}`); null for any other error. */
export function sourcesFromError(error: unknown): SourceGroup[] | null {
  const source = error as { code?: unknown; detail?: { code?: unknown; groups?: unknown } | null } | null | undefined;
  const code = source?.code ?? source?.detail?.code;
  if (code !== "TRANSFER_SOURCE_REQUIRED" || !Array.isArray(source?.detail?.groups)) return null;
  const groups = (source!.detail!.groups as Array<{ group_id?: unknown; group_name?: unknown } | null>)
    .filter((item) => item && typeof item.group_id === "string" && item.group_id)
    .map((item) => ({ id: item!.group_id as string, name: String(item!.group_name ?? "") }));
  return groups.length > 0 ? groups : null;
}

/** `needed`: the person must choose (several groups); `id`: the group the request names (the only one, or the chosen one; null while the choice is open). */
export function transferSource(sources: SourceGroup[], chosen: string): { needed: boolean; id: string | null } {
  if (sources.length > 1) return { needed: true, id: sources.some((group) => group.id === chosen) ? chosen : null };
  return { needed: false, id: sources[0]?.id ?? null };
}
