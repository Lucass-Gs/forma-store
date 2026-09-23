import App from "../src/App";
export const dynamic = "force-dynamic";
export default async function Page() {
  const products = await fetch(
    (process.env.API_UPSTREAM || "http://api:3000") + "/api/products",
    { cache: "no-store", signal: AbortSignal.timeout(3000) },
  )
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return <App initialProducts={products?.items || []} />;
}
