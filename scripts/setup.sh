#!/usr/bin/env bash
# DeployOps — bootstrap & deploy script (Ubuntu 22.04)
# https://deployops.example.com
#
# Usage:
#   1) Завантаж скрипт на свіжий VPS (як root, через SFTP/scp).
#   2) Виконай у два кроки:
#
#      # КРОК 1. Системний bootstrap (apt, docker, node, юзер deployops, SSH, ufw, fail2ban):
#      DOMAIN=deployops.example.com \
#      SSH_PUBLIC_KEY='ssh-ed25519 AAAA... deployops' \
#      MY_IP=77.110.102.126 \
#      bash setup.sh bootstrap
#
#      # КРОК 2. Зали файли проєкту в /opt/deployops через SFTP від користувача deployops
#      #         (FileZilla/WinSCP з тим SSH-ключем). Список — нижче в README/DEPLOY.md.
#
#      # КРОК 3. Деплой (postgres + prisma + pnpm + pm2 + nginx + Let's Encrypt):
#      DOMAIN=deployops.example.com \
#      ADMIN_EMAIL=admin@deployops.example.com \
#      ADMIN_PASSWORD='ChangeMe_LongAndStrong' \
#      LE_EMAIL=admin@deployops.example.com \
#      bash setup.sh deploy

set -euo pipefail

# ── pretty output ────────────────────────────────────────────────────────────
log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

require_root() {
  [ "$(id -u)" = "0" ] || die "Запускай як root (sudo -i)."
}

require_env() {
  for var in "$@"; do
    if [ -z "${!var:-}" ]; then
      die "Не задана ENV-змінна: $var. Дивись header цього файлу."
    fi
  done
}

