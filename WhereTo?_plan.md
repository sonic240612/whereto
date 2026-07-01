# [상세 기획서 v2] 결정 장애 해결을 위한 랜덤 장소 추천 서비스: 어디가 (WhereTo?)

## 1. 프로젝트 개요
- **서비스명**: 어디가 (WhereTo?)
- **슬로건**: "고민은 그만, 이제 운명에 몸을 맡기세요!"
- **핵심 가치**: 결정의 단순화, 우연한 발견, 일상의 모험, 즉흥성
- **타겟 사용자**: 점심/약속 장소 결정에 10분 이상 소요하는 20-40대, 새로운 장소 탐험을 원하는 사람
- **핵심 지표**:
  - 재추첨률 (다시 뽑기 사용 비율)
  - 길찾기 전환율 (랜덤 좌표 → 네비게이션 앱 클릭)
  - 도착 인증률 (실제 방문까지 이어지는 비율)

---

## 2. 핵심 사용자 경험 (User Journey)

### 2.1. 범위 설정 — 탐색 구역 지정하기
1. **지도 접속**: 웹사이트 접속 시 현재 사용자의 위치(+ 위치 권한 요청)를 중심으로 한 지도가 표시됩니다.
2. **구역 드래그**: 사용자가 지도 위에 **사각형 탐색 구역**을 드래그하여 지정합니다.
3. **범위 확정**: 드래그를 마치면 반투명 강조 표시와 함께 좌상단/우하단 좌표가 확정됩니다.
4. **범위 재설정**: 언제든지 새로 드래그하여 범위를 변경할 수 있습니다.

### 2.2. 좌표 추출 — 운명의 지점 결정하기
1. **랜덤 버튼 클릭**: 하단 '운명의 좌표 뽑기' 버튼을 누릅니다.
2. **무작위 추출**: 사각형 범위 내 완전한 무작위 위도/경도 좌표를 계산합니다.
3. **육지 검증**: 역지오코딩으로 좌표가 육지인지 확인합니다. 바다/강일 경우 자동 재추첨(최대 10회).
4. **시각적 연출**: 핀이 빠르게 움직이다가 멈추는 애니메이션.
5. **추가 정보 표시**: 좌표 근처의 대표 장소명/주소를 역지오코딩으로 표시.
6. **재추첨**: 결과가 마음에 들지 않으면 '다시 뽑기' 가능.

### 2.3. 이동 및 완결 — 모험 떠나기
1. **길찾기 연결**: 구글맵/카카오맵/네이버 지도 선택 → 딥링크로 즉시 경로 안내.
2. **공유**: "친구에게 운명의 장소 보내기" → 카카오톡/링크 공유.
3. **도착 인증**: 해당 좌표 도착 후 '도착 완료' 버튼 → 사진 + 소감 남기기 (자체 인증 방식, GPS 검증은 선택).

---

## 3. 기술 스택 (확정)

| 레이어 | 기술 | 선택 이유 |
|--------|------|----------|
| **Frontend** | React + TypeScript + Vite | 빠른 빌드, 풍부한 생태계 |
| **Map API** | Kakao Maps API | 한국 시장 최적, 무료 티어 우수 |
| **Styling** | Tailwind CSS | 빠른 프로토타이핑, 유지보수 용이 |
| **State** | Zustand | 경량, 간결한 API |
| **Routing** | React Router v6 | SPA 라우팅 |
| **Backend** | Node.js + Express + TypeScript | FE와 언어 통일, 가벼움 |
| **ORM** | Prisma | 타입 안정성, 마이그레이션 자동화 |
| **DB** | PostgreSQL + PostGIS | 지리적 쿼리 지원 |
| **Image** | Cloudinary (S3 대체) | 이미지 최적화, CDN 내장 |
| **Mobile** | PWA (Service Worker + Manifest) | 별도 앱 스토어 없이 설치형 앱 |
| **Deploy** | Vercel (FE) + Railway (BE + DB) | 간편 배포, 무료 티어 충분 |
| **Test** | Vitest + React Testing Library + Playwright | Vite 통합, E2E 지원 |
| **Lint** | ESLint + Prettier | 코드 일관성 |
| **CI/CD** | GitHub Actions | PR 자동 테스트 + 배포 |

