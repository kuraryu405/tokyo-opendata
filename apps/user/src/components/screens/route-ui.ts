import type { Locale } from "../staybridge-session";

export const routeUi = {
  ja: { restart: "最初からやり直す", preparing: "次のステップを準備しています", catalogUnavailable: "現在表示できる確認済みカードがありません。公式相談先で状況を確認してください。", contactOfficial: "公式相談先を見る", aiReason: "入力したその他の来日目的から、確認すると役立つ可能性がある既存カードを追加しています。最終判断ではありません。" },
  en: { restart: "Start over", preparing: "Preparing your next steps", catalogUnavailable: "No reviewed action card is currently available. Please confirm your situation with an official support service.", contactOfficial: "View official support", aiReason: "Your other reason for coming to Japan suggested this existing reviewed card may be useful to check. This is not a decision." },
  my: { restart: "အစမှ ပြန်စရန်", preparing: "သင့်နောက်အဆင့်များကို ပြင်ဆင်နေသည်", catalogUnavailable: "လက်ရှိပြသနိုင်သည့် စစ်ဆေးပြီးကတ် မရှိပါ။ သင့်အခြေအနေကို တရားဝင်အကူအညီဌာနတွင် အတည်ပြုပါ။", contactOfficial: "တရားဝင်အကူအညီ ကြည့်ရန်", aiReason: "ဂျပန်သို့ လာရောက်ရသည့် အခြားရည်ရွယ်ချက်အရ စစ်ဆေးထားသော ဤကတ်သည် အသုံးဝင်နိုင်သဖြင့် ထည့်ပြထားပါသည်။ ဤသည်မှာ ဆုံးဖြတ်ချက်မဟုတ်ပါ။" },
} satisfies Record<Locale, { restart: string; preparing: string; catalogUnavailable: string; contactOfficial: string; aiReason: string }>;
