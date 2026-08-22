import type { LocalResourceId } from "@staybridge/data";
import type { UserLocale } from "./index";

const localResourceLocales = ["ja", "en", "my"] as const satisfies readonly UserLocale[];

/** User-facing copy only. Source-backed values remain in @staybridge/data. */
export type LocalResourceDisplay = {
  name: string;
  municipality: string;
  address: string;
  description: string;
};

export type LocalResourceCatalog = Record<LocalResourceId, LocalResourceDisplay>;
export type LocalResourceCatalogByLocale = Record<UserLocale, LocalResourceCatalog>;

const ja = {
  "kita-school-toyokawa": { name: "豊川小学校", municipality: "北区", address: "東京都北区豊島3-10-23", description: "北区立の小学校です。" },
  "kita-school-ukima": { name: "浮間小学校", municipality: "北区", address: "東京都北区浮間3-4-27", description: "北区立の小学校です。" },
  "kita-school-jujo": { name: "十条小学校", municipality: "北区", address: "東京都北区中十条3-1-6", description: "北区立の小学校です。" },
  "kita-school-nishigaoka": { name: "西が丘小学校", municipality: "北区", address: "東京都北区西が丘1-12-14", description: "北区立の小学校です。日本語の学級と巡回拠点については、現在の支援内容を直接確認してください。" },
  "kita-medical-oji-kids": { name: "おうじキッズクリニック", municipality: "北区", address: "東京都北区王子5-1-40 サミットストア王子桜田通り店2階12号室", description: "小児科を掲げる診療所です。診療内容と予約の必要性は直接確認してください。" },
  "kita-medical-kominato": { name: "小湊小児科医院", municipality: "北区", address: "東京都北区王子5-2-2-108", description: "内科・小児科を掲げる診療所です。診療内容と予約の必要性は直接確認してください。" },
  "kita-medical-shikada": { name: "しかだこどもクリニック", municipality: "北区", address: "東京都北区堀船3-38-3", description: "小児科を掲げる診療所です。診療内容と予約の必要性は直接確認してください。" },
  "kita-child-akabane-kita": { name: "赤羽北児童館", municipality: "北区", address: "東京都北区赤羽北1-5-5", description: "児童館です。現在のプログラムと利用条件は直接確認してください。" },
  "kita-child-kamiya": { name: "神谷子どもセンター", municipality: "北区", address: "東京都北区神谷3-35-17", description: "子どもセンターです。現在のプログラムと利用条件は直接確認してください。" },
  "kita-child-jujodai": { name: "十条台子どもセンター", municipality: "北区", address: "東京都北区中十条1-2-18", description: "子どもセンターです。現在のプログラムと利用条件は直接確認してください。" },
  "kita-library-central": { name: "中央図書館", municipality: "北区", address: "東京都北区十条台1-2-5", description: "北区立の図書館です。" },
  "kita-library-toyoshima": { name: "豊島図書館", municipality: "北区", address: "東京都北区豊島3-27-22 豊島区民センター1階", description: "北区立の図書館です。" },
} as const satisfies LocalResourceCatalog;

