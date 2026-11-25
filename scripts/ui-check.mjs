// 화면 동작 확인(선택): Firebase를 가짜(메모리)로 바꿔 AI 제안 카드 흐름을 시험하고 스크린샷을 남긴다.
// 실행: node scripts/ui-check.mjs [스크린샷 폴더]   (다크 모드: SCHEME=dark)   (playwright 필요. 실제 Firestore는 건드리지 않음)
// 한계: 보안 규칙·실제 로그인은 검증하지 못한다. 그것은 배포 사이트에서 직접 확인해야 한다.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "docs", "test-evidence"));
fs.mkdirSync(OUT, { recursive: true });
const ADMIN = "SVoqSkelN5VPVrv5vnKRwTGVK4K2";

const STUBS = {
  "firebase-app.js": `export const initializeApp=()=>({});`,
  "firebase-auth.js": `export const getAuth=()=>({});export class GoogleAuthProvider{}
export const signInWithPopup=async()=>{};export const signInWithEmailAndPassword=async(a,e,p)=>{window.__evalCall={e,p};if(p!=="right-pass"){const x=new Error("bad");x.code="auth/invalid-credential";throw x}};export const signOut=async()=>{window.__admin=false};
export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb(window.__admin===false?null:{uid:window.__uid||"${ADMIN}"}),0)};`,
  "firebase-firestore.js": `
const T=()=>({toMillis:()=>Date.now()});
export const getFirestore=()=>({});export const serverTimestamp=()=>T();
export const collection=(db,n)=>({n});export const where=()=>({});export const query=r=>r;
export const doc=(db,n,id)=>({id});
export const getDocs=async()=>({docs:window.__db.map(d=>({id:d.id,data:()=>d.data}))});
export const addDoc=async(c,data)=>{const id="new"+(window.__db.length+1);window.__db.push({id,data:{...data,createdAt:T()}});return{id}};
export const deleteField=()=>({__del:1});export const deleteDoc=async(r)=>{window.__db=window.__db.filter(x=>x.id!==r.id)};
export const updateDoc=async(r,patch)=>{window.__writes.push({id:r.id,keys:Object.keys(patch)});
  if(window.__deny){const e=new Error("denied");e.code="permission-denied";throw e}
  const d=window.__db.find(x=>x.id===r.id);Object.assign(d.data,patch)};`
};

const T0 = Date.parse("2026-11-24T00:00:00Z");
const post = (id, o) => ({ id, data: { title: "글 " + id, summary: "원래 요약 " + id, tags: ["원래"], content: "<p>본문 " + id + "</p>", contentFormat: "html", cover: "", visibility: "public", authorUid: ADMIN, createdAt: { _ms: T0 }, ...o } });
const SUG = { summary: "프롬프트의 네 요소(역할·맥락·요청·형식)를 정리한 복습 글.", tags: ["프롬프트", "실습", "복습"], titles: ["프롬프트 4요소 복습", "좋은 질문 쓰는 법", "역할·맥락·요청·형식"], model: "m", at: "T" };
const seed = () => [
  post("pend", { aiStatus: "pending" }),
  post("rdy", { aiStatus: "ready", aiSuggest: SUG }),
  post("rdy2", { aiStatus: "ready", aiSuggest: SUG }),
  post("rdy3", { aiStatus: "ready", aiSuggest: SUG }),
  post("rdy4", { aiStatus: "ready", aiSuggest: SUG }),
  post("fail", { aiStatus: "failed", aiError: "JSON 형식 오류" }),
  post("evil", { aiStatus: "ready", aiSuggest: { summary: "<img src=x onerror=window.__xss=1>", tags: ["<b onmouseover=window.__xss=1>t</b>", '"><script>window.__xss=1</script>'], titles: ["<img src=x onerror=window.__xss=1>"] } }),
  post("legacy", {})
];

