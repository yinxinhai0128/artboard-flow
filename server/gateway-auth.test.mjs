// gateway-auth 单元测试：不依赖真实网关，mock 全局 fetch。
// 覆盖：令牌有效/无效、角色判定边界、网关宕机 fail-closed、缓存行为、缺令牌 401。
import { afterEach, describe, expect, it } from "bun:test";
import {
  GatewayUnavailableError,
  requireAdmin,
  requireAuth,
  resetAuthCacheForTests,
  resolveGatewayUser,
} from "./gateway-auth.mjs";

function mockReply() {
  const calls = { code: null, body: null };
  const reply = {
    code(c) {
      calls.code = c;
      return reply;
    },
    send(b) {
      calls.body = b;
      return reply;
    },
  };
  return { reply, calls };
}

function mockRequest(authorization) {
  return { headers: authorization ? { authorization } : {} };
}

const USER_TOKEN = "gateway-token-user";
const ADMIN_TOKEN = "gateway-token-admin";

/** 模拟网关 /api/user/self：按令牌映射用户，其他一律 401 形状。 */
function installGatewayStub() {
  globalThis.fetch = async (_url, options = {}) => {
    const auth = options.headers?.Authorization || "";
    if (auth === `Bearer ${USER_TOKEN}`) {
      return {
        json: async () => ({
          success: true,
          data: { id: 2, username: "probe_check_1", display_name: "", role: 1 },
        }),
      };
    }
    if (auth === `Bearer ${ADMIN_TOKEN}`) {
      return {
        json: async () => ({
          success: true,
          data: { id: 1, username: "Yinxh", display_name: "Root User", role: 100 },
        }),
      };
    }
    return { json: async () => ({ success: false, message: "无权进行此操作，未登录且未提供 access token" }) };
  };
}

afterEach(() => {
  resetAuthCacheForTests();
  delete globalThis.fetch;
});

describe("resolveGatewayUser (token introspection)", () => {
  it("resolves a valid gateway token into a normalized user", async () => {
    installGatewayStub();
    expect(await resolveGatewayUser(USER_TOKEN)).toEqual({
      id: "2",
      username: "probe_check_1",
      displayName: "probe_check_1",
      role: 1,
    });
  });

  it("returns null for an invalid token without throwing", async () => {
    installGatewayStub();
    expect(await resolveGatewayUser("bogus")).toBeNull();
    expect(await resolveGatewayUser(null)).toBeNull();
    expect(await resolveGatewayUser("")).toBeNull();
  });

  it("treats unparseable gateway roles as lowest privilege (0)", async () => {
    installGatewayStub();
    globalThis.fetch = async () => ({
      json: async () => ({
        success: true,
        data: { id: 9, username: "weird", display_name: "", role: "not-a-number" },
      }),
    });
    const user = await resolveGatewayUser("any");
    expect(user.role).toBe(0);
  });

  it("throws GatewayUnavailableError when the gateway is down (fail-closed)", async () => {
    globalThis.fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(resolveGatewayUser(USER_TOKEN)).rejects.toBeInstanceOf(
      GatewayUnavailableError,
    );
  });

  it("caches successful introspection per token fingerprint", async () => {
    installGatewayStub();
    let calls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      calls += 1;
      return realFetch(...args);
    };
    await resolveGatewayUser(ADMIN_TOKEN);
    await resolveGatewayUser(ADMIN_TOKEN);
    await resolveGatewayUser(ADMIN_TOKEN);
    expect(calls).toBe(1); // 命中缓存
    // 不同令牌指纹互不串用
    expect((await resolveGatewayUser(USER_TOKEN)).role).toBe(1);
  });
});

describe("requireAuth preHandler", () => {
  it("401s when no bearer token is present", async () => {
    installGatewayStub();
    const { reply, calls } = mockReply();
    await requireAuth(mockRequest(), reply);
    expect(calls.code).toBe(401);
    expect(calls.body.error).toContain("未登录");
  });

  it("passes through and attaches the user for a valid token", async () => {
    installGatewayStub();
    const { reply, calls } = mockReply();
    const request = mockRequest(`Bearer ${USER_TOKEN}`);
    await requireAuth(request, reply);
    expect(calls.code).toBeNull();
    expect(request.gatewayUser.username).toBe("probe_check_1");
  });
});

describe("requireAdmin preHandler", () => {
  it("403s a valid but non-admin user", async () => {
    installGatewayStub();
    const { reply, calls } = mockReply();
    await requireAdmin(mockRequest(`Bearer ${USER_TOKEN}`), reply);
    expect(calls.code).toBe(403);
    expect(calls.body.error).toBe("需要管理员权限");
  });

  it("allows role>=10 admins through", async () => {
    installGatewayStub();
    const { reply, calls } = mockReply();
    const request = mockRequest(`Bearer ${ADMIN_TOKEN}`);
    await requireAdmin(request, reply);
    expect(calls.code).toBeNull();
    expect(request.gatewayUser.role).toBe(100);
  });

  it("401s invalid tokens before any role check", async () => {
    installGatewayStub();
    const { reply, calls } = mockReply();
    await requireAdmin(mockRequest("Bearer nope"), reply);
    expect(calls.code).toBe(401);
  });

  it("503s when the gateway is unreachable instead of letting the request through", async () => {
    globalThis.fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const { reply, calls } = mockReply();
    await requireAdmin(mockRequest(`Bearer ${ADMIN_TOKEN}`), reply);
    expect(calls.code).toBe(503);
    expect(calls.body.error).toContain("暂不可用");
  });
});
