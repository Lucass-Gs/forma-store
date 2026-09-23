"use client";
import { useState, useEffect, useRef } from "react";
import {
  api,
  useSession,
  Login,
  Shell,
  Loading,
  Notice,
  Empty,
  money,
  type User,
} from "./shared";
type Product = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  category: string;
  art: string;
};
type Cart = Record<string, number>;
export default function App({
  initialProducts,
}: {
  initialProducts: Product[];
}) {
  const s = useSession();
  if (s.loading) return <Loading />;
  if (!s.user)
    return (
      <Login
        title="Forma Store"
        subtitle="Objetos essenciais. Uma experiência de compra clara, do catálogo à confirmação."
        onLogin={s.setUser}
      />
    );
  return (
    <Store
      user={s.user}
      logout={() => s.setUser(null)}
      initialProducts={initialProducts}
    />
  );
}
function Store({
  user,
  logout,
  initialProducts,
}: {
  user: User;
  logout: () => void;
  initialProducts: Product[];
}) {
  const [products, setProducts] = useState(initialProducts),
    [cart, setCart] = useState<Cart>({}),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(initialProducts.length),
    [orders, setOrders] = useState<any[]>([]),
    [tab, setTab] = useState("catalog"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [ops, setOps] = useState<any>(null);
  const checkoutKey = useRef("");
  const catalog = useRef(new Map(initialProducts.map((p) => [p.id, p])));
  const ready = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("forma-cart-" + user.id) || "{}",
      );
      if (saved && typeof saved === "object" && !Array.isArray(saved))
        setCart(
          Object.fromEntries(
            Object.entries(saved).filter(
              ([, v]) =>
                Number.isInteger(v) && Number(v) > 0 && Number(v) <= 20,
            ),
          ) as Cart,
        );
    } catch {}
    ready.current = true;
  }, [user.id]);
  useEffect(() => {
    if (ready.current)
      localStorage.setItem("forma-cart-" + user.id, JSON.stringify(cart));
  }, [cart, user.id]);
  async function load() {
    const result = await api(
      "/products?q=" +
        encodeURIComponent(query) +
        "&category=" +
        encodeURIComponent(category) +
        "&page=" +
        page,
    );
    result.items.forEach((p: Product) => catalog.current.set(p.id, p));
    setProducts(result.items);
    setTotal(result.total);
  }
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api(
        "/products?q=" +
          encodeURIComponent(query) +
          "&category=" +
          encodeURIComponent(category) +
          "&page=" +
          page,
      )
        .then((result) => {
          if (active) {
            result.items.forEach((p: Product) => catalog.current.set(p.id, p));
            setProducts(result.items);
            setTotal(result.total);
          }
        })
        .catch((e) => active && setError(e.message));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, category, page]);
  useEffect(() => {
    Promise.all(
      Object.keys(cart)
        .filter((id) => !catalog.current.has(id))
        .map((id) =>
          api<Product>("/products/" + id)
            .then((p) => catalog.current.set(id, p))
            .catch(() => null),
        ),
    ).then(() => setProducts((p) => [...p]));
  }, [Object.keys(cart).join(",")]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function quantity(id: string, n: number) {
    checkoutKey.current = "";
    setCart((c) => {
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = Math.min(n, 20);
      return next;
    });
  }
  async function checkout() {
    if (!checkoutKey.current) checkoutKey.current = crypto.randomUUID();
    const res = await fetch("/api/checkout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": checkoutKey.current,
        "X-CSRF-Token": (await api("/auth/me")).csrf,
      },
      body: JSON.stringify({
        items: Object.entries(cart).map(([productId, quantity]) => ({
          productId,
          quantity,
        })),
      }),
    });
    const order = await res.json();
    if (!res.ok) throw new Error(order.message);
    setSuccess(
      "Pedido confirmado: " + order.id.slice(0, 8) + ". Pagamento simulado.",
    );
    setCart({});
    checkoutKey.current = "";
    await load();
    setOrders(await api("/orders"));
  }
  const cartEntries = Object.entries(cart);
  const estimate = cartEntries.reduce(
    (sum, [id, q]) => sum + (catalog.current.get(id)?.price_cents || 0) * q,
    0,
  );
  return (
    <Shell title="forma.store" user={user} onLogout={logout}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MENOS EXCESSO. MAIS SIGNIFICADO.</span>
          <h1>Objetos para o dia a dia.</h1>
          <p>
            Escolhas simples, feitas para durar. Compra demonstrativa, sem
            cobrança real.
          </p>
        </div>
        <span className="tag">PAGAMENTO SIMULADO</span>
      </div>
      <div className="tabs">
        <button
          className={tab === "catalog" ? "active" : "ghost"}
          onClick={() => setTab("catalog")}
        >
          Coleção
        </button>
        <button
          className={tab === "orders" ? "active" : "ghost"}
          onClick={() =>
            run(async () => {
              setOrders(await api("/orders"));
              setTab("orders");
            })
          }
        >
          Meus pedidos
        </button>
        {user.role === "admin" && (
          <button
            className={tab === "admin" ? "active" : "ghost"}
            onClick={() =>
              run(async () => {
                setOps(await api("/admin/operations"));
                setTab("admin");
              })
            }
          >
            Operação
          </button>
        )}
      </div>
      <Notice error={error} />
      {success && (
        <p role="status" className="success">
          {success}
        </p>
      )}
      {tab === "catalog" && (
        <div className="two-col">
          <section>
            <div className="toolbar">
              <input
                aria-label="Buscar produtos"
                placeholder="Buscar na coleção…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              <select
                aria-label="Categoria"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas as categorias</option>
                <option>Casa</option>
                <option>Papelaria</option>
              </select>
            </div>
            <div className="grid">
              {products.map((p) => (
                <article className="card" key={p.id}>
                  <div className="product-art" aria-hidden="true">
                    {p.art}
                  </div>
                  <span className="tag">{p.category}</span>
                  <h3 style={{ marginTop: 12 }}>{p.name}</h3>
                  <p>{p.description}</p>
                  <div className="price">{money(p.price_cents)}</div>
                  <p className="fine">{p.stock} disponíveis</p>
                  <button
                    disabled={busy || p.stock === 0}
                    onClick={() => quantity(p.id, (cart[p.id] || 0) + 1)}
                  >
                    Adicionar ao carrinho
                  </button>
                </article>
              ))}
            </div>
            {!products.length && <Empty>Nenhum produto encontrado.</Empty>}
            <div className="toolbar" style={{ marginTop: 20 }}>
              <button
                className="ghost"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span className="fine">Página {page}</span>
              <button
                className="ghost"
                disabled={page * 12 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </section>
          <aside className="panel">
            <h2>Seu carrinho</h2>
            <p>O preço e o estoque são confirmados no servidor ao finalizar.</p>
            {!cartEntries.length ? (
              <Empty>Escolha algo na coleção.</Empty>
            ) : (
              cartEntries.map(([id, q]) => (
                <div className="line-item" key={id}>
                  <div>
                    {catalog.current.get(id)?.name || "Carregando produto…"}
                    <small>
                      {money(catalog.current.get(id)?.price_cents || 0)}
                    </small>
                  </div>
                  <input
                    aria-label={
                      "Quantidade " + (catalog.current.get(id)?.name || id)
                    }
                    type="number"
                    min={0}
                    max={20}
                    value={q}
                    disabled={busy}
                    onChange={(e) => quantity(id, Number(e.target.value))}
                  />
                  <button
                    className="ghost"
                    aria-label="Remover produto"
                    disabled={busy}
                    onClick={() => quantity(id, 0)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
            <div className="line-item">
              <span>Total estimado</span>
              <strong>{money(estimate)}</strong>
            </div>
            <button
              className="checkout"
              disabled={busy || !cartEntries.length}
              onClick={() => run(checkout)}
            >
              {busy ? "Processando…" : "Finalizar compra simulada →"}
            </button>
            <p className="fine" style={{ marginTop: 15 }}>
              Sem cartão, PIX ou cobrança. Uma falha de rede pode ser repetida
              com a mesma chave de checkout.
            </p>
          </aside>
        </div>
      )}
      {tab === "orders" && (
        <section className="panel">
          <h2>Histórico de pedidos</h2>
          {!orders.length && <Empty>Nenhum pedido ainda.</Empty>}
          {orders.map((o) => (
            <article className="order" key={o.id}>
              <div className="split-label">
                <strong>Pedido {o.id.slice(0, 8)}</strong>
                <span className="tag">
                  {o.status === "confirmed" ? "Confirmado" : "Cancelado"}
                </span>
              </div>
              <p>
                {new Date(o.created_at).toLocaleString("pt-BR")} ·{" "}
                {money(o.total_cents)}
              </p>
              {o.items.map((i: any) => (
                <p key={i.product_id}>
                  {i.quantity} × {i.name} · {money(i.price_cents)}
                </p>
              ))}
              {o.status === "confirmed" && (
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/orders/" + o.id + "/cancel", "POST");
                      setOrders(await api("/orders"));
                      await load();
                    })
                  }
                >
                  Cancelar e devolver estoque
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === "admin" && (
        <div className="two-col">
          <section className="panel">
            <h2>Catálogo administrativo</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  await api("/admin/products", "POST", {
                    name: f.get("name"),
                    description: f.get("description"),
                    price_cents: Math.round(Number(f.get("price")) * 100),
                    stock: Number(f.get("stock")),
                    category: "Casa",
                  });
                  setSuccess("Produto criado.");
                  await load();
                });
              }}
            >
              <label>
                Nome
                <input name="name" required minLength={2} />
              </label>
              <label>
                Descrição
                <textarea name="description" />
              </label>
              <div className="form-row">
                <label>
                  Preço em reais
                  <input
                    name="price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Estoque
                  <input name="stock" type="number" min="0" required />
                </label>
              </div>
              <button disabled={busy}>Cadastrar produto</button>
            </form>
          </section>
          <section className="panel">
            <h2>Eventos e notificações</h2>
            <button
              className="ghost"
              onClick={() =>
                run(async () => setOps(await api("/admin/operations")))
              }
            >
              Atualizar operação
            </button>
            <p className="fine" style={{ marginTop: 18 }}>
              Confirmações consumidas pelo worker:{" "}
              {ops?.notifications.length || 0}
            </p>
            {ops?.outbox.map((e: any) => (
              <div className="line-item" key={e.id}>
                <span>
                  {e.event_type}
                  <small>{e.id.slice(0, 8)}</small>
                </span>
                <span className="tag">
                  {e.published_at ? "Publicado" : "Pendente"}
                </span>
              </div>
            ))}
          </section>
        </div>
      )}
    </Shell>
  );
}