const results = [];
const check = (id, name, ok, detail = "") => { results.push({ id, name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + id + " " + name + (detail ? " · " + detail : "")); };

const browser = await chromium.launch();
async function open(hash, { admin = true, deny = false, asEval = false, viewport = { width: 1100, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: process.env.SCHEME === "dark" ? "dark" : "light" });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("  [pageerror]", e.message.slice(0, 200)));
  await page.route("**/*", route => {
    const u = route.request().url();
    const m = u.match(/gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z]+\.js)/);
    if (m) return route.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: STUBS[m[1]] });
    if (asEval && u.startsWith("file://") && u.split("#")[0].endsWith("/index.html")) return route.fulfill({ status: 200, contentType: "text/html", body: fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/const EVAL_UID="[^"]*";/, 'const EVAL_UID="EV1";') });
    if (u.startsWith("file://")) return route.continue();
    return route.abort();
  });
  await page.addInitScript(({ seedData, admin, deny, asEv }) => {
    window.__db = seedData.map(d => ({ id: d.id, data: JSON.parse(JSON.stringify(d.data), (k, v) => v && v._ms ? { toMillis: () => v._ms } : v) }));
    window.__writes = []; window.__deny = deny; if (!admin) window.__admin = false; if (asEv) window.__uid = "EV1";
  }, { seedData: seed().concat(asEval ? [post("mine", { aiStatus: "ready", aiSuggest: SUG, authorUid: "EV1" })] : []), admin, deny, asEv: asEval });
  await page.goto("file://" + ROOT + "/index.html" + hash);
  await page.waitForTimeout(500);
  return { page, ctx };
}
const dbDoc = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(window.__db.find(d => d.id === i).data)), id);

