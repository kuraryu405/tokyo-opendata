"use client";

import { useEffect, useId, useState } from "react";
import { dataGaps, kitaMyanmarProfile, localResources, sourceRegistry } from "@staybridge/data";
import type { CrisisNeedsData } from "@staybridge/worker-runtime";

const userAppUrl =
  process.env.NEXT_PUBLIC_USER_APP_URL?.replace(/\/+$/, "") ||
  "http://localhost:3000";

const checklist = [
  { group: "情報提供", items: ["ミャンマー語・英語で案内できる情報を確認", "最新の在留関連公式情報への導線を確認", "外国人相談窓口への情報共有状況を確認"] },
  { group: "子ども", items: ["短期滞在が長期化した場合の教育相談導線を確認", "子ども向け公共資源の利用条件を確認"] },
  { group: "医療・生活", items: ["医療案内の多言語対応状況を確認", "住居・一時的な生活相談先への導線を確認"] },
];

const gapLabels: Record<string, string> = {
  "short-term-visitor-distribution": "短期滞在者の地域分布",
  "facility-capacity": "施設・窓口の対応余力",
  "language-capacity": "対応言語の統一データ",
  "real-time-availability": "リアルタイムの利用可否",
};

const periodLabels = { "7d": "直近7日", "30d": "直近30日", "90d": "直近90日" } as const;
const viewLabels = {
  needs: "困りごと",
  return_status: "帰国の見通し",
  departure_window: "出国予定",
  accommodation: "滞在先",
} as const;
const categoryLabels: Record<string, string> = {
  stay: "在留・滞在", consultation: "相談", accommodation: "宿泊先", living_cost: "生活費",
  employment: "就労", education: "教育", childcare: "子ども", medical: "医療", language: "言語", daily_life: "日常生活",
  possible: "可能", difficult: "難しい", unknown: "不明",
  within_7_days: "7日以内", within_30_days: "30日以内", within_3_months: "3か月以内", no_departure_plan: "予定なし",
  hotel: "ホテル", family_or_friend: "家族・知人宅", rental: "賃貸", temporary_facility: "一時施設", unstable: "不安定", prefer_not_to_say: "回答しない",
};

type Period = keyof typeof periodLabels;
type View = keyof typeof viewLabels;
type NeedsState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: CrisisNeedsData };

