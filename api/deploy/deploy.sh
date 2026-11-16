#!/bin/bash
# 서버의 코드를 GitHub 의 지금 브랜치로 맞추고 다시 띄운다 (Session Manager 로 명령을 보낸다. SSH 필요 없음).
#   bash api/deploy/deploy.sh            (서버가 받아 둔 브랜치 그대로)
#   BRANCH=main bash api/deploy/deploy.sh (브랜치를 바꿀 때)
# 먼저 git push 해 두어야 한다. 서버는 GitHub 에서 받는다.
set -euo pipefail
export MSYS_NO_PATHCONV=1
export AWS_PAGER=""
REGION="${REGION:-ap-northeast-2}"
NAME=exergame-api
aws() { command aws --region "$REGION" "$@"; }

ID=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=running" --query 'Reservations[0].Instances[0].InstanceId' --output text)
[ "$ID" = "None" ] && { echo "no running instance '$NAME'"; exit 1; }
SWITCH=""
[ -n "${BRANCH:-}" ] && SWITCH="sudo -u exergame git checkout $BRANCH && "
CMD="cd /opt/exergame && sudo -u exergame git fetch origin && ${SWITCH}sudo -u exergame git reset --hard \"origin/\$(git rev-parse --abbrev-ref HEAD)\" && git log --oneline -1 && systemctl restart exergame-api && sleep 2 && curl -sf http://127.0.0.1:8787/health"
CID=$(aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript --comment "deploy $NAME" \
  --parameters "$(node -e 'console.log(JSON.stringify({ commands: [process.argv[1]] }))' "$CMD")" --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$CID" --instance-id "$ID" || true
aws ssm get-command-invocation --command-id "$CID" --instance-id "$ID" --query '[Status, StandardOutputContent, StandardErrorContent]' --output text
