import type { Transform } from "node:stream";

export type CastContext = {
  column: string | number;
  index: number;
  row: number;
  quoted: boolean;
};

export type CastRules = {
  number?: boolean;
  boolean?: boolean;
  null?: boolean;
  date?: boolean;
};

export type ParseOptions = {
  delimiter?: string;
  quote?: string;
  trim?: boolean;
  headers?: boolean | string[];
  skipEmptyLines?: boolean;
  maxRows?: number;
  cast?: boolean | CastRules | ((value: string, context: CastContext) => unknown);
};

export type ParseOptionsWithoutHeaders = Omit<ParseOptions, "headers"> & {
  headers: false;
};

export type CsvRecord = Record<string, unknown>;

export class CsvParseError extends Error {
  row: number;
  status: number;
}

export function parseCSV(input: string, options: ParseOptionsWithoutHeaders): string[][];
export function parseCSV(input: string, options?: ParseOptions): CsvRecord[];

export function createParseStream(options?: ParseOptions): Transform;

export type MiddlewareOptions = ParseOptions & {
  maxBytes?: number;
  property?: string;
  timeout?: number;
};

export function csvMiddleware(options?: MiddlewareOptions): (
  req: any,
  res: any,
  next: (err?: Error) => void
) => void;