---

## 4. 시스템 아키텍처

```
┌─────────────────────────────────────────────────┐
│                Browser (PWA)                     │
│                                                   │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Kakao Map   │  │ Zustand  │  │ Service     │ │
│  │ (Drawing+   │  │ (Range,  │  │ Worker      │ │
│  │  Marker)    │  │  Coords) │  │ (Cache)     │ │
│  └─────────────┘  └──────────┘  └─────────────┘ │
│                                                   │
│  ┌──────────────────────────────────────────────┐│
│  │  RandomCoord Generator (Client-side)         ││
│  │  → min/max Lat/Lon → Random → Land Check    ││
│  └──────────────────────────────────────────────┘│
└──────────────────────┬──────────────────────────┘
                       │ REST API
                       ▼
┌─────────────────────────────────────────────────┐
│          Express + TypeScript Backend            │
│                                                   │
│  POST /api/visits     ── 방문 인증 생성            │
│  GET  /api/visits     ── 갤러리 목록               │
│  GET  /api/visits/:id ── 개별 방문 기록            │
│  POST /api/share      ── 공유 링크 생성            │
│  GET  /api/share/:token ── 공유된 좌표 조회        │
└──────────────────────┬──────────────────────────┘
                       │ Prisma
                       ▼
┌─────────────────────────────────────────────────┐
│     PostgreSQL + PostGIS                         │
│                                                   │
│  visits: id, lat, lng, address, photo_url,      │
│          comment, created_at                     │
│  shares: id, lat, lng, token, created_at         │
└─────────────────────────────────────────────────┘
```

**핵심 결정 — 랜덤 좌표 생성은 Client-side**:
- 이유: 서버 요청 불필요 → 지연 시간 0, 서버 부하 없음, 오프라인에서도 동작
- 육지 검증만 Kakao Maps의 역지오코딩 API 활용 (Client-side Key)

---

## 5. 상세 기능 명세

### 5.1. 랜덤 좌표 생성 알고리즘

```
Input:  rectLatMin, rectLatMax, rectLngMin, rectLngMax
Output: { lat: number, lng: number, address: string }

1. do {
2.   randomLat = rectLatMin + (rectLatMax - rectLatMin) * Math.random()
3.   randomLng = rectLngMin + (rectLngMax - rectLngMin) * Math.random()
4.   address = await reverseGeocode(randomLat, randomLng)
5. } while (address === '바다' || address === '강' || address === '호수')  // 최대 10회
6. return { lat: randomLat, lng: randomLng, address }
```

- 역지오코딩 결과가 바다/강/호수일 경우 최대 10회 재추첨
- 10회 초과 시 현재 좌표로 반환 (무한 루프 방지)

### 5.2. 주요 화면 구성

#### 화면 A: 메인 지도 (기본)
```
┌──────────────────────────────────┐
│ [현위치] [확대] [축소] [레이어]  │ ← 상단 컨트롤
│                                  │
│                                  │
│           (지도 전체 화면)        │
│                                  │
│                                  │
│                                  │
│                                  │
│        ┌──────────────────┐      │
│        │ 운명의 좌표 뽑기  │      │ ← FAB (하단 중앙)
│        └──────────────────┘      │
│  [갤러리]              [내 기록] │ ← 하단 바
└──────────────────────────────────┘
```

#### 화면 B: 구역 설정 모드
```
┌──────────────────────────────────┐
│  ← 취소     탐색 범위 지정하기    │
├──────────────────────────────────┤
│                                  │
│    ┌────────────────────────┐   │
│    │                        │   │
│    │   (반투명 사각형)       │   │
│    │                        │   │
│    └────────────────────────┘   │
│                                  │
│                                  │
│                                  │
│        ┌──────────────────┐      │
│        │ 이 범위에서 뽑기  │      │
│        └──────────────────┘      │
└──────────────────────────────────┘
```