# ──────────────────────────────────────────────────────────────────────────────
# КРОК 1: BOOTSTRAP — все системне, до того як файли проєкту залиті
# ──────────────────────────────────────────────────────────────────────────────
cmd_bootstrap() {
  require_root
  require_env DOMAIN

  # Режим доступу: ключ (дефолт) АБО пароль (ALLOW_PASSWORD_SSH=1)
  local PASSWORD_SSH=0
  if [ "${ALLOW_PASSWORD_SSH:-0}" = "1" ]; then
    PASSWORD_SSH=1
    warn "ALLOW_PASSWORD_SSH=1 — SSH з паролем увімкнено (менш безпечно, зручно для швидкого деплою)"
  else
    require_env SSH_PUBLIC_KEY
  fi

  export DEBIAN_FRONTEND=noninteractive
  export NEEDRESTART_MODE=a   # restart services without prompting

  log "1/9  apt update + базові пакети"
  apt-get update -qq
  apt-get -y -qq upgrade
  apt-get -y -qq install \
    curl ca-certificates gnupg lsb-release ufw nginx certbot \
    python3-certbot-nginx git build-essential fail2ban openssl dnsutils \
    unzip libarchive-tools
  ok "apt done"

  log "2/9  swap 4 GB (ідемпотентно)"
  if ! swapon --show | grep -q '/swapfile'; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
  fi
  sysctl -q vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  ok "swap: $(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')"

  log "3/9  Docker + Node 20 + pnpm + pm2"
  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh >/dev/null
    systemctl enable --now docker
  fi
  if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(2[0-9])'; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get -y -qq install nodejs
  fi
  command -v pnpm >/dev/null 2>&1 || npm i -g pnpm@9 >/dev/null 2>&1
  command -v pm2  >/dev/null 2>&1 || npm i -g pm2     >/dev/null 2>&1
  ok "docker=$(docker --version | awk '{print $3}' | tr -d ,) node=$(node -v) pnpm=$(pnpm -v) pm2=$(pm2 -v)"

  log "4/9  Користувач deployops + каталоги + SSH"
  if ! id deployops >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" deployops >/dev/null
  fi
  usermod -aG docker deployops
  mkdir -p /opt/deployops/uploads/{landings,offers,cloakers}
  chown -R deployops:deployops /opt/deployops

  install -d -m 700 /root/.ssh
  install -d -m 700 -o deployops -g deployops /home/deployops/.ssh
  touch /root/.ssh/authorized_keys /home/deployops/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  chown deployops:deployops /home/deployops/.ssh/authorized_keys
  chmod 600 /home/deployops/.ssh/authorized_keys

  if [ -n "${SSH_PUBLIC_KEY:-}" ]; then
    grep -qF "$SSH_PUBLIC_KEY" /root/.ssh/authorized_keys 2>/dev/null \
      || echo "$SSH_PUBLIC_KEY" >> /root/.ssh/authorized_keys
    grep -qF "$SSH_PUBLIC_KEY" /home/deployops/.ssh/authorized_keys 2>/dev/null \
      || echo "$SSH_PUBLIC_KEY" >> /home/deployops/.ssh/authorized_keys
    ok "SSH public key додано для root і deployops"
  else
    ok "SSH_PUBLIC_KEY не задано — лише пароль"
  fi

  if [ "$PASSWORD_SSH" = "1" ]; then
    log "5/9  SSH: PasswordAuthentication=yes (root + пароль)"
    cat > /etc/ssh/sshd_config.d/99-deployops.conf <<'EOF'
# Password SSH mode (ALLOW_PASSWORD_SSH=1)
PasswordAuthentication yes
KbdInteractiveAuthentication yes
PermitRootLogin yes
PermitEmptyPasswords no
PubkeyAuthentication yes
AllowUsers root deployops
MaxAuthTries 5
LoginGraceTime 60
MaxStartups 10:30:100
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
PermitTunnel no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
    # deployops з паролем = root (або ROOT_PASSWORD / DEPLOYOPS_PASSWORD)
    local deployops_pw="${DEPLOYOPS_PASSWORD:-${ROOT_PASSWORD:-}}"
    if [ -n "$deployops_pw" ]; then
      echo "deployops:${deployops_pw}" | chpasswd
      usermod -U deployops 2>/dev/null || true
      ok "пароль для deployops встановлено"
    else
      warn "DEPLOYOPS_PASSWORD не задано — користувач deployops без пароля (root OK)"
    fi
  else
    log "5/9  SSH hardening (PasswordAuthentication=no, root key-only)"
    cat > /etc/ssh/sshd_config.d/99-deployops.conf <<'EOF'
# Authentication
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PermitEmptyPasswords no
PubkeyAuthentication yes
AllowUsers root deployops
MaxAuthTries 3
LoginGraceTime 30
MaxStartups 10:30:100
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
PermitTunnel no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
    usermod -L deployops  # парольний логін заблокований (тільки ключ)
  fi
  chmod 644 /etc/ssh/sshd_config.d/99-deployops.conf
  sshd -t
  systemctl restart sshd || systemctl restart ssh
  ok "$(sshd -T 2>/dev/null | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractive|allowtcpforwarding|maxauthtries)' | tr '\n' ' ')"

  log "6/9  UFW (firewall)"
  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  if [ -n "${MY_IP:-}" ]; then
    ufw allow from "$MY_IP" to any port 22 proto tcp comment 'SSH from MY_IP'
    ok "SSH тільки з ${MY_IP}"
  else
    ufw allow OpenSSH
    warn "MY_IP не задано — SSH відкритий усьому світу (fail2ban+key захищають, але краще передай MY_IP)"
  fi
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable >/dev/null
  ok "ufw status: $(ufw status | head -1)"

  log "7/9  fail2ban"
  systemctl enable --now fail2ban
  ok "fail2ban: $(fail2ban-client status sshd | grep 'Jail list\|Currently banned' | tr -s ' ' || true)"

  log "7.5/9  unattended-upgrades (auto security patches)"
  apt-get -y -qq install unattended-upgrades apt-listchanges
  dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  ok "unattended-upgrades увімкнено (тільки security)"

  log "7.6/9  Miner-monitor cron (кожні 5 хв)"
  # SECURITY: моніторимо процеси на ознаки криптомайнерів. Якщо щось знайдено —
  # вбиваємо процес, логуємо у /var/log/deploy-security.log і пишемо в syslog.
  # Це другий рубіж після ignore-scripts/audit/NOSUPERUSER на випадок 0-day.
  cat > /usr/local/sbin/deploy-miner-check <<'EOF'
#!/usr/bin/env bash
set -u
LOG=/var/log/deploy-security.log
PATTERNS='xmrig|cnrig|kdevtmpfs[i]|kinsing|kdevtmpfsi|masscan|zgrab|httpx|sysupdate|networkmanager-service|nsysupdate'
HITS=$(ps -eo pid,user,comm,args --no-headers | grep -Ei "$PATTERNS" | grep -v deployops-miner-check || true)
if [ -n "$HITS" ]; then
  TS=$(date -Iseconds)
  echo "$TS  SUSPICIOUS PROCESSES FOUND:" >> "$LOG"
  echo "$HITS" >> "$LOG"
  echo "$HITS" | awk '{print $1}' | xargs -r kill -9 2>/dev/null || true
  logger -t deployops-security "miner-like processes killed: $(echo "$HITS" | wc -l) entries"
fi
# Також моніторимо outbound TCP на типові stratum-порти майнінг-пулів.
STRATUM=$(ss -tnp 2>/dev/null | grep -E ':(3333|5555|7777|9999|14444|20580)\b' | grep ESTAB || true)
if [ -n "$STRATUM" ]; then
  TS=$(date -Iseconds)
  echo "$TS  STRATUM-LIKE CONNECTIONS:" >> "$LOG"
  echo "$STRATUM" >> "$LOG"
  logger -t deployops-security "stratum-like outbound conn detected"
fi
EOF
  chmod 755 /usr/local/sbin/deploy-miner-check
  touch /var/log/deploy-security.log
  chmod 640 /var/log/deploy-security.log
  cat > /etc/cron.d/deploy-miner-check <<'EOF'
# DeployOps — security monitor (kill miners, log stratum connections)
*/5 * * * * root /usr/local/sbin/deploy-miner-check >/dev/null 2>&1
EOF
  ok "miner-monitor встановлено (/var/log/deploy-security.log)"

  log "8/9  DNS-перевірка"
  IP_ON_HOST=$(curl -s ifconfig.me || echo unknown)
  IP_ON_DNS=$(dig +short "$DOMAIN" | tail -n1)
  echo "  host: $IP_ON_HOST"
  echo "  dns:  $IP_ON_DNS"
  if [ "$IP_ON_HOST" != "$IP_ON_DNS" ]; then
    warn "DNS '$DOMAIN' дивиться не на цей сервер — Let's Encrypt не видасть сертифікат. Виправ A-запис і чекай поширення."
  else
    ok "DNS OK"
  fi

  log "9/9  Готово до фази deploy"
  cat <<EOF

═══════════════════════════════════════════════════════════════════════════════
Bootstrap завершено. Тепер:

1) З локального ПК зали файли проєкту через SFTP у /opt/deployops/ як deployops:
     папки:  prisma/ src/ docker/ tests/ (опційно)
     файли:  package.json pnpm-lock.yaml next.config.ts tsconfig.json
             tailwind.config.ts postcss.config.mjs .eslintrc.json .prettierrc
             next-env.d.ts vitest.config.ts scripts/setup.sh
   (НЕ заливай: node_modules .next .git .env uploads)

   Перевір що у docker/docker-compose.yml порт постгреса:  127.0.0.1:5433:5432

