export type TokenKind = "key" | "string" | "number" | "literal" | "plain";

export interface Token {
  kind: TokenKind;
  text: string;
}

// Matches, in order: a string (and whether a colon follows, making it a key), a number,
// or true/false/null. Everything between matches is punctuation and whitespace.
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

export function tokenizeJson(value: unknown): Token[] {
  const json = JSON.stringify(value, null, 2);
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of json.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ kind: "plain", text: json.slice(cursor, index) });
    if (match[1] !== undefined) {
      tokens.push({ kind: match[2] ? "key" : "string", text: match[1] });
      if (match[2]) tokens.push({ kind: "plain", text: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ kind: "number", text: match[3] });
    } else {
      tokens.push({ kind: "literal", text: match[0] });
    }
    cursor = index + match[0].length;
  }
  if (cursor < json.length) tokens.push({ kind: "plain", text: json.slice(cursor) });
  return tokens;
}
