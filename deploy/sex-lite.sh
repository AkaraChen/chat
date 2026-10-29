#!/usr/bin/env bash
# Builds the sex-lite image (web search and fetch over MCP, see docs/deploy.md)
# from a pinned commit of https://github.com/AkaraChen/sex and pushes it to the
# registry Kamal deploys from. Run it before `kamal accessory boot sex`, and
# again after changing SEX_LITE_REF here and in config/deploy.yml.
set -euo pipefail

SEX_LITE_REF=4017f2fe3e5072ff3311daf0a5255479c09c4e08
registry=${KAMAL_REGISTRY:-localhost:5555}
image="$registry/sex-lite:${SEX_LITE_REF:0:12}"

docker build --platform "linux/${KAMAL_ARCH:-amd64}" --target lite -t "$image" \
  "https://github.com/AkaraChen/sex.git#$SEX_LITE_REF"
docker push "$image"
echo "$image"
