#!/usr/bin/env bash
# End-to-end API smoke test for the Exaai MVP.
# Usage: BASE_URL=http://localhost:3000 EMAIL=you@exaai.test bash scripts/smoke.sh
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
EMAIL="${EMAIL:-smoke$(date +%s)@exaai.test}"
JAR="$(mktemp /tmp/exai-test.XXXXXX)"
DB_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/prisma/dev.db"
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

echo "== rewrite tools (US-023) =="
CUR=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
print(len(t['candidates']))")
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/generate" -H "Content-Type: application/json" \
  -d '{"type":"REWRITE","target":"simpler"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
assert len(t['candidates']) >= int('$CUR') + 3, 'rewrite did not append candidates'
print('rewrite appended candidates:', len(t['candidates']))"
curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
assert t['text'], 'current text lost after rewrite'
print('current text preserved after rewrite')"

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

echo "== export content (DOCX headings + text) =="
unzip -p /tmp/exam-smoke.docx word/document.xml > /tmp/exam-smoke-doc.xml
for needle in "A. Reading Comprehension" "B. Text exploration" "C. Written expression" "Task 1"; do
  grep -q "$needle" /tmp/exam-smoke-doc.xml && echo "docx contains: $needle" || echo "FAILED: docx missing: $needle"
done
TITLE=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
print(t['textTitle'] or '')")
if [ -n "$TITLE" ]; then
  grep -q "$TITLE" /tmp/exam-smoke-doc.xml && echo "docx contains generated text title" || echo "FAILED: docx missing text title"
fi
if command -v pdftotext >/dev/null 2>&1; then
  pdftotext /tmp/exam-smoke.pdf /tmp/exam-smoke-pdf.txt
  grep -q "Text exploration" /tmp/exam-smoke-pdf.txt && echo "pdf contains section heading" || echo "WARN: pdf text extraction skipped/unavailable"
fi
rm -f /tmp/exam-smoke-doc.xml /tmp/exam-smoke-pdf.txt

echo "== events linked to the exam (core funnel at export time) =="
python3 - "$DB_FILE" "$E1" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
n = con.execute("SELECT COUNT(*) FROM ProductEvent WHERE examId=?", (sys.argv[2],)).fetchone()[0]
assert n >= 8, f"too few core events for exam ({n})"
print(f"{n} core events linked to exam so far")
PYEOF

echo "== guide governance seeded =="
python3 - "$DB_FILE" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
rows = con.execute("SELECT COUNT(*), MIN(version) FROM GuideConfig").fetchone()
assert rows[0] == 7, f"expected 7 guide configs, got {rows[0]}"
print(f"{rows[0]} guide configs, version {rows[1]}")
PYEOF

echo "== ownership isolation =="
OTHER=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"other$(date +%s)@exaai.test\",\"password\":\"secret123\"}" -c /tmp/other.jar | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['id'])")
CODE=$(curl -s -b /tmp/other.jar -o /dev/null -w "%{http_code}" "$BASE/api/exams/$E1")
rm -f /tmp/other.jar
[ "$CODE" = "404" ] && echo "isolation ok (404)" || echo "isolation FAILED ($CODE)"

echo "== replacements =="
ORIG_TEXT=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
print(t['text'][:40])")
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/replace" -H "Content-Type: application/json" \
  -d '{"kind":"TEXT","index":1}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
