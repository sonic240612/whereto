# 어디가? (WhereTo?)

결정 장애 해결을 위한 랜덤 장소 추천 서비스.  
지도에서 범위를 지정하면 그 안에서 무작위 좌표를 뽑아줍니다.

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | React 19 + TypeScript + Vite 8 |
| Map | Leaflet + OpenStreetMap |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| DB | SQLite (dev) |

## 시작하기

```bash
cd frontend
npm install
npm run dev
```

백엔드 실행:

```bash
cd backend
npm install
npx prisma db push
npm run dev
```

## 라이선스

MIT
