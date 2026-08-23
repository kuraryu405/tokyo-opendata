# StayBridge Tokyo

母国の危機により、東京への短期滞在中に予定どおり帰国できなくなった外国人のための、生活再建ナビゲーションMVPです。制度名や検索語を知らなくても、状況に応じた「次の一歩」を時間軸で提示します。

## 問題と対象

主な対象は、旅行・知人訪問などで東京に来て、突然の母国情勢の変化で帰国が難しくなった短期滞在者です。住居、学校、医療、行政の接点を持たない人が、翌日からの行動を決められる状態を目指します。デモのPersona Aは架空の人物です。

## 主な流れ

`Landing → Language → Situation Check → Personal Roadmap → Local Action → Human Support → Consultation Summary`

- 決定論的なRule Engineが、型付き回答コードと固定評価日から安定したRule IDの行動を生成
- 公式情報は「何を確認するか」、Open Dataは「地域で何を確認できるか」を支える
- 行政向け Crisis Support View は公式Open Dataと、同意済み任意回答のk匿名集計を明確に分けて表示

## 技術と起動

Node.js 22.13 以上が必要です。

技術スタックは Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、Vinext/Vite、Vitest です。主要導線は静的データとRule Engineで動き、ログイン・AI APIを必要としません。Worker のバックエンド共通基盤にはローカル既定の Cloudflare D1 Binding があります。

```bash
pnpm install --frozen-lockfile
pnpm dev                  # 利用者アプリ: http://localhost:3000
pnpm dev:municipality     # 自治体アプリ: http://localhost:3001
pnpm db:local:init        # local D1へmigrationとseedを適用
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

北区の施設キャッシュと東京都の人口キャッシュを更新する場合は、`pnpm data:fetch` を実行します。実行時だけ一次配布元を取得し、通常のアプリ実行時は生成済みのJSONキャッシュだけを参照します。

利用者アプリと自治体アプリは独立したCloudflare Workers互換ビルドです。相互リンク先はそれぞれ `NEXT_PUBLIC_MUNICIPALITY_APP_URL` と `NEXT_PUBLIC_USER_APP_URL` で設定でき、未設定時は上記のローカルURLを使います。

`main`のCI成功後は変更対象のWorkerをstagingへデプロイし、`/healthz`とD1の`/readyz`を確認してから、同じビルド成果物をproductionへ自動昇格します。D1の環境作成・migration・ローカル初期化は [Workers・D1バックエンド基盤](docs/backend-d1.md)、設定、ロールバック、外部E2E連携は [CI・CDドキュメント](docs/ci-and-e2e.md) を参照してください。

## Contributors ✨

Thanks to everyone who has contributed code through a merged pull request.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## 翻訳モック

日本語・English・မြန်မာဘာသာを含む12言語の表示は、MVPでは静的な翻訳カタログです。LLMや外部翻訳API、APIキーは使用していません。主要な行動決定は言語にかかわらずRule Engineで行います。専門家翻訳は現時点では実施できないため [Issue #7](https://github.com/kuraryu405/tokyo-opendata/issues/7) をcloseし、`expertReview` は未完了のままです。`ja` / `en` / `my` は内部確認済みの静的プレビュー、残る9言語は非公開draftとして扱います。

## Action Cardカタログ

「あなたの次のステップ」は、型付きの静的Action Cardカタログから表示します。カード本文を実行時に生成せず、安定したID、注意事項、Source Registryの出典、CTA遷移、レビュー期限を管理します。未レビュー・期限切れ・出典不明のカードは表示せず、公式相談先へfallbackします。カード一覧と更新手順は [docs/action-card-catalog.md](docs/action-card-catalog.md) を参照してください。

カード選定は [固定Rule Engine](docs/rule-engine.md) を正とします。Rule ID、回答コード、除外条件、priority、timing、reason codeを表で管理し、同じAction IDは最高priority、同点はRule ID順で1枚に解決します。評価日は東京日付を `asOfDate` として注入するため、AI/API/D1や実行時時計がなくても同じ入力から同じ順序・理由を再現できます。「なぜこの案内？」には採用Rule IDと回答コードを表示します。

## データ

実装に同梱した **Source Registry の metadata を正**とします。各画面の出典・更新日・取得日・データ種別を確認してください。外部データは正規化してアプリに同梱し、実演時に毎回リモート取得しません。

人口・施設は、公的なOpen Dataから確認した北区の一部レコードをデモ安定性のためローカルへキャッシュしています。北区の施設データは[北区オープンデータ](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html)のCC BY 4.0データセットに由来します。収録件数は全件数・受入可否・空き・支援能力を表しません。Persona Aと回答状態は `demo fixture` であり、実在人物ではありません。区分、出典、制約は [docs/data-sources.md](docs/data-sources.md) に記録します。

Situation Check回答とLLM会話は別同意・別テーブルです。明示同意がある場合だけ、サーバーで最小化・NFKC正規化・マスキングまたは拒否した後の内容をD1へ保存します。会話作成は#62が生成したassistant本文とprovenanceをserver-internal境界から渡す場合だけ可能で、#59の公開HTTP routeと同意設定UIだけでは会話を保存しません。デモfixtureは保存できません。期限付き自動削除という従来条件は廃止し、マスキング済みデータは無期限保持とします。記録IDと削除コードの保有者は削除できます。削除コードはD1ではSHA-256 hashだけを保存し、削除まで同じタブの`sessionStorage`にも保持します。恒久ユーザーID、アカウント、Cookie横断追跡、学習・二次利用、Crisis Viewへの会話本文公開は行いません。詳細は [安全とプライバシー](docs/safety-and-privacy.md) と [Workers・D1バックエンド基盤](docs/backend-d1.md) を参照してください。

自治体Workerだけの `GET /api/crisis/needs?municipality=13117&period=30d&view=needs` は、同意済み`situation_submissions`を自治体・期間・1軸で匿名集計します。`municipality`、`period`（`7d` / `30d` / `90d`）、`view`（`needs` / `return_status` / `departure_window` / `accommodation`）は各1個のallowlistのみを受け付けます。5件未満の全体・カテゴリは数値を返さず、会話・個票を読取りません。これはOpen Dataでも母集団・不足・優先度・支援能力の指標でもありません。

## 安全性

StayBridge Tokyo は在留可否、難民・補完的保護、就労可否、就学可否、給付資格、母国の安全性を判定しません。必要な場面では公式窓口・行政機関・専門家へ接続します。氏名、メール、電話、旅券・在留カード番号、正確な住所、政治・宗教・迫害に関する情報は要求しません。サーバーのマスキングは完全ではないため、入力画面の注意を残します。

## 制約

自治体の外国人人口統計は、東京に居住する中長期滞在者等の分布を把握する参考であり、短期滞在中の旅行者や帰国困難者を完全には表しません。施設数は対応能力ではありません。詳細は [docs/limitations.md](docs/limitations.md) を参照してください。

## ドキュメント

- [プロダクト概要](docs/product-overview.md) / [要件](docs/requirements.md) / [実装仕様](docs/specification.md)
- [アーキテクチャ](docs/architecture.md) / [ルール](docs/rule-engine.md) / [Open Data戦略](docs/open-data-strategy.md)
- [安全とプライバシー](docs/safety-and-privacy.md) / [2分デモ](docs/demo-script.md)
- [CI・CD・外部E2E連携](docs/ci-and-e2e.md) / [Workers・D1バックエンド基盤](docs/backend-d1.md)