const en = {
  "kita-school-toyokawa": { name: "Toyokawa Elementary School", municipality: "Kita City", address: "3-10-23 Toshima, Kita City, Tokyo", description: "A Kita City elementary school." },
  "kita-school-ukima": { name: "Ukima Elementary School", municipality: "Kita City", address: "3-4-27 Ukima, Kita City, Tokyo", description: "A Kita City elementary school." },
  "kita-school-jujo": { name: "Jujo Elementary School", municipality: "Kita City", address: "3-1-6 Nakajujo, Kita City, Tokyo", description: "A Kita City elementary school." },
  "kita-school-nishigaoka": { name: "Nishigaoka Elementary School", municipality: "Kita City", address: "1-12-14 Nishigaoka, Kita City, Tokyo", description: "A Kita City elementary school. Ask the school directly about current Japanese-language classes and visiting support services." },
  "kita-medical-oji-kids": { name: "Oji Kids Clinic", municipality: "Kita City", address: "Oji Sakuradori Summit Store, 2F Unit 12, 5-1-40 Oji, Kita City, Tokyo", description: "A clinic listed as providing pediatrics. Confirm services and appointment requirements directly." },
  "kita-medical-kominato": { name: "Kominato Pediatric Clinic", municipality: "Kita City", address: "5-2-2-108 Oji, Kita City, Tokyo", description: "A clinic listed as providing internal medicine and pediatrics. Confirm services and appointment requirements directly." },
  "kita-medical-shikada": { name: "Shikada Kodomo Clinic", municipality: "Kita City", address: "3-38-3 Horifune, Kita City, Tokyo", description: "A clinic listed as providing pediatrics. Confirm services and appointment requirements directly." },
  "kita-child-akabane-kita": { name: "Akabanekita Children's Hall", municipality: "Kita City", address: "1-5-5 Akabanekita, Kita City, Tokyo", description: "A children's hall. Confirm current programmes and eligibility directly." },
  "kita-child-kamiya": { name: "Kamiya Children's Centre", municipality: "Kita City", address: "3-35-17 Kamiya, Kita City, Tokyo", description: "A children's centre. Confirm current programmes and eligibility directly." },
  "kita-child-jujodai": { name: "Jujodai Children's Centre", municipality: "Kita City", address: "1-2-18 Nakajujo, Kita City, Tokyo", description: "A children's centre. Confirm current programmes and eligibility directly." },
  "kita-library-central": { name: "Central Library", municipality: "Kita City", address: "1-2-5 Jujodai, Kita City, Tokyo", description: "A Kita City library." },
  "kita-library-toyoshima": { name: "Toyoshima Library", municipality: "Kita City", address: "Toyoshima Residents' Centre, 1F, 3-27-22 Toshima, Kita City, Tokyo", description: "A Kita City library." },
} as const satisfies LocalResourceCatalog;

