import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tabify — 기타 타브 변환",
  description: "짧은 기타 음원에서 타브 악보와 코드 운지를 확인하는 기타 연습 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