2) Запусти на сервері (як root):
     DOMAIN=$DOMAIN \\
     ADMIN_EMAIL=admin@$DOMAIN \\
     ADMIN_PASSWORD='ChangeMe_LongAndStrong' \\
     LE_EMAIL=admin@$DOMAIN \\
     bash /opt/deployops/scripts/setup.sh deploy
═══════════════════════════════════════════════════════════════════════════════
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# UNPACK — розпакувати deployops.tar.gz у /opt/deployops
# ──────────────────────────────────────────────────────────────────────────────
cmd_unpack() {
  require_root
  local archive="${ARCHIVE:-}"
  if [ -z "$archive" ]; then
    # шукаємо поряд зі скриптом / у /root / у /opt
    for cand in \
      "$(dirname "$(readlink -f "$0")")/deployops.tar.gz" \
      "/root/deployops.tar.gz" \
      "/opt/deployops.tar.gz"
    do
      [ -f "$cand" ] && archive="$cand" && break
    done
  fi
  [ -n "$archive" ] && [ -f "$archive" ] \
    || die "Архів deployops.tar.gz не знайдено. Передай ARCHIVE=/path/to.tgz або поклади поряд зі setup.sh."

  log "Розпаковую $archive у /opt/deployops"
  mkdir -p /opt/deployops

  # backup .env якщо є
  if [ -f /opt/deployops/.env ]; then
    local bak="/opt/deployops/.env.backup-$(date +%s)"
    cp /opt/deployops/.env "$bak"
    warn "існуючий .env збережено у $bak"
  fi

  # чистимо все крім uploads та .env (щоб старий код не лишився)
  find /opt/deployops -maxdepth 1 -mindepth 1 \
    ! -name uploads ! -name '.env' ! -name '.env.backup-*' \
    -exec rm -rf {} + 2>/dev/null || true

  tar -xzf "$archive" -C /opt/deployops
  mkdir -p /opt/deployops/uploads/{landings,offers,cloakers}
  chown -R deployops:deployops /opt/deployops
  ok "розпаковано ($(du -sh /opt/deployops 2>/dev/null | awk '{print $1}'))"

  # перевірка критичних файлів
  [ -f /opt/deployops/package.json ]              || die "після розпаковки немає package.json"
  [ -f /opt/deployops/docker/docker-compose.yml ] || die "після розпаковки немає docker/docker-compose.yml"
  ok "package.json + docker-compose.yml присутні"
}

