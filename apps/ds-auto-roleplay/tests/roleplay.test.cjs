const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const data = JSON.parse(
  html.match(
    /<script id="scenario-data" type="application\/json">([\s\S]*?)<\/script>/
  )[1]
);
const engine = html.match(/<script id="app-engine">([\s\S]*?)<\/script>/)[1];
const pure = engine.slice(0, engine.indexOf("// UI boundary"));
const context = vm.createContext({});
vm.runInContext(pure, context);
const {
  buildPlan,
  scoreSession,
  weakestScenes,
  followQuestion,
  normalizeEvaluation
} = context;
const plain = (x) => JSON.parse(JSON.stringify(x));
const answer = (score, flag = "", method = "pick") => ({ score, flag, method });

test("latest deck has 12 slides and every slide appears in RP", () => {
  assert.deepEqual(
    data.deck.map((d) => d.no),
    Array.from({ length: 12 }, (_, i) => i + 1)
  );
  const refs = new Set(
    data.scenes.filter((s) => s.phase === "rp").flatMap((s) => s.slideRefs)
  );
  assert.deepEqual(
    [...refs].sort((a, b) => a - b),
    data.deck.map((d) => d.no)
  );
  assert.ok(data.deck[4].title.startsWith("고객 맥락의 단절"));
  assert.ok(
    data.deck[10].points[0].includes("롯데렌탈·현대오토에버·현대모비스")
  );
  assert.ok(!JSON.stringify(data).includes("Harwoods"));
});

test("29 coherent scenes include 16 RP and 13 hiring interview questions", () => {
  assert.equal(data.scenes.length, 29);
  assert.equal(data.scenes.filter((s) => s.phase === "rp").length, 16);
  assert.equal(data.scenes.filter((s) => s.phase === "interview").length, 13);
  assert.equal(new Set(data.scenes.map((s) => s.id)).size, 29);
  for (const scene of data.scenes) {
    assert.ok(scene.opts.length >= 4 && scene.opts.length <= 5, scene.id);
    assert.equal(Math.max(...scene.opts.map((o) => o.s)), 10, scene.id);
    assert.ok(
      scene.opts.every((o) => Number.isInteger(o.s) && o.s >= 0 && o.s <= 10)
    );
    assert.ok(
      scene.crit.every((k) => data.criteria[k]),
      scene.id
    );
    assert.equal(scene.rubric.length, 3, scene.id);
    assert.ok(
      scene.slideRefs.every((n) => data.deck.some((d) => d.no === n)),
      scene.id
    );
    assert.ok(
      scene.followups.weak && scene.followups.strong && scene.followups.flag
    );
    if (scene.phase === "interview") assert.equal(scene.sp, "INT");
  }
});

test("causality trap is corrected rather than rewarded", () => {
  const scene = data.scenes.find((s) => s.id === "rp-internal");
  const wrong = scene.opts.find((o) =>
    o.t.startsWith("고객이 같은 설명을 계속하기 때문에")
  );
  assert.ok(wrong.s < 5);
  assert.ok(wrong.f.includes("공통 원인"));
  assert.ok(
    scene.opts
      .find((o) => o.s === 10)
      .t.startsWith("고객 맥락이 이어지지 않으면")
  );
});

test("all player-facing prompts remain in Korean", () => {
  assert.ok(!/[\u3040-\u30ff]/.test(JSON.stringify(data)));
  for (const scene of data.scenes) {
    assert.ok(/[가-힣]/.test(scene.followups.weak), scene.id);
  }
});

test("case denominators and educational POC boundaries remain explicit", () => {
  const cases = data.scenes.find((s) => s.id === "rp-references");
  assert.ok(cases.ideal.includes("본사 영업사원(TR) 전체 업무 시간"));
  assert.ok(cases.ideal.includes("도입 1년 후 MAU"));
  assert.ok(cases.ideal.includes("영업 인수인계 및 거래처 행정 업무 시간"));
  const poc = data.scenes.find((s) => s.id === "int-corepress");
  assert.ok(poc.opts.find((o) => o.s === 10).t.includes("6인 교육용 팀 PoC"));
  assert.ok(poc.opts.find((o) => o.flag).flag.includes("상용"));
  assert.ok(
    !data.scenes
      .find((s) => s.id === "rp-price")
      .opts.find((o) => o.s === 10)
      .t.includes("100달러")
  );
});

