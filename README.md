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

技術スタックは Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、Vinext/Vite、Vitest です。主要導線は静的データとRule Engineで動き、ログインやAIを必要としません。Worker のバックエンド共通基盤にはローカル既定の Cloudflare D1 Binding があり、任意の相談内容の整理にだけCloudflare Workers AIを使用します。

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

北区の施設キャッシュと東京都の人口キャッシュを更新する場合は、`pnpm data:fetch` を実行します。実行時だけ一次配布元を取得し、通常のアプリ実行時は生成済みのJSONキャッシュだけを参照します。学校の機械可読 source が現行 identity/address と一致しない場合は、`data:fetch` が cache を変更せず失敗し、古い学校情報を再生成しません。

利用者アプリと自治体アプリは独立したCloudflare Workers互換ビルドです。相互リンク先はそれぞれ `NEXT_PUBLIC_MUNICIPALITY_APP_URL` と `NEXT_PUBLIC_USER_APP_URL` で設定でき、未設定時は上記のローカルURLを使います。

`main`のCI成功後は変更対象のWorkerをstagingへデプロイし、`/healthz`とD1の`/readyz`を確認してから、同じビルド成果物をproductionへ自動昇格します。D1の環境作成・migration・ローカル初期化は [Workers・D1バックエンド基盤](docs/backend-d1.md)、設定、ロールバック、外部E2E連携は [CI・CDドキュメント](docs/ci-and-e2e.md) を参照してください。

## Contributors ✨

Thanks to everyone who has contributed code through a merged pull request.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## AI相談（Cloudflare Workers AI）と翻訳モック

「あなたの次のステップ」画面では、ロードマップの横にCloudflare Workers AIチャットを常時表示し、質問例または自由入力から、公式窓口に伝える内容・確認する質問を整理できます。在留・就労・就学・給付などの可否は判定せず、AIが利用できない場合もRule Engine、地域情報、公式相談先、相談サマリーはそのまま利用できます。状況確認の回答はAIへ自動送信せず、チャットに入力した会話だけを返信生成のために送信します。

### AI相談の実装仕様

- ブラウザは `POST /api/support-chat` へ、表示言語（`ja` / `en` / `my`）とチャット内の直近7件だけを送信します。履歴は `user` から始まり、`assistant` と交互に並び、現在の `user` メッセージで終わる必要があります。
- Situation Checkの回答、Rule Engineの判断、Source Registry、端末に保存した状態はモデル入力に含めません。会話履歴はReactの画面状態だけに保持し、再読み込みまたは「会話を消去」で破棄します。
- モデルは `@cf/meta/llama-3.3-70b-instruct-fp8-fast` を使用し、`max_tokens: 320`、`temperature: 0.2` で呼び出します。モデル応答は前後の空白を除き、履歴へ戻せる最大800文字に制限します。
- system promptで、相談内容と窓口への質問整理だけを許可します。在留・就労・就学・給付、法的権利、難民・補完的保護、母国の安全性を判定させず、公式・法律・医療・緊急時の助言を置き換えません。ブラウザ由来の全履歴は、表示上のroleにかかわらず単一のuntrusted transcriptとしてuser messageへ格納し、AIのassistant messageとして転送しません。
- 氏名、連絡先、旅券・在留カード番号、正確な住所、政治・宗教・迫害に関する情報は入力しないよう画面で案内し、モデルにも要求・反復させない制約を与えます。
- Workerは同一オリジン、JSON、1メッセージ800文字、履歴7件、本文25,000 bytesを検証します。`cf-connecting-ip` をkeyに60秒あたり20回に制限し、応答には `Cache-Control: no-store` を付けます。このRate Limiting Bindingのカウンタはkeyごと・Cloudflare locationごとに分離されるため、account-wideの20回/分ではありません。全Cloudflare locationをまたぐ単一上限が必要な場合は、中央集約カウンタを別途設計する必要があります。詳細は [Cloudflare公式のLocality](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#locality) を参照してください。
- Workers AI未接続、推論失敗、空応答、レート超過時はチャット内に公式相談先を使う案内を表示します。AI障害によってロードマップなどの主要機能は停止しません。

本番WorkerではCDがデプロイ成果物へ `AI` bindingを注入し、stagingとproductionでnamespaceを分離した `SUPPORT_CHAT_RATE_LIMITER` bindingと併用します。通常のローカル設定には `AI` bindingを含めないため、ローカル起動・ビルド・テストはremote AIへ接続せず、Cloudflare認証を必要としません。実推論を意図的に試す場合だけ `STAYBRIDGE_REMOTE_AI=1` を設定します。自動テストは課金と外部依存を避けるためAI・rate-limit bindingsをmockします。

```bash
pnpm build:user
pnpm --filter @staybridge/user exec wrangler deploy --dry-run --config dist/server/wrangler.json
```

日本語・English・မြန်မာဘာသာを含む12言語の表示は、MVPでは静的な翻訳カタログです。LLMや外部翻訳API、APIキーは使用していません。主要な行動決定は言語にかかわらずRule Engineで行います。専門家翻訳は現時点では実施できないため [Issue #7](https://github.com/kuraryu405/tokyo-opendata/issues/7) をcloseし、`expertReview` は未完了のままです。`ja` / `en` / `my` は内部確認済みの静的プレビュー、残る9言語は非公開draftとして扱います。

## Action Cardカタログ

「あなたの次のステップ」は、型付きの静的Action Cardカタログから表示します。カード本文を実行時に生成せず、安定したID、注意事項、Source Registryの出典、CTA遷移、レビュー期限を管理します。未レビュー・期限切れ・出典不明のカードは表示せず、公式相談先へfallbackします。カード一覧と更新手順は [docs/action-card-catalog.md](docs/action-card-catalog.md) を参照してください。

カード選定は [固定Rule Engine](docs/rule-engine.md) を正とします。Rule ID、回答コード、除外条件、priority、timing、reason codeを表で管理し、同じAction IDは最高priority、同点はRule ID順で1枚に解決します。評価日は東京日付を `asOfDate` として注入するため、AI/API/D1や実行時時計がなくても同じ入力から同じ順序・理由を再現できます。「なぜこの案内？」には採用Rule IDと回答コードを表示します。

## データ

実装に同梱した **Source Registry の metadata を正**とします。各画面の出典・更新日・取得日・データ種別を確認してください。外部データは正規化してアプリに同梱し、実演時に毎回リモート取得しません。

人口・施設は、公的なOpen Dataから一部レコードを選定・正規化し、デモ安定性のためローカルへキャッシュしています。北区の施設データは[北区オープンデータ](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html)のCC BY 4.0データセットに由来し、カード上でも変更内容を表示します。現行性を検証できない学校レコードは cache から除外しています。収録件数は全件数・受入可否・空き・支援能力を表しません。Persona Aと回答状態は `demo fixture` であり、実在人物ではありません。区分、出典、制約は [docs/data-sources.md](docs/data-sources.md) に記録します。

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
