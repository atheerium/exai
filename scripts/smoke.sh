#!/usr/bin/env bash
# End-to-end API smoke test for the Exaai MVP.
# Usage: BASE_URL=http://localhost:3000 EMAIL=you@exaai.test bash scripts/smoke.sh
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
EMAIL="${EMAIL:-smoke$(date +%s)@exaai.test}"
JAR="$(mktemp /tmp/exai-test.XXXXXX)"
trap 'rm -f "$JAR" /tmp/exam-smoke.pdf /tmp/exam-smoke.docx /tmp/unauth.txt' EXIT

echo "== register $EMAIL =="
curl -s -c "$JAR" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\",\"name\":\"Smoke\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('user', d['user']['email'])"

echo "== login =="
curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('user', d['user']['email'])"

echo "== new exam =="
E1=$(curl -s -b "$JAR" -X POST "$BASE/api/exams" -H "Content-Type: application/json" -d '{}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "exam $E1"

echo "== builder/new redirect =="
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" "$BASE/builder/new")
echo "redirect code $CODE"

echo "== config 3as 250w =="
curl -s -b "$JAR" -X PATCH "$BASE/api/exams/$E1" -H "Content-Type: application/json" \
  -d '{"config":{"level":"secondary","grade":"3as","stream":"Lettres et Langues Étrangères","length":250,"unit":"u-innovation","topic":"Artificial intelligence"}}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('title', d['title'])"

echo "== text =="
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/generate" -H "Content-Type: application/json" -d '{"type":"TEXT"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
assert len(t['text'].split()) > 100, 'text too short'
print('words', len(t['text'].split()), '| candidates', len(t['candidates']))"

echo "== part one =="
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/generate" -H "Content-Type: application/json" -d '{"type":"PART_ONE"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
total=sum(x['marks'] for x in p['tasks'])
assert total == 7, f'part one total {total}'
print('tasks', len(p['tasks']), 'total', total)"

echo "== text exploration =="
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/generate" -H "Content-Type: application/json" -d '{"type":"TEXT_EXPLORATION"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='TEXT_EXPLORATION'][0]
total=sum(x['marks'] for x in p['tasks'])
skills=[x['skill'] for x in p['tasks']]
assert total == 8, f'p2 total {total}'
assert set(skills) >= {'VOCABULARY','MORPHOLOGY','PHONOLOGY','GRAMMAR','DISCOURSE'}, skills
print('skills', skills, 'total', total)"

echo "== writing =="
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/generate" -H "Content-Type: application/json" -d '{"type":"WRITING"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='WRITING'][0]
kinds=[tp['kind'] for tp in p['topics']]
assert kinds == ['GUIDED','FREE'], kinds
g=[tp for tp in p['topics'] if tp['kind']=='GUIDED'][0]
assert g['keywords'], 'guided topic must have keywords'
print('topics', kinds, '| guided keywords:', g['keywords'])"

echo "== exports =="
curl -s -b "$JAR" -o /tmp/exam-smoke.pdf -w "pdf %{http_code} %{size_download}B\n" "$BASE/api/exams/$E1/export?format=pdf"
curl -s -b "$JAR" -o /tmp/exam-smoke.docx -w "docx %{http_code} %{size_download}B\n" "$BASE/api/exams/$E1/export?format=docx"
head -c 5 /tmp/exam-smoke.pdf | grep -q "%PDF-" && echo "pdf valid" || echo "pdf INVALID"

echo "== ownership isolation =="
OTHER=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"other$(date +%s)@exaai.test\",\"password\":\"secret123\"}" -c /tmp/other.jar | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['id'])")
CODE=$(curl -s -b /tmp/other.jar -o /dev/null -w "%{http_code}" "$BASE/api/exams/$E1")
rm -f /tmp/other.jar
[ "$CODE" = "404" ] && echo "isolation ok (404)" || echo "isolation FAILED ($CODE)"

echo "SMOKE OK"
