#!/bin/sh
# Chatty Cat in your browser: runs the bundled chat server on this computer and
# opens it in the default browser. Shipped as `chatty-cat` in the browser
# release archives. Press Ctrl+C to stop the server; that also signs you out.
set -eu

dir=$(cd "$(dirname "$0")" && pwd)
port=47830
url="http://localhost:$port/"

ready() {
	curl -fsS -o /dev/null "http://127.0.0.1:$port/api/ready" 2>/dev/null
}

open_browser() {
	if [ -n "${BROWSER:-}" ]; then
		$BROWSER "$url"
	elif command -v xdg-open >/dev/null 2>&1; then
		xdg-open "$url"
	elif command -v open >/dev/null 2>&1; then
		open "$url"
	fi
}

# The desktop app may already be serving this port; reuse it.
if ready; then
	echo "Chatty Cat is already running at $url"
	open_browser
	exit 0
fi

# As in the desktop app, server settings come only from here: never from a stray
# .env file or the user's environment. Only the registered public client ID ships.
for name in $(env | sed -nE 's/^((CHATTY_CAT|TWITCH|GIPHY)_[A-Za-z0-9_]*)=.*/\1/p'); do
	unset "$name"
done
client=$(sed -nE 's/.*"clientID" *: *"([^"]+)".*/\1/p' "$dir/twitch-client.json")
export CHATTY_CAT_ADDR="127.0.0.1:$port"
export CHATTY_CAT_ASSETS="$dir/web/dist"
export CHATTY_CAT_ENV_FILE=/dev/null
export CHATTY_CAT_PUBLIC_URL="http://localhost:$port"
export TWITCH_PUBLIC_CLIENT=true
export TWITCH_CLIENT_ID="$client"

# Open the browser once the server answers; the server itself stays in the foreground.
(
	i=0
	until ready; do
		i=$((i + 1))
		[ "$i" -lt 150 ] || exit 0
		sleep 0.1
	done
	echo "Chatty Cat is running at $url. Press Ctrl+C to stop it."
	open_browser
) &
exec "$dir/chatty-cat-server"
