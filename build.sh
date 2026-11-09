#!/bin/sh
# Pravi index.html iz src/index.src.html (+ src/app-accounts.js)
python3 - <<'PY'
h=open("src/index.src.html").read()
js=open("src/app-accounts.js").read()
h=h.replace("/*__ACCOUNTS__*/",js).replace("__ICON__","/favicon.png").replace("__FULL__","/logo.png")
open("index.html","w").write(h)
PY
