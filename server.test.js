const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TEST_DB = path.join(__dirname, 'data', 'test-products.json');
process.env.DB_PATH = TEST_DB;

const { createApp } = require('./server');

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function request(server, method, urlPath, body, headers = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          ...headers,
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          const parsed = raw ? JSON.parse(raw) : null;
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

after(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

test('GET /health responde 200 y status ok', async () => {
  const app = createApp();
  const server = await startServer(app);
  const res = await request(server, 'GET', '/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  server.close();
});

test('GET /version responde con version y color', async () => {
  const app = createApp();
  const server = await startServer(app);
  const res = await request(server, 'GET', '/version');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.version);
  assert.ok(res.body.color);
  server.close();
});

test('GET /api/admin/check consume API_KEY y protege la ruta', async () => {
  const previousApiKey = process.env.API_KEY;
  process.env.API_KEY = 'clave-de-prueba';
  const app = createApp();
  const server = await startServer(app);

  const unauthorized = await request(server, 'GET', '/api/admin/check');
  assert.strictEqual(unauthorized.status, 401);

  const authorized = await request(server, 'GET', '/api/admin/check', null, {
    'x-api-key': 'clave-de-prueba',
  });
  assert.strictEqual(authorized.status, 200);
  assert.strictEqual(authorized.body.status, 'autorizado');

  server.close();
  if (previousApiKey === undefined) delete process.env.API_KEY;
  else process.env.API_KEY = previousApiKey;
});

test('POST /api/products crea un producto y GET /api/products lo lista', async () => {
  const app = createApp();
  const server = await startServer(app);

  const created = await request(server, 'POST', '/api/products', {
    name: 'Producto de prueba',
    sku: 'TST-999',
    stock: 5,
    price: 9.99,
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.name, 'Producto de prueba');

  const list = await request(server, 'GET', '/api/products');
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.some((p) => p.sku === 'TST-999'));

  server.close();
});

test('DELETE /api/products/:id elimina el producto', async () => {
  const app = createApp();
  const server = await startServer(app);

  const created = await request(server, 'POST', '/api/products', {
    name: 'Para borrar',
    sku: 'DEL-001',
    stock: 1,
    price: 1,
  });

  const del = await request(server, 'DELETE', '/api/products/' + created.body.id);
  assert.strictEqual(del.status, 204);

  const get = await request(server, 'GET', '/api/products/' + created.body.id);
  assert.strictEqual(get.status, 404);

  server.close();
});

test('PATCH /api/products/:id actualiza un producto existente', async () => {
  const app = createApp();
  const server = await startServer(app);

  const created = await request(server, 'POST', '/api/products', {
    name: 'Producto original',
    sku: 'UPD-001',
    stock: 2,
    price: 5,
  });

  const updated = await request(server, 'PATCH', '/api/products/' + created.body.id, {
    name: 'Producto actualizado',
    stock: 8,
  });

  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.body.name, 'Producto actualizado');
  assert.strictEqual(updated.body.stock, 8);
  assert.strictEqual(updated.body.sku, 'UPD-001');

  server.close();
});

test('GET y PATCH responden 404 para un producto inexistente', async () => {
  const app = createApp();
  const server = await startServer(app);

  const get = await request(server, 'GET', '/api/products/id-inexistente');
  assert.strictEqual(get.status, 404);
  assert.strictEqual(get.body.error, 'producto no encontrado');

  const patch = await request(server, 'PATCH', '/api/products/id-inexistente', {
    stock: 10,
  });
  assert.strictEqual(patch.status, 404);
  assert.strictEqual(patch.body.error, 'producto no encontrado');

  server.close();
});

test('POST /api/products sin name/sku responde 400', async () => {
  const app = createApp();
  const server = await startServer(app);
  const res = await request(server, 'POST', '/api/products', { stock: 1 });
  assert.strictEqual(res.status, 400);
  server.close();
});

test('POST /api/products rechaza stock y price invalidos', async () => {
  const app = createApp();
  const server = await startServer(app);

  const negativeStock = await request(server, 'POST', '/api/products', {
    name: 'Stock invalido',
    sku: 'INV-001',
    stock: -1,
    price: 10,
  });
  assert.strictEqual(negativeStock.status, 400);

  const invalidPrice = await request(server, 'POST', '/api/products', {
    name: 'Precio invalido',
    sku: 'INV-002',
    stock: 1,
    price: 'no-es-un-numero',
  });
  assert.strictEqual(invalidPrice.status, 400);

  server.close();
});
