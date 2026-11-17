# AIPM 복습 노트 · 디자인 시스템 (요약 v0.3)

> 전체 버전은 클로드 아티팩트 "AIPM 복습 노트 디자인 시스템 v0.2": https://claude.ai/artifact/45x4Hrs9FNvg4F2b5ihDYx

## 원칙
1. 글꼴은 Pretendard 하나. 줄 간격 1.8, `word-break: keep-all`. 전체 글씨는 `html{font-size:85%}` 기준이라 아래 px 값은 설계값(실제 화면은 85%). 결정 #20.
2. 형광펜이 유일한 장식. 글자 아래쪽 절반만 칠하고 한 화면에 3곳 안팎.
3. 배경은 은은한 파스텔 그라디언트 (연한 노랑 → 분홍 → 하늘 → 민트). 점무늬 금지.
4. 누르는 것은 높이 44px 이상. 공개/나만보기는 색과 글자를 함께.

## 색
| 이름 | 값 | 쓰임 |
|---|---|---|
| bg | #fffdf8 | 페이지 바탕 |
| ink / ink-2 / ink-3 | #1a1a1a / #444444 / #6b6b6b | 글자 (진함 → 약함) |
| line | #ece7d9 | 구분선, 테두리 |
| yellow | #ffe66d | 핵심 형광펜 |
| mint | #b8f0d0 | 해결 방법, 실습 메모 |
| pink | #ffc9dd | 헷갈린 포인트 |
| sky | #c6e2ff | 보조 강조 |
| public-bg / public-ink | #dcfce7 / #166534 | 공개 배지 |
| private-bg / private-ink | #fef3c7 / #92400e | 나만보기 배지 |
| danger | #b42318 | 삭제 |

## 글자 크기
설계값(실제 화면은 85%): display 42px(800), title 34px(800), heading 24px(700), body-lg 18px, body 17px, small 15px(500), caption 13px(700)

## 간격과 모서리
간격 4 · 8 · 12 · 16 · 24 · 32 · 48px. 모서리 sm 6 · md 10 · lg 16 · pill 999px.

## 형광펜 CSS
`background: linear-gradient(transparent 45%, #ffe66d 45%, #ffe66d 92%, transparent 92%);`

## 컴포넌트 (v0.2, 공용 클래스 `bundle.css`)
`btn` `badge` `tag` `mark`(형광펜) `card`(글 카드) `note`(포스트잇) `quote` `code` `field`(입력) `tabs`. 사용법과 미리보기는 아티팩트 링크 참고.

## 접근성
글자와 배경 대비 4.5:1 이상. 가장 낮은 조합이 `ink-3` / `bg` 5.2. 공개/나만보기는 색과 글자를 함께 쓴다. 오류는 색과 문구를 함께 보여 준다.
