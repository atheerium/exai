import { test } from "node:test";
import assert from "node:assert/strict";

// Test the safeParse function (replicated inline since it's not exported)
function safeParse<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json);
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Failed to parse JSON:", json.substring(0, 100) + (json.length > 100 ? "..." : ""));
    }
    return defaultValue;
  }
}

test("safeParse returns default value for null input", () => {
  const result = safeParse(null, [] as string[]);
  assert.deepEqual(result, []);
});

test("safeParse returns default value for undefined input", () => {
  const result = safeParse(undefined, { foo: "bar" });
  assert.deepEqual(result, { foo: "bar" });
});

test("safeParse returns default value for empty string", () => {
  const result = safeParse("", [] as number[]);
  assert.deepEqual(result, []);
});

test("safeParse returns default value for invalid JSON", () => {
  const result = safeParse("{invalid json", { error: true });
  assert.deepEqual(result, { error: true });
});

test("safeParse parses valid JSON array", () => {
  const result = safeParse('[1, 2, 3]', [] as number[]);
  assert.deepEqual(result, [1, 2, 3]);
});

test("safeParse parses valid JSON object", () => {
  const result = safeParse('{"name":"test","value":42}', {} as { name: string; value: number });
  assert.deepEqual(result, { name: "test", value: 42 });
});

test("safeParse handles nested objects", () => {
  const result = safeParse<{ user: { id: number; name: string } }>(
    '{"user":{"id":1,"name":"Alice"}}',
    { user: { id: 0, name: "" } }
  );
  assert.equal(result.user.id, 1);
  assert.equal(result.user.name, "Alice");
});

test("safeParse handles JSON with whitespace", () => {
  const result = safeParse('  \n\t{ "key": "value" }  \n', {} as { key: string });
  assert.deepEqual(result, { key: "value" });
});

test("safeParse returns null for JSON null", () => {
  const result = safeParse("null", "default" as string | null);
  assert.equal(result, null);
});

test("safeParse parses JSON primitives", () => {
  assert.equal(safeParse("42", 0), 42);
  assert.equal(safeParse("3.14", 0), 3.14);
  assert.equal(safeParse("true", false), true);
  assert.equal(safeParse('"hello"', ""), "hello");
});

test("safeParse handles truncated JSON", () => {
  const result = safeParse('{"a":1,"b":', { error: true });
  assert.deepEqual(result, { error: true });
});

test("safeParse handles JSON with trailing garbage", () => {
  const result = safeParse('{"a":1}garbage', { error: true });
  assert.deepEqual(result, { error: true });
});