// UT: 목록 칩
{
  const { page, ctx } = await open("#/");
  await page.screenshot({ path: path.join(OUT, "01_목록_AI칩.png") });
  const chips = await page.$$eval(".aib", els => els.map(e => e.textContent));
  check("UI-01", "관리자 목록에 'AI 제안 대기'·'AI 제안 도착' 칩이 보인다", chips.includes("AI 제안 대기") && chips.includes("AI 제안 도착"), chips.join("/"));
  await ctx.close();
}
// 비로그인
{
  const { page, ctx } = await open("#/post/rdy", { admin: false });
  const n = await page.$$eval(".aicard,.aib", e => e.length);
  check("UI-02", "로그아웃 상태에서는 AI 카드·칩이 보이지 않는다", n === 0, "개수 " + n);
  await ctx.close();
}
// 대기/실패 카드
{
  const { page, ctx } = await open("#/post/pend");
  const t = await page.textContent(".aicard");
  await page.screenshot({ path: path.join(OUT, "02_대기_카드.png"), clip: { x: 0, y: 0, width: 1100, height: 600 } });
  check("UI-03", "대기 글: 'AI 제안 대기 중' 안내와 확인 버튼", /대기 중/.test(t) && !!(await page.$('[data-ai="refresh"]')));
  { const a = await page.$('[data-ai="run"]'); const href = a ? await a.getAttribute("href") : "", tg = a ? await a.getAttribute("target") : "", rel = a ? await a.getAttribute("rel") : "";
    check("UI-32", "대기 글: 「지금 AI 제안 받기」가 Actions 실행 페이지를 새 창으로 연다(자동 실행이 늦을 때의 확실한 방법)", /github\.com\/yourrhdiddl\/blog\/actions\/workflows\/ai-suggest\.yml$/.test(href) && tg === "_blank" && /noopener/.test(rel) && !/15분/.test(t), href); }
  { /* UI-33: 링크를 눌러도 글 상태가 바뀌지 않는다(실제로 눌렀을 때 대기 카드가 '무시'로 바뀌던 오류의 재발 방지) */
    ctx.on("page", p => p.close().catch(() => {}));
    await page.click('[data-ai="run"]'); await page.waitForTimeout(500);
    const w = await page.evaluate(() => window.__writes.length);
    const still = !!(await page.$('[data-ai="refresh"]')) && /대기 중/.test(await page.textContent(".aicard"));
    check("UI-33", "대기 글: 「지금 AI 제안 받기」를 눌러도 글이 저장되지 않고 대기 카드가 그대로다", w === 0 && still, "쓰기 " + w + "건, 카드 유지 " + still); }
  await ctx.close();
  const o = await open("#/post/fail");
  const t2 = await o.page.textContent(".aicard");
  await o.page.screenshot({ path: path.join(OUT, "03_실패_카드.png"), clip: { x: 0, y: 0, width: 1100, height: 600 } });
  check("UI-04", "실패 글: '직접 입력' 안내가 보이고 반영 버튼은 없다", /직접 입력/.test(t2) && !(await o.page.$('[data-ai="apply"]')), t2.replace(/\s+/g, " ").slice(0, 60));
  await o.ctx.close();
}
// 평가자 로그인(UI-34~36): 구글 로그인 아래 작은 글씨, 비밀번호는 코드에 없음, 틀리면 안내
{
  const { page, ctx } = await open("#/login", { admin: false });
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const hidden0 = await page.$eval("#evalForm", e => e.hidden);
  const gBefore = await page.$("#googleBtn");
  const fs1 = await page.$eval("#evalToggle", e => parseFloat(getComputedStyle(e).fontSize));
  const gy = (await (await page.$("#googleBtn")).boundingBox()).y, ty = (await (await page.$("#evalToggle")).boundingBox()).y;
  check("UI-34", "로그인 화면: 구글 버튼 아래에 작은 글씨 「평가자 로그인」이 있고 입력칸은 접혀 있다", !!gBefore && hidden0 && fs1 <= 14 && ty > gy, "글자 " + fs1 + "px");
  await page.click("#evalToggle"); await page.waitForTimeout(100);
  const shown = await page.$eval("#evalForm", e => !e.hidden);
  await page.fill("#evalPw", "wrong-pass"); await page.click("#evalBtn"); await page.waitForTimeout(300);
  const msg = await page.textContent("#evalMsg"), call = await page.evaluate(() => window.__evalCall);
  await page.screenshot({ path: path.join(OUT, "08_평가자_로그인.png"), clip: { x: 0, y: 0, width: 1100, height: 520 } });
  check("UI-35", "평가자 로그인: 고정 이메일과 입력한 비밀번호로만 로그인을 시도하고, 틀리면 안내가 뜬다", shown && call && call.e === "evaluator@aipm-review.test" && call.p === "wrong-pass" && /맞지 않/.test(msg), msg);
  check("UI-36", "평가용 비밀번호가 코드(index.html)에 들어 있지 않다", !/test1125/.test(html));
  await ctx.close();
}
 // 평가자 범위(UI-37~39): AI 시연용 글만 고칠 수 있다
{
  const { page, ctx } = await open("#/", { asEval: true });
  const tab = await page.$eval("#trashTab", e => e.hidden), wr = await page.$eval("#writeBtn", e => !e.hidden);
  await page.evaluate(() => { location.hash = "#/post/rdy"; }); await page.waitForTimeout(300);
  const otherAdm = await page.$(".adm"), otherAi = await page.$(".aicard");
  await page.evaluate(() => { location.hash = "#/post/mine"; }); await page.waitForTimeout(300);
  const mineAdm = await page.$(".adm"), mineAi = await page.$(".aicard");
  check("UI-37", "평가자: 글쓰기 버튼은 보이고 휴지통 탭은 숨겨진다", tab && wr);
  check("UI-38", "평가자: 남의 글에는 수정·삭제 버튼과 AI 카드가 없다", !otherAdm && !otherAi);
  check("UI-39", "평가자: 자기가 쓴 글에는 수정 버튼과 AI 카드가 있다", !!mineAdm && !!mineAi);
  await page.evaluate(() => { location.hash = "#/edit/rdy"; }); await page.waitForTimeout(300);
  check("UI-40", "평가자: 남의 글 수정 주소로 가도 수정 화면이 열리지 않는다", !(await page.$("#writeForm")));
  await ctx.close();
}
// 기본 반영: 요약·태그 반영, 제목은 그대로
{
  const { page, ctx } = await open("#/post/rdy");
  await page.screenshot({ path: path.join(OUT, "04_제안_카드.png"), clip: { x: 0, y: 0, width: 1100, height: 760 } });
  await page.click('[data-ai="apply"]'); await page.waitForTimeout(300);
  const d = await dbDoc(page, "rdy"), w = await page.evaluate(() => window.__writes);
  check("UI-05", "기본 반영: 요약·태그가 제안으로 바뀌고 제목은 그대로", d.summary === SUG.summary && d.tags.join() === SUG.tags.join() && d.title === "글 rdy");
  check("UI-06", "반영 시 aiStatus=applied, aiFeedback=accepted/accepted/ignored", d.aiStatus === "applied" && d.aiFeedback.summary === "accepted" && d.aiFeedback.tags === "accepted" && d.aiFeedback.title === "ignored", JSON.stringify(d.aiFeedback));
  check("UI-07", "수정 요청은 허용된 필드만 쓴다", w.length === 1 && w[0].keys.every(k => ["title", "summary", "tags", "summaryAuto", "aiStatus", "aiFeedback", "aiAppliedAt"].includes(k)), w[0] && w[0].keys.join(","));
  check("UI-31", "요약을 반영하면 summaryAuto=false로 바뀐다(수락률·비움 비율 집계 보정)", d.summaryAuto === false, String(d.summaryAuto));
  await page.screenshot({ path: path.join(OUT, "05_반영후.png"), clip: { x: 0, y: 0, width: 1100, height: 600 } });
  await ctx.close();
}
// 고쳐서 반영 + 제목 선택
{
  const { page, ctx } = await open("#/post/rdy2");
  await page.fill("#aiS", "내가 고친 요약");
  await page.check('input[name="aiTi"][value="1"]');
  await page.click('[data-ai="apply"]'); await page.waitForTimeout(300);
  const d = await dbDoc(page, "rdy2");
  check("UI-08", "고쳐서 반영: summary=edited, 제목=선택한 후보, title=accepted", d.summary === "내가 고친 요약" && d.title === SUG.titles[1] && d.aiFeedback.summary === "edited" && d.aiFeedback.title === "accepted", d.title);
  await ctx.close();
}
// 일부만 반영(태그 해제)
{
  const { page, ctx } = await open("#/post/rdy3");
  await page.uncheck("#aiUseT");
  await page.click('[data-ai="apply"]'); await page.waitForTimeout(300);
  const d = await dbDoc(page, "rdy3");
  check("UI-09", "태그 체크 해제 시 태그는 그대로, tags=ignored", d.tags.join() === "원래" && d.aiFeedback.tags === "ignored");
  await ctx.close();
}
// 무시
{
  const { page, ctx } = await open("#/post/rdy4");
  await page.click('[data-ai="dismiss"]'); await page.waitForTimeout(300);
  const d = await dbDoc(page, "rdy4");
  check("UI-10", "무시: 글은 그대로, aiStatus=dismissed", d.aiStatus === "dismissed" && d.summary === "원래 요약 rdy4" && d.title === "글 rdy4");
  await ctx.close();
}
// 권한 거부
{
  const { page, ctx } = await open("#/post/rdy", { deny: true });
  await page.click('[data-ai="apply"]'); await page.waitForTimeout(300);
  const toast = await page.textContent(".toast").catch(() => "");
  const d = await dbDoc(page, "rdy");
  check("UI-11", "권한 거부 시 안내 문구가 뜨고 글은 바뀌지 않는다", /권한/.test(toast) && d.aiStatus === "ready" && d.summary === "원래 요약 rdy", toast);
  await ctx.close();
}
// XSS
{
  const { page, ctx } = await open("#/post/evil");
  const xss = await page.evaluate(() => window.__xss === 1);
  const imgs = await page.$$eval(".aicard img, .aicard b[onmouseover], .aicard script", e => e.length);
  const sv = await page.inputValue("#aiS");
  check("UI-12", "AI 결과에 HTML/스크립트가 있어도 실행·삽입되지 않고 글자로만 보인다", !xss && imgs === 0 && sv.includes("<img"), "xss=" + xss + " 삽입요소=" + imgs);
  await ctx.close();
}
// 저장 시 pending / none
{
  const { page, ctx } = await open("#/write");
  await page.fill('input[name="t"]', "새 글 A");
  await page.evaluate(() => { document.querySelector("#ed").innerHTML = "<p>새 글 본문입니다. 충분히 긴 문장을 적습니다.</p>"; });
  await page.click("#pubBtn"); await page.waitForTimeout(400);
  const d = await dbDoc(page, "new9");
  check("UI-13", "AI 제안 체크 후 저장: aiStatus=pending, 요약 비움→summaryAuto=true", d.aiStatus === "pending" && d.summaryAuto === true && d.summary.length > 0, d.aiStatus + "/" + d.summaryAuto);
  await ctx.close();
  const o = await open("#/write");
  await o.page.fill('input[name="t"]', "새 글 B"); await o.page.fill('input[name="s"]', "직접 쓴 요약");
  await o.page.uncheck('input[name="ai"]');
  await o.page.evaluate(() => { document.querySelector("#ed").innerHTML = "<p>본문입니다. 충분히 긴 문장을 적습니다.</p>"; });
  await o.page.click("#pubBtn"); await o.page.waitForTimeout(400);
  const d2 = await dbDoc(o.page, "new9");
  check("UI-14", "체크 해제 후 저장: aiStatus=none, 직접 쓴 요약→summaryAuto=false", d2.aiStatus === "none" && d2.summaryAuto === false);
  await o.page.screenshot({ path: path.join(OUT, "06_글쓰기_AI체크.png"), clip: { x: 0, y: 0, width: 1100, height: 700 } });
  await o.ctx.close();
}
// 모바일 카드
{
  const { page, ctx } = await open("#/post/rdy", { viewport: { width: 390, height: 844 } });
  await page.screenshot({ path: path.join(OUT, "07_모바일_제안카드.png") });
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("UI-15", "모바일(390px)에서 가로 넘침이 없다", !over);
  await ctx.close();
}

