#!/bin/bash
# AWS 에 서버를 만든다 (한 번). 개발 PC 에서 aws CLI(관리자 권한)로 돈다. Git Bash 에서도 된다.
#   bash api/deploy/provision.sh
# 만드는 것 (모두 태그 Project=exergaming):
#   IAM 역할·인스턴스 프로필 exergame-api-ec2 (Session Manager 접속용, SSH 키 없음)
#   보안 그룹 exergame-api (80·443 만 열림. 22 는 닫힘)
#   EC2 t4g.small · Ubuntu 24.04 ARM · 20 GB gp3 암호화 · user-data = setup.sh
#   탄력적 IP + Route 53 A 레코드 ($DOMAIN)
#   매일 디스크 스냅샷 (7개 보관, Data Lifecycle Manager)
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash 가 /aws/... 같은 인자를 Windows 경로로 바꾸지 않게
export AWS_PAGER=""

REGION="${REGION:-ap-northeast-2}"
DOMAIN="${DOMAIN:-exergame-api.devcra.com}"
ZONE_NAME="${ZONE_NAME:-devcra.com.}"
BRANCH="${BRANCH:-dev}"
TYPE="${TYPE:-t4g.small}"
NAME=exergame-api
TAGS="Key=Project,Value=exergaming"
UPLOAD_KEY="${UPLOAD_KEY:-$(openssl rand -hex 16)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
aws() { command aws --region "$REGION" "$@"; }

echo "== region $REGION · domain $DOMAIN · branch $BRANCH · type $TYPE"

# 이미 있으면 멈춘다 (두 번 만들지 않게)
if [ -n "$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" --query 'Reservations[].Instances[].InstanceId' --output text)" ]; then
  echo "instance '$NAME' already exists — stop"; exit 1
fi

# ---- IAM: Session Manager 로 들어가기 위한 역할 ----
if ! aws iam get-role --role-name "$NAME-ec2" >/dev/null 2>&1; then
  aws iam create-role --role-name "$NAME-ec2" --tags "$TAGS" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{ "Effect": "Allow", "Principal": { "Service": "ec2.amazonaws.com" }, "Action": "sts:AssumeRole" }]
  }' >/dev/null
  aws iam attach-role-policy --role-name "$NAME-ec2" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
fi
if ! aws iam get-instance-profile --instance-profile-name "$NAME-ec2" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$NAME-ec2" --tags "$TAGS" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$NAME-ec2" --role-name "$NAME-ec2"
  sleep 10 # 새 프로필이 EC2 에 보이기까지 잠깐 걸린다
fi

# ---- 보안 그룹: 기본 VPC 에 80·443 ----
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME" "Name=vpc-id,Values=$VPC" --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG" = "None" ]; then
  SG=$(aws ec2 create-security-group --group-name "$NAME" --description "exergame API: HTTP/HTTPS only (shell via SSM)" --vpc-id "$VPC" \
    --tag-specifications "ResourceType=security-group,Tags=[{$TAGS},{Key=Name,Value=$NAME}]" --query GroupId --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]' >/dev/null
fi
echo "security group $SG"

# ---- 인스턴스 ----
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)
# 지금 폴더의 상대 경로로 둔다: Windows 의 aws.exe 는 Git Bash 의 /tmp 를 못 읽는다. 줄 끝의 CR 도 지운다 (서버의 bash 가 못 읽는다)
USERDATA=".exergame-userdata-$$.sh"
trap 'rm -f "$USERDATA"' EXIT
sed -e 's/\r$//' -e "s|__DOMAIN__|$DOMAIN|" -e "s|__BRANCH__|$BRANCH|" -e "s|__UPLOAD_KEY__|$UPLOAD_KEY|" "$HERE/setup.sh" > "$USERDATA"
ID=$(aws ec2 run-instances --image-id "$AMI" --instance-type "$TYPE" --count 1 \
  --security-group-ids "$SG" --iam-instance-profile "Name=$NAME-ec2" \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true,DeleteOnTermination=false}' \
  --metadata-options 'HttpTokens=required,HttpEndpoint=enabled' \
  --tag-specifications "ResourceType=instance,Tags=[{$TAGS},{Key=Name,Value=$NAME}]" "ResourceType=volume,Tags=[{$TAGS},{Key=Name,Value=$NAME},{Key=Backup,Value=$NAME}]" \
  --user-data "fileb://$USERDATA" --query 'Instances[0].InstanceId' --output text)
