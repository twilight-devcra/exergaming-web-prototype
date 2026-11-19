# 세션 서버 (`api/`)

[docs/SERVER.md](../docs/SERVER.md) 의 업로드·회원 기록 서버와, 밸런스 시험용 관리 화면입니다. Node 22.13 이상, 의존성 없음 (내장 `node:sqlite`).

| 주소 | 하는 일 |
|---|---|
| `POST /sessions` | 세션 로그 하나 받기. `meta.device` + `meta.id` 로 덮어쓴다. 형식이 이상해도 2xx |
| `GET /history?user=<번호>` | 회원 기록 (항목의 필드·형은 `js/history-entry.js`, 태블릿과 같은 파일). IP 마다 1분에 30번까지 |
| `GET /health` | 살아 있는지 |
| `/admin` | 관리 화면 (비밀번호). 세션 목록, 게임 × 레벨 정답률, 게임별 통계, CSV, 원본 내려받기 |

두 주소 모두 `?env=dev` 를 붙이면 따로 저장·조회합니다. dev 브랜치 미리 보기(`/dev/`)의 설정에는 `?env=dev` 를 붙인 주소를 적어, 운영 데이터와 섞이지 않게 합니다.

## 실행과 시험

```bash
node api/test.js          # 빈 임시 폴더로 서버를 띄워 SERVER.md 의 규칙을 확인한다
node api/test.js --keep   # 시험 데이터를 남기고 서버를 계속 띄운다 → http://127.0.0.1:18787/admin (비밀번호 test-admin)
node api/server.js        # 직접 실행 (아래 환경 변수)
node api/server.js --reindex   # 원본(raw/)에서 색인(SQLite)을 다시 만든다. 색인 형식을 바꾼 뒤에
```

| 환경 변수 | 기본값 | |
|---|---|---|
| `PORT`, `HOST` | `8787`, `127.0.0.1` | 앞에 Caddy 를 두므로 바깥에 열지 않는다 |
| `DATA_DIR` | `api/data` | 원본 `raw/<env>/<device>/<id>.json.gz` + 색인 `exergame.db` |
| `UPLOAD_KEY` | 없음 | 있으면 업로드·회원 기록에 `Authorization: Bearer <키>` 를 요구. 태블릿에 그대로 들어가므로 비밀이 아니다 |
| `ADMIN_PASSWORD` | 없음 | 관리 화면 비밀번호 (사용자 이름은 아무거나). 없으면 관리 화면이 닫힌다 |
| `ALLOW_ORIGINS` | 배포 주소, `localhost:5173` | CORS 로 허락할 출처 (쉼표로) |

## 관리 화면 읽는 법

- **게임 × 레벨 정답률**: 색은 '적응형 난이도가 머무는 정답률'과의 차이입니다. 그 정답률은 세션 설정의 `diffDown / (diffUp + diffDown)` 이라 보통 60%, 휴식 75%, 도전 50% 입니다. 빨강은 그 레벨이 기준보다 어렵다, 파랑은 쉽다는 뜻입니다. 문제가 20개 미만인 칸은 빗금으로 두어 판단하지 않습니다.
- 칸에 마우스를 올리면 시간 초과율, 걸린 시간(중앙값·90%), 제한 시간을 얼마나 썼는지가 나옵니다. 표로 보기에도 같은 값이 있습니다.
- 거르기(환경·버전·난이도·태블릿·날짜)는 모든 표와 CSV 에 함께 걸립니다. 중단한 판(`abandoned`)은 기본으로 뺍니다.
- 더 깊이 볼 때는 CSV(`questions` 는 문제 하나가 한 줄)를 내려받거나, 최근 세션의 **원본** 으로 세션 로그 전체를 받습니다 ([docs/SESSION_LOG.md](../docs/SESSION_LOG.md)).

## AWS 에 올리기

처음 한 번 (관리자 권한 aws CLI, 서울 리전):

```bash
bash api/deploy/provision.sh
# 바꿀 수 있는 값: DOMAIN(기본 exergame-api.devcra.com) BRANCH(기본 main) TYPE(기본 t4g.small) UPLOAD_KEY(기본 무작위)
```

