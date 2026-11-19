#!/bin/bash
# 이미 있는 서버(provision.sh 로 만든 인스턴스)에 dev 서버를 더한다 (한 번). 개발 PC 에서 aws CLI 로 돈다. Git Bash 에서도 된다.
#   bash api/deploy/add-dev.sh
# 하는 일 (api/README.md '서버 둘'):
#   1. Route 53 에 $DEV_DOMAIN A 레코드 (운영 주소와 같은 IP)
#   2. 이 PC 의 setup.sh 를 Session Manager 로 보내 root 로 돌린다 → dev 서버(exergame-api-dev, dev 브랜치)를 띄우고 Caddy 에 주소를 더한다
# 주의: setup.sh 는 운영 서버도 $BRANCH(기본 main)의 최신으로 맞추고 다시 띄운다 (몇 초 끊긴다).
#   그래서 main 의 서버 코드가 dev 와 다르면 멈춘다 (예전 기본값 dev 를 따르던 서버가 고친 것을 잃지 않게). 먼저 main 에 합쳐 push 한다.
#   일부러 다른 채로 돌리려면 FORCE=1
# 다시 돌려도 된다 (데이터·설정 파일은 있으면 그대로 둔다).
set -euo pipefail
export MSYS_NO_PATHCONV=1
export AWS_PAGER=""
REGION="${REGION:-ap-northeast-2}"
DOMAIN="${DOMAIN:-exergame-api.devcra.com}"
DEV_DOMAIN="${DEV_DOMAIN:-exergame-api-dev.devcra.com}"
ZONE_NAME="${ZONE_NAME:-devcra.com.}"
BRANCH="${BRANCH:-main}"
DEV_BRANCH="${DEV_BRANCH:-dev}"
NAME=exergame-api
HERE="$(cd "$(dirname "$0")" && pwd)"
aws() { command aws --region "$REGION" "$@"; }
# 저장소의 git (cd 로 들어간다: MSYS_NO_PATHCONV 때문에 git -C /d/... 는 Windows 의 git.exe 가 못 읽는다)
repo_git() { (cd "$HERE" && git "$@"); }

# 운영 서버가 될 $BRANCH 의 서버 코드가 $DEV_BRANCH 와 같은가 (GitHub 기준)
repo_git fetch -q origin "$BRANCH" "$DEV_BRANCH"
SERVER_CODE=(api js/history-entry.js js/games)
if ! repo_git diff --quiet "origin/$BRANCH" "origin/$DEV_BRANCH" -- "${SERVER_CODE[@]/#/:/}"; then
  echo "!! origin/$BRANCH 와 origin/$DEV_BRANCH 의 서버 코드가 다르다 (운영 서버는 $BRANCH 로 맞춰진다):"
  repo_git diff --stat "origin/$BRANCH" "origin/$DEV_BRANCH" -- "${SERVER_CODE[@]/#/:/}"
  if [ "${FORCE:-}" != 1 ]; then
    echo "먼저 $DEV_BRANCH 를 $BRANCH 에 합쳐 push 한다. 그래도 돌리려면 FORCE=1"
    exit 1
  fi
fi

ID=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=running" --query 'Reservations[0].Instances[0].InstanceId' --output text)
[ "$ID" = "None" ] && { echo "no running instance '$NAME'"; exit 1; }
IP=$(aws ec2 describe-instances --instance-ids "$ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo "== instance $ID ($IP) · $DOMAIN ($BRANCH) · $DEV_DOMAIN ($DEV_BRANCH)"

# 1. DNS
ZONE=$(aws route53 list-hosted-zones-by-name --dns-name "$ZONE_NAME" --query 'HostedZones[0].Id' --output text)
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" --change-batch "{
  \"Comment\": \"exergame API (dev)\",
  \"Changes\": [{ \"Action\": \"UPSERT\", \"ResourceRecordSet\": { \"Name\": \"$DEV_DOMAIN\", \"Type\": \"A\", \"TTL\": 300, \"ResourceRecords\": [{ \"Value\": \"$IP\" }] } }]
}" >/dev/null
echo "ip $IP → $DEV_DOMAIN"

# 2. setup.sh: 서버의 저장소가 GitHub 에서 받은 origin/$BRANCH 의 것을 쓴다 (위에서 dev 와 같음을 확인했다. 명령에 스크립트를 싣지 않는다).
#    업로드 키는 비워 둔다: 서버의 /etc/exergame-api.env 에 있는 키를 쓴다
FILL="-e 's|__DOMAIN__|$DOMAIN|' -e 's|__DEV_DOMAIN__|$DEV_DOMAIN|' -e 's|__BRANCH__|$BRANCH|' -e 's|__DEV_BRANCH__|$DEV_BRANCH|' -e 's|__UPLOAD_KEY__||'"
CMD="set -e; cd /opt/exergame && sudo -u exergame git fetch -q origin && git show origin/$BRANCH:api/deploy/setup.sh | sed -e 's/\r\$//' $FILL > /root/exergame-setup.sh && bash /root/exergame-setup.sh"
CID=$(aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript --comment "add $NAME-dev" --timeout-seconds 900 \
  --parameters "$(node -e 'console.log(JSON.stringify({ commands: [process.argv[1]], executionTimeout: ["900"] }))' "$CMD")" --query Command.CommandId --output text)
echo "setup.sh 를 돌리는 중 (패키지 확인에 몇 분 걸릴 수 있다) — command $CID"
while :; do
  STATUS=$(aws ssm get-command-invocation --command-id "$CID" --instance-id "$ID" --query Status --output text 2>/dev/null || echo Pending)
  case "$STATUS" in Pending|InProgress|Delayed) sleep 10 ;; *) break ;; esac
done
aws ssm get-command-invocation --command-id "$CID" --instance-id "$ID" --query '[Status, StandardOutputContent, StandardErrorContent]' --output text | tail -25

cat <<EOF

== $STATUS
dev url   https://$DEV_DOMAIN/health   (DNS 와 인증서에 몇 분 걸릴 수 있다)
admin pw  aws ssm start-session --region $REGION --target $ID  →  sudo grep ADMIN /etc/exergame-api-dev.env
다음: dev 서버가 답하면 js/config.js 의 API_DEV 를 쓰는 커밋을 dev 에 push 한다 (api/README.md '서버 둘')
EOF
[ "$STATUS" = Success ]
