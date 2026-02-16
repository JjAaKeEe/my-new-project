# Rainier Dynamics Ops Engine

Monorepo for operations modeling and scenario analysis, with canonical domain logic in `packages/core` and a Next.js demo lab in `apps/lab`.

## Workspace Scripts

Run from repo root:

```bash
npm test
npm run typecheck
npm run dev:lab
npm run build:lab
```

## EMBA 533 Demo

1. Install dependencies once from repo root:

```bash
npm install
```

2. Start the demo app:

```bash
npm run dev:lab
```

3. Open [http://localhost:3000](http://localhost:3000) and on **Upstream Innovation Lab** click **Run scenario** with defaults to generate the first result.
4. Change **Reuse (%)** and **Enable grinder path**, click **Run scenario** again, then compare **Cost delta**, **Margin delta**, **Avoided emissions**, and **Estimated uptake** in the right panel.
5. Scroll to **Audit**, expand **Show-Your-Work worksheet JSON**, and review the methodology paragraph for traceable assumptions.
6. Open [http://localhost:3000/value-chain](http://localhost:3000/value-chain) to review the linear vs circular panel value chain map and CSI code bindings.
