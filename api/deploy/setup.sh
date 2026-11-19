#!/bin/bash
# 인스턴스 안에서 root 로 돈다. 다시 돌려도 된다.
#   - 새 서버: provision.sh 가 아래 __…__ 값을 채워 EC2 user-data 로 넘긴다 (처음 켜질 때 한 번)
#   - 이미 있는 서버: add-dev.sh 가 값을 채워 Session Manager 로 보낸다 (dev 서버를 더할 때)
# Node 22 · Caddy(HTTPS 자동) · git 을 깔고, 서버 둘을 systemd 로 띄운다 (api/README.md '서버 둘'):
#   운영  exergame-api      /opt/exergame      main  127.0.0.1:8787  /var/lib/exergame-api      /etc/exergame-api.env      https://$DOMAIN
#   dev   exergame-api-dev  /opt/exergame-dev  dev   127.0.0.1:8788  /var/lib/exergame-api-dev  /etc/exergame-api-dev.env  https://$DEV_DOMAIN
# 데이터·설정 파일은 처음 한 번만 만든다. 코드는 돌릴 때마다 그 브랜치의 최신으로 맞춘다.
set -euo pipefail
DOMAIN="__DOMAIN__"
DEV_DOMAIN="__DEV_DOMAIN__"
BRANCH="__BRANCH__"
DEV_BRANCH="__DEV_BRANCH__"
UPLOAD_KEY="__UPLOAD_KEY__" # 비어 있으면 운영 설정 파일에 이미 있는 키를 쓴다 (이미 있는 서버)
REPO="https://github.com/twilight-devcra/exergaming-web-prototype.git"
ORIGINS="https://twilight-devcra.github.io,http://localhost:5173"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git debian-keyring debian-archive-keyring apt-transport-https

# Node 22 (NodeSource)
if ! node --version 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (공식 apt 저장소)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

id exergame >/dev/null 2>&1 || useradd --system --home /opt/exergame --shell /usr/sbin/nologin exergame

# 업로드 키: 두 서버가 같은 키를 쓴다 (태블릿의 js/config.js 에 키가 하나뿐이다)
if [ -z "$UPLOAD_KEY" ] || [ "${UPLOAD_KEY#__}" != "$UPLOAD_KEY" ]; then
  UPLOAD_KEY=$(sed -n 's/^UPLOAD_KEY=//p' /etc/exergame-api.env 2>/dev/null || true)
fi
[ -n "$UPLOAD_KEY" ] || { echo "no UPLOAD_KEY (not given, and /etc/exergame-api.env has none)"; exit 1; }

# 서버 하나: 서비스 이름 · 코드 폴더 · 브랜치 · 포트
instance() {
  local name="$1" dir="$2" branch="$3" port="$4"
  local data="/var/lib/$name" envfile="/etc/$name.env"

  # 코드
  if [ ! -d "$dir/.git" ]; then
    git clone --branch "$branch" "$REPO" "$dir"
  else
    git -C "$dir" fetch origin && git -C "$dir" checkout "$branch" && git -C "$dir" reset --hard "origin/$branch"
  fi
  chown -R exergame:exergame "$dir"
  # root 로 도는 deploy.sh 의 git 명령이 남의 폴더라고 거절하지 않게
  git config --system --get-all safe.directory | grep -qx "$dir" || git config --system --add safe.directory "$dir"
  install -d -o exergame -g exergame -m 750 "$data"

  # 설정: 처음 한 번만 (관리 화면 비밀번호는 서버마다 무작위. 보려면: sudo grep ADMIN /etc/<이름>.env)
  if [ ! -f "$envfile" ]; then
    (umask 077 && cat > "$envfile" <<EOF
PORT=$port
HOST=127.0.0.1
DATA_DIR=$data
UPLOAD_KEY=$UPLOAD_KEY
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')
ALLOW_ORIGINS=$ORIGINS
EOF
    )
  fi

  cat > "/etc/systemd/system/$name.service" <<EOF
[Unit]
Description=Exergame session API ($name, $branch)
After=network-online.target
Wants=network-online.target

[Service]
User=exergame
Group=exergame
EnvironmentFile=$envfile
WorkingDirectory=$dir
ExecStart=/usr/bin/node api/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
}

instance exergame-api /opt/exergame "$BRANCH" 8787
instance exergame-api-dev /opt/exergame-dev "$DEV_BRANCH" 8788

# Caddy: 주소마다 HTTPS 인증서를 알아서 받고 갱신한다. 본문 크기는 서버(10 MB)가 정하므로 여기서는 막지 않는다
site() {
  cat <<EOF
$1 {
	encode gzip
	reverse_proxy 127.0.0.1:$2
	log {
		output file /var/log/caddy/$3.log {
			roll_size 20MiB
			roll_keep 5
		}
	}
}
EOF
}
{ site "$DOMAIN" 8787 access; echo; site "$DEV_DOMAIN" 8788 access-dev; } > /etc/caddy/Caddyfile

systemctl daemon-reload
for s in exergame-api exergame-api-dev; do
  systemctl enable "$s"
  systemctl restart "$s"
done
systemctl enable caddy
systemctl reload-or-restart caddy
sleep 2
curl -sf http://127.0.0.1:8787/health && echo " ← exergame-api (8787)"
curl -sf http://127.0.0.1:8788/health && echo " ← exergame-api-dev (8788)"
echo "setup done: https://$DOMAIN/health · https://$DEV_DOMAIN/health"
