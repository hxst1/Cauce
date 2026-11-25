#!/usr/bin/env bash
# Builds Cauce and installs it for your user (no root):
#   ~/.local/lib/cauce        the app
#   ~/.local/bin/cauce        the launcher
#   ~/.local/share/applications/cauce.desktop   (and the icon in the hicolor theme)
# Run it again to update.
set -euo pipefail

cd "$(dirname "$0")/.."
DATOS="${XDG_DATA_HOME:-$HOME/.local/share}"
APP="$HOME/.local/lib/cauce"
LANZADOR="$HOME/.local/bin/cauce"

echo "→ Building…"
pnpm install --frozen-lockfile
pnpm empaquetar

echo "→ Installing to $APP…"
mkdir -p "$(dirname "$APP")" "$(dirname "$LANZADOR")" "$DATOS/applications"
rm -rf "$APP.nuevo"
cp -a dist/linux-unpacked "$APP.nuevo"
rm -rf "$APP.viejo"
[ -d "$APP" ] && mv "$APP" "$APP.viejo"
mv "$APP.nuevo" "$APP"
rm -rf "$APP.viejo"

cat > "$LANZADOR" <<LANZA
#!/usr/bin/env bash
# Cauce launcher (installed by scripts/instalar.sh).
exec "$APP/cauce" "\$@"
LANZA
chmod +x "$LANZADOR"

for t in 64 128 256; do
  mkdir -p "$DATOS/icons/hicolor/${t}x${t}/apps"
  magick resources/cauce.png -resize "${t}x${t}" "$DATOS/icons/hicolor/${t}x${t}/apps/cauce.png" 2>/dev/null ||
    cp resources/cauce.png "$DATOS/icons/hicolor/${t}x${t}/apps/cauce.png"
done
mkdir -p "$DATOS/icons/hicolor/scalable/apps"
cp resources/cauce.svg "$DATOS/icons/hicolor/scalable/apps/cauce.svg"

cat > "$DATOS/applications/cauce.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Cauce
GenericName=Git Client
Comment=A beautiful, minimal Git client
Keywords=git;vcs;commit;branch;rama;
Exec=$LANZADOR %F
Icon=cauce
StartupWMClass=cauce
Categories=Development;RevisionControl;
Terminal=false
DESK

command -v update-desktop-database >/dev/null && update-desktop-database "$DATOS/applications" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$DATOS/icons/hicolor" || true

echo "✓ Cauce installed. Open it from your app launcher or run \"cauce\"."
echo "  If Cauce was running, quit it (Ctrl+Q) and open it again."
