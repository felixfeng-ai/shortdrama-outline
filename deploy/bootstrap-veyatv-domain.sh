#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "请使用 sudo 执行：sudo bash deploy/bootstrap-veyatv-domain.sh"
    exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="veyatv.com"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
BOOTSTRAP="/etc/nginx/sites-available/veyatv.com.http-bootstrap.conf"
FINAL="/etc/nginx/sites-available/veyatv.com.conf"

mkdir -p /var/www/html

if [ ! -f "$CERT" ]; then
    install -m 644 "$ROOT/deploy/nginx-veyatv.com.http-bootstrap.conf" "$BOOTSTRAP"
    ln -sf "$BOOTSTRAP" /etc/nginx/sites-enabled/veyatv.com.http-bootstrap.conf
    nginx -t
    systemctl reload nginx

    CERTBOT_ARGS=(
        certonly
        --webroot
        -w /var/www/html
        -d "$DOMAIN"
        -d "www.${DOMAIN}"
        --non-interactive
        --agree-tos
        --keep-until-expiring
    )
    if [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
        CERTBOT_ARGS+=(--email "$LETSENCRYPT_EMAIL")
    else
        CERTBOT_ARGS+=(--register-unsafely-without-email)
    fi
    certbot "${CERTBOT_ARGS[@]}"
fi

install -m 644 "$ROOT/deploy/nginx-veyatv.com.conf" "$FINAL"
ln -sf "$FINAL" /etc/nginx/sites-enabled/veyatv.com.conf
rm -f /etc/nginx/sites-enabled/chenju.work /etc/nginx/sites-enabled/veyatv.com.http-bootstrap.conf
nginx -t
systemctl reload nginx

echo "✅ veyatv.com 已启用，chenju.work 会通过应用层会话交接跳转到新域"
