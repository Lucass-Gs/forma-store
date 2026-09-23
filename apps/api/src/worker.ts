import {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { Db } from "./db";
const db = new Db();
const sqs = new SQSClient({
  region: "us-east-1",
  endpoint: process.env.SQS_ENDPOINT,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function main() {
  const dlq = await sqs.send(
    new CreateQueueCommand({ QueueName: "orders-dlq" }),
  );
  const attrs = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: dlq.QueueUrl,
      AttributeNames: ["QueueArn"],
    }),
  );
  const q = await sqs.send(
    new CreateQueueCommand({
      QueueName: "orders",
      Attributes: {
        VisibilityTimeout: "30",
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: attrs.Attributes?.QueueArn,
          maxReceiveCount: "5",
        }),
      },
    }),
  );
  while (!stopping) {
    try {
      await db.tx(async (c) => {
        const events = (
          await c.query(
            "SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10",
          )
        ).rows;
        for (const e of events) {
          await sqs.send(
            new SendMessageCommand({
              QueueUrl: q.QueueUrl,
              MessageBody: JSON.stringify({
                eventId: e.id,
                eventType: e.event_type,
                payload: e.payload,
              }),
            }),
          );
          await c.query("UPDATE outbox SET published_at=now() WHERE id=$1", [
            e.id,
          ]);
        }
      });
      const batch = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: q.QueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 1,
        }),
      );
      for (const m of batch.Messages || []) {
        const event = JSON.parse(m.Body || "{}");
        await db.tx(async (c) => {
          if (
            !(
              await c.query(
                "INSERT INTO inbox(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id",
                [event.eventId],
              )
            ).rowCount
          )
            return;
          await c.query(
            "INSERT INTO notifications(event_id,order_id,body) VALUES($1,$2,$3)",
            [
              event.eventId,
              event.payload.orderId,
              "Confirmação simulada do pedido " + event.payload.orderId,
            ],
          );
        });
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: q.QueueUrl,
            ReceiptHandle: m.ReceiptHandle,
          }),
        );
        console.log(
          JSON.stringify({ eventId: event.eventId, processed: true }),
        );
      }
    } catch (e) {
      console.error(JSON.stringify({ workerError: (e as Error).message }));
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await db.onModuleDestroy();
  sqs.destroy();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
