# 🔧 package.json Manual Fix Required

## ⚠️ Problem
TypeScript is currently in `devDependencies`, causing Next.js to try to install it manually during production startup, which delays the service startup and creates unnecessary warnings.

## ✅ Solution
Move TypeScript and type definitions to `dependencies` (not `devDependencies`)

## 📝 Manual Changes Required

Open `package.json` and make these changes:

### Before (Current - WRONG):
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.86.2",
    "next": "16.0.6",
    "qrcode": "^1.5.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/node": "^22.10.1",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "typescript": "^5.6.3",
    ...
  }
}
```

### After (Target - CORRECT):
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.86.2",
    "@types/node": "^22.10.1",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "next": "16.0.6",
    "qrcode": "^1.5.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.6.3"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.15.0",
    "eslint-config-next": "^16.0.6",
    "globals": "^16.5.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "tsx": "^4.21.0",
    "typescript-eslint": "^8.48.1"
  }
}
```

## 🎯 What Changed?
**Moved from `devDependencies` to `dependencies`:**
- ✅ `typescript` - Required by Next.js to load `next.config.ts`
- ✅ `@types/node` - Required for Node.js type definitions
- ✅ `@types/react` - Required for React type definitions
- ✅ `@types/react-dom` - Required for React DOM type definitions
- ✅ `@types/qrcode` - Already correct, kept in dependencies

**Why?**
- Next.js needs TypeScript **at runtime** to load `next.config.ts`
- When using `npm install --omit=dev` in production, devDependencies are not installed
- This causes Next.js to auto-install TypeScript during startup, creating delays

## 🚀 After Making Changes

1. **Save the file**
2. **Update local dependencies:**
   ```bash
   npm install
   ```
3. **Commit the change:**
   ```bash
   git add package.json
   git commit -m "fix(deploy): Move TypeScript to dependencies for production"
   ```
4. **Rebuild and redeploy:**
   ```bash
   ./scripts/Step-2-build-local.sh
   ./scripts/Step-4-deploy-tested-build.sh
   ```

## ✅ Expected Result
After this fix, you should **NOT** see this warning in production logs:
```
⚠ Installing TypeScript as it was not found while loading "next.config.ts".
Installing devDependencies (npm): - typescript
```

The service should start immediately without TypeScript installation delays.