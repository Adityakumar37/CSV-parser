import fs from "node:fs";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createParseStream } from "./stream.js";
import { validateOptions } from "./options.js";

const parseKeys = ["delimiter", "quote", "trim", "headers", "skipEmptyLines", "maxRows", "cast"];

function parseOptions(options) {
  const result = {};
  for (const key of parseKeys) {
    if (key in options) result[key] = options[key];
  }
  return result;
}

function getFiles(req) {
  if (req.file) return [req.file];
  if (!req.files) return [];

  if (Array.isArray(req.files)) return req.files;

  const files = [];
  for (const key of Object.keys(req.files)) {
    const group = Array.isArray(req.files[key]) ? req.files[key] : [req.files[key]];
    for (const file of group) files.push(file);
  }
  return files;
}

async function parseFile(file, options) {
  const source = file.buffer
    ? Readable.from([file.buffer])
    : fs.createReadStream(file.path);
  const parser = createParseStream(options);
  const rows = [];
  const output = new Writable({
    objectMode: true,
    write(row, encoding, callback) {
      rows.push(row);
      callback();
    },
  });

  await pipeline(source, parser, output);
  return rows;
}

export function csvMiddleware(options = {}) {
  validateOptions(options);

  const csvOptions = parseOptions(options);
  const property = options.property === undefined ? "csv" : options.property;
  const maxBytes = options.maxBytes === undefined ? 1_000_000 : options.maxBytes;
  const timeout = options.timeout === undefined ? 30_000 : options.timeout;

  return function (req, res, next) {
    let done = false;

    function finish(err) {
      if (done) return;
      done = true;
      if (err) next(err);
      else next();
    }

    const files = getFiles(req);
    if (files.length) {
      (async () => {
        const results = [];
        for (const file of files) results.push(await parseFile(file, csvOptions));

        if (files.length === 1) {
          req[property] = results[0];
        } else {
          const grouped = {};
          for (let i = 0; i < files.length; i++) {
            const key = files[i].fieldname;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(results[i]);
          }
          req[property] = grouped;
        }
      })().then(() => finish(), finish);
      return;
    }

    const type = req.headers && (req.headers["content-type"] || req.headers["Content-Type"]);
    if (typeof type !== "string" || !/^text\/csv(?:\s*;|\s*$)/i.test(type)) {
      finish();
      return;
    }

    const parser = createParseStream(csvOptions);
    const rows = [];
    let bytes = 0;
    let ended = false;
    const timer = setTimeout(() => {
      const err = new Error("CSV request timed out.");
      err.status = 408;
      stop(err);
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      req.removeListener("aborted", abort);
      req.removeListener("close", close);
      req.removeListener("error", error);
      req.removeListener("data", countBytes);
      parser.removeListener("data", data);
      parser.removeListener("end", end);
      parser.removeListener("error", error);
    }

    function stop(err) {
      if (done) return;
      req.unpipe(parser);
      parser.destroy();
      req.resume();
      cleanup();
      finish(err);
    }

    function data(row) {
      rows.push(row);
    }

    function end() {
      ended = true;
      req[property] = rows;
      cleanup();
      finish();
    }

    function error(err) {
      stop(err);
    }

    function abort() {
      if (done) return;
      done = true;
      req.unpipe(parser);
      cleanup();
      parser.destroy();
    }

    function close() {
      if (!ended && !req.complete) abort();
    }

    function countBytes(chunk) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        const err = new Error(`CSV body exceeds the ${maxBytes} byte limit.`);
        err.status = 413;
        stop(err);
      }
    }

    req.on("aborted", abort);
    req.on("close", close);
    req.on("error", error);
    parser.on("data", data);
    parser.on("end", end);
    parser.on("error", error);
    req.on("data", countBytes);
    req.pipe(parser);
  };
}