// v3.2 임시저장
{
  const { page, ctx } = await open("#/write");
  await page.fill('input[name="t"]', "임시 제목");
  await page.evaluate(() => { document.querySelector("#ed").innerHTML = "<p>쓰다 만 본문입니다.</p>"; document.querySelector("#ed").dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForTimeout(1600);
  const st = await page.evaluate(() => document.querySelector("#draftState").textContent);
  const raw = await page.evaluate(() => localStorage.getItem("aipm_draft_new"));
  check("UI-68", "입력 1.2초 뒤 자동 임시저장되고 상태 문구가 보인다", /임시저장됨/.test(st) && raw && JSON.parse(raw).t === "임시 제목", st);
  await page.reload(); await page.waitForTimeout(600);
  const bar = await page.evaluate(() => !!document.querySelector("#draftBar"));
  check("UI-69", "새로고침 후 '저장하지 않은 글' 안내가 뜨고 폼은 아직 비어 있다", bar && (await page.inputValue('input[name="t"]')) === "");
  await page.screenshot({ path: path.join(OUT, "20_임시저장_안내.png"), clip: { x: 0, y: 0, width: 1100, height: 500 } });
  await page.click('[data-draft="use"]'); await page.waitForTimeout(300);
  const t2 = await page.inputValue('input[name="t"]'), b2 = await page.evaluate(() => document.querySelector("#ed").textContent);
  check("UI-70", "이어쓰기를 누르면 제목·본문이 복원된다", t2 === "임시 제목" && b2.includes("쓰다 만 본문"), t2);
  await page.click("#pubBtn"); await page.waitForTimeout(500);
  const left = await page.evaluate(() => localStorage.getItem("aipm_draft_new"));
  check("UI-71", "발행에 성공하면 임시저장이 지워진다", left === null);
  await ctx.close();
}
{
  const { page, ctx } = await open("#/write");
  await page.fill('input[name="t"]', "버릴 글"); await page.waitForTimeout(1600);
  await page.reload(); await page.waitForTimeout(600);
  await page.click('[data-draft="drop"]'); await page.waitForTimeout(300);
  const gone = await page.evaluate(() => localStorage.getItem("aipm_draft_new"));
  check("UI-72", "버리기를 누르면 임시저장이 지워지고 안내가 사라진다", gone === null && !(await page.evaluate(() => !!document.querySelector("#draftBar"))));
  await ctx.close();
}
{
  const { page, ctx } = await open("#/edit/rdy");
  await page.fill('input[name="t"]', "수정 중 제목"); await page.waitForTimeout(1600);
  const k = await page.evaluate(() => Object.keys(localStorage).filter(x => x.startsWith("aipm_draft_")));
  check("UI-73", "수정 화면의 임시저장은 글 id별 키로 저장된다(새 글과 섞이지 않음)", k.includes("aipm_draft_rdy") && !k.includes("aipm_draft_new"), k.join(","));
  await ctx.close();
}

// v3.2 글 상세 흰 박스 + 사진
{
  const img = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='900' height='600'><rect width='900' height='600' fill='#9fe0da'/><text x='50' y='320' font-size='60'>PHOTO</text></svg>");
  const fig = (n) => '<figure class="pf g' + n + '">' + Array.from({length:n},()=>'<img src="'+img+'" alt="">').join("") + '<figcaption>사진 설명</figcaption></figure>';
  for (const [name, vp] of [["pc", {width:1100,height:900}], ["mo", {width:390,height:844}]]) {
    const { page, ctx } = await open("#/post/rdy", { viewport: vp });
    await page.evaluate(({f1,f2,f3}) => { const b = document.querySelector(".article .body"); b.innerHTML = "<p>첫 문단입니다. 글이 카드 안에 들어가는지 확인합니다. 한국어 문장이 길어질 때 줄바꿈이 자연스러운지도 봅니다.</p>"+f1+"<h3>소제목</h3><p>두 번째 문단.</p>"+f2+"<blockquote>인용문입니다.</blockquote>"+f3+"<p>마지막 문단.</p>"; }, { f1: fig(1), f2: fig(2), f3: fig(3) });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const a = document.querySelector("#detail .article"), cs = getComputedStyle(a), bs = getComputedStyle(document.body);
      const imgs = [...a.querySelectorAll(".body img")], ar = a.getBoundingClientRect();
      return { bg: cs.backgroundColor, bodyBg: bs.backgroundColor, radius: cs.borderRadius, over: document.documentElement.scrollWidth > innerWidth + 1, imgsIn: imgs.every(i => { const r = i.getBoundingClientRect(); return r.left >= ar.left - 1 && r.right <= ar.right + 1; }), n: imgs.length, bodyW: Math.round(a.querySelector(".body").getBoundingClientRect().width) }; });
    check("UI-74" + (name === "pc" ? "a" : "b"), name + ": 글 상세가 흰 카드(배경과 다른 색)이고 사진이 카드 밖으로 나가지 않으며 가로 넘침이 없다", m.bg !== m.bodyBg && parseFloat(m.radius) >= 16 && !m.over && m.imgsIn && m.n === 6, JSON.stringify(m));
    await page.screenshot({ path: path.join(OUT, "30_글상세_카드_" + name + ".png"), fullPage: true });
    await ctx.close();
  }
}

