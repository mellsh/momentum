import './globals.css';

export const metadata = {
  title: 'Momentum — 습관 트래커',
  description: '캘린더와 연동하고, 연속 성공 일수로 습관을 이어 가세요.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
