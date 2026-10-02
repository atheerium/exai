import { test } from "node:test";
import assert from "node:assert/strict";
import { Seeded, countWords, hashString, mulberry32 } from "./rng";

// rng.ts backs the default provider (AI_PROVIDER=mock, the fallback when
// AI_PROVIDER is unset). Two things depend on it: reproducible output for a
// fixed seed, and indices that stay inside their array. The facade tests only
// check that two runs agree, which stays true even if `int` overran its bound
// or `shuffle` dropped elements -- so the bounds need pinning here.

test("hashString is deterministic, unsigned, and discriminating", () => {
  assert.equal(hashString("exam-1:3as:u-education:topic"), hashString("exam-1:3as:u-education:topic"));

  const samples = ["", "a", "b", "ab", "ba", "3as", "1as", "u-education", "u-society"];
  for (const s of samples) {
    const h = hashString(s);
    assert.ok(Number.isInteger(h), `${JSON.stringify(s)} -> non-integer ${h}`);
    assert.ok(h >= 0 && h <= 0xffffffff, `${JSON.stringify(s)} -> ${h} outside uint32`);
  }

  // Every distinct sample must hash distinctly, or seeds would collide and
  // different exams would share generated content.
  assert.equal(new Set(samples.map(hashString)).size, samples.length);
});

test("mulberry32 stays in [0, 1) and is reproducible", () => {
  const a = Array.from({ length: 500 }, mulberry32(42));
  const b = Array.from({ length: 500 }, mulberry32(42));
  assert.deepEqual(a, b);
  for (const v of a) {
    assert.ok(v >= 0 && v < 1, `${v} outside [0, 1)`);
  }
  assert.notDeepEqual(a, Array.from({ length: 500 }, mulberry32(43)));
});

test("Seeded: equal seeds replay, different seeds diverge", () => {
  const seq = (seed: string | number) => {
    const r = new Seeded(seed);
    return Array.from({ length: 20 }, () => r.next());
  };

  assert.deepEqual(seq("a"), seq("a"));
  assert.notDeepEqual(seq("a"), seq("b"));
});

test("Seeded: a string seed is hashed, a number seed is used directly", () => {
  assert.equal(new Seeded(99).next(), new Seeded(99).next());
  assert.equal(new Seeded("abc").next(), new Seeded(hashString("abc")).next());
});

test("Seeded.int stays inside [0, max)", () => {
  for (const max of [1, 2, 7, 10, 1000]) {
    const r = new Seeded(`int-${max}`);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(max);
      assert.ok(Number.isInteger(v), `int(${max}) -> ${v} is not an integer`);
      assert.ok(v >= 0 && v < max, `int(${max}) -> ${v} out of range`);
    }
  }
});

test("Seeded.int(1) is always 0, so single-item arrays never read undefined", () => {
  const r = new Seeded("single");
  for (let i = 0; i < 50; i++) assert.equal(r.int(1), 0);
});

test("Seeded.shuffle is a permutation that leaves its input untouched", () => {
  const source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const input = [...source];

  const shuffled = new Seeded("shuffle").shuffle(input);

  assert.deepEqual(input, source, "shuffle mutated the caller's array");
  assert.deepEqual([...shuffled].sort((a, b) => a - b), source, "shuffle lost or duplicated elements");
  assert.notDeepEqual(shuffled, source, "shuffle returned the input unchanged");
  assert.deepEqual(shuffled, new Seeded("shuffle").shuffle(source));
});

test("Seeded.take never returns more elements than exist, and never repeats", () => {
  const source = ["a", "b", "c", "d", "e"];

  for (const n of [0, 1, 3, 5, 99]) {
    const taken = new Seeded(`take-${n}`).take(source, n);
    assert.ok(taken.length <= Math.min(n, source.length), `take(${n}) -> ${taken.length}`);
    assert.equal(new Set(taken).size, taken.length, `take(${n}) repeated an element`);
    assert.deepEqual(taken, new Seeded(`take-${n}`).take(source, n));
  }
});

test("Seeded.pick returns a member of the array", () => {
  const forms = ["a paragraph", "an opinion paragraph", "a letter"];
  for (const seed of ["p1", "p2", "p3", "p4", "p5"]) {
    const r = new Seeded(seed);
    for (let i = 0; i < 50; i++) {
      assert.ok(forms.includes(r.pick(forms)));
    }
  }
});

test("countWords ignores runs of whitespace and counts punctuation as part of a word", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   \n\t "), 0);
  assert.equal(countWords("one"), 1);
  assert.equal(countWords("  one   two  "), 2);
  assert.equal(countWords("one\n\ntwo\nthree"), 3);
  assert.equal(countWords("don't stop-me now!"), 3);
});