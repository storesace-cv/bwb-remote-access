SoT Block: APK Distribution

Purpose

Provide a stable, human-friendly download endpoint for the internal Android app “BWB - Android Provisioner” and a canonical static APK URL served by rustdesk.bwb.pt, suitable for in-app browser installs and for embedding in internal onboarding pages.

Public Endpoints (Canonical)
	1.	Human endpoint (recommended for humans / onboarding pages)
	•	GET https://rustdesk.bwb.pt/apk/bwb-android-provisioner/latest
	•	Behaviour: HTTP 302 redirect to /apk/bwb-android-provisioner/latest.apk
	2.	Canonical APK file (recommended for automated fetchers / direct download)
	•	GET https://rustdesk.bwb.pt/apk/bwb-android-provisioner/latest.apk
	•	Content-Type: application/vnd.android.package-archive
	•	Headers:
	•	X-Content-Type-Options: nosniff
	•	Cache-Control: no-store
	•	Content-Disposition: attachment

Server-side Storage (Droplet)
	•	Canonical file path (single source of truth):
	•	/var/www/apk/bwb-android-provisioner/latest.apk
	•	The server must serve only from this directory for the provisioner APK distribution.

Nginx Contract
	•	Nginx must expose:
	•	location = /apk/bwb-android-provisioner/latest → 302 to /apk/bwb-android-provisioner/latest.apk
	•	location ^~ /apk/bwb-android-provisioner/ → alias /var/www/apk/bwb-android-provisioner/ and try_files $uri =404
	•	Autoindex must be off.
	•	No fallback routing to the frontend for these paths.

Deployment & Release Procedure (Operational)

The authoritative method for building and deploying the APK is the canonical script:
`scripts/build-and-deploy-android.sh`

Usage:
```bash
# Must be run from project root
./scripts/build-and-deploy-android.sh [release]
```

This script handles the entire pipeline:
1.  **Clean**: Removes previous build artifacts (`./gradlew clean`).
2.  **Build**: Assembles the release APK (`./gradlew :provisionerApp:assembleRelease`).
    -   Expected output: `provisionerApp/build/outputs/apk/release/provisionerApp-release-unsigned.apk`
3.  **Sign**: Signs the APK using `apksigner` with the provided keystore.
    -   Requires Environment Variables: `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
4.  **Verify**: Checks the signature and calculates local SHA256.
5.  **Deploy**: Uploads the signed APK to the Droplet (`/var/www/apk/bwb-android-provisioner`).
6.  **Validate**: Verifies the remote SHA256 matches local and tests the HTTP endpoint.

QA Validation Checklist (must pass)

Run after every deployment (automatically handled by the script, but manual verification recommended):
	1.	curl -I https://rustdesk.bwb.pt/apk/bwb-android-provisioner/latest
	•	Expect: 302 and Location: /apk/bwb-android-provisioner/latest.apk
	2.	curl -I https://rustdesk.bwb.pt/apk/bwb-android-provisioner/latest.apk
	•	Expect:
	•	200
	•	Content-Type: application/vnd.android.package-archive
	•	X-Content-Type-Options: nosniff
	•	Cache-Control: no-store
	•	Content-Disposition: attachment
	3.	Browser test (Android / Android TV):
	•	Open the human endpoint in the device browser.
	•	Confirm the APK downloads and installation prompt appears.

Non-goals / Constraints
	•	No ABI selection for this APK (single “latest.apk” only).
	•	No changes to backend provisioning contracts or endpoints implied by this distribution mechanism.
	•	The provisioning server does not “wait” for the device; the device initiates provisioning after installation.