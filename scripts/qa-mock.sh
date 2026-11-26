#!/bin/sh
# Run only through tools/codex-build/drun.sh --net (Node image).
set -eu
npm install --prefix /tmp/ug-qa --no-save --package-lock=false playwright@1.58.0
# The runner is unprivileged. Extract browser libraries in /tmp instead of installing as root.
mkdir -p /tmp/ug-apt/lists/partial /tmp/ug-apt/archives/partial /tmp/ug-apt/root
apt-get -qq -o Dir::State::lists=/tmp/ug-apt/lists -o Debug::NoLocking=1 update
apt-get -qq -o Dir::State::lists=/tmp/ug-apt/lists -o Dir::Cache::archives=/tmp/ug-apt/archives -o Debug::NoLocking=1 --download-only --no-install-recommends -y install libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libx11-6 libxcb1 libxkbcommon0 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2
for qa_deb in /tmp/ug-apt/archives/*.deb; do dpkg-deb -x "$qa_deb" /tmp/ug-apt/root; done
LD_LIBRARY_PATH=$(find /tmp/ug-apt/root -type d -name '*-linux-gnu' | paste -sd:)
export LD_LIBRARY_PATH
cat >/tmp/ug-fonts.conf <<'EOF'
<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>/tmp/ug-apt/root/usr/share/fonts</dir><cachedir>/tmp/ug-font-cache</cachedir></fontconfig>
EOF
export FONTCONFIG_FILE=/tmp/ug-fonts.conf
/tmp/ug-qa/node_modules/.bin/playwright install chromium
MOCK=1 DATA_DIR=/tmp/ug-shots PORT=8080 node server.mjs >/tmp/ug-server.log 2>&1 &
qa_server_pid=$!
trap 'kill "$qa_server_pid" 2>/dev/null || true' EXIT
export NODE_PATH=/tmp/ug-qa/node_modules
node scripts/e2e-mock.cjs
if [ "${1:-}" != "--no-shots" ]; then node scripts/shots.cjs; fi
