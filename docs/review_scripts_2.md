Subject: Fix pipeline issue — missing source folders in Step-1 → Step-4 prevents Next.js production build

Before acting, please fully load and internalize all scripts from Step-1 to Step-4 inside the Softgen project:
	•	Step-1-download-from-main.sh
	•	Step-2-build-local.sh
	•	Step-3-test-local.sh
	•	Step-4-deploy-tested-build.sh

⸻

Problem Summary (detected during deployment to the droplet):

The deployment to the droplet succeeded up to Step-4, but the Next.js application fails to build in production because multiple required source directories never arrive in the droplet build folder.

The error produced on the server is:

Error: Could not find a production build in the '.next' directory.
Turbopack build failed with multiple errors:
Module not found: Can't resolve '@/integrations/supabase/client'
Module not found: Can't resolve '@/lib/debugLogger'
Module not found: Can't resolve '@/lib/grouping'
Module not found: Can't resolve '@/services/authService'
Module not found: Can't resolve '../../package.json'

✔ Root Cause (confirmed):

Your Step-1 download and Step-2/Step-3 local build processes only sync a partial frontend, and do NOT include the directories that the production build requires, such as:
	•	/src/integrations/supabase/
	•	/src/lib/
	•	/src/services/
	•	/package.json (relative path from /app/page.tsx)
	•	Any other alias-mapped modules referenced via @/...

This means:

**The code being built on the droplet is incomplete.

The .next production build cannot be created.
Therefore port 3000 never opens and NGINX returns 502.**

Nothing is wrong with MeshCentral, RustDesk, NGINX, PM2, or your droplet setup.
The problem is purely in the Softgen build/export pipeline.

⸻

What the Softgen pipeline must correct (recommendations — YOU decide the final approach):

1. Ensure Step-1 downloads the full repository tree

Right now Step-1 brings only part of the project.
You must choose whether to:
	•	Download the entire repository (recommended), or
	•	Explicitly include missing directories in rsync/export patterns.

Without this fix, Step-2 and Step-4 will never produce a working app.

⸻

2. Ensure Step-2 local build uses the complete source tree

Your local build currently succeeds because your local machine has the missing folders, but the droplet does not.

Your pipeline must ensure:
	•	The local build uses the same folder structure that Step-4 deploys.
	•	The build environment is identical.

Otherwise, local tests pass but production deploy always fails.

⸻

3. Ensure Step-4 deploys the correct build artifacts

After fixing Step-1 and Step-2:
	•	Step-4 must upload a complete build directory.
	•	PM2 should not start an app if .next is missing.

⸻

4. Optional but recommended improvements (Softgen may choose the best option):
	•	Add a pre-deployment consistency check:
→ Validate that all import-alias folders exist before building.
	•	Add a build-blocking error if rsync excludes required folders.
	•	Add logs showing exactly which files were downloaded in Step-1.

⸻

Final Objective

Please:
	1.	Review all four Step scripts.
	2.	Detect where the incomplete export occurs.
	3.	Correct the pipeline so that:
	•	The frontend build receives the full source tree.
	•	next build succeeds.
	•	The .next directory is generated and deployed.
	4.	Keep all existing server configurations unchanged
(MeshCentral, NGINX, RustDesk, UFW, CrowdSec — all functioning correctly).

⸻

Important constraints
	•	Do NOT modify or remove any of the server installations already in place.
MeshCentral, RustDesk hbbs/hbbr, NGINX reverse proxy, UFW, CrowdSec — all must remain untouched.
	•	You may modify the build pipeline and deployment scripts only.

⸻

Deliverables expected from Softgen

You decide the exact method.
At minimum:

✔ A corrected Step-1/Step-2/Step-4 flow
✔ Confirmation that all required folders are now included
✔ A deploy that builds correctly and starts on port 3000
✔ No more 502 errors
✔ PM2 successfully running the production server

⸻

If anything is unclear, please ask, but do not change the server environment — only adjust the build/export pipeline.
