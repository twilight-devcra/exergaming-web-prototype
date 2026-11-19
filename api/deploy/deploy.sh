#!/bin/bash
# 서버의 코드를 GitHub 의 그 브랜치 최신으로 맞추고 다시 띄운다 (Session Manager 로 명령을 보낸다. SSH 필요 없음).
# 한 인스턴스에 서버가 둘이다 (api/README.md '서버 둘'):
#   bash api/deploy/deploy.sh               운영 서버 (exergame-api, main) — 서버가 받아 둔 브랜치 그대로
#   TARGET=dev bash api/deploy/deploy.sh    dev 서버 (exergame-api-dev, dev) — dev 미리 보기(/dev/)가 쓰는 서버
#   BRANCH=main bash api/deploy/deploy.sh   브랜치를 바꿀 때 (TARGET 과 함께 쓸 수 있다)
# 먼저 git push 해 두어야 한다. 서버는 GitHub 에서 받는다. 운영 서버에는 main 에 합친 것만 올린다.
set -euo pipefail
export MSYS_NO_PATHCONV=1
export AWS_PAGER=""
REGION="${REGION:-ap-northeast-2}"
NAME=exergame-api
aws() { command aws --region "$REGION" "$@"; }

case "${TARGET:-prod}" in
  prod) SERVICE=exergame-api DIR=/opt/exergame PORT=8787 ;;
  dev) SERVICE=exergame-api-dev DIR=/opt/exergame-dev PORT=8788 ;;
  *) echo "TARGET 은 prod 또는 dev: $TARGET"; exit 1 ;;
esac

ID=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=running" --query 'Reservations[0].Instances[0].InstanceId' --output text)
[ "$ID" = "None" ] && { echo "no running instance '$NAME'"; exit 1; }
SWITCH=""
[ -n "${BRANCH:-}" ] && SWITCH="sudo -u exergame git checkout $BRANCH && "
CMD="[ -d $DIR/.git ] || { echo 'no $DIR — dev 서버가 아직 없다: bash api/deploy/add-dev.sh'; exit 1; }; cd $DIR && sudo -u exergame git fetch origin && ${SWITCH}sudo -u exergame git reset --hard \"origin/\$(git rev-parse --abbrev-ref HEAD)\" && git log --oneline -1 && systemctl restart $SERVICE && sleep 2 && curl -sf http://127.0.0.1:$PORT/health"
echo "== deploy $SERVICE ($DIR) on $ID"
CID=$(aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript --comment "deploy $SERVICE" \
  --parameters "$(node -e 'console.log(JSON.stringify({ commands: [process.argv[1]] }))' "$CMD")" --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$CID" --instance-id "$ID" || true
aws ssm get-command-invocation --command-id "$CID" --instance-id "$ID" --query '[Status, StandardOutputContent, StandardErrorContent]' --output text
