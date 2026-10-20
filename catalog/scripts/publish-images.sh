#!/bin/bash
# Makes the published copies of the approved product images: 800 px JPEGs in public/catalog,
# served by our own site. Run after generate-images.mjs.
set -e
mkdir -p public/catalog
for f in catalog/raw/*.png; do
  slug=$(basename "$f" .png)
  out="public/catalog/$slug.jpg"
  [ "$out" -nt "$f" ] && continue
  sips -s format jpeg -s formatOptions 80 -Z 800 "$f" --out "$out" >/dev/null
done
ls public/catalog/*.jpg | wc -l | xargs echo "published images:"
