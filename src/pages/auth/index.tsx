import { ArrowLeft, LogIn } from "lucide-react";
import { useState } from "react";
import { App, Button, Input } from "antd";
import { useNavigate } from "react-router-dom";

import { ensureApiToken, login } from "@/services/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";
import { useConfigStore } from "@/stores/use-config-store";

export default function AuthPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const setChannelApiKey = useConfigStore((state) => state.setChannelApiKey);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim()) {
      message.warning("请输入用户名");
      return;
    }
    if (!password) {
      message.warning("请输入密码");
      return;
    }
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      setSession(result.token, result.user);
      try {
        const skToken = await ensureApiToken(result.token);
        setChannelApiKey("gateway", skToken);
      } catch (error) {
        message.warning(
          `已登录，但获取网关令牌失败：${error instanceof Error ? error.message : "未知错误"}`,
        );
      }
      message.success("登录成功");
      navigate("/", { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex h-full items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回首页
        </button>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">
            欢迎使用 ArtboardFlow
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            请使用团队账号登录。账号由管理员统一开通。
          </p>

          <div className="mt-6 space-y-4">
            <Input
              size="large"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名"
              autoComplete="username"
              onPressEnter={handleSubmit}
            />
            <Input.Password
              size="large"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              autoComplete="current-password"
              onPressEnter={handleSubmit}
            />
          </div>

          <Button
            type="primary"
            size="large"
            block
            className="mt-6"
            loading={loading}
            onClick={handleSubmit}
            icon={<LogIn className="size-4" />}
          >
            登 录
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          登录后即可使用画布与生视频功能，用量由团队网关统一记录。
        </p>
      </div>
    </main>
  );
}
