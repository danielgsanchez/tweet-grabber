#!/bin/sh
# Builds tweet-grabber.user.js from the extension's source files.
# Run it after changing the extension: sh userscript/build.sh
# On Windows, run it from Git Bash.
set -eu

cd "$(dirname "$0")/.."

# Bytes, not characters, so non-ASCII text passes through every awk and sed untouched.
LC_ALL=C
export LC_ALL

TEMPLATE=userscript/template.js
TARGET=tweet-grabber.user.js
TAB=$(printf '\t')

manifest_value() {
  tr -d '\r' < manifest.json | sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" | head -n 1
}

# Turns stdin into the inside of a JavaScript string literal. A final newline in the
# input is kept, as \n, only if the input ends with one.
escape_js() {
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e "s/$TAB/\\\\t/g" |
    awk 'NR > 1 { printf "\\n" } { printf "%s", $0 }'
}

# The popup's page rules become rules for the panel inside its shadow root.
panel_css() {
  tr -d '\r' < popup.css | sed -e 's/:root {/:host {/g' -e 's/body {/.tg-panel {/g'
  cat <<'EOF'

:host {
  position: fixed;
  z-index: 2147483647;
  top: 16px;
  right: 16px;
}

:host([hidden]) {
  display: none;
}

.tg-panel {
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.tg-panel > button + button {
  margin-left: 8px;
}
EOF
}

# Only the markup between <body> and the first <script> is needed, without surrounding space.
panel_html() {
  tr -d '\r' < popup.html | awk '
    !inside { if (index($0, "<body>")) inside = 1; next }
    index($0, "<script") { exit }
    { lines[++count] = $0 }
    END {
      while (count > 0 && lines[count] ~ /^[ \t]*$/) count--
      first = 1
      while (first <= count && lines[first] ~ /^[ \t]*$/) first++
      sub(/^[ \t]+/, "", lines[first])
      sub(/[ \t]+$/, "", lines[count])
      for (i = first; i <= count; i++) print lines[i]
    }'
}

for placeholder in '{{VERSION}}' '{{DESCRIPTION}}' '{{filename.js}}' '{{page-hook.js}}' \
  '{{content.css}}' '{{content.js}}' '{{popup.css}}' '{{popup.html}}' '{{popup.js}}'; do
  grep -qF "$placeholder" "$TEMPLATE" || {
    echo "Placeholder $placeholder not found in the template" >&2
    exit 1
  }
done

VERSION=$(manifest_value version)
DESCRIPTION=$(manifest_value description)
# The text ends with "\n" only for content.css, whose file ends with a newline.
CONTENT_CSS="\"$(tr -d '\r' < content.css | escape_js)\\n\""
POPUP_CSS="\"$(panel_css | escape_js)\""
POPUP_HTML="\"$(panel_html | escape_js)\""
export VERSION DESCRIPTION CONTENT_CSS POPUP_CSS POPUP_HTML

# ENVIRON, unlike awk -v, leaves the backslashes in these values alone.
tr -d '\r' < "$TEMPLATE" | awk '
  function replace(line, key, value, at) {
    at = index(line, key)
    if (at == 0) return line
    return substr(line, 1, at - 1) value substr(line, at + length(key))
  }
  function include(file, line) {
    while ((getline line < file) > 0) {
      gsub(/\r/, "", line)
      print line
    }
    close(file)
    print ""
  }
  $0 == "{{filename.js}}" { include("filename.js"); next }
  $0 == "{{page-hook.js}}" { include("page-hook.js"); next }
  $0 == "{{content.js}}" { include("content.js"); next }
  $0 == "{{popup.js}}" { include("popup.js"); next }
  {
    line = $0
    line = replace(line, "{{VERSION}}", ENVIRON["VERSION"])
    line = replace(line, "{{DESCRIPTION}}", ENVIRON["DESCRIPTION"])
    line = replace(line, "{{content.css}}", ENVIRON["CONTENT_CSS"])
    line = replace(line, "{{popup.css}}", ENVIRON["POPUP_CSS"])
    line = replace(line, "{{popup.html}}", ENVIRON["POPUP_HTML"])
    print line
  }
' > "$TARGET.tmp"
mv "$TARGET.tmp" "$TARGET"

echo "Built $TARGET (version $VERSION, $(wc -c < "$TARGET" | tr -d ' ') bytes)"