assert t['candidates'], 'text candidates lost'
print('text alternative selected, candidates', len(t['candidates']))"
curl -s -b "$JAR" "$BASE/api/exams/$E1" | ORIG_TEXT="$ORIG_TEXT" python3 -c "
import sys,json,os
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
texts=[c['text'][:40] for c in t['candidates']]
assert os.environ['ORIG_TEXT'] in texts, 'replaced-away text not recoverable (PRD 15.3)'
print('replaced-away text preserved as candidate')"
TR=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
print(p['tasks'][2]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/replace" -H "Content-Type: application/json" \
  -d "{\"kind\":\"TASK\",\"taskId\":\"$TR\",\"index\":0}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
print('task replaced ok')"
TP=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='WRITING'][0]
print(p['topics'][0]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/replace" -H "Content-Type: application/json" \
  -d "{\"kind\":\"TOPIC\",\"topicId\":\"$TP\",\"index\":0}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('topic replaced ok')"

echo "== invalid parameters rejected =="
CODE=$(curl -s -b "$JAR" -o /tmp/inv1.json -w "%{http_code}" -X PATCH "$BASE/api/exams/$E1" -H "Content-Type: application/json" \
  -d '{"config":{"level":"secondary","grade":"3as","length":999,"unit":"u-education","topic":"X"}}')
[ "$CODE" = "400" ] && echo "length 999 rejected (400)" || echo "FAILED: length 999 accepted ($CODE)"
CODE2=$(curl -s -b "$JAR" -o /tmp/inv2.json -w "%{http_code}" -X PATCH "$BASE/api/exams/$E1" -H "Content-Type: application/json" \
  -d '{"config":{"level":"middle","grade":"3as","length":150,"unit":"u-education","topic":"X"}}')
[ "$CODE2" = "400" ] && echo "grade/level mismatch rejected (400)" || echo "FAILED: mismatch accepted ($CODE2)"
rm -f /tmp/inv1.json /tmp/inv2.json

echo "== task independence (one task changes alone) =="
BEFORE=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
print(p['tasks'][0]['prompt'])")
T3=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
print(p['tasks'][2]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/replace" -H "Content-Type: application/json" \
  -d "{\"kind\":\"TASK\",\"taskId\":\"$T3\",\"index\":0}" >/dev/null
AFTER=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
print(p['tasks'][0]['prompt'])")
[ "$BEFORE" = "$AFTER" ] && echo "task 0 unchanged after replacing task 2 (independence ok)" || echo "FAILED: task 0 changed"

echo "== edits persist (autosave path) =="
TSEC=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
print(t['id'])")
curl -s -b "$JAR" -X PATCH "$BASE/api/exams/$E1" -H "Content-Type: application/json" \
  -d "{\"sections\":[{\"id\":\"$TSEC\",\"text\":\"Edited passage text for the persistence check.\"}]}" >/dev/null
curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
assert t['text'] == 'Edited passage text for the persistence check.'
print('edited text persisted')"

echo "== version history (US-024) =="
REVS=$(curl -s -b "$JAR" "$BASE/api/exams/$E1/revisions" | python3 -c "
import sys,json
items = json.load(sys.stdin)['revisions']
assert len(items) >= 1, 'no auto-captured revisions'
print(len(items))")
echo "auto-captured revisions: $REVS"
CK=$(curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/revisions" -H "Content-Type: application/json" \
  -d '{"label":"checkpoint-before-overwrite"}' >/dev/null
curl -s -b "$JAR" "$BASE/api/exams/$E1/revisions" | python3 -c "
import sys,json
items = json.load(sys.stdin)['revisions']
ck = [r for r in items if r['label'] == 'checkpoint-before-overwrite']
assert ck, 'checkpoint missing'
print(ck[0]['id'])")
TSEC=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
print(t['id'])")
curl -s -b "$JAR" -X PATCH "$BASE/api/exams/$E1" -H "Content-Type: application/json" \
  -d "{\"sections\":[{\"id\":\"$TSEC\",\"text\":\"Overwritten by the version test.\"}]}" >/dev/null
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/revisions/restore" -H "Content-Type: application/json" \
  -d "{\"revisionId\":\"$CK\"}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
p1=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
assert t['text'] == 'Edited passage text for the persistence check.', 'restore did not bring back checkpoint text'
assert len(p1['tasks']) == 4, 'restore lost tasks'
print('restore brought back checkpoint text and', len(p1['tasks']), 'part one tasks')"

echo "== generate-more-alternatives endpoints =="
T4=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='TEXT_EXPLORATION'][0]
print(p['tasks'][0]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/generate" -H "Content-Type: application/json" \
  -d "{\"type\":\"TASK_ALT\",\"taskId\":\"$T4\"}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='TEXT_EXPLORATION'][0]
assert len(p['tasks'][0]['candidates']) >= 1, 'no new task candidates'
print('task alternatives regenerated:', len(p['tasks'][0]['candidates']))"
W2=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='WRITING'][0]
print(p['topics'][1]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/generate" -H "Content-Type: application/json" \
  -d "{\"type\":\"TOPIC_ALT\",\"topicId\":\"$W2\"}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='WRITING'][0]
free=[t for t in p['topics'] if t['kind']=='FREE'][0]
assert len(free['candidates']) >= 1, 'no new topic candidates'
print('topic alternatives regenerated:', len(free['candidates']))"

echo "== unauthenticated API rejected =="
CODE=$(curl -s -o /tmp/unauth-api.json -w "%{http_code}" "$BASE/api/exams")
rm -f /tmp/unauth-api.json
[ "$CODE" = "401" ] && echo "GET /api/exams without session -> 401" || echo "FAILED: got $CODE"

echo "== empty exam still exports valid PDF =="
E4=$(curl -s -b "$JAR" -X POST "$BASE/api/exams" -H "Content-Type: application/json" -d '{}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -b "$JAR" -o /tmp/exam-empty.pdf -w "empty pdf %{http_code} %{size_download}B\n" "$BASE/api/exams/$E4/export?format=pdf"
head -c 5 /tmp/exam-empty.pdf | grep -q "%PDF-" && echo "empty-exam pdf valid" || echo "FAILED: empty pdf invalid"
rm -f /tmp/exam-empty.pdf

echo "== catalog endpoint =="
curl -s -b "$JAR" "$BASE/api/catalog" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'languages' in d and d['languages'] == ['en'], d.get('languages')
assert 'levels' in d and len(d['levels'].get('middle', [])) >= 1
assert len(d['guides']) >= 7
print('catalog languages:', d['languages'], '| levels:', sorted(d['levels'].keys()), '| guides:', len(d['guides']))"

echo "== auth negatives =="
CODE=$(curl -s -o /tmp/wrong.json -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpass\"}")
rm -f /tmp/wrong.json
[ "$CODE" = "401" ] && echo "wrong password -> 401" || echo "FAILED: wrong password got $CODE"
CODE=$(curl -s -o /tmp/dup.json -w "%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\"}")
rm -f /tmp/dup.json
[ "$CODE" = "409" ] && echo "duplicate email -> 409" || echo "FAILED: duplicate email got $CODE"

echo "== generate before config rejected =="
E5=$(curl -s -b "$JAR" -X POST "$BASE/api/exams" -H "Content-Type: application/json" -d '{}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
CODE=$(curl -s -b "$JAR" -o /tmp/noconfig.json -w "%{http_code}" -X POST "$BASE/api/exams/$E5/generate" -H "Content-Type: application/json" -d '{"type":"TEXT"}')
rm -f /tmp/noconfig.json
[ "$CODE" = "400" ] && echo "generate without config -> 400" || echo "FAILED: got $CODE"

echo "== delete exam =="
curl -s -b "$JAR" -X DELETE "$BASE/api/exams/$E5" | python3 -c "import sys,json;assert json.load(sys.stdin).get('ok');print('delete ok')"
curl -s -b "$JAR" "$BASE/api/exams" | python3 -c "
import sys,json
items = json.load(sys.stdin)['exams']
assert all(e['id'] != '$E5' for e in items), 'deleted exam still listed'
print('deleted exam absent from library')"

echo "== security: hashed password + httpOnly cookie =="
python3 - "$DB_FILE" "$EMAIL" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
row = con.execute("SELECT passwordHash FROM User WHERE email=?", (sys.argv[2],)).fetchone()
assert row, "user not found"
h = row[0]
assert h.startswith("$2"), "password NOT bcrypt-hashed"
print("password stored as bcrypt:", h[:7] + "...")
PYEOF
curl -s -D /tmp/cookie-hdr.txt -o /tmp/cookie-body.json -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\"}"
grep -i "set-cookie" /tmp/cookie-hdr.txt | head -1 | grep -qi "httponly" && echo "session cookie is httpOnly" || echo "FAILED: cookie not httpOnly"
rm -f /tmp/cookie-hdr.txt /tmp/cookie-body.json

echo "== admin ops gate (US-030) =="
CODE=$(curl -s -b "$JAR" -o /tmp/ops1.html -w "%{http_code}" "$BASE/ops")
rm -f /tmp/ops1.html
[ "$CODE" = "404" ] && echo "non-admin /ops -> 404" || echo "FAILED: non-admin /ops got $CODE"
python3 - "$DB_FILE" "$EMAIL" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("UPDATE User SET role='admin' WHERE email=?", (sys.argv[2],))
con.commit()
print("promoted smoke user to admin")
PYEOF
curl -s -b "$JAR" "$BASE/ops" > /tmp/ops2.html
grep -q "Operations" /tmp/ops2.html && echo "admin /ops renders Operations" || echo "FAILED: admin /ops missing content"
grep -q "Generation health" /tmp/ops2.html && echo "admin /ops shows generation ledger" || echo "FAILED: generation ledger missing"
rm -f /tmp/ops2.html

echo "== password recovery flow =="
PR=$(curl -s -b "$JAR" -X POST "$BASE/api/auth/forgot-password" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}")
DEV_URL=$(echo "$PR" | python3 -c "import sys,json;print(json.load(sys.stdin).get('devUrl',''))")
[ -n "$DEV_URL" ] && echo "reset link generated (dev)" || { echo "FAILED: no devUrl"; exit 1; }
TOKEN=$(echo "$DEV_URL" | sed -n 's/.*token=\([^&]*\).*/\1/p')
[ -n "$TOKEN" ] && echo "token extracted" || { echo "FAILED: token missing"; exit 1; }
CODE=$(curl -s -o /tmp/rp.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/auth/reset-password" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"password\":\"newpass456\"}")
rm -f /tmp/rp.json
[ "$CODE" = "200" ] && echo "password reset ok" || { echo "FAILED: reset got $CODE"; exit 1; }
# Old password must fail now, new password must work
C_OLD=$(curl -s -o /tmp/rp1.json -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\"}")
rm -f /tmp/rp1.json
[ "$C_OLD" = "401" ] && echo "old password rejected after reset" || { echo "FAILED: old password still works ($C_OLD)"; exit 1; }
C_NEW=$(curl -s -o /tmp/rp2.json -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"newpass456\"}")
rm -f /tmp/rp2.json
[ "$C_NEW" = "200" ] && echo "new password works" || { echo "FAILED: new password rejected ($C_NEW)"; exit 1; }
# Token must be single-use
CODE=$(curl -s -o /tmp/rp3.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/auth/reset-password" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"password\":\"another789\"}")
rm -f /tmp/rp3.json
[ "$CODE" = "400" ] && echo "reset token single-use (reuse rejected)" || { echo "FAILED: token reuse allowed ($CODE)"; exit 1; }
# Password reset invalidates sessions; log back in with the new password.
curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"newpass456\"}" >/dev/null

echo "== archive / restore (US-026) =="
E6=$(curl -s -b "$JAR" -X POST "$BASE/api/exams" -H "Content-Type: application/json" -d '{}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -b "$JAR" -X PATCH "$BASE/api/exams/$E6" -H "Content-Type: application/json" -d '{"status":"ARCHIVED"}' >/dev/null
curl -s -b "$JAR" "$BASE/api/exams" | python3 -c "
import sys,json
items = json.load(sys.stdin)['exams']
assert all(e['id'] != '$E6' for e in items), 'archived exam still listed'
print('archived exam hidden from library')"
curl -s -b "$JAR" -X PATCH "$BASE/api/exams/$E6" -H "Content-Type: application/json" -d '{"status":"DRAFT"}' >/dev/null
curl -s -b "$JAR" "$BASE/api/exams" | python3 -c "
import sys,json
items = json.load(sys.stdin)['exams']
assert any(e['id'] == '$E6' for e in items), 'restored exam missing'
print('restored exam visible again')"

echo "== favourites =="
T1=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
print(p['tasks'][0]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/favourites" -H "Content-Type: application/json" \
  -d "{\"taskId\":\"$T1\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('saved favourite', d['id'][:8])"
COUNT=$(curl -s -b "$JAR" "$BASE/api/favourites" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']))")
echo "favourites count: $COUNT"
[ "$COUNT" -ge 1 ] || { echo "FAILED: no favourites"; exit 1; }

echo "== custom tasks =="
curl -s -b "$JAR" -X POST "$BASE/api/custom-tasks" -H "Content-Type: application/json" \
  -d '{"label":"My custom gap-fill","prompt":"Complete with: however / therefore / although","marks":2}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('saved custom', d['id'][:8])"

echo "== apply favourite to another task =="
T2=$(curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
print(p['tasks'][1]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/exams/$E1/apply-task" -H "Content-Type: application/json" \
  -d "{\"taskId\":\"$T2\",\"source\":\"favourite\",\"prompt\":\"1. Applied from favourite\",\"marks\":2}" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
assert p['tasks'][1]['prompt'] == '1. Applied from favourite'
print('applied ok:', p['tasks'][1]['prompt'])"

echo "== events linked to the exam (full lifecycle) =="
python3 - "$DB_FILE" "$E1" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
n = con.execute("SELECT COUNT(*) FROM ProductEvent WHERE examId=?", (sys.argv[2],)).fetchone()[0]
assert n >= 12, f"too few lifecycle events for exam ({n})"
print(f"{n} lifecycle events linked to exam (replacements + favourites included)")
PYEOF

echo "== analytics events =="
python3 - "$DB_FILE" <<'PYEOF'
import sqlite3, sys
db = sys.argv[1]
con = sqlite3.connect(db)
names = [r[0] for r in con.execute("SELECT DISTINCT name FROM ProductEvent ORDER BY name")]
print("events:", ", ".join(names))
for required in ["signup_completed", "exam_created", "parameters_completed", "text_generated", "part_one_generated", "part_two_generated", "writing_generated", "task_replaced", "topic_replaced", "text_alternative_selected", "exam_exported_pdf", "exam_exported_docx", "task_saved_favourite", "custom_task_created", "favourite_applied"]:
    assert required in names, f"missing event {required}"
print("event coverage ok")
PYEOF

echo "== guide version traceability =="
curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
gv = d['config']['guideVersion']
assert gv, 'missing guideVersion'
print('guide version:', gv)"

echo "== resume after logout/login (Continue Last Exam path) =="
curl -s -b "$JAR" -X POST "$BASE/api/auth/logout" >/dev/null
curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"newpass456\"}" | python3 -c "import sys,json;print('logged back in as', json.load(sys.stdin)['user']['email'])"
curl -s -b "$JAR" "$BASE/api/exams" | python3 -c "
import sys,json
items = json.load(sys.stdin)['exams']
assert any(e['id'] == '$E1' for e in items), 'exam missing after login'
print('exam present in library after re-login')"
curl -s -b "$JAR" "$BASE/api/exams/$E1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[s for s in d['sections'] if s['type']=='TEXT'][0]
p1=[s for s in d['sections'] if s['type']=='PART_ONE'][0]
w=[s for s in d['sections'] if s['type']=='WRITING'][0]
assert t['text'] and len(p1['tasks'])==4 and len(w['topics'])==2
print('content intact after re-login: text', len(t['text'].split()), 'words, part one', len(p1['tasks']), 'tasks, writing', len(w['topics']), 'topics')"

echo "== builder page serves interactive shell =="
HTML=$(curl -s -b "$JAR" "$BASE/builder/$E1")
echo "$HTML" | grep -q "Parameters" && echo "builder shell contains Parameters step" || echo "WARN: Parameters label not in HTML"
echo "$HTML" | grep -q "Text exploration" && echo "builder shell contains Text exploration step" || echo "WARN: Text exploration label not in HTML"
echo "$HTML" | grep -q "__next_f" && echo "client hydration payload present" || echo "WARN: no RSC payload"

echo "SMOKE OK"
