import { test } from "node:test";
import assert from "node:assert/strict";
import { cn, formatMarks, titleCase } from "./utils";

test("formatMarks returns integer for whole numbers", () => {
  assert.equal(formatMarks(5), "5");
  assert.equal(formatMarks(10), "10");
  assert.equal(formatMarks(20), "20");
});

test("formatMarks formats decimal with one decimal place", () => {
  assert.equal(formatMarks(5.5), "5.5");
  assert.equal(formatMarks(7.5), "7.5");
  assert.equal(formatMarks(1.5), "1.5");
});

test("formatMarks strips trailing zero", () => {
  assert.equal(formatMarks(7.0), "7");
  assert.equal(formatMarks(10.0), "10");
  assert.equal(formatMarks(20.0), "20");
});

test("formatMarks handles typical exam marks", () => {
  // Part One marks (can be 1.5, 2, 1, etc.)
  assert.equal(formatMarks(1), "1");
  assert.equal(formatMarks(1.5), "1.5");
  assert.equal(formatMarks(2), "2");
  
  // Text Exploration marks
  assert.equal(formatMarks(7), "7");
  assert.equal(formatMarks(8), "8");
  
  // Writing marks
  assert.equal(formatMarks(5), "5");
  assert.equal(formatMarks(6), "6");
});

test("titleCase capitalizes first letter of each word", () => {
  assert.equal(titleCase("hello world"), "Hello World");
  // Already uppercase words stay uppercase (first char already uppercase)
  assert.equal(titleCase("HELLO WORLD"), "HELLO WORLD");
  // Mixed case: first char of each word capitalized, rest unchanged
  assert.equal(titleCase("hELLO wORLD"), "HELLO WORLD");
});

test("titleCase handles single words", () => {
  assert.equal(titleCase("hello"), "Hello");
  assert.equal(titleCase("world"), "World");
});

test("titleCase handles empty string", () => {
  assert.equal(titleCase(""), "");
});

test("titleCase handles single character", () => {
  assert.equal(titleCase("a"), "A");
});

test("titleCase handles already title case", () => {
  assert.equal(titleCase("Hello World"), "Hello World");
});

test("titleCase handles words with apostrophes", () => {
  // The regex /\\w\\S*/g splits on word boundaries; apostrophes are treated as word chars
  assert.equal(titleCase("it's"), "It's");
});

// cn() is a wrapper around clsx + tailwind-merge, testing basic functionality
test("cn merges class names", () => {
  const result = cn("text-red-500", "bg-blue-500");
  assert.ok(result.includes("text-red-500"));
  assert.ok(result.includes("bg-blue-500"));
});

test("cn handles falsy values", () => {
  const result = cn("text-red-500", false, null, undefined, "");
  assert.ok(result.includes("text-red-500"));
});

test("cn handles conditional classes", () => {
  const isActive = true;
  const isDisabled = false;
  const result = cn(
    "base-class",
    isActive && "active-class",
    isDisabled && "disabled-class"
  );
  assert.ok(result.includes("base-class"));
  assert.ok(result.includes("active-class"));
  assert.ok(!result.includes("disabled-class"));
});

test("cn handles array input", () => {
  const classes = ["class-a", "class-b"];
  const result = cn(classes);
  assert.ok(result.includes("class-a"));
  assert.ok(result.includes("class-b"));
});

test("cn handles object input for conditional classes", () => {
  const result = cn({
    "active-class": true,
    "disabled-class": false,
    "base-class": true,
  });
  assert.ok(result.includes("active-class"));
  assert.ok(result.includes("base-class"));
  assert.ok(!result.includes("disabled-class"));
});