**서버는 `main` 을 따릅니다.** 서버는 하나뿐이라 운영 태블릿(`main`)과 dev 미리 보기(`/dev/`)가 같은 서버 코드를 씁니다. `?env=dev` 는 데이터만 나눌 뿐입니다. 서버가 `dev` 를 따르면 아직 내보내지 않은 서버 변경이 운영 태블릿에 바로 닿습니다 (업로드가 실패하면 그 태블릿의 업로드가 멈추고, 회원 기록은 로그인 화면에 쓰인다). 서버를 고칠 때는 `dev` 에서 `node api/test.js` (화면까지 보려면 `--keep`) 로 확인하고, `main` 에 합친 뒤 올립니다.

IAM 역할, 보안 그룹(80·443 만), EC2(Ubuntu 24.04 ARM, 20 GB 암호화 디스크), 탄력적 IP, Route 53 레코드, 매일 스냅샷(7개 보관)을 만들고, 인스턴스가 처음 켜질 때 [deploy/setup.sh](deploy/setup.sh) 가 Node·Caddy 를 깔고 저장소를 받아 서비스를 띄웁니다. HTTPS 인증서는 Caddy 가 알아서 받고 갱신합니다. 끝나면 업로드 키와 태블릿에 적을 주소를 출력합니다.

코드 고친 뒤 (먼저 `main` 에 합쳐 `git push`):

```bash
bash api/deploy/deploy.sh               # 서버가 받아 둔 브랜치를 최신으로 맞추고 다시 띄운다
BRANCH=main bash api/deploy/deploy.sh   # 브랜치 바꾸기 (예전 기본값 dev 로 만든 서버를 main 으로 옮길 때 한 번)
```

지금 서버가 어느 브랜치인지는 서버에 들어가 `git -C /opt/exergame branch --show-current` 로 봅니다.

### 고정 IP

계정의 탄력적 IP 한도가 차 있으면 `provision.sh` 는 인스턴스의 자동 공인 IP 로 DNS 를 맞춥니다. 이 IP 는 재부팅해도 같지만 **인스턴스를 중지했다 시작하면 바뀝니다**. 그때는 Route 53 의 `exergame-api.devcra.com` A 레코드를 새 IP 로 고칩니다.
한도를 늘린 뒤 탄력적 IP 로 옮기려면:

```bash
ALLOC=$(aws ec2 allocate-address --domain vpc --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Project,Value=exergaming},{Key=Name,Value=exergame-api}]' --query AllocationId --output text)
aws ec2 associate-address --instance-id <인스턴스 id> --allocation-id $ALLOC
# 그다음 Route 53 의 A 레코드를 새 IP 로 (공인 IP 가 바뀌므로 몇 분 끊긴다)
```

### 서버에 들어가기 (SSH 대신 Session Manager)

22번 포트는 닫혀 있습니다. 이 AWS 계정에 IAM 로그인이 있으면 어디서든 들어갈 수 있습니다 (IP 목록 없음).

```bash
# 한 번: Session Manager 플러그인 설치 — https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html
aws ssm start-session --region ap-northeast-2 --target <인스턴스 id>
sudo grep ADMIN /etc/exergame-api.env        # 관리 화면 비밀번호
sudo journalctl -u exergame-api -n 100       # 서버 로그
```

팀원에게는 IAM 사용자를 만들고 `ssm:StartSession`(이 인스턴스) 권한을 줍니다. 관리 화면만 볼 사람은 AWS 권한 없이 비밀번호만 있으면 됩니다.

| 위치 (서버) | |
|---|---|
| `/opt/exergame` | 저장소 (git) |
| `/var/lib/exergame-api` | 데이터 (원본 + SQLite). 매일 디스크 스냅샷 |
| `/etc/exergame-api.env` | 설정 (업로드 키, 관리 비밀번호) |
| `/etc/caddy/Caddyfile` | HTTPS · 프록시 |
