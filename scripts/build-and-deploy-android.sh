#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Build & Deploy Android APK (Canonical Script)
# Owner: Local operator (Jorge)
# CI/AI systems MUST NOT modify the immutable blocks below.
###############################################################################

BUILD_TYPE="${1:-release}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs/android-build"
TS="$(date -u +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/build-and-deploy-$TS.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Build e Deploy de Android APK para Droplet          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo
echo "📍 Repositório: $ROOT_DIR"
echo "📍 Build Type:  $BUILD_TYPE"
echo "📍 Log local:   $LOG_FILE"
echo

###############################################################################
# ENVIRONMENT NORMALISATION (EDITABLE)
###############################################################################

if [[ "$(uname)" == "Darwin" ]]; then
  if [[ -z "${JAVA_HOME:-}" ]]; then
    export JAVA_HOME="/Library/Java/JavaVirtualMachines/liberica-jdk-17.jdk/Contents/Home"
    echo "☕ JAVA_HOME forçado para Java 17: $JAVA_HOME"
  fi
fi

cd "$ROOT_DIR"

###############################################################################
# CLEAN + BUILD (EDITABLE BY SOFTGEN)
###############################################################################

echo
echo "🧹 A limpar builds anteriores..."
./gradlew clean

echo
echo "🔨 A compilar APK ($BUILD_TYPE)..."
./gradlew :provisionerApp:assembleRelease

UNSIGNED_APK="provisionerApp/build/outputs/apk/release/provisionerApp-release-unsigned.apk"

if [[ ! -f "$UNSIGNED_APK" ]]; then
  echo "❌ APK não encontrado em $UNSIGNED_APK"
  exit 1
fi

###############################################################################
### BEGIN IMMUTABLE SIGNING BLOCK — DO NOT MODIFY
###############################################################################

: "${KEYSTORE_FILE:?Missing KEYSTORE_FILE}"
: "${KEYSTORE_PASSWORD:?Missing KEYSTORE_PASSWORD}"
: "${KEY_ALIAS:?Missing KEY_ALIAS}"
: "${KEY_PASSWORD:?Missing KEY_PASSWORD}"

ANDROID_BUILD_TOOLS="${ANDROID_BUILD_TOOLS:-35.0.1}"
APKSIGNER="$ANDROID_HOME/build-tools/$ANDROID_BUILD_TOOLS/apksigner"
SIGNED_APK="/tmp/bwb-android-provisioner-release.apk"

echo
echo "🔏 A assinar APK com apksigner..."
"$APKSIGNER" sign \
  --ks "$KEYSTORE_FILE" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass pass:"$KEYSTORE_PASSWORD" \
  --key-pass pass:"$KEY_PASSWORD" \
  --out "$SIGNED_APK" \
  "$UNSIGNED_APK"

"$APKSIGNER" verify --verbose "$SIGNED_APK"

LOCAL_SHA="$(shasum -a 256 "$SIGNED_APK" | awk '{print $1}')"
echo "🔐 SHA256 local: $LOCAL_SHA"

###############################################################################
### END IMMUTABLE SIGNING BLOCK
###############################################################################

###############################################################################
### BEGIN IMMUTABLE DEPLOY BLOCK — DO NOT MODIFY
###############################################################################

DROPLET="root@46.101.78.179"
REMOTE_DIR="/var/www/apk/bwb-android-provisioner"
SNAP="latest-$TS.apk"
URL="https://rustdesk.bwb.pt/apk/bwb-android-provisioner/latest.apk"

echo
echo "🔌 A testar ligação SSH ao droplet..."
ssh "$DROPLET" "echo OK" >/dev/null

echo
echo "🚚 A enviar APK para o droplet..."
ssh "$DROPLET" "mkdir -p '$REMOTE_DIR'"
scp "$SIGNED_APK" "$DROPLET:$REMOTE_DIR/$SNAP"

ssh "$DROPLET" "set -e;
  cd '$REMOTE_DIR';
  cp -f '$SNAP' latest.apk;
  chmod 0644 latest.apk '$SNAP';
  sha256sum latest.apk;
"

REMOTE_SHA="$(ssh "$DROPLET" "sha256sum '$REMOTE_DIR/latest.apk' | awk '{print \$1}'")"

echo "LOCAL : $LOCAL_SHA"
echo "REMOTE: $REMOTE_SHA"

test "$LOCAL_SHA" = "$REMOTE_SHA" || {
  echo "❌ SHA mismatch!"
  exit 1
}

echo
echo "🌐 Prova via HTTP HEAD (cache-bust)..."
curl -sI "$URL?ts=$(date +%s)" | egrep -i "HTTP/|content-length|last-modified|etag"

###############################################################################
### END IMMUTABLE DEPLOY BLOCK
###############################################################################

echo
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                  ✅ Deploy Concluído                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo
echo "📱 APK:"
echo "   $URL"
echo "🧾 Snapshot:"
echo "   $SNAP"
echo "🔐 SHA256:"
echo "   $LOCAL_SHA"
echo "📄 Log:"
echo "   $LOG_FILE"
