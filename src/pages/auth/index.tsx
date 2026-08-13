import { ArrowLeft, LogIn, UserPlus } from "lucide-react";
import { useState } from "react";
import { App, Button, Input, Segmented } from "antd";
import { useNavigate } from "react-router-dom";

import { login, register } from "@/services/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";

type Mode = "login" | "register";

export default function AuthPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const setSession = useAuthStore((state) => state.setSession);
    const [mode, setMode] = useState<Mode>("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
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
        if (mode === "register") {
            if (password.length < 6) {
                message.warning("密码至少 6 位");
                return;
            }
            if (password !== confirm) {
                message.warning("两次输入的密码不一致");
                return;
            }
        }
        setLoading(true);
        try {
            const result = mode === "login" ? await login(username.trim(), password) : await register(username.trim(), password);
            setSession(result.token, result.user);
            message.success(mode === "login" ? "登录成功" : "注册成功，已自动登录");
            navigate("/", { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="flex h-full items-center justify-center bg-background px-6">
            <div className="w-full max-w-md">
                <button type="button" onClick={() => navigate("/")} className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
                    <ArrowLeft className="size-4" />
                    返回首页
                </button>

                <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
                    <h1 className="text-2xl font-bold tracking-tight">欢迎使用 ArtboardFlow</h1>
                    <p className="mt-2 text-sm text-muted-foreground">登录以保存你的画布、提示词与生成记录。</p>

                    <Segmented
                        block
                        value={mode}
                        onChange={(value) => setMode(value as Mode)}
                        options={[
                            { label: "登录", value: "login" },
                            { label: "注册", value: "register" },
                        ]}
                        className="mt-6 !w-full"
                    />

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
                            autoComplete={mode === "login" ? "current-password" : "new-password"}
                            onPressEnter={handleSubmit}
                        />
                        {mode === "register" ? (
                            <Input.Password
                                size="large"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                placeholder="确认密码"
                                autoComplete="new-password"
                                onPressEnter={handleSubmit}
                            />
                        ) : null}
                    </div>

                    <Button type="primary" size="large" block className="mt-6" loading={loading} onClick={handleSubmit} icon={mode === "login" ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}>
                        {mode === "login" ? "登 录" : "注 册"}
                    </Button>
                </div>

                <p className="mt-6 text-center text-xs text-muted-foreground">账号数据保存在本地服务，密码经加密存储。</p>
            </div>
        </main>
    );
}
