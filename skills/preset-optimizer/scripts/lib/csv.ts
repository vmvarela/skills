// Strict CSV parsing with hard row/column limits. Fails closed on malformed input.

export class CsvError extends Error {}

export interface CsvOptions {
  maxRows: number;
  maxCols: number;
}

/** RFC-4180-style parse; rejects NUL, unterminated quotes, oversize rows/cols. */
export function parseCsv(text: string, opts: CsvOptions): string[][] {
  if (text.includes("\0")) throw new CsvError("csv: NUL byte");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    push();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true; // only delimiter/newline/EOF may follow
        }
      } else field += c;
    } else if (afterQuote) {
      if (c === "," || c === "\n" || (c === "\r" && text[i + 1] === "\n")) {
        afterQuote = false;
        if (c === ",") {
          push();
          if (row.length > opts.maxCols) throw new CsvError("csv: too many columns");
        } else if (c === "\n") {
          endRow();
          if (rows.length > opts.maxRows) throw new CsvError("csv: too many rows");
        }
      } else {
        throw new CsvError(`csv: unexpected character after closing quote`);
      }
    } else if (c === '"') {
      if (field !== "") throw new CsvError("csv: quote inside unquoted field");
      quoted = true;
    } else if (c === ",") {
      push();
      if (row.length > opts.maxCols) throw new CsvError("csv: too many columns");
    } else if (c === "\n") {
      endRow();
      if (rows.length > opts.maxRows) throw new CsvError("csv: too many rows");
    } else if (c === "\r") {
      if (text[i + 1] !== "\n") throw new CsvError("csv: bare CR");
    } else {
      field += c;
    }
  }
  if (quoted) throw new CsvError("csv: unterminated quote");
  if (field !== "" || row.length > 0) {
    endRow();
    if (rows.length > opts.maxRows) throw new CsvError("csv: too many rows");
  }
  // drop trailing fully-empty rows (final newline)
  while (rows.length && rows[rows.length - 1].every((f) => f === "")) rows.pop();
  if (rows.length === 0) throw new CsvError("csv: empty");
  const cols = rows[0].length;
  if (cols < 1 || cols > opts.maxCols) throw new CsvError("csv: bad column count");
  for (const r of rows) {
    if (r.length !== cols) throw new CsvError("csv: ragged row");
  }
  return rows;
}

/** Two-column-name accessor; throws when a required column is missing. */
export function headerIndex(header: string[], required: string[]): number[] {
  return required.map((name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new CsvError(`csv: missing column ${name}`);
    return i;
  });
}