#### 화면 C: 결과 화면
```
┌──────────────────────────────────┐
│                                  │
│         ★ (핀, 애니메이션)       │
│                                  │
│        "서울시 강남구 역삼동"     │
│                                  │
│   ┌──────────┐ ┌──────────┐     │
│   │ 다시 뽑기 │ │ 길찾기    │     │
│   └──────────┘ └──────────┘     │
│   ┌──────────────────────┐      │
│   │ 📤 친구에게 공유      │      │
│   └──────────────────────┘      │
└──────────────────────────────────┘
```

### 5.3. 네비게이션 딥링크

| 앱 | 딥링크 형식 |
|----|-----------|
| **카카오맵** | `kakaomap://route?sp=&ep=${lat},${lng}&by=FOOT` |
| **네이버 지도** | `nmap://route/walk?dlat=${lat}&dlng=${lng}&dname=운명의+장소` |
| **구글 맵** | `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` |
| **애플 지도** | `https://maps.apple.com/?daddr=${lat},${lng}` |
| **T맵** | `tmap://route?goalx=${lng}&goaly=${lat}` |

→ 사용자 OS(iOS/Android) 및 설치된 앱 감지하여 순서대로 fallback

### 5.4. 도착 인증 정책

- **Phase 1 (MVP)**: 자체 인증 — 사용자가 '도착 완료' 버튼을 직접 누름, GPS 검증 없음
- **Phase 2 (고도화)**: GPS 검증 추가 — 사용자 현재 위치와 목표 좌표 간 거리 200m 이내일 때만 인증 가능

---

## 6. 데이터 모델

### 6.1. Visit (방문 기록)

```prisma
model Visit {
  id        String   @id @default(uuid()) @db.Uuid
  lat       Float
  lng       Float
  address   String                 // 역지오코딩된 주소
  photoUrl  String?                // Cloudinary URL
  photoId   String?                // Cloudinary Public ID (삭제용)
  comment   String?   @db.VarChar(500)
  createdAt DateTime @default(now())
}
```

### 6.2. Share (공유)

```prisma
model Share {
  id        String   @id @default(uuid()) @db.Uuid
  lat       Float
  lng       Float
  address   String
  token     String   @unique        // 8자리 랜덤 토큰 (nanoid)
  createdAt DateTime @default(now())
}
```

---

## 7. 프로젝트 구조

```
whereto/
├── frontend/                    # Vite + React
│   ├── public/
│   │   ├── manifest.json        # PWA manifest
│   │   ├── icons/               # PWA icons
│   │   └── sw.js                # Service Worker
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   │   ├── Home.tsx         # 메인 지도 화면
│   │   │   ├── Result.tsx       # 결과 화면
│   │   │   ├── Gallery.tsx      # 운명의 갤러리
│   │   │   └── Share.tsx        # 공유된 좌표 조회
│   │   ├── components/
│   │   │   ├── MapView.tsx      # Kakao Map 래퍼
│   │   │   ├── RangeSelector.tsx # 사각형 드로잉
│   │   │   ├── ResultPin.tsx    # 핀 애니메이션
│   │   │   ├── NavLinks.tsx     # 네비게이션 딥링크
│   │   │   ├── FabButton.tsx    # 하단 FAB
│   │   │   └── VisitForm.tsx    # 도착 인증 폼
│   │   ├── lib/
│   │   │   ├── random.ts        # 랜덤 좌표 생성
│   │   │   ├── geocode.ts       # 역지오코딩
│   │   │   ├── deeplink.ts      # 딥링크 유틸
│   │   │   └── api.ts           # API 클라이언트
│   │   ├── store/
│   │   │   └── useStore.ts      # Zustand store
│   │   └── types/
│   │       └── index.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                     # Express + TypeScript
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── visits.ts
│   │   │   └── shares.ts
│   │   ├── lib/
│   │   │   └── prisma.ts
│   │   └── types/
│   │       └── index.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── tsconfig.json
│   └── package.json
│
└── WhereTo?_plan.md             # 본 기획서
```

