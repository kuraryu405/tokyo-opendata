import { describe, expect, it } from "vitest";
import {
  actionIds,
  assertValidUserMessages,
  getUserMessages,
  getPublishedUserLocales,
  needKeys,
  reasonCodes,
  reviewedUserLocales,
  selectableUserLocales,
  supportedUserLocales,
  timingKeys,
  userMessages,
  localResourceCatalogs,
  localResourceLocales,
} from "../src/index";
import { localResources } from "@staybridge/data";
import {
  actionNotices,
  actionNoticeLocales,
  assertValidActionNotices,
} from "../src/action-notices";

describe("user message catalogs", () => {
  it("keeps complete non-empty card notices for every selectable locale", () => {
    expect(actionNoticeLocales).toEqual(selectableUserLocales);
    expect(() => assertValidActionNotices(actionNotices)).not.toThrow();
    for (const locale of actionNoticeLocales) {
      expect(Object.keys(actionNotices[locale]).sort()).toEqual([...actionIds].sort());
      expect(Object.values(actionNotices[locale]).every((notice) => notice.trim() !== "")).toBe(true);
    }
  });

  it("exports exactly the supported static locale set", () => {
    expect(supportedUserLocales).toEqual(["ja", "en", "zh-CN", "zh-TW", "ko", "ne", "vi", "my", "fil", "id", "bn", "th"]);
  });

  it("has a complete typed catalog for every current locale", () => {
    for (const locale of supportedUserLocales) {
      const messages = getUserMessages(locale);
      expect(messages.questions).toHaveLength(10);
      expect(Object.keys(messages.actions)).toHaveLength(actionIds.length);
      expect(Object.keys(messages.reasons)).toHaveLength(reasonCodes.length);
      expect(Object.keys(messages.timing)).toHaveLength(timingKeys.length);
      expect(Object.keys(messages.needs)).toHaveLength(needKeys.length);
      expect(messages.metadata.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(messages.metadata.internalReview.status).toBe(reviewedUserLocales.includes(locale) ? "reviewed" : "pending");
      expect(["pending", "reviewed"]).toContain(messages.metadata.expertReview.status);
    }
  });

  it("offers every need, including daily life, in question 09 for all locales", () => {
    for (const locale of supportedUserLocales) {
      const optionValues = getUserMessages(locale).questions[8][2].map(([value]) => value);
      expect(optionValues.toSorted()).toEqual([...needKeys].toSorted());
      expect(new Set(optionValues).size).toBe(needKeys.length);
    }
  });

  it("rejects an inexact locale set and incomplete catalogs at runtime", () => {
    expect(() => assertValidUserMessages({})).toThrow(/exactly match the supported locale set/);
    expect(() => assertValidUserMessages({ ...userMessages, extra: userMessages.en })).toThrow(/exactly match the supported locale set/);
    expect(() => assertValidUserMessages({
      ...userMessages,
      my: { ...userMessages.my, questions: userMessages.my.questions.slice(0, 9) },
    })).toThrow(/Expected 10 questions/);
    expect(() => assertValidUserMessages({
      ...userMessages,
      en: {
        ...userMessages.en,
        actions: {
          ...userMessages.en.actions,
          CHECK_STAY_STATUS: { ...userMessages.en.actions.CHECK_STAY_STATUS, title: "" },
        },
      },
    })).toThrow(/Invalid user catalog value/);
  });

  it("recursively rejects empty UI strings, including nested arrays and records", () => {
    expect(() => assertValidUserMessages({
      ...userMessages,
      en: {
        ...userMessages.en,
        ui: {
          ...userMessages.en.ui,
          previewSteps: [
            { ...userMessages.en.ui.previewSteps[0], detail: "" },
            userMessages.en.ui.previewSteps[1],
            userMessages.en.ui.previewSteps[2],
          ],
        },
      },
    })).toThrow(/en\.ui\.previewSteps\.0\.detail/);
    expect(() => assertValidUserMessages({
      ...userMessages,
      "zh-CN": {
        ...userMessages["zh-CN"],
        ui: {
          ...userMessages["zh-CN"].ui,
          localeOptions: { ...userMessages["zh-CN"].ui.localeOptions, ko: "  " },
        },
      },
    })).toThrow(/zh-CN\.ui\.localeOptions\.ko/);
  });

  it("keeps representative full-flow copy in every locale", () => {
    const representativeCopy = {
      ja: ["今の状況を確認する", "今、東京のどの地域に滞在していますか？", "日本に滞在できる期間を確認する", "予定どおり帰ることが難しいと回答したため、現在の状況を公式窓口で確認する案内を表示しています。", "相談員に見せるサマリー"],
      en: ["Check my situation", "Where are you staying in Tokyo now?", "Confirm how long you can stay", "You said it is difficult to return as planned, so an official check of your current situation is shown.", "Summary to show a support worker"],
      "zh-CN": ["确认我的情况", "你目前住在东京哪个地区？", "确认可以在日本停留多久", "你表示难以按计划回国，因此这里建议通过官方窗口确认当前情况。", "向支援人员出示的摘要"],
      "zh-TW": ["確認我的情況", "你目前住在東京哪個地區？", "確認可以在日本停留多久", "你表示難以按計畫回國，因此這裡建議透過官方窗口確認目前情況。", "向支援人員出示的摘要"],
      ko: ["내 상황 확인하기", "현재 도쿄의 어느 지역에 머물고 있습니까?", "일본에 머물 수 있는 기간 확인", "예정대로 귀국하기 어렵다고 답했으므로 공식 창구에서 현재 상황을 확인하도록 안내합니다.", "지원 담당자에게 보여 줄 요약"],
      ne: ["मेरो अवस्था जाँच्नुहोस्", "तपाईं अहिले टोकियोको कुन क्षेत्रमा बसिरहनुभएको छ?", "तपाईं कति समय बस्न सक्नुहुन्छ पुष्टि गर्नुहोस्", "तपाईंले योजना अनुसार फर्कन गाह्रो भएको बताउनुभयो, त्यसैले तपाईंको हालको अवस्था आधिकारिक सेवासँग जाँच्ने सुझाव देखाइएको छ।", "सहायता कर्मचारीलाई देखाउने सारांश"],
      vi: ["Kiểm tra tình hình của tôi", "Hiện bạn đang ở khu vực nào của Tokyo?", "Kiểm tra thời gian bạn có thể ở Nhật Bản", "Hướng dẫn xác nhận tình hình hiện tại với cơ quan chính thức được hiển thị vì bạn cho biết khó trở về theo kế hoạch.", "Bản tóm tắt để trình cho nhân viên hỗ trợ"],
      my: ["လက်ရှိအခြေအနေ စစ်ဆေးရန်", "ယခု တိုကျို၏ မည်သည့်ဒေသတွင် နေပါသလဲ။", "ဂျပန်တွင် နေနိုင်မည့်ကာလ စစ်ဆေးရန်", "စီစဉ်ထားသလို ပြန်ရန်ခက်ခဲသည်ဟု ဖြေထားသောကြောင့် လက်ရှိအခြေအနေကို တရားဝင်ဌာနတွင် စစ်ဆေးရန် ပြထားပါသည်။", "ကူညီသူအား ပြရန် အကျဉ်းချုပ်"],
      fil: ["Suriin ang aking sitwasyon", "Saang lugar sa Tokyo ka kasalukuyang nananatili?", "Kumpirmahin ang panahong maaari kang manatili sa Japan", "Ipinapakita ang gabay na kumpirmahin ang kasalukuyan mong sitwasyon sa opisyal na tanggapan dahil sumagot kang mahirap umuwi ayon sa plano.", "Buod na ipapakita sa tagapagbigay-suporta"],
      id: ["Periksa situasi saya", "Di wilayah mana di Tokyo Anda sedang tinggal?", "Konfirmasikan jangka waktu Anda dapat tinggal di Jepang", "Panduan untuk mengonfirmasikan situasi saat ini kepada kantor resmi ditampilkan karena Anda menjawab sulit pulang sesuai rencana.", "Ringkasan untuk ditunjukkan kepada petugas pendukung"],
      bn: ["আমার পরিস্থিতি যাচাই করুন", "আপনি এখন টোকিওর কোন এলাকায় আছেন?", "আপনি কত দিন থাকতে পারবেন নিশ্চিত করুন", "আপনি বলেছেন পরিকল্পনা অনুযায়ী ফেরা কঠিন, তাই সরকারি সেবার সঙ্গে আপনার বর্তমান অবস্থা যাচাই করার পরামর্শ দেখানো হয়েছে।", "সহায়তা কর্মীকে দেখানোর সারাংশ"],
      th: ["ตรวจสอบสถานการณ์ของฉัน", "ขณะนี้คุณพักอยู่ในพื้นที่ใดของโตเกียว?", "ตรวจสอบระยะเวลาที่คุณสามารถอยู่ในญี่ปุ่น", "แสดงคำแนะนำให้ยืนยันสถานการณ์ปัจจุบันกับหน่วยงานทางการ เพราะคุณตอบว่ากลับตามแผนได้ยาก.", "สรุปเพื่อแสดงให้ผู้ให้ความช่วยเหลือดู"],
    } as const;

    for (const locale of supportedUserLocales) {
      const messages = getUserMessages(locale);
      expect([
        messages.ui.start,
        messages.questions[0][0],
        messages.actions.CHECK_STAY_STATUS.title,
        messages.reasons.RETURN_DIFFICULT,
        messages.ui.summaryTitle,
      ]).toEqual(representativeCopy[locale]);
    }
  });

  it("has a non-empty display value for every resource ID in every locale", () => {
    for (const locale of localResourceLocales) {
      const catalog = localResourceCatalogs[locale];
      expect(Object.keys(catalog)).toHaveLength(localResources.length);
      expect(Object.keys(catalog).sort()).toEqual(localResources.map((resource) => resource.id).sort());
      for (const resource of localResources) {
        const display = catalog[resource.id];
        expect(display.description.trim()).not.toBe("");
      }
    }
  });

  it("does not leave Japanese characters in the English local resource catalog", () => {
    for (const display of Object.values(localResourceCatalogs.en)) {
      expect(Object.values(display).join("")).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
    }
  });
  it.each(["zh-CN", "zh-TW", "ko", "ne", "vi", "fil", "id", "bn", "th"] as const)("keeps draft metadata truthful and %s unselectable", (locale) => {
    const metadata = getUserMessages(locale).metadata;
    expect(metadata.contentStatus).toBe("draft");
    expect(metadata.internalReview.status).toBe("pending");
    expect(["pending", "reviewed"]).toContain(metadata.expertReview.status);
    expect(selectableUserLocales).not.toContain(locale);
  });

  it.each(reviewedUserLocales)("keeps reviewed metadata complete for %s", (locale) => {
    const metadata = getUserMessages(locale).metadata;
    expect(metadata.contentStatus).toBe("reviewed");
    expect(metadata.internalReview.status).toBe("reviewed");
    expect(metadata.expertReview.status).toBe("pending");
    expect(reviewedUserLocales).toContain(locale);
    expect(metadata.internalReview.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(metadata.internalReview.reviewedBy).not.toBe("");
  });

  it("only exposes the explicitly selectable preview locales", () => {
    expect(selectableUserLocales).toEqual(reviewedUserLocales);
    expect(selectableUserLocales.every((locale) => getUserMessages(locale).metadata.contentStatus === "reviewed")).toBe(true);
  });

  it("rejects fake review metadata and incorrect review status", () => {
    expect(() => assertValidUserMessages({
      ...userMessages,
      ne: { ...userMessages.ne, metadata: { ...userMessages.ne.metadata, internalReview: { status: "reviewed", reviewedAt: "2026-08-22", reviewedBy: "Unverified reviewer" } } },
    })).toThrow(/Invalid internalReview review status at ne\.metadata/);
    expect(() => assertValidUserMessages({
      ...userMessages,
      ko: { ...userMessages.ko, metadata: { ...userMessages.ko.metadata, internalReview: { status: "reviewed", reviewedAt: "2026-08-22", reviewedBy: "Unverified reviewer" } } },
    })).toThrow(/Invalid internalReview review status at ko\.metadata/);
  });

  it("accepts an expert-reviewed transition without treating preview as publication", () => {
    const expertReviewed = {
      ...userMessages,
      en: {
        ...userMessages.en,
        metadata: {
          ...userMessages.en.metadata,
          expertReview: { status: "reviewed" as const, reviewedAt: "2026-08-23", reviewedBy: "Expert reviewer" },
        },
      },
    };

    expect(() => assertValidUserMessages(expertReviewed)).not.toThrow();
    expect(getPublishedUserLocales(expertReviewed)).toEqual(["en"]);
    expect(selectableUserLocales).toEqual(["ja", "en", "my"]);
  });
});
