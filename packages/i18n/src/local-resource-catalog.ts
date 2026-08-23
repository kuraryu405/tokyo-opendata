import type { LocalResourceId } from "@staybridge/data";

export const localResourceLocales = ["ja", "en", "my"] as const;
export type LocalResourceLocale = (typeof localResourceLocales)[number];

/** UI-only safety copy. Names, municipalities, and addresses come from Open Data. */
export type LocalResourceDisplay = { description: string };
export type LocalResourceCatalog = Record<LocalResourceId, LocalResourceDisplay>;
export type LocalResourceCatalogByLocale = Record<LocalResourceLocale, LocalResourceCatalog>;

const ja = {
  "kita-school-toyokawa": { description: "学校です。利用に関する詳細は直接確認してください。" },
  "kita-school-ukima": { description: "学校です。利用に関する詳細は直接確認してください。" },
  "kita-school-jujodai": { description: "学校です。利用に関する詳細は直接確認してください。" },
  "kita-school-nishigaoka": { description: "学校です。利用に関する詳細は直接確認してください。" },
  "kita-medical-oji-kids": { description: "医療機関です。診療内容と予約の必要性は直接確認してください。" },
  "kita-medical-kominato": { description: "医療機関です。診療内容と予約の必要性は直接確認してください。" },
  "kita-medical-shikada": { description: "医療機関です。診療内容と予約の必要性は直接確認してください。" },
  "kita-child-akabane-kita": { description: "子ども向け施設です。現在のプログラムと利用条件は直接確認してください。" },
  "kita-child-kamiya": { description: "子ども向け施設です。現在のプログラムと利用条件は直接確認してください。" },
  "kita-child-jujodai": { description: "子ども向け施設です。現在のプログラムと利用条件は直接確認してください。" },
  "kita-public-akabane-hall": { description: "公共施設です。利用条件と現在のサービスは直接確認してください。" },
  "kita-public-hokutopia": { description: "公共施設です。利用条件と現在のサービスは直接確認してください。" },
} as const satisfies LocalResourceCatalog;

const en = {
  "kita-school-toyokawa": { description: "A school. Confirm current access and details directly." },
  "kita-school-ukima": { description: "A school. Confirm current access and details directly." },
  "kita-school-jujodai": { description: "A school. Confirm current access and details directly." },
  "kita-school-nishigaoka": { description: "A school. Confirm current access and details directly." },
  "kita-medical-oji-kids": { description: "A medical institution. Confirm services and appointment requirements directly." },
  "kita-medical-kominato": { description: "A medical institution. Confirm services and appointment requirements directly." },
  "kita-medical-shikada": { description: "A medical institution. Confirm services and appointment requirements directly." },
  "kita-child-akabane-kita": { description: "A child-focused facility. Confirm current programmes and eligibility directly." },
  "kita-child-kamiya": { description: "A child-focused facility. Confirm current programmes and eligibility directly." },
  "kita-child-jujodai": { description: "A child-focused facility. Confirm current programmes and eligibility directly." },
  "kita-public-akabane-hall": { description: "A public facility. Confirm current access and services directly." },
  "kita-public-hokutopia": { description: "A public facility. Confirm current access and services directly." },
} as const satisfies LocalResourceCatalog;

const my = {
  "kita-school-toyokawa": { description: "ကျောင်းဖြစ်ပါသည်။ လက်ရှိအသုံးပြုမှုနှင့် အသေးစိတ်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-school-ukima": { description: "ကျောင်းဖြစ်ပါသည်။ လက်ရှိအသုံးပြုမှုနှင့် အသေးစိတ်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-school-jujodai": { description: "ကျောင်းဖြစ်ပါသည်။ လက်ရှိအသုံးပြုမှုနှင့် အသေးစိတ်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-school-nishigaoka": { description: "ကျောင်းဖြစ်ပါသည်။ လက်ရှိအသုံးပြုမှုနှင့် အသေးစိတ်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-medical-oji-kids": { description: "ဆေးဘက်ဆိုင်ရာအဖွဲ့အစည်းဖြစ်ပါသည်။ ဝန်ဆောင်မှုနှင့် ကြိုတင်ချိန်းဆိုမှုကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-medical-kominato": { description: "ဆေးဘက်ဆိုင်ရာအဖွဲ့အစည်းဖြစ်ပါသည်။ ဝန်ဆောင်မှုနှင့် ကြိုတင်ချိန်းဆိုမှုကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-medical-shikada": { description: "ဆေးဘက်ဆိုင်ရာအဖွဲ့အစည်းဖြစ်ပါသည်။ ဝန်ဆောင်မှုနှင့် ကြိုတင်ချိန်းဆိုမှုကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-child-akabane-kita": { description: "ကလေးများအတွက် အဆောက်အအုံဖြစ်ပါသည်။ လက်ရှိအစီအစဉ်နှင့် အသုံးပြုခွင့်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-child-kamiya": { description: "ကလေးများအတွက် အဆောက်အအုံဖြစ်ပါသည်။ လက်ရှိအစီအစဉ်နှင့် အသုံးပြုခွင့်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-child-jujodai": { description: "ကလေးများအတွက် အဆောက်အအုံဖြစ်ပါသည်။ လက်ရှိအစီအစဉ်နှင့် အသုံးပြုခွင့်ကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-public-akabane-hall": { description: "အများပြည်သူသုံး အဆောက်အအုံဖြစ်ပါသည်။ လက်ရှိအသုံးပြုမှုနှင့် ဝန်ဆောင်မှုကို တိုက်ရိုက်အတည်ပြုပါ။" },
  "kita-public-hokutopia": { description: "အများပြည်သူသုံး အဆောက်အအုံဖြစ်ပါသည်။ လက်ရှိအသုံးပြုမှုနှင့် ဝန်ဆောင်မှုကို တိုက်ရိုက်အတည်ပြုပါ။" },
} as const satisfies LocalResourceCatalog;

export const localResourceCatalogs: LocalResourceCatalogByLocale = { ja, en, my };

export function assertValidLocalResourceCatalogs(value: unknown): asserts value is LocalResourceCatalogByLocale {
  if (!value || typeof value !== "object") throw new Error("Local resource catalogs must be an object");
  for (const locale of localResourceLocales) {
    const catalog = (value as Partial<LocalResourceCatalogByLocale>)[locale];
    if (!catalog || typeof catalog !== "object") throw new Error(`Missing local resource catalog: ${locale}`);
    for (const id of Object.keys(ja) as LocalResourceId[]) {
      const display = catalog[id];
      if (!display || typeof display.description !== "string" || display.description.trim() === "") throw new Error(`Invalid local resource display: ${locale}.${id}`);
      if (locale === "en" && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(display.description)) throw new Error(`Japanese characters found in English local resource display: ${id}`);
    }
  }
}

export function getLocalResourceDisplay(locale: LocalResourceLocale, id: LocalResourceId): LocalResourceDisplay {
  const display = localResourceCatalogs[locale][id];
  if (!display) throw new Error(`Missing local resource display: ${locale}.${id}`);
  return display;
}
