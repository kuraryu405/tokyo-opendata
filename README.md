# StayBridge Tokyo

母国の危機により、東京への短期滞在中に予定どおり帰国できなくなった外国人のための、生活再建ナビゲーションMVPです。制度名や検索語を知らなくても、状況に応じた「次の一歩」を時間軸で提示します。

## 問題と対象

主な対象は、旅行・知人訪問などで東京に来て、突然の母国情勢の変化で帰国が難しくなった短期滞在者です。住居、学校、医療、行政の接点を持たない人が、翌日からの行動を決められる状態を目指します。デモのPersona Aは架空の人物です。

## 主な流れ

`Landing → Language → Situation Check → Personal Roadmap → Local Action → Human Support → Consultation Summary`

- 決定論的なRule Engineが、回答から TODAY / THIS WEEK / NEXT 30 DAYS の行動を生成
- 公式情報は「何を確認するか」、Open Dataは「地域で何を確認できるか」を支える
- 行政向け Crisis Support View は Potential Impact、Existing Resources、Data Gap、対応検討項目を表示

## 技術と起動

Node.js 22.13 以上が必要です。

技術スタックは Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、Vinext/Vite、Vitest です。Cloudflare Workers互換の静的データ中心構成で、DB・ログインを必要としません。主要導線はAIに依存せず、相談内容の整理にだけCloudflare Workers AIを使用します。

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

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
- system promptで、相談内容と窓口への質問整理だけを許可します。在留・就労・就学・給付、法的権利、難民・補完的保護、母国の安全性を判定させず、公式・法律・医療・緊急時の助言を置き換えません。
- 氏名、連絡先、旅券・在留カード番号、正確な住所、政治・宗教・迫害に関する情報は入力しないよう画面で案内し、モデルにも要求・反復させない制約を与えます。
- Workerは同一オリジン、JSON、1メッセージ800文字、履歴7件、本文25,000 bytesを検証します。`cf-connecting-ip` 単位で60秒あたり20回に制限し、応答には `Cache-Control: no-store` を付けます。
- Workers AI未接続、推論失敗、空応答、レート超過時はチャット内に公式相談先を使う案内を表示します。AI障害によってロードマップなどの主要機能は停止しません。

本番Workerでは `wrangler.jsonc` の `AI` と `SUPPORT_CHAT_RATE_LIMITER` bindingsを使用します。ローカル開発のAI bindingは `vite.config.ts` でremote接続にしているため、実推論にはCloudflareへの認証とネットワーク接続が必要です。自動テストは課金と外部依存を避けるためAI・rate-limit bindingsをmockし、次のコマンドで本番設定が認識されることを確認できます。

```bash
pnpm exec wrangler deploy --dry-run
```

日本語・English・မြန်မာဘာသာの画面表示は、MVPでは静的な翻訳モックです。翻訳にLLMや外部翻訳APIは使用していません。本番翻訳API接続と専門家レビューは [Issue #7](https://github.com/kuraryu405/tokyo-opendata/issues/7) で管理します。

## データ

実装に同梱した **Source Registry の metadata を正**とします。各画面の出典・更新日・取得日・データ種別を確認してください。外部データは正規化してアプリに同梱し、実演時に毎回リモート取得しません。

人口・施設は、公的な公開データ/公式一覧から確認した北区の一部レコードをデモ安定性のためローカルへキャッシュしています。収録件数は全件数・受入可否・空き・支援能力を表しません。Persona Aと回答状態は `demo fixture` であり、実在人物ではありません。区分、出典、制約は [docs/data-sources.md](docs/data-sources.md) に記録します。

## 安全性

StayBridge Tokyo は在留可否、難民・補完的保護、就労可否、就学可否、給付資格、母国の安全性を判定しません。必要な場面では公式窓口・行政機関・専門家へ接続します。氏名、旅券番号、正確な住所、政治・宗教・迫害に関する情報は要求しません。

## 制約

自治体の外国人人口統計は、東京に居住する中長期滞在者等の分布を把握する参考であり、短期滞在中の旅行者や帰国困難者を完全には表しません。施設数は対応能力ではありません。詳細は [docs/limitations.md](docs/limitations.md) を参照してください。

## ドキュメント

- [プロダクト概要](docs/product-overview.md) / [要件](docs/requirements.md) / [実装仕様](docs/specification.md)
- [アーキテクチャ](docs/architecture.md) / [ルール](docs/rule-engine.md) / [Open Data戦略](docs/open-data-strategy.md)
- [安全とプライバシー](docs/safety-and-privacy.md) / [2分デモ](docs/demo-script.md)
- [CI・外部E2E連携](docs/ci-and-e2e.md)