function CrisisNeedsPanel() {
  const [period, setPeriod] = useState<Period>("30d");
  const [view, setView] = useState<View>("needs");
  const [state, setState] = useState<NeedsState>({ kind: "loading" });
  const periodId = useId();
  const viewId = useId();

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    const params = new URLSearchParams({ municipality: "13117", period, view });
    fetch(`/api/crisis/needs?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { ok?: boolean; data?: CrisisNeedsData };
        if (!response.ok || !body.ok || !body.data) throw new Error("Crisis needs request failed");
        setState({ kind: "ready", data: body.data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [period, view]);

  return <section className="crisis-section crisis-needs-section" data-testid="crisis-voluntary-needs" aria-labelledby="crisis-needs-title">
    <div className="crisis-section-title"><span>03</span><div><small>VOLUNTARY STAYBRIDGE RESPONSES</small><h2 id="crisis-needs-title">匿名化した任意回答の傾向</h2></div><p>公式Open Dataとは別の、同意済み任意回答だけの集計です。</p></div>
    <div className="crisis-needs-panel">
      <div className="crisis-needs-copy">
        <span className="card-kicker">NOT OFFICIAL OPEN DATA</span>
        <p>個票や会話は表示しません。これは人口、支援不足、優先度、サービス提供能力を示すものではありません。</p>
      </div>
      <div className="crisis-needs-controls" aria-label="任意回答の集計条件">
        <label htmlFor={periodId}>対象期間<select id={periodId} value={period} onChange={(event) => setPeriod(event.target.value as Period)}>{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label htmlFor={viewId}>表示軸<select id={viewId} value={view} onChange={(event) => setView(event.target.value as View)}>{Object.entries(viewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="crisis-needs-result" aria-live="polite">
        {state.kind === "loading" && <output className="crisis-needs-loading">匿名集計を確認しています…</output>}
        {state.kind === "error" && <div data-testid="crisis-needs-error" className="crisis-needs-state crisis-needs-error"><strong>現在、匿名集計を表示できません</strong><p>個別の情報は表示せず、時間をおいて再度確認してください。</p></div>}
        {state.kind === "ready" && <CrisisNeedsResult data={state.data} />}
      </div>
    </div>
  </section>;
}

function CrisisNeedsResult({ data }: { data: CrisisNeedsData }) {
  if (data.availability === "no_data") {
    return <div data-testid="crisis-needs-no-data" className="crisis-needs-state"><strong>この期間に表示可能な任意回答はありません</strong><p>未回答を意味するものではなく、母集団や支援状況の推定には使えません。</p><Coverage data={data} /></div>;
  }
  if (data.availability === "below_threshold") {
    return <div data-testid="crisis-needs-below-threshold" className="crisis-needs-state"><strong>匿名性の基準を満たさないため表示しません</strong><p>{data.threshold}件未満の全体数・カテゴリ数は表示しません。</p><Coverage data={data} /></div>;
  }
  return <div data-testid="crisis-needs-available" className="crisis-needs-available">
    <div className="crisis-needs-meta"><strong>回答者数 {data.respondentCount}</strong><span>最終集計日 {data.lastUpdatedAt ?? "非表示"}</span>{data.freshness === "stale" && <span data-testid="crisis-needs-stale" className="stale-chip">更新から7日超過</span>}</div>
    {data.categories.length > 0 ? <ul className="crisis-needs-categories">{data.categories.map((category) => <li key={category.key}><span>{categoryLabels[category.key] ?? category.key}</span><strong>{category.respondentCount}</strong></li>)}</ul> : <p className="crisis-needs-empty">表示基準を満たすカテゴリはありません。カテゴリ別の小さな数は表示しません。</p>}
    <Coverage data={data} />
  </div>;
}

function Coverage({ data }: { data: CrisisNeedsData }) {
  return <div data-testid="crisis-needs-coverage" className="crisis-needs-coverage"><strong>集計範囲</strong><p>{data.coverageNote}</p><p>{data.limitations.join(" ")}</p></div>;
}

export function CrisisView() {
  const profile = kitaMyanmarProfile;
  const populationSource = sourceRegistry.TOKYO_FOREIGN_POPULATION_2026_01;
  const resources = localResources.filter((item) => item.municipality === profile.municipalityName);
  const counts = [
    ["学校", profile.resourceCounts.school ?? 0, "school"],
    ["医療機関", profile.resourceCounts.medical ?? 0, "medical"],
    ["子ども施設", profile.resourceCounts.child_support ?? 0, "child"],
    ["公共施設", profile.resourceCounts.public_facility ?? 0, "public"],
  ] as const;

  return <div className="crisis-shell">
    <header className="crisis-header">
      <a className="brand" href={userAppUrl}><span className="brand-mark">SB</span><span>StayBridge <b>Tokyo</b></span></a>
      <div className="admin-label"><span /> Preparedness View</div>
      <a className="back-to-service" href={userAppUrl}>本人向け画面へ ↗</a>
    </header>
    <main className="crisis-main">
      <section className="crisis-intro">
        <div><span className="section-label">CRISIS SUPPORT · OPEN DATA</span><h1>支援準備のために、<br />次に確認すること。</h1><p>人口統計と地域資源を「対応の断定」ではなく、確認を始めるための手がかりとして整理します。</p></div>
        <div className="country-picker" aria-label="MVP固定対象"><span>MVPで確認できる固定対象</span><strong>北区 × Myanmar · ミャンマー</strong><small>他の自治体・国籍は未対応です</small></div>
      </section>

      <div className="coverage-banner"><span className="coverage-icon">i</span><div><strong>Data coverage note</strong><p>この人口データは住民基本台帳に基づく居住者の参考データです。東京に短期滞在中の旅行者等を完全には表しません。</p></div><a href={populationSource.url} target="_blank" rel="noreferrer">出典を見る ↗</a></div>

      <section className="crisis-section" data-testid="crisis-official-data">
        <div className="crisis-section-title"><span>01</span><div><small>POTENTIAL IMPACT</small><h2>確認を始める地域</h2></div><p>人口の多さだけで支援不足を判断しません。</p></div>
        <div className="impact-grid">
          <article className="population-card"><div className="population-top"><span>北区 · KITA CITY</span><span className="verified-chip">VERIFIED CACHE</span></div><strong>{profile.residentPopulation?.toLocaleString("ja-JP")}</strong><p>ミャンマー国籍・地域の住民（比較率ではなく参考人数）</p><footer><span>基準日 {populationSource.dataUpdatedAt}</span><a href={populationSource.url} target="_blank" rel="noreferrer">東京都統計 ↗</a></footer></article>
          <article className="interpretation-card"><span className="card-kicker">HOW TO READ</span><h3>「支援が不足」とは断定できません</h3><p>この数字から分かるのは、平時の居住者分布の一部です。短期滞在者、実際の相談件数、窓口の処理能力は含まれません。</p><div className="confirm-row"><span>→</span><strong>地域の相談導線と言語対応を確認する</strong></div></article>
        </div>
      </section>

      <section className="crisis-section">
        <div className="crisis-section-title"><span>02</span><div><small>EXISTING RESOURCES</small><h2>確認できた地域資源</h2></div><p>件数はMVPに収録した出典確認済みキャッシュです。</p></div>
        <div className="resource-counts">{counts.map(([label, count, kind]) => <article key={label}><span className={`count-icon ${kind}`}>{kind === "school" ? "学" : kind === "medical" ? "+" : kind === "child" ? "こ" : "公"}</span><strong>{count}</strong><p>{label}</p><small>要確認</small></article>)}</div>
        <details className="dataset-details"><summary>収録した施設を見る（{resources.length}件）</summary><ul>{resources.map((resource) => <li key={resource.id}><span>{resource.name}</span><small>{resource.category} · {resource.address}</small></li>)}</ul></details>
      </section>

      <CrisisNeedsPanel />

      <section className="crisis-section">
        <div className="crisis-section-title"><span>04</span><div><small>DATA GAP</small><h2>今のOpen Dataでは分からないこと</h2></div><p>不足を隠さず、次に整備すべき情報として扱います。</p></div>
        <div className="gap-grid">{dataGaps.map((gap, index) => <article key={gap.id}><span className="gap-index">GAP 0{index + 1}</span><h3>{gapLabels[gap.id] || gap.title}</h3><p>{gap.description}</p><footer>{gap.whyItMatters}</footer></article>)}</div>
      </section>

      <section className="crisis-section checklist-section">
        <div className="crisis-section-title"><span>05</span><div><small>PREPARATION CHECKLIST</small><h2>対応検討項目</h2></div><p>自動判断や命令ではなく、担当者が確認するための一覧です。</p></div>
        <div className="checklist-grid">{checklist.map((group) => <article key={group.group}><h3>{group.group}</h3>{group.items.map((item) => <label key={item}><input type="checkbox" /><span>{item}</span></label>)}</article>)}</div>
      </section>

      <section className="feedback-loop"><div><span className="section-label">FUTURE FEEDBACK LOOP</span><h2>Open Dataを、次の支援準備へ。</h2><p>将来は個人を特定しない利用傾向から、実際の困りごとと不足データを把握し、データ整備へ還元します。</p></div><div className="loop-flow">{["Public Open Data", "StayBridge", "Anonymous needs", "Public preparation"].map((item, i) => <div key={item}><span>{String(i + 1).padStart(2, "0")}</span><strong>{item}</strong>{i < 3 && <b>→</b>}</div>)}</div></section>
    </main>
    <footer className="crisis-footer"><span>StayBridge Tokyo · Preparedness View</span><span>個人追跡・住所レベル表示・法的判断を行いません</span></footer>
  </div>;
}
