import { ArrowLeft, LogIn, UserPlus } from "lucide-react";
import { useState } from "react";
import { App, Button, Input } from "antd";
import { useNavigate } from "react-router-dom";

import { ensureApiToken, login, register } from "@/services/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";
import { useConfigStore } from "@/stores/use-config-store";

type AuthMode = "login" | "register";

export default function AuthPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const setChannelApiKey = useConfigStore((state) => state.setChannelApiKey);
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setPassword("");
    setConfirmPassword("");
  };

  const completeLogin = async (sessionToken: string) => {
    try {
      const skToken = await ensureApiToken(sessionToken);
      setChannelApiKey("gateway", skToken);
    } catch (error) {
      message.warning(
        `已登录，但获取网关令牌失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
    message.success("登录成功");
    navigate("/", { replace: true });
  };

  const handleSubmit = async () => {
    if (!username.trim()) {
      message.warning("请输入用户名");
      return;
    }
    if (!password) {
      message.warning("请输入密码");
      return;
    }
    if (mode === "register") {
      if (password.length < 8) {
        message.warning("密码至少需要 8 位");
        return;
      }
      if (password !== confirmPassword) {
        message.warning("两次输入的密码不一致");
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password);
        message.success("注册成功，正在自动登录");
      }
      const result = await login(username.trim(), password);
      setSession(result.token, result.user);
      await completeLogin(result.token);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
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
            {mode === "login" ? "欢迎使用 ArtboardFlow" : "注册账号"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login"
              ? "请使用团队账号登录。没有账号可点击下方“注册”。"
              : "注册后即可登录并使用画布与生视频功能。"}
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
              placeholder="密码（至少 8 位）"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onPressEnter={handleSubmit}
            />
            {mode === "register" ? (
              <Input.Password
                size="large"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="确认密码"
                autoComplete="new-password"
                onPressEnter={handleSubmit}
              />
            ) : null}
          </div>

          <Button
            type="primary"
            size="large"
            block
            className="mt-6"
            loading={loading}
            onClick={handleSubmit}
            icon={mode === "login" ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
          >
            {mode === "login" ? "登 录" : "注 册"}
          </Button>

          <button
            type="button"
            className="mt-4 block w-full text-center text-sm text-muted-foreground transition hover:text-foreground"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          登录后即可使用画布与生视频功能，用量由团队网关统一记录。
        </p>
      </div>
    </main>
  );
}
