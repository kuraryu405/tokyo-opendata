import type { Metadata } from "next";
import { CrisisView } from "../src/components/CrisisView";

export const metadata: Metadata = {
  title: "支援準備の確認",
  description: "地域の支援準備に役立つ公開情報と確認事項を整理します。",
};

export default function CrisisPage() {
  return <CrisisView />;
}