// v3.3 글 상세 다듬기
{
  const { page, ctx } = await open("#/post/rdy");
  await page.evaluate(() => { document.querySelector(".article .body").innerHTML = "<p>문장 <mark class='y'>형광펜 노랑</mark> 그리고 <mark>민트 형광펜</mark> 입니다.</p><blockquote>인용문</blockquote>"; });
  const m = await page.evaluate(() => {
    const q = s => document.querySelector(s), cs = e => getComputedStyle(e), rgb = c => { const v = c.match(/[\d.]+/g).map(Number); return v.slice(0, 3).every(x => x <= 1) ? v.map((x, k) => k < 3 ? x * 255 : x) : v; };
    const tag = q("#detail .article .tags span"), lead = q("#detail .article .lead"), bq = q(".article .body blockquote"), mk = q(".article .body mark"), mk2 = q(".article .body mark.y"), h1 = q("#detail .article h1"), art = q("#detail .article");
    const tb = rgb(cs(tag).backgroundColor), tc = rgb(cs(tag).color), lc = rgb(cs(lead).color), bb = rgb(cs(bq).backgroundColor);
    return { tagBg: tb.slice(0,3).join(","), tagGray: Math.max(...tb.slice(0,3)) - Math.min(...tb.slice(0,3)) <= 14 && tb[3] !== 0, tagTextGray: Math.max(...tc.slice(0,3)) - Math.min(...tc.slice(0,3)) <= 12,
      leadPx: parseFloat(cs(lead).fontSize), leadGray: Math.max(...lc.slice(0,3)) - Math.min(...lc.slice(0,3)) <= 12, leadColor: lc.slice(0,3).join(","),
      bq: bb.slice(0,3).join(","), bqLight: (() => { const sp = rgb(cs(document.documentElement).getPropertyValue('--soft').trim() ? (() => { const t = document.createElement('i'); t.style.color = getComputedStyle(document.documentElement).getPropertyValue('--soft'); document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; })() : 'rgb(0,0,0)'), cd = rgb(cs(art).backgroundColor), d = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]); return d(bb, cd) < d(bb, sp); })(), mw: cs(mk).fontWeight, mw2: cs(mk2).fontWeight, bal: cs(h1).textWrap, bgi: cs(mk).backgroundImage.slice(0,60), full: /\) 14%/.test(cs(mk).backgroundImage) && /\) 14%/.test(cs(mk2).backgroundImage) && /94%/.test(cs(mk).backgroundImage), stars: /svg/.test(getComputedStyle(art, "::before").webkitMaskImage || getComputedStyle(art, "::before").maskImage) && /svg/.test(getComputedStyle(art, "::after").webkitMaskImage || getComputedStyle(art, "::after").maskImage) && parseFloat(getComputedStyle(art, "::before").width) >= 300 && cs(art).overflow === "hidden" };
  });
  check("UI-75a", "태그는 연회색 알약(배경·글자 모두 무채색에 가까움)", m.tagGray && m.tagTextGray, m.tagBg);
  check("UI-75b", "제목 아래 설명은 15px 안팎의 회색", m.leadPx <= 15.5 && m.leadGray, m.leadPx + "px " + m.leadColor);
  check("UI-75c", "인용 배경이 연하다(연한 배경색보다 카드 바탕색에 더 가깝다)", m.bqLight, m.bq);
  check("UI-75d", "형광펜(mark)은 굵게(700 이상)이고 글자 높이 전체를 칠한다(시작 14%)", +m.mw >= 700 && +m.mw2 >= 700 && m.full, m.mw + "/" + m.mw2 + " " + m.bgi);
  check("UI-75e", "제목은 균형 줄바꿈(text-wrap: balance)", m.bal === "balance", m.bal);
  check("UI-75f", "글 상세 카드 안에 홈 상단과 같은 왕별 2개가 깔려 있다(마스크·크기 300px 이상)", m.stars);
  await page.screenshot({ path: path.join(OUT, "31_글상세_v33.png"), fullPage: false });
  await ctx.close();
  const o = await open("#/post/rdy", { viewport: { width: 390, height: 844 } });
  await o.page.evaluate(() => { document.querySelector("#detail .article h1 .hl").textContent = "프롬프트에 예시를 넣으면 달라지는 점을 정리한 아주 긴 제목 예시입니다"; });
  await o.page.screenshot({ path: path.join(OUT, "32_글상세_v33_모바일.png") });
  check("UI-75g", "모바일에서 긴 제목이 넘치지 않는다", !(await o.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await o.ctx.close();
}
await browser.close();
const fail = results.filter(r => !r.ok).length;
fs.writeFileSync(path.join(OUT, "ui-check-result.json"), JSON.stringify(results, null, 1));
console.log(`\n${results.length - fail}/${results.length} 통과`);
process.exit(fail ? 1 : 0);
