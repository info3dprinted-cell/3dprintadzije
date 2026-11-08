#!/bin/sh
# Pravi index.html iz src/index.src.html
sed -e 's#__ICON__#/favicon.png#g' -e 's#__FULL__#/logo.png#g' src/index.src.html > index.html
