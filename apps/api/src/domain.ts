import {
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  Req,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { z } from "zod";
import { createHash } from "node:crypto";
import { Db } from "./db";
import { AuthRequest } from "./auth";
export const checkoutInput = z.object({
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
});
export function normalizeItems(input: unknown) {
  const data = checkoutInput.parse(input);
  const map = new Map<string, number>();
  for (const i of data.items)
    map.set(i.productId, (map.get(i.productId) || 0) + i.quantity);
  const items = [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => ({ productId, quantity }));
  if (items.some((i) => i.quantity > 20))
    throw new BadRequestException("Máximo de 20 unidades por produto.");
  return items;
}
@Controller("api")
class StoreController {
  constructor(private readonly db: Db) {}
  @Get("products") async products(@Query() query: unknown) {
    const q = z
      .object({
        q: z.string().max(100).default(""),
        category: z.string().max(50).default(""),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(query);
    const params = ["%" + q.q + "%", q.category];
    return {
      items: (
        await this.db.query(
          "SELECT * FROM products WHERE name ILIKE $1 AND ($2='' OR category=$2) ORDER BY name LIMIT 12 OFFSET $3",
          [...params, (q.page - 1) * 12],
        )
      ).rows,
      total: Number(
        (
          await this.db.query(
            "SELECT count(*) FROM products WHERE name ILIKE $1 AND ($2='' OR category=$2)",
            params,
          )
        ).rows[0].count,
      ),
      page: q.page,
    };
  }
  @Get("products/:id") async product(@Param("id") id: string) {
    const p = (
      await this.db.query("SELECT * FROM products WHERE id=$1", [
        z.uuid().parse(id),
      ])
    ).rows[0];
    if (!p) throw new NotFoundException();
    return p;
  }
  @Post("checkout") async checkout(
    @Req() r: AuthRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") key: unknown,
  ) {
    const idem = z.string().min(8).max(100).parse(key),
      items = normalizeItems(body),
      hash = createHash("sha256").update(JSON.stringify(items)).digest("hex");
    return this.db.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        r.user.id + ":" + idem,
      ]);
      const existing = (
        await c.query(
          "SELECT * FROM orders WHERE user_id=$1 AND idempotency_key=$2",
          [r.user.id, idem],
        )
      ).rows[0];
      if (existing) {
        if (existing.payload_hash !== hash)
          throw new ConflictException(
            "Chave reutilizada com um carrinho diferente.",
          );
        return existing;
      }
      let total = 0;
      const snapshots = [];
      for (const item of items) {
        const p = (
          await c.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [
            item.productId,
          ])
        ).rows[0];
        if (!p) throw new NotFoundException("Produto não encontrado.");
        if (p.stock < item.quantity)
          throw new ConflictException("Estoque insuficiente para " + p.name);
        total += p.price_cents * item.quantity;
        if (total > 100000000)
          throw new BadRequestException(
            "Valor acima do limite da demonstração.",
          );
        snapshots.push({ ...item, ...p });
        await c.query("UPDATE products SET stock=stock-$1 WHERE id=$2", [
          item.quantity,
          p.id,
        ]);
      }
      const order = (
        await c.query(
          "INSERT INTO orders(user_id,idempotency_key,payload_hash,total_cents) VALUES($1,$2,$3,$4) RETURNING *",
          [r.user.id, idem, hash, total],
        )
      ).rows[0];
      for (const p of snapshots)
        await c.query("INSERT INTO order_items VALUES($1,$2,$3,$4,$5)", [
          order.id,
          p.id,
          p.name,
          p.quantity,
          p.price_cents,
        ]);
      await c.query(
        "INSERT INTO outbox(event_type,payload) VALUES('order.confirmed',$1)",
        [
          JSON.stringify({
            orderId: order.id,
            userId: r.user.id,
            totalCents: total,
          }),
        ],
      );
      return order;
    });
  }
  @Get("orders") async orders(@Req() r: AuthRequest) {
    return (
      await this.db.query(
        "SELECT o.*,COALESCE((SELECT json_agg(i) FROM order_items i WHERE i.order_id=o.id),'[]') AS items FROM orders o WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
        [r.user.id],
      )
    ).rows;
  }
  @Post("orders/:id/cancel") async cancel(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.db.tx(async (c) => {
      const o = (
        await c.query(
          "SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [z.uuid().parse(id), r.user.id],
        )
      ).rows[0];
      if (!o) throw new NotFoundException();
      if (o.status === "cancelled") return o;
      const items = (
        await c.query(
          "SELECT * FROM order_items WHERE order_id=$1 ORDER BY product_id",
          [id],
        )
      ).rows;
      for (const i of items)
        await c.query("UPDATE products SET stock=stock+$1 WHERE id=$2", [
          i.quantity,
          i.product_id,
        ]);
      return (
        await c.query(
          "UPDATE orders SET status='cancelled' WHERE id=$1 RETURNING *",
          [id],
        )
      ).rows[0];
    });
  }
  @Post("admin/products") async create(
    @Req() r: AuthRequest,
    @Body() body: unknown,
  ) {
    if (r.user.role !== "admin") throw new ForbiddenException();
    const p = z
      .object({
        name: z.string().trim().min(2).max(100),
        description: z.string().max(1000).default(""),
        price_cents: z.number().int().min(1).max(10000000),
        stock: z.number().int().min(0).max(10000),
        category: z.string().max(50).default("Objetos"),
      })
      .parse(body);
    return (
      await this.db.query(
        "INSERT INTO products(name,description,price_cents,stock,category) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [p.name, p.description, p.price_cents, p.stock, p.category],
      )
    ).rows[0];
  }
  @Patch("admin/products/:id") async change(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    if (r.user.role !== "admin") throw new ForbiddenException();
    const p = z
      .object({
        price_cents: z.number().int().min(1).max(10000000),
        stock: z.number().int().min(0).max(10000),
      })
      .parse(body);
    const result = await this.db.query(
      "UPDATE products SET price_cents=$1,stock=$2 WHERE id=$3 RETURNING *",
      [p.price_cents, p.stock, z.uuid().parse(id)],
    );
    if (!result.rowCount) throw new NotFoundException();
    return result.rows[0];
  }
  @Get("admin/operations") async operations(@Req() r: AuthRequest) {
    if (r.user.role !== "admin") throw new ForbiddenException();
    return {
      outbox: (
        await this.db.query(
          "SELECT id,event_type,created_at,published_at FROM outbox ORDER BY created_at DESC LIMIT 20",
        )
      ).rows,
      notifications: (
        await this.db.query(
          "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20",
        )
      ).rows,
    };
  }
}
@Module({ controllers: [StoreController], providers: [Db] })
export class DomainModule {}
