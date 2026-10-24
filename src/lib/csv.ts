/**
 * CSV for a spreadsheet (RFC 4180) that is safe to open in Excel / Sheets.
 *
 * Two separate problems, both fed by text the STUDENT typed on the public exam page:
 *  1. structure - a name with the delimiter, a quote or a line break must stay ONE field (RFC 4180: such a field is
 *     wrapped in double quotes and a quote inside is doubled; lines end with CRLF);
 *  2. formulas - a cell that starts with `=`, `+`, `-`, `@`, a tab or a CR is executed by Excel as a formula
 *     (`=HYPERLINK(...)`, DDE). Such a TEXT cell gets a leading apostrophe, the way Excel shows a text cell.
 *     Real numbers are written as they are: the guard looks at text, so a negative score stays `-3`.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Text that is safe as a spreadsheet cell: a would-be formula gets the leading apostrophe. Numbers never come here. */
export function neutralizeFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/**
 * `;` is the list separator of Russian / Uzbek Excel (the decimal separator there is a comma): a file with `,` opens
 * as one column.  The file is written with a BOM by the caller so Excel reads UTF-8.
 */
export const CSV_DELIMITER = ";";

export type CsvValue = string | number | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : neutralizeFormula(String(value));
  return /[;",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(values: CsvValue[]): string {
  return values.map(csvCell).join(CSV_DELIMITER);
}

/** Records joined by CRLF (RFC 4180), the last one terminated too. */
export function toCsv(rows: CsvValue[][]): string {
  return rows.map(csvLine).join("\r\n") + "\r\n";
}