---

## 8. 단계별 로드맵

### Phase 1 — Core MVP (예상: 7~10일)

| 작업 | 내용 | 비고 |
|------|------|------|
| 프로젝트 초기화 | Vite + React + TS + Tailwind + ESLint 설정 | 1일 |
| Kakao Maps 연동 | MapView 컴포넌트, 현재 위치 마크 | 1일 |
| 사각형 드로잉 | RangeSelector 드래그로 범위 지정 | 1.5일 |
| 랜덤 좌표 생성 | RandomCoordGenerator + 육지 검증 | 1일 |
| 핀 애니메이션 | ResultPin 마커 애니메이션 효과 (CSS/Map) | 1일 |
| 결과 화면 UI | 주소 표시 + 다시 뽑기 + 길찾기 버튼 | 1일 |
| 네비게이션 딥링크 | 앱별 딥링크 + fallback 처리 | 0.5일 |
| 배포 | Vercel 배포, 카카오맵 API 도메인 등록 | 1일 |

### Phase 2 — Backend + 도착 인증 (예상: 5~7일)

| 작업 | 내용 |
|------|------|
| Express + Prisma + PostgreSQL 설정 | Railway 배포 포함 |
| 방문 인증 API (CRUD) | 이미지 업로드 Cloudinary 연동 |
| VisitForm UI | 사진 업로드 + 소감 입력 |
| 운명의 갤러리 | 방문 기록 무한 스크롤 피드 |
| GPS 검증 (선택) | 현재 위치와 목표 좌표 거리 계산 |

### Phase 3 — 고도화 (예상: 4~5일)

| 작업 | 내용 |
|------|------|
| 공유 기능 | nanoid 토큰 생성, 공유 페이지, OG 태그 |
| PWA | manifest.json, Service Worker, 설치 배너 |
| 반응형 최적화 | 모바일 퍼스트 QA |
| GitHub Actions | PR 테스트 + 자동 배포 |
| 카카오톡 공유 | Kakao SDK Share API (선택) |

---

## 9. 에러 처리 및 엣지 케이스

| 상황 | 처리 |
|------|------|
| 위치 권한 거부 | 기본 좌표 (서울 시청)로 fallback, 수동 이동 유도 |
| 사각형이 너무 작음 | 100m × 100m 이하일 경우 경고 표시 |
| 사각형이 너무 큼 | 50km × 50km 이상일 경우 확인 요청 |
| 육지 검증 10회 초과 | 현재 좌표 반환 + "바다 근처입니다" 안내 |
| Kakao Maps 로드 실패 | 로딩 스켈레톤 + 재시도 버튼 |
| 이미지 업로드 실패 | 텍스트만 저장, 사진은 나중에 업로드 가능 |
| 딥링크 미지원 앱 | 웹 URL fallback → 브라우저에서 지도 열기 |
| 오프라인 | PWA 캐시된 지도 타일 + 로컬 스토리지에 마지막 결과 저장 |

---

## 10. 디자인 가이드라인 (초안)

- **컬러**:
  - Primary: `#FF6B6B` (코랄 레드 — 운명/모험 느낌)
  - Secondary: `#4ECDC4` (민트 — 지도/자연)
  - Background: `#FFFFFF` / `#F8F9FA`
  - Text: `#2D3436`
- **타이포그래피**: Pretendard (한글), system-ui fallback
- **아이콘**: Lucide React (오픈소스, 일관성)
- **애니메이션**: Framer Motion (핀 드롭, 페이지 전환)
- **레이아웃**: 모바일 퍼스트 (375px ~ 1440px 반응형)
