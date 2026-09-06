import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "찌라시체크 — 리딩방·SNS 주식 메시지 공시 검증";
const DESC =
  "리딩방·오픈채팅·SNS에서 받은 주식 메시지를 붙여넣으면 금융감독원 소비자경보 기준 사기 수법 일치 여부와 DART 공시 근거를 알려드립니다.";

export const metadata: Metadata = {
  metadataBase: new URL("https://dartcheacker.vercel.app"),
  title: TITLE,
  description: DESC,
  openGraph: { title: TITLE, description: DESC, siteName: "찌라시체크", type: "website", locale: "ko_KR", url: "/" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0B0F19" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
