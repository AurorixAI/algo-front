/** The words of the sign-in page that depend on the account (K2-2, F), as pure functions. */

const ROLE_NAME: Record<string, string> = { owner: "Владелец", admin: "Админ", teacher: "Учитель" };

/** The password was right but the role chosen above is not the role of the account. */
export function roleMismatchText(actualRole: string): string {
  const name = ROLE_NAME[actualRole];
  return name ? `Эта почта — учётная запись «${name}». Выберите её вверху` : "Неверная почта или пароль";
}