# ──────────────────────────────────────────────────────────────────────────────
# ALL — bootstrap + unpack + deploy в один прохід (потрібен архів!)
# ──────────────────────────────────────────────────────────────────────────────
cmd_all() {
  require_root
  require_env DOMAIN ADMIN_EMAIL ADMIN_PASSWORD LE_EMAIL
  if [ "${ALLOW_PASSWORD_SSH:-0}" != "1" ]; then
    require_env SSH_PUBLIC_KEY
  fi
  cmd_bootstrap
  cmd_unpack
  cmd_deploy
}

# ──────────────────────────────────────────────────────────────────────────────
# КРОК 2: DEPLOY — після SFTP-заливки файлів (або після cmd_unpack)
# ──────────────────────────────────────────────────────────────────────────────
cmd_deploy() {
  require_root
  require_env DOMAIN ADMIN_EMAIL ADMIN_PASSWORD LE_EMAIL

  # перевірка спецсимволів у паролі (bash history-expansion / sed-substitution)
  if echo "$ADMIN_PASSWORD" | grep -q '[!`"\\]'; then
    die "ADMIN_PASSWORD містить ! \` \" або \\ — це ламає bash heredoc. Використай тільки букви/цифри/_-."
  fi
  if echo "$ADMIN_PASSWORD" | grep -q '\$'; then
    warn "ADMIN_PASSWORD містить \$ — переконайся, що передаєш у одинарних лапках 'pass\$word'."
  fi

  cd /opt/deployops
  [ -f package.json ]                       || die "/opt/deployops/package.json не знайдено — спочатку залий проєкт через SFTP."
  [ -f docker/docker-compose.yml ]          || die "docker/docker-compose.yml відсутній."
  if ! grep -q '127\.0\.0\.1:5433:5432' docker/docker-compose.yml; then
    die "У docker/docker-compose.yml має бути \"127.0.0.1:5433:5432\". Виправ і запусти ще раз."
  fi

  # bsdtar (libarchive-tools) потрібен для fallback розпакування на target-VPS,
  # коли UnZip 6.10+ блокує валідні архіви з "overlapping components" як zip-bomb.
  # Ставимо ідемпотентно — apt сам пропустить, якщо вже стоїть.
  if ! command -v bsdtar >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
    log "0/8  Доустановка libarchive-tools + unzip (для bsdtar fallback)"
    DEBIAN_FRONTEND=noninteractive apt-get -y -qq install libarchive-tools unzip >/dev/null
    ok "bsdtar: $(command -v bsdtar || echo not-installed) / unzip: $(command -v unzip || echo not-installed)"
  fi

  log "1/8  Генерація .env (ідемпотентно)"
  if [ -f .env ] && grep -q '^POSTGRES_PASSWORD=' .env && grep -q '^AUTH_SECRET=' .env; then
    ok ".env уже існує і виглядає валідним — пропускаю генерацію (щоб не зламати postgres)"
  else
    if [ -f .env ]; then
      cp .env ".env.backup-$(date +%s)"
      warn ".env неповний — створено backup .env.backup-* і генерую новий"
    fi
    AUTH_SECRET_VAL=$(openssl rand -base64 32)
    NEXTAUTH_SECRET_VAL=$(openssl rand -base64 32)
    DEPLOYOPS_SECRET_VAL=$(openssl rand -base64 32)
    PG_DB_PWD=$(openssl rand -hex 16)
    PG_ADMIN_PWD=$(openssl rand -hex 12)
    cat > .env <<EOF
NODE_ENV=production
DATABASE_URL="postgresql://deployops:${PG_DB_PWD}@127.0.0.1:5433/deployops?schema=public"
POSTGRES_PASSWORD=${PG_DB_PWD}
AUTH_SECRET="${AUTH_SECRET_VAL}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET_VAL}"
AUTH_URL="https://${DOMAIN}"
NEXTAUTH_URL="https://${DOMAIN}"
AUTH_TRUST_HOST="true"
DEPLOYOPS_SECRET_KEY="${DEPLOYOPS_SECRET_VAL}"
SEED_ADMIN_EMAIL="${ADMIN_EMAIL}"
SEED_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
PGADMIN_EMAIL="${ADMIN_EMAIL}"
PGADMIN_PASSWORD="${PG_ADMIN_PWD}"
UPLOAD_MAX_SIZE_MB=512
ZIP_MAX_ENTRIES=10000
ZIP_MAX_TOTAL_BYTES=524288000
DEPLOYOPS_RATE_LIMIT_PER_MIN=5
EOF
    chown deployops:deployops .env
    chmod 600 .env
    unset AUTH_SECRET_VAL NEXTAUTH_SECRET_VAL DEPLOYOPS_SECRET_VAL PG_DB_PWD PG_ADMIN_PWD
    ok ".env згенеровано (chmod 600, owner deployops)"
  fi

  log "2/8  Postgres у Docker (127.0.0.1:5433)"
  docker compose --env-file /opt/deployops/.env -f docker/docker-compose.yml up -d postgres
  echo -n "  чекаю healthy"
  for i in $(seq 1 30); do
    if docker exec deployops_postgres pg_isready -U deployops -d deployops >/dev/null 2>&1; then
      echo " ✓"
      break
    fi
    echo -n .
    sleep 1
  done
  ss -tlnp | grep -E '127\.0\.0\.1:5433' >/dev/null || die "Postgres не слухає на 127.0.0.1:5433 — перевір docker-compose.yml"
  # SECURITY: жодного LISTEN на 5433 ззовні 127.0.0.1.
  if ss -tlnp | grep -E ':5433' | grep -vE '127\.0\.0\.1:5433' >/dev/null; then
    die "ALARM: postgres слухає НЕ ТІЛЬКИ 127.0.0.1:5433. Це той самий вектор RCE через COPY FROM PROGRAM."
  fi
  ok "postgres up, only 127.0.0.1:5433"

  log "2.5/8  Postgres hardening (ALTER deployops NOSUPERUSER)"
  # SECURITY: postgres-image створює POSTGRES_USER як SUPERUSER. SUPERUSER
  # автоматично має `COPY ... TO PROGRAM '...'` — саме цей механізм
  # експлуатували при попередніх компрометаціях для RCE з postgres-контейнера.
  # NOSUPERUSER забороняє COPY PROGRAM але лишає всі привілеї на власні таблиці
  # (Prisma migrate/seed працює без проблем).
  docker exec -i deployops_postgres psql -U deployops -d postgres -c "ALTER USER deployops NOSUPERUSER;" >/dev/null 2>&1 || true
  IS_SU=$(docker exec -i deployops_postgres psql -U deployops -d postgres -tA -c "SELECT usesuper FROM pg_user WHERE usename='deployops';" 2>/dev/null | tr -d '[:space:]')
  if [ "$IS_SU" = "f" ]; then
    ok "deployops: NOSUPERUSER (COPY ... TO PROGRAM заблоковано)"
  else
    warn "не вдалось зняти SUPERUSER з deployops (зараз: '$IS_SU')"
  fi

  log "3/8  pnpm install + Prisma + seed admin"
  sudo -u deployops bash -lc 'cd /opt/deployops && pnpm install --frozen-lockfile'
  sudo -u deployops bash -lc 'cd /opt/deployops && pnpm exec prisma generate'
  sudo -u deployops bash -lc 'cd /opt/deployops && pnpm exec prisma migrate deploy'
  sudo -u deployops bash -lc 'cd /opt/deployops && pnpm exec prisma db seed'
  ADMIN_DB=$(docker exec -i deployops_postgres psql -U deployops -d deployops -tA -c "SELECT email FROM \"User\" WHERE role='admin' LIMIT 1;" 2>/dev/null || true)
  [ "$ADMIN_DB" = "$ADMIN_EMAIL" ] && ok "admin in DB: $ADMIN_DB" || warn "admin in DB: '$ADMIN_DB' (expected '$ADMIN_EMAIL')"

  log "4/8  pnpm build"
  sudo -u deployops bash -lc 'cd /opt/deployops && pnpm build'
  ok "next build done"

  log "5/8  pm2 (запуск + autostart)"
  sudo -u deployops bash -lc 'cd /opt/deployops && pm2 delete deployops >/dev/null 2>&1 || true'
  sudo -u deployops bash -lc 'cd /opt/deployops && pm2 start "pnpm start" --name deployops --cwd /opt/deployops --update-env'
  sudo -u deployops bash -lc 'pm2 save'
  if ! systemctl list-unit-files | grep -q '^pm2-deployops\.service'; then
    env PATH="$PATH:/usr/bin" pm2 startup systemd -u deployops --hp /home/deployops >/dev/null
    sudo -u deployops bash -lc 'pm2 save'
  fi
  ok "pm2 status: $(sudo -u deployops pm2 jlist 2>/dev/null | grep -o '"status":"[^"]*"' | head -1)"

  log "6/8  nginx vhost"
  # SECURITY/UX: X-Forwarded-Proto.
  # При SKIP_CERTBOT=1 ми за Cloudflare/іншим reverse-proxy, який вже робить HTTPS.
  # Якщо передати $scheme (http, бо nginx на 80), middleware у Next.js
  # робить redirect на "https://" і генерує URL з localhost:3000 → ERR_CONNECTION_REFUSED.
  # Тому форсимо "https" коли HTTPS терминає CF, інакше — динамічний $scheme.
  local XFP_VALUE
  if [ "${SKIP_CERTBOT:-0}" = "1" ]; then
    XFP_VALUE="https"
  else
    XFP_VALUE="\$scheme"
  fi
  cat > /etc/nginx/sites-available/${DOMAIN} <<EOF
server {
  listen 80;
  server_name ${DOMAIN} www.${DOMAIN};
  client_max_body_size 600m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto ${XFP_VALUE};
    proxy_set_header Upgrade           \$http_upgrade;
    proxy_set_header Connection        "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
  }
}
EOF
  ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
  nginx -t
  systemctl reload nginx
  ok "nginx vhost для ${DOMAIN}"

  log "7/8  HTTPS"
  if [ "${SKIP_CERTBOT:-0}" = "1" ]; then
    ok "SKIP_CERTBOT=1 — пропускаю Let's Encrypt (домен за Cloudflare-проксі — SSL дає CF)"
  elif certbot certificates 2>/dev/null | grep -q "Domains: ${DOMAIN}"; then
    ok "сертифікат уже існує — пропускаю"
  else
    certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" \
      --redirect --agree-tos -m "${LE_EMAIL}" -n \
      || warn "certbot не вдався (DNS не пройшов?). Відкрий http://${DOMAIN} і потім руками: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
  fi

  log "8/8  Перевірка"
  sleep 3
  HTTPS_CODE=$(curl -sk -o /dev/null -w '%{http_code}' "https://${DOMAIN}/login" || echo 000)
  ok "https://${DOMAIN}/login → HTTP ${HTTPS_CODE}"
  ok "pm2:        $(sudo -u deployops pm2 list --no-color 2>/dev/null | grep deployops | awk '{print $10}')"
  ok "postgres:   $(docker ps --format '{{.Status}}' --filter name=deployops_postgres)"
  ok "ufw:        $(ufw status | head -1)"
  ok "fail2ban:   $(systemctl is-active fail2ban)"

  cat <<EOF

═══════════════════════════════════════════════════════════════════════════════
🎉 ГОТОВО! Заходь:

    URL:      https://${DOMAIN}
    email:    ${ADMIN_EMAIL}
    password: ${ADMIN_PASSWORD}

Перші дії в панелі:
  • /admin/users — зміни пароль адміна, додай team-leads/buyer-ів
  • /servers     — додай свої SSH-сервери (паролі шифруються DEPLOYOPS_SECRET_KEY)
  • /admin/setups — типи розгортань (Hestia, React build, …)
  • /domains, /templates, /packs — додай контент і запусти /deploy

Після першого входу:
  • видали SEED_ADMIN_PASSWORD з .env (закоментуй або обнули)
  • збережи .env у менеджер паролів — там критичні секрети
═══════════════════════════════════════════════════════════════════════════════
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# main
# ──────────────────────────────────────────────────────────────────────────────
case "${1:-}" in
  bootstrap)  cmd_bootstrap ;;
  unpack)     cmd_unpack    ;;
  deploy)     cmd_deploy    ;;
  all)        cmd_all       ;;
  *)
    cat <<EOF
