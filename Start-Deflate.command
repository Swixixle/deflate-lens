#!/bin/bash
# Double-click this file in Finder to prepare and open the local application.
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Deflate Lens needs Node.js. Install the LTS version from https://nodejs.org, then open this file again."
  read -r -p "Press Return to close. "
  exit 1
fi
npm run setup && npm run launch
result=$?
if [ "$result" -ne 0 ] && [ "$result" -ne 130 ]; then
  echo "Deflate Lens stopped. The error and next step are shown above."
  read -r -p "Press Return to close. "
fi
exit "$result"
