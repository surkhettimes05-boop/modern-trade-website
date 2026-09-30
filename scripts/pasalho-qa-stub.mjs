import http from "node:http";

const port = Number(process.env.PORT || "3002");
const customer = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  phone: "+9779812345678",
  fullName: "QA Pasalho Customer",
  email: null,
  status: "ACTIVE",
};

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function envelope(data) {
  return { success: true, data };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function authenticated(request) {
  return request.headers.authorization === "Bearer qa-access-token";
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://pasalho-qa");
    const path = url.pathname;
    const method = request.method || "GET";

    if (path === "/health") {
      return send(response, 200, { ok: true });
    }

    if (path === "/api/v1/commerce/categories" && method === "GET") {
      return send(
        response,
        200,
        envelope([
          {
            id: "66666666-6666-4666-8666-666666666666",
            name: "Instant noodles",
            slug: "instant-noodles",
            imageUrl: null,
          },
        ]),
      );
    }

    if (path === "/api/v1/commerce/auth/request-otp" && method === "POST") {
      await readJson(request);
      return send(
        response,
        201,
        envelope({ challengeId: "55555555-5555-4555-8555-555555555555", expiresInSeconds: 300 }),
      );
    }

    if (path === "/api/v1/commerce/auth/verify-otp" && method === "POST") {
      await readJson(request);
      return send(
        response,
        201,
        envelope({
          accessToken: "qa-access-token",
          refreshToken: "qa-refresh-token",
          expiresIn: 900,
          customer,
        }),
      );
    }

    if (path === "/api/v1/commerce/auth/refresh" && method === "POST") {
      const body = await readJson(request);
      if (body.refreshToken !== "qa-refresh-token") {
        return send(response, 401, {
          success: false,
          error: { message: "Customer authentication required" },
        });
      }
      return send(
        response,
        201,
        envelope({
          accessToken: "qa-access-token",
          refreshToken: "qa-refresh-token",
          expiresIn: 900,
          customer,
        }),
      );
    }

    if (path === "/api/v1/commerce/auth/logout" && method === "POST") {
      if (!authenticated(request)) {
        return send(response, 401, {
          success: false,
          error: { message: "Customer authentication required" },
        });
      }
      return send(response, 201, envelope({ message: "Logged out" }));
    }

    if (path === "/api/v1/commerce/me" && method === "GET") {
      if (!authenticated(request)) {
        return send(response, 401, {
          success: false,
          error: { message: "Customer authentication required" },
        });
      }
      return send(response, 200, envelope(customer));
    }

    return send(response, 404, {
      success: false,
      error: { message: `QA Pasalho stub has no route for ${method} ${path}` },
    });
  } catch (error) {
    return send(response, 500, {
      success: false,
      error: { message: error instanceof Error ? error.message : "QA stub failure" },
    });
  }
});

server.listen(port, "0.0.0.0");
