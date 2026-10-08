# WhereTo backend

현재 프론트엔드의 방문 기록은 브라우저의 로컬 저장소를 사용합니다. 이 서버는 선택 사항이며 사용자 계정이나 기기 간 동기화를 제공하지 않습니다. DB API는 기본적으로 `503`을 반환하고, `/api/health`는 DB 없이 동작합니다.

## 로컬 실행

Node.js 22.12 이상에서 다음을 실행합니다.

```powershell
npm ci
Copy-Item .env.example .env
npm run db:generate
npm run dev
```

`http://localhost:3001/api/health`에서 상태를 확인합니다. 빌드는 `npm run build`, 빌드 결과 실행은 `npm start`, 검증은 `npm test`와 `npm run typecheck`입니다. 로컬 실행은 `.env`를 자동으로 읽습니다.

## 운영자 전용 DB API

DB를 사용하려면 `DATABASE_URL`, `ENABLE_VISIT_API=true`, 32자 이상의 무작위 `SERVER_API_TOKEN`을 서버 환경에 설정해야 합니다. 예를 들어 `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`로 비밀 값을 생성할 수 있습니다. 이 토큰은 서버 운영자 전용입니다. 프론트엔드 환경변수, 번들, 공유 링크에 넣지 마세요.

방문 API 전체와 공유 생성·취소에는 `Authorization: Bearer <SERVER_API_TOKEN>` 헤더가 필요합니다. 이는 사용자별 인증이나 소유권 분리가 아닙니다. 여러 최종 사용자의 기록을 서버에 저장하려면 별도 사용자 인증 및 사용자별 DB 권한을 먼저 구현해야 합니다.

| 경로 | 동작 |
| --- | --- |
| `GET /api/health` | DB 연결 없이 상태 확인 |
| `GET /api/visits` | 운영자 인증, 최근 50건 조회 |
| `GET /api/visits/:id` | 운영자 인증, 기록 조회 |
| `POST /api/visits` | 운영자 인증, 기록 생성 |
| `DELETE /api/visits/:id` | 운영자 인증, 기록 삭제 |
| `POST /api/shares` | 운영자 인증, 192비트 무작위 공유 토큰 생성 |
| `GET /api/shares/:token` | API 활성화 시 토큰을 아는 사람에게 좌표·주소 공개 |
| `DELETE /api/shares/:token` | 운영자 인증, 공유 즉시 취소 |

공유는 생성 후 7일에 만료됩니다. 만료한 행은 DB에 남아 있으나 읽을 수 없고 운영자가 삭제할 수 있습니다. 이전의 짧은 비보안 토큰은 더 이상 조회되지 않습니다. 이 만료·취소는 서버 공유 API에 적용되며, 현재 프론트엔드가 사용하는 좌표 포함 URL에는 적용되지 않습니다.

`POST`는 `application/json`과 최대 32 KB 본문을 받습니다. 좌표는 유한한 숫자이며 위도 -90~90, 경도 -180~180입니다. 0 좌표도 허용합니다. 주소는 1~1,000자, 평점은 1~5 정수(기본 3), 이름 120자, 메모 5,000자, 사진 ID 200자, HTTPS 사진 URL 2,048자로 제한합니다. 사진 업로드 API는 제공하지 않습니다.

## DB 마이그레이션

새 DB에는 `npm run db:deploy`로 체크인된 초기 마이그레이션을 적용합니다. 개발 중 스키마 변경은 `npm run db:migrate -- --name <변경이름>`으로 생성합니다. 배포 빌드는 DB를 변경하지 않습니다. 운영 DB 마이그레이션은 별도의 배포 단계에서 실행해야 합니다.

기존 `prisma db push`로 만든 DB가 있다면 먼저 백업하고 실제 스키마가 `prisma/schema.prisma` 및 초기 SQL과 일치하는지 검토합니다. 일치할 때만 `npx prisma migrate resolve --applied 20261008000000_initial`로 기준 마이그레이션 적용 상태를 기록한 뒤 이후 마이그레이션을 진행합니다. 이미 테이블이 있는 DB에 초기 생성 SQL을 그대로 실행하거나 DB를 초기화하지 마세요.

## Vercel 및 접근 제어

Vercel 프로젝트의 Root Directory를 `backend`로 설정합니다. `api/index.ts`는 Express 앱을 직접 내보내고 `vercel.json`이 `/api/*` 요청을 연결합니다. 로컬 `server.ts`의 `listen()`은 서버리스 핸들러에서 호출하지 않습니다. 환경변수는 Vercel 서버 설정에 넣으세요. 구현은 [Vercel Express 안내](https://vercel.com/docs/frameworks/backend/express)의 직접 앱 내보내기 형식을 따릅니다.

`CORS_ORIGINS`에 허용할 브라우저 출처를 쉼표로 구분하여 정확히 지정합니다. 와일드카드는 사용하지 않습니다. 빈 값이면 Origin 헤더가 있는 브라우저 요청은 거절합니다. CORS는 인증 대체 수단이 아니므로 브라우저에서 운영자 토큰을 사용하지 마세요.

health를 제외한 API에는 프로세스 전체 분당 60회 제한과 `Retry-After` 응답이 있습니다. 메모리 기반이므로 서버리스 인스턴스 간 공유되지 않고 재시작 시 초기화됩니다. 공개 사용 전에 호스팅 방화벽 또는 공유 저장소 기반 요청 제한을 추가해야 합니다. 인증 실패에도 이 제한이 적용됩니다. 오류 로그는 작업명과 오류 코드만 기록하며 본문·좌표·토큰·DB 연결 문자열을 출력하지 않습니다.

테스트는 임시 로컬 HTTP 서버와 DB 대역을 사용하며 실제 DB 연결, 외부 쓰기 또는 배포를 실행하지 않습니다.
