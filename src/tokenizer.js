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
  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    this._delimiter = options.delimiter !== undefined ? options.delimiter : ",";
    this._quote = options.quote !== undefined ? options.quote : '"';
    this._trim = options.trim !== undefined ? options.trim : false;
    this._skipEmptyLines =
      options.skipEmptyLines !== undefined ? options.skipEmptyLines : true;

    /** @type {string} */
    this._state = STATE_FIELD_START;

    /** Characters accumulated for the current field. */
    this._field = "";

    /** Whether the current field was opened with a quote. */
    this._isQuoted = false;

    /** Whether any field in the current row was opened with a quote. */
    this._rowHadQuote = false;

    /** Fields accumulated for the current row. */
    this._row = [];

    /** Parallel array: whether each field in the current row was quoted. */
    this._rowQuoted = [];

    /**
     * 1-based row counter.  Blank rows are excluded from the count (when skipEmptyLines is true)
     * so this matches the spec's "rows" (records), not physical lines.
     */
    this._rowNumber = 0;

    /**
     * Physical row where the current quoted field opened.
     * Used in error messages for unterminated-quote errors.
     */
    this._quotedFieldOpenRow = 0;

    /** Whether feed() has been called at least once (for first-chunk BOM strip). */
    this._started = false;

    /** Current batch of completed rows drained during feed() or finish(). */
    this._currentBatch = null;

    /**
     * Accumulates completed rows.
     * @type {Array<{fields: string[], rowNumber: number}>}
     */
    this.rows = [];
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /**
   * Feed CSV text. Strip a leading BOM on the first chunk only.
   * Returns newly completed rows produced by this chunk.
   * @param {string} input
   * @returns {Array<{fields: string[], rowNumber: number}>}
   */
  feed(input) {
    if (!this._started) {
      this._started = true;
      if (input.charCodeAt(0) === 0xfeff) {
        input = input.slice(1);
      }
    }

    const batch = [];
    this._currentBatch = batch;

    for (let i = 0; i < input.length; i++) {
      this._processChar(input[i]);
    }

    this._currentBatch = null;
    return batch;
  }

  /**
   * Signal end-of-input.  Flushes the final field / row.
   * Returns final completed rows produced by flushing.
   * Throws CsvParseError for an unterminated quote.
   * @returns {Array<{fields: string[], rowNumber: number}>}
   */
  finish() {
    if (this._state === STATE_QUOTED) {
      throw new CsvParseError(
        `Unterminated quoted field starting at row ${this._quotedFieldOpenRow}.`,
        this._quotedFieldOpenRow
      );
    }

    const batch = [];
    this._currentBatch = batch;

    // A trailing CR that was never followed by LF.
    if (this._state === STATE_CR) {
      this._commitRow();
    }

    // If there is content (or we are mid-field), flush the last field/row.
    if (this._state !== STATE_FIELD_START || this._row.length > 0) {
      this._commitField();
      this._commitRow();
    }

    this._currentBatch = null;
    return batch;
  }

  // ── private helpers ────────────────────────────────────────────────────────

  /**
   * Process a single character.
   * @param {string} ch current character
   */
  _processChar(ch) {
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
    if (ch === this._quote) {
      // Record which row this quoted field opened on for error reporting.
      this._quotedFieldOpenRow = this._rowNumber + 1; // +1: not yet committed
      this._isQuoted = true;
      this._rowHadQuote = true;
      this._state = STATE_QUOTED;
    } else if (ch === this._delimiter) {
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
    if (ch === this._delimiter) {
      this._commitField();
      this._state = STATE_FIELD_START;
    } else if (ch === "\r") {
      this._commitField();
      this._state = STATE_CR;
    } else if (ch === "\n") {
      this._commitField();
      this._commitRow();
    } else {
      // Stray quote inside an unquoted field → treated as a literal character.
      this._field += ch;
    }
  }

  /** Inside a quoted field. */
  _onQuoted(ch) {
    if (ch === this._quote) {
      // Could be an escaped quote or the closing quote.
      this._state = STATE_QUOTE_END;
    } else {
      // Everything else — including delimiter, \n, \r — is literal text.
      this._field += ch;
    }
  }

  /**
   * We just saw a closing quote.  Wait for the next character to decide:
   *   - another quote → escaped quote, stay in quoted state
   *   - delimiter     → field ends, delimiter
   *   - \r/\n         → field ends, row ends
   *   - end-of-input  → handled in finish()
   *   - whitespace    → ignored after closing quote when trim is true
   *   - anything else → error (characters after closing quote)
   */
  _onQuoteEnd(ch) {
    if (ch === this._quote) {
      // Escaped quote: emit a single quote and continue inside the quoted field.
      this._field += this._quote;
      this._state = STATE_QUOTED;
    } else if (ch === this._delimiter) {
      this._commitField();
      this._state = STATE_FIELD_START;
    } else if (ch === "\r") {
      this._commitField();
      this._state = STATE_CR;
    } else if (ch === "\n") {
      this._commitField();
      this._commitRow();
    } else if (this._trim && (ch === " " || ch === "\t")) {
      // Trailing whitespace after closing quote allowed with trim: true
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
      this._processChar(ch);
    }
  }

  /** Push the current field buffer onto the current row, then reset. */
  _commitField() {
    let val = this._field;
    if (this._trim && !this._isQuoted) {
      val = val.trim();
    }
    this._row.push(val);
    this._rowQuoted.push(this._isQuoted);
    this._field = "";
    this._isQuoted = false;
    this._state = STATE_FIELD_START;
  }

  /**
   * Evaluate the accumulated row:
   *   - Blank rows (zero non-empty fields, single empty field without quotes) → skip (when skipEmptyLines is true),
   *     do not increment the row counter.
   *   - Otherwise push as a record and increment the counter.
   */
  _commitRow() {
    const fields = this._row;
    const quoted = this._rowQuoted;
    const hadQuote = this._rowHadQuote;
    this._row = [];
    this._rowQuoted = [];
    this._rowHadQuote = false;
    this._state = STATE_FIELD_START;

    // A "blank" row is one that has exactly one field and that field is empty,
    // and neither that field nor the row had quotes.
    const isBlank = fields.length === 1 && fields[0] === "" && !hadQuote;
    if (this._skipEmptyLines && isBlank) return;

    this._rowNumber++;
    const row = { fields, quoted, rowNumber: this._rowNumber };
    this.rows.push(row);
    if (this._currentBatch) {
      this._currentBatch.push(row);
    }
  }
}