rm -f "$USERDATA"
echo "instance $ID — waiting until running"
aws ec2 wait instance-running --instance-ids "$ID"

# ---- 고정 IP + DNS ----
# 탄력적 IP 한도에 걸리면 인스턴스의 자동 공인 IP 를 쓴다. 이 IP 는 재부팅해도 같지만 중지 → 시작하면 바뀌므로
# 그때는 DNS 를 다시 맞춰야 한다 (한도를 늘린 뒤 탄력적 IP 로 옮기는 방법: api/README.md)
if ALLOC=$(aws ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{$TAGS},{Key=Name,Value=$NAME}]" --query AllocationId --output text); then
  aws ec2 associate-address --instance-id "$ID" --allocation-id "$ALLOC" >/dev/null
  IP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)
else
  IP=$(aws ec2 describe-instances --instance-ids "$ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
  echo "!! elastic ip not available (quota?) — using the instance's public ip $IP. It changes if the instance is stopped and started."
fi
ZONE=$(aws route53 list-hosted-zones-by-name --dns-name "$ZONE_NAME" --query 'HostedZones[0].Id' --output text)
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" --change-batch "{
  \"Comment\": \"exergame API\",
  \"Changes\": [{ \"Action\": \"UPSERT\", \"ResourceRecordSet\": { \"Name\": \"$DOMAIN\", \"Type\": \"A\", \"TTL\": 300, \"ResourceRecords\": [{ \"Value\": \"$IP\" }] } }]
}" >/dev/null
echo "ip $IP → $DOMAIN"

# ---- 매일 스냅샷 (태그 Backup=exergame-api 인 디스크, 7개 보관) ----
aws dlm create-default-role >/dev/null 2>&1 || true
DLM_ROLE=$(aws iam get-role --role-name AWSDataLifecycleManagerDefaultRole --query Role.Arn --output text)
if [ -z "$(aws dlm get-lifecycle-policies --target-tags "Backup=$NAME" --query 'Policies[].PolicyId' --output text)" ]; then
  aws dlm create-lifecycle-policy --execution-role-arn "$DLM_ROLE" --description "$NAME daily" --state ENABLED --tags "Project=exergaming" --policy-details "{
    \"ResourceTypes\": [\"VOLUME\"], \"TargetTags\": [{ \"Key\": \"Backup\", \"Value\": \"$NAME\" }],
    \"Schedules\": [{ \"Name\": \"daily\", \"CreateRule\": { \"Interval\": 24, \"IntervalUnit\": \"HOURS\", \"Times\": [\"18:00\"] },
      \"RetainRule\": { \"Count\": 7 }, \"CopyTags\": true }]
  }" >/dev/null
fi

cat <<EOF

== done
instance   $ID ($TYPE, $IP)
url        https://$DOMAIN   (첫 부팅 설치와 인증서 발급에 몇 분 걸린다: curl https://$DOMAIN/health)
upload key $UPLOAD_KEY
admin pw   aws ssm start-session --target $ID  →  sudo grep ADMIN /etc/exergame-api.env

태블릿 설정 (js/config.js 의 SESSION_UPLOAD 또는 운영 메뉴 자동 업로드):
  url        https://$DOMAIN/sessions
  historyUrl https://$DOMAIN/history
  key        $UPLOAD_KEY
EOF
