/**
 * CsvParseError – thrown for any malformed CSV or structural problem.
 *
 * Properties:
 *   name   {string} "CsvParseError"
 *   row    {number} 1-based row number where the problem was detected
 *   status {number} 400  (reserved for future HTTP-middleware use)
 */
export class CsvParseError extends Error {
  /**
   * @param {string} message
   * @param {number} row  1-based row number
   */
  constructor(message, row) {
    super(message);
    this.name = "CsvParseError";
    this.row = row;
    this.status = 400;
  }
}

// ─── tokenizer states ───────────────────────────────────────────────────────

const STATE_FIELD_START = "FIELD_START";   // beginning of a new field
const STATE_UNQUOTED    = "UNQUOTED";      // inside an unquoted field
const STATE_QUOTED      = "QUOTED";        // inside a quoted field
const STATE_QUOTE_END   = "QUOTE_END";     // just saw a closing '"'
const STATE_CR          = "CR";            // just saw a '\r'

/**
 * Tokenizer – character-by-character state machine.
 *
 * Design note: state is stored as instance properties so the class can, in a
 * future phase, accept data in chunks without a structural rewrite.  For now
 * the full string is fed in a single `feed()` call followed by `finish()`.
 */
export class Tokenizer {
  constructor() {
    /** @type {string} */
    this._state = STATE_FIELD_START;

    /** Characters accumulated for the current field. */
    this._field = "";

    /** Fields accumulated for the current row. */
    this._row = [];

    /**
     * 1-based row counter.  Blank rows are excluded from the count so this
     * matches the spec's "rows" (records), not physical lines.
     */
    this._rowNumber = 0;

    /**
     * Physical row where the current quoted field opened.
     * Used in error messages for unterminated-quote errors.
     */
    this._quotedFieldOpenRow = 0;

    /**
     * Accumulates completed rows.
     * @type {Array<{fields: string[], rowNumber: number}>}
     */
    this.rows = [];
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /**
   * Feed the complete CSV string.  Strip a leading BOM if present.
   * @param {string} input
   */
  feed(input) {
    // Strip UTF-8 BOM (\uFEFF) that Excel / some editors prepend.
    if (input.charCodeAt(0) === 0xfeff) {
      input = input.slice(1);
    }

    for (let i = 0; i < input.length; i++) {
      this._processChar(input[i], input[i + 1]);
    }
  }

  /**
   * Signal end-of-input.  Flushes the final field / row.
   * Throws CsvParseError for an unterminated quote.
   */
  finish() {
    if (this._state === STATE_QUOTED) {
      throw new CsvParseError(
        `Unterminated quoted field starting at row ${this._quotedFieldOpenRow}.`,
        this._quotedFieldOpenRow
      );
    }

    // A trailing CR that was never followed by LF.
    if (this._state === STATE_CR) {
      this._commitRow();
    }

    // If there is content (or we are mid-field), flush the last field/row.
    if (this._state !== STATE_FIELD_START || this._row.length > 0) {
      this._commitField();
      this._commitRow();
    }
  }

  // ── private helpers ────────────────────────────────────────────────────────

  /**
   * Process a single character.
   * @param {string} ch   current character
   * @param {string} next next character (may be undefined at end of string)
   */
  _processChar(ch, next) {
    switch (this._state) {
      case STATE_FIELD_START:
        this._onFieldStart(ch);
        break;
      case STATE_UNQUOTED:
        this._onUnquoted(ch);
        break;
      case STATE_QUOTED:
        this._onQuoted(ch);
        break;
      case STATE_QUOTE_END:
        this._onQuoteEnd(ch);
        break;
      case STATE_CR:
        this._onCr(ch);
        break;
    }
  }

  /** Entered at the beginning of each field. */
  _onFieldStart(ch) {
    if (ch === '"') {
      // Record which row this quoted field opened on for error reporting.
      this._quotedFieldOpenRow = this._rowNumber + 1; // +1: not yet committed
      this._state = STATE_QUOTED;
    } else if (ch === ",") {
      // Empty unquoted field followed immediately by delimiter.
      this._commitField();
      // state stays FIELD_START
    } else if (ch === "\r") {
      // Empty field, row ends.
      this._commitField();
      this._state = STATE_CR;
    } else if (ch === "\n") {
      this._commitField();
      this._commitRow();
      // state goes back to FIELD_START via _commitRow
    } else {
      this._field += ch;
      this._state = STATE_UNQUOTED;
    }
  }

  /** Inside an unquoted field. */
  _onUnquoted(ch) {
    if (ch === ",") {
      this._commitField();
      this._state = STATE_FIELD_START;
    } else if (ch === "\r") {
      this._commitField();
      this._state = STATE_CR;
    } else if (ch === "\n") {
      this._commitField();
      this._commitRow();
    } else {
      // Stray '"' inside an unquoted field → treated as a literal character.
      this._field += ch;
    }
  }

  /** Inside a quoted field. */
  _onQuoted(ch) {
    if (ch === '"') {
      // Could be an escaped quote ("") or the closing quote.
      this._state = STATE_QUOTE_END;
    } else {
      // Everything else — including commas, \n, \r — is literal text.
      this._field += ch;
    }
  }

  /**
   * We just saw a closing `"`.  Wait for the next character to decide:
   *   - another `"` → escaped quote, stay in quoted state
   *   - `,`         → field ends, delimiter
   *   - `\r`/`\n`  → field ends, row ends
   *   - end-of-input → handled in finish()
   *   - anything else → error (characters after closing quote)
   */
  _onQuoteEnd(ch) {
    if (ch === '"') {
      // Escaped quote: emit a single '"' and continue inside the quoted field.
      this._field += '"';
      this._state = STATE_QUOTED;
    } else if (ch === ",") {
      this._commitField();
      this._state = STATE_FIELD_START;
    } else if (ch === "\r") {
      this._commitField();
      this._state = STATE_CR;
    } else if (ch === "\n") {
      this._commitField();
      this._commitRow();
    } else {
      // Characters found after the closing quote → malformed.
      throw new CsvParseError(
        `Unexpected character '${ch}' after closing quote at row ${
          this._rowNumber + 1
        }.`,
        this._rowNumber + 1
      );
    }
  }

  /**
   * We just saw `\r`.  If the next character is `\n` (CRLF), consume it and
   * treat the pair as one line ending.  Otherwise it was a lone `\r`.
   */
  _onCr(ch) {
    if (ch === "\n") {
      // CRLF – the \n completes the line ending; commit the row.
      this._commitRow();
    } else {
      // Lone \r – row already had its field committed; commit the row, then
      // re-process `ch` as if we are at the start of a new field.
      this._commitRow();
      this._processChar(ch, undefined);
    }
  }

  /** Push the current field buffer onto the current row, then reset. */
  _commitField() {
    this._row.push(this._field);
    this._field = "";
    this._state = STATE_FIELD_START;
  }

  /**
   * Evaluate the accumulated row:
   *   - Blank rows (zero non-empty fields, single empty field) → skip, do not
   *     increment the row counter.
   *   - Otherwise push as a record and increment the counter.
   */
  _commitRow() {
    const fields = this._row;
    this._row = [];
    this._state = STATE_FIELD_START;

    // A "blank" row is one that has exactly one field and that field is empty.
    // This covers both a truly empty line and a line with only CR/LF.
    const isBlank = fields.length === 1 && fields[0] === "";
    if (isBlank) return;

    this._rowNumber++;
    this.rows.push({ fields, rowNumber: this._rowNumber });
  }
}
