#!/usr/bin/env sh
# Minimal Gradle wrapper shim for this repo.
# It delegates to the Gradle installation available on the system (or in CI).
# To generate a full Gradle wrapper with embedded distribution handling, run:
#   gradle wrapper --gradle-version 8.7
exec gradle "$@"