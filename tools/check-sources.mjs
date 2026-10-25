// 원문 페이지가 바뀌었는지 확인하고, 바뀌었으면 GitHub 이슈로 알립니다.
//
// 페이지마다 두 가지를 저장해 지난번과 비교합니다.
//   - notices: 본문에 나오는 고시·공고 번호 (예: 제2026-189호). 바뀌면 개정 가능성이 큽니다.
//   - hash   : 본문 글자 전체의 지문. 번호는 그대로인데 내용만 바뀐 경우를 잡습니다.
//
// 환경 변수
//   DRY_RUN=true       결과만 출력하고 이슈 생성·스냅숏 저장을 하지 않습니다.
//   GITHUB_TOKEN       이슈 생성용 (GitHub Actions가 넣어 줌)
//   GITHUB_REPOSITORY  owner/repo (GitHub Actions가 넣어 줌)

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const SOURCES_FILE = new URL("./sources.json", import.meta.url);
const SNAPSHOT_FILE = new URL("./source-snapshot.json", import.meta.url);
const ISSUE_LABEL = "원문-변경";
const DRY_RUN = process.env.DRY_RUN === "true";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function decode(buffer, contentType) {
  const head = new TextDecoder("latin1").decode(buffer.slice(0, 2048));
  const charset =
    /charset=([\w-]+)/i.exec(contentType || "")?.[1] ||
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ||
    "utf-8";
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function toText(html) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function findNotices(text) {
  const found = text.match(/제\s?\d{4}\s?-\s?\d{1,4}\s?호/g) || [];
  return [...new Set(found.map((s) => s.replace(/\s/g, "")))].sort();
}

async function inspect(source) {
  const res = await fetch(source.url, {
    headers: { "User-Agent": "Mozilla/5.0 (source-watch; +https://github.com)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = toText(decode(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type")));
  if (text.length < 200) throw new Error(`본문이 너무 짧습니다 (${text.length}자). 접속이 막혔을 수 있습니다.`);
  return {
    hash: createHash("sha256").update(text).digest("hex").slice(0, 16),
    notices: findNotices(text),
    length: text.length,
  };
}

function diff(before, after) {
  return {
    added: after.filter((n) => !before.includes(n)),
    removed: before.filter((n) => !after.includes(n)),
  };
}

async function github(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function report(body) {
  const label = encodeURIComponent(ISSUE_LABEL);
  const open = await github(`/issues?state=open&labels=${label}&per_page=1`);
  if (open.length) {
    await github(`/issues/${open[0].number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
    console.log(`기존 이슈 #${open[0].number}에 댓글을 남겼습니다.`);
  } else {
    const issue = await github("/issues", {
      method: "POST",
      body: JSON.stringify({ title: "원문 변경 확인 필요", body, labels: [ISSUE_LABEL] }),
    });
    console.log(`이슈 #${issue.number}를 만들었습니다.`);
  }
}

const sources = await readJson(SOURCES_FILE, []);
const snapshot = await readJson(SNAPSHOT_FILE, {});
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const changes = [];
const failures = [];

for (const source of sources) {
  const before = snapshot[source.id];
  try {
    const now = await inspect(source);
    console.log(`${source.name}: 지문 ${now.hash}, 글자 ${now.length}, 번호 ${now.notices.join(", ") || "없음"}`);
    if (!before) {
      console.log("  처음 저장합니다 (비교 대상 없음).");
    } else if (before.hash !== now.hash) {
      changes.push({ source, ...diff(before.notices, now.notices), since: before.checkedAt });
    }
    snapshot[source.id] = { ...now, checkedAt: today };
  } catch (err) {
    // fetch는 원인을 cause에 담고 message는 "fetch failed"로만 남기므로 함께 적습니다.
    const cause = err.cause ? ` / ${err.cause.code || ""} ${err.cause.message || ""}`.trimEnd() : "";
    const reason = err.message + cause;
    console.log(`${source.name}: 확인 실패 (${reason})`);
    failures.push({ source, reason });
  }
}

if (!changes.length && !failures.length) {
  console.log("바뀐 원문이 없습니다.");
} else {
  const lines = [`${today} 정기 확인 결과입니다.`, ""];
  if (changes.length) {
    lines.push("### 바뀐 원문", "");
    for (const c of changes) {
      lines.push(`- [${c.source.name}](${c.source.url}) (지난 확인: ${c.since})`);
      if (c.added.length) lines.push(`  - 새로 보이는 번호: ${c.added.join(", ")}`);
      if (c.removed.length) lines.push(`  - 사라진 번호: ${c.removed.join(", ")}`);
      if (!c.added.length && !c.removed.length) lines.push("  - 번호는 그대로이고 본문 내용이 바뀌었습니다.");
    }
    lines.push("");
  }
  if (failures.length) {
    lines.push("### 확인하지 못한 원문", "");
    for (const f of failures) lines.push(`- [${f.source.name}](${f.source.url}): ${f.reason}`);
    lines.push("");
  }
  lines.push(
    "### 할 일",
    "",
    "1. 위 링크에서 원문을 열어 무엇이 바뀌었는지 확인합니다.",
    "2. 앱 내용(`data.js`)에 영향이 있으면 해당 항목을 고치고 `checked` 날짜를 오늘로 바꿉니다.",
    "3. 다 반영했으면 이 이슈를 닫습니다.",
  );
  const body = lines.join("\n");
  console.log("\n" + body);
  if (!DRY_RUN) await report(body);
}

if (DRY_RUN) {
  console.log("\n(시험 실행이라 이슈와 스냅숏은 저장하지 않았습니다.)");
} else {
  await writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2) + "\n");
}
