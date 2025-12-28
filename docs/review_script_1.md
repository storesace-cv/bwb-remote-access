bash-3.2$ ./scripts/Step-4-deploy-tested-build.sh 
[Step-4] Deploy de build testado para root@46.101.78.179:/opt/rustdesk-frontend
[Step-4] Itens a enviar via rsync:
  - package.json
  - package-lock.json
  - next.config.ts
  - tsconfig.json
  - .next/
  - public/
  - src/
  - scripts/
  - start.sh
  - ecosystem.config.js
  - .env.local
[Step-4] Verificar se o directório remoto existe...
[Step-4] Enviar ficheiros via rsync...
sending incremental file list
deleting node_modules/yargs/node_modules/p-locate/readme.md
deleting node_modules/yargs/node_modules/p-locate/package.json
deleting node_modules/yargs/node_modules/p-locate/license
deleting node_modules/yargs/node_modules/p-locate/index.js
deleting node_modules/yargs/node_modules/p-locate/index.d.ts
deleting node_modules/yargs/node_modules/p-locate/
......

./
BUILD_ID
Step-4-deploy-tested-build.sh
apply-deploy-fixes.sh
build-manifest.json
fallback-build-manifest.json
trace
trace-build
build/
build/chunks/
diagnostics/
server/
server/app/
server/app/_global-error.html
server/app/_global-error.rsc
server/app/_not-found.html
server/app/_not-found.rsc
server/app/dashboard.html
server/app/dashboard.rsc
server/app/index.html
server/app/index.rsc
server/app/_global-error.segments/
server/app/_global-error.segments/__PAGE__.segment.rsc
server/app/_global-error.segments/_full.segment.rsc
server/app/_global-error.segments/_head.segment.rsc
server/app/_global-error.segments/_index.segment.rsc
server/app/_global-error.segments/_tree.segment.rsc
server/app/_global-error/
server/app/_global-error/page/
server/app/_not-found.segments/
server/app/_not-found.segments/_full.segment.rsc
server/app/_not-found.segments/_head.segment.rsc
server/app/_not-found.segments/_index.segment.rsc
server/app/_not-found.segments/_not-found.segment.rsc
server/app/_not-found.segments/_tree.segment.rsc
server/app/_not-found.segments/_not-found/
server/app/_not-found.segments/_not-found/__PAGE__.segment.rsc
server/app/_not-found/
server/app/_not-found/page/
server/app/api/
server/app/api/login/
server/app/api/login/route/
server/app/auth/
.....

static/chunks/
static/media/
types/

sent 35,007 bytes  received 732,027 bytes  306,813.60 bytes/sec
total size is 34,560,946  speedup is 45.06
[Step-4] ✓ Ficheiros enviados com sucesso
[Step-4] Verificar e instalar dependências no droplet...
[Step-4] IMPORTANTE: npm install vai correr como user rustdeskweb (não root)
npm error code EACCES
npm error syscall mkdir
npm error path /opt/rustdesk-frontend/node_modules
npm error errno -13
npm error Error: EACCES: permission denied, mkdir '/opt/rustdesk-frontend/node_modules'
npm error     at async mkdir (node:internal/fs/promises:858:10)
npm error     at async /usr/lib/node_modules/npm/node_modules/@npmcli/arborist/lib/arborist/reify.js:624:20
npm error     at async Promise.allSettled (index 0)
npm error     at async [reifyPackages] (/usr/lib/node_modules/npm/node_modules/@npmcli/arborist/lib/arborist/reify.js:325:11)
npm error     at async Arborist.reify (/usr/lib/node_modules/npm/node_modules/@npmcli/arborist/lib/arborist/reify.js:142:5)
npm error     at async Install.exec (/usr/lib/node_modules/npm/lib/commands/install.js:150:5)
npm error     at async Npm.exec (/usr/lib/node_modules/npm/lib/npm.js:207:9)
npm error     at async module.exports (/usr/lib/node_modules/npm/lib/cli/entry.js:74:5) {
npm error   errno: -13,
npm error   code: 'EACCES',
npm error   syscall: 'mkdir',
npm error   path: '/opt/rustdesk-frontend/node_modules'
npm error }
npm error
npm error The operation was rejected by your operating system.
npm error It is likely you do not have the permissions to access this file as the current user
npm error
npm error If you believe this might be a permissions issue, please double-check the
npm error permissions of the file and its containing directories, or try running
npm error the command again as root/Administrator.
npm notice
npm notice New major version of npm available! 10.8.2 -> 11.7.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.7.0
npm notice To update run: npm install -g npm@11.7.0
npm notice
npm error Log files were not written due to an error writing to the directory: /opt/rustdesk-frontend/.npm/_logs
npm error You can rerun the command with `--loglevel=verbose` to see the logs in your terminal
