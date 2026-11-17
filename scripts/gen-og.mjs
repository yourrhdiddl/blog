// 공개 글마다 링크 미리보기(OG) 전용 페이지와 대표 사진을 만든다.
// 실행: node scripts/gen-og.mjs  (GitHub Actions가 자동으로 실행)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const PROJECT = "aipm-review-note";
const KEY = "AIzaSyCkvW4mxiZmUIuH2D43MPSYji0ELx3C7_Q"; // Firebase 웹 키(공개용)
const SITE = "https://yourrhdiddl.github.io/blog";
const SITE_NAME = "AIPM 복습 노트";
const W = 1200, H = 630;
const ROOT = process.cwd();
const PDIR = path.join(ROOT, "p"), ODIR = path.join(ROOT, "og");

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sha = b => crypto.createHash("sha256").update(b).digest("hex").slice(0, 8);

async function loadPosts() {
  if (process.env.MOCK_JSON) return JSON.parse(fs.readFileSync(process.env.MOCK_JSON, "utf8"));
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery?key=${KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "posts" }],
      where: { fieldFilter: { field: { fieldPath: "visibility" }, op: "EQUAL", value: { stringValue: "public" } } }
    } })
  });
  if (!res.ok) throw new Error("Firestore 읽기 실패 " + res.status + " " + (await res.text()).slice(0, 300));
  return res.json();
}

function placeholderSvg(title, id) {
  const grads = [["#FFF3B0", "#FFD6A5"], ["#CAFFBF", "#9BF6FF"], ["#FFC6FF", "#BDB2FF"], ["#FFD6A5", "#FFADAD"]];
  const g = grads[parseInt(sha(id), 16) % grads.length];
  const chars = [...title.trim()], per = 13, lines = [];
  for (let i = 0; i < chars.length && lines.length < 4; i += per) lines.push(chars.slice(i, i + per).join(""));
  if (chars.length > per * 4) lines[3] = lines[3].slice(0, per - 1) + "…";
  const y0 = 400 - (lines.length - 1) * 50;
  const text = lines.map((l, i) => `<text x="90" y="${y0 + i * 100}" font-size="76" font-weight="700" fill="#1f2937">${esc(l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/><g font-family="Pretendard, Noto Sans CJK KR, sans-serif"><text x="90" y="100" font-size="36" font-weight="700" fill="#374151">${SITE_NAME}</text>${text}</g></svg>`;
}

function defaultSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#F7F7F5"/><rect x="0" y="0" width="16" height="${H}" fill="#111827"/><g font-family="Pretendard, Noto Sans CJK KR, sans-serif" fill="#111827"><text x="100" y="150" font-size="34" font-weight="600" fill="#6B7280" letter-spacing="1">AI PM 수업 복습 기록</text><text x="100" y="340" font-size="124" font-weight="800" letter-spacing="-3">${SITE_NAME}</text><rect x="104" y="392" width="120" height="8" rx="4" fill="#111827"/><text x="100" y="500" font-size="36" font-weight="500" fill="#4B5563">수업에서 배운 것을 내 말로 다시 정리합니다</text><text x="100" y="570" font-size="30" font-weight="500" fill="#9CA3AF">yourrhdiddl.github.io/blog</text></g></svg>`;
}

const DATA_IMG = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
function pickImage(cover, html) {
  let m = DATA_IMG.exec(cover || "");
  if (!m) { const t = /<img[^>]+src="(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)"/i.exec(html || ""); if (t) m = DATA_IMG.exec(t[1]); }
  return m ? Buffer.from(m[2], "base64") : null;
}

function writeIfChanged(file, buf) {
  if (fs.existsSync(file) && Buffer.compare(fs.readFileSync(file), buf) === 0) return false;
  fs.writeFileSync(file, buf); return true;
}

function page(id, title, desc, imgUrl) {
  const t = esc(title), d = esc(desc), url = `${SITE}/p/${id}.html`, dest = `../#/post/${id}`;
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<title>${t} | ${SITE_NAME}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${d}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${imgUrl}">
<meta property="og:image:width" content="${W}">
<meta property="og:image:height" content="${H}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${imgUrl}">
<script>location.replace(${JSON.stringify(dest)})</script>
<noscript><meta http-equiv="refresh" content="0;url=${dest}"></noscript>
</head><body><p><a href="${dest}">${t} 글 보러 가기</a></p></body></html>
`;
}

const raw = await loadPosts();
fs.mkdirSync(PDIR, { recursive: true }); fs.mkdirSync(ODIR, { recursive: true });
const keepP = new Set(), keepO = new Set(["default.jpg"]);
let changed = 0;

// 사이트 기본 이미지
const defBuf = await sharp(Buffer.from(defaultSvg())).jpeg({ quality: 82 }).toBuffer();
if (writeIfChanged(path.join(ODIR, "default.jpg"), defBuf)) changed++;

for (const row of raw) {
  const doc = row.document; if (!doc) continue;
  const id = doc.name.split("/").pop();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue;
  const f = doc.fields || {}, s = k => (f[k] && f[k].stringValue) || "";
  if (s("visibility") !== "public") continue; // 안전장치: 공개 글만
  const title = s("title").trim() || "제목 없음";
  const html = s("content");
  const plain = (s("contentFormat") === "html" ? html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ") : html).replace(/\s+/g, " ").trim();
  const desc = (s("summary").trim() || plain).slice(0, 120);
  const src = pickImage(s("cover"), html);
  let img;
  try {
    img = await sharp(src || Buffer.from(placeholderSvg(title, id))).resize(W, H, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  } catch (e) {
    img = await sharp(Buffer.from(placeholderSvg(title, id))).jpeg({ quality: 82 }).toBuffer();
  }
  if (writeIfChanged(path.join(ODIR, id + ".jpg"), img)) changed++;
  keepO.add(id + ".jpg");
  const html2 = page(id, title, desc, `${SITE}/og/${id}.jpg?v=${sha(img)}`);
  if (writeIfChanged(path.join(PDIR, id + ".html"), Buffer.from(html2))) changed++;
  keepP.add(id + ".html");
}

// 삭제되었거나 나만보기로 바뀐 글의 파일 정리
for (const [dir, keep] of [[PDIR, keepP], [ODIR, keepO]]) {
  for (const n of fs.readdirSync(dir)) if (!keep.has(n)) { fs.unlinkSync(path.join(dir, n)); changed++; }
}
console.log(`공개 글 ${keepP.size}개 처리, 변경 ${changed}건`);
