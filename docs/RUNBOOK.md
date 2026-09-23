# Operação local

## Inspeção

```sh
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 web
```

GET /api/health verifica a conexão da API com seu banco. Um endpoint saudável não garante que todos os workers estejam processando eventos. Examine os logs do worker/consumidor e o estado do domínio. Nunca publique cookies, tokens ou dados pessoais coletados em diagnóstico.

## Parar e retomar

```sh
docker compose stop
docker compose up -d --wait
```

Volumes preservam dados. docker compose down remove containers/rede; down -v também apaga os dados de demonstração, portanto só use para um reset intencional. Execute o seed novamente após reset.

## Erro no primeiro boot

Verifique Docker em execução, porta 4102 livre, download das imagens e serviço de migration. Bancos usam credenciais definidas no primeiro boot do volume. Não edite uma migration já aplicada: adicione outra.

## API

Login: POST /api/auth/login com email/password; a resposta fornece csrf e Set-Cookie. GET /api/auth/me recupera usuário e token. Envie cookie e X-CSRF-Token em POST/PATCH/DELETE autenticados. Use Origin correspondente ao endereço aberto no navegador. Há validação de payload e respostas 401/403/404/409 conforme o caso. Os testes em tests/integration são exemplos executáveis de chamadas.

## Recuperação

Pare o worker com docker compose stop worker, faça um pedido e retome com docker compose start worker. O outbox persiste no PostgreSQL. ElasticMQ é um emulador local; sua fila não é armazenamento durável de produção. A DLQ configurada chama-se orders-dlq.