test("course selection does not leak questions from the other phase", () => {
  assert.equal(buildPlan(data.scenes, "full").length, 29);
  assert.ok(buildPlan(data.scenes, "rp").every((id) => id.startsWith("rp-")));
  assert.ok(
    buildPlan(data.scenes, "interview").every((id) => id.startsWith("int-"))
  );
  assert.throws(() => buildPlan(data.scenes, "unknown"));
});

test("unfinished practice cannot reach the training target", () => {
  const selected = data.scenes.slice(0, 2);
  const r = scoreSession(
    selected,
    { [selected[0].id]: answer(10) },
    data.criteria
  );
  assert.equal(r.completed, 1);
  assert.equal(r.total, 100);
  assert.equal(r.reached, false);
});

test("two serious flags override a high training score", () => {
  const selected = data.scenes.slice(0, 2);
  const r = scoreSession(
    selected,
    Object.fromEntries(selected.map((s) => [s.id, answer(10, "미확인 약속")])),
    data.criteria
  );
  assert.equal(r.total, 100);
  assert.equal(r.flags.length, 2);
  assert.equal(r.reached, false);
});

test("selected course denominator and score methods are reported correctly", () => {
  const selected = [
    data.scenes[0],
    data.scenes.find((s) => s.id === "int-transition")
  ];
  const r = scoreSession(
    selected,
    {
      [selected[0].id]: answer(8, "", "ai"),
      [selected[1].id]: answer(10, "", "self")
    },
    data.criteria
  );
  assert.equal(r.total, 90);
  assert.equal(r.phases.rp, 80);
  assert.equal(r.phases.interview, 100);
  assert.deepEqual(plain(r.methods), { pick: 0, ai: 1, self: 1 });
});

test("uncovered criteria and absent phases are null rather than NaN", () => {
  const stage = data.scenes[0];
  const r = scoreSession([stage], { [stage.id]: answer(8) }, data.criteria);
  assert.equal(r.phases.interview, null);
  assert.equal(r.criteria.coachability, null);
  assert.ok(
    Object.values(r.criteria).every((x) => x === null || Number.isFinite(x))
  );
});

test("follow-up prioritizes a factual flag over a high score", () => {
  const s = data.scenes.find((s) => s.id === "rp-references");
  assert.equal(followQuestion(s, answer(10, "과장")), s.followups.flag);
  assert.equal(followQuestion(s, answer(7)), s.followups.weak);
  assert.equal(followQuestion(s, answer(8)), s.followups.strong);
});

test("second follow-up stays in the current customer or interview role", () => {
  const rp = data.scenes[0],
    interview = data.scenes.find((s) => s.phase === "interview");
  assert.ok(followQuestion(rp, { score: 9, follows: 1 }).includes("기록부터"));
  assert.ok(
    followQuestion(interview, { score: 9, follows: 1 }).includes("본인이 직접")
  );
});

test("reflection chooses flagged RP first and excludes later interview answers", () => {
  const rp1 = data.scenes[0],
    rp2 = data.scenes[1],
    int = data.scenes.find((s) => s.phase === "interview");
  const results = {
    [rp1.id]: answer(10, "과장"),
    [rp2.id]: answer(2),
    [int.id]: answer(0, "과장")
  };
  const ordered = weakestScenes(data.scenes, results, "rp");
  assert.deepEqual(plain(ordered.map((s) => s.id)), [rp1.id, rp2.id]);
});

test("invalid AI responses raise an error instead of becoming a zero score", () => {
  for (const r of [
    null,
    {},
    { score: "9", feedback: "text" },
    { score: NaN, feedback: "text" },
    { score: 8, feedback: "" }
  ]) {
    assert.throws(() => normalizeEvaluation(r));
  }
});

test("AI scores are bounded and serious flags cannot be resolved by score", () => {
  const r = normalizeEvaluation({
    score: 99,
    feedback: "검증",
    flag: true,
    flagReason: "기능 과장",
    resolved: true
  });
  assert.equal(r.score, 10);
  assert.equal(r.resolved, false);
  assert.equal(r.flag, "기능 과장");
});

test("every literal DOM target is present exactly once", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate DOM ID");
  const targets = [...engine.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
  for (const id of targets) assert.ok(ids.includes(id), "missing " + id);
});

test("HTML still opens as one file without a build or external script", () => {
  assert.ok(html.includes('<html lang="ko">'));
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.equal(data.deck.length, 12);
  assert.ok(html.includes("자가 점검"));
});
