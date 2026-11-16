#!/bin/bash
# 인스턴스 안에서 root 로 한 번 돈다 (provision.sh 가 EC2 user-data 로 넘긴다). 다시 돌려도 된다.
# Node 22 · Caddy(HTTPS 자동) · git 을 깔고, 저장소를 /opt/exergame 에 받아 api/server.js 를 systemd 로 띄운다.
# 아래 세 값은 provision.sh 가 채운다.
set -euo pipefail
DOMAIN="__DOMAIN__"
BRANCH="__BRANCH__"
UPLOAD_KEY="__UPLOAD_KEY__"
REPO="https://github.com/twilight-devcra/exergaming-web-prototype.git"

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

# 서비스 계정 · 코드 · 데이터
id exergame >/dev/null 2>&1 || useradd --system --home /opt/exergame --shell /usr/sbin/nologin exergame
if [ ! -d /opt/exergame/.git ]; then
  git clone --branch "$BRANCH" "$REPO" /opt/exergame
else
  git -C /opt/exergame fetch origin && git -C /opt/exergame checkout "$BRANCH" && git -C /opt/exergame reset --hard "origin/$BRANCH"
fi
chown -R exergame:exergame /opt/exergame
git config --system --add safe.directory /opt/exergame # root 로 도는 deploy.sh 의 git 명령이 남의 폴더라고 거절하지 않게
install -d -o exergame -g exergame -m 750 /var/lib/exergame-api

# 설정: 처음 한 번만 만든다 (관리 화면 비밀번호는 여기서 무작위로 정한다. 보려면: sudo cat /etc/exergame-api.env)
if [ ! -f /etc/exergame-api.env ]; then
  umask 077
  cat > /etc/exergame-api.env <<EOF
PORT=8787
HOST=127.0.0.1
DATA_DIR=/var/lib/exergame-api
UPLOAD_KEY=$UPLOAD_KEY
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')
ALLOW_ORIGINS=https://twilight-devcra.github.io,http://localhost:5173
EOF
fi

cat > /etc/systemd/system/exergame-api.service <<'EOF'
[Unit]
Description=Exergame session API
After=network-online.target
Wants=network-online.target

[Service]
User=exergame
Group=exergame
EnvironmentFile=/etc/exergame-api.env
WorkingDirectory=/opt/exergame
ExecStart=/usr/bin/node api/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/exergame-api
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Caddy: HTTPS 인증서를 알아서 받고 갱신한다. 본문 크기는 서버(10 MB)가 정하므로 여기서는 막지 않는다
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8787
	log {
		output file /var/log/caddy/access.log {
			roll_size 20MiB
			roll_keep 5
		}
	}
}
EOF

systemctl daemon-reload
systemctl enable --now exergame-api
systemctl restart exergame-api
systemctl enable caddy
systemctl reload-or-restart caddy
echo "setup done: https://$DOMAIN/health"
