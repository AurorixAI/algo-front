/**
 * The profile form of the settings (owner, administrator, teacher): what is sent and what is said about the e-mail.
 * The server (`UpdateProfileRequest`) knows only the name, the surname and the language; the e-mail of a member of staff is changed by the OWNER of the
 * centre (K2-1, a letter to the new address) - so for the administrator and the teacher it is shown, read-only (WAVE E, decision 1).
 */

export const EMAIL_OWNER_ONLY_HINT = "Почту меняет владелец центра";

export interface ProfileFormValues {
  first_name?: string;
  last_name?: string;
  language?: string;
}

/** The body of `PUT /auth/me`: the three fields the server reads and nothing else (never `email`, whatever the form holds). */
export function profileUpdateBody(form: ProfileFormValues): ProfileFormValues {
  const body: ProfileFormValues = {};
  if (form.first_name !== undefined) body.first_name = form.first_name;
  if (form.last_name !== undefined) body.last_name = form.last_name;
  if (form.language !== undefined) body.language = form.language;
  return body;
}
