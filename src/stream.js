import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { Tokenizer } from "./tokenizer.js";
import { createRowBuilder } from "./parser.js";

export function createParseStream(options = {}) {
  const tokenizer = new Tokenizer(options);
  const processRow = createRowBuilder(options);
  const decoder = new StringDecoder("utf8");
  let done = false;

  const stream = new Transform({
    readableObjectMode: true,

    transform(chunk, _encoding, callback) {
      if (done) return callback();
      try {
        const text = decoder.write(chunk);
        if (!text) return callback();
        const rows = tokenizer.feed(text);
        for (const row of rows) {
          const record = processRow(row);
          if (record !== null) {
            this.push(record);
          }
        }
        callback();
      } catch (err) {
        done = true;
        callback(err);
      }
    },

    flush(callback) {
      if (done) return callback();
      try {
        // flush any remaining bytes from the decoder (incomplete multibyte chars)
        const remaining = decoder.end();
        if (remaining) {
          const rows = tokenizer.feed(remaining);
          for (const row of rows) {
            const record = processRow(row);
            if (record !== null) this.push(record);
          }
        }
        const rows = tokenizer.finish();
        for (const row of rows) {
          const record = processRow(row);
          if (record !== null) this.push(record);
        }
        callback();
      } catch (err) {
        callback(err);
      }
    },
  });

  return stream;
}