usage:  bash setup.sh <command>

  bootstrap   ENV: DOMAIN  SSH_PUBLIC_KEY  [MY_IP]
              або: DOMAIN  ALLOW_PASSWORD_SSH=1  [DEPLOYOPS_PASSWORD]  [MY_IP]
              стадія 1 — apt, docker, node, юзер deployops, SSH, ufw, fail2ban

  unpack      ENV: [ARCHIVE=/path/to/deployops.tar.gz]
              розпаковує архів у /opt/deployops і робить chown deployops:deployops

  deploy      ENV: DOMAIN  ADMIN_EMAIL  ADMIN_PASSWORD  LE_EMAIL  [SKIP_CERTBOT=1]
              стадія 2 — .env, postgres, prisma migrate+seed, pnpm build, pm2,
                         nginx vhost, Let's Encrypt

  all         ENV: DOMAIN  ADMIN_EMAIL  ADMIN_PASSWORD  LE_EMAIL
                   + SSH_PUBLIC_KEY  АБО  ALLOW_PASSWORD_SSH=1
                   [MY_IP] [ARCHIVE] [SKIP_CERTBOT=1] [DEPLOYOPS_PASSWORD]

──────────────────────────────────────────────────────────────────────────────
ВАРІАНТ A — одна команда (з tar.gz архівом)
──────────────────────────────────────────────────────────────────────────────
  # на ПК:
  ssh-keygen -t ed25519 -f ~/.ssh/deployops -C deployops
  powershell -ExecutionPolicy Bypass -File scripts\\pack.ps1     # → deployops.tar.gz
  scp scripts/setup.sh deployops.tar.gz root@<IP>:/root/

  # на сервері (одна команда):
  ssh root@<IP> "DOMAIN=deployops.example.com \\
    SSH_PUBLIC_KEY='\$(cat /root/deployops.pub)' \\
    MY_IP=<YOUR_PUBLIC_IP> \\
    ADMIN_EMAIL=admin@deployops.example.com \\
    ADMIN_PASSWORD='ChangeMe_LongAndStrong' \\
    LE_EMAIL=admin@deployops.example.com \\
    bash /root/setup.sh all"

  # Якщо домен ЗА CLOUDFLARE (proxy on, SSL від CF):
  ssh root@<IP> "DOMAIN=deployops.example.com \\
    SSH_PUBLIC_KEY='\$(cat /root/deployops.pub)' \\
    MY_IP=<YOUR_PUBLIC_IP> \\
    ADMIN_EMAIL=admin@deployops.example.com \\
    ADMIN_PASSWORD='ChangeMe_LongAndStrong' \\
    LE_EMAIL=admin@deployops.example.com \\
    SKIP_CERTBOT=1 \\
    bash /root/setup.sh all"

──────────────────────────────────────────────────────────────────────────────
ВАРІАНТ B — дві команди (з SFTP-заливкою між ними)
──────────────────────────────────────────────────────────────────────────────
  scp setup.sh root@<IP>:/root/
  ssh root@<IP>
  DOMAIN=deployops.example.com SSH_PUBLIC_KEY="..." MY_IP=... \\
    bash /root/setup.sh bootstrap
  # → SFTP залив проєкт у /opt/deployops як deployops (ключем deployops)
  DOMAIN=deployops.example.com ADMIN_EMAIL=... ADMIN_PASSWORD='...' LE_EMAIL=... \\
    bash /opt/deployops/scripts/setup.sh deploy
EOF
    exit 1
    ;;
esac
