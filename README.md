# PharmaPOS — Pharmacy POS & Management System

A full-featured pharmacy point-of-sale and inventory management system built with **React 18 + TypeScript + Vite + Zustand + TailwindCSS**.

---

## Quick Start (Local Development)

### Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Node.js | 18.x or higher |
| npm | 9.x or higher (comes with Node) |

> Download Node.js from [nodejs.org](https://nodejs.org/) if not installed.

### 1 — Install dependencies

Open a terminal in the `app/` folder and run:

```bash
npm install
```

### 2 — Start the development server

```bash
npm run dev
```

The app will start at **http://localhost:5173**

> Hot Module Replacement (HMR) is enabled — changes to source files reflect instantly without a full reload.

### 3 — Open in browser

Navigate to: **http://localhost:5173**

You will be redirected to the Login page automatically.

---

## Demo Account Credentials

All passwords are `password` (any string is accepted — see note below).

| Role | Email | Password | Access Level |
|------|-------|----------|-------------|
| **Owner** | `owner@pharmapos.pk` | `password` | Full access — all modules, settings, reports, users |
| **Manager** | `manager@pharmapos.pk` | `password` | POS, Inventory, Reports (no Settings / Users) |
| **Cashier** | `cashier@pharmapos.pk` | `password` | POS and Sales history only |

> **Note:** The login currently accepts _any_ password as long as the email matches one of the above. This is mock authentication — no backend required. In production, replace the `login()` function in `src/store/index.ts` with a real API call.

### One-click login buttons

On the Login page there are three **Quick Login** buttons (Owner / Manager / Cashier) that auto-fill the credentials — just click the button then click **Sign In**.

---

## Other Useful Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server with HMR |
| `npm run build` | TypeScript compile + production Vite build (outputs to `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint on all source files |

---

## Environment Variables (optional)

Create a `.env` file in the `app/` folder to override defaults:

```env
# Set to false to switch from mock data to a real backend API
VITE_USE_MOCK=true

# Backend API base URL (only used when VITE_USE_MOCK=false)
VITE_API_URL=http://localhost:8000/api
```

Default behaviour (no `.env` file needed) is to run fully on mock data with no backend.

---

## Project Structure

```
src/
├── components/        # Layout, Header, Sidebar + shadcn/ui components
├── data/              # mockData.ts — seed data (medicines, batches, sales, etc.)
├── hooks/             # use-mobile.ts
├── lib/               # utils.ts, api.ts (API abstraction layer)
├── pages/             # Dashboard, POS, Inventory, Reports, Alerts, ...
├── store/             # index.ts — all Zustand stores
└── types/             # index.ts — all TypeScript interfaces
```

---

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
