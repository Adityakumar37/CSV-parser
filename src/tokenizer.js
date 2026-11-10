export class CsvParseError extends Error {
  constructor(message, row) {
    super(message);
    this.name = "CsvParseError";
    this.row = row;
    this.status = 400;
  }
}

const START = 0;
const UNQUOTED = 1;
const QUOTED = 2;
const QUOTE_END = 3;
const CR = 4;

export class Tokenizer {
  constructor(options = {}) {
    this.delim = options.delimiter || ",";
    this.quote = options.quote || '"';
    this.trim = options.trim || false;
    this.skipEmpty = options.skipEmptyLines !== undefined ? options.skipEmptyLines : true;

    this.state = START;
    this.field = "";
    this.quoted = false;
    this.hadQuote = false;
    this.row = [];
    this.rowQuoted = [];
    this.rowNum = 0;
    this.quoteRow = 0;
    this.started = false;
    this.batch = null;
    this.rows = [];
  }

  feed(input) {
    if (!this.started) {
      this.started = true;
      if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
    }

    let batch = [];
    this.batch = batch;

    for (let i = 0; i < input.length; i++) {
      let ch = input[i];

      switch (this.state) {
        case START:
          if (ch === this.quote) {
            this.quoteRow = this.rowNum + 1;
            this.quoted = true;
            this.hadQuote = true;
            this.state = QUOTED;
          } else if (ch === this.delim) {
            this.endField();
          } else if (ch === "\r") {
            this.endField();
            this.state = CR;
          } else if (ch === "\n") {
            this.endField();
            this.endRow();
          } else {
            this.field += ch;
            this.state = UNQUOTED;
          }
          break;

        case UNQUOTED:
          if (ch === this.delim) {
            this.endField();
            this.state = START;
          } else if (ch === "\r") {
            this.endField();
            this.state = CR;
          } else if (ch === "\n") {
            this.endField();
            this.endRow();
          } else {
            this.field += ch;
          }
          break;

        case QUOTED:
          if (ch === this.quote) {
            this.state = QUOTE_END;
          } else {
            this.field += ch;
          }
          break;

        case QUOTE_END:
          if (ch === this.quote) {
            this.field += this.quote;
            this.state = QUOTED;
          } else if (ch === this.delim) {
            this.endField();
            this.state = START;
          } else if (ch === "\r") {
            this.endField();
            this.state = CR;
          } else if (ch === "\n") {
            this.endField();
            this.endRow();
          } else if (this.trim && (ch === " " || ch === "\t")) {
          } else {
            throw new CsvParseError(
              `Unexpected character '${ch}' after closing quote at row ${this.rowNum + 1}.`,
              this.rowNum + 1
            );
          }
          break;

        case CR:
          // \r\n counts as one line ending; lone \r is also a line ending
          if (ch === "\n") {
            this.endRow();
          } else {
            this.endRow();
              i--;
          }
          break;
      }
    }

    this.batch = null;
    return batch;
  }

  finish() {
    if (this.state === QUOTED) {
      throw new CsvParseError(
        `Unterminated quoted field starting at row ${this.quoteRow}.`,
        this.quoteRow
      );
    }

    let batch = [];
    this.batch = batch;

    if (this.state === CR) {
      this.endRow();
    }

    if (this.state !== START || this.row.length > 0) {
      this.endField();
      this.endRow();
    }

    this.batch = null;
    return batch;
  }

  endField() {
    let val = this.field;
    if (this.trim && !this.quoted) val = val.trim();
    this.row.push(val);
    this.rowQuoted.push(this.quoted);
    this.field = "";
    this.quoted = false;
    this.state = START;
  }

  endRow() {
    let fields = this.row;
    let quoted = this.rowQuoted;
    let hadQuote = this.hadQuote;
    this.row = [];
    this.rowQuoted = [];
    this.hadQuote = false;
    this.state = START;

    if (this.skipEmpty && fields.length === 1 && fields[0] === "" && !hadQuote) return;

    this.rowNum++;
    let row = { fields, quoted, rowNumber: this.rowNum };
    this.rows.push(row);
    if (this.batch) this.batch.push(row);
  }
}
