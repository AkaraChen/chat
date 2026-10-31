// Arithmetic for interactive views: `+ - * / % ^`, parentheses, unary minus,
// a few functions and named variables. Parsed by hand, never with `eval`, so
// a spec can compute a value without running code. Shared by the server,
// which checks expressions when it validates a view, and the web app, which
// evaluates them as state changes.

type Node =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "neg"; arg: Node }
  | { kind: "bin"; op: "+" | "-" | "*" | "/" | "%" | "^"; left: Node; right: Node }
  | { kind: "call"; name: FunctionName; args: Node[] };

const FUNCTIONS = {
  min: (...a: number[]) => Math.min(...a),
  max: (...a: number[]) => Math.max(...a),
  abs: (a: number) => Math.abs(a),
  round: (a: number, digits = 0) => {
    const f = 10 ** digits;
    return Math.round(a * f) / f;
  },
  floor: (a: number) => Math.floor(a),
  ceil: (a: number) => Math.ceil(a),
  sqrt: (a: number) => Math.sqrt(a),
  pow: (a: number, b: number) => a ** b,
  log: (a: number) => Math.log(a),
  exp: (a: number) => Math.exp(a),
} as const;

type FunctionName = keyof typeof FUNCTIONS;

export const calcFunctions = Object.keys(FUNCTIONS) as FunctionName[];

const MAX_LENGTH = 400;

export class CalcError extends Error {}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  const pattern = /\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|\*\*|[-+*/%^(),])/y;
  let index = 0;
  while (index < source.length) {
    if (/^\s+$/.test(source.slice(index))) break;
    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (!match) throw new CalcError(`unexpected "${source.slice(index).trim()[0]}"`);
    tokens.push(match[1] === "**" ? "^" : match[1]!);
    index = pattern.lastIndex;
  }
  return tokens;
}

/** Parse an expression. Throws CalcError when it is not valid. */
export function parseCalc(source: string): Node {
  if (source.length > MAX_LENGTH) throw new CalcError("expression is too long");
  const tokens = tokenize(source);
  let at = 0;
  const peek = () => tokens[at];
  const take = (expected?: string) => {
    const token = tokens[at];
    if (token === undefined) throw new CalcError("expression ends too early");
    if (expected && token !== expected) throw new CalcError(`expected "${expected}"`);
    at++;
    return token;
  };

  // Lowest to highest: + -, * / %, unary minus, ^ (right-associative).
  function sum(): Node {
    let left = product();
    while (peek() === "+" || peek() === "-") {
      const op = take() as "+" | "-";
      left = { kind: "bin", op, left, right: product() };
    }
    return left;
  }
  function product(): Node {
    let left = unary();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = take() as "*" | "/" | "%";
      left = { kind: "bin", op, left, right: unary() };
    }
    return left;
  }
  function unary(): Node {
    if (peek() === "-") {
      take();
      return { kind: "neg", arg: unary() };
    }
    if (peek() === "+") {
      take();
      return unary();
    }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (peek() === "^") {
      take();
      return { kind: "bin", op: "^", left: base, right: unary() };
    }
    return base;
  }
  function atom(): Node {
    const token = take();
    if (token === "(") {
      const inner = sum();
      take(")");
      return inner;
    }
    if (/^[\d.]/.test(token)) return { kind: "num", value: Number(token) };
    if (/^[A-Za-z_]/.test(token)) {
      if (peek() !== "(") return { kind: "var", name: token };
      if (!Object.hasOwn(FUNCTIONS, token)) throw new CalcError(`unknown function "${token}"`);
      take("(");
      const args: Node[] = [];
      if (peek() !== ")") {
        args.push(sum());
        while (peek() === ",") {
          take();
          args.push(sum());
        }
      }
      take(")");
      return { kind: "call", name: token as FunctionName, args };
    }
    throw new CalcError(`unexpected "${token}"`);
  }

  const node = sum();
  if (at < tokens.length) throw new CalcError(`unexpected "${tokens[at]}"`);
  return node;
}

/** The variable names an expression reads. */
export function calcVariables(source: string): string[] {
  const names = new Set<string>();
  const walk = (node: Node) => {
    if (node.kind === "var") names.add(node.name);
    else if (node.kind === "neg") walk(node.arg);
    else if (node.kind === "bin") {
      walk(node.left);
      walk(node.right);
    } else if (node.kind === "call") node.args.forEach(walk);
  };
  walk(parseCalc(source));
  return [...names];
}

function run(node: Node, vars: Record<string, number>): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "var": {
      if (!Object.hasOwn(vars, node.name)) throw new CalcError(`unknown variable "${node.name}"`);
      return vars[node.name]!;
    }
    case "neg":
      return -run(node.arg, vars);
    case "call":
      return (FUNCTIONS[node.name] as (...a: number[]) => number)(
        ...node.args.map((arg) => run(arg, vars)),
      );
    case "bin": {
      const a = run(node.left, vars);
      const b = run(node.right, vars);
      if (node.op === "+") return a + b;
      if (node.op === "-") return a - b;
      if (node.op === "*") return a * b;
      if (node.op === "/") return a / b;
      if (node.op === "%") return a % b;
      return a ** b;
    }
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

/**
 * Evaluate an expression. Returns NaN rather than throwing, since a value a
 * user is dragging should never break the view.
 */
export function calc(source: string, vars: Record<string, unknown>): number {
  try {
    const numbers: Record<string, number> = {};
    for (const [name, value] of Object.entries(vars)) numbers[name] = toNumber(value);
    const result = run(parseCalc(source), numbers);
    return Number.isFinite(result) ? result : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

/** A number as views show it: rounded, grouped, with its unit. NaN shows as "—". */
export function formatNumber(value: unknown, precision = 0, unit = ""): string {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return "—";
  const digits = Math.max(0, Math.min(4, Math.round(precision)));
  const text = number.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (!unit) return text;
  // A currency sign or other short prefix sits before the number.
  if (/^[$€£¥₹]$/.test(unit)) return `${unit}${text}`;
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}
