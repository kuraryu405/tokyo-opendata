"use client";

import Link from "next/link";
import { dataGaps, kitaMyanmarProfile, localResources, sourceRegistry } from "@/src/data";

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
      <Link className="brand" href="/"><span className="brand-mark">SB</span><span>StayBridge <b>Tokyo</b></span></Link>
      <div className="admin-label"><span /> Preparedness View</div>
      <Link className="back-to-service" href="/">本人向け画面へ ↗</Link>
    </header>
    <main className="crisis-main">
      <section className="crisis-intro">
        <div><span className="section-label">CRISIS SUPPORT · OPEN DATA</span><h1>支援準備のために、<br />次に確認すること。</h1><p>人口統計と地域資源を「対応の断定」ではなく、確認を始めるための手がかりとして整理します。</p></div>
        <div className="country-picker" aria-label="MVP固定対象"><span>MVPで確認できる固定対象</span><strong>北区 × Myanmar · ミャンマー</strong><small>他の自治体・国籍は未対応です</small></div>
      </section>

      <div className="coverage-banner"><span className="coverage-icon">i</span><div><strong>Data coverage note</strong><p>この人口データは住民基本台帳に基づく居住者の参考データです。東京に短期滞在中の旅行者等を完全には表しません。</p></div><a href={populationSource.url} target="_blank" rel="noreferrer">出典を見る ↗</a></div>

      <section className="crisis-section">
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

      <section className="crisis-section">
        <div className="crisis-section-title"><span>03</span><div><small>DATA GAP</small><h2>今のOpen Dataでは分からないこと</h2></div><p>不足を隠さず、次に整備すべき情報として扱います。</p></div>
        <div className="gap-grid">{dataGaps.map((gap, index) => <article key={gap.id}><span className="gap-index">GAP 0{index + 1}</span><h3>{gapLabels[gap.id] || gap.title}</h3><p>{gap.description}</p><footer>{gap.whyItMatters}</footer></article>)}</div>
      </section>

      <section className="crisis-section checklist-section">
        <div className="crisis-section-title"><span>04</span><div><small>PREPARATION CHECKLIST</small><h2>対応検討項目</h2></div><p>自動判断や命令ではなく、担当者が確認するための一覧です。</p></div>
        <div className="checklist-grid">{checklist.map((group) => <article key={group.group}><h3>{group.group}</h3>{group.items.map((item) => <label key={item}><input type="checkbox" /><span>{item}</span></label>)}</article>)}</div>
      </section>

      <section className="feedback-loop"><div><span className="section-label">FUTURE FEEDBACK LOOP</span><h2>Open Dataを、次の支援準備へ。</h2><p>将来は個人を特定しない利用傾向から、実際の困りごとと不足データを把握し、データ整備へ還元します。</p></div><div className="loop-flow">{["Public Open Data", "StayBridge", "Anonymous needs", "Public preparation"].map((item, i) => <div key={item}><span>{String(i + 1).padStart(2, "0")}</span><strong>{item}</strong>{i < 3 && <b>→</b>}</div>)}</div></section>
    </main>
    <footer className="crisis-footer"><span>StayBridge Tokyo · Preparedness View</span><span>個人追跡・住所レベル表示・法的判断を行いません</span></footer>
  </div>;
}
