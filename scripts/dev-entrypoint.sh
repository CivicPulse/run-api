#!/bin/bash
set -e

echo "==> Running Alembic migrations..."
python -m alembic upgrade head

echo "==> Ensuring MinIO bucket exists..."
python -c "
import boto3, os
from botocore.exceptions import ClientError
s3 = boto3.client('s3',
    endpoint_url=os.environ.get('S3_ENDPOINT_URL', 'http://minio:9000'),
    aws_access_key_id=os.environ.get('S3_ACCESS_KEY_ID', 'minioadmin'),
    aws_secret_access_key=os.environ.get('S3_SECRET_ACCESS_KEY', 'minioadmin'),
    region_name='us-east-1')
bucket = os.environ.get('S3_BUCKET', 'voter-imports')
try:
    s3.head_bucket(Bucket=bucket)
    print(f'Bucket {bucket} already exists')
except ClientError:
    s3.create_bucket(Bucket=bucket)
    print(f'Created bucket {bucket}')
"

echo "==> Starting uvicorn with hot-reload..."
SSL_ARGS=""
if [ -f /home/app/certs/dev.tailb56d83.ts.net.crt ]; then
  echo "    (TLS enabled via Tailscale certs)"
  SSL_ARGS="--ssl-certfile /home/app/certs/dev.tailb56d83.ts.net.crt --ssl-keyfile /home/app/certs/dev.tailb56d83.ts.net.key"
fi
exec python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level info $SSL_ARGS
