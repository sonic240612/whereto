# 어디가? (WhereTo?)

🚀 **배포 링크:** [https://whereto-swart.vercel.app](https://whereto-swart.vercel.app)

결정 장애 해결을 위한 랜덤 장소 추천 서비스.  
지도에서 범위를 지정하면 그 안에서 무작위 좌표를 뽑아줍니다.

## ✨ 주요 기능
- **범위 지정 랜덤 추천:** 지도에서 영역을 드래그하여 그 안의 무작위 장소를 추천받습니다.
- **모바일 지원:** 터치 드래그를 통한 범위 지정 기능을 지원합니다.
- **길찾기 연동:** 추천된 장소로 Google Maps 및 Apple Maps 길찾기 링크를 제공합니다.
- **방문 기록 저장:** 추천받은 장소를 저장하고 갤러리에서 확인할 수 있습니다. (현재 로컬 저장소 방식)

## 🛠 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | React 19 + TypeScript + Vite 8 |
| Map | Leaflet + OpenStreetMap (CartoDB Voyager) |
| Styling | Tailwind CSS v4 |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| DB | PostgreSQL (Vercel Postgres / Neon) |
| Deployment | Vercel |

## 🚀 시작하기

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
npm install
npx prisma db push
npm run dev
```

## 📄 라이선스

MIT