const my = {
  "kita-school-toyokawa": { name: "တိုယိုကာဝါ မူလတန်းကျောင်း", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ တိုယိုရှီမာ ၃-၁၀-၂၃", description: "ကီတာမြို့နယ်၏ မူလတန်းကျောင်းတစ်ကျောင်း ဖြစ်ပါသည်။" },
  "kita-school-ukima": { name: "အုကီမာ မူလတန်းကျောင်း", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ အုကီမာ ၃-၄-၂၇", description: "ကီတာမြို့နယ်၏ မူလတန်းကျောင်းတစ်ကျောင်း ဖြစ်ပါသည်။" },
  "kita-school-jujo": { name: "ဂျူဂျို မူလတန်းကျောင်း", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ နာကာဂျူဂျို ၃-၁-၆", description: "ကီတာမြို့နယ်၏ မူလတန်းကျောင်းတစ်ကျောင်း ဖြစ်ပါသည်။" },
  "kita-school-nishigaoka": { name: "နီရှီဂါအိုကာ မူလတန်းကျောင်း", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ နီရှီဂါအိုကာ ၁-၁၂-၁၄", description: "ကီတာမြို့နယ်၏ မူလတန်းကျောင်းတစ်ကျောင်း ဖြစ်ပါသည်။ ဂျပန်ဘာသာအတန်းနှင့် သွားရောက်ပံ့ပိုးမှု၏ လက်ရှိအခြေအနေကို ကျောင်းသို့ တိုက်ရိုက်မေးမြန်းပါ။" },
  "kita-medical-oji-kids": { name: "အိုဂျိ ကစ် ကလီနစ်", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ အိုဂျိ ၅-၁-၄၀၊ အိုဂျိ ဆာကူရာဒိုရီ ဆမ်မစ်စတိုး ၂ ထပ်၊ အခန်း ၁၂", description: "ကလေးဆေးကုသမှုကို ဖော်ပြထားသော ဆေးခန်းဖြစ်ပါသည်။ ဝန်ဆောင်မှုနှင့် ကြိုတင်ချိန်းဆိုမှုကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-medical-kominato": { name: "ကိုမီနာတို ကလေးဆေးခန်း", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ အိုဂျိ ၅-၂-၂-၁၀၈", description: "အတွင်းလူနာနှင့် ကလေးဆေးကုသမှုကို ဖော်ပြထားသော ဆေးခန်းဖြစ်ပါသည်။ ဝန်ဆောင်မှုနှင့် ကြိုတင်ချိန်းဆိုမှုကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-medical-shikada": { name: "ရှီကာဒါ ကိုဒိုမို ကလီနစ်", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ ဟိုရိဖုနေး ၃-၃၈-၃", description: "ကလေးဆေးကုသမှုကို ဖော်ပြထားသော ဆေးခန်းဖြစ်ပါသည်။ ဝန်ဆောင်မှုနှင့် ကြိုတင်ချိန်းဆိုမှုကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-child-akabane-kita": { name: "အကာဘာနေကီတာ ကလေးခန်းမ", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ အကာဘာနေကီတာ ၁-၅-၅", description: "ကလေးခန်းမဖြစ်ပါသည်။ လက်ရှိအစီအစဉ်နှင့် အသုံးပြုခွင့်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-child-kamiya": { name: "ကာမိယာ ကလေးစင်တာ", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ ကာမိယာ ၃-၃၅-၁၇", description: "ကလေးစင်တာဖြစ်ပါသည်။ လက်ရှိအစီအစဉ်နှင့် အသုံးပြုခွင့်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-child-jujodai": { name: "ဂျူဂျိုဒိုင် ကလေးစင်တာ", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ နာကာဂျူဂျို ၁-၂-၁၈", description: "ကလေးစင်တာဖြစ်ပါသည်။ လက်ရှိအစီအစဉ်နှင့် အသုံးပြုခွင့်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-library-central": { name: "ဗဟိုစာကြည့်တိုက်", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ ဂျူဂျိုဒိုင် ၁-၂-၅", description: "ကီတာမြို့နယ်၏ စာကြည့်တိုက်ဖြစ်ပါသည်။" },
  "kita-library-toyoshima": { name: "တိုယိုရှီမာ စာကြည့်တိုက်", municipality: "ကီတာမြို့နယ်", address: "တိုကျို၊ ကီတာမြို့နယ်၊ တိုယိုရှီမာ ၃-၂၇-၂၂၊ တိုယိုရှီမာ နေထိုင်သူစင်တာ ၁ ထပ်", description: "ကီတာမြို့နယ်၏ စာကြည့်တိုက်ဖြစ်ပါသည်။" },
} as const satisfies LocalResourceCatalog;

export const localResourceCatalogs: LocalResourceCatalogByLocale = { ja, en, my };

function assertNonEmpty(value: string, path: string) {
  if (value.trim() === "") throw new Error(`Invalid local resource catalog value at ${path}`);
}

export function assertValidLocalResourceCatalogs(value: unknown): asserts value is LocalResourceCatalogByLocale {
  if (!value || typeof value !== "object") throw new Error("Local resource catalogs must be an object");
  for (const locale of localResourceLocales) {
    const catalog = (value as Partial<LocalResourceCatalogByLocale>)[locale];
    if (!catalog || typeof catalog !== "object") throw new Error(`Missing local resource catalog: ${locale}`);
    for (const id of Object.keys(ja) as LocalResourceId[]) {
      const display = catalog[id];
      if (!display) throw new Error(`Missing local resource display: ${locale}.${id}`);
      for (const [key, entry] of Object.entries(display)) assertNonEmpty(entry, `${locale}.${id}.${key}`);
      if (locale === "en" && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(Object.values(display).join(""))) {
        throw new Error(`Japanese characters found in English local resource display: ${id}`);
      }
    }
  }
}

assertValidLocalResourceCatalogs(localResourceCatalogs);

export function getLocalResourceDisplay(locale: UserLocale, id: LocalResourceId): LocalResourceDisplay {
  return localResourceCatalogs[locale][id];
}
